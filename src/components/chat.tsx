"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { ActionCard, MemoryProposalCard, type SuggestionData } from "@/components/suggestion-cards";
import { shouldPoll } from "@/lib/ai/chat-state";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

type Card = { key: string } & ({ kind: "action"; action: SuggestionData } | { kind: "memory"; memory: { id: string; category: string; content: string } });

const LAST_CHAT_KEY = "lifeos.chat.last";
const POLL_EVERY_MS = 3000;
const POLL_MAX = 50;

export function Chat({
  initialMessages, initialConversationId, initialCards, isNew,
}: {
  initialMessages: ChatMsg[];
  initialConversationId?: string;
  initialCards: Card[];
  isNew: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, cards, waiting]);

  // Reopen the last chat when AI is opened without choosing one, and pick up a reply that was still being written when the owner left.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const kickoff = setTimeout(() => {
      if (!initialConversationId) {
        const last = !isNew ? window.localStorage.getItem(LAST_CHAT_KEY) : null;
        if (last) router.replace(`/ai?c=${last}`);
        return;
      }
      window.localStorage.setItem(LAST_CHAT_KEY, initialConversationId);
      if (!shouldPoll(initialMessages)) return;
      setWaiting(true);
      let tries = 0;
      const tick = async () => {
        if (cancelled) return;
        tries++;
        try {
          const res = await fetch(`/api/chat/messages?c=${initialConversationId}`);
          const data = (await res.json()) as { messages?: ChatMsg[] };
          const last = data.messages?.[data.messages.length - 1];
          if (data.messages && last?.role === "assistant") {
            if (cancelled) return;
            setMessages(data.messages);
            setWaiting(false);
            router.refresh();
            return;
          }
        } catch {
          /* try again */
        }
        if (tries >= POLL_MAX) {
          if (!cancelled) {
            setWaiting(false);
            setError("The reply did not finish. Send your message again.");
          }
          return;
        }
        timer = setTimeout(tick, POLL_EVERY_MS);
      };
      timer = setTimeout(tick, 1500);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(kickoff);
      if (timer) clearTimeout(timer);
    };
    // Runs once per opened conversation; the props describe that conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy || waiting) return;
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
            window.localStorage.setItem(LAST_CHAT_KEY, ev.conversationId);
            if (mounted.current) {
              setConversationId(ev.conversationId);
              window.history.replaceState(null, "", `/ai?c=${ev.conversationId}`);
            }
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
      {waiting ? (
        <div role="status" className="mr-8 rounded-xl border border-line bg-surface p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-accent">AI</p>
          <p className="text-muted">Still writing your reply. It will appear here, even if you leave this page.</p>
        </div>
      ) : null}
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
        <button disabled={busy || waiting || !input.trim()} aria-label="Send" className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-paper disabled:opacity-50">
          <Send size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}
