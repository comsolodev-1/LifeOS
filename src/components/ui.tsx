import Link from "next/link";
import { Plus } from "lucide-react";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
    </header>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

export function NotConfigured({ vars }: { vars: string[] }) {
  return (
    <div role="status" className="rounded-xl border border-line bg-surface p-5 text-sm">
      <p className="font-medium">Not configured</p>
      <p className="mt-1 text-muted">Set these environment variables in Vercel, then redeploy: {vars.join(", ")}.</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-red-400/50 bg-surface p-5 text-sm">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-muted">{message}</p>
    </div>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border border-line bg-surface p-4">{children}</section>;
}

export function QuickAdd() {
  return (
    <Link
      href="/tasks#quick-add"
      aria-label="Quick add task"
      className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-paper shadow-lg md:bottom-6"
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <Plus size={24} aria-hidden />
    </Link>
  );
}
