import { describe, expect, it } from "vitest";
import {
  conflictMap, expandEvent, expandEvents, findConflicts, freeSlots, recurrenceSchema, type EventLike, type Recurrence,
} from "../src/lib/calendar/recurrence";
import { addDays, addMonths, isDateString, localDateString, localToUtc, parseDateString, utcToLocalParts, weekdayOf } from "../src/lib/calendar/timezone";

const MNL = "Asia/Manila";
const NY = "America/New_York";
const iso = (d: Date) => d.toISOString();

describe("timezone conversion", () => {
  it("converts Manila wall clock to UTC and back (UTC+8, no DST)", () => {
    expect(iso(localToUtc(2026, 11, 5, 9, 0, MNL))).toBe("2026-11-05T01:00:00.000Z");
    expect(iso(localToUtc(2026, 7, 1, 9, 0, MNL))).toBe("2026-07-01T01:00:00.000Z");
    expect(utcToLocalParts(new Date("2026-11-05T16:30:00Z"), MNL)).toMatchObject({ year: 2026, month: 11, day: 6, hour: 0, minute: 30, weekday: 5 });
  });

  it("handles daylight saving (New York)", () => {
    expect(iso(localToUtc(2026, 3, 7, 9, 0, NY))).toBe("2026-03-07T14:00:00.000Z");
    expect(iso(localToUtc(2026, 3, 9, 9, 0, NY))).toBe("2026-03-09T13:00:00.000Z");
  });

  it("moves a skipped spring-forward time forward, and uses the first of a repeated fall-back time", () => {
    expect(iso(localToUtc(2026, 3, 8, 2, 30, NY))).toBe("2026-03-08T07:30:00.000Z");
    expect(iso(localToUtc(2026, 11, 1, 1, 30, NY))).toBe("2026-11-01T05:30:00.000Z");
  });

  it("an instant near midnight lands on the right local date", () => {
    expect(localDateString(new Date("2026-11-05T15:59:00Z"), MNL)).toBe("2026-11-05");
    expect(localDateString(new Date("2026-11-05T16:00:00Z"), MNL)).toBe("2026-11-06");
  });

  it("does calendar arithmetic on date strings", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(weekdayOf("2026-11-05")).toBe(4);
    expect(isDateString("2026-02-30")).toBe(false);
    expect(() => parseDateString("nope")).toThrow();
  });
});

function ev(partial: Omit<Partial<EventLike>, "startsAt" | "endsAt"> & { startsAt: string; endsAt: string }): EventLike {
  return { id: "e1", title: "Class", kind: "fixed", timezone: MNL, recurrence: null, exceptions: [], ...partial, startsAt: new Date(partial.startsAt), endsAt: new Date(partial.endsAt) };
}
const rule = (r: Partial<Recurrence> & Pick<Recurrence, "freq">): Recurrence => ({ interval: 1, ...r });
const range = (a: string, b: string) => [new Date(a), new Date(b)] as const;
const dates = (occs: { localDate: string }[]) => occs.map((o) => o.localDate);

