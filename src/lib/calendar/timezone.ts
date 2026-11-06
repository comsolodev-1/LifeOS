// All stored timestamps are UTC. These helpers convert to and from a local wall clock in an IANA zone, at the display/input layer only.

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

export function utcToLocalParts(date: Date, tz: string): LocalParts {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(date)) if (part.type !== "literal") p[part.type] = Number(part.value);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, weekday };
}

function offsetMs(utcMs: number, tz: string): number {
  const p = utcToLocalParts(new Date(utcMs), tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(utcMs / 60_000) * 60_000;
}

// Wall-clock time in a zone to a UTC instant.
// Times skipped by a clock change move forward (02:30 on a spring-forward day becomes 03:30); repeated times use the first occurrence.
export function localToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const candidates = [...new Set([guess - offsetMs(guess, tz), guess - offsetMs(guess - offsetMs(guess, tz), tz)])];
  const matches = candidates.filter((c) => {
    const p = utcToLocalParts(new Date(c), tz);
    return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute;
  });
  return new Date(matches.length ? Math.min(...matches) : Math.max(...candidates));
}

export const pad = (n: number) => String(n).padStart(2, "0");

export function dateString(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseDateString(s: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Bad date: ${s}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new Error(`Bad date: ${s}`);
  return { year, month, day };
}

export function isDateString(s: string): boolean {
  try {
    parseDateString(s);
    return true;
  } catch {
    return false;
  }
}

export function localDateString(date: Date, tz: string): string {
  const p = utcToLocalParts(date, tz);
  return dateString(p.year, p.month, p.day);
}

// Pure calendar arithmetic on YYYY-MM-DD strings (no time zone involved).
export function addDays(dateStr: string, n: number): string {
  const { year, month, day } = parseDateString(dateStr);
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return dateString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addMonths(dateStr: string, n: number): string {
  const { year, month, day } = parseDateString(dateStr);
  const first = new Date(Date.UTC(year, month - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return dateString(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(day, last));
}

export function weekdayOf(dateStr: string): number {
  const { year, month, day } = parseDateString(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function startOfLocalDay(dateStr: string, tz: string): Date {
  const { year, month, day } = parseDateString(dateStr);
  return localToUtc(year, month, day, 0, 0, tz);
}

export function parseTime(s: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) throw new Error(`Bad time: ${s}`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function formatTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
}

export function timeInputValue(date: Date, tz: string): string {
  const p = utcToLocalParts(date, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}
