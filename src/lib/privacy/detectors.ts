export type EntityClass = "secret" | "person" | "contact" | "place" | "age" | "money" | "org" | "other";

export interface Span {
  start: number;
  end: number;
  type: string;
  cls: EntityClass;
  source: "vault" | "pattern" | "possible";
  // Literal replacement for generalized values (age, money, birthdate). Tokenized types leave this empty.
  replacement?: string;
  tokenPrefix?: string;
  tokenValue?: string;
}

// Types that the egress guard treats as hard hits. Generalized output (age, money) and possible names are excluded.
export const HARD_TYPES = new Set([
  "card", "ph_id", "labeled_number", "password", "api_key", "email", "phone", "ip", "address", "place_pattern", "dob",
]);

export function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function ageBand(age: number): string {
  if (age < 13) return "a child";
  if (age < 20) return "a teenager";
  if (age >= 60) return "60 or older";
  const decade = Math.floor(age / 10) * 10;
  const unit = age % 10;
  const part = unit <= 3 ? "early" : unit <= 6 ? "mid" : "late";
  return `${part} ${decade}s`;
}

export function moneyBand(amount: number): string {
  if (amount < 1_000) return "under 1k";
  if (amount < 10_000) return "1k-10k";
  if (amount < 100_000) return "10k-100k";
  if (amount < 1_000_000) return "100k-1M";
  if (amount < 10_000_000) return "1M-10M";
  return "over 10M";
}

const MONTHS = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const COMMON_START = new Set([
  "The", "This", "That", "These", "Those", "My", "Your", "Our", "Their", "His", "Her", "A", "An", "In", "On", "At", "For",
  "With", "And", "But", "Or", "If", "When", "Please", "Remind", "Add", "Create", "Pay", "Call", "Buy", "Send", "Check",
  "Plan", "Review", "Write", "Update", "Fix", "Make", "Set", "Schedule", "Book", "Reply", "Finish", "Submit", "Prepare",
  "Study", "Read", "Clean", "Meet", "Visit", "Ask", "Tell", "Text", "Email", "Message", "Remind", "Thank", "Join", "See", "Reality", "Life", "Open", "Test", "Next", "Good", "Happy",
]);
const NOT_NAMES = new Set([
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April",
  "May", "June", "July", "August", "September", "October", "November", "December", "Google", "Gemini", "Neon", "Vercel",
  "GitHub", "Next", "Postgres", "Philippines", "Manila", "Reality", "Check", "Life", "Profile", "Privacy", "Vault",
]);

function ci(word: string): string {
  return `[${word[0].toUpperCase()}${word[0].toLowerCase()}]${word.slice(1)}`;
}

const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Dra", "Engr", "Atty", "Prof", "Sir", "Ma'am", "Madam", "Kuya", "Ate", "Tito", "Tita", "Lolo", "Lola", "Manong", "Manang", "Nanay", "Tatay", "Mang", "Aling", "Ninong", "Ninang"];

function parseDate(raw: string, now: Date): number | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  let d: Date;
  if (iso) d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  else if (/^\d{4}$/.test(raw)) d = new Date(Date.UTC(+raw, 5, 30));
  else {
    const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(raw);
    if (slash) {
      const year = +slash[3] < 100 ? 1900 + +slash[3] : +slash[3];
      d = new Date(Date.UTC(year, +slash[1] - 1, +slash[2]));
    } else d = new Date(raw + " UTC");
  }
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

function push(out: Span[], text: string, re: RegExp, make: (m: RegExpExecArray) => Span | null) {
  for (const m of text.matchAll(re)) {
    const span = make(m as RegExpExecArray);
    if (span) out.push(span);
  }
}

