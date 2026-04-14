import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FilesystemAuthStore } from "@devclaw/core/auth"
import { BridgeRegistry, FallbackStrategy } from "@devclaw/core/bridge"
import { ProviderCatalog } from "@devclaw/core/provider"
import { createApp } from "../src/app.ts"

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "devclaw-daemon-"))
  const authStore = new FilesystemAuthStore({ dir, passphrase: "pw" })
  const catalog = new ProviderCatalog()
  catalog.register({
    id: "stub",
    name: "Stub",
    baseUrl: "",
    defaultModel: "x",
    async generate({ prompt }) {
      return `stub-response: ${prompt}`
    },
  })
  const bridges = new BridgeRegistry()
  const fallback = new FallbackStrategy({
    registry: bridges,
    catalog,
    fallbackProviderId: "stub",
  })
  const app = createApp({ runtime: { authStore, catalog, bridges, fallback } })
  return { app, dir, authStore }
}

async function request(
  app: Awaited<ReturnType<typeof setup>>["app"],
  method: string,
  path: string,
  body?: unknown,
) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  )
}

describe("daemon app", () => {
  let setupState: Awaited<ReturnType<typeof setup>>

  beforeEach(async () => {
    setupState = await setup()
  })

  afterEach(async () => {
    await rm(setupState.dir, { recursive: true, force: true })
  })

  test("GET /health → ok", async () => {
    const res = await request(setupState.app, "GET", "/health")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "ok" })
  })

  test("GET /version → version", async () => {
    const res = await request(setupState.app, "GET", "/version")
    expect(((await res.json()) as { version: string }).version).toBe("0.0.0")
  })

  test("GET /discover returns report", async () => {
    const res = await request(setupState.app, "GET", `/discover?dir=${setupState.dir}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { projectRoot: string }
    expect(body.projectRoot).toBe(setupState.dir)
  })

  test("GET /providers lists registered stub", async () => {
    const res = await request(setupState.app, "GET", "/providers")
    const body = (await res.json()) as { items: Array<{ id: string }> }
    expect(body.items.map((i) => i.id)).toContain("stub")
  })

  test("GET /bridges returns empty items when none registered", async () => {
    const res = await request(setupState.app, "GET", "/bridges")
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  test("auth POST + GET + DELETE round-trip", async () => {
    const save = await request(setupState.app, "POST", "/auth/anthropic", {
      key: "sk-test",
    })
    expect(save.status).toBe(200)
    const list = await request(setupState.app, "GET", "/auth")
    const listBody = (await list.json()) as { items: Array<{ provider: string; type: string }> }
    expect(listBody.items.some((i) => i.provider === "anthropic")).toBe(true)
    const del = await request(setupState.app, "DELETE", "/auth/anthropic")
    expect(del.status).toBe(200)
    const list2 = await request(setupState.app, "GET", "/auth")
    const listBody2 = (await list2.json()) as { items: unknown[] }
    expect(listBody2.items.length).toBe(0)
  })

  test("POST /invoke falls back to provider catalog and returns text", async () => {
    const res = await request(setupState.app, "POST", "/invoke", {
      prompt: "hello",
      cli: "claude",
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; text: string }
    expect(body.status).toBe("ok")
    expect(body.text).toContain("stub-response: hello")
  })

  test("invoke with empty prompt rejects", async () => {
    const res = await request(setupState.app, "POST", "/invoke", { prompt: "" })
    expect(res.status).toBe(422)
  })
})
