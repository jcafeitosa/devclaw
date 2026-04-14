export type CorrectionErrorCode = "BASE" | "BUDGET_EXCEEDED" | "NO_HYPOTHESIS"

export class CorrectionError extends Error {
  readonly code: CorrectionErrorCode
  constructor(message: string, code: CorrectionErrorCode = "BASE") {
    super(message)
    this.name = "CorrectionError"
    this.code = code
  }
}

export class CorrectionBudgetExceededError extends CorrectionError {
  readonly limit: string
  readonly value: number
  readonly threshold: number
  constructor(limit: string, value: number, threshold: number) {
    super(`correction: ${limit} ${value} exceeded ${threshold}`, "BUDGET_EXCEEDED")
    this.name = "CorrectionBudgetExceededError"
    this.limit = limit
    this.value = value
    this.threshold = threshold
  }
}

export class NoHypothesisError extends CorrectionError {
  constructor(signal: string) {
    super(`correction: no hypotheses for signal '${signal}'`, "NO_HYPOTHESIS")
    this.name = "NoHypothesisError"
  }
}
