import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FilesystemAuthStore } from "@devclaw/core/auth"
import { BridgeRegistry, FallbackStrategy } from "@devclaw/core/bridge"
import { makeRequest } from "@devclaw/core/protocol"
import { ProviderCatalog } from "@devclaw/core/provider"
import { createApp } from "../src/app.ts"

async function rpc(url: string, method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const id = Math.floor(Math.random() * 1e6)
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("rpc timeout"))
    }, 2000)
    ws.addEventListener("open", () => ws.send(JSON.stringify(makeRequest(id, method, params))))
    ws.addEventListener("message", (ev) => {
      const parsed = JSON.parse(String(ev.data)) as {
        id?: number
        result?: unknown
        error?: unknown
      }
      if (parsed.id !== id) return
      clearTimeout(timer)
      ws.close()
      resolve(parsed)
    })
    ws.addEventListener("error", (e) => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

describe("daemon protocols", () => {
  let dir: string
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>
  let port: number

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-daemon-proto-"))
    const authStore = new FilesystemAuthStore({ dir, passphrase: "pw" })
    const catalog = new ProviderCatalog()
    catalog.register({
      id: "stub",
      name: "Stub",
      baseUrl: "",
      defaultModel: "x",
      async generate() {
        return "stub"
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
    const p = server.server?.port
    if (!p) throw new Error("no port")
    port = p
  })

  afterEach(async () => {
    server.server?.stop(true)
    await rm(dir, { recursive: true, force: true })
  })

  test("/acp initialize roundtrip", async () => {
    const res = (await rpc(`ws://127.0.0.1:${port}/acp`, "initialize", {
      clientName: "t",
      clientVersion: "0",
      capabilities: {},
    })) as { result: { agentName: string } }
    expect(res.result.agentName).toBe("devclaw")
  })

  test("/acp capabilities returns daemon caps", async () => {
    const res = (await rpc(`ws://127.0.0.1:${port}/acp`, "capabilities")) as {
      result: { capabilities: { streaming: boolean } }
    }
    expect(res.result.capabilities.streaming).toBe(true)
  })

  test("/mcp initialize returns server info", async () => {
    const res = (await rpc(`ws://127.0.0.1:${port}/mcp`, "initialize", {
      clientInfo: { name: "t", version: "0" },
    })) as { result: { serverInfo: { name: string } } }
    expect(res.result.serverInfo.name).toBe("devclaw-mcp")
  })

  test("/mcp tools/list includes built-in tools", async () => {
    const res = (await rpc(`ws://127.0.0.1:${port}/mcp`, "tools/list")) as {
      result: { tools: { name: string }[] }
    }
    const names = res.result.tools.map((t) => t.name)
    expect(names).toContain("get_project_overview")
  })
})
