export type MemoryErrorCode = "BASE" | "NOT_FOUND" | "EMBED_FAILED" | "STORE_FAILED"

export class MemoryError extends Error {
  readonly code: MemoryErrorCode
  constructor(message: string, code: MemoryErrorCode = "BASE") {
    super(message)
    this.name = "MemoryError"
    this.code = code
  }
}

export class MemoryNotFoundError extends MemoryError {
  readonly id: string
  constructor(id: string) {
    super(`memory: item '${id}' not found`, "NOT_FOUND")
    this.name = "MemoryNotFoundError"
    this.id = id
  }
}

export class EmbedFailedError extends MemoryError {
  override readonly cause: unknown
  constructor(cause: unknown) {
    super(
      `memory: embed failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      "EMBED_FAILED",
    )
    this.name = "EmbedFailedError"
    this.cause = cause
  }
}

export class StoreFailedError extends MemoryError {
  override readonly cause: unknown
  constructor(operation: string, cause: unknown) {
    super(
      `memory: store ${operation} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      "STORE_FAILED",
    )
    this.name = "StoreFailedError"
    this.cause = cause
  }
}
