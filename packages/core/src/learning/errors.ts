export type LearningErrorCode =
  | "BASE"
  | "NOT_FOUND"
  | "INVALID_CAPSULE"
  | "NOT_READY_FOR_PROMOTION"
  | "IMPORT_FAILED"

export class LearningError extends Error {
  readonly code: LearningErrorCode
  constructor(message: string, code: LearningErrorCode = "BASE") {
    super(message)
    this.name = "LearningError"
    this.code = code
  }
}

export class CapsuleNotFoundError extends LearningError {
  readonly id: string
  constructor(id: string) {
    super(`learning: capsule '${id}' not found`, "NOT_FOUND")
    this.name = "CapsuleNotFoundError"
    this.id = id
  }
}

export class InvalidCapsuleError extends LearningError {
  readonly issues: string[]
  constructor(issues: string[]) {
    super(`learning: invalid capsule — ${issues.join("; ")}`, "INVALID_CAPSULE")
    this.name = "InvalidCapsuleError"
    this.issues = [...issues]
  }
}

export class NotReadyForPromotionError extends LearningError {
  readonly id: string
  readonly reasons: string[]
  constructor(id: string, reasons: string[]) {
    super(
      `learning: capsule '${id}' not ready for promotion — ${reasons.join("; ")}`,
      "NOT_READY_FOR_PROMOTION",
    )
    this.name = "NotReadyForPromotionError"
    this.id = id
    this.reasons = [...reasons]
  }
}

export class CapsuleImportError extends LearningError {
  override readonly cause: unknown
  constructor(cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`learning: capsule import failed: ${msg}`, "IMPORT_FAILED")
    this.name = "CapsuleImportError"
    this.cause = cause
  }
}
