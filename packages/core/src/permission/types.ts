export type PermissionDecision = "allow" | "ask" | "deny"

export type LeafConditionOp = "eq" | "in" | "starts_with" | "matches"

export type CompositeConditionOp = "and" | "or" | "not"

export type LeafCondition = {
  op: LeafConditionOp
  path: string
  value: unknown
}

export type CompositeCondition = {
  op: CompositeConditionOp
  children: PermissionCondition[]
}

export type PermissionCondition = LeafCondition | CompositeCondition

export interface PermissionRule {
  tool: string
  action: string
  when?: PermissionCondition
  decision: PermissionDecision
  reason?: string
}

export interface EvaluationInput {
  tool: string
  action: string
  input: Record<string, unknown>
  context?: Record<string, unknown>
}

export interface EvaluationResult {
  decision: PermissionDecision
  reason?: string
  matchedRule?: PermissionRule
  scope?: string
}
