import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    // taskId cannot be completed until dependsOnId is done
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: uuid("depends_on_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("task_dep_uniq").on(t.taskId, t.dependsOnId),
    index("task_dep_owner_idx").on(t.ownerId),
    check("task_dep_not_self", sql`${t.taskId} <> ${t.dependsOnId}`),
  ],
);

export const lifeContext = pgTable("life_context", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().unique().references(() => profiles.id, { onDelete: "cascade" }),
  encryptedContent: text("encrypted_content").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    encryptedTitle: text("encrypted_title").notNull(),
    ...timestamps,
  },
  (t) => [index("conv_owner_updated_idx").on(t.ownerId, t.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    encryptedContent: text("encrypted_content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conv_created_idx").on(t.conversationId, t.createdAt),
    check("messages_role_check", sql`${t.role} in ('user','assistant')`),
  ],
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    encryptedContent: text("encrypted_content").notNull(),
    confidence: real("confidence").notNull().default(0.7),
    source: text("source").notNull(),
    sourceConversationId: uuid("source_conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    status: text("status").notNull().default("proposed"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("memories_owner_status_idx").on(t.ownerId, t.status),
    check("memories_status_check", sql`${t.status} in ('proposed','approved','rejected')`),
    check("memories_source_check", sql`${t.source} in ('ai_proposed','manual')`),
    check("memories_confidence_check", sql`${t.confidence} >= 0 and ${t.confidence} <= 1`),
    check("memories_category_check", sql`${t.category} in ('identity','education','work','preferences','routines','goals','constraints','other')`),
  ],
);

export const pendingActions = pgTable(
  "pending_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("pending"),
    resultRef: text("result_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("pending_owner_key_uniq").on(t.ownerId, t.idempotencyKey),
    index("pending_owner_status_idx").on(t.ownerId, t.status),
    check("pending_kind_check", sql`${t.kind} in ('create_task','update_task','create_project')`),
    check("pending_status_check", sql`${t.status} in ('pending','confirming','confirmed','dismissed','failed')`),
  ],
);

export const aiActionLogs = pgTable(
  "ai_action_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    outcome: text("outcome").notNull(),
    refId: text("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_log_owner_created_idx").on(t.ownerId, t.createdAt)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    kind: text("kind").notNull().default("event"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    // IANA zone the event was created in; recurring events keep their local wall-clock time in this zone
    timezone: text("timezone").notNull(),
    recurrence: jsonb("recurrence").$type<{ freq: "daily" | "weekly" | "monthly"; interval: number; byWeekday?: number[]; until?: string; count?: number }>(),
    exceptions: jsonb("exceptions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    source: text("source").notNull().default("manual"),
    ...timestamps,
  },
  (t) => [
    index("events_owner_start_idx").on(t.ownerId, t.startsAt),
    check("events_kind_check", sql`${t.kind} in ('event','fixed')`),
    check("events_source_check", sql`${t.source} in ('manual','photo')`),
    check("events_end_after_start", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);
