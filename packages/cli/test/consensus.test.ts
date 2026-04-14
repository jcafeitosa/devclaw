import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { type AuthStore, FilesystemAuthStore } from "@devclaw/core/auth"
import { BridgeRegistry, FallbackStrategy } from "@devclaw/core/bridge"
import type { Bridge, BridgeEvent, Capabilities, CliId } from "@devclaw/core/bridge"
import { ProviderCatalog } from "@devclaw/core/provider"

import { run } from "../src/index.ts"

function stubBridge(cli: CliId, text: string): Bridge {
  return {
    cli,
    async isAvailable() {
      return true
    },
    async isAuthenticated() {
      return { authed: true }
    },
    capabilities(): Capabilities {
      return {
        modes: ["agentic"],
        contextWindow: 200_000,
        supportsTools: true,
        supportsSubagents: false,
        supportsStreaming: true,
        supportsMultimodal: false,
        supportsWebSearch: false,
        supportsMcp: false,
        preferredFor: [],
      }
    },
    estimateCost() {
      return { costUsd: 0, tokensIn: 0, tokensOut: 0, subscriptionCovered: true }
    },
    execute(): AsyncIterable<BridgeEvent> {
      return (async function* () {
        yield { type: "text", content: text }
        yield { type: "completed" }
      })()
    },
    async cancel() {},
  }
}

async function consensusRuntime(dir: string, bridgeMap: Record<string, string>) {
  const authStore: AuthStore = new FilesystemAuthStore({ dir, passphrase: "pw" })
  const catalog = new ProviderCatalog()
  const bridges = new BridgeRegistry()
  for (const [cli, text] of Object.entries(bridgeMap)) {
    bridges.register(stubBridge(cli as CliId, text))
  }
  const fallback = new FallbackStrategy({ registry: bridges, catalog })
  return { authStore, catalog, bridges, fallback, rootDir: dir, home: dir }
}

describe("CLI consensus command", () => {
  let dir: string
  const out: string[] = []
  const err: string[] = []
  const push = (arr: string[]) => (t: string) => arr.push(t)

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-consensus-"))
    out.length = 0
    err.length = 0
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("fans out + picks winner by length (default scorer)", async () => {
    const code = await run({
      argv: ["consensus", "--prompt", "summarize the codebase"],
      stdout: push(out),
      stderr: push(err),
      runtime: () =>
        consensusRuntime(dir, {
          claude: "short reply",
          codex: "a notably longer answer packed with details and structure",
          gemini: "medium length",
        }),
    })
    expect(code).toBe(0)
    const text = out.join("\n")
    expect(text).toContain("codex")
    expect(text).toMatch(/winner.*codex/i)
  })

  test("--json prints full result as JSON", async () => {
    const code = await run({
      argv: ["consensus", "--prompt", "plan a refactor", "--json"],
      stdout: push(out),
      stderr: push(err),
      runtime: () =>
        consensusRuntime(dir, {
          claude: "Option A",
          codex: "Option B with more context",
        }),
    })
    expect(code).toBe(0)
    const parsed = JSON.parse(out.join("\n")) as {
      winner: string
      scores: Array<{ cli: string; score: number }>
      participants: Array<{ cli: string; text: string }>
    }
    expect(parsed.winner).toBe("codex")
    expect(parsed.scores.map((s) => s.cli).sort()).toEqual(["claude", "codex"])
    expect(parsed.participants.find((p) => p.cli === "claude")?.text).toBe("Option A")
  })

  test("--cli restricts subset", async () => {
    const code = await run({
      argv: ["consensus", "--prompt", "design auth", "--cli", "claude,gemini", "--json"],
      stdout: push(out),
      stderr: push(err),
      runtime: () =>
        consensusRuntime(dir, {
          claude: "x",
          codex: "xxxxxxxxxx",
          gemini: "yyyy",
        }),
    })
    expect(code).toBe(0)
    const parsed = JSON.parse(out.join("\n")) as {
      participants: Array<{ cli: string }>
    }
    expect(parsed.participants.map((p) => p.cli).sort()).toEqual(["claude", "gemini"])
  })

  test("missing --prompt exits 2", async () => {
    const code = await run({
      argv: ["consensus"],
      stdout: push(out),
      stderr: push(err),
      runtime: () => consensusRuntime(dir, { claude: "x" }),
    })
    expect(code).toBe(2)
    expect(err.join("\n")).toContain("prompt")
  })

  test("no available bridges exits 1", async () => {
    const code = await run({
      argv: ["consensus", "--prompt", "anything"],
      stdout: push(out),
      stderr: push(err),
      runtime: () => consensusRuntime(dir, {}),
    })
    expect(code).toBe(1)
    expect(err.join("\n").toLowerCase()).toContain("no eligible bridges")
  })
})
