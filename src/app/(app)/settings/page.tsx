import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <Link href="/settings/privacy" className="block rounded-xl border border-line bg-surface p-4">
          <p className="font-medium">Privacy Vault and audit</p>
          <p className="mt-1 text-sm text-muted">Names and details that must never reach the AI, and what Gemini actually saw.</p>
        </Link>
        <Card>
          <h2 className="font-medium">Privacy mode: Strict</h2>
          <p className="mt-1 text-sm text-muted">Everything detected is replaced with placeholders or generalized. Secrets (ID numbers, cards, passwords) block the request. Mode switching arrives in a later sprint.</p>
        </Card>
        <Card>
          <h2 className="font-medium">What this does and does not do</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>This is pseudonymization, not anonymization. Google still receives the replaced text.</li>
            <li>Detection is not perfect. Add anything missed to the Vault.</li>
            <li>A rare job or situation in a small place can identify you even without your name.</li>
            <li>On the Gemini free tier, Google may use submitted content to improve its products. Enable billing on your key before sending real personal data.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
