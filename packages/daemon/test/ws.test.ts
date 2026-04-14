import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FilesystemAuthStore } from "@devclaw/core/auth"
import { BridgeRegistry, FallbackStrategy } from "@devclaw/core/bridge"
import { ProviderCatalog } from "@devclaw/core/provider"
import { createApp } from "../src/app.ts"

interface Envelope {
  channel: "invoke" | "ping"
  type: string
  payload?: unknown
}

async function collectUntilEnd(url: string, send: Envelope[]): Promise<Envelope[]> {
  return new Promise((resolve, reject) => {
    const out: Envelope[] = []
    const ws = new WebSocket(url)
    ws.addEventListener("open", () => {
      for (const msg of send) ws.send(JSON.stringify(msg))
    })
    ws.addEventListener("message", (ev) => {
      try {
        const env = JSON.parse(String(ev.data)) as Envelope
        out.push(env)
        if (env.channel === "ping" && env.type === "pong") {
          ws.close()
          resolve(out)
        }
        if (env.channel === "invoke" && env.type === "end") {
          ws.close()
          resolve(out)
        }
      } catch (err) {
        reject(err)
      }
    })
    ws.addEventListener("error", reject)
  })
}

describe("daemon WS", () => {
  let dir: string
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>
  let url: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-daemon-ws-"))
    const authStore = new FilesystemAuthStore({ dir, passphrase: "pw" })
    const catalog = new ProviderCatalog()
    catalog.register({
      id: "stub",
      name: "Stub",
      baseUrl: "",
      defaultModel: "x",
      async generate() {
        return "stubbed-ws"
      },
    })
    const bridges = new BridgeRegistry()
    const fallback = new FallbackStrategy({
      registry: bridges,
      catalog,
      fallbackProviderId: "stub",
    })
    const app = createApp({ runtime: { authStore, catalog, bridges, fallback } })
    server = app.listen(0)
    const port = server.server?.port
    if (!port) throw new Error("daemon: failed to bind port")
    url = `ws://127.0.0.1:${port}/ws`
  })

  afterEach(async () => {
    server.server?.stop(true)
    await rm(dir, { recursive: true, force: true })
  })

  test("ping → pong roundtrip", async () => {
    const out = await collectUntilEnd(url, [{ channel: "ping", type: "ping", payload: null }])
    const pong = out.find((e) => e.channel === "ping" && e.type === "pong")
    expect(pong).toBeDefined()
  })

  test("invoke streams events then ends", async () => {
    const out = await collectUntilEnd(url, [
      {
        channel: "invoke",
        type: "start",
        payload: { prompt: "hi", cli: "claude" },
      },
    ])
    const invoke = out.filter((e) => e.channel === "invoke")
    expect(invoke.some((e) => e.type === "text")).toBe(true)
    expect(invoke[invoke.length - 1]?.type).toBe("end")
  })

  test("invoke without prompt emits error envelope", async () => {
    const out = await collectUntilEnd(url, [{ channel: "invoke", type: "start", payload: {} }])
    const err = out.find((e) => e.channel === "invoke" && e.type === "error")
    expect(err).toBeDefined()
  })
})
