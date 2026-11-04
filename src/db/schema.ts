import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("Asia/Manila"),
  ...timestamps,
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    index("projects_owner_idx").on(t.ownerId),
    check("projects_status_check", sql`${t.status} in ('active','paused','done')`),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("medium"),
    deadline: timestamp("deadline", { withTimezone: true }),
    estimatedMinutes: integer("estimated_minutes"),
    origin: text("origin").notNull().default("manual"),
    ...timestamps,
  },
  (t) => [
    index("tasks_owner_status_idx").on(t.ownerId, t.status),
    index("tasks_owner_deadline_idx").on(t.ownerId, t.deadline),
    check("tasks_status_check", sql`${t.status} in ('todo','doing','done')`),
    check("tasks_priority_check", sql`${t.priority} in ('low','medium','high')`),
    check("tasks_origin_check", sql`${t.origin} in ('manual','ai_chat','schedule_extraction')`),
    check("tasks_estimate_check", sql`${t.estimatedMinutes} is null or ${t.estimatedMinutes} > 0`),
  ],
);

export type Task = typeof tasks.$inferSelect;

export const privacyVaultEntries = pgTable(
  "privacy_vault_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    sensitivity: text("sensitivity").notNull().default("sensitive"),
    encryptedValue: text("encrypted_value").notNull(),
    encryptedAliases: text("encrypted_aliases").notNull(),
    replacementPolicy: text("replacement_policy").notNull().default("token"),
    valueHmac: text("value_hmac").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("vault_owner_hmac_uniq").on(t.ownerId, t.valueHmac),
    check("vault_type_check", sql`${t.entityType} in ('owner','person','email','phone','place','org','handle','other')`),
    check("vault_sensitivity_check", sql`${t.sensitivity} in ('personal','sensitive','secret')`),
    check("vault_policy_check", sql`${t.replacementPolicy} in ('token','generalize')`),
  ],
);

export const privacyTokenMaps = pgTable(
  "privacy_token_maps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull(),
    token: text("token").notNull(),
    vaultEntryId: uuid("vault_entry_id").references(() => privacyVaultEntries.id, { onDelete: "set null" }),
    encryptedValue: text("encrypted_value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("token_conv_token_uniq").on(t.conversationId, t.token)],
);

export const privacyAudit = pgTable(
  "privacy_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    entityCounts: jsonb("entity_counts").$type<Record<string, number>>().notNull(),
    blocked: boolean("blocked").notNull().default(false),
    blockReason: text("block_reason"),
    sanitizedPayload: text("sanitized_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("audit_owner_created_idx").on(t.ownerId, t.createdAt)],
);
