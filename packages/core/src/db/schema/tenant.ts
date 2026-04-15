import { sql } from "drizzle-orm"
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const tenant = sqliteTable(
  "tenant",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    plan: text("plan", { enum: ["free", "pro", "unlimited"] }).notNull(),
    owner_user_id: text("owner_user_id").notNull(),
    settings: text("settings", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
    deleted_at: integer("deleted_at"),
  },
  (table) => [uniqueIndex("tenant_slug_idx").on(table.slug)],
)

export type Tenant = typeof tenant.$inferSelect
export type NewTenant = typeof tenant.$inferInsert