export function detectPatterns(text: string, now: Date = new Date()): Span[] {
  const out: Span[] = [];
  const secret = (m: RegExpExecArray, type: string, group = 0): Span => {
    const ind = (m as unknown as { indices?: [number, number][] }).indices;
    const [start, end] = group && ind?.[group] ? ind[group] : [m.index, m.index + m[0].length];
    return { start, end, type, cls: "secret", source: "pattern" };
  };

  // Secrets
  push(out, text, /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g, (m) => {
    const digits = m[0].replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? secret(m, "card") : null;
  });
  for (const re of [
    /(?<!\d)\d{2}-\d{7}-\d(?!\d)/g,
    /(?<!\d)\d{2}-\d{9}-\d(?!\d)/g,
    /(?<!\d)\d{3}-\d{3}-\d{3}(?:-\d{3,5})?(?!\d)/g,
    /(?<!\d)\d{4}-\d{4}-\d{4}(?:-\d{4})?(?!\d)/g,
    /(?<![A-Za-z0-9])[A-Z]\d{7}[A-Z](?![A-Za-z0-9])/g,
  ]) push(out, text, re, (m) => secret(m, "ph_id"));
  push(
    out,
    text,
    /\b(?:sss|tin|philhealth|phil-?health|pag-?ibig|philsys|gsis|umid|passport|account|acct|a\/c|card|iban|routing)\b(?:\s*(?:no\.?|number|num|#|id))?\s*[:=#-]?\s*(\d[\d -]{5,24}\d|[A-Z]\d{7}[A-Z]?)/dgi,
    (m) => secret(m, "labeled_number", 1),
  );
  push(
    out,
    text,
    /\b(?:password|passwd|pwd|passcode|pin|otp|cvv|cvc|one[- ]time (?:code|password)|verification code)\b\s*(?:(?:is|was)\s+|[:=]\s*)(\S{3,})/dgi,
    (m) => secret(m, "password", 1),
  );
  push(out, text, /\b(?:otp|pin|cvv|cvc|code)\s+(\d{4,8})\b/dgi, (m) => secret(m, "password", 1));
  push(out, text, /\b(?:AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, (m) => secret(m, "api_key"));

  // Contact
  const contact = (m: RegExpExecArray, type: string, prefix: string): Span => ({
    start: m.index, end: m.index + m[0].length, type, cls: "contact", source: "pattern", tokenPrefix: prefix, tokenValue: m[0],
  });
  push(out, text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => contact(m, "email", "EMAIL"));
  for (const re of [
    /(?<!\d)(?:\+?63|0)9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g,
    /(?<![\w+])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,3}(?!\d)/g,
    /\(0\d{1,2}\)\s?\d{3,4}[\s-]?\d{4}(?!\d)/g,
    /(?<!\d)0\d{1,2}[\s-]\d{3,4}[\s-]\d{4}(?!\d)/g,
  ]) push(out, text, re, (m) => contact(m, "phone", "PHONE"));
  push(out, text, /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g, (m) => contact(m, "ip", "IP"));

  // Places
  const place = (m: RegExpExecArray): Span => ({
    start: m.index, end: m.index + m[0].length, type: "place_pattern", cls: "place", source: "pattern", tokenPrefix: "PLACE", tokenValue: m[0],
  });
  push(out, text, /(?<![\w])\d{1,5}[A-Za-z]?\s+(?:[A-Z][\w.'-]*\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Highway|Hwy|Extension|Ext)\b\.?/g, place);
  push(out, text, /\b(?:Brgy|Barangay|Purok|Sitio|Zone|Subd|Subdivision|Village)\.?\s+[A-Z0-9][\w'-]*(?:\s+[A-Z][\w'-]*){0,3}/g, place);

  // Age and birthdate (generalized, not reversible)
  const dobRe = new RegExp(
    `\\b(?:born|birth(?:day|date)?|b-?day|dob|d\\.o\\.b\\.?)\\b[^.\\n]{0,25}?(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|${MONTHS}\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\s+${MONTHS}\\.?,?\\s+\\d{4}|(?:19|20)\\d{2})`,
    "dgi",
  );
  push(out, text, dobRe, (m) => {
    const ind = (m as unknown as { indices: [number, number][] }).indices[1];
    const age = parseDate(m[1], now);
    return { start: ind[0], end: ind[1], type: "dob", cls: "age", source: "pattern", replacement: age === null ? "[BIRTHDATE]" : `[BIRTHDATE: ${ageBand(age)}]` };
  });
  const ageSpan = (m: RegExpExecArray): Span | null => {
    const n = Number(m[1]);
    if (!(n >= 1 && n <= 110)) return null;
    return { start: m.index, end: m.index + m[0].length, type: "age", cls: "age", source: "pattern", replacement: `(age: ${ageBand(n)})` };
  };
  push(out, text, /\b(\d{1,3})[\s-]*(?:years?|yrs?|y\/o|yo)[\s-]*old\b/gi, ageSpan);
  push(out, text, /\b(?:age|aged)\s*[:=]?\s*(\d{1,3})\b/gi, ageSpan);

  // Money (generalized to a band)
  const moneyRe = /(?:(?:₱|PHP\s?|Php\s?|\$|USD\s?|(?<![A-Za-z])P(?=\d))\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(k|K|M|million|thousand|B|billion)\b)?)|(?:(\d[\d,]*(?:\.\d+)?)\s?(k|K|M)?\s?(?:pesos|dollars)\b)/g;
  push(out, text, moneyRe, (m) => {
    const raw = (m[1] ?? m[3] ?? "").replace(/,/g, "");
    let n = Number(raw);
    const unit = (m[2] ?? m[4] ?? "").toLowerCase();
    if (unit === "k" || unit === "thousand") n *= 1_000;
    else if (unit === "m" || unit === "million") n *= 1_000_000;
    else if (unit === "b" || unit === "billion") n *= 1_000_000_000;
    if (!Number.isFinite(n)) return null;
    return { start: m.index, end: m.index + m[0].length, type: "money", cls: "money", source: "pattern", replacement: `[AMOUNT ${moneyBand(n)}]` };
  });

  // Possible names (heuristic; tokenized in strict mode only)
  const possible = (start: number, end: number, value: string): Span => ({
    start, end, type: "person_possible", cls: "person", source: "possible", tokenPrefix: "PERSON", tokenValue: value,
  });
  const titleRe = new RegExp(`(?<![\\p{L}\\p{N}])(?:${TITLES.map(ci).join("|")})\\.?\\s+\\p{Lu}[\\p{Ll}'-]+(?:\\s+\\p{Lu}[\\p{Ll}'-]+){0,2}`, "gu");
  const titled: Span[] = [];
  push(titled, text, titleRe, (m) => possible(m.index, m.index + m[0].length, m[0]));
  out.push(...titled);
  push(out, text, /(?<![\p{L}\p{N}])\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+){1,2}(?![\p{L}\p{N}])/gu, (m) => {
    const words = m[0].split(/\s+/);
    if (COMMON_START.has(words[0]) || words.some((w) => NOT_NAMES.has(w))) return null;
    const end = m.index + m[0].length;
    if (titled.some((t) => m.index < t.end && t.start < end)) return null;
    return possible(m.index, m.index + m[0].length, m[0]);
  });

  return out;
}
