export type ReflectionErrorCode = "BASE" | "EVAL_FAILED" | "REFLECT_FAILED"

export class ReflectionError extends Error {
  readonly code: ReflectionErrorCode
  constructor(message: string, code: ReflectionErrorCode = "BASE") {
    super(message)
    this.name = "ReflectionError"
    this.code = code
  }
}

export class EvaluationFailedError extends ReflectionError {
  readonly stepId: string
  override readonly cause: unknown
  constructor(stepId: string, cause: unknown) {
    super(
      `reflection: evaluation failed for '${stepId}': ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      "EVAL_FAILED",
    )
    this.name = "EvaluationFailedError"
    this.stepId = stepId
    this.cause = cause
  }
}

export class ReflectFailedError extends ReflectionError {
  override readonly cause: unknown
  constructor(cause: unknown) {
    super(
      `reflection: reflect failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      "REFLECT_FAILED",
    )
    this.name = "ReflectFailedError"
    this.cause = cause
  }
}
