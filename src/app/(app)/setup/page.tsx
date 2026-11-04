import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui";
import { getDb, isDbConfigured, withRetry } from "@/db";
import { authProvidersConfigured, ENV_VARS } from "@/lib/owner";
import { isVaultKeyValid } from "@/lib/privacy/crypto";
import { GeminiTest } from "./gemini-test";

export const dynamic = "force-dynamic";

async function dbStatus() {
  if (!isDbConfigured()) return { connected: "not configured", migrations: "unknown" };
  try {
    await withRetry(() => getDb().execute(sql`select 1`), 2);
  } catch {
    return { connected: "error", migrations: "unknown" };
  }
  try {
    const res = await getDb().execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    const n = Number((res.rows[0] as { n: number } | undefined)?.n ?? 0);
    return { connected: "ok", migrations: n > 0 ? `${n} applied` : "none applied: run npm run db:migrate" };
  } catch {
    return { connected: "ok", migrations: "none applied: run npm run db:migrate" };
  }
}

function Row({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 px-4 text-sm">
      <span className="font-mono text-xs">{label}</span>
      <span className={good ? "text-green-600" : "text-red-500"}>{value}</span>
    </li>
  );
}

export default async function SetupPage() {
  const providers = authProvidersConfigured(process.env);
  const db = await dbStatus();
  return (
    <>
      <PageHeader title="Setup" subtitle="Deployment checks. Values are never shown." />
      <h2 className="mb-2 text-sm font-medium">Environment</h2>
      <ul className="mb-5 divide-y divide-line rounded-xl border border-line bg-surface">
        {ENV_VARS.map((k) => (
          <Row key={k} label={k} value={process.env[k] ? "set" : "missing"} good={Boolean(process.env[k])} />
        ))}
        <Row label="Google login" value={providers.google ? "set" : "missing"} good={providers.google} />
        <Row label="GitHub login" value={providers.github ? "set" : "missing"} good={providers.github} />
      </ul>
      <h2 className="mb-2 text-sm font-medium">Database</h2>
      <ul className="mb-5 divide-y divide-line rounded-xl border border-line bg-surface">
        <Row label="Connection" value={db.connected} good={db.connected === "ok"} />
        <Row label="Migrations" value={db.migrations} good={db.migrations.endsWith("applied") && !db.migrations.startsWith("none")} />
      </ul>
      <h2 className="mb-2 text-sm font-medium">Privacy and Gemini</h2>
      <ul className="mb-3 divide-y divide-line rounded-xl border border-line bg-surface">
        <Row label="Vault key (32 bytes)" value={isVaultKeyValid(process.env.VAULT_KEY) ? "valid" : "invalid or missing"} good={isVaultKeyValid(process.env.VAULT_KEY)} />
        <Row label="Gemini model" value={process.env.GEMINI_MODEL ?? "default"} good />
      </ul>
      <GeminiTest />
    </>
  );
}
