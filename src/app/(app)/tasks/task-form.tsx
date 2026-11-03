"use client";

import { useActionState, useEffect, useRef } from "react";
import { addTask, type FormState } from "./actions";

const field = "min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-base";

export function TaskForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addTask, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form id="quick-add" ref={ref} action={action} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <input name="title" required maxLength={200} placeholder="New task" aria-label="Task title" className={field} />
      <div className="grid grid-cols-2 gap-3">
        <select name="priority" defaultValue="medium" aria-label="Priority" className={field}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <input name="deadline" type="date" aria-label="Deadline" className={field} />
      </div>
      <input name="estimatedMinutes" type="number" min={1} inputMode="numeric" placeholder="Estimated minutes (optional)" aria-label="Estimated minutes" className={field} />
      <textarea name="notes" maxLength={2000} rows={2} placeholder="Notes (optional)" aria-label="Notes" className={`${field} py-2`} />
      {state.error ? <p role="alert" className="text-sm text-red-500">{state.error}</p> : null}
      <button disabled={pending} className="min-h-11 w-full rounded-lg bg-accent text-sm font-medium text-paper disabled:opacity-60">
        {pending ? "Adding..." : "Add task"}
      </button>
    </form>
  );
}
