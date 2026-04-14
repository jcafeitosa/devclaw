import { describe, expect, test } from "bun:test"
import {
  EmbedFailedError,
  MemoryError,
  MemoryNotFoundError,
  StoreFailedError,
} from "../../src/memory/errors.ts"

describe("Memory errors", () => {
  test("MemoryError base code", () => {
    const e = new MemoryError("m")
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe("BASE")
  })

  test("NotFound keeps id", () => {
    const e = new MemoryNotFoundError("x")
    expect(e.id).toBe("x")
    expect(e.code).toBe("NOT_FOUND")
  })

  test("EmbedFailed wraps cause", () => {
    const cause = new Error("nope")
    const e = new EmbedFailedError(cause)
    expect(e.cause).toBe(cause)
    expect(e.code).toBe("EMBED_FAILED")
  })

  test("StoreFailed names operation", () => {
    const e = new StoreFailedError("write", new Error("x"))
    expect(e.code).toBe("STORE_FAILED")
    expect(e.message).toContain("write")
  })
})
