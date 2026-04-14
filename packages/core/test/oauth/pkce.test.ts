import { describe, expect, test } from "bun:test"
import { generatePKCE, generateState } from "../../src/oauth/pkce.ts"

const URLSAFE = /^[A-Za-z0-9_-]+$/

describe("generatePKCE", () => {
  test("verifier is URL-safe base64, 43 chars", async () => {
    const pkce = await generatePKCE()
    expect(pkce.verifier).toHaveLength(43)
    expect(URLSAFE.test(pkce.verifier)).toBe(true)
  })

  test("challenge is 43-char URL-safe base64 (SHA-256 of verifier)", async () => {
    const pkce = await generatePKCE()
    expect(pkce.challenge).toHaveLength(43)
    expect(URLSAFE.test(pkce.challenge)).toBe(true)
    expect(pkce.method).toBe("S256")
  })

  test("challenge is deterministic from verifier", async () => {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("v1"))
    const manualChallenge = Buffer.from(hash)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    // Build PKCE-like with known verifier
    const { challengeOf } = await import("../../src/oauth/pkce.ts")
    expect(await challengeOf("v1")).toBe(manualChallenge)
  })

  test("each call produces unique verifier", async () => {
    const a = await generatePKCE()
    const b = await generatePKCE()
    expect(a.verifier).not.toBe(b.verifier)
  })
})

describe("generateState", () => {
  test("URL-safe 32+ chars, unique per call", () => {
    const a = generateState()
    const b = generateState()
    expect(a.length).toBeGreaterThanOrEqual(32)
    expect(URLSAFE.test(a)).toBe(true)
    expect(a).not.toBe(b)
  })
})
