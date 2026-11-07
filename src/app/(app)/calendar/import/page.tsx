import Link from "next/link";
import { NotConfigured, PageHeader } from "@/components/ui";
import { isDbConfigured } from "@/db";
import { isVaultKeyValid } from "@/lib/privacy/crypto";
import { requireOwnerId } from "@/lib/session";
import { countEventsBySource } from "@/lib/dal/events";
import { removeImported } from "../actions";
import { ImportFlow } from "./import-flow";

export default async function ImportPage() {
  const missing = [!isDbConfigured() && "DATABASE_URL", !isVaultKeyValid(process.env.VAULT_KEY) && "VAULT_KEY", !process.env.GEMINI_API_KEY && "GEMINI_API_KEY"].filter(Boolean) as string[];
  let imported = 0;
  if (!missing.length) {
    try {
      imported = await countEventsBySource(await requireOwnerId(), "photo");
    } catch {
      imported = 0;
    }
  }
  return (
    <>
      <Link href="/calendar" className="mb-3 inline-block text-sm text-accent">Back to calendar</Link>
      <PageHeader title="Import schedule photo" />
      {missing.length ? <NotConfigured vars={missing} /> : <ImportFlow />}
      {imported > 0 ? (
        <details className="mt-8 rounded-xl border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm">Clean up imported events ({imported})</summary>
          <form action={removeImported} className="space-y-2 border-t border-line p-4">
            <p className="text-sm text-muted">Removes every event that came from a photo import, including repeating ones. Events you added by hand are kept.</p>
            <button className="min-h-11 w-full rounded-lg border border-red-400/60 text-sm text-red-500">Delete all {imported} imported events</button>
          </form>
        </details>
      ) : null}
    </>
  );
}
