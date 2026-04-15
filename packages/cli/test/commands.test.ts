import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type AuthStore, FilesystemAuthStore } from "@devclaw/core/auth"
import { BridgeRegistry, FallbackStrategy } from "@devclaw/core/bridge"
import { ProviderCatalog } from "@devclaw/core/provider"
import { run } from "../src/index.ts"

interface StubRuntimeInit {
  home: string
  withProvider?: boolean
}

async function stubRuntime({ home, withProvider = false }: StubRuntimeInit) {
  const authStore: AuthStore = new FilesystemAuthStore({ dir: home, passphrase: "pw" })
  const catalog = new ProviderCatalog()
  if (withProvider) {
    catalog.register({
      id: "stub",
      name: "Stub",
      baseUrl: "",
      defaultModel: "x",
      async generate({ prompt }) {
        return `stub: ${prompt}`
      },
    })
  }
  const bridges = new BridgeRegistry()
  const fallback = new FallbackStrategy({
    registry: bridges,
    catalog,
    fallbackProviderId: withProvider ? "stub" : undefined,
  })
  return { authStore, catalog, bridges, fallback, rootDir: home, home }
}

describe("CLI commands", () => {
  let dir: string
  const out: string[] = []
  const err: string[] = []
  const push = (arr: string[]) => (t: string) => arr.push(t)

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-cli-"))
    out.length = 0
    err.length = 0
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("version prints version", async () => {
    const code = await run({ argv: ["version"], stdout: push(out), stderr: push(err) })
    expect(code).toBe(0)
    expect(out[0]).toBe("0.0.0")
  })

  test("help prints command list", async () => {
    const code = await run({ argv: ["help"], stdout: push(out), stderr: push(err) })
    expect(code).toBe(0)
    const text = out.join("\n")
    expect(text).toContain("discover")
    expect(text).toContain("invoke")
  })

  test("unknown command exits 2 with stderr hint", async () => {
    const code = await run({ argv: ["nope"], stdout: push(out), stderr: push(err) })
    expect(code).toBe(2)
    expect(err.join("\n")).toContain("unknown command")
  })

  test("init creates devclaw.json + .devclaw dir", async () => {
    const code = await run({
      argv: ["init", dir],
      stdout: push(out),
      stderr: push(err),
    })
    expect(code).toBe(0)
    const content = await readFile(join(dir, "devclaw.json"), "utf8")
    expect(content).toContain("defaultProvider")
  })

  test("auth login saves key + auth list shows entry", async () => {
    const code1 = await run({
      argv: ["auth", "login", "anthropic", "--key", "sk-test"],
      stdout: push(out),
      stderr: push(err),
      runtime: () => stubRuntime({ home: dir }),
    })
    expect(code1).toBe(0)
    out.length = 0
    const code2 = await run({
      argv: ["auth", "list"],
      stdout: push(out),
      stderr: push(err),
      runtime: () => stubRuntime({ home: dir }),
    })
    expect(code2).toBe(0)
    expect(out.join("\n")).toContain("anthropic")
  })

  test("auth login missing --key → exit 2", async () => {
    const code = await run({
      argv: ["auth", "login", "anthropic"],
      stdout: push(out),
      stderr: push(err),
      runtime: () => stubRuntime({ home: dir }),
    })
    expect(code).toBe(2)
  })

  test("discover runs and outputs Project: line", async () => {
    const code = await run({
      argv: ["discover", dir],
      stdout: push(out),
      stderr: push(err),
    })
    expect(code).toBe(0)
    expect(out.join("\n")).toContain("Project:")
  })

  test("providers command lists empty when none registered", async () => {
    const code = await run({
      argv: ["providers"],
      stdout: push(out),
      stderr: push(err),
      runtime: () => stubRuntime({ home: dir }),
    })
    expect(code).toBe(0)
    expect(out.join("\n")).toContain("no providers")
  })

  test("invoke without prompt exits 2", async () => {
    const code = await run({
      argv: ["invoke"],
      stdout: push(out),
      stderr: push(err),
      runtime: () => stubRuntime({ home: dir }),
    })
    expect(code).toBe(2)
  })

  test("slash --list prints built-in slash commands", async () => {
    const code = await run({
      argv: ["slash", "--list"],
      stdout: push(out),
      stderr: push(err),
      runtime: () => stubRuntime({ home: dir }),
    })
    expect(code).toBe(0)
    const text = out.join("\n")
    expect(text).toContain("/tdd")
    expect(text).toContain("/checkpoint")
    expect(text).toContain("/clear")
  })

  test("slash renders tdd prompt from builtin definition", async () => {
    const code = await run({
      argv: ["slash", "--command", "tdd", "--scope", "auth", "--min-coverage", "90"],
      stdout: push(out),
      stderr: push(err),
      runtime: () => stubRuntime({ home: dir }),
    })
    expect(code).toBe(0)
    const text = out.join("\n")
    expect(text).toContain("/tdd")
    expect(text).toContain("auth")
    expect(text).toContain("90")
  })

  test("slash --run executes rendered prompt via fallback", async () => {
    const code = await run({
      argv: ["slash", "--command", "checkpoint", "--run", "--name", "pre-release"],
      stdout: push(out),
      stderr: push(err),
      runtime: () => stubRuntime({ home: dir, withProvider: true }),
    })
    expect(code).toBe(0)
    expect(out.join("\n")).toContain("stub:")
  })
})
