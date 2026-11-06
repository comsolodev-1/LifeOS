import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState, PageHeader } from "@/components/ui";
import { isDateString, localDateString, timeInputValue } from "@/lib/calendar/timezone";
import { getEvent } from "@/lib/dal/events";
import { requireOwnerId } from "@/lib/session";
import { removeEvent, skipOne } from "../../actions";
import { EventForm } from "../../event-form";

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> }) {
  const { id } = await params;
  const { date } = await searchParams;
  let ev;
  try {
    ev = (await getEvent(await requireOwnerId(), id)) ?? ("missing" as const);
  } catch {
    ev = null;
  }
  if (ev === "missing") notFound();
  if (ev === null) {
    return (
      <>
        <PageHeader title="Event" />
        <ErrorState message="Could not load this event. Refresh in a few seconds." />
      </>
    );
  }
  const r = ev.recurrence;
  return (
    <>
      <Link href="/calendar" className="mb-3 inline-block text-sm text-accent">Back to calendar</Link>
      <PageHeader title="Edit event" subtitle={r ? "Changes apply to the whole series." : undefined} />
      <div className="space-y-4">
        <EventForm
          defaults={{
            id: ev.id, title: ev.title, notes: ev.notes ?? "", kind: ev.kind, date: localDateString(ev.startsAt, ev.timezone),
            startTime: timeInputValue(ev.startsAt, ev.timezone), endTime: timeInputValue(ev.endsAt, ev.timezone),
            repeat: r?.freq ?? "none", interval: r?.interval ?? 1, weekdays: r?.byWeekday ?? [], until: r?.until ?? "", count: r?.count ? String(r.count) : "",
          }}
        />
        {r && date && isDateString(date) ? (
          <form action={skipOne}>
            <input type="hidden" name="id" value={ev.id} />
            <input type="hidden" name="date" value={date} />
            <button className="min-h-11 w-full rounded-lg border border-line text-sm">Skip only the occurrence on {date}</button>
          </form>
        ) : null}
        <form action={removeEvent}>
          <input type="hidden" name="id" value={ev.id} />
          <button className="min-h-11 w-full rounded-lg border border-red-400/60 text-sm text-red-500">{r ? "Delete the whole series" : "Delete event"}</button>
        </form>
      </div>
    </>
  );
}
