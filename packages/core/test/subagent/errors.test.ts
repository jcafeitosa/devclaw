import { describe, expect, test } from "bun:test"
import {
  BudgetExceededError,
  DelegateStrippedError,
  IsolationFailedError,
  NotSupportedError,
  SubagentError,
  SubagentExecFailedError,
} from "../../src/subagent/errors.ts"

describe("Subagent errors", () => {
  test("base keeps code + id", () => {
    const e = new SubagentError("x", "BASE", "sub1")
    expect(e.code).toBe("BASE")
    expect(e.subagentId).toBe("sub1")
  })

  test("BudgetExceeded keeps limit name", () => {
    expect(new BudgetExceededError("s", "duration", 1000, 500).limit).toBe("duration")
  })

  test("IsolationFailed wraps cause", () => {
    const cause = new Error("fs")
    expect(new IsolationFailedError("s", cause).cause).toBe(cause)
  })

  test("NotSupported carries detail", () => {
    expect(new NotSupportedError("s", "docker missing").code).toBe("NOT_SUPPORTED")
  })

  test("DelegateStripped code", () => {
    expect(new DelegateStrippedError("s").code).toBe("DELEGATE_STRIPPED")
  })

  test("ExecFailed wraps cause", () => {
    const cause = new Error("boom")
    expect(new SubagentExecFailedError("s", cause).cause).toBe(cause)
  })
})
