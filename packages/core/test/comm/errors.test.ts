import { describe, expect, test } from "bun:test"
import {
  AccessDeniedError,
  CommError,
  DeliveryFailedError,
  InvalidLinkError,
  NotFoundError,
  ThreadClosedError,
} from "../../src/comm/errors.ts"

describe("Comm errors", () => {
  test("base code", () => {
    expect(new CommError("x").code).toBe("BASE")
  })

  test("NotFound keeps id + kind in message", () => {
    expect(new NotFoundError("channel", "c1").id).toBe("c1")
  })

  test("AccessDenied keeps actor + resource", () => {
    const e = new AccessDeniedError("agent:backend", "chan:deploy", "write")
    expect(e.actor).toBe("agent:backend")
    expect(e.resource).toBe("chan:deploy")
  })

  test("ThreadClosed keeps id", () => {
    expect(new ThreadClosedError("t1").threadId).toBe("t1")
  })

  test("InvalidLink lists missing", () => {
    expect(new InvalidLinkError(["projectId", "taskId"]).missing).toEqual(["projectId", "taskId"])
  })

  test("DeliveryFailed keeps failure list", () => {
    const f = [{ channel: "email", error: "smtp down" }]
    expect(new DeliveryFailedError(f).failures).toEqual(f)
  })
})
