import { eventInput, type EventInput } from "@/lib/dal/events";
import { addDays, isDateString, weekdayOf } from "./timezone";

export interface ImportItem {
  title: string;
  days: number[];
  date: string;
  startTime: string;
  endTime: string;
}

// Turns reviewed rows into events. A weekly row starts on its own date when it has one (and the weekday matches),
// otherwise on the next matching weekday from today. Every row is validated; the first problem is reported by row number.
export function buildImportInputs(items: ImportItem[], until: string | undefined, today: string): { inputs?: EventInput[]; error?: string } {
  const inputs: EventInput[] = [];
  for (const [i, item] of items.entries()) {
    let date = item.date;
    let recurrence: EventInput["recurrence"];
    if (item.days.length > 0) {
      const own = isDateString(item.date) && item.days.includes(weekdayOf(item.date)) ? item.date : undefined;
      date = own ?? Array.from({ length: 7 }, (_, k) => addDays(today, k)).find((d) => item.days.includes(weekdayOf(d))) ?? today;
      recurrence = { freq: "weekly", interval: 1, byWeekday: item.days, ...(until && until >= date ? { until } : {}) };
    }
    const candidate: EventInput = { title: item.title.trim(), kind: "fixed", date, startTime: item.startTime, endTime: item.endTime, recurrence };
    const check = eventInput.safeParse(candidate);
    if (!check.success) return { error: `Row ${i + 1} (${item.title || "untitled"}): ${check.error.issues[0]?.message ?? "invalid"}` };
    inputs.push(candidate);
  }
  return { inputs };
}
