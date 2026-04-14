import { describe, expect, test } from "bun:test"
import {
  OAuthBrowserUnavailableError,
  OAuthError,
  OAuthPortExhaustedError,
  OAuthStateMismatchError,
  OAuthTimeoutError,
  OAuthTokenError,
  OAuthUserDeniedError,
} from "../../src/oauth/errors.ts"

describe("OAuth errors", () => {
  test("OAuthError is base class with code", () => {
    const e = new OAuthError("any", "BASE")
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe("BASE")
    expect(e.message).toBe("any")
  })

  test("subclasses carry stable codes", () => {
    expect(new OAuthPortExhaustedError([1455, 1456]).code).toBe("PORT_EXHAUSTED")
    expect(new OAuthStateMismatchError().code).toBe("STATE_MISMATCH")
    expect(new OAuthTimeoutError(300_000).code).toBe("TIMEOUT")
    expect(new OAuthUserDeniedError("access_denied").code).toBe("USER_DENIED")
    expect(new OAuthTokenError(400, "invalid_grant").code).toBe("TOKEN_ENDPOINT")
    expect(new OAuthBrowserUnavailableError().code).toBe("BROWSER_UNAVAILABLE")
  })

  test("PortExhausted reports attempted ports", () => {
    const e = new OAuthPortExhaustedError([1455, 1456])
    expect(e.ports).toEqual([1455, 1456])
    expect(e.message).toContain("1455")
  })

  test("TokenError carries status + body", () => {
    const e = new OAuthTokenError(401, "bad")
    expect(e.status).toBe(401)
    expect(e.body).toBe("bad")
  })
})
