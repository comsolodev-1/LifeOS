export interface BackoffOptions {
  retries?: number;
  baseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function statusOf(error: unknown): number | undefined {
  const e = error as { status?: number; code?: number; message?: string };
  if (typeof e?.status === "number") return e.status;
  if (typeof e?.code === "number") return e.code;
  const m = /\b(4\d\d|5\d\d)\b/.exec(e?.message ?? "");
  return m ? Number(m[1]) : undefined;
}

export function isRetryable(error: unknown): boolean {
  const s = statusOf(error);
  return s === 429 || s === 500 || s === 503 || s === 504;
}

export async function withBackoff<T>(fn: () => Promise<T>, opts: BackoffOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseMs ?? 800;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!isRetryable(error) || i === retries) break;
      await sleep(base * 2 ** i + Math.floor(Math.random() * 200));
    }
  }
  throw last;
}

export function describeAiError(error: unknown): string {
  const s = statusOf(error);
  if (s === 429) return "AI is busy or the free-tier limit was reached. Try again in a minute.";
  if (s === 404) return "The Gemini model was not found. Set GEMINI_MODEL to a model your key can use.";
  if (s === 400 || s === 401 || s === 403) return "Gemini rejected the request. Check that GEMINI_API_KEY is valid.";
  if (s && s >= 500) return "Gemini is having problems. Try again shortly.";
  return "The AI request failed. Try again.";
}
