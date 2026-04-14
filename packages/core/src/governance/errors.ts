export type GovernanceErrorCode =
  | "BASE"
  | "GATE_NOT_REGISTERED"
  | "REQUEST_NOT_FOUND"
  | "BUDGET_EXCEEDED"
  | "ORPHAN_GOAL"
  | "NO_OWNER"

export class GovernanceError extends Error {
  readonly code: GovernanceErrorCode
  constructor(message: string, code: GovernanceErrorCode = "BASE") {
    super(message)
    this.name = "GovernanceError"
    this.code = code
  }
}

export class GateNotRegisteredError extends GovernanceError {
  readonly gate: string
  constructor(gate: string) {
    super(`governance: gate '${gate}' not registered`, "GATE_NOT_REGISTERED")
    this.name = "GateNotRegisteredError"
    this.gate = gate
  }
}

export class ApprovalRequestNotFoundError extends GovernanceError {
  readonly id: string
  constructor(id: string) {
    super(`governance: approval request '${id}' not found`, "REQUEST_NOT_FOUND")
    this.name = "ApprovalRequestNotFoundError"
    this.id = id
  }
}

export class GovernanceBudgetExceededError extends GovernanceError {
  readonly scopeId: string
  readonly limitKind: "soft" | "hard"
  readonly value: number
  readonly limit: number
  constructor(scopeId: string, kind: "soft" | "hard", value: number, limit: number) {
    super(
      `governance: budget scope '${scopeId}' ${kind} limit breached (${value} > ${limit})`,
      "BUDGET_EXCEEDED",
    )
    this.name = "GovernanceBudgetExceededError"
    this.scopeId = scopeId
    this.limitKind = kind
    this.value = value
    this.limit = limit
  }
}

export class OrphanGoalError extends GovernanceError {
  readonly child: string
  readonly expectedParent: string
  constructor(child: string, expectedParent: string) {
    super(`governance: goal '${child}' missing parent of kind '${expectedParent}'`, "ORPHAN_GOAL")
    this.name = "OrphanGoalError"
    this.child = child
    this.expectedParent = expectedParent
  }
}

export class NoOwnerError extends GovernanceError {
  readonly itemId: string
  constructor(itemId: string) {
    super(`governance: item '${itemId}' has no accountable owner`, "NO_OWNER")
    this.name = "NoOwnerError"
    this.itemId = itemId
  }
}
