"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { ActionCard, MemoryProposalCard, type SuggestionData } from "@/components/suggestion-cards";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type Card = { key: string } & ({ kind: "action"; action: SuggestionData } | { kind: "memory"; memory: { id: string; category: string; content: string } });

export function Chat({
  initialMessages, initialConversationId, initialCards,
}: {
  initialMessages: ChatMsg[];
  initialConversationId?: string;
  initialCards: Card[];
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, cards]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: text }, { id: assistantId, role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Request failed.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as
            | { type: "meta"; conversationId: string }
            | { type: "text"; delta: string }
            | { type: "suggestion"; ui: { kind: "action"; action: SuggestionData } | { kind: "memory"; memory: { id: string; category: string; content: string } } }
            | { type: "done" }
            | { type: "error"; message: string };
          if (ev.type === "meta") {
            setConversationId(ev.conversationId);
            window.history.replaceState(null, "", `/ai?c=${ev.conversationId}`);
          } else if (ev.type === "text") {
            setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: x.content + ev.delta } : x)));
          } else if (ev.type === "suggestion") {
            setCards((c) => [...c, { key: crypto.randomUUID(), ...ev.ui } as Card]);
          } else if (ev.type === "error") {
            setError(ev.message);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setMessages((m) => m.filter((x) => !(x.id === assistantId && x.content === "")));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
          Tell me about your day, a plan, or something to do. I can suggest tasks and things to remember. Nothing changes until you confirm.
        </p>
      ) : null}
      {messages.map((m) => (
        <div key={m.id} className={m.role === "user" ? "ml-8 rounded-xl bg-accent/10 p-3 text-sm" : "mr-8 rounded-xl border border-line bg-surface p-3 text-sm"}>
          {m.role === "assistant" ? <p className="mb-1 text-xs font-medium text-accent">AI</p> : null}
          <p className="whitespace-pre-wrap">{m.content || (busy ? "Thinking..." : "")}</p>
        </div>
      ))}
      {cards.map((c) => (c.kind === "action" ? <ActionCard key={c.key} action={c.action} /> : <MemoryProposalCard key={c.key} memory={c.memory} />))}
      {error ? <p role="alert" className="rounded-lg border border-red-400/50 p-3 text-sm">{error}</p> : null}
      <div ref={bottom} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="sticky flex items-end gap-2 bg-paper pb-2 pt-2"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Message"
          aria-label="Message"
          className="min-h-11 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-base"
        />
        <button disabled={busy || !input.trim()} aria-label="Send" className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-paper disabled:opacity-50">
          <Send size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}
