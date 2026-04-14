import { describe, expect, test } from "bun:test"
import { StructuredLogger } from "../../src/observability/logger.ts"
import type { LogRecord } from "../../src/observability/types.ts"

describe("StructuredLogger", () => {
  test("emits a record per call with level, message, attrs, timestamp", () => {
    const records: LogRecord[] = []
    const logger = new StructuredLogger({
      sink: (r) => records.push(r),
      now: () => 1000,
    })
    logger.info("hello", { user: "bob" })
    expect(records).toHaveLength(1)
    expect(records[0]!.level).toBe("info")
    expect(records[0]!.message).toBe("hello")
    expect(records[0]!.attrs).toEqual({ user: "bob" })
    expect(records[0]!.at).toBe(1000)
  })

  test("level methods cover debug/info/warn/error", () => {
    const records: LogRecord[] = []
    const logger = new StructuredLogger({ sink: (r) => records.push(r) })
    logger.debug("d")
    logger.info("i")
    logger.warn("w")
    logger.error("e")
    expect(records.map((r) => r.level)).toEqual(["debug", "info", "warn", "error"])
  })

  test("filters records below minLevel", () => {
    const records: LogRecord[] = []
    const logger = new StructuredLogger({ sink: (r) => records.push(r), minLevel: "warn" })
    logger.debug("d")
    logger.info("i")
    logger.warn("w")
    logger.error("e")
    expect(records.map((r) => r.level)).toEqual(["warn", "error"])
  })

  test("child() inherits attrs and merges new ones", () => {
    const records: LogRecord[] = []
    const root = new StructuredLogger({
      sink: (r) => records.push(r),
      defaultAttrs: { service: "core" },
    })
    const child = root.child({ requestId: "r1" })
    child.info("hi", { extra: 1 })
    expect(records[0]!.attrs).toEqual({ service: "core", requestId: "r1", extra: 1 })
  })

  test("error level captures Error.message + stack when given Error", () => {
    const records: LogRecord[] = []
    const logger = new StructuredLogger({ sink: (r) => records.push(r) })
    const err = new Error("boom")
    logger.error("failed", { err })
    expect(records[0]!.attrs?.err).toBeDefined()
    const captured = records[0]!.attrs!.err as { name: string; message: string; stack?: string }
    expect(captured.message).toBe("boom")
  })
})
