import { afterEach, describe, expect, test } from "bun:test"
import { CallbackServer } from "../../src/oauth/callback_server.ts"
import {
  OAuthPortExhaustedError,
  OAuthStateMismatchError,
  OAuthTimeoutError,
  OAuthUserDeniedError,
} from "../../src/oauth/errors.ts"

let active: CallbackServer | null = null

afterEach(async () => {
  await active?.close()
  active = null
})

describe("CallbackServer", () => {
  test("binds to first available port in range", async () => {
    active = new CallbackServer({ ports: [1455, 1456, 1457], state: "s1", timeoutMs: 5_000 })
    const bound = await active.start()
    expect(bound.port).toBeGreaterThanOrEqual(1455)
    expect(bound.port).toBeLessThanOrEqual(1457)
    expect(bound.redirectUri).toBe(`http://localhost:${bound.port}/auth/callback`)
  })

  test("resolves with code on valid callback", async () => {
    active = new CallbackServer({ ports: [1458], state: "GOOD", timeoutMs: 5_000 })
    const { port } = await active.start()
    const waiting = active.wait()
    await fetch(`http://localhost:${port}/auth/callback?code=AUTHCODE&state=GOOD`)
    const code = await waiting
    expect(code).toBe("AUTHCODE")
  })

  test("rejects on state mismatch", async () => {
    active = new CallbackServer({ ports: [1459], state: "EXPECTED", timeoutMs: 5_000 })
    const { port } = await active.start()
    const waiting = active.wait().catch((e: unknown) => e)
    await fetch(`http://localhost:${port}/auth/callback?code=X&state=WRONG`)
    const err = await waiting
    expect(err).toBeInstanceOf(OAuthStateMismatchError)
  })

  test("rejects on user denial", async () => {
    active = new CallbackServer({ ports: [1460], state: "s", timeoutMs: 5_000 })
    const { port } = await active.start()
    const waiting = active.wait().catch((e: unknown) => e)
    await fetch(`http://localhost:${port}/auth/callback?error=access_denied&state=s`)
    const err = await waiting
    expect(err).toBeInstanceOf(OAuthUserDeniedError)
  })

  test("rejects on timeout", async () => {
    active = new CallbackServer({ ports: [1461], state: "s", timeoutMs: 30 })
    await active.start()
    await expect(active.wait()).rejects.toBeInstanceOf(OAuthTimeoutError)
  })

  test("exhausts ports when all busy", async () => {
    const blocker = new CallbackServer({ ports: [1462], state: "a", timeoutMs: 5_000 })
    await blocker.start()
    try {
      const contender = new CallbackServer({ ports: [1462], state: "b", timeoutMs: 5_000 })
      await expect(contender.start()).rejects.toBeInstanceOf(OAuthPortExhaustedError)
    } finally {
      await blocker.close()
    }
  })
})
