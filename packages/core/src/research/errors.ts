export type ResearchErrorCode = "BASE" | "SOURCE_FAILED" | "BUDGET_EXCEEDED" | "NO_RESULTS"

export class ResearchError extends Error {
  readonly code: ResearchErrorCode
  constructor(message: string, code: ResearchErrorCode = "BASE") {
    super(message)
    this.name = "ResearchError"
    this.code = code
  }
}

export class SourceFailedError extends ResearchError {
  readonly sourceId: string
  override readonly cause: unknown
  constructor(sourceId: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`research: source '${sourceId}' failed: ${msg}`, "SOURCE_FAILED")
    this.name = "SourceFailedError"
    this.sourceId = sourceId
    this.cause = cause
  }
}

export class ResearchBudgetExceededError extends ResearchError {
  readonly limit: number
  readonly used: number
  constructor(limit: number, used: number) {
    super(`research: call limit ${limit} exceeded (used ${used})`, "BUDGET_EXCEEDED")
    this.name = "ResearchBudgetExceededError"
    this.limit = limit
    this.used = used
  }
}

export class NoResultsError extends ResearchError {
  readonly query: string
  constructor(query: string) {
    super(`research: no results for query "${query.slice(0, 120)}"`, "NO_RESULTS")
    this.name = "NoResultsError"
    this.query = query
  }
}
