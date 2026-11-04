import { and, desc, eq, getTableColumns, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, withRetry } from "@/db";
import { projects, taskDependencies, tasks } from "@/db/schema";
import { AppError, NotFoundError } from "@/lib/errors";

export const taskInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().trim().max(2000).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  deadline: z.date().optional(),
  estimatedMinutes: z.number().int().positive().max(100000).optional(),
  projectId: z.string().uuid().optional(),
});

export const taskStatus = z.enum(["todo", "doing", "done"]);
export const taskId = z.string().uuid();
export const taskSort = z.enum(["deadline", "priority", "newest"]);

export type TaskInput = z.infer<typeof taskInput>;
export type TaskUpdate = TaskInput & { status: z.infer<typeof taskStatus> };

export interface TaskFilters {
  status?: string;
  projectId?: string;
  priority?: string;
  search?: string;
  sort?: string;
}

// Every function here requires ownerId and scopes the query by it. Route handlers and AI tools must not query tasks any other way.

async function assertOwnProject(ownerId: string, projectId: string | undefined) {
  if (!projectId) return;
  const rows = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .limit(1);
  if (!rows[0]) throw new NotFoundError("Project");
}

export async function listTasks(ownerId: string, f: TaskFilters = {}) {
  const where = [eq(tasks.ownerId, ownerId)];
  if (f.status && taskStatus.safeParse(f.status).success) where.push(eq(tasks.status, f.status));
  if (f.priority && ["low", "medium", "high"].includes(f.priority)) where.push(eq(tasks.priority, f.priority));
  if (f.projectId === "none") where.push(sql`${tasks.projectId} is null`);
  else if (f.projectId && z.string().uuid().safeParse(f.projectId).success) where.push(eq(tasks.projectId, f.projectId));
  if (f.search) where.push(ilike(tasks.title, `%${f.search.replace(/[\\%_]/g, "\\$&")}%`));

  const sort = taskSort.safeParse(f.sort).data ?? "deadline";
  const done = sql`case ${tasks.status} when 'done' then 1 else 0 end`;
  const order =
    sort === "priority"
      ? [done, sql`case ${tasks.priority} when 'high' then 0 when 'medium' then 1 else 2 end`, sql`${tasks.deadline} asc nulls last`]
      : sort === "newest"
        ? [done, desc(tasks.createdAt)]
        : [done, sql`${tasks.deadline} asc nulls last`, desc(tasks.createdAt)];

  return withRetry(() =>
    getDb()
      .select({ ...getTableColumns(tasks), projectName: projects.name })
      .from(tasks)
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(...where))
      .orderBy(...order),
  );
}

export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

export async function getTask(ownerId: string, id: string) {
  const parsed = taskId.safeParse(id);
  if (!parsed.success) return null;
  const rows = await withRetry(() =>
    getDb().select().from(tasks).where(and(eq(tasks.id, parsed.data), eq(tasks.ownerId, ownerId))).limit(1),
  );
  return rows[0] ?? null;
}

export async function createTask(ownerId: string, input: TaskInput) {
  const data = taskInput.parse(input);
  return withRetry(async () => {
    await assertOwnProject(ownerId, data.projectId);
    return getDb().insert(tasks).values({ ...data, ownerId, origin: "manual" }).returning();
  });
}

export async function updateTask(ownerId: string, id: string, input: TaskUpdate) {
  const parsedId = taskId.parse(id);
  const data = taskInput.parse(input);
  const status = taskStatus.parse(input.status);
  return withRetry(async () => {
    await assertOwnProject(ownerId, data.projectId);
    const rows = await getDb()
      .update(tasks)
      .set({
        title: data.title,
        notes: data.notes ?? null,
        priority: data.priority,
        deadline: data.deadline ?? null,
        estimatedMinutes: data.estimatedMinutes ?? null,
        projectId: data.projectId ?? null,
        status,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, parsedId), eq(tasks.ownerId, ownerId)))
      .returning();
    if (!rows[0]) throw new NotFoundError("Task");
    return rows[0];
  });
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
    getDb().delete(tasks).where(and(eq(tasks.id, parsedId), eq(tasks.ownerId, ownerId))).returning({ id: tasks.id }),
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

// ---- Dependencies ----

export interface Edge {
  taskId: string;
  dependsOnId: string;
}

// Adding "taskId depends on dependsOnId" creates a cycle if dependsOnId already (directly or indirectly) depends on taskId.
export function wouldCreateCycle(edges: Edge[], newTaskId: string, newDependsOnId: string): boolean {
  if (newTaskId === newDependsOnId) return true;
  const deps = new Map<string, string[]>();
  for (const e of edges) deps.set(e.taskId, [...(deps.get(e.taskId) ?? []), e.dependsOnId]);
  const seen = new Set<string>();
  const stack = [newDependsOnId];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (cur === newTaskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(deps.get(cur) ?? []));
  }
  return false;
}

async function ownEdges(ownerId: string): Promise<Edge[]> {
  return getDb()
    .select({ taskId: taskDependencies.taskId, dependsOnId: taskDependencies.dependsOnId })
    .from(taskDependencies)
    .where(eq(taskDependencies.ownerId, ownerId));
}

export async function addDependency(ownerId: string, id: string, dependsOn: string) {
  const a = taskId.parse(id);
  const b = taskId.parse(dependsOn);
  return withRetry(async () => {
    const [first, second] = await Promise.all([getTask(ownerId, a), getTask(ownerId, b)]);
    if (!first || !second) throw new NotFoundError("Task");
    if (wouldCreateCycle(await ownEdges(ownerId), a, b)) {
      throw new AppError("That would create a circular dependency");
    }
    await getDb().insert(taskDependencies).values({ ownerId, taskId: a, dependsOnId: b }).onConflictDoNothing();
  });
}

export async function removeDependency(ownerId: string, id: string, dependsOn: string) {
  const a = taskId.parse(id);
  const b = taskId.parse(dependsOn);
  await withRetry(() =>
    getDb()
      .delete(taskDependencies)
      .where(and(eq(taskDependencies.ownerId, ownerId), eq(taskDependencies.taskId, a), eq(taskDependencies.dependsOnId, b))),
  );
}

export async function listBlockers(ownerId: string, id: string) {
  const a = taskId.parse(id);
  return withRetry(() =>
    getDb()
      .select({ id: tasks.id, title: tasks.title, status: tasks.status })
      .from(taskDependencies)
      .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnId))
      .where(and(eq(taskDependencies.ownerId, ownerId), eq(taskDependencies.taskId, a), eq(tasks.ownerId, ownerId))),
  );
}

// Ids of tasks that still have at least one unfinished blocker.
export async function blockedTaskIds(ownerId: string): Promise<Set<string>> {
  const rows = await withRetry(() =>
    getDb()
      .select({ id: taskDependencies.taskId })
      .from(taskDependencies)
      .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnId))
      .where(and(eq(taskDependencies.ownerId, ownerId), sql`${tasks.status} <> 'done'`)),
  );
  return new Set(rows.map((r) => r.id));
}
