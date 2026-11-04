"use client";

import { useActionState } from "react";
import { approveMemory, confirmSuggestion, dismissSuggestion, rejectMemory, type CardState } from "@/app/(app)/ai/actions";

const field = "min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-base";
const LABELS: Record<string, string> = { create_task: "Add task", update_task: "Change task", create_project: "Add project" };

export interface SuggestionData {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
}

export function ActionCard({ action }: { action: SuggestionData }) {
  const [confirmState, confirm, confirming] = useActionState<CardState, FormData>(confirmSuggestion, {});
  const [dismissState, dismiss, dismissing] = useActionState<CardState, FormData>(dismissSuggestion, {});
  const p = action.payload;
  const done = confirmState.ok || dismissState.ok;
  return (
    <div className="rounded-xl border-2 border-dashed border-accent/60 bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-accent">AI suggestion: {LABELS[action.kind] ?? action.kind}</p>
      {done ? (
        <p role="status" className="mt-2 text-sm text-muted">{confirmState.message ?? dismissState.message}</p>
      ) : (
        <>
          <form action={confirm} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={action.id} />
            {"title" in p ? <input name="title" defaultValue={String(p.title)} aria-label="Title" maxLength={200} className={field} /> : null}
            {"name" in p ? <input name="name" defaultValue={String(p.name)} aria-label="Name" maxLength={120} className={field} /> : null}
            <div className="grid grid-cols-2 gap-2">
              {"priority" in p ? (
                <select name="priority" defaultValue={String(p.priority)} aria-label="Priority" className={field}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              ) : null}
              {"deadline" in p ? <input name="deadline" type="date" defaultValue={String(p.deadline)} aria-label="Deadline" className={field} /> : null}
              {"status" in p ? (
                <select name="status" defaultValue={String(p.status)} aria-label="Status" className={field}>
                  <option value="todo">To do</option>
                  <option value="doing">Doing</option>
                  <option value="done">Done</option>
                </select>
              ) : null}
            </div>
            {"notes" in p ? <p className="text-xs text-muted">Notes: {String(p.notes)}</p> : null}
            {confirmState.error ? <p role="alert" className="text-sm text-red-500">{confirmState.error}</p> : null}
            <button disabled={confirming} className="min-h-11 w-full rounded-lg bg-accent text-sm font-medium text-paper disabled:opacity-60">
              {confirming ? "Confirming..." : "Confirm"}
            </button>
          </form>
          <form action={dismiss} className="mt-2">
            <input type="hidden" name="id" value={action.id} />
            <button disabled={dismissing} className="min-h-11 w-full rounded-lg border border-line text-sm disabled:opacity-60">Dismiss</button>
          </form>
        </>
      )}
    </div>
  );
}

export function MemoryProposalCard({ memory }: { memory: { id: string; category: string; content: string } }) {
  const [approveState, approve, approving] = useActionState<CardState, FormData>(approveMemory, {});
  const [rejectState, reject, rejecting] = useActionState<CardState, FormData>(rejectMemory, {});
  const done = approveState.ok || rejectState.ok;
  return (
    <div className="rounded-xl border-2 border-dashed border-accent/60 bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-accent">AI suggestion: remember this ({memory.category})</p>
      {done ? (
        <p role="status" className="mt-2 text-sm text-muted">{approveState.message ?? rejectState.message}</p>
      ) : (
        <>
          <form action={approve} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={memory.id} />
            <input type="hidden" name="category" value={memory.category} />
            <textarea name="content" defaultValue={memory.content} rows={2} maxLength={500} aria-label="Memory" className={`${field} py-2`} />
            {approveState.error ? <p role="alert" className="text-sm text-red-500">{approveState.error}</p> : null}
            <button disabled={approving} className="min-h-11 w-full rounded-lg bg-accent text-sm font-medium text-paper disabled:opacity-60">Approve</button>
          </form>
          <form action={reject} className="mt-2">
            <input type="hidden" name="id" value={memory.id} />
            <button disabled={rejecting} className="min-h-11 w-full rounded-lg border border-line text-sm disabled:opacity-60">Reject</button>
          </form>
        </>
      )}
    </div>
  );
}
