import { z } from "zod";
import type { Candidate } from "./extraction";

export type Row = Candidate & { include: boolean; repeat: boolean };

export const rowKey = (r: Pick<Candidate, "title" | "date" | "days" | "startTime">) =>
  `${r.title.toLowerCase().trim()}|${r.date || r.days.join(",")}|${r.startTime}`;

export const toRows = (cands: Candidate[]): Row[] => cands.map((c) => ({ ...c, include: c.flags.length === 0, repeat: false }));

// Adds only candidates that are not already listed.
export function mergeCandidates(rows: Row[], cands: Candidate[]): { rows: Row[]; added: number } {
  const known = new Set(rows.map(rowKey));
  const fresh = toRows(cands.filter((c) => !known.has(rowKey(c))));
  return { rows: [...rows, ...fresh], added: fresh.length };
}

const storedRow = z.object({
  id: z.string().max(64),
  title: z.string().max(200),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  date: z.string().max(10),
  startTime: z.string().max(5),
  endTime: z.string().max(5),
  flags: z.array(z.enum(["title", "schedule", "startTime", "endTime"])).max(4),
  include: z.boolean(),
  repeat: z.boolean(),
});
const stored = z.object({ v: z.literal(1), until: z.string().max(10), info: z.string().max(200).nullable(), rows: z.array(storedRow).min(1).max(80) });

export interface StoredImport {
  rows: Row[];
  until: string;
  info: string | null;
}

// Only the text of the review list is kept (never the photo), so a reload does not lose the owner's edits.
export function serializeImport(s: StoredImport): string {
  return JSON.stringify({ v: 1, until: s.until, info: s.info, rows: s.rows });
}

export function parseStoredImport(raw: string | null): StoredImport | null {
  if (!raw) return null;
  try {
    const parsed = stored.safeParse(JSON.parse(raw));
    return parsed.success ? { rows: parsed.data.rows, until: parsed.data.until, info: parsed.data.info } : null;
  } catch {
    return null;
  }
}
