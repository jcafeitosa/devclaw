import { describe, expect, test } from "bun:test"
import { GateBlockedError, HookBlockedError, HookError } from "../../src/hook/errors.ts"

describe("Hook errors", () => {
  test("base code", () => {
    expect(new HookError("x").code).toBe("BASE")
  })

  test("HookBlocked keeps hookName + reason", () => {
    const e = new HookBlockedError("my-hook", "denied")
    expect(e.code).toBe("BLOCKED")
    expect(e.hookName).toBe("my-hook")
    expect(e.reason).toBe("denied")
  })

  test("GateBlocked keeps gate + reasons array", () => {
    const e = new GateBlockedError("pre-design", ["no design doc", "no ADR"])
    expect(e.code).toBe("GATE_BLOCKED")
    expect(e.gate).toBe("pre-design")
    expect(e.reasons).toEqual(["no design doc", "no ADR"])
  })
})
