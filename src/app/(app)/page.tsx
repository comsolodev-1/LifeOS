import Link from "next/link";
import { Card, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { isDbConfigured } from "@/db";
import type { Task } from "@/db/schema";
import { countOpenTasks, listTasks } from "@/lib/dal/tasks";
import { requireOwnerId } from "@/lib/session";

function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function HomePage() {
  const now = new Date();
  const tz = "Asia/Manila";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(now));
  const dateText = new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeZone: tz }).format(now);

  let data: { open: number; next: Task[] } | null = null;
  let failed = false;
  if (isDbConfigured()) {
    try {
      const ownerId = await requireOwnerId();
      const [open, all] = await Promise.all([countOpenTasks(ownerId), listTasks(ownerId)]);
      data = { open, next: all.filter((t) => t.status !== "done").slice(0, 5) };
    } catch {
      failed = true;
    }
  }

  const body: React.ReactNode = !isDbConfigured() ? (
    <EmptyState title="Database not connected" body="Open Setup to see which variables are missing." />
  ) : failed || !data ? (
    <ErrorState message="Could not load your data. The database may be waking up; refresh in a few seconds." />
  ) : (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-muted">Open tasks</p>
        <p className="text-3xl font-semibold">{data.open}</p>
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">Next up</h2>
        {data.next.length === 0 ? (
          <p className="text-sm text-muted">Nothing pending. Use the + button to add a task.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.next.map((t) => (
              <li key={t.id} className="flex justify-between gap-3">
                <span>{t.title}</span>
                <span className="text-muted">{t.priority}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/tasks" className="mt-3 inline-block text-sm text-accent">All tasks</Link>
      </Card>
    </div>
  );

  return (
    <>
      <PageHeader title={`${greeting(hour)}.`} subtitle={dateText} />
      {body}
    </>
  );
}
