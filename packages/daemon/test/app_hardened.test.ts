import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FilesystemAuthStore } from "@devclaw/core/auth"
import { BridgeRegistry, FallbackStrategy } from "@devclaw/core/bridge"
import { ProviderCatalog } from "@devclaw/core/provider"
import { createApp, issueAuthToken } from "../src/app.ts"

const JWT_SECRET = "test-hardened-secret"

async function setup(requireFromLoopback: boolean) {
  const dir = await mkdtemp(join(tmpdir(), "devclaw-hardened-"))
  const authStore = new FilesystemAuthStore({ dir, passphrase: "pw" })
  const catalog = new ProviderCatalog()
  const bridges = new BridgeRegistry()
  const fallback = new FallbackStrategy({
    registry: bridges,
    catalog,
  })
  const app = createApp({
    runtime: { authStore, catalog, bridges, fallback },
    auth: { jwtSecret: JWT_SECRET, requireFromLoopback },
  })
  return { app, dir }
}

async function req(
  app: Awaited<ReturnType<typeof setup>>["app"],
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; host?: string } = {},
) {
  return app.handle(
    new Request(`http://${opts.host ?? "127.0.0.1"}${path}`, {
      method,
      headers: opts.headers,
    }),
  )
}

describe("daemon — requireFromLoopback hardening (S-02, ADR-022)", () => {
  let hardened: Awaited<ReturnType<typeof setup>>
  let legacy: Awaited<ReturnType<typeof setup>>

  beforeEach(async () => {
    hardened = await setup(true)
    legacy = await setup(false)
  })

  afterEach(async () => {
    await rm(hardened.dir, { recursive: true, force: true })
    await rm(legacy.dir, { recursive: true, force: true })
  })

  test("hardened: loopback WITHOUT bearer → 401", async () => {
    const res = await req(hardened.app, "GET", "/version")
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "missing bearer token" })
  })

  test("hardened: loopback WITH valid bearer → 200", async () => {
    const token = await issueAuthToken(JWT_SECRET, { sub: "local" })
    const res = await req(hardened.app, "GET", "/version", {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
  })

  test("hardened: loopback WITH invalid bearer → 401", async () => {
    const res = await req(hardened.app, "GET", "/version", {
      headers: { authorization: "Bearer not-a-real-token" },
    })
    expect(res.status).toBe(401)
  })

  test("hardened: /health remains exempt from bearer (no 401)", async () => {
    const res = await req(hardened.app, "GET", "/health")
    expect(res.status).toBe(200)
  })

  test("legacy (requireFromLoopback:false): loopback without bearer → 200 (backward compat)", async () => {
    const res = await req(legacy.app, "GET", "/version")
    expect(res.status).toBe(200)
  })
})
