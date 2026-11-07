import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { __setDbForTests } from "../src/db";
import * as schema from "../src/db/schema";
import { conflictMap } from "../src/lib/calendar/recurrence";
import { countEventsBySource, createEvent, createEvents, createEventsSkippingDuplicates, deleteEvent, deleteEventsBySource, getEvent, getOwnerTimezone, listOccurrences, skipOccurrence, updateEvent } from "../src/lib/dal/events";
import { AppError, NotFoundError } from "../src/lib/errors";

let A: string;
let B: string;
let C: string;
const d = (s: string) => new Date(s);

beforeAll(async () => {
  const client = new PGlite();
  for (const f of readdirSync("drizzle").filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(path.join("drizzle", f), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await client.exec(stmt);
  }
  const db = drizzle(client, { schema });
  __setDbForTests(db);
  const [a, b, c] = await db.insert(schema.profiles).values([{ email: "a@example.com" }, { email: "b@example.com" }, { email: "c@example.com", timezone: "America/New_York" }]).returning();
  A = a.id;
  B = b.id;
  C = c.id;
  await db.update(schema.profiles).set({ timezone: "Not/AZone" }).where(eq(schema.profiles.email, "b@example.com"));
});

const base = { title: "Math 101", kind: "fixed" as const, date: "2026-11-05", startTime: "09:00", endTime: "10:30" };

describe("events", () => {
  it("stores UTC and uses the owner's timezone (default Manila)", async () => {
    expect(await getOwnerTimezone(A)).toBe("Asia/Manila");
    const e = await createEvent(A, base);
    expect(e.startsAt.toISOString()).toBe("2026-11-05T01:00:00.000Z");
    expect(e.endsAt.toISOString()).toBe("2026-11-05T02:30:00.000Z");
    expect(e.timezone).toBe("Asia/Manila");
  });

  it("falls back to Manila if the stored timezone is invalid, and honours another valid one", async () => {
    expect(await getOwnerTimezone(B)).toBe("Asia/Manila");
    const e = await createEvent(C, { ...base, date: "2026-07-01" });
    expect(e.startsAt.toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });

  it("rejects bad input", async () => {
    await expect(createEvent(A, { ...base, endTime: "09:00" })).rejects.toThrow();
    await expect(createEvent(A, { ...base, startTime: "9:00" })).rejects.toThrow();
    await expect(createEvent(A, { ...base, date: "2026-02-30" })).rejects.toThrow();
    await expect(createEvent(A, { ...base, title: "  " })).rejects.toThrow();
    await expect(createEvent(A, { ...base, recurrence: { freq: "weekly", interval: 1, until: "2026-12-01", count: 2 } })).rejects.toThrow();
  });

  it("isolates owners for read, update, delete and skip", async () => {
    const e = await createEvent(A, { ...base, title: "Private", recurrence: { freq: "daily", interval: 1 } });
    expect(await getEvent(B, e.id)).toBeNull();
    await expect(updateEvent(B, e.id, base)).rejects.toBeInstanceOf(NotFoundError);
    await expect(skipOccurrence(B, e.id, "2026-11-06")).rejects.toBeInstanceOf(NotFoundError);
    await deleteEvent(B, e.id);
    expect(await getEvent(A, e.id)).not.toBeNull();
    const seen = await listOccurrences(B, d("2026-11-01T00:00:00Z"), d("2026-12-01T00:00:00Z"));
    expect(seen.map((o) => o.title)).not.toContain("Private");
    await expect(getEvent(A, "not-a-uuid")).resolves.toBeNull();
  });

  it("expands recurring events in a range, skips a single date, and edits a series", async () => {
    const e = await createEvent(A, { ...base, title: "Series", date: "2026-12-07", recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 3] } });
    const range = [d("2026-12-01T00:00:00Z"), d("2026-12-20T00:00:00Z")] as const;
    const own = async () => (await listOccurrences(A, ...range)).filter((o) => o.eventId === e.id).map((o) => o.localDate);
    expect(await own()).toEqual(["2026-12-07", "2026-12-09", "2026-12-14", "2026-12-16"]);
    await skipOccurrence(A, e.id, "2026-12-09");
    expect(await own()).toEqual(["2026-12-07", "2026-12-14", "2026-12-16"]);
    await expect(skipOccurrence(A, (await createEvent(A, base)).id, "2026-11-05")).rejects.toBeInstanceOf(AppError);
    await updateEvent(A, e.id, { ...base, title: "Series v2", date: "2026-12-07", startTime: "13:00", endTime: "14:00", recurrence: { freq: "weekly", interval: 1, byWeekday: [1] } });
    const after = (await listOccurrences(A, ...range)).filter((o) => o.eventId === e.id);
    expect(after.map((o) => o.localDate)).toEqual(["2026-12-07", "2026-12-14"]);
    expect(after[0].title).toBe("Series v2");
    expect(after[0].start.toISOString()).toBe("2026-12-07T05:00:00.000Z");
  });

  it("finds events that straddle the range edges and ignores ones outside", async () => {
    await createEvent(A, { ...base, title: "Edge", date: "2027-03-10", startTime: "08:00", endTime: "09:00" });
    const inside = await listOccurrences(A, d("2027-03-10T00:30:00Z"), d("2027-03-10T00:45:00Z"));
    expect(inside.map((o) => o.title)).toContain("Edge");
    const outside = await listOccurrences(A, d("2027-03-11T00:00:00Z"), d("2027-03-12T00:00:00Z"));
    expect(outside.map((o) => o.title)).not.toContain("Edge");
  });

  it("detects conflicts between stored events and creates many at once", async () => {
    const created = await createEvents(C, [
      { ...base, title: "X", date: "2027-01-12", startTime: "10:00", endTime: "11:00" },
      { ...base, title: "Y", date: "2027-01-12", startTime: "10:30", endTime: "11:30" },
      { ...base, title: "Z", date: "2027-01-12", startTime: "11:30", endTime: "12:00" },
    ]);
    expect(created.every((e) => e.source === "photo")).toBe(true);
    const occs = await listOccurrences(C, d("2027-01-12T00:00:00Z"), d("2027-01-13T12:00:00Z"));
    const conflicts = conflictMap(occs);
    const keyOf = (t: string) => `${occs.find((o) => o.title === t)?.eventId}@2027-01-12`;
    expect(conflicts.get(keyOf("X"))?.map((o) => o.title)).toEqual(["Y"]);
    expect(conflicts.has(keyOf("Z"))).toBe(false);
  });
});

