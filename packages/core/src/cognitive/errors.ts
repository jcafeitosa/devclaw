export type CognitiveErrorCode =
  | "BASE"
  | "PLAN_PARSE"
  | "CYCLE"
  | "NO_ROUTE"
  | "STEP_FAILED"
  | "MAX_STEPS"

export class CognitiveError extends Error {
  readonly code: CognitiveErrorCode
  constructor(message: string, code: CognitiveErrorCode = "BASE") {
    super(message)
    this.name = "CognitiveError"
    this.code = code
  }
}

export class PlanParseError extends CognitiveError {
  override readonly cause: unknown
  constructor(raw: string, cause: unknown) {
    super(
      `cognitive: plan parse failed from ${raw.slice(0, 120)}…: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      "PLAN_PARSE",
    )
    this.name = "PlanParseError"
    this.cause = cause
  }
}

export class PlanCycleError extends CognitiveError {
  readonly cycle: string[]
  constructor(cycle: string[]) {
    super(`cognitive: plan has cycle through ${cycle.join(" → ")}`, "CYCLE")
    this.name = "PlanCycleError"
    this.cycle = cycle
  }
}

export class NoRouteError extends CognitiveError {
  readonly tier: string
  constructor(tier: string) {
    super(`cognitive: no provider configured for tier '${tier}' (or fallbacks)`, "NO_ROUTE")
    this.name = "NoRouteError"
    this.tier = tier
  }
}

export class StepFailedError extends CognitiveError {
  readonly stepId: string
  override readonly cause: unknown
  constructor(stepId: string, cause: unknown) {
    super(
      `cognitive: step '${stepId}' failed: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      "STEP_FAILED",
    )
    this.name = "StepFailedError"
    this.stepId = stepId
    this.cause = cause
  }
}

export class MaxStepsExceededError extends CognitiveError {
  readonly max: number
  constructor(max: number) {
    super(`cognitive: exceeded max steps (${max})`, "MAX_STEPS")
    this.name = "MaxStepsExceededError"
    this.max = max
  }
}
