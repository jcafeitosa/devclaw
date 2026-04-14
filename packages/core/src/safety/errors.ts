import type { ModerationFlag, ModerationMode } from "./types.ts"

export type SafetyErrorCode = "MODERATION_BLOCKED"

export class SafetyViolationError extends Error {
  readonly code: SafetyErrorCode
  readonly recoverable: boolean
  readonly mode: ModerationMode
  readonly flags: ModerationFlag[]

  constructor(mode: ModerationMode, flags: ModerationFlag[]) {
    super(`safety blocked ${mode}: ${flags.map((flag) => flag.category).join(", ")}`)
    this.name = "SafetyViolationError"
    this.code = "MODERATION_BLOCKED"
    this.recoverable = false
    this.mode = mode
    this.flags = flags
  }
}
