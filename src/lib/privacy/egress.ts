import { detectPatterns, HARD_TYPES } from "./detectors";
import { compact, toNfd, valueRegex } from "./normalize";
import type { VaultEntry } from "./types";

export interface EgressResult {
  ok: boolean;
  hits: { type: string }[];
}

// Independent final check on the exact payload that would leave the server.
// Any Vault value or hard detector hit blocks the request. Only entity types are reported, never values.
export function egressCheck(
  payload: string,
  vault: VaultEntry[],
  detect: typeof detectPatterns = detectPatterns,
): EgressResult {
  const hits: { type: string }[] = [];
  const text = toNfd(payload);
  const flat = compact(payload);
  for (const entry of vault) {
    for (const v of [entry.value, ...entry.aliases]) {
      const c = compact(v);
      if (c.length < 2) continue;
      const hit = c.length >= 5 ? flat.includes(c) : (valueRegex(v)?.test(text) ?? false);
      if (hit) hits.push({ type: `vault_${entry.type}` });
    }
  }
  for (const span of detect(text, new Date())) {
    if (HARD_TYPES.has(span.type)) hits.push({ type: span.type });
  }
  return { ok: hits.length === 0, hits };
}
