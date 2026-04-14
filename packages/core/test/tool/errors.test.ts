import { describe, expect, test } from "bun:test"
import {
  ToolError,
  ToolExecError,
  ToolPermissionError,
  ToolTimeoutError,
  ToolValidationError,
} from "../../src/tool/errors.ts"

describe("Tool errors", () => {
  test("ToolError base has stable code field", () => {
    const e = new ToolError("msg", "BASE", "tool-x")
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe("BASE")
    expect(e.toolId).toBe("tool-x")
  })

  test("subclasses expose stable codes", () => {
    expect(new ToolValidationError("t", ["bad"]).code).toBe("VALIDATION")
    expect(new ToolPermissionError("t", "agent", "denied").code).toBe("PERMISSION")
    expect(new ToolTimeoutError("t", 5000).code).toBe("TIMEOUT")
    expect(new ToolExecError("t", new Error("boom")).code).toBe("EXEC")
  })

  test("ToolValidationError keeps issue list", () => {
    const e = new ToolValidationError("t", ["missing: foo", "wrong type: bar"])
    expect(e.issues).toHaveLength(2)
  })

  test("ToolTimeoutError keeps ms", () => {
    const e = new ToolTimeoutError("t", 30_000)
    expect(e.timeoutMs).toBe(30_000)
  })

  test("ToolExecError wraps original cause", () => {
    const cause = new Error("original")
    const e = new ToolExecError("t", cause)
    expect(e.cause).toBe(cause)
  })
})
