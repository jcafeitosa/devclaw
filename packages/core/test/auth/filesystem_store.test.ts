import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FilesystemAuthStore } from "../../src/auth/filesystem_store.ts"
import type { AuthInfo } from "../../src/auth/types.ts"

describe("FilesystemAuthStore", () => {
  let dir: string
  const passphrase = "test-passphrase-123"

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-auth-test-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("save then load roundtrips AuthInfo", async () => {
    const store = new FilesystemAuthStore({ dir, passphrase })
    const info: AuthInfo = { type: "api", key: "sk-abc123" }
    await store.save("anthropic", info)
    const loaded = await store.load("anthropic")
    expect(loaded).toEqual(info)
  })

  test("load returns null when nothing saved", async () => {
    const store = new FilesystemAuthStore({ dir, passphrase })
    expect(await store.load("openai")).toBeNull()
  })

  test("namespace separates accounts", async () => {
    const store = new FilesystemAuthStore({ dir, passphrase })
    await store.save("anthropic", { type: "api", key: "personal" }, "personal")
    await store.save("anthropic", { type: "api", key: "work" }, "work")
    expect(await store.load("anthropic", "personal")).toEqual({ type: "api", key: "personal" })
    expect(await store.load("anthropic", "work")).toEqual({ type: "api", key: "work" })
  })

  test("delete removes single entry, others survive", async () => {
    const store = new FilesystemAuthStore({ dir, passphrase })
    await store.save("anthropic", { type: "api", key: "a" })
    await store.save("openai", { type: "api", key: "b" })
    await store.delete("anthropic")
    expect(await store.load("anthropic")).toBeNull()
    expect(await store.load("openai")).toEqual({ type: "api", key: "b" })
  })

  test("list returns all saved entries", async () => {
    const store = new FilesystemAuthStore({ dir, passphrase })
    await store.save("anthropic", { type: "api", key: "x" }, "personal")
    await store.save("openai", {
      type: "oauth",
      accessToken: "t",
      expiresAt: Date.now() + 60_000,
    })
    const entries = await store.list()
    expect(entries).toHaveLength(2)
    expect(entries).toContainEqual({ provider: "anthropic", accountId: "personal", type: "api" })
    expect(entries).toContainEqual({ provider: "openai", accountId: "default", type: "oauth" })
  })

  test("file is written with mode 0600", async () => {
    const store = new FilesystemAuthStore({ dir, passphrase })
    await store.save("anthropic", { type: "api", key: "k" })
    const st = await stat(join(dir, "auth.enc"))
    const mode = st.mode & 0o777
    expect(mode).toBe(0o600)
  })

  test("wrong passphrase fails to load", async () => {
    const a = new FilesystemAuthStore({ dir, passphrase })
    await a.save("anthropic", { type: "api", key: "secret" })
    const b = new FilesystemAuthStore({ dir, passphrase: "wrong" })
    await expect(b.load("anthropic")).rejects.toBeDefined()
  })

  test("persists across instances (on-disk state)", async () => {
    const a = new FilesystemAuthStore({ dir, passphrase })
    await a.save("anthropic", { type: "api", key: "persist-me" })
    const b = new FilesystemAuthStore({ dir, passphrase })
    expect(await b.load("anthropic")).toEqual({ type: "api", key: "persist-me" })
  })

  test("ciphertext on disk does not contain plaintext key", async () => {
    const store = new FilesystemAuthStore({ dir, passphrase })
    await store.save("anthropic", { type: "api", key: "RECOGNIZABLE_SECRET_123" })
    const bytes = await Bun.file(join(dir, "auth.enc")).arrayBuffer()
    const haystack = new Uint8Array(bytes)
    const needle = new TextEncoder().encode("RECOGNIZABLE_SECRET_123")
    let found = false
    outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer
      }
      found = true
      break
    }
    expect(found).toBe(false)
  })
})
