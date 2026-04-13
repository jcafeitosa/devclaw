import { describe, expect, test } from "bun:test"
import {
  type AuthInfo,
  authKey,
  isApiAuth,
  isOAuthAuth,
  isOAuthExpired,
  isWellKnownAuth,
} from "../../src/auth/types.ts"

describe("AuthInfo guards", () => {
  test("isApiAuth narrows api type", () => {
    const a: AuthInfo = { type: "api", key: "sk-abc" }
    expect(isApiAuth(a)).toBe(true)
    expect(isOAuthAuth(a)).toBe(false)
    expect(isWellKnownAuth(a)).toBe(false)
  })

  test("isOAuthAuth narrows oauth type", () => {
    const a: AuthInfo = { type: "oauth", accessToken: "t", expiresAt: Date.now() + 60_000 }
    expect(isOAuthAuth(a)).toBe(true)
    expect(isApiAuth(a)).toBe(false)
  })

  test("isWellKnownAuth narrows wellknown type", () => {
    const a: AuthInfo = { type: "wellknown", entries: { github: "ghp_x" } }
    expect(isWellKnownAuth(a)).toBe(true)
    expect(isApiAuth(a)).toBe(false)
  })

  test("isOAuthExpired true when now > expiresAt", () => {
    const a: AuthInfo = { type: "oauth", accessToken: "t", expiresAt: Date.now() - 1 }
    expect(isOAuthExpired(a)).toBe(true)
  })

  test("isOAuthExpired false with grace window when expiring soon", () => {
    const a: AuthInfo = {
      type: "oauth",
      accessToken: "t",
      expiresAt: Date.now() + 10_000,
    }
    expect(isOAuthExpired(a, 30_000)).toBe(true)
    expect(isOAuthExpired(a, 5_000)).toBe(false)
  })
})

describe("authKey", () => {
  test("namespaces provider + accountId", () => {
    expect(authKey("anthropic", "personal")).toBe("anthropic::personal")
  })

  test("defaults accountId to 'default' when absent", () => {
    expect(authKey("openai")).toBe("openai::default")
  })
})
