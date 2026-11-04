import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { __setDbForTests } from "../src/db";
import * as schema from "../src/db/schema";
import { AppError, NotFoundError } from "../src/lib/errors";
import {
  addDependency, blockedTaskIds, createTask, deleteTask, getTask, listBlockers, listTasks, removeDependency,
  setTaskStatus, updateTask, wouldCreateCycle,
} from "../src/lib/dal/tasks";
import { createProject, deleteProject, getProject, listProjects, updateProject } from "../src/lib/dal/projects";

let A: string;
let B: string;

beforeAll(async () => {
  const client = new PGlite();
  for (const f of readdirSync("drizzle").filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(path.join("drizzle", f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await client.exec(stmt);
    }
  }
  const db = drizzle(client, { schema });
  __setDbForTests(db);
  const [a, b] = await db.insert(schema.profiles).values([{ email: "a@example.com" }, { email: "b@example.com" }]).returning();
  A = a.id;
  B = b.id;
});

const t = (title: string, extra = {}) => ({ title, priority: "medium" as const, ...extra });

describe("tasks: owner isolation", () => {
  it("never shows, reads, updates, completes or deletes another owner's task", async () => {
    const [mine] = await createTask(A, t("A secret task"));
    expect((await listTasks(B)).map((x) => x.id)).not.toContain(mine.id);
    expect(await getTask(B, mine.id)).toBeNull();
    await expect(updateTask(B, mine.id, { ...t("hacked"), status: "done" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await setTaskStatus(B, mine.id, "done")).toEqual([]);
    expect(await deleteTask(B, mine.id)).toEqual([]);
    const still = await getTask(A, mine.id);
    expect(still?.title).toBe("A secret task");
    expect(still?.status).toBe("todo");
  });

  it("rejects malformed ids without touching the database", async () => {
    expect(await getTask(A, "1 or 1=1")).toBeNull();
    await expect(deleteTask(A, "nope")).rejects.toThrow();
  });
});

describe("tasks: CRUD, filters, sort, search", () => {
  it("creates, edits, clears optional fields and finds tasks", async () => {
    const [x] = await createTask(A, t("Write report", { notes: "n", estimatedMinutes: 30, priority: "high" }));
    const edited = await updateTask(A, x.id, { ...t("Write final report", { priority: "low" }), status: "doing" });
    expect(edited).toMatchObject({ title: "Write final report", priority: "low", status: "doing", notes: null, estimatedMinutes: null });
    expect((await listTasks(A, { search: "FINAL" })).map((r) => r.id)).toContain(x.id);
    expect((await listTasks(A, { search: "%" })).length).toBe(0);
    expect((await listTasks(A, { status: "doing" })).map((r) => r.id)).toContain(x.id);
    expect((await listTasks(A, { priority: "high" })).map((r) => r.id)).not.toContain(x.id);
  });

  it("sorts by deadline with undated last and done tasks at the bottom", async () => {
    const [none] = await createTask(A, t("sort-none"));
    const [late] = await createTask(A, t("sort-late", { deadline: new Date("2030-02-01T00:00:00Z") }));
    const [soon] = await createTask(A, t("sort-soon", { deadline: new Date("2030-01-01T00:00:00Z") }));
    const [fin] = await createTask(A, t("sort-done", { deadline: new Date("2029-01-01T00:00:00Z") }));
    await setTaskStatus(A, fin.id, "done");
    const ids = (await listTasks(A, { search: "sort-", sort: "deadline" })).map((r) => r.id);
    expect(ids).toEqual([soon.id, late.id, none.id, fin.id]);
  });
});

describe("projects", () => {
  it("scopes projects and refuses to link another owner's project", async () => {
    const pa = await createProject(A, { name: "Thesis" });
    expect((await listProjects(B)).map((p) => p.id)).not.toContain(pa.id);
    expect(await getProject(B, pa.id)).toBeNull();
    await expect(updateProject(B, pa.id, { name: "mine now" })).rejects.toBeInstanceOf(NotFoundError);
    await deleteProject(B, pa.id);
    expect(await getProject(A, pa.id)).not.toBeNull();
    await expect(createTask(B, t("sneaky", { projectId: pa.id }))).rejects.toBeInstanceOf(NotFoundError);
    const [mine] = await createTask(B, t("b task"));
    await expect(updateTask(B, mine.id, { ...t("b task", { projectId: pa.id }), status: "todo" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("counts progress, filters by project, and keeps tasks when a project is deleted", async () => {
    const p = await createProject(A, { name: "Capstone" });
    const [one] = await createTask(A, t("cap-1", { projectId: p.id }));
    await createTask(A, t("cap-2", { projectId: p.id }));
    await setTaskStatus(A, one.id, "done");
    const row = (await listProjects(A)).find((r) => r.id === p.id);
    expect(row).toMatchObject({ total: 2, done: 1 });
    expect((await listTasks(A, { projectId: p.id })).length).toBe(2);
    expect((await listTasks(A, { projectId: p.id }))[0].projectName).toBe("Capstone");
    await deleteProject(A, p.id);
    const after = await getTask(A, one.id);
    expect(after?.projectId).toBeNull();
    expect((await listTasks(A, { projectId: "none" })).map((r) => r.id)).toContain(one.id);
  });
});

describe("dependencies", () => {
  it("detects cycles (pure)", () => {
    const edges = [{ taskId: "b", dependsOnId: "a" }, { taskId: "c", dependsOnId: "b" }];
    expect(wouldCreateCycle(edges, "a", "c")).toBe(true);
    expect(wouldCreateCycle(edges, "a", "b")).toBe(true);
    expect(wouldCreateCycle(edges, "c", "a")).toBe(false);
    expect(wouldCreateCycle(edges, "x", "x")).toBe(true);
    expect(wouldCreateCycle([], "a", "b")).toBe(false);
  });

  it("blocks cycles, self-links and cross-owner links in the database", async () => {
    const [a] = await createTask(A, t("dep-a"));
    const [b] = await createTask(A, t("dep-b"));
    const [c] = await createTask(A, t("dep-c"));
    await addDependency(A, b.id, a.id);
    await addDependency(A, c.id, b.id);
    await expect(addDependency(A, a.id, c.id)).rejects.toBeInstanceOf(AppError);
    await expect(addDependency(A, a.id, a.id)).rejects.toBeInstanceOf(AppError);
    const [other] = await createTask(B, t("b-owned"));
    await expect(addDependency(A, a.id, other.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addDependency(B, other.id, a.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listBlockers(B, b.id)).length).toBe(0);
    expect((await listBlockers(A, c.id)).map((x) => x.id)).toEqual([b.id]);
  });

  it("tracks blocked tasks, ignores duplicates, and cleans up on delete", async () => {
    const [a] = await createTask(A, t("blk-a"));
    const [b] = await createTask(A, t("blk-b"));
    await addDependency(A, b.id, a.id);
    await addDependency(A, b.id, a.id);
    expect((await listBlockers(A, b.id)).length).toBe(1);
    expect((await blockedTaskIds(A)).has(b.id)).toBe(true);
    await setTaskStatus(A, a.id, "done");
    expect((await blockedTaskIds(A)).has(b.id)).toBe(false);
    await setTaskStatus(A, a.id, "todo");
    expect((await blockedTaskIds(A)).has(b.id)).toBe(true);
    await removeDependency(B, b.id, a.id);
    expect((await listBlockers(A, b.id)).length).toBe(1);
    await removeDependency(A, b.id, a.id);
    expect((await listBlockers(A, b.id)).length).toBe(0);
    await addDependency(A, b.id, a.id);
    await deleteTask(A, a.id);
    expect((await listBlockers(A, b.id)).length).toBe(0);
  });
});
