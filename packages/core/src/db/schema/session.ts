import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { tenant } from "./tenant.ts"
import { user } from "./user.ts"

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    tenant_id: text("tenant_id")
      .notNull()
      .references(() => tenant.id),
    user_id: text("user_id").references(() => user.id),
    agent_id: text("agent_id"),
    status: text("status", { enum: ["active", "idle", "closed"] }).notNull(),
    resume_token: text("resume_token"),
    context: text("context", { mode: "json" }).$type<Record<string, unknown> | null>(),
    started_at: integer("started_at").notNull(),
    last_active_at: integer("last_active_at").notNull(),
    ended_at: integer("ended_at"),
  },
  (table) => [index("session_tenant_idx").on(table.tenant_id, table.status, table.last_active_at)],
)

export type Session = typeof session.$inferSelect
export type NewSession = typeof session.$inferInsert
