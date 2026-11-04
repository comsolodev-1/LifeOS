import { TOKENISH_PATTERN, type TokenMap } from "./tokens";

export interface RehydrateResult<T> {
  value: T;
  unresolved: string[];
}

// Replaces only exact, well-formed tokens that exist in this conversation's map.
// Unknown, wrong-case or partial tokens are left as they are and reported. Nothing is guessed.
export function rehydrateText(text: string, map: TokenMap): RehydrateResult<string> {
  const unresolved: string[] = [];
  const value = text.replace(TOKENISH_PATTERN, (m) => {
    const real = map.resolve(m);
    if (real !== undefined) return real;
    unresolved.push(m);
    return m;
  });
  return { value, unresolved };
}

export function rehydrateDeep<T>(input: T, map: TokenMap): RehydrateResult<T> {
  const unresolved: string[] = [];
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const r = rehydrateText(v, map);
      unresolved.push(...r.unresolved);
      return r.value;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { value: walk(input) as T, unresolved };
}
