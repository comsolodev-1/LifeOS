"use client";

import { useActionState } from "react";
import { saveTask, type FormState } from "../actions";
import { field } from "../task-form";

export interface EditableTask {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  deadline: string;
  estimatedMinutes: number | null;
  projectId: string | null;
}

export function EditForm({ task, projects }: { task: EditableTask; projects: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTask, {});
  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <input type="hidden" name="id" value={task.id} />
      <label className="block text-sm">Title
        <input name="title" required maxLength={200} defaultValue={task.title} className={`${field} mt-1`} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Status
          <select name="status" defaultValue={task.status} className={`${field} mt-1`}>
            <option value="todo">To do</option>
            <option value="doing">Doing</option>
            <option value="done">Done</option>
          </select>
        </label>
        <label className="block text-sm">Priority
          <select name="priority" defaultValue={task.priority} className={`${field} mt-1`}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="block text-sm">Deadline
          <input name="deadline" type="date" defaultValue={task.deadline} className={`${field} mt-1`} />
        </label>
        <label className="block text-sm">Estimate (min)
          <input name="estimatedMinutes" type="number" min={1} inputMode="numeric" defaultValue={task.estimatedMinutes ?? ""} className={`${field} mt-1`} />
        </label>
      </div>
      <label className="block text-sm">Project
        <select name="projectId" defaultValue={task.projectId ?? ""} className={`${field} mt-1`}>
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">Notes
        <textarea name="notes" maxLength={2000} rows={3} defaultValue={task.notes ?? ""} className={`${field} mt-1 py-2`} />
      </label>
      {state.error ? <p role="alert" className="text-sm text-red-500">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm text-green-600">Saved</p> : null}
      <button disabled={pending} className="min-h-11 w-full rounded-lg bg-accent text-sm font-medium text-paper disabled:opacity-60">
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
