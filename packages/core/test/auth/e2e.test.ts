import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  AuditLog,
  type AuthInfo,
  ensureFreshOAuth,
  FilesystemAuthStore,
  type OAuthAuth,
} from "../../src/auth/index.ts"

describe("auth module E2E smoke", () => {
  let dir: string
  const passphrase = "e2e-pass"

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-auth-e2e-"))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("full lifecycle: save 3 types, cross-process reload, refresh, audit", async () => {
    const storeA = new FilesystemAuthStore({ dir, passphrase })
    const audit = new AuditLog({ dir })

    const apiInfo: AuthInfo = { type: "api", key: "sk-ant-xyz" }
    const oauthInfo: AuthInfo = {
      type: "oauth",
      accessToken: "expired-old",
      refreshToken: "refresh-me",
      expiresAt: Date.now() - 10_000,
      accountId: "personal",
    }
    const wkInfo: AuthInfo = { type: "wellknown", entries: { github: "ghp_abc" } }

    await storeA.save("anthropic", apiInfo)
    await audit.append({ event: "auth.save", provider: "anthropic", accountId: "default" })

    await storeA.save("anthropic-oauth", oauthInfo, "personal")
    await audit.append({
      event: "auth.save",
      provider: "anthropic-oauth",
      accountId: "personal",
    })

    await storeA.save("gh", wkInfo)
    await audit.append({ event: "auth.save", provider: "gh", accountId: "default" })

    // simulate restart: new store instance over same dir
    const storeB = new FilesystemAuthStore({ dir, passphrase })
    expect(await storeB.load("anthropic")).toEqual(apiInfo)
    expect(await storeB.load("anthropic-oauth", "personal")).toMatchObject({
      type: "oauth",
      accessToken: "expired-old",
    })

    // refresh expired oauth
    const fresh = await ensureFreshOAuth(storeB, "anthropic-oauth", "personal", async (prev) => ({
      ...prev,
      accessToken: "refreshed-new",
      expiresAt: Date.now() + 3600_000,
    }))
    expect(fresh.accessToken).toBe("refreshed-new")
    await audit.append({
      event: "auth.refresh.success",
      provider: "anthropic-oauth",
      accountId: "personal",
    })

    // verify persisted
    const reloaded = (await storeB.load("anthropic-oauth", "personal")) as OAuthAuth
    expect(reloaded.accessToken).toBe("refreshed-new")

    // list
    const entries = await storeB.list()
    expect(entries).toHaveLength(3)

    // delete
    await storeB.delete("gh")
    await audit.append({ event: "auth.delete", provider: "gh", accountId: "default" })
    expect(await storeB.load("gh")).toBeNull()
    expect(await storeB.list()).toHaveLength(2)
  })
})
