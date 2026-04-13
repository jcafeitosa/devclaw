import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FilesystemAuthStore } from "../../src/auth/filesystem_store.ts"
import { ensureFreshOAuth } from "../../src/auth/refresh.ts"
import type { OAuthAuth } from "../../src/auth/types.ts"

describe("ensureFreshOAuth", () => {
  let dir: string
  let store: FilesystemAuthStore
  const passphrase = "pw"

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-refresh-"))
    store = new FilesystemAuthStore({ dir, passphrase })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("returns existing token when not expired", async () => {
    const fresh: OAuthAuth = {
      type: "oauth",
      accessToken: "current",
      expiresAt: Date.now() + 60_000,
    }
    await store.save("anthropic", fresh)
    let called = 0
    const got = await ensureFreshOAuth(store, "anthropic", undefined, async () => {
      called++
      throw new Error("should not be called")
    })
    expect(got.accessToken).toBe("current")
    expect(called).toBe(0)
  })

  test("refreshes when expired", async () => {
    await store.save("anthropic", {
      type: "oauth",
      accessToken: "old",
      refreshToken: "r",
      expiresAt: Date.now() - 1000,
    })
    const got = await ensureFreshOAuth(store, "anthropic", undefined, async (prev) => ({
      ...prev,
      accessToken: `new-after-${prev.accessToken}`,
      expiresAt: Date.now() + 60_000,
    }))
    expect(got.accessToken).toBe("new-after-old")
    const reloaded = await store.load("anthropic")
    expect((reloaded as OAuthAuth).accessToken).toBe("new-after-old")
  })

  test("two concurrent callers trigger refresher exactly once", async () => {
    await store.save("anthropic", {
      type: "oauth",
      accessToken: "old",
      refreshToken: "r",
      expiresAt: Date.now() - 1000,
    })
    let calls = 0
    const refresher = async (prev: OAuthAuth): Promise<OAuthAuth> => {
      calls++
      await Bun.sleep(20)
      return { ...prev, accessToken: `new-${calls}`, expiresAt: Date.now() + 60_000 }
    }
    const [a, b] = await Promise.all([
      ensureFreshOAuth(store, "anthropic", undefined, refresher),
      ensureFreshOAuth(store, "anthropic", undefined, refresher),
    ])
    expect(calls).toBe(1)
    expect(a.accessToken).toBe("new-1")
    expect(b.accessToken).toBe("new-1")
  })

  test("different accountIds refresh independently in parallel", async () => {
    await store.save(
      "anthropic",
      { type: "oauth", accessToken: "old-p", refreshToken: "r", expiresAt: 0 },
      "personal",
    )
    await store.save(
      "anthropic",
      { type: "oauth", accessToken: "old-w", refreshToken: "r", expiresAt: 0 },
      "work",
    )
    let calls = 0
    const r = async (prev: OAuthAuth): Promise<OAuthAuth> => {
      calls++
      await Bun.sleep(10)
      return { ...prev, accessToken: `${prev.accessToken}-new`, expiresAt: Date.now() + 60_000 }
    }
    await Promise.all([
      ensureFreshOAuth(store, "anthropic", "personal", r),
      ensureFreshOAuth(store, "anthropic", "work", r),
    ])
    expect(calls).toBe(2)
  })

  test("throws when stored auth is not oauth type", async () => {
    await store.save("anthropic", { type: "api", key: "k" })
    await expect(
      ensureFreshOAuth(store, "anthropic", undefined, async () => {
        throw new Error("nope")
      }),
    ).rejects.toThrow(/oauth/i)
  })

  test("throws when no auth stored for provider", async () => {
    await expect(
      ensureFreshOAuth(store, "missing", undefined, async () => {
        throw new Error("nope")
      }),
    ).rejects.toThrow(/not found/i)
  })
})
