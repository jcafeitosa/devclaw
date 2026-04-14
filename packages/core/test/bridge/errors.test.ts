import { describe, expect, test } from "bun:test"
import {
  BridgeCancelledError,
  BridgeError,
  BridgeExecFailedError,
  BridgeNotAuthenticatedError,
  BridgeNotAvailableError,
  BridgeParseError,
  BridgeTimeoutError,
} from "../../src/bridge/errors.ts"

describe("Bridge errors", () => {
  test("base keeps cli + code", () => {
    const e = new BridgeError("x", "claude")
    expect(e.cli).toBe("claude")
    expect(e.code).toBe("BASE")
  })

  test("NotAvailable code", () => {
    expect(new BridgeNotAvailableError("codex").code).toBe("NOT_AVAILABLE")
  })

  test("NotAuthenticated code", () => {
    expect(new BridgeNotAuthenticatedError("codex").code).toBe("NOT_AUTHENTICATED")
  })

  test("Timeout keeps ms", () => {
    expect(new BridgeTimeoutError("claude", 5000).timeoutMs).toBe(5000)
  })

  test("Cancelled keeps taskId", () => {
    expect(new BridgeCancelledError("c", "t1").taskId).toBe("t1")
  })

  test("ExecFailed keeps exit + stderr", () => {
    const e = new BridgeExecFailedError("c", 2, "boom")
    expect(e.exitCode).toBe(2)
    expect(e.stderr).toBe("boom")
  })

  test("ParseError keeps raw", () => {
    expect(new BridgeParseError("c", "garbage", "bad json").raw).toBe("garbage")
  })
})