describe("photo import safety", () => {
  const item = (title: string, startTime = "09:00", endTime = "10:00") => ({ title, kind: "fixed" as const, date: "2027-02-02", startTime, endTime });

  it("skips events that already exist, including repeats inside the same batch", async () => {
    const first = await createEventsSkippingDuplicates(C, [item("History Lecture"), item("Lab", "11:00", "12:00"), item("history lecture")]);
    expect(first).toEqual({ created: 2, skipped: 1 });
    const again = await createEventsSkippingDuplicates(C, [item("History Lecture"), item("Lab", "11:00", "12:00"), item("New thing", "14:00", "15:00")]);
    expect(again).toEqual({ created: 1, skipped: 2 });
    const occs = await listOccurrences(C, d("2027-02-02T00:00:00Z"), d("2027-02-03T12:00:00Z"));
    expect(occs.filter((o) => o.title.toLowerCase() === "history lecture").length).toBe(1);
  });

  it("treats the same title at a different time or for another owner as new", async () => {
    expect(await createEventsSkippingDuplicates(C, [item("History Lecture", "10:00", "11:00")])).toEqual({ created: 1, skipped: 0 });
    expect(await createEventsSkippingDuplicates(A, [item("History Lecture")])).toEqual({ created: 1, skipped: 0 });
  });

  it("deletes only the owner's photo-imported events", async () => {
    const manual = await createEvent(C, { ...item("Hand made"), date: "2027-03-03" });
    const before = await countEventsBySource(C, "photo");
    expect(before).toBeGreaterThan(0);
    const otherBefore = await countEventsBySource(A, "photo");
    expect(await deleteEventsBySource(C, "photo")).toBe(before);
    expect(await countEventsBySource(C, "photo")).toBe(0);
    expect(await countEventsBySource(A, "photo")).toBe(otherBefore);
    expect(await getEvent(C, manual.id)).not.toBeNull();
  });
});
