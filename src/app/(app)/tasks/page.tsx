import Link from "next/link";
import { EmptyState, ErrorState, NotConfigured, PageHeader } from "@/components/ui";
import { TaskList } from "@/components/task-list";
import { isDbConfigured } from "@/db";
import { listProjects } from "@/lib/dal/projects";
import { blockedTaskIds, listTasks, type TaskRow } from "@/lib/dal/tasks";
import { requireOwnerId } from "@/lib/session";
import { field, TaskForm } from "./task-form";

type Params = { status?: string; q?: string; project?: string; priority?: string; sort?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  if (!isDbConfigured()) {
    return (
      <>
        <PageHeader title="Tasks" />
        <NotConfigured vars={["DATABASE_URL"]} />
      </>
    );
  }

  let data: { items: TaskRow[]; blocked: string[]; projects: { id: string; name: string }[] } | null = null;
  try {
    const ownerId = await requireOwnerId();
    const [items, blocked, projects] = await Promise.all([
      listTasks(ownerId, { status: p.status, search: p.q, projectId: p.project, priority: p.priority, sort: p.sort }),
      blockedTaskIds(ownerId),
      listProjects(ownerId),
    ]);
    data = { items, blocked: [...blocked], projects: projects.map(({ id, name }) => ({ id, name })) };
  } catch {
    data = null;
  }

  const filtered = Boolean(p.status || p.q || p.project || p.priority);

  return (
    <>
      <PageHeader title="Tasks" />
      {data === null ? (
        <ErrorState message="Could not load tasks. The database may be waking up; refresh in a few seconds." />
      ) : (
        <div className="space-y-4">
          <TaskForm projects={data.projects} />
          <form className="space-y-2 rounded-xl border border-line bg-surface p-3" role="search">
            <input name="q" defaultValue={p.q} placeholder="Search tasks" aria-label="Search tasks" className={field} />
            <div className="grid grid-cols-2 gap-2">
              <select name="status" defaultValue={p.status ?? ""} aria-label="Status" className={field}>
                <option value="">All statuses</option>
                <option value="todo">To do</option>
                <option value="doing">Doing</option>
                <option value="done">Done</option>
              </select>
              <select name="priority" defaultValue={p.priority ?? ""} aria-label="Priority filter" className={field}>
                <option value="">Any priority</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select name="project" defaultValue={p.project ?? ""} aria-label="Project filter" className={field}>
                <option value="">All projects</option>
                <option value="none">No project</option>
                {data.projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>{pr.name}</option>
                ))}
              </select>
              <select name="sort" defaultValue={p.sort ?? "deadline"} aria-label="Sort" className={field}>
                <option value="deadline">Sort: deadline</option>
                <option value="priority">Sort: priority</option>
                <option value="newest">Sort: newest</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button className="min-h-11 flex-1 rounded-lg border border-line text-sm">Apply</button>
              {filtered ? <Link href="/tasks" className="flex min-h-11 items-center rounded-lg border border-line px-4 text-sm">Clear</Link> : null}
            </div>
          </form>
          {data.items.length === 0 ? (
            <EmptyState title="No tasks" body={filtered ? "Nothing matches these filters." : "Add your first task above."} />
          ) : (
            <TaskList tasks={data.items} blocked={data.blocked} />
          )}
        </div>
      )}
    </>
  );
}
