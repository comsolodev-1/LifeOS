import { Trash2 } from "lucide-react";
import { MemoryProposalCard } from "@/components/suggestion-cards";
import { EmptyState, ErrorState, NotConfigured, PageHeader } from "@/components/ui";
import { isDbConfigured } from "@/db";
import { getLifeContext, listMemories } from "@/lib/ai/memory";
import { isVaultKeyValid } from "@/lib/privacy/crypto";
import { requireOwnerId } from "@/lib/session";
import { removeMemory } from "./actions";
import { AddMemoryForm, EditMemoryForm, LifeContextForm } from "./profile-forms";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });

export default async function ProfilePage() {
  if (!isDbConfigured() || !isVaultKeyValid(process.env.VAULT_KEY)) {
    return (
      <>
        <PageHeader title="Life Profile" />
        <NotConfigured vars={["DATABASE_URL", "VAULT_KEY (32 bytes, base64)"]} />
      </>
    );
  }
  let data;
  try {
    const ownerId = await requireOwnerId();
    const [context, proposed, approved] = await Promise.all([getLifeContext(ownerId), listMemories(ownerId, "proposed"), listMemories(ownerId, "approved")]);
    data = { context, proposed, approved };
  } catch {
    data = null;
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Life Profile" />
        <ErrorState message="Could not load your profile. If you changed VAULT_KEY, old entries cannot be decrypted." />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Life Profile" subtitle="Encrypted in the database. Names and details are replaced before anything reaches the AI." />
      <div className="space-y-8">
        <section>
          <h2 className="mb-2 font-medium">Life context</h2>
          <LifeContextForm initial={data.context} />
        </section>
        {data.proposed.length > 0 ? (
          <section className="space-y-3">
            <h2 className="font-medium">Waiting for your approval</h2>
            {data.proposed.map((m) => (
              <MemoryProposalCard key={m.id} memory={{ id: m.id, category: m.category, content: m.content }} />
            ))}
          </section>
        ) : null}
        <section className="space-y-3">
          <h2 className="font-medium">Approved memories</h2>
          <AddMemoryForm />
          {data.approved.length === 0 ? (
            <EmptyState title="No memories yet" body="Add one above, or approve suggestions from the AI chat." />
          ) : (
            <ul className="space-y-3">
              {data.approved.map((m) => (
                <li key={m.id} className="rounded-xl border border-line bg-surface p-4">
                  <p className="mb-2 text-xs text-muted">
                    {m.source === "manual" ? "added by you" : "suggested by AI, approved"} · confidence {Math.round(m.confidence * 100)}%
                    {m.lastVerifiedAt ? ` · verified ${dateFmt.format(m.lastVerifiedAt)}` : ""}
                  </p>
                  <EditMemoryForm id={m.id} category={m.category} content={m.content} />
                  <form action={removeMemory} className="mt-2">
                    <input type="hidden" name="id" value={m.id} />
                    <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-400/60 text-sm text-red-500">
                      <Trash2 size={16} aria-hidden /> Delete
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
