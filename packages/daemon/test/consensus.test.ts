import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FilesystemAuthStore } from "@devclaw/core/auth"
import {
  type Bridge,
  type BridgeEvent,
  BridgeRegistry,
  type Capabilities,
  type CliId,
  FallbackStrategy,
} from "@devclaw/core/bridge"
import { ProviderCatalog } from "@devclaw/core/provider"

import { createApp } from "../src/app.ts"

const JWT_SECRET = "test-daemon-secret"

function stubBridge(cli: CliId, text: string, opts: { available?: boolean } = {}): Bridge {
  return {
    cli,
    async isAvailable() {
      return opts.available ?? true
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

async function setup(bridgeMap: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "devclaw-daemon-consensus-"))
  const authStore = new FilesystemAuthStore({ dir, passphrase: "pw" })
  const catalog = new ProviderCatalog()
  const bridges = new BridgeRegistry()
  for (const [cli, text] of Object.entries(bridgeMap)) {
    bridges.register(stubBridge(cli as CliId, text))
  }
  const fallback = new FallbackStrategy({ registry: bridges, catalog })
  const app = createApp({
    runtime: { authStore, catalog, bridges, fallback },
    auth: { jwtSecret: JWT_SECRET },
  })
  return { app, dir }
}

async function post(
  app: Awaited<ReturnType<typeof setup>>["app"],
  path: string,
  body: unknown,
) {
  return app.handle(
    new Request(`http://127.0.0.1${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

describe("daemon /consensus", () => {
  let state: Awaited<ReturnType<typeof setup>>

  afterEach(async () => {
    if (state) await rm(state.dir, { recursive: true, force: true })
  })

  test("POST /consensus returns winner + scores across registered bridges", async () => {
    state = await setup({
      claude: "short",
      codex: "a longer and more detailed explanation with more structure",
      gemini: "medium answer",
    })
    const res = await post(state.app, "/consensus", { prompt: "plan refactor" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      status: string
      winner: string
      winnerText: string
      scores: Array<{ cli: string; score: number }>
      participants: Array<{ cli: string; text: string }>
    }
    expect(body.status).toBe("ok")
    expect(body.winner).toBe("codex")
    expect(body.participants.map((p) => p.cli).sort()).toEqual(["claude", "codex", "gemini"])
    expect(body.scores.find((s) => s.cli === "codex")?.score).toBeGreaterThan(0)
  })

  test("--cli subset respected via body.clis", async () => {
    state = await setup({
      claude: "x",
      codex: "xxxxxxxxxxxxxxxxxxxx",
      gemini: "yyyy",
    })
    const res = await post(state.app, "/consensus", {
      prompt: "design",
      clis: ["claude", "gemini"],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      participants: Array<{ cli: string }>
      winner: string
    }
    expect(body.participants.map((p) => p.cli).sort()).toEqual(["claude", "gemini"])
    expect(body.winner).toBe("gemini")
  })

  test("returns 400 when no eligible bridges", async () => {
    state = await setup({})
    const res = await post(state.app, "/consensus", { prompt: "x" })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error.toLowerCase()).toContain("no eligible bridges")
  })

  test("validates body.prompt required", async () => {
    state = await setup({ claude: "x" })
    const res = await post(state.app, "/consensus", { prompt: "" })
    expect(res.status).toBe(422)
  })
})
