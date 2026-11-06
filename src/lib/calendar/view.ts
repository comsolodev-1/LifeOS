import { addDays, addMonths, parseDateString, weekdayOf } from "./timezone";

export type CalendarView = "day" | "week" | "month";

export function parseView(v: string | undefined): CalendarView {
  return v === "day" || v === "month" ? v : "week";
}

export const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

// The dates a view displays. Weeks start on Monday; the month grid always has 6 rows.
export function visibleDays(view: CalendarView, date: string): string[] {
  if (view === "day") return [date];
  if (view === "week") {
    const start = mondayOf(date);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const { year, month } = parseDateString(date);
  const start = mondayOf(`${year}-${String(month).padStart(2, "0")}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function navigate(view: CalendarView, date: string, dir: -1 | 1): string {
  return view === "day" ? addDays(date, dir) : view === "week" ? addDays(date, 7 * dir) : addMonths(date, dir);
}

export function viewTitle(view: CalendarView, date: string): string {
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => {
    const { year, month, day } = parseDateString(d);
    return new Intl.DateTimeFormat("en-PH", { ...o, timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
  };
  if (view === "day") return fmt(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (view === "month") return fmt(date, { month: "long", year: "numeric" });
  const days = visibleDays("week", date);
  return `${fmt(days[0], { month: "short", day: "numeric" })} to ${fmt(days[6], { month: "short", day: "numeric", year: "numeric" })}`;
}

export function dayLabel(date: string): string {
  const { year, month, day } = parseDateString(date);
  return new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}
