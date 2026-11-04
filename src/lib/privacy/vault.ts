import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { getDb, withRetry } from "@/db";
import { privacyAudit, privacyTokenMaps, privacyVaultEntries } from "@/db/schema";
import { decrypt, encrypt, fingerprint } from "./crypto";
import { TokenMap } from "./tokens";
import { VAULT_TYPES, type VaultEntry } from "./types";

export const vaultInput = z.object({
  type: z.enum(VAULT_TYPES),
  value: z.string().trim().min(2, "Value must be at least 2 characters").max(200),
  aliases: z.array(z.string().trim().min(2).max(100)).max(20).default([]),
});

export type VaultInput = z.input<typeof vaultInput>;

// A decryption failure throws on purpose: if the Vault cannot be read, nothing may be sent to the AI.
export async function listVault(ownerId: string): Promise<VaultEntry[]> {
  const rows = await withRetry(() =>
    getDb().select().from(privacyVaultEntries).where(eq(privacyVaultEntries.ownerId, ownerId)).orderBy(privacyVaultEntries.createdAt),
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.entityType as VaultEntry["type"],
    value: decrypt(r.encryptedValue),
    aliases: JSON.parse(decrypt(r.encryptedAliases)) as string[],
  }));
}

export async function addVaultEntry(ownerId: string, input: VaultInput) {
  const data = vaultInput.parse(input);
  const aliases = [...new Set(data.aliases.filter((a) => a.toLowerCase() !== data.value.toLowerCase()))];
  return withRetry(() =>
    getDb()
      .insert(privacyVaultEntries)
      .values({
        ownerId,
        entityType: data.type,
        sensitivity: data.type === "owner" ? "sensitive" : "personal",
        encryptedValue: encrypt(data.value),
        encryptedAliases: encrypt(JSON.stringify(aliases)),
        valueHmac: fingerprint(data.value),
      })
      .onConflictDoNothing()
      .returning({ id: privacyVaultEntries.id }),
  );
}

export async function deleteVaultEntry(ownerId: string, id: string) {
  const parsed = z.string().uuid().parse(id);
  return withRetry(() =>
    getDb().delete(privacyVaultEntries).where(and(eq(privacyVaultEntries.id, parsed), eq(privacyVaultEntries.ownerId, ownerId))),
  );
}

export interface AuditRecord {
  purpose: string;
  model: string;
  entityCounts: Record<string, number>;
  blocked: boolean;
  blockReason?: string;
  sanitizedPayload: string;
}

const AUDIT_DAYS = 14;

export async function recordAudit(ownerId: string, rec: AuditRecord) {
  const db = getDb();
  const expiresAt = new Date(Date.now() + AUDIT_DAYS * 86_400_000);
  await withRetry(() =>
    db.insert(privacyAudit).values({
      ownerId, purpose: rec.purpose, model: rec.model, entityCounts: rec.entityCounts, blocked: rec.blocked,
      blockReason: rec.blockReason ?? null, sanitizedPayload: rec.sanitizedPayload, expiresAt,
    }),
  );
  // Keep the free database small: drop expired audit rows on every write.
  await db.delete(privacyAudit).where(lt(privacyAudit.expiresAt, new Date()));
}

export async function listAudit(ownerId: string, limit = 20) {
  return withRetry(() =>
    getDb().select().from(privacyAudit).where(eq(privacyAudit.ownerId, ownerId)).orderBy(desc(privacyAudit.createdAt)).limit(limit),
  );
}

export async function saveTokenMap(ownerId: string, conversationId: string, map: TokenMap) {
  const rows = map.entries().map(([token, value]) => ({ ownerId, conversationId, token, encryptedValue: encrypt(value) }));
  if (rows.length === 0) return;
  await withRetry(() => getDb().insert(privacyTokenMaps).values(rows).onConflictDoNothing());
}

export async function loadTokenMap(ownerId: string, conversationId: string): Promise<TokenMap> {
  const rows = await withRetry(() =>
    getDb().select().from(privacyTokenMaps).where(and(eq(privacyTokenMaps.ownerId, ownerId), eq(privacyTokenMaps.conversationId, conversationId))),
  );
  return TokenMap.fromEntries(rows.map((r) => [r.token, decrypt(r.encryptedValue)]));
}
