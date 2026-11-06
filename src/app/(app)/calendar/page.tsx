import Link from "next/link";
import { AlertTriangle, ChevronLeft, ChevronRight, Camera, Plus } from "lucide-react";
import { EmptyState, ErrorState, NotConfigured, PageHeader } from "@/components/ui";
import { isDbConfigured } from "@/db";
import { conflictMap, freeSlots, occurrenceKey, type Occurrence } from "@/lib/calendar/recurrence";
import { addDays, formatTime, isDateString, localDateString, parseDateString, startOfLocalDay } from "@/lib/calendar/timezone";
import { dayLabel, navigate, parseView, viewTitle, visibleDays, type CalendarView } from "@/lib/calendar/view";
import { getOwnerTimezone, listOccurrences } from "@/lib/dal/events";
import { requireOwnerId } from "@/lib/session";

export const dynamic = "force-dynamic";

const WEEKDAY_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function EventRow({ o, tz, clashes }: { o: Occurrence; tz: string; clashes: Map<string, Occurrence[]> }) {
  const clash = clashes.get(occurrenceKey(o));
  return (
    <li>
      <Link href={`/calendar/event/${o.eventId}?date=${o.localDate}`} className="block rounded-xl border border-line bg-surface p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate font-medium">{o.title}</span>
          <span className="shrink-0 text-xs text-muted">{formatTime(o.start, tz)} to {formatTime(o.end, tz)}</span>
        </div>
        <p className="text-xs text-muted">{o.kind === "fixed" ? "fixed" : "event"}{o.recurring ? " · repeats" : ""}</p>
        {clash ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle size={12} aria-hidden /> Overlaps with {clash.map((c) => c.title).join(", ")}
          </p>
        ) : null}
      </Link>
    </li>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const p = await searchParams;
  if (!isDbConfigured()) {
    return (
      <>
        <PageHeader title="Calendar" />
        <NotConfigured vars={["DATABASE_URL"]} />
      </>
    );
  }

  let data: { tz: string; today: string; occs: Occurrence[] } | null = null;
  const view: CalendarView = parseView(p.view);
  let date = "";
  try {
    const ownerId = await requireOwnerId();
    const tz = await getOwnerTimezone(ownerId);
    const today = localDateString(new Date(), tz);
    date = p.date && isDateString(p.date) ? p.date : today;
    const days = visibleDays(view, date);
    const occs = await listOccurrences(ownerId, startOfLocalDay(days[0], tz), startOfLocalDay(addDays(days[days.length - 1], 1), tz));
    data = { tz, today, occs };
  } catch {
    data = null;
  }

  const tabs: CalendarView[] = ["day", "week", "month"];
  const link = (v: CalendarView, d: string) => `/calendar?view=${v}&date=${d}`;

  return (
    <>
      <PageHeader title="Calendar" />
      {data === null ? (
        <ErrorState message="Could not load your calendar. The database may be waking up; refresh in a few seconds." />
      ) : (
        (() => {
          const { tz, today, occs } = data;
          const clashes = conflictMap(occs);
          const byDay = new Map<string, Occurrence[]>();
          for (const o of occs) {
            const key = localDateString(o.start, tz);
            byDay.set(key, [...(byDay.get(key) ?? []), o]);
          }
          const days = visibleDays(view, date);
          return (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Link href="/calendar/new" className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-paper">
                  <Plus size={16} aria-hidden /> Add event
                </Link>
                <Link href="/calendar/import" className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line text-sm">
                  <Camera size={16} aria-hidden /> Import photo
                </Link>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Link href={link(view, navigate(view, date, -1))} aria-label="Previous" className="flex h-11 w-11 items-center justify-center rounded-lg border border-line">
                  <ChevronLeft size={18} aria-hidden />
                </Link>
                <div className="text-center">
                  <p className="font-medium">{viewTitle(view, date)}</p>
                  <Link href={link(view, today)} className="text-xs text-accent">Today</Link>
                </div>
                <Link href={link(view, navigate(view, date, 1))} aria-label="Next" className="flex h-11 w-11 items-center justify-center rounded-lg border border-line">
                  <ChevronRight size={18} aria-hidden />
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-2" role="tablist">
                {tabs.map((t) => (
                  <Link key={t} href={link(t, date)} aria-current={t === view ? "page" : undefined}
                    className={`flex min-h-11 items-center justify-center rounded-lg border text-sm capitalize ${t === view ? "border-accent text-accent" : "border-line text-muted"}`}>
                    {t}
                  </Link>
                ))}
              </div>

              {view === "month" ? (
                <div>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
                    {WEEKDAY_HEADS.map((h) => <span key={h}>{h}</span>)}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {days.map((d) => {
                      const list = byDay.get(d) ?? [];
                      const inMonth = parseDateString(d).month === parseDateString(date).month;
                      const hasClash = list.some((o) => clashes.has(occurrenceKey(o)));
                      return (
                        <Link key={d} href={link("day", d)} aria-label={`${dayLabel(d)}, ${list.length} events`}
                          className={`flex min-h-14 flex-col items-center rounded-lg border p-1 text-sm ${d === today ? "border-accent" : "border-line"} ${inMonth ? "" : "opacity-40"}`}>
                          <span>{parseDateString(d).day}</span>
                          {list.length ? <span className="mt-0.5 rounded-full bg-accent/15 px-1.5 text-[10px] text-accent">{list.length}</span> : null}
                          {hasClash ? <AlertTriangle size={10} className="text-amber-600" aria-hidden /> : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {view === "week" ? (
                <div className="space-y-4">
                  {days.map((d) => (
                    <section key={d}>
                      <h2 className={`mb-1 text-sm font-medium ${d === today ? "text-accent" : ""}`}>
                        <Link href={link("day", d)}>{dayLabel(d)}{d === today ? " (today)" : ""}</Link>
                      </h2>
                      {(byDay.get(d) ?? []).length === 0 ? (
                        <p className="text-sm text-muted">Nothing scheduled</p>
                      ) : (
                        <ul className="space-y-2">{(byDay.get(d) ?? []).map((o) => <EventRow key={occurrenceKey(o)} o={o} tz={tz} clashes={clashes} />)}</ul>
                      )}
                    </section>
                  ))}
                </div>
              ) : null}

              {view === "day" ? (
                (() => {
                  const list = byDay.get(date) ?? [];
                  const free = freeSlots(list, new Date(startOfLocalDay(date, tz).getTime() + 7 * 3_600_000), new Date(startOfLocalDay(date, tz).getTime() + 21 * 3_600_000), 30);
                  return (
                    <div className="space-y-4">
                      {list.length === 0 ? <EmptyState title="Nothing scheduled" body="Add an event or import a schedule photo." /> : (
                        <ul className="space-y-2">{list.map((o) => <EventRow key={occurrenceKey(o)} o={o} tz={tz} clashes={clashes} />)}</ul>
                      )}
                      <section>
                        <h2 className="mb-1 text-sm font-medium">Free time (7 AM to 9 PM)</h2>
                        {free.length === 0 ? <p className="text-sm text-muted">No free gaps of 30 minutes or more.</p> : (
                          <ul className="space-y-1 text-sm text-muted">
                            {free.map((f) => <li key={f.start.toISOString()}>{formatTime(f.start, tz)} to {formatTime(f.end, tz)}</li>)}
                          </ul>
                        )}
                      </section>
                    </div>
                  );
                })()
              ) : null}
            </div>
          );
        })()
      )}
    </>
  );
}
