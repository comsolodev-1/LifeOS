import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, withRetry } from "@/db";
import { projects, tasks } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";

export const projectInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  status: z.enum(["active", "paused", "done"]).default("active"),
});

export type ProjectInput = z.input<typeof projectInput>;
const projectId = z.string().uuid();

export async function listProjects(ownerId: string) {
  return withRetry(() =>
    getDb()
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        total: sql<number>`count(${tasks.id})::int`,
        done: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'done')::int`,
      })
      .from(projects)
      .leftJoin(tasks, and(eq(tasks.projectId, projects.id), eq(tasks.ownerId, ownerId)))
      .where(eq(projects.ownerId, ownerId))
      .groupBy(projects.id)
      .orderBy(desc(projects.createdAt)),
  );
}

export async function getProject(ownerId: string, id: string) {
  const parsed = projectId.safeParse(id);
  if (!parsed.success) return null;
  const rows = await withRetry(() =>
    getDb().select().from(projects).where(and(eq(projects.id, parsed.data), eq(projects.ownerId, ownerId))).limit(1),
  );
  return rows[0] ?? null;
}

export async function createProject(ownerId: string, input: ProjectInput) {
  const data = projectInput.parse(input);
  const rows = await withRetry(() => getDb().insert(projects).values({ ...data, ownerId }).returning());
  return rows[0];
}

export async function updateProject(ownerId: string, id: string, input: ProjectInput) {
  const data = projectInput.parse(input);
  const rows = await withRetry(() =>
    getDb()
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(projects.id, projectId.parse(id)), eq(projects.ownerId, ownerId)))
      .returning(),
  );
  if (!rows[0]) throw new NotFoundError("Project");
  return rows[0];
}

// Tasks in the project are kept and become unassigned.
export async function deleteProject(ownerId: string, id: string) {
  await withRetry(() =>
    getDb().delete(projects).where(and(eq(projects.id, projectId.parse(id)), eq(projects.ownerId, ownerId))),
  );
}
