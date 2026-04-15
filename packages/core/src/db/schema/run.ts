import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core"

import { task } from "./task.ts"
import { tenant } from "./tenant.ts"

export const run = sqliteTable(
  "run",
  {
    id: text("id").primaryKey(),
    tenant_id: text("tenant_id")
      .notNull()
      .references(() => tenant.id),
    task_id: text("task_id").references(() => task.id),
    agent_id: text("agent_id").notNull(),
    session_id: text("session_id").notNull(),
    parent_run_id: text("parent_run_id").references((): AnySQLiteColumn => run.id),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed", "cancelled", "timeout"],
    }).notNull(),
    provider_id: text("provider_id").notNull(),
    model_id: text("model_id").notNull(),
    cli_bridge: text("cli_bridge", { enum: ["claude", "codex", "gemini", "aider", "api"] }),
    cwd: text("cwd").notNull(),
    prompt_tokens: integer("prompt_tokens"),
    output_tokens: integer("output_tokens"),
    cached_tokens: integer("cached_tokens"),
    cost_usd: real("cost_usd"),
    duration_ms: integer("duration_ms"),
    started_at: integer("started_at").notNull(),
    ended_at: integer("ended_at"),
  },
  (table) => [index("run_tenant_idx").on(table.tenant_id, table.status, table.started_at)],
)

export type Run = typeof run.$inferSelect
export type NewRun = typeof run.$inferInsert
