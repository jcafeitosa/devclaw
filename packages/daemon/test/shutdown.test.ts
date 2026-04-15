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
  FallbackStrategy,
} from "@devclaw/core/bridge"
import { ProviderCatalog } from "@devclaw/core/provider"

import { createApp, type DaemonApp } from "../src/app.ts"

const JWT_SECRET = "shutdown-test-secret"

function slowBridge(delayMs: number): Bridge {
  return {
    cli: "claude",
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
        await Bun.sleep(delayMs)
        yield { type: "text", content: "done" }
        yield { type: "completed" }
      })()
    },
    async cancel() {},
  }
}

async function setup(delayMs = 50) {
  const dir = await mkdtemp(join(tmpdir(), "devclaw-daemon-shutdown-"))
  const authStore = new FilesystemAuthStore({ dir, passphrase: "pw" })
  const catalog = new ProviderCatalog()
  const bridges = new BridgeRegistry()
  bridges.register(slowBridge(delayMs))
  const fallback = new FallbackStrategy({ registry: bridges, catalog })
  const app = createApp({
    runtime: { authStore, catalog, bridges, fallback },
    auth: { jwtSecret: JWT_SECRET },
  })
  return { app, dir }
}

async function post(app: DaemonApp, path: string, body: unknown): Promise<Response> {
  return app.handle(
    new Request(`http://127.0.0.1${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
}

describe("daemon graceful shutdown", () => {
  let state: Awaited<ReturnType<typeof setup>>

  beforeEach(async () => {
    state = await setup(50)
  })

  afterEach(async () => {
    await rm(state.dir, { recursive: true, force: true })
  })

  test("requestDraining flag rejects new /invoke with 503", async () => {
    state.app.beginShutdown()
    const res = await post(state.app, "/invoke", { prompt: "hi" })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error.toLowerCase()).toContain("shut")
  })

  test("GET /health still returns 200 during shutdown (readiness marker)", async () => {
    state.app.beginShutdown()
    const res = await state.app.handle(new Request("http://127.0.0.1/health"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; shuttingDown?: boolean }
    expect(body.shuttingDown).toBe(true)
  })

  test("in-flight request during shutdown still completes", async () => {
    const pending = post(state.app, "/invoke", { prompt: "running" })
    // Give it a tick to enter the handler
    await Bun.sleep(10)
    state.app.beginShutdown()
    const res = await pending
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe("ok")
  })

  test("drain() resolves after all in-flight requests finish", async () => {
    const p1 = post(state.app, "/invoke", { prompt: "a" })
    const p2 = post(state.app, "/invoke", { prompt: "b" })
    await Bun.sleep(10)
    expect(state.app.inflight()).toBe(2)
    state.app.beginShutdown()
    await state.app.drain({ timeoutMs: 2000 })
    expect(state.app.inflight()).toBe(0)
    await p1
    await p2
  })
})
