import { PermissionEvaluator } from "./evaluator.ts"
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
