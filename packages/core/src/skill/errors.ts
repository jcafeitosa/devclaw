export type SkillErrorCode = "BASE" | "NOT_FOUND" | "INVALID_TRANSITION" | "PARSE"

export class SkillError extends Error {
  readonly code: SkillErrorCode
  constructor(message: string, code: SkillErrorCode = "BASE") {
    super(message)
    this.name = "SkillError"
    this.code = code
  }
}

export class SkillNotFoundError extends SkillError {
  readonly id: string
  readonly version?: string
  constructor(id: string, version?: string) {
    super(`skill '${id}${version ? `@${version}` : ""}' not found`, "NOT_FOUND")
    this.name = "SkillNotFoundError"
    this.id = id
    this.version = version
  }
}

export class SkillTransitionError extends SkillError {
  readonly from: string
  readonly to: string
  constructor(from: string, to: string) {
    super(`skill: invalid transition ${from} → ${to}`, "INVALID_TRANSITION")
    this.name = "SkillTransitionError"
    this.from = from
    this.to = to
  }
}

export class SkillParseError extends SkillError {
  override readonly cause: unknown
  constructor(name: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`skill '${name}': parse failed: ${msg}`, "PARSE")
    this.name = "SkillParseError"
    this.cause = cause
  }
}
