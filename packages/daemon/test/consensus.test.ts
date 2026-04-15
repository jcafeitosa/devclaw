import { afterEach, describe, expect, test } from "bun:test"
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
import { type GenerateOpts, ProviderCatalog, type ProviderDescriptor } from "@devclaw/core/provider"

import { createApp } from "../src/app.ts"

const JWT_SECRET = "test-daemon-secret"

function stubBridge(
  cli: CliId,
  text: string,
  opts: { available?: boolean; costUsd?: number } = {},
): Bridge {
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
      return {
        costUsd: opts.costUsd ?? 0,
        tokensIn: 0,
        tokensOut: 0,
        subscriptionCovered: true,
      }
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

function judgeProvider(impl: (opts: GenerateOpts) => Promise<string>): ProviderDescriptor {
  return {
    id: "judge",
    name: "Judge",
    baseUrl: "",
    defaultModel: "judge-1",
    async generate(opts) {
      return impl(opts)
    },
  }
}

async function setup(
  bridgeMap: Record<string, string>,
  providers: ProviderDescriptor[] = [],
  costs: Record<string, number> = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "devclaw-daemon-consensus-"))
  const authStore = new FilesystemAuthStore({ dir, passphrase: "pw" })
  const catalog = new ProviderCatalog()
  for (const provider of providers) catalog.register(provider)
  const bridges = new BridgeRegistry()
  for (const [cli, text] of Object.entries(bridgeMap)) {
    bridges.register(stubBridge(cli as CliId, text, { costUsd: costs[cli] ?? 0 }))
  }
  const fallback = new FallbackStrategy({ registry: bridges, catalog })
  const app = createApp({
    runtime: { authStore, catalog, bridges, fallback },
    auth: { jwtSecret: JWT_SECRET },
  })
  return { app, dir }
}

async function post(app: Awaited<ReturnType<typeof setup>>["app"], path: string, body: unknown) {
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

  test("uses judge scorer when a provider is available", async () => {
    const seenPrompts: string[] = []
    state = await setup(
      {
        claude: "this is the longest answer but should lose",
        codex: "tiny",
        gemini: "medium",
      },
      [
        judgeProvider(async (opts) => {
          seenPrompts.push(opts.prompt)
          return opts.prompt.includes("CLI: codex") ? "1" : "0.2"
        }),
      ],
    )
    const res = await post(state.app, "/consensus", { prompt: "plan refactor" })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      status: string
      winner: string
      scores: Array<{ cli: string; score: number }>
    }
    expect(body.status).toBe("ok")
    expect(body.winner).toBe("codex")
    expect(seenPrompts.some((prompt) => prompt.includes("Goal: plan refactor"))).toBe(true)
    expect(seenPrompts.some((prompt) => prompt.includes("CLI: codex"))).toBe(true)
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

  test("hard-stop budget rejects when planned consensus cost exceeds limit", async () => {
    state = await setup(
      {
        claude: "short",
        codex: "long",
      },
      [],
      { claude: 0.1, codex: 0.1 },
    )
    const res = await post(state.app, "/consensus", { prompt: "budget guard" })
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body.toLowerCase()).toContain("budget exceeded")
  })
})
