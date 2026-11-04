"use client";

import { useActionState, useEffect, useRef } from "react";
import { addProject, saveProject, type ProjectFormState } from "./actions";
import { field } from "../tasks/task-form";

export function NewProjectForm() {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(addProject, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <input name="name" required maxLength={120} placeholder="New project name" aria-label="Project name" className={field} />
      {state.error ? <p role="alert" className="text-sm text-red-500">{state.error}</p> : null}
      <button disabled={pending} className="min-h-11 w-full rounded-lg bg-accent text-sm font-medium text-paper disabled:opacity-60">
        {pending ? "Creating..." : "Create project"}
      </button>
    </form>
  );
}

export function EditProjectForm({ id, name, status }: { id: string; name: string; status: string }) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(saveProject, {});
  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <input type="hidden" name="id" value={id} />
      <input name="name" required maxLength={120} defaultValue={name} aria-label="Project name" className={field} />
      <select name="status" defaultValue={status} aria-label="Status" className={field}>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="done">Done</option>
      </select>
      {state.error ? <p role="alert" className="text-sm text-red-500">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm text-green-600">Saved</p> : null}
      <button disabled={pending} className="min-h-11 w-full rounded-lg border border-line text-sm disabled:opacity-60">
        {pending ? "Saving..." : "Save project"}
      </button>
    </form>
  );
}
