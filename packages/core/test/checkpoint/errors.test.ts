import { describe, expect, test } from "bun:test"
import {
  ArchiveMissingError,
  CheckpointError,
  CheckpointNotFoundError,
  GitFailedError,
} from "../../src/checkpoint/errors.ts"

describe("Checkpoint errors", () => {
  test("base code", () => {
    expect(new CheckpointError("x").code).toBe("BASE")
  })

  test("NotFound keeps id", () => {
    expect(new CheckpointNotFoundError("c1").id).toBe("c1")
  })

  test("GitFailed keeps exit + stderr", () => {
    const e = new GitFailedError("stash create", 128, "fatal: ...")
    expect(e.exitCode).toBe(128)
    expect(e.stderr).toContain("fatal")
  })

  test("ArchiveMissing keeps id", () => {
    expect(new ArchiveMissingError("arc_1").archiveId).toBe("arc_1")
  })
})
