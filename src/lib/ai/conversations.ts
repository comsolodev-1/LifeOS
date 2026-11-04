import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, withRetry } from "@/db";
import { conversations, messages } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/privacy/crypto";

const convId = z.string().uuid();

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export async function createConversation(ownerId: string, firstMessage: string) {
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
  const rows = await withRetry(() =>
    getDb().insert(conversations).values({ ownerId, encryptedTitle: encrypt(title) }).returning({ id: conversations.id }),
  );
  return rows[0].id;
}

export async function conversationExists(ownerId: string, id: string): Promise<boolean> {
  const parsed = convId.safeParse(id);
  if (!parsed.success) return false;
  const rows = await withRetry(() =>
    getDb().select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, parsed.data), eq(conversations.ownerId, ownerId))).limit(1),
  );
  return rows.length > 0;
}

export async function listConversations(ownerId: string, limit = 30) {
  const rows = await withRetry(() =>
    getDb().select().from(conversations).where(eq(conversations.ownerId, ownerId)).orderBy(desc(conversations.updatedAt)).limit(limit),
  );
  return rows.map((r) => ({ id: r.id, title: decrypt(r.encryptedTitle), updatedAt: r.updatedAt }));
}

export async function listMessages(ownerId: string, conversationId: string, limit = 40): Promise<ChatMessage[]> {
  const id = convId.parse(conversationId);
  const rows = await withRetry(() =>
    getDb()
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, id), eq(messages.ownerId, ownerId)))
      .orderBy(desc(messages.createdAt))
      .limit(limit),
  );
  return rows.reverse().map((r) => ({ id: r.id, role: r.role as ChatMessage["role"], content: decrypt(r.encryptedContent), createdAt: r.createdAt }));
}

export async function addMessage(ownerId: string, conversationId: string, role: "user" | "assistant", content: string) {
  const id = convId.parse(conversationId);
  const rows = await withRetry(() =>
    getDb().insert(messages).values({ ownerId, conversationId: id, role, encryptedContent: encrypt(content) }).returning({ id: messages.id }),
  );
  await withRetry(() =>
    getDb().update(conversations).set({ updatedAt: new Date() }).where(and(eq(conversations.id, id), eq(conversations.ownerId, ownerId))),
  );
  return rows[0].id;
}

export async function deleteConversation(ownerId: string, conversationId: string) {
  await withRetry(() => getDb().delete(conversations).where(and(eq(conversations.id, convId.parse(conversationId)), eq(conversations.ownerId, ownerId))));
}

