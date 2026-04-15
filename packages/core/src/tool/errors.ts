export type ToolErrorCode = "BASE" | "VALIDATION" | "PERMISSION" | "TIMEOUT" | "EXEC" | "SAFETY"

export class ToolError extends Error {
  readonly code: ToolErrorCode
  readonly toolId: string
  constructor(message: string, code: ToolErrorCode, toolId: string) {
    super(message)
    this.name = "ToolError"
    this.code = code
    this.toolId = toolId
  }
}

export class ToolValidationError extends ToolError {
  readonly issues: string[]
  constructor(toolId: string, issues: string[]) {
    super(`tool ${toolId}: invalid input — ${issues.join("; ")}`, "VALIDATION", toolId)
    this.name = "ToolValidationError"
    this.issues = [...issues]
  }
}

export class ToolPermissionError extends ToolError {
  readonly agentId: string
  readonly reason: string
  constructor(toolId: string, agentId: string, reason: string) {
    super(`tool ${toolId}: permission denied for ${agentId}: ${reason}`, "PERMISSION", toolId)
    this.name = "ToolPermissionError"
    this.agentId = agentId
    this.reason = reason
  }
}

export class ToolTimeoutError extends ToolError {
  readonly timeoutMs: number
  constructor(toolId: string, timeoutMs: number) {
    super(`tool ${toolId}: timed out after ${timeoutMs}ms`, "TIMEOUT", toolId)
    this.name = "ToolTimeoutError"
    this.timeoutMs = timeoutMs
  }
}

export class ToolExecError extends ToolError {
  override readonly cause: unknown
  constructor(toolId: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`tool ${toolId}: execution failed: ${msg}`, "EXEC", toolId)
    this.name = "ToolExecError"
    this.cause = cause
  }
}

export class ToolSafetyError extends ToolError {
  readonly mode: "input" | "output"
  readonly categories: string[]
  constructor(toolId: string, mode: "input" | "output", categories: string[]) {
    super(`tool ${toolId}: safety ${mode} blocked (${categories.join(",")})`, "SAFETY", toolId)
    this.name = "ToolSafetyError"
    this.mode = mode
    this.categories = [...categories]
  }
}
