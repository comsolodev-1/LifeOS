const MARKS = /\p{M}/gu;

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(MARKS, "");
}

// Lowercase letters and digits only, no diacritics, spacing or punctuation.
export function compact(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches a value regardless of case, diacritics, spacing and punctuation, on word boundaries.
// Run it against text that has been normalized with toNfd().
export function valueRegex(value: string): RegExp | null {
  const words = stripDiacritics(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return null;
  const body = words
    .map((w) => [...w].map((ch) => escapeRegex(ch) + "\\p{M}*").join(""))
    .join("[^\\p{L}\\p{N}]*");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, "giu");
}

export function toNfd(s: string): string {
  return s.normalize("NFD");
}
