import type {
  EvaluationInput,
  EvaluationResult,
  LeafCondition,
  PermissionCondition,
  PermissionDecision,
  PermissionRule,
} from "./types.ts"

export interface PermissionEvaluatorConfig {
  rules: PermissionRule[]
  defaultDecision?: PermissionDecision
}

function getPath(root: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".")
  let cur: unknown = root
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function evalCondition(
  cond: PermissionCondition,
  ctx: { input: unknown; context: unknown },
): boolean {
  if (cond.op === "and") return cond.children.every((c) => evalCondition(c, ctx))
  if (cond.op === "or") return cond.children.some((c) => evalCondition(c, ctx))
  if (cond.op === "not") return !cond.children.every((c) => evalCondition(c, ctx))
  const leaf = cond as LeafCondition
  const root: Record<string, unknown> = { input: ctx.input, context: ctx.context }
  const value = getPath(root, leaf.path)
  switch (leaf.op) {
    case "eq":
      return value === leaf.value
    case "in":
      return Array.isArray(leaf.value) && (leaf.value as unknown[]).includes(value)
    case "starts_with":
      return (
        typeof value === "string" && typeof leaf.value === "string" && value.startsWith(leaf.value)
      )
    case "matches":
      return (
        typeof value === "string" &&
        typeof leaf.value === "string" &&
        new RegExp(leaf.value).test(value)
      )
  }
}

function tokenMatches(rule: string, actual: string): boolean {
  return rule === "*" || rule === actual
}

export class PermissionEvaluator {
  private readonly rules: PermissionRule[]
  private readonly defaultDecision: PermissionDecision

  constructor(cfg: PermissionEvaluatorConfig) {
    this.rules = cfg.rules
    this.defaultDecision = cfg.defaultDecision ?? "ask"
  }

  evaluate(input: EvaluationInput): EvaluationResult {
    for (const rule of this.rules) {
      if (!tokenMatches(rule.tool, input.tool)) continue
      if (!tokenMatches(rule.action, input.action)) continue
      if (rule.when) {
        const ok = evalCondition(rule.when, {
          input: input.input,
          context: input.context ?? {},
        })
        if (!ok) continue
      }
      return { decision: rule.decision, reason: rule.reason, matchedRule: rule }
    }
    return { decision: this.defaultDecision }
  }
}
