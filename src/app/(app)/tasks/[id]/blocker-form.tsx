"use client";

import { useActionState } from "react";
import { addBlocker, type FormState } from "../actions";
import { field } from "../task-form";

export function BlockerForm({ taskId, options }: { taskId: string; options: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addBlocker, {});
  if (options.length === 0) return <p className="text-sm text-muted">No other tasks available to depend on.</p>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={taskId} />
      <select name="dependsOn" defaultValue="" aria-label="Blocked by" className={field}>
        <option value="" disabled>Pick a task that must finish first</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.title}</option>
        ))}
      </select>
      {state.error ? <p role="alert" className="text-sm text-red-500">{state.error}</p> : null}
      <button disabled={pending} className="min-h-11 w-full rounded-lg border border-line text-sm disabled:opacity-60">
        {pending ? "Adding..." : "Add dependency"}
      </button>
    </form>
  );
}
