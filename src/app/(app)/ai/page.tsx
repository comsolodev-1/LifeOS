import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Chat } from "@/components/chat";
import { ErrorState, NotConfigured, PageHeader } from "@/components/ui";
import { isDbConfigured } from "@/db";
import { conversationExists, listConversations, listMessages } from "@/lib/ai/conversations";
import { listMemories } from "@/lib/ai/memory";
import { listPending } from "@/lib/ai/pending";
import { isVaultKeyValid } from "@/lib/privacy/crypto";
import { requireOwnerId } from "@/lib/session";
import { removeChat } from "./actions";

export const dynamic = "force-dynamic";

export default async function AiPage({ searchParams }: { searchParams: Promise<{ c?: string; new?: string }> }) {
  const { c, new: newChat } = await searchParams;
  const missing = [!isDbConfigured() && "DATABASE_URL", !isVaultKeyValid(process.env.VAULT_KEY) && "VAULT_KEY", !process.env.GEMINI_API_KEY && "GEMINI_API_KEY"].filter(Boolean) as string[];
  if (missing.length) {
    return (
      <>
        <PageHeader title="AI Assistant" />
        <NotConfigured vars={missing} />
      </>
    );
  }

  let data;
  try {
    const ownerId = await requireOwnerId();
    const valid = c ? await conversationExists(ownerId, c) : false;
    const [convs, msgs, actions, proposed] = await Promise.all([
      listConversations(ownerId),
      valid && c ? listMessages(ownerId, c) : Promise.resolve([]),
      valid && c ? listPending(ownerId, c) : Promise.resolve([]),
      listMemories(ownerId, "proposed"),
    ]);
    data = { convs, msgs, actions, proposed, current: valid ? c : undefined };
  } catch {
    data = null;
  }
  if (!data) {
    return (
      <>
        <PageHeader title="AI Assistant" />
        <ErrorState message="Could not load your chats. Refresh in a few seconds." />
      </>
    );
  }

  const cards = [
    ...data.actions.map((a) => ({ key: a.id, kind: "action" as const, action: { id: a.id, kind: a.kind, payload: a.payload } })),
    ...data.proposed.map((m) => ({ key: m.id, kind: "memory" as const, memory: { id: m.id, category: m.category, content: m.content } })),
  ];

  return (
    <>
      <PageHeader title="AI Assistant" subtitle="Suggestions are never saved until you confirm them." />
      <details className="mb-4 rounded-xl border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">Chats ({data.convs.length})</summary>
        <ul className="divide-y divide-line border-t border-line">
          <li>
            <Link href="/ai?new=1" className="flex min-h-11 items-center px-4 text-sm text-accent">New chat</Link>
          </li>
          {data.convs.map((cv) => (
            <li key={cv.id} className="flex items-center">
              <Link href={`/ai?c=${cv.id}`} className="flex min-h-11 min-w-0 flex-1 items-center px-4 text-sm">
                <span className="truncate">{cv.title}</span>
              </Link>
              <form action={removeChat}>
                <input type="hidden" name="id" value={cv.id} />
                <button aria-label={`Delete chat ${cv.title}`} className="flex h-11 w-11 items-center justify-center text-muted">
                  <Trash2 size={16} aria-hidden />
                </button>
              </form>
            </li>
          ))}
        </ul>
      </details>
      <Chat
        key={data.current ?? "new"}
        initialMessages={data.msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() }))}
        initialConversationId={data.current}
        initialCards={cards}
        isNew={newChat === "1"}
      />
    </>
  );
}
