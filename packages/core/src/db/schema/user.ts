import { sql } from "drizzle-orm"
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { tenant } from "./tenant.ts"

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatar_url: text("avatar_url"),
    default_tenant_id: text("default_tenant_id")
      .notNull()
      .references(() => tenant.id),
    prefs: text("prefs", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    mfa_enabled: integer("mfa_enabled", { mode: "boolean" }).notNull().default(false),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
    deleted_at: integer("deleted_at"),
  },
  (table) => [uniqueIndex("user_email_idx").on(table.email)],
)

export type User = typeof user.$inferSelect
export type NewUser = typeof user.$inferInsert
