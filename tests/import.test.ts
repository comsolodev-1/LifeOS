import { describe, expect, it } from "vitest";
import { buildImportInputs } from "../src/lib/calendar/import";

const today = "2026-11-06"; // Friday
const item = { title: "History Lecture", days: [] as number[], date: "2026-11-09", startTime: "09:00", endTime: "10:00" };

describe("buildImportInputs", () => {
  it("keeps a dated row as a one-off event", () => {
    const { inputs } = buildImportInputs([item], undefined, today);
    expect(inputs?.[0]).toMatchObject({ title: "History Lecture", kind: "fixed", date: "2026-11-09", recurrence: undefined });
  });

  it("repeats weekly from the row's own date when the weekday matches", () => {
    const { inputs } = buildImportInputs([{ ...item, days: [1] }], "2026-12-18", today);
    expect(inputs?.[0].date).toBe("2026-11-09");
    expect(inputs?.[0].recurrence).toEqual({ freq: "weekly", interval: 1, byWeekday: [1], until: "2026-12-18" });
  });

  it("starts a dateless weekly timetable on the next matching weekday from today", () => {
    const { inputs } = buildImportInputs([{ ...item, date: "", days: [1, 3] }], undefined, today);
    expect(inputs?.[0].date).toBe("2026-11-09"); // Monday after Friday 6 Nov
    expect(inputs?.[0].recurrence).toMatchObject({ byWeekday: [1, 3] });
    const fri = buildImportInputs([{ ...item, date: "", days: [5] }], undefined, today).inputs?.[0];
    expect(fri?.date).toBe("2026-11-06"); // today counts
  });

  it("falls back to the next matching weekday when the row's date is a different weekday", () => {
    const { inputs } = buildImportInputs([{ ...item, date: "2026-11-10", days: [1] }], undefined, today);
    expect(inputs?.[0].date).toBe("2026-11-09");
  });

  it("ignores an until date that is before the start", () => {
    const { inputs } = buildImportInputs([{ ...item, days: [1] }], "2026-11-01", today);
    expect(inputs?.[0].recurrence).toEqual({ freq: "weekly", interval: 1, byWeekday: [1] });
  });

  it("reports the first bad row by number and saves nothing", () => {
    const r = buildImportInputs([item, { ...item, title: "Lab", startTime: "10:00", endTime: "09:00" }, { ...item, title: "" }], undefined, today);
    expect(r.inputs).toBeUndefined();
    expect(r.error).toMatch(/^Row 2 \(Lab\): End time must be after/);
    expect(buildImportInputs([{ ...item, startTime: "" }], undefined, today).error).toMatch(/Row 1/);
    expect(buildImportInputs([{ ...item, date: "2026-02-30" }], undefined, today).error).toMatch(/Row 1/);
  });
});

import { mergeCandidates, parseStoredImport, rowKey, serializeImport, toRows } from "../src/lib/calendar/import-state";
import type { Candidate } from "../src/lib/calendar/extraction";

const cand = (title: string, date = "2026-11-09", startTime = "09:00", flags: Candidate["flags"] = []): Candidate => ({
  id: crypto.randomUUID(), title, days: [], date, startTime, endTime: "10:00", flags,
});

describe("import review state", () => {
  it("starts unflagged rows selected and flagged rows unselected", () => {
    const rows = toRows([cand("A"), cand("B", "2026-11-09", "10:00", ["title"])]);
    expect(rows.map((r) => r.include)).toEqual([true, false]);
    expect(rows.every((r) => r.repeat === false)).toBe(true);
  });

  it("merges a re-scan by adding only events not already listed", () => {
    const rows = toRows([cand("History"), cand("Lab", "2026-11-10")]);
    const merged = mergeCandidates(rows, [cand("history  "), cand("Lab", "2026-11-10"), cand("New one", "2026-11-11", "14:00")]);
    expect(merged.added).toBe(1);
    expect(merged.rows.map((r) => r.title)).toEqual(["History", "Lab", "New one"]);
    expect(mergeCandidates(merged.rows, [cand("New one", "2026-11-11", "14:00")]).added).toBe(0);
    expect(rowKey(cand("X")).startsWith("x|")).toBe(true);
  });

  it("round-trips the review list through storage, keeping the owner's edits", () => {
    const rows = toRows([cand("History"), cand("Lab", "2026-11-10", "11:00", ["endTime"])]);
    rows[0].include = false;
    rows[0].repeat = true;
    const back = parseStoredImport(serializeImport({ rows, until: "2026-12-18", info: "ok" }));
    expect(back?.rows).toEqual(rows);
    expect(back?.until).toBe("2026-12-18");
  });

  it("ignores missing, damaged, tampered or oversized stored data", () => {
    const good = JSON.parse(serializeImport({ rows: toRows([cand("A")]), until: "", info: null }));
    expect(parseStoredImport(null)).toBeNull();
    expect(parseStoredImport("not json")).toBeNull();
    expect(parseStoredImport(JSON.stringify({ ...good, v: 2 }))).toBeNull();
    expect(parseStoredImport(JSON.stringify({ ...good, rows: [] }))).toBeNull();
    expect(parseStoredImport(JSON.stringify({ ...good, rows: [{ ...good.rows[0], days: [9] }] }))).toBeNull();
    expect(parseStoredImport(JSON.stringify({ ...good, rows: [{ ...good.rows[0], title: "x".repeat(500) }] }))).toBeNull();
    expect(parseStoredImport(JSON.stringify({ ...good, rows: Array.from({ length: 81 }, () => good.rows[0]) }))).toBeNull();
  });
});
