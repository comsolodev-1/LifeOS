import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, withRetry } from "@/db";
import { tasks } from "@/db/schema";

export const taskInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().trim().max(2000).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  deadline: z.date().optional(),
  estimatedMinutes: z.number().int().positive().max(100000).optional(),
});

export const taskStatus = z.enum(["todo", "doing", "done"]);
export const taskId = z.string().uuid();

export type TaskInput = z.infer<typeof taskInput>;

// Every function requires ownerId and scopes the query by it. Route handlers and AI tools must not query tasks any other way.
export async function listTasks(ownerId: string, opts: { status?: string; search?: string } = {}) {
  const filters = [eq(tasks.ownerId, ownerId)];
  if (opts.status && taskStatus.safeParse(opts.status).success) filters.push(eq(tasks.status, opts.status));
  if (opts.search) filters.push(ilike(tasks.title, `%${opts.search.replace(/[%_]/g, "")}%`));
  return withRetry(() =>
    getDb()
      .select()
      .from(tasks)
      .where(and(...filters))
      .orderBy(
        sql`case ${tasks.status} when 'done' then 1 else 0 end`,
        sql`${tasks.deadline} asc nulls last`,
        desc(tasks.createdAt),
      ),
  );
}

export async function createTask(ownerId: string, input: TaskInput) {
  const data = taskInput.parse(input);
  return withRetry(() =>
    getDb()
      .insert(tasks)
      .values({ ...data, ownerId, origin: "manual" })
      .returning(),
  );
}

export async function setTaskStatus(ownerId: string, id: string, status: z.infer<typeof taskStatus>) {
  const parsedId = taskId.parse(id);
  const parsedStatus = taskStatus.parse(status);
  return withRetry(() =>
    getDb()
      .update(tasks)
      .set({ status: parsedStatus, updatedAt: new Date() })
      .where(and(eq(tasks.id, parsedId), eq(tasks.ownerId, ownerId)))
      .returning({ id: tasks.id }),
  );
}

export async function deleteTask(ownerId: string, id: string) {
  const parsedId = taskId.parse(id);
  return withRetry(() =>
    getDb()
      .delete(tasks)
      .where(and(eq(tasks.id, parsedId), eq(tasks.ownerId, ownerId)))
      .returning({ id: tasks.id }),
  );
}

export async function countOpenTasks(ownerId: string) {
  const rows = await withRetry(() =>
    getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.ownerId, ownerId), sql`${tasks.status} <> 'done'`)),
  );
  return rows[0]?.n ?? 0;
}

