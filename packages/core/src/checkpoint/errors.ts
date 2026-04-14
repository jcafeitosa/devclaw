export type CheckpointErrorCode = "BASE" | "NOT_FOUND" | "GIT_FAILED" | "ARCHIVE_MISSING"

export class CheckpointError extends Error {
  readonly code: CheckpointErrorCode
  constructor(message: string, code: CheckpointErrorCode = "BASE") {
    super(message)
    this.name = "CheckpointError"
    this.code = code
  }
}

export class CheckpointNotFoundError extends CheckpointError {
  readonly id: string
  constructor(id: string) {
    super(`checkpoint '${id}' not found`, "NOT_FOUND")
    this.name = "CheckpointNotFoundError"
    this.id = id
  }
}

export class GitFailedError extends CheckpointError {
  readonly stderr: string
  readonly exitCode: number
  constructor(op: string, exitCode: number, stderr: string) {
    super(`git ${op} failed (exit ${exitCode}): ${stderr.slice(0, 200)}`, "GIT_FAILED")
    this.name = "GitFailedError"
    this.exitCode = exitCode
    this.stderr = stderr
  }
}

export class ArchiveMissingError extends CheckpointError {
  readonly archiveId: string
  constructor(archiveId: string) {
    super(`rewind archive '${archiveId}' not found`, "ARCHIVE_MISSING")
    this.name = "ArchiveMissingError"
    this.archiveId = archiveId
  }
}
