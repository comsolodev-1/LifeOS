import Link from "next/link";
import { notFound } from "next/navigation";
import { X } from "lucide-react";
import { ErrorState, PageHeader } from "@/components/ui";
import { listProjects } from "@/lib/dal/projects";
import { getTask, listBlockers, listTasks } from "@/lib/dal/tasks";
import { dateInputValue } from "@/lib/forms";
import { requireOwnerId } from "@/lib/session";
import { dropBlocker, removeTask } from "../actions";
import { BlockerForm } from "./blocker-form";
import { EditForm } from "./edit-form";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    const ownerId = await requireOwnerId();
    const task = await getTask(ownerId, id);
    if (!task) data = "missing" as const;
    else {
      const [projects, blockers, all] = await Promise.all([listProjects(ownerId), listBlockers(ownerId, id), listTasks(ownerId)]);
      data = { task, projects, blockers, all };
    }
  } catch {
    data = null;
  }
  if (data === "missing") notFound();
  if (data === null) {
    return (
      <>
        <PageHeader title="Task" />
        <ErrorState message="Could not load this task. Refresh in a few seconds." />
      </>
    );
  }

  const { task, projects, blockers, all } = data;
  const taken = new Set([task.id, ...blockers.map((b) => b.id)]);
  const options = all.filter((t) => !taken.has(t.id) && t.status !== "done").map((t) => ({ id: t.id, title: t.title }));

  return (
    <>
      <Link href="/tasks" className="mb-3 inline-block text-sm text-accent">Back to tasks</Link>
      <PageHeader title="Edit task" />
      <div className="space-y-6">
        <EditForm
          task={{
            id: task.id, title: task.title, notes: task.notes, status: task.status, priority: task.priority,
            deadline: dateInputValue(task.deadline), estimatedMinutes: task.estimatedMinutes, projectId: task.projectId,
          }}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        />
        <section>
          <h2 className="mb-2 font-medium">Blocked by</h2>
          {blockers.length === 0 ? (
            <p className="mb-3 text-sm text-muted">Nothing blocks this task.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {blockers.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
                  <Link href={`/tasks/${b.id}`} className={`min-w-0 flex-1 truncate ${b.status === "done" ? "text-muted line-through" : ""}`}>{b.title}</Link>
                  <form action={dropBlocker}>
                    <input type="hidden" name="id" value={task.id} />
                    <input type="hidden" name="dependsOn" value={b.id} />
                    <button aria-label={`Remove dependency on ${b.title}`} className="flex h-11 w-11 items-center justify-center text-muted">
                      <X size={18} aria-hidden />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <BlockerForm taskId={task.id} options={options} />
        </section>
        <form action={removeTask}>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="redirect" value="1" />
          <button className="min-h-11 w-full rounded-lg border border-red-400/60 text-sm text-red-500">Delete task</button>
        </form>
      </div>
    </>
  );
}
