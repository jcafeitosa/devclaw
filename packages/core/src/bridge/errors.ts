export type BridgeErrorCode =
  | "BASE"
  | "NOT_AVAILABLE"
  | "NOT_AUTHENTICATED"
  | "TIMEOUT"
  | "CANCELLED"
  | "EXEC_FAILED"
  | "PARSE"

export class BridgeError extends Error {
  readonly code: BridgeErrorCode
  readonly cli: string
  constructor(message: string, cli: string, code: BridgeErrorCode = "BASE") {
    super(message)
    this.name = "BridgeError"
    this.code = code
    this.cli = cli
  }
}

export class BridgeNotAvailableError extends BridgeError {
  constructor(cli: string) {
    super(`bridge: '${cli}' not available (binary missing)`, cli, "NOT_AVAILABLE")
    this.name = "BridgeNotAvailableError"
  }
}

export class BridgeNotAuthenticatedError extends BridgeError {
  constructor(cli: string) {
    super(`bridge: '${cli}' not authenticated`, cli, "NOT_AUTHENTICATED")
    this.name = "BridgeNotAuthenticatedError"
  }
}

export class BridgeTimeoutError extends BridgeError {
  readonly timeoutMs: number
  constructor(cli: string, timeoutMs: number) {
    super(`bridge: '${cli}' timed out after ${timeoutMs}ms`, cli, "TIMEOUT")
    this.name = "BridgeTimeoutError"
    this.timeoutMs = timeoutMs
  }
}

export class BridgeCancelledError extends BridgeError {
  readonly taskId: string
  constructor(cli: string, taskId: string) {
    super(`bridge: '${cli}' task '${taskId}' cancelled`, cli, "CANCELLED")
    this.name = "BridgeCancelledError"
    this.taskId = taskId
  }
}

export class BridgeExecFailedError extends BridgeError {
  readonly exitCode: number
  readonly stderr: string
  constructor(cli: string, exitCode: number, stderr: string) {
    super(`bridge: '${cli}' exited ${exitCode}: ${stderr.slice(0, 200)}`, cli, "EXEC_FAILED")
    this.name = "BridgeExecFailedError"
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

export class BridgeParseError extends BridgeError {
  readonly raw: string
  constructor(cli: string, raw: string, reason: string) {
    super(`bridge: '${cli}' parse error: ${reason}`, cli, "PARSE")
    this.name = "BridgeParseError"
    this.raw = raw
  }
}
