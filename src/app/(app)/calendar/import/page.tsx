import Link from "next/link";
import { NotConfigured, PageHeader } from "@/components/ui";
import { isDbConfigured } from "@/db";
import { isVaultKeyValid } from "@/lib/privacy/crypto";
import { ImportFlow } from "./import-flow";

export default function ImportPage() {
  const missing = [!isDbConfigured() && "DATABASE_URL", !isVaultKeyValid(process.env.VAULT_KEY) && "VAULT_KEY", !process.env.GEMINI_API_KEY && "GEMINI_API_KEY"].filter(Boolean) as string[];
  return (
    <>
      <Link href="/calendar" className="mb-3 inline-block text-sm text-accent">Back to calendar</Link>
      <PageHeader title="Import schedule photo" />
      {missing.length ? <NotConfigured vars={missing} /> : <ImportFlow />}
    </>
  );
}