describe("recurring events", () => {
  // Thursday 2026-11-05, 09:00-10:30 Manila
  const base = { startsAt: "2026-11-05T01:00:00Z", endsAt: "2026-11-05T02:30:00Z" };

  it("returns a single event only when it overlaps the range", () => {
    expect(expandEvent(ev(base), ...range("2026-11-05T00:00:00Z", "2026-11-06T00:00:00Z")).length).toBe(1);
    expect(expandEvent(ev(base), ...range("2026-11-06T00:00:00Z", "2026-11-07T00:00:00Z"))).toEqual([]);
    expect(expandEvent(ev(base), ...range("2026-11-05T02:30:00Z", "2026-11-06T00:00:00Z"))).toEqual([]);
  });

  it("expands daily series with an interval", () => {
    const e = ev({ ...base, recurrence: rule({ freq: "daily", interval: 2 }) });
    expect(dates(expandEvent(e, ...range("2026-11-04T00:00:00Z", "2026-11-12T00:00:00Z")))).toEqual(["2026-11-05", "2026-11-07", "2026-11-09", "2026-11-11"]);
  });

  it("expands weekly series on chosen weekdays, starting from the first occurrence", () => {
    const e = ev({ ...base, recurrence: rule({ freq: "weekly", byWeekday: [1, 3, 5] }) });
    expect(dates(expandEvent(e, ...range("2026-11-01T00:00:00Z", "2026-11-16T00:00:00Z")))).toEqual(["2026-11-06", "2026-11-09", "2026-11-11", "2026-11-13"]);
  });

  it("defaults weekly to the weekday of the first occurrence, and supports every other week", () => {
    const weekly = ev({ ...base, recurrence: rule({ freq: "weekly" }) });
    expect(dates(expandEvent(weekly, ...range("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z")))).toEqual(["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"]);
    const biweekly = ev({ ...base, recurrence: rule({ freq: "weekly", interval: 2 }) });
    expect(dates(expandEvent(biweekly, ...range("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z")))).toEqual(["2026-11-05", "2026-11-19"]);
  });

  it("monthly skips months without that day", () => {
    const e = ev({ startsAt: "2026-01-31T01:00:00Z", endsAt: "2026-01-31T02:00:00Z", recurrence: rule({ freq: "monthly" }) });
    expect(dates(expandEvent(e, ...range("2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z")))).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
  });

  it("respects until, count and exceptions", () => {
    const until = ev({ ...base, recurrence: rule({ freq: "daily", until: "2026-11-07" }) });
    expect(dates(expandEvent(until, ...range("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z")))).toEqual(["2026-11-05", "2026-11-06", "2026-11-07"]);
    const count = ev({ ...base, recurrence: rule({ freq: "daily", count: 2 }) });
    expect(dates(expandEvent(count, ...range("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z")))).toEqual(["2026-11-05", "2026-11-06"]);
    const skipped = ev({ ...base, recurrence: rule({ freq: "daily", count: 3 }), exceptions: ["2026-11-06"] });
    expect(dates(expandEvent(skipped, ...range("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z")))).toEqual(["2026-11-05", "2026-11-07"]);
  });

  it("finds occurrences in a range long after the series started", () => {
    const e = ev({ startsAt: "2024-01-01T01:00:00Z", endsAt: "2024-01-01T02:00:00Z", recurrence: rule({ freq: "daily" }) });
    expect(expandEvent(e, ...range("2026-11-05T00:00:00Z", "2026-11-08T00:00:00Z")).length).toBe(3);
  });

  it("keeps the same duration and local time in Manila all year", () => {
    const e = ev({ startsAt: "2026-01-01T01:00:00Z", endsAt: "2026-01-01T02:30:00Z", recurrence: rule({ freq: "weekly" }) });
    const occs = expandEvent(e, ...range("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"));
    expect(occs.length).toBeGreaterThan(40);
    for (const o of occs) {
      expect(utcToLocalParts(o.start, MNL)).toMatchObject({ hour: 9, minute: 0, weekday: 4 });
      expect(o.end.getTime() - o.start.getTime()).toBe(90 * 60_000);
    }
  });

  it("keeps the local wall-clock time across a daylight-saving change (New York)", () => {
    // 9:00-10:00 New York time, created on 2026-03-06 (EST)
    const e = ev({ startsAt: "2026-03-06T14:00:00Z", endsAt: "2026-03-06T15:00:00Z", timezone: NY, recurrence: rule({ freq: "daily" }) });
    const occs = expandEvent(e, ...range("2026-03-06T00:00:00Z", "2026-03-11T00:00:00Z"));
    expect(occs.map((o) => iso(o.start))).toEqual([
      "2026-03-06T14:00:00.000Z", "2026-03-07T14:00:00.000Z", "2026-03-08T13:00:00.000Z", "2026-03-09T13:00:00.000Z", "2026-03-10T13:00:00.000Z",
    ]);
    for (const o of occs) expect(utcToLocalParts(o.start, NY).hour).toBe(9);
  });

  it("validates recurrence rules", () => {
    expect(recurrenceSchema.safeParse({ freq: "weekly" }).data?.interval).toBe(1);
    expect(recurrenceSchema.safeParse({ freq: "weekly", until: "2026-12-01", count: 3 }).success).toBe(false);
    expect(recurrenceSchema.safeParse({ freq: "yearly" }).success).toBe(false);
    expect(recurrenceSchema.safeParse({ freq: "weekly", byWeekday: [7] }).success).toBe(false);
    expect(recurrenceSchema.safeParse({ freq: "daily", until: "2026-02-30" }).success).toBe(false);
  });
});

describe("conflicts and free time", () => {
  const make = (id: string, s: string, e: string) => expandEvent(ev({ id, startsAt: s, endsAt: e }), new Date("2026-01-01"), new Date("2027-01-01"))[0];
  const a = make("a", "2026-11-05T01:00:00Z", "2026-11-05T02:00:00Z");
  const b = make("b", "2026-11-05T01:30:00Z", "2026-11-05T02:30:00Z");
  const c = make("c", "2026-11-05T02:30:00Z", "2026-11-05T03:00:00Z");

  it("finds overlaps but not back-to-back events", () => {
    const pairs = findConflicts([c, a, b]);
    expect(pairs.map(([x, y]) => [x.eventId, y.eventId])).toEqual([["a", "b"]]);
    expect(conflictMap([a, b, c]).get("a@2026-11-05")?.map((o) => o.eventId)).toEqual(["b"]);
    expect(conflictMap([a, b, c]).has("c@2026-11-05")).toBe(false);
  });

  it("finds three-way overlaps", () => {
    const big = make("big", "2026-11-05T00:00:00Z", "2026-11-05T04:00:00Z");
    expect(findConflicts([a, b, big]).length).toBe(3);
  });

  it("computes free slots between events", () => {
    const slots = freeSlots([a, b, c], new Date("2026-11-05T00:00:00Z"), new Date("2026-11-05T05:00:00Z"), 30);
    expect(slots.map((s) => [iso(s.start), iso(s.end)])).toEqual([
      ["2026-11-05T00:00:00.000Z", "2026-11-05T01:00:00.000Z"],
      ["2026-11-05T03:00:00.000Z", "2026-11-05T05:00:00.000Z"],
    ]);
    expect(freeSlots([], new Date("2026-11-05T00:00:00Z"), new Date("2026-11-05T00:20:00Z"), 30)).toEqual([]);
  });

  it("sorts expanded events from several series", () => {
    const x = ev({ id: "x", startsAt: "2026-11-05T05:00:00Z", endsAt: "2026-11-05T06:00:00Z" });
    const y = ev({ id: "y", startsAt: "2026-11-05T01:00:00Z", endsAt: "2026-11-05T02:00:00Z" });
    expect(expandEvents([x, y], new Date("2026-11-05T00:00:00Z"), new Date("2026-11-06T00:00:00Z")).map((o) => o.eventId)).toEqual(["y", "x"]);
  });
});
