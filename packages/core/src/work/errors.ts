export type WorkErrorCode = "BASE" | "NOT_FOUND" | "CYCLE" | "INVALID_PARENT" | "INVALID_DEP"

export class WorkError extends Error {
  readonly code: WorkErrorCode
  constructor(message: string, code: WorkErrorCode = "BASE") {
    super(message)
    this.name = "WorkError"
    this.code = code
  }
}

export class WorkNotFoundError extends WorkError {
  readonly id: string
  constructor(id: string) {
    super(`work: item '${id}' not found`, "NOT_FOUND")
    this.name = "WorkNotFoundError"
    this.id = id
  }
}

export class WorkCycleError extends WorkError {
  readonly cycle: string[]
  constructor(cycle: string[]) {
    super(`work: cycle detected through ${cycle.join(" → ")}`, "CYCLE")
    this.name = "WorkCycleError"
    this.cycle = cycle
  }
}

export class InvalidParentError extends WorkError {
  readonly childId: string
  readonly parentId: string
  constructor(childId: string, parentId: string, reason: string) {
    super(`work: cannot parent '${childId}' under '${parentId}': ${reason}`, "INVALID_PARENT")
    this.name = "InvalidParentError"
    this.childId = childId
    this.parentId = parentId
  }
}

export class InvalidDependencyError extends WorkError {
  readonly fromId: string
  readonly toId: string
  constructor(fromId: string, toId: string, reason: string) {
    super(`work: invalid dependency '${fromId}'→'${toId}': ${reason}`, "INVALID_DEP")
    this.name = "InvalidDependencyError"
    this.fromId = fromId
    this.toId = toId
  }
}
