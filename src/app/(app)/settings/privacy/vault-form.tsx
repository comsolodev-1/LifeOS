"use client";

import { useActionState, useEffect, useRef } from "react";
import { addEntry, type VaultFormState } from "./actions";

const field = "min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-base";

export function VaultForm() {
  const [state, action, pending] = useActionState<VaultFormState, FormData>(addEntry, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <select name="type" defaultValue="person" aria-label="Type" className={field}>
        <option value="owner">Me (my own name)</option>
        <option value="person">Person</option>
        <option value="email">Email</option>
        <option value="phone">Phone</option>
        <option value="place">Place or address</option>
        <option value="org">School or employer</option>
        <option value="handle">Social handle</option>
        <option value="other">Other</option>
      </select>
      <input name="value" required maxLength={200} placeholder="Value, e.g. a full name" aria-label="Value" className={field} />
      <input name="aliases" placeholder="Nicknames or variants, comma separated" aria-label="Aliases" className={field} />
      {state.error ? <p role="alert" className="text-sm text-red-500">{state.error}</p> : null}
      <button disabled={pending} className="min-h-11 w-full rounded-lg bg-accent text-sm font-medium text-paper disabled:opacity-60">
        {pending ? "Saving..." : "Add to Vault"}
      </button>
    </form>
  );
}
