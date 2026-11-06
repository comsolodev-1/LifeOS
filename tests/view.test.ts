import { describe, expect, it } from "vitest";
import { mondayOf, navigate, parseView, viewTitle, visibleDays } from "../src/lib/calendar/view";

describe("calendar views", () => {
  it("weeks start on Monday", () => {
    expect(mondayOf("2026-11-05")).toBe("2026-11-02"); // Thursday
    expect(mondayOf("2026-11-08")).toBe("2026-11-02"); // Sunday belongs to the week before
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
    expect(visibleDays("week", "2026-11-05")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });

  it("month grid has 42 cells starting on a Monday and contains the whole month", () => {
    const days = visibleDays("month", "2026-11-15");
    expect(days.length).toBe(42);
    expect(days[0]).toBe("2026-10-26");
    expect(days).toContain("2026-11-30");
    const feb = visibleDays("month", "2026-02-10");
    expect(feb[0]).toBe("2026-01-26");
    expect(feb).toContain("2026-02-28");
  });

  it("navigates by view and clamps month ends", () => {
    expect(navigate("day", "2026-12-31", 1)).toBe("2027-01-01");
    expect(navigate("week", "2026-11-05", -1)).toBe("2026-10-29");
    expect(navigate("month", "2026-01-31", 1)).toBe("2026-02-28");
    expect(navigate("month", "2026-01-15", -1)).toBe("2025-12-15");
  });

  it("falls back to week view and builds titles", () => {
    expect(parseView(undefined)).toBe("week");
    expect(parseView("junk")).toBe("week");
    expect(parseView("month")).toBe("month");
    expect(viewTitle("month", "2026-11-05")).toContain("November 2026");
    expect(viewTitle("day", "2026-11-05")).toContain("Thursday");
    expect(viewTitle("week", "2026-11-05")).toContain("Nov 2");
  });
});
