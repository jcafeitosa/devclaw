export type CommErrorCode =
  | "BASE"
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "THREAD_CLOSED"
  | "INVALID_LINK"
  | "DELIVERY_FAILED"

export class CommError extends Error {
  readonly code: CommErrorCode
  constructor(message: string, code: CommErrorCode = "BASE") {
    super(message)
    this.name = "CommError"
    this.code = code
  }
}

export class NotFoundError extends CommError {
  readonly id: string
  constructor(kind: string, id: string) {
    super(`comm: ${kind} '${id}' not found`, "NOT_FOUND")
    this.name = "NotFoundError"
    this.id = id
  }
}

export class AccessDeniedError extends CommError {
  readonly actor: string
  readonly resource: string
  constructor(actor: string, resource: string, action: string) {
    super(`comm: actor '${actor}' cannot ${action} '${resource}'`, "ACCESS_DENIED")
    this.name = "AccessDeniedError"
    this.actor = actor
    this.resource = resource
  }
}

export class ThreadClosedError extends CommError {
  readonly threadId: string
  constructor(threadId: string) {
    super(`comm: thread '${threadId}' is closed`, "THREAD_CLOSED")
    this.name = "ThreadClosedError"
    this.threadId = threadId
  }
}

export class InvalidLinkError extends CommError {
  readonly missing: string[]
  constructor(missing: string[]) {
    super(`comm: thread missing required links: ${missing.join(", ")}`, "INVALID_LINK")
    this.name = "InvalidLinkError"
    this.missing = [...missing]
  }
}

export class DeliveryFailedError extends CommError {
  readonly failures: Array<{ channel: string; error: string }>
  constructor(failures: Array<{ channel: string; error: string }>) {
    super(
      `comm: notification delivery failed for ${failures.map((f) => f.channel).join(", ")}`,
      "DELIVERY_FAILED",
    )
    this.name = "DeliveryFailedError"
    this.failures = [...failures]
  }
}
