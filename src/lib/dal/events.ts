import { and, asc, eq, gt, inArray, lt, or, isNull, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, withRetry } from "@/db";
import { events, profiles } from "@/db/schema";
import { expandEvents, recurrenceSchema, type EventLike, type Occurrence } from "@/lib/calendar/recurrence";
import { isDateString, isValidTimezone, localToUtc, parseDateString, parseTime } from "@/lib/calendar/timezone";
import { AppError, NotFoundError } from "@/lib/errors";

export const DEFAULT_TIMEZONE = "Asia/Manila";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

export const eventInput = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    notes: z.string().trim().max(2000).optional(),
    kind: z.enum(["event", "fixed"]).default("event"),
    date: z.string().refine(isDateString, "Use a valid date"),
    startTime: time,
    endTime: time,
    recurrence: recurrenceSchema.optional(),
  })
  .refine((v) => v.endTime > v.startTime, { message: "End time must be after the start time", path: ["endTime"] });

export type EventInput = z.input<typeof eventInput>;
const eventId = z.string().uuid();

export async function getOwnerTimezone(ownerId: string): Promise<string> {
  const rows = await withRetry(() => getDb().select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.id, ownerId)).limit(1));
  const tz = rows[0]?.tz;
  return tz && isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
}

function toTimes(data: z.output<typeof eventInput>, tz: string) {
  const { year, month, day } = parseDateString(data.date);
  const s = parseTime(data.startTime);
  const e = parseTime(data.endTime);
  return { startsAt: localToUtc(year, month, day, s.hour, s.minute, tz), endsAt: localToUtc(year, month, day, e.hour, e.minute, tz) };
}

export async function createEvent(ownerId: string, input: EventInput, source: "manual" | "photo" = "manual") {
  const data = eventInput.parse(input);
  const tz = await getOwnerTimezone(ownerId);
  const { startsAt, endsAt } = toTimes(data, tz);
  if (endsAt <= startsAt) throw new AppError("End time must be after the start time");
  const rows = await withRetry(() =>
    getDb()
      .insert(events)
      .values({ ownerId, title: data.title, notes: data.notes, kind: data.kind, startsAt, endsAt, timezone: tz, recurrence: data.recurrence ?? null, source })
      .returning(),
  );
  return rows[0];
}

export async function createEvents(ownerId: string, inputs: EventInput[], source: "manual" | "photo" = "photo") {
  const created = [];
  for (const input of inputs) created.push(await createEvent(ownerId, input, source));
  return created;
}

export async function updateEvent(ownerId: string, id: string, input: EventInput) {
  const data = eventInput.parse(input);
  const tz = await getOwnerTimezone(ownerId);
  const { startsAt, endsAt } = toTimes(data, tz);
  const rows = await withRetry(() =>
    getDb()
      .update(events)
      .set({ title: data.title, notes: data.notes ?? null, kind: data.kind, startsAt, endsAt, timezone: tz, recurrence: data.recurrence ?? null, updatedAt: new Date() })
      .where(and(eq(events.id, eventId.parse(id)), eq(events.ownerId, ownerId)))
      .returning(),
  );
  if (!rows[0]) throw new NotFoundError("Event");
  return rows[0];
}

export async function getEvent(ownerId: string, id: string) {
  const parsed = eventId.safeParse(id);
  if (!parsed.success) return null;
  const rows = await withRetry(() => getDb().select().from(events).where(and(eq(events.id, parsed.data), eq(events.ownerId, ownerId))).limit(1));
  return rows[0] ?? null;
}

export async function deleteEvent(ownerId: string, id: string) {
  await withRetry(() => getDb().delete(events).where(and(eq(events.id, eventId.parse(id)), eq(events.ownerId, ownerId))));
}

// "Skip this one": removes a single occurrence of a recurring event.
export async function skipOccurrence(ownerId: string, id: string, date: string) {
  if (!isDateString(date)) throw new AppError("Invalid date");
  const ev = await getEvent(ownerId, id);
  if (!ev) throw new NotFoundError("Event");
  if (!ev.recurrence) throw new AppError("Only repeating events can skip a date");
  const next = [...new Set([...ev.exceptions, date])];
  await withRetry(() => getDb().update(events).set({ exceptions: next, updatedAt: new Date() }).where(and(eq(events.id, ev.id), eq(events.ownerId, ownerId))));
}

type Row = typeof events.$inferSelect;
const toLike = (r: Row): EventLike => ({
  id: r.id, title: r.title, notes: r.notes, kind: r.kind, startsAt: r.startsAt, endsAt: r.endsAt, timezone: r.timezone, recurrence: r.recurrence, exceptions: r.exceptions,
});

// Occurrences (single and expanded recurring) that overlap [from, to), sorted by start.
export async function listOccurrences(ownerId: string, from: Date, to: Date): Promise<Occurrence[]> {
  const rows = await withRetry(() =>
    getDb()
      .select()
      .from(events)
      .where(
        and(
          eq(events.ownerId, ownerId),
          or(
            and(isNull(events.recurrence), lt(events.startsAt, to), gt(events.endsAt, from)),
            and(isNotNull(events.recurrence), lt(events.startsAt, to)),
          ),
        ),
      )
      .orderBy(asc(events.startsAt)),
  );
  return expandEvents(rows.map(toLike), from, to);
}

export async function countEvents(ownerId: string) {
  const rows = await withRetry(() => getDb().select({ n: sql<number>`count(*)::int` }).from(events).where(eq(events.ownerId, ownerId)));
  return rows[0]?.n ?? 0;
}

const dupKey = (title: string, start: Date, end: Date) => `${title.trim().toLowerCase()}|${start.getTime()}|${end.getTime()}`;

// Saves imported events but skips any that already exist with the same title and times, so re-importing a photo does not duplicate.
export async function createEventsSkippingDuplicates(ownerId: string, inputs: EventInput[], source: "manual" | "photo" = "photo") {
  const tz = await getOwnerTimezone(ownerId);
  const parsed = inputs.map((input) => {
    const data = eventInput.parse(input);
    return { data, ...toTimes(data, tz) };
  });
  const starts = [...new Set(parsed.map((p) => p.startsAt.getTime()))].map((ms) => new Date(ms));
  const existing = starts.length
    ? await withRetry(() =>
        getDb().select({ title: events.title, startsAt: events.startsAt, endsAt: events.endsAt }).from(events).where(and(eq(events.ownerId, ownerId), inArray(events.startsAt, starts))),
      )
    : [];
  const seen = new Set(existing.map((e) => dupKey(e.title, e.startsAt, e.endsAt)));
  let skipped = 0;
  let created = 0;
  for (const p of parsed) {
    const key = dupKey(p.data.title, p.startsAt, p.endsAt);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    await createEvent(ownerId, p.data, source);
    created++;
  }
  return { created, skipped };
}

export async function countEventsBySource(ownerId: string, source: "manual" | "photo") {
  const rows = await withRetry(() => getDb().select({ n: sql<number>`count(*)::int` }).from(events).where(and(eq(events.ownerId, ownerId), eq(events.source, source))));
  return rows[0]?.n ?? 0;
}

export async function deleteEventsBySource(ownerId: string, source: "manual" | "photo") {
  const rows = await withRetry(() => getDb().delete(events).where(and(eq(events.ownerId, ownerId), eq(events.source, source))).returning({ id: events.id }));
  return rows.length;
}
