import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
