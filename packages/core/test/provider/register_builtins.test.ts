import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FilesystemAuthStore } from "../../src/auth/filesystem_store.ts"
import { registerBuiltins } from "../../src/provider/index.ts"

describe("registerBuiltins", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-builtins-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("registers only providers with stored api auth", async () => {
    const store = new FilesystemAuthStore({ dir, passphrase: "pw" })
    await store.save("anthropic", { type: "api", key: "sk-a" })
    const catalog = await registerBuiltins({ store })
    const ids = catalog.list().map((d) => d.id)
    expect(ids).toContain("anthropic")
    expect(ids).not.toContain("openai")
  })

  test("registers both when both configured", async () => {
    const store = new FilesystemAuthStore({ dir, passphrase: "pw" })
    await store.save("anthropic", { type: "api", key: "sk-a" })
    await store.save("openai", { type: "api", key: "sk-o" })
    const catalog = await registerBuiltins({ store })
    expect(
      catalog
        .list()
        .map((d) => d.id)
        .sort(),
    ).toEqual(["anthropic", "openai"])
  })

  test("skips providers stored as oauth (not api)", async () => {
    const store = new FilesystemAuthStore({ dir, passphrase: "pw" })
    await store.save("anthropic", {
      type: "oauth",
      accessToken: "x",
      expiresAt: Date.now() + 60_000,
    })
    const catalog = await registerBuiltins({ store })
    expect(catalog.list().length).toBe(0)
  })
})
