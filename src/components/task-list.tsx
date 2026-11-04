import Link from "next/link";
import { Check, Lock, RotateCcw, Trash2 } from "lucide-react";
import { changeStatus, removeTask } from "@/app/(app)/tasks/actions";
import type { TaskRow } from "@/lib/dal/tasks";

const fmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

export function TaskList({ tasks, blocked }: { tasks: TaskRow[]; blocked: string[] }) {
  const blockedSet = new Set(blocked);
  return (
    <ul className="space-y-2">
      {tasks.map((t) => {
        const isBlocked = t.status !== "done" && blockedSet.has(t.id);
        return (
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
            <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1">
              <p className={`truncate ${t.status === "done" ? "text-muted line-through" : ""}`}>{t.title}</p>
              <p className="truncate text-xs text-muted">
                {t.status === "doing" ? "doing · " : ""}
                {t.priority}
                {t.projectName ? ` · ${t.projectName}` : ""}
                {t.deadline ? ` · due ${fmt.format(t.deadline)}` : ""}
                {t.estimatedMinutes ? ` · ${t.estimatedMinutes} min` : ""}
              </p>
              {isBlocked ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                  <Lock size={12} aria-hidden /> Blocked by an unfinished task
                </p>
              ) : null}
            </Link>
            <form action={removeTask}>
              <input type="hidden" name="id" value={t.id} />
              <button aria-label="Delete task" className="flex h-11 w-11 items-center justify-center text-muted">
                <Trash2 size={18} aria-hidden />
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
