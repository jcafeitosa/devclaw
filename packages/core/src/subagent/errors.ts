export type SubagentErrorCode =
  | "BASE"
  | "BUDGET_EXCEEDED"
  | "ISOLATION_FAILED"
  | "NOT_SUPPORTED"
  | "DELEGATE_STRIPPED"
  | "EXEC_FAILED"

export class SubagentError extends Error {
  readonly code: SubagentErrorCode
  readonly subagentId: string
  constructor(message: string, code: SubagentErrorCode, subagentId: string) {
    super(message)
    this.name = "SubagentError"
    this.code = code
    this.subagentId = subagentId
  }
}

export class BudgetExceededError extends SubagentError {
  readonly limit: string
  constructor(subagentId: string, limit: string, value: number, threshold: number) {
    super(
      `subagent ${subagentId}: budget exceeded (${limit} ${value} > ${threshold})`,
      "BUDGET_EXCEEDED",
      subagentId,
    )
    this.name = "BudgetExceededError"
    this.limit = limit
  }
}

export class IsolationFailedError extends SubagentError {
  override readonly cause: unknown
  constructor(subagentId: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`subagent ${subagentId}: isolation failed: ${msg}`, "ISOLATION_FAILED", subagentId)
    this.name = "IsolationFailedError"
    this.cause = cause
  }
}

export class NotSupportedError extends SubagentError {
  constructor(subagentId: string, detail: string) {
    super(`subagent ${subagentId}: not supported — ${detail}`, "NOT_SUPPORTED", subagentId)
    this.name = "NotSupportedError"
  }
}

export class DelegateStrippedError extends SubagentError {
  constructor(subagentId: string) {
    super(
      `subagent ${subagentId}: delegate stripping active — cannot spawn nested subagent`,
      "DELEGATE_STRIPPED",
      subagentId,
    )
    this.name = "DelegateStrippedError"
  }
}

export class SubagentExecFailedError extends SubagentError {
  override readonly cause: unknown
  constructor(subagentId: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`subagent ${subagentId}: exec failed: ${msg}`, "EXEC_FAILED", subagentId)
    this.name = "SubagentExecFailedError"
    this.cause = cause
  }
}
