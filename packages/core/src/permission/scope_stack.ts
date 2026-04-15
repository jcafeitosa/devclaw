import { PermissionEvaluator } from "./evaluator.ts"
import type { PermissionRuleStore } from "./store.ts"
import type {
  EvaluationInput,
  EvaluationResult,
  PermissionDecision,
  PermissionRule,
} from "./types.ts"

export const DEFAULT_PRECEDENCE = ["session", "agent", "project", "tenant"] as const

export interface ScopedPermissionEvaluatorConfig {
  scopes: Record<string, PermissionRule[]>
  precedence?: readonly string[]
  defaultDecision?: PermissionDecision
}

export class ScopedPermissionEvaluator {
  private readonly scopes: Record<string, PermissionEvaluator>
  private readonly precedence: readonly string[]
  private readonly defaultDecision: PermissionDecision

  constructor(cfg: ScopedPermissionEvaluatorConfig) {
    this.scopes = {}
    for (const [name, rules] of Object.entries(cfg.scopes)) {
      this.scopes[name] = new PermissionEvaluator({ rules })
    }
    this.precedence = cfg.precedence ?? DEFAULT_PRECEDENCE
    this.defaultDecision = cfg.defaultDecision ?? "ask"
  }

  evaluate(input: EvaluationInput): EvaluationResult {
    for (const name of this.precedence) {
      const ev = this.scopes[name]
      if (!ev) continue
      const r = ev.evaluate(input)
      if (r.matchedRule) return { ...r, scope: name }
    }
    return { decision: this.defaultDecision }
  }
}

export interface PersistentScopedPermissionEvaluatorConfig {
  store: PermissionRuleStore
  scopes: Record<string, string>
  precedence?: readonly string[]
  defaultDecision?: PermissionDecision
}

export class PersistentScopedPermissionEvaluator {
  private readonly store: PermissionRuleStore
  private readonly scopeRefs: Record<string, string>
  private readonly precedence: readonly string[]
  private readonly defaultDecision: PermissionDecision
  private current: ScopedPermissionEvaluator
  private readonly syncing: Promise<void>

  constructor(cfg: PersistentScopedPermissionEvaluatorConfig) {
    this.store = cfg.store
    this.scopeRefs = { ...cfg.scopes }
    this.precedence = cfg.precedence ?? DEFAULT_PRECEDENCE
    this.defaultDecision = cfg.defaultDecision ?? "ask"
    this.current = new ScopedPermissionEvaluator({
      scopes: {},
      precedence: this.precedence,
      defaultDecision: this.defaultDecision,
    })
    this.syncing = this.sync()
    this.store.events.on("rule_changed", ({ scope, scopeRef }) => {
      if (this.scopeRefs[scope] !== scopeRef) return
      void this.sync()
    })
  }

  async ready(): Promise<void> {
    await this.syncing
  }

  async sync(): Promise<void> {
    const scopes: Record<string, PermissionRule[]> = {}
    for (const [scope, scopeRef] of Object.entries(this.scopeRefs)) {
      const rules = await this.store.list({ scope, scopeRef })
      scopes[scope] = rules.map((rule) => ({
        tool: rule.tool,
        action: rule.action,
        when: rule.when,
        decision: rule.decision,
        reason: rule.reason,
      }))
    }
    this.current = new ScopedPermissionEvaluator({
      scopes,
      precedence: this.precedence,
      defaultDecision: this.defaultDecision,
    })
  }

  evaluate(input: EvaluationInput): EvaluationResult {
    return this.current.evaluate(input)
  }
}
