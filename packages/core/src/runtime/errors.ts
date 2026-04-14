export class RuntimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RuntimeError"
  }
}

export class RuntimeTimeoutError extends RuntimeError {
  readonly timeoutMs: number
  constructor(timeoutMs: number) {
    super(`runtime exceeded timeout of ${timeoutMs}ms`)
    this.name = "RuntimeTimeoutError"
    this.timeoutMs = timeoutMs
  }
}

export class RuntimeNotFoundError extends RuntimeError {
  constructor(name: string) {
    super(`no runtime registered as '${name}'`)
    this.name = "RuntimeNotFoundError"
  }
}
