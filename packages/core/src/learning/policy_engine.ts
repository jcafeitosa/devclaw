import type { Capsule, PolicyAction, PolicyInput, PolicyRule } from "./types.ts"

export interface PolicyEvaluation {
  ruleId: string
  description: string
  actions: PolicyAction[]
}

export interface DerivationOptions {
  minScore?: number
  minApplications?: number
}

export class PolicyEngine {
  private readonly rules: PolicyRule[] = []

  register(rule: PolicyRule): void {
    if (this.rules.some((r) => r.id === rule.id)) {
      throw new Error(`policy: rule '${rule.id}' already registered`)
    }
    this.rules.push({ enabled: true, ...rule })
  }

  unregister(id: string): void {
    const idx = this.rules.findIndex((r) => r.id === id)
    if (idx >= 0) this.rules.splice(idx, 1)
  }

  enable(id: string, enabled: boolean): void {
    const rule = this.rules.find((r) => r.id === id)
    if (rule) rule.enabled = enabled
  }

  list(): PolicyRule[] {
    return [...this.rules]
  }

  evaluate(input: PolicyInput): PolicyEvaluation[] {
    const out: PolicyEvaluation[] = []
    for (const rule of this.rules) {
      if (rule.enabled === false) continue
      if (!rule.match(input)) continue
      out.push({ ruleId: rule.id, description: rule.description, actions: [...rule.actions] })
    }
    return out
  }

  deriveFromCapsules(capsules: Capsule[], opts: DerivationOptions = {}): PolicyRule[] {
    const minScore = opts.minScore ?? 0.7
    const minApplications = opts.minApplications ?? 3
    const derived: PolicyRule[] = []
    for (const capsule of capsules) {
      if ((capsule.feedback.averageScore ?? 0) < minScore) continue
      if (capsule.feedback.applications < minApplications) continue
      if (capsule.type !== "individual") continue
      const tags = capsule.metadata.tags
      const domain = capsule.domain
      const rule: PolicyRule = {
        id: `policy_from_${capsule.id}`,
        description: `auto-derived from capsule ${capsule.id}: ${capsule.triplet.instinct}`,
        match: (input) => {
          if (input.domain && input.domain !== domain) return false
          if (tags.length > 0 && input.tags && !tags.some((t) => input.tags?.includes(t))) {
            return false
          }
          return true
        },
        actions: [
          {
            kind: "inject-context",
            description: capsule.triplet.experience,
            payload: { instinct: capsule.triplet.instinct },
          },
          {
            kind: "prefer-skill",
            description: capsule.triplet.skill,
          },
        ],
        sourceCapsuleId: capsule.id,
      }
      derived.push(rule)
    }
    return derived
  }
}
