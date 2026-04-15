import type { ModerationFlag } from "../safety/types.ts"

export class PermissionDeniedError extends Error {
  readonly code = "PERMISSION_DENIED" as const
  readonly recoverable = false
  readonly action: string
  readonly tool: string
  readonly reason?: string

  constructor(action: string, tool: string, reason?: string) {
    super(`permission denied: ${tool}.${action}${reason ? ` (${reason})` : ""}`)
    this.name = "PermissionDeniedError"
    this.action = action
    this.tool = tool
    this.reason = reason
  }
}

export type SafetyBlockMode = "input" | "output"

export class SafetyBlockedError extends Error {
  readonly code = "SAFETY_BLOCKED" as const
  readonly recoverable = false
  readonly mode: SafetyBlockMode
  readonly flags: readonly ModerationFlag[]

  constructor(mode: SafetyBlockMode, flags: readonly ModerationFlag[]) {
    const cats = flags.map((flag) => flag.category).join(",")
    super(`safety blocked ${mode}: ${cats || "unknown"}`)
    this.name = "SafetyBlockedError"
    this.mode = mode
    this.flags = flags
  }
}
