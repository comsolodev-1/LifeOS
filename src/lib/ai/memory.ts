import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, withRetry } from "@/db";
import { lifeContext, memories } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/privacy/crypto";
import { NotFoundError } from "@/lib/errors";

export const MEMORY_CATEGORIES = ["identity", "education", "work", "preferences", "routines", "goals", "constraints", "other"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const memoryInput = z.object({
  category: z.enum(MEMORY_CATEGORIES),
  content: z.string().trim().min(3, "Memory is too short").max(500),
  confidence: z.number().min(0).max(1).default(0.7),
});

export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;
  confidence: number;
  source: "ai_proposed" | "manual";
  status: "proposed" | "approved" | "rejected";
  lastVerifiedAt: Date | null;
  createdAt: Date;
}

const STOP = new Set(["the", "and", "for", "that", "this", "with", "have", "what", "when", "how", "can", "you", "are", "was", "will", "about", "from", "my", "your", "not", "but", "any", "all", "get", "need", "want", "should", "please"]);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

// Simple keyword retrieval: memories sharing words with the message, best first. Falls back to the most recently verified
// few so basic facts about the owner are still available when nothing matches.
export function retrieveMemories(all: Memory[], query: string, limit = 8, minimum = 3): Memory[] {
  const approved = all.filter((m) => m.status === "approved");
  const q = words(query);
  const scored = approved
    .map((m) => {
      const mw = words(m.content + " " + m.category);
      let score = 0;
      for (const w of q) if (mw.has(w)) score++;
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.m.createdAt.getTime() - a.m.createdAt.getTime())
    .map((x) => x.m);
  const picked = scored.slice(0, limit);
  if (picked.length < minimum) {
    const recent = [...approved]
      .sort((a, b) => (b.lastVerifiedAt ?? b.createdAt).getTime() - (a.lastVerifiedAt ?? a.createdAt).getTime())
      .filter((m) => !picked.includes(m));
    picked.push(...recent.slice(0, minimum - picked.length));
  }
  return picked;
}

type Row = typeof memories.$inferSelect;
const toMemory = (r: Row): Memory => ({
  id: r.id,
  category: r.category as MemoryCategory,
  content: decrypt(r.encryptedContent),
  confidence: r.confidence,
  source: r.source as Memory["source"],
  status: r.status as Memory["status"],
  lastVerifiedAt: r.lastVerifiedAt,
  createdAt: r.createdAt,
});

export async function listMemories(ownerId: string, status?: Memory["status"]): Promise<Memory[]> {
  const where = status ? and(eq(memories.ownerId, ownerId), eq(memories.status, status)) : eq(memories.ownerId, ownerId);
  const rows = await withRetry(() => getDb().select().from(memories).where(where).orderBy(desc(memories.createdAt)));
  return rows.map(toMemory);
}

export async function proposeMemory(ownerId: string, input: z.input<typeof memoryInput>, conversationId?: string) {
  const data = memoryInput.parse(input);
  const rows = await withRetry(() =>
    getDb()
      .insert(memories)
      .values({
        ownerId, category: data.category, encryptedContent: encrypt(data.content), confidence: data.confidence,
        source: "ai_proposed", sourceConversationId: conversationId ?? null, status: "proposed",
      })
      .returning(),
  );
  return toMemory(rows[0]);
}

export async function addManualMemory(ownerId: string, input: z.input<typeof memoryInput>) {
  const data = memoryInput.parse(input);
  const rows = await withRetry(() =>
    getDb()
      .insert(memories)
      .values({
        ownerId, category: data.category, encryptedContent: encrypt(data.content), confidence: 1,
        source: "manual", status: "approved", lastVerifiedAt: new Date(),
      })
      .returning(),
  );
  return toMemory(rows[0]);
}

const memoryId = z.string().uuid();

export async function setMemoryStatus(ownerId: string, id: string, status: "approved" | "rejected") {
  const rows = await withRetry(() =>
    getDb()
      .update(memories)
      .set({ status, updatedAt: new Date(), ...(status === "approved" ? { lastVerifiedAt: new Date() } : {}) })
      .where(and(eq(memories.id, memoryId.parse(id)), eq(memories.ownerId, ownerId)))
      .returning({ id: memories.id }),
  );
  if (!rows[0]) throw new NotFoundError("Memory");
}

export async function updateMemory(ownerId: string, id: string, input: z.input<typeof memoryInput>) {
  const data = memoryInput.parse(input);
  const rows = await withRetry(() =>
    getDb()
      .update(memories)
      .set({ category: data.category, encryptedContent: encrypt(data.content), updatedAt: new Date(), lastVerifiedAt: new Date() })
      .where(and(eq(memories.id, memoryId.parse(id)), eq(memories.ownerId, ownerId)))
      .returning({ id: memories.id }),
  );
  if (!rows[0]) throw new NotFoundError("Memory");
}

export async function deleteMemory(ownerId: string, id: string) {
  await withRetry(() => getDb().delete(memories).where(and(eq(memories.id, memoryId.parse(id)), eq(memories.ownerId, ownerId))));
}

export async function getLifeContext(ownerId: string): Promise<string> {
  const rows = await withRetry(() => getDb().select().from(lifeContext).where(eq(lifeContext.ownerId, ownerId)).limit(1));
  return rows[0] ? decrypt(rows[0].encryptedContent) : "";
}

export async function setLifeContext(ownerId: string, content: string) {
  const text = z.string().trim().max(4000).parse(content);
  await withRetry(() =>
    getDb()
      .insert(lifeContext)
      .values({ ownerId, encryptedContent: encrypt(text) })
      .onConflictDoUpdate({ target: lifeContext.ownerId, set: { encryptedContent: encrypt(text), updatedAt: new Date() } }),
  );
}
