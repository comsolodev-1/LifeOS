import { z } from "zod";
import { addDays, dateString, isDateString, localToUtc, parseDateString, utcToLocalParts, weekdayOf } from "./timezone";

export const recurrenceSchema = z
  .object({
    freq: z.enum(["daily", "weekly", "monthly"]),
    interval: z.number().int().min(1).max(52).default(1),
    byWeekday: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    until: z.string().refine(isDateString, "Use YYYY-MM-DD").optional(),
    count: z.number().int().min(1).max(1000).optional(),
  })
  .refine((r) => !(r.until && r.count), "Use either an end date or a count, not both");

export type Recurrence = z.infer<typeof recurrenceSchema>;

export interface EventLike {
  id: string;
  title: string;
  notes?: string | null;
  kind: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  recurrence: Recurrence | null;
  exceptions: string[];
}

export interface Occurrence {
  eventId: string;
  title: string;
  notes?: string | null;
  kind: string;
  start: Date;
  end: Date;
  localDate: string; // date in the event's own zone
  recurring: boolean;
}

const MAX_STEPS = 20_000;

// Local dates (in the event's zone) on which a recurring series falls, in order, starting at the first occurrence.
function* seriesDates(first: string, rule: Recurrence): Generator<string> {
  const { year, month, day } = parseDateString(first);
  if (rule.freq === "daily") {
    for (let k = 0; k < MAX_STEPS; k++) yield addDays(first, k * rule.interval);
  } else if (rule.freq === "weekly") {
    const days = [...new Set(rule.byWeekday ?? [weekdayOf(first)])].sort((a, b) => a - b);
    const weekStart = addDays(first, -weekdayOf(first)); // Sunday of the first week
    for (let w = 0; w < MAX_STEPS; w++) {
      for (const wd of days) {
        const d = addDays(weekStart, w * rule.interval * 7 + wd);
        if (d >= first) yield d;
      }
    }
  } else {
    // Same day of the month; months that do not have that day (e.g. the 31st) are skipped.
    for (let m = 0; m < MAX_STEPS; m++) {
      const total = month - 1 + m * rule.interval;
      const y = year + Math.floor(total / 12);
      const mo = (total % 12) + 1;
      const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      if (day <= dim) yield dateString(y, mo, day);
    }
  }
}

// Expands one event into the occurrences that overlap [from, to). Recurring events keep their local wall-clock time
// in the event's own zone, so a 9:00 class stays at 9:00 across daylight-saving changes.
export function expandEvent(ev: EventLike, from: Date, to: Date): Occurrence[] {
  const base = { eventId: ev.id, title: ev.title, notes: ev.notes, kind: ev.kind };
  const durationMs = ev.endsAt.getTime() - ev.startsAt.getTime();
  const startParts = utcToLocalParts(ev.startsAt, ev.timezone);
  const firstDate = dateString(startParts.year, startParts.month, startParts.day);

  if (!ev.recurrence) {
    if (ev.endsAt <= from || ev.startsAt >= to) return [];
    return [{ ...base, start: ev.startsAt, end: ev.endsAt, localDate: firstDate, recurring: false }];
  }

  const rule = ev.recurrence;
  const out: Occurrence[] = [];
  let n = 0;
  for (const date of seriesDates(firstDate, rule)) {
    if (rule.until && date > rule.until) break;
    n++;
    if (rule.count && n > rule.count) break;
    const { year, month, day } = parseDateString(date);
    const start = localToUtc(year, month, day, startParts.hour, startParts.minute, ev.timezone);
    if (start >= to) break;
    const end = new Date(start.getTime() + durationMs);
    if (end <= from || ev.exceptions.includes(date)) continue;
    out.push({ ...base, start, end, localDate: date, recurring: true });
  }
  return out;
}

export function expandEvents(events: EventLike[], from: Date, to: Date): Occurrence[] {
  return events.flatMap((e) => expandEvent(e, from, to)).sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
}

export const occurrenceKey = (o: Pick<Occurrence, "eventId" | "localDate">) => `${o.eventId}@${o.localDate}`;

// Pairs of occurrences that overlap. Back-to-back events (one ends exactly when the next starts) do not conflict.
export function findConflicts(occs: Occurrence[]): [Occurrence, Occurrence][] {
  const sorted = [...occs].sort((a, b) => a.start.getTime() - b.start.getTime());
  const pairs: [Occurrence, Occurrence][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) pairs.push([sorted[i], sorted[j]]);
  }
  return pairs;
}

export function conflictMap(occs: Occurrence[]): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>();
  for (const [a, b] of findConflicts(occs)) {
    map.set(occurrenceKey(a), [...(map.get(occurrenceKey(a)) ?? []), b]);
    map.set(occurrenceKey(b), [...(map.get(occurrenceKey(b)) ?? []), a]);
  }
  return map;
}

// Free gaps of at least minMinutes inside [windowStart, windowEnd].
export function freeSlots(occs: Occurrence[], windowStart: Date, windowEnd: Date, minMinutes = 30): { start: Date; end: Date }[] {
  const busy = occs
    .map((o) => [Math.max(o.start.getTime(), windowStart.getTime()), Math.min(o.end.getTime(), windowEnd.getTime())] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of busy) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const slots: { start: Date; end: Date }[] = [];
  let cursor = windowStart.getTime();
  for (const [s, e] of merged) {
    if (s - cursor >= minMinutes * 60_000) slots.push({ start: new Date(cursor), end: new Date(s) });
    cursor = Math.max(cursor, e);
  }
  if (windowEnd.getTime() - cursor >= minMinutes * 60_000) slots.push({ start: new Date(cursor), end: windowEnd });
  return slots;
}

