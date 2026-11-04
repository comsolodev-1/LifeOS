"use client";

import { useActionState } from "react";
import { testGemini, type GeminiTestState } from "./actions";

export function GeminiTest() {
  const [state, action, pending] = useActionState<GeminiTestState>(async () => testGemini(), {});
  return (
    <form action={action} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <p className="text-sm text-muted">Sends one harmless prompt through the Privacy Gateway.</p>
      <button disabled={pending} className="min-h-11 w-full rounded-lg border border-line text-sm font-medium disabled:opacity-60">
        {pending ? "Testing..." : "Run Gemini test"}
      </button>
      {state.message ? (
        <p role="status" className={`text-sm ${state.ok ? "text-green-600" : "text-red-500"}`}>{state.message}</p>
      ) : null}
    </form>
  );
}
