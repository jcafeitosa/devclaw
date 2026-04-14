import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { tenant } from "./tenant.ts"

export const embedding = sqliteTable(
  "embedding",
  {
    id: text("id").primaryKey(),
    tenant_id: text("tenant_id")
      .notNull()
      .references(() => tenant.id),
    source_type: text("source_type", {
      enum: ["file", "document", "message", "task", "ecap", "tecap"],
    }).notNull(),
    source_id: text("source_id").notNull(),
    chunk_index: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: text("embedding", { mode: "json" }).$type<number[] | null>(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown> | null>(),
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("embedding_lookup_idx").on(
      table.tenant_id,
      table.source_type,
      table.source_id,
      table.chunk_index,
    ),
  ],
)

export type Embedding = typeof embedding.$inferSelect
export type NewEmbedding = typeof embedding.$inferInsert
