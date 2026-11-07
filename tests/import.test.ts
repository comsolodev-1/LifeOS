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
