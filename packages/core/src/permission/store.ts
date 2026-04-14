import { Database } from "bun:sqlite"

import { genDbId } from "../db/id.ts"
import { EventEmitter } from "../util/event_emitter.ts"
import type { PermissionDecision, PermissionRule } from "./types.ts"

export type PermissionScope = "tenant" | "project" | "agent" | "session" | (string & {})

export interface PersistedPermissionRule extends PermissionRule {
  id: string
  scope: PermissionScope
  scopeRef: string
  createdAt: number
  revokedAt?: number
}

export interface PermissionRuleInput extends PermissionRule {
  id?: string
  scope: PermissionScope
  scopeRef: string
  createdAt?: number
  revokedAt?: number
}

export interface PermissionRuleQuery {
  scope?: PermissionScope
  scopeRef?: string
  includeRevoked?: boolean
}

export interface PermissionRuleStoreConfig {
  sqlitePath?: string
}

export interface PermissionRuleStoreEvents extends Record<string, unknown> {
  rule_changed: {
    id: string
    scope: PermissionScope
    scopeRef: string
    decision: PermissionDecision
    revoked: boolean
  }
}

export class PermissionRuleStore {
  readonly events = new EventEmitter<PermissionRuleStoreEvents>()
  private readonly rules = new Map<string, PersistedPermissionRule>()
  private readonly sqlite: Database | null

  constructor(cfg: PermissionRuleStoreConfig = {}) {
    this.sqlite = openStore(cfg.sqlitePath)
    if (!this.sqlite) return
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS permission_rules (
        id TEXT PRIMARY KEY NOT NULL,
        scope TEXT NOT NULL,
        scope_ref TEXT NOT NULL,
        tool TEXT NOT NULL,
        action TEXT NOT NULL,
        when_json TEXT,
        decision TEXT NOT NULL,
        reason TEXT,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      )
    `)
  }

  async upsert(input: PermissionRuleInput): Promise<PersistedPermissionRule> {
    const rule: PersistedPermissionRule = {
      id: input.id ?? genDbId("session"),
      scope: input.scope,
      scopeRef: input.scopeRef,
      tool: input.tool,
      action: input.action,
      when: input.when,
      decision: input.decision,
      reason: input.reason,
      createdAt: input.createdAt ?? Date.now(),
      revokedAt: input.revokedAt,
    }
    this.write(rule)
    this.rules.set(rule.id, rule)
    this.events.emit("rule_changed", {
      id: rule.id,
      scope: rule.scope,
      scopeRef: rule.scopeRef,
      decision: rule.decision,
      revoked: Boolean(rule.revokedAt),
    })
    return { ...rule }
  }

  async revoke(id: string, at = Date.now()): Promise<void> {
    const rule = await this.get(id)
    const revoked: PersistedPermissionRule = { ...rule, revokedAt: at }
    this.write(revoked)
    this.rules.set(id, revoked)
    this.events.emit("rule_changed", {
      id,
      scope: revoked.scope,
      scopeRef: revoked.scopeRef,
      decision: revoked.decision,
      revoked: true,
    })
  }

  async get(id: string): Promise<PersistedPermissionRule> {
    const persisted = this.read(id)
    if (persisted) return persisted
    const rule = this.rules.get(id)
    if (!rule) throw new Error(`permission rule not found: ${id}`)
    return { ...rule }
  }

  async list(query: PermissionRuleQuery = {}): Promise<PersistedPermissionRule[]> {
    if (this.sqlite) return this.all(query)
    return [...this.rules.values()]
      .filter((rule) => matchesRule(rule, query))
      .map((rule) => ({ ...rule }))
      .sort(byCreatedAt)
  }

  async close(): Promise<void> {
    this.sqlite?.close()
    this.rules.clear()
  }

  private all(query: PermissionRuleQuery): PersistedPermissionRule[] {
    if (!this.sqlite) return []
    const clauses: string[] = []
    const params: Array<string | number> = []
    if (query.scope) {
      clauses.push("scope = ?")
      params.push(query.scope)
    }
    if (query.scopeRef) {
      clauses.push("scope_ref = ?")
      params.push(query.scopeRef)
    }
    if (!query.includeRevoked) clauses.push("revoked_at IS NULL")
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : ""
    const rows = this.sqlite
      .query(`SELECT * FROM permission_rules${where} ORDER BY created_at ASC`)
      .all(...params) as RawRuleRow[]
    const rules = rows.map(parseRow)
    this.rules.clear()
    for (const rule of rules) this.rules.set(rule.id, rule)
    return rules
  }

  private read(id: string): PersistedPermissionRule | null {
    if (!this.sqlite) return null
    const row = this.sqlite
      .query("SELECT * FROM permission_rules WHERE id = ?")
      .get(id) as RawRuleRow | null
    if (!row) return null
    const rule = parseRow(row)
    this.rules.set(rule.id, rule)
    return rule
  }

  private write(rule: PersistedPermissionRule): void {
    if (this.sqlite) {
      this.sqlite
        .query(
          `INSERT OR REPLACE INTO permission_rules
            (id, scope, scope_ref, tool, action, when_json, decision, reason, created_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          rule.id,
          rule.scope,
          rule.scopeRef,
          rule.tool,
          rule.action,
          rule.when ? JSON.stringify(rule.when) : null,
          rule.decision,
          rule.reason ?? null,
          rule.createdAt,
          rule.revokedAt ?? null,
        )
    }
  }
}

interface RawRuleRow {
  id: string
  scope: string
  scope_ref: string
  tool: string
  action: string
  when_json: string | null
  decision: PermissionDecision
  reason: string | null
  created_at: number
  revoked_at: number | null
}

function parseRow(row: RawRuleRow): PersistedPermissionRule {
  return {
    id: row.id,
    scope: row.scope,
    scopeRef: row.scope_ref,
    tool: row.tool,
    action: row.action,
    when: row.when_json ? (JSON.parse(row.when_json) as PermissionRule["when"]) : undefined,
    decision: row.decision,
    reason: row.reason ?? undefined,
    createdAt: row.created_at,
    revokedAt: row.revoked_at ?? undefined,
  }
}

function matchesRule(rule: PersistedPermissionRule, query: PermissionRuleQuery): boolean {
  if (query.scope && rule.scope !== query.scope) return false
  if (query.scopeRef && rule.scopeRef !== query.scopeRef) return false
  if (!query.includeRevoked && rule.revokedAt !== undefined) return false
  return true
}

function byCreatedAt(a: PersistedPermissionRule, b: PersistedPermissionRule): number {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id)
}

function openStore(path?: string): Database | null {
  if (!path) return null
  try {
    return new Database(path, { create: true })
  } catch {
    return null
  }
}
