import { createHash } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb, withRetry } from "@/db";
import { aiActionLogs, pendingActions } from "@/db/schema";
import { createProject } from "@/lib/dal/projects";
import { createTask, getTask, updateTask } from "@/lib/dal/tasks";
import { AppError, NotFoundError } from "@/lib/errors";
import { decrypt, encrypt } from "@/lib/privacy/crypto";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates use YYYY-MM-DD");

export const payloadSchemas = {
  create_task: z.object({
    title: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(2000).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    deadline: day.optional(),
    estimatedMinutes: z.number().int().positive().max(100000).optional(),
    projectId: z.string().uuid().optional(),
  }),
  update_task: z.object({
    taskId: z.string().uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    status: z.enum(["todo", "doing", "done"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    deadline: day.optional(),
  }),
  create_project: z.object({ name: z.string().trim().min(1).max(120) }),
} as const;

export type PendingKind = keyof typeof payloadSchemas;
export const PENDING_KINDS = Object.keys(payloadSchemas) as PendingKind[];

export interface PendingAction {
  id: string;
  conversationId: string;
  kind: PendingKind;
  payload: Record<string, unknown>;
  status: string;
  createdAt: Date;
}

const EXPIRY_MS = 7 * 86_400_000;

export function idempotencyKey(conversationId: string, turnId: string, kind: string, payload: unknown): string {
  return createHash("sha256").update(JSON.stringify([conversationId, turnId, kind, payload])).digest("hex");
}

const toDeadline = (d: string) => new Date(`${d}T23:59:00+08:00`);

// Creates a suggestion. The same turn proposing the same thing twice (a retry) returns the existing suggestion.
export async function createPending(ownerId: string, conversationId: string, turnId: string, kind: PendingKind, payload: unknown): Promise<PendingAction> {
  const parsed = payloadSchemas[kind].parse(payload);
  const key = idempotencyKey(conversationId, turnId, kind, parsed);
  const db = getDb();
  const inserted = await withRetry(() =>
    db
      .insert(pendingActions)
      .values({ ownerId, conversationId, kind, encryptedPayload: encrypt(JSON.stringify(parsed)), idempotencyKey: key, expiresAt: new Date(Date.now() + EXPIRY_MS) })
      .onConflictDoNothing()
      .returning(),
  );
  const row = inserted[0] ?? (await withRetry(() => db.select().from(pendingActions).where(and(eq(pendingActions.ownerId, ownerId), eq(pendingActions.idempotencyKey, key))).limit(1)))[0];
  return toAction(row);
}

function toAction(r: typeof pendingActions.$inferSelect): PendingAction {
  return { id: r.id, conversationId: r.conversationId, kind: r.kind as PendingKind, payload: JSON.parse(decrypt(r.encryptedPayload)), status: r.status, createdAt: r.createdAt };
}

export async function listPending(ownerId: string, conversationId?: string): Promise<PendingAction[]> {
  const where = [eq(pendingActions.ownerId, ownerId), eq(pendingActions.status, "pending"), gt(pendingActions.expiresAt, new Date())];
  if (conversationId) where.push(eq(pendingActions.conversationId, conversationId));
  const rows = await withRetry(() => getDb().select().from(pendingActions).where(and(...where)).orderBy(desc(pendingActions.createdAt)));
  return rows.map(toAction);
}

async function log(ownerId: string, action: string, outcome: string, refId?: string) {
  await getDb().insert(aiActionLogs).values({ ownerId, action, outcome, refId: refId ?? null }).catch(() => {});
}

async function execute(ownerId: string, kind: PendingKind, payload: Record<string, unknown>): Promise<string> {
  if (kind === "create_task") {
    const p = payloadSchemas.create_task.parse(payload);
    const [t] = await createTask(ownerId, {
      title: p.title, notes: p.notes, priority: p.priority ?? "medium", estimatedMinutes: p.estimatedMinutes, projectId: p.projectId,
      deadline: p.deadline ? toDeadline(p.deadline) : undefined,
    });
    return t.id;
  }
  if (kind === "update_task") {
    const p = payloadSchemas.update_task.parse(payload);
    const cur = await getTask(ownerId, p.taskId);
    if (!cur) throw new NotFoundError("Task");
    await updateTask(ownerId, p.taskId, {
      title: p.title ?? cur.title,
      notes: p.notes ?? cur.notes ?? undefined,
      priority: (p.priority ?? cur.priority) as "low" | "medium" | "high",
      deadline: p.deadline ? toDeadline(p.deadline) : (cur.deadline ?? undefined),
      estimatedMinutes: cur.estimatedMinutes ?? undefined,
      projectId: cur.projectId ?? undefined,
      status: p.status ?? (cur.status as "todo" | "doing" | "done"),
    });
    return p.taskId;
  }
  const p = payloadSchemas.create_project.parse(payload);
  return (await createProject(ownerId, { name: p.name })).id;
}

// Exactly-once: the status flips pending -> confirming in a single conditional update, so a double tap or a retry
// cannot run the write twice. If the write fails the suggestion goes back to pending.
export async function confirmPending(ownerId: string, id: string, overrides: Record<string, unknown> = {}): Promise<{ ref: string; already: boolean }> {
  const actionId = z.string().uuid().parse(id);
  const db = getDb();
  const claimed = await withRetry(() =>
    db
      .update(pendingActions)
      .set({ status: "confirming" })
      .where(and(eq(pendingActions.id, actionId), eq(pendingActions.ownerId, ownerId), eq(pendingActions.status, "pending"), gt(pendingActions.expiresAt, new Date())))
      .returning(),
  );
  if (!claimed[0]) {
    const rows = await withRetry(() => db.select().from(pendingActions).where(and(eq(pendingActions.id, actionId), eq(pendingActions.ownerId, ownerId))).limit(1));
    if (!rows[0]) throw new NotFoundError("Suggestion");
    if (rows[0].status === "confirmed") return { ref: rows[0].resultRef ?? "", already: true };
    throw new AppError("This suggestion is no longer available");
  }
  const row = claimed[0];
  const kind = row.kind as PendingKind;
  try {
    const base = JSON.parse(decrypt(row.encryptedPayload)) as Record<string, unknown>;
    const merged = payloadSchemas[kind].parse({ ...base, ...overrides });
    const ref = await execute(ownerId, kind, merged);
    await db.update(pendingActions).set({ status: "confirmed", resultRef: ref, resolvedAt: new Date() }).where(eq(pendingActions.id, actionId));
    await log(ownerId, `confirm:${kind}`, "ok", ref);
    return { ref, already: false };
  } catch (error) {
    await db.update(pendingActions).set({ status: "pending" }).where(eq(pendingActions.id, actionId));
    await log(ownerId, `confirm:${kind}`, "failed", actionId);
    throw error instanceof AppError ? error : new AppError("Could not apply this suggestion. Check the values and try again.");
  }
}

export async function dismissPending(ownerId: string, id: string) {
  const actionId = z.string().uuid().parse(id);
  const rows = await withRetry(() =>
    getDb()
      .update(pendingActions)
      .set({ status: "dismissed", resolvedAt: new Date() })
      .where(and(eq(pendingActions.id, actionId), eq(pendingActions.ownerId, ownerId), eq(pendingActions.status, "pending")))
      .returning({ id: pendingActions.id }),
  );
  if (rows[0]) await log(ownerId, "dismiss", "ok", actionId);
}
