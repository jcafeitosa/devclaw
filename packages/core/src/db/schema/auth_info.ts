import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

import { tenant } from "./tenant.ts"
import { user } from "./user.ts"

export const auth_info = sqliteTable(
  "auth_info",
  {
    id: text("id").primaryKey(),
    tenant_id: text("tenant_id")
      .notNull()
      .references(() => tenant.id),
    user_id: text("user_id").references(() => user.id),
    provider_id: text("provider_id").notNull(),
    account_label: text("account_label"),
    type: text("type", { enum: ["api", "oauth", "wellknown"] }).notNull(),
    encrypted_data: text("encrypted_data").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown> | null>(),
    expires_at: integer("expires_at"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("auth_info_tenant_provider_account_idx").on(
      table.tenant_id,
      table.provider_id,
      table.account_label,
    ),
    index("auth_info_user_idx").on(table.user_id, table.provider_id),
  ],
)

export type AuthInfo = typeof auth_info.$inferSelect
export type NewAuthInfo = typeof auth_info.$inferInsert
