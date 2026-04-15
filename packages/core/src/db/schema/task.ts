import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core"

import { project } from "./project.ts"
import { tenant } from "./tenant.ts"

export const task = sqliteTable(
  "task",
  {
    id: text("id").primaryKey(),
    tenant_id: text("tenant_id")
      .notNull()
      .references(() => tenant.id),
    project_id: text("project_id")
      .notNull()
      .references(() => project.id),
    parent_task_id: text("parent_task_id").references((): AnySQLiteColumn => task.id),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["backlog", "ready", "in_progress", "review", "done", "blocked", "cancelled"],
    }).notNull(),
    priority: text("priority", {
      enum: ["low", "medium", "high", "critical"],
    }).notNull(),
    owner_actor_type: text("owner_actor_type", { enum: ["user", "agent"] }).notNull(),
    owner_actor_id: text("owner_actor_id").notNull(),
    context: text("context", { mode: "json" }).$type<Record<string, unknown> | null>(),
    prompt: text("prompt", { mode: "json" }).$type<Record<string, unknown> | null>(),
    acceptance_criteria: text("acceptance_criteria", { mode: "json" }).$type<string[] | null>(),
    estimated_minutes: integer("estimated_minutes"),
    estimated_cost_usd: real("estimated_cost_usd"),
    due_date: integer("due_date"),
    started_at: integer("started_at"),
    completed_at: integer("completed_at"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
    deleted_at: integer("deleted_at"),
  },
  (table) => [index("task_project_idx").on(table.project_id, table.status, table.priority)],
)

export type Task = typeof task.$inferSelect
export type NewTask = typeof task.$inferInsert
