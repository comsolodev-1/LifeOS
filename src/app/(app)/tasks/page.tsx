import Link from "next/link";
import { Check, Trash2, RotateCcw } from "lucide-react";
import { EmptyState, ErrorState, NotConfigured, PageHeader } from "@/components/ui";
import { isDbConfigured } from "@/db";
import type { Task } from "@/db/schema";
import { listTasks } from "@/lib/dal/tasks";
import { requireOwnerId } from "@/lib/session";
import { changeStatus, removeTask } from "./actions";
import { TaskForm } from "./task-form";

const filters = [
  { value: "", label: "All" },
  { value: "todo", label: "To do" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done" },
];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status, q } = await searchParams;
  if (!isDbConfigured()) {
    return (
      <>
        <PageHeader title="Tasks" />
        <NotConfigured vars={["DATABASE_URL"]} />
      </>
    );
  }

  let items: Task[] | null = null;
  try {
    const ownerId = await requireOwnerId();
    items = await listTasks(ownerId, { status, search: q });
  } catch {
    items = null;
  }

  const content: React.ReactNode =
    items === null ? (
      <ErrorState message="Could not load tasks. The database may be waking up; refresh in a few seconds." />
    ) : (
      items.length === 0 ? (
        <EmptyState title="No tasks" body={q || status ? "Nothing matches this filter." : "Add your first task above."} />
      ) : (
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <form action={changeStatus}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="status" value={t.status === "done" ? "todo" : "done"} />
                <button
                  aria-label={t.status === "done" ? "Mark as to do" : "Mark as done"}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-line"
                >
                  {t.status === "done" ? <RotateCcw size={18} aria-hidden /> : <Check size={18} aria-hidden />}
                </button>
              </form>
              <div className="min-w-0 flex-1">
                <p className={`truncate ${t.status === "done" ? "text-muted line-through" : ""}`}>{t.title}</p>
                <p className="text-xs text-muted">
                  {t.priority}
                  {t.deadline
                    ? ` · due ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(t.deadline)}`
                    : ""}
                  {t.estimatedMinutes ? ` · ${t.estimatedMinutes} min` : ""}
                </p>
              </div>
              <form action={removeTask}>
                <input type="hidden" name="id" value={t.id} />
                <button aria-label="Delete task" className="flex h-11 w-11 items-center justify-center text-muted">
                  <Trash2 size={18} aria-hidden />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )
    );

  return (
    <>
      <PageHeader title="Tasks" />
      <div className="space-y-4">
        <TaskForm />
        <form className="flex gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Search tasks" aria-label="Search tasks" className="min-h-11 flex-1 rounded-lg border border-line bg-paper px-3 text-base" />
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <button className="min-h-11 rounded-lg border border-line px-4 text-sm">Search</button>
        </form>
        <div className="flex gap-2 overflow-x-auto">
          {filters.map((f) => (
            <Link
              key={f.value}
              href={f.value ? `/tasks?status=${f.value}` : "/tasks"}
              className={`flex min-h-11 items-center rounded-full border px-4 text-sm ${(status ?? "") === f.value ? "border-accent text-accent" : "border-line text-muted"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        {content}
      </div>
    </>
  );
}
