"use client";

import { useActionState, useEffect, useRef } from "react";
import { addMemory, saveLifeContext, saveMemory, type ProfileState } from "./actions";
import { field } from "../tasks/task-form";

const CATEGORIES = ["identity", "education", "work", "preferences", "routines", "goals", "constraints", "other"];

function CategorySelect({ defaultValue = "other" }: { defaultValue?: string }) {
  return (
    <select name="category" defaultValue={defaultValue} aria-label="Category" className={field}>
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

export function LifeContextForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveLifeContext, {});
  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <textarea
        name="content"
        defaultValue={initial}
        rows={6}
        maxLength={4000}
        placeholder="Who you are, what you are working on, your routines and constraints. The AI reads this in every chat."
        aria-label="Life context"
        className={`${field} py-2`}
      />
      {state.error ? <p role="alert" className="text-sm text-red-500">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm text-green-600">Saved</p> : null}
      <button disabled={pending} className="min-h-11 w-full rounded-lg bg-accent text-sm font-medium text-paper disabled:opacity-60">
        {pending ? "Saving..." : "Save life context"}
      </button>
    </form>
  );
}

export function AddMemoryForm() {
  const [state, action, pending] = useActionState<ProfileState, FormData>(addMemory, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <CategorySelect />
      <input name="content" required minLength={3} maxLength={500} placeholder="Something the AI should remember" aria-label="Memory" className={field} />
      {state.error ? <p role="alert" className="text-sm text-red-500">{state.error}</p> : null}
      <button disabled={pending} className="min-h-11 w-full rounded-lg border border-line text-sm disabled:opacity-60">
        {pending ? "Saving..." : "Add memory"}
      </button>
    </form>
  );
}

export function EditMemoryForm({ id, category, content }: { id: string; category: string; content: string }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveMemory, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <CategorySelect defaultValue={category} />
      <textarea name="content" defaultValue={content} rows={2} maxLength={500} aria-label="Memory" className={`${field} py-2`} />
      {state.error ? <p role="alert" className="text-sm text-red-500">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm text-green-600">Saved</p> : null}
      <button disabled={pending} className="min-h-11 w-full rounded-lg border border-line text-sm disabled:opacity-60">Save</button>
    </form>
  );
}
