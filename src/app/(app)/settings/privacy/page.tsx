import { Trash2 } from "lucide-react";
import { EmptyState, ErrorState, NotConfigured, PageHeader } from "@/components/ui";
import { isDbConfigured } from "@/db";
import { isVaultKeyValid } from "@/lib/privacy/crypto";
import { listAudit, listVault } from "@/lib/privacy/vault";
import type { VaultEntry } from "@/lib/privacy/types";
import { requireOwnerId } from "@/lib/session";
import { removeEntry } from "./actions";
import { VaultForm } from "./vault-form";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  if (!isDbConfigured() || !isVaultKeyValid(process.env.VAULT_KEY)) {
    return (
      <>
        <PageHeader title="Privacy Vault" />
        <NotConfigured vars={["DATABASE_URL", "VAULT_KEY (32 bytes, base64)"]} />
      </>
    );
  }

  let vault: VaultEntry[] | null = null;
  let audit: Awaited<ReturnType<typeof listAudit>> = [];
  try {
    const ownerId = await requireOwnerId();
    [vault, audit] = await Promise.all([listVault(ownerId), listAudit(ownerId, 15)]);
  } catch {
    vault = null;
  }

  return (
    <>
      <PageHeader title="Privacy Vault" subtitle="Values here are encrypted in the database and replaced before anything reaches the AI." />
      <div className="space-y-6">
        <VaultForm />
        {vault === null ? (
          <ErrorState message="Could not read the Vault. If you changed VAULT_KEY, old entries cannot be decrypted." />
        ) : vault.length === 0 ? (
          <EmptyState title="Vault is empty" body="Add your own name, family, friends, school and workplace so they are always replaced." />
        ) : (
          <ul className="space-y-2">
            {vault.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{e.value}</p>
                  <p className="truncate text-xs text-muted">{e.type}{e.aliases.length ? ` · ${e.aliases.join(", ")}` : ""}</p>
                </div>
                <form action={removeEntry}>
                  <input type="hidden" name="id" value={e.id} />
                  <button aria-label={`Delete ${e.value}`} className="flex h-11 w-11 items-center justify-center text-muted">
                    <Trash2 size={18} aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <section>
          <h2 className="mb-2 font-medium">Recent AI requests</h2>
          <p className="mb-3 text-sm text-muted">What Gemini actually saw. Kept for 14 days.</p>
          {audit.length === 0 ? (
            <EmptyState title="No requests yet" body="Run the Gemini test on the Setup page." />
          ) : (
            <ul className="space-y-2">
              {audit.map((a) => (
                <li key={a.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
                  <details>
                    <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                      <span>{a.purpose} · {a.model}</span>
                      <span className={a.blocked ? "text-red-500" : "text-green-600"}>{a.blocked ? `blocked (${a.blockReason})` : "sent"}</span>
                    </summary>
                    <p className="mt-2 text-xs text-muted">
                      {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(a.createdAt)}
                      {" · replaced: "}
                      {Object.entries(a.entityCounts).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing"}
                    </p>
                    {a.sanitizedPayload ? <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-3 text-xs">{a.sanitizedPayload}</pre> : null}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
