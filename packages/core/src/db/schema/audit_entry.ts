import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const audit_entry = sqliteTable(
  "audit_entry",
  {
    id: text("id").primaryKey(),
    tenant_id: text("tenant_id").notNull(),
    timestamp: integer("timestamp").notNull(),
    actor_type: text("actor_type", {
      enum: ["user", "agent", "system", "service_account"],
    }).notNull(),
    actor_id: text("actor_id").notNull(),
    session_id: text("session_id"),
    action: text("action").notNull(),
    target_type: text("target_type"),
    target_id: text("target_id"),
    project_id: text("project_id"),
    params: text("params", { mode: "json" }).$type<Record<string, unknown> | null>(),
    result: text("result", { enum: ["success", "denied", "error"] }).notNull(),
    rationale: text("rationale"),
    risk_level: text("risk_level", { enum: ["low", "medium", "high", "critical"] }),
    approval_id: text("approval_id"),
    ip: text("ip"),
    user_agent: text("user_agent"),
    request_id: text("request_id"),
    trace_id: text("trace_id"),
    prev_checksum: text("prev_checksum"),
    checksum: text("checksum").notNull(),
  },
  (table) => [index("audit_entry_tenant_time_idx").on(table.tenant_id, table.timestamp)],
)

export type AuditEntry = typeof audit_entry.$inferSelect
export type NewAuditEntry = typeof audit_entry.$inferInsert
