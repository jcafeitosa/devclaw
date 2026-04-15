import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

import { task } from "./task.ts"
import { tenant } from "./tenant.ts"

export const ecap_capsule = sqliteTable(
  "ecap_capsule",
  {
    id: text("id").primaryKey(),
    tenant_id: text("tenant_id")
      .notNull()
      .references(() => tenant.id),
    agent_id: text("agent_id").notNull(),
    domain: text("domain").notNull(),
    task_id: text("task_id").references(() => task.id),
    triplet_instinct: text("triplet_instinct").notNull(),
    triplet_experience: text("triplet_experience").notNull(),
    triplet_skill: text("triplet_skill").notNull(),
    observations: text("observations", { mode: "json" }).$type<string[]>().notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown> | null>(),
    goal_id: text("goal_id").$type<string | null>(),
    feedback_applications_count: integer("feedback_applications_count").notNull().default(0),
    feedback_success_count: integer("feedback_success_count").notNull().default(0),
    feedback_score_avg: real("feedback_score_avg"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [index("ecap_capsule_agent_idx").on(table.tenant_id, table.agent_id, table.domain)],
)

export type EcapCapsule = typeof ecap_capsule.$inferSelect
export type NewEcapCapsule = typeof ecap_capsule.$inferInsert
