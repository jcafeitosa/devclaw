import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { run } from "./run.ts"
import { tenant } from "./tenant.ts"

export const cost_record = sqliteTable(
  "cost_record",
  {
    id: text("id").primaryKey(),
    tenant_id: text("tenant_id")
      .notNull()
      .references(() => tenant.id),
    run_id: text("run_id").references(() => run.id),
    provider_id: text("provider_id").notNull(),
    model_id: text("model_id").notNull(),
    type: text("type", { enum: ["llm", "embedding", "tool", "storage"] }).notNull(),
    prompt_tokens: integer("prompt_tokens"),
    output_tokens: integer("output_tokens"),
    cached_tokens: integer("cached_tokens"),
    cost_usd: real("cost_usd").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown> | null>(),
    created_at: integer("created_at").notNull(),
  },
  (table) => [index("cost_record_tenant_idx").on(table.tenant_id, table.created_at)],
)

export type CostRecord = typeof cost_record.$inferSelect
export type NewCostRecord = typeof cost_record.$inferInsert
