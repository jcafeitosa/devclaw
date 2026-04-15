import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { tenant } from "./tenant.ts"

export const project = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    tenant_id: text("tenant_id")
      .notNull()
      .references(() => tenant.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["active", "paused", "completed", "archived"],
    }).notNull(),
    owner_user_id: text("owner_user_id"),
    owner_agent_id: text("owner_agent_id"),
    vault_path: text("vault_path"),
    repo_url: text("repo_url"),
    metadata: text("metadata", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
    deleted_at: integer("deleted_at"),
  },
  (table) => [index("project_tenant_idx").on(table.tenant_id, table.status)],
)

export type Project = typeof project.$inferSelect
export type NewProject = typeof project.$inferInsert
