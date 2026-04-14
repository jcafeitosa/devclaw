export type ContextErrorCode = "BASE" | "EMPTY" | "QUALITY" | "SOURCE"

export class ContextError extends Error {
  readonly code: ContextErrorCode
  constructor(message: string, code: ContextErrorCode = "BASE") {
    super(message)
    this.name = "ContextError"
    this.code = code
  }
}

export class ContextEmptyError extends ContextError {
  constructor(reason: string) {
    super(`context: empty — ${reason}`, "EMPTY")
    this.name = "ContextEmptyError"
  }
}

export class ContextQualityError extends ContextError {
  readonly score: number
  readonly threshold: number
  constructor(reason: string, score: number, threshold: number) {
    super(`context: quality below threshold (${score} < ${threshold}) — ${reason}`, "QUALITY")
    this.name = "ContextQualityError"
    this.score = score
    this.threshold = threshold
  }
}

export class ContextSourceError extends ContextError {
  readonly sourceId: string
  override readonly cause: unknown
  constructor(sourceId: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`context: source '${sourceId}' failed: ${msg}`, "SOURCE")
    this.name = "ContextSourceError"
    this.sourceId = sourceId
    this.cause = cause
  }
}
