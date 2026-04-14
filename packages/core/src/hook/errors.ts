export type HookErrorCode = "BASE" | "BLOCKED" | "GATE_BLOCKED"

export class HookError extends Error {
  readonly code: HookErrorCode
  constructor(message: string, code: HookErrorCode = "BASE") {
    super(message)
    this.name = "HookError"
    this.code = code
  }
}

export class HookBlockedError extends HookError {
  readonly hookName: string
  readonly reason: string
  constructor(hookName: string, reason: string) {
    super(`hook '${hookName}' blocked execution: ${reason}`, "BLOCKED")
    this.name = "HookBlockedError"
    this.hookName = hookName
    this.reason = reason
  }
}

export class GateBlockedError extends HookError {
  readonly gate: string
  readonly reasons: string[]
  constructor(gate: string, reasons: string[]) {
    super(`gate '${gate}' blocked: ${reasons.join("; ")}`, "GATE_BLOCKED")
    this.name = "GateBlockedError"
    this.gate = gate
    this.reasons = [...reasons]
  }
}
