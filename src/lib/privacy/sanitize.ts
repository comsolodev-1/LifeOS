import { detectPatterns, type EntityClass, type Span } from "./detectors";
import { compact, toNfd, valueRegex } from "./normalize";
import { TOKEN_PATTERN, type TokenMap } from "./tokens";
import { TOKEN_PREFIX, type PrivacyMode, type VaultEntry } from "./types";

export interface SanitizeOptions {
  vault: VaultEntry[];
  tokenMap: TokenMap;
  mode: PrivacyMode;
  now?: Date;
  detect?: (text: string, now: Date) => Span[];
}

export interface SanitizeReport {
  counts: Record<string, number>;
  secrets: string[];
  // Heuristic name hits, for the owner to review and add to the Vault. Real values: never log or store.
  possible: string[];
}

const VAULT_CLASS: Record<string, EntityClass> = {
  owner: "person", person: "person", email: "contact", phone: "contact", place: "place", org: "org", handle: "contact", other: "other",
};

function priority(span: Span): number {
  if (span.cls === "secret") return 0;
  if (span.source === "vault") return 1;
  if (span.source === "possible") return 4;
  return span.cls === "money" ? 3 : 2;
}

function resolveOverlaps(spans: Span[]): Span[] {
  const ordered = [...spans].sort((a, b) => priority(a) - priority(b) || b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: Span[] = [];
  for (const s of ordered) {
    if (!kept.some((k) => s.start < k.end && k.start < s.end)) kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}

// Replaces literal placeholder-looking text so incoming content (web pages, images, tool output) cannot
// plant tokens that would later be rehydrated into real values.
export function neutralizeTokens(text: string): string {
  return text.replace(TOKEN_PATTERN, (m) => `(${m.slice(1, -1)})`);
}

export function sanitizeText(input: string, opts: SanitizeOptions): { text: string; report: SanitizeReport } {
  const now = opts.now ?? new Date();
  const text = neutralizeTokens(toNfd(input));
  const spans: Span[] = [];

  for (const entry of opts.vault) {
    for (const v of [entry.value, ...entry.aliases]) {
      if (compact(v).length < 2) continue;
      const re = valueRegex(v);
      if (!re) continue;
      for (const m of text.matchAll(re)) {
        spans.push({
          start: m.index, end: m.index + m[0].length, type: `vault_${entry.type}`, cls: VAULT_CLASS[entry.type] ?? "other",
          source: "vault", tokenPrefix: TOKEN_PREFIX[entry.type], tokenValue: entry.value,
        });
      }
    }
  }
  spans.push(...(opts.detect ?? detectPatterns)(text, now));

  const report: SanitizeReport = { counts: {}, secrets: [], possible: [] };
  let out = "";
  let cursor = 0;
  for (const span of resolveOverlaps(spans)) {
    if (span.source === "possible" && opts.mode === "balanced") continue;
    out += text.slice(cursor, span.start);
    cursor = span.end;
    report.counts[span.type] = (report.counts[span.type] ?? 0) + 1;
    if (span.cls === "secret") {
      report.secrets.push(span.type);
      out += "[REDACTED]";
    } else if (span.replacement) {
      out += span.replacement;
    } else {
      const original = text.slice(span.start, span.end);
      if (span.source === "possible") report.possible.push(original);
      out += opts.tokenMap.tokenFor(span.tokenPrefix ?? "OTHER", span.tokenValue ?? original);
    }
  }
  out += text.slice(cursor);
  return { text: out, report };
}

export function maskSecrets(text: string, now: Date = new Date()): string {
  const spans = detectPatterns(toNfd(text), now).filter((s) => s.cls === "secret");
  const t = toNfd(text);
  let out = "";
  let cursor = 0;
  for (const s of resolveOverlaps(spans)) {
    out += t.slice(cursor, s.start) + "[REDACTED]";
    cursor = s.end;
  }
  return out + t.slice(cursor);
}
