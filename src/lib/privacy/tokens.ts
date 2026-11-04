import { compact } from "./normalize";

// Matches well-formed placeholders: [PERSON_1], [EMAIL_2], [OWNER]
export const TOKEN_PATTERN = /\[(?:[A-Z]+_\d+|OWNER)\]/g;
// Anything that looks like a placeholder, including tampered ones (wrong case)
export const TOKENISH_PATTERN = /\[(?:[A-Za-z]+_\d+|owner)\]/gi;

export class TokenMap {
  private byKey = new Map<string, string>();
  private byToken = new Map<string, string>();
  private counters = new Map<string, number>();

  // Same value in the same map always gets the same token.
  tokenFor(prefix: string, value: string): string {
    if (prefix === "OWNER") {
      if (!this.byToken.has("[OWNER]")) this.byToken.set("[OWNER]", value);
      return "[OWNER]";
    }
    const key = `${prefix}|${compact(value) || value.toLowerCase()}`;
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    const token = `[${prefix}_${n}]`;
    this.byKey.set(key, token);
    this.byToken.set(token, value);
    return token;
  }

  resolve(token: string): string | undefined {
    return this.byToken.get(token);
  }

  entries(): [string, string][] {
    return [...this.byToken.entries()];
  }

  static fromEntries(entries: [string, string][]): TokenMap {
    const map = new TokenMap();
    for (const [token, value] of entries) {
      const m = /^\[([A-Z]+)_(\d+)\]$/.exec(token);
      if (token === "[OWNER]") {
        map.byToken.set(token, value);
      } else if (m) {
        map.byToken.set(token, value);
        map.byKey.set(`${m[1]}|${compact(value) || value.toLowerCase()}`, token);
        map.counters.set(m[1], Math.max(map.counters.get(m[1]) ?? 0, Number(m[2])));
      }
    }
    return map;
  }
}
