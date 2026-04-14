import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { ACPServer } from "../../src/protocol/acp_server.ts"
import { ACPSessionStore } from "../../src/protocol/acp_session_store.ts"
import { makeRequest } from "../../src/protocol/jsonrpc.ts"

const dirs: string[] = []

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

async function call(server: ACPServer, method: string, params?: unknown) {
  const id = Math.floor(Math.random() * 1e6)
  const raw = await server.handle(JSON.stringify(makeRequest(id, method, params)))
  if (!raw) throw new Error("no response")
  return JSON.parse(raw) as { result?: unknown; error?: { code: number; message: string } }
}

async function init(server: ACPServer) {
  await call(server, "initialize", { clientName: "t", clientVersion: "0", capabilities: {} })
}

describe("ACPServer persistence", () => {
  test("session/new persists and session/load can recover in a new server instance", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-acp-store-"))
    dirs.push(dir)
    const store = new ACPSessionStore({ sqlitePath: join(dir, "acp.db") })

    const first = new ACPServer({ agentName: "devclaw", agentVersion: "0", sessionStore: store })
    await init(first)
    const created = await call(first, "session/new", { cwd: "/tmp/project" })
    const id = (created.result as { id: string }).id

    const second = new ACPServer({ agentName: "devclaw", agentVersion: "0", sessionStore: store })
    await init(second)
    const loaded = await call(second, "session/load", { sessionId: id })
    expect((loaded.result as { id: string; cwd: string }).id).toBe(id)
    expect((loaded.result as { id: string; cwd: string }).cwd).toBe("/tmp/project")
  })

  test("session/close removes persisted session", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-acp-store-"))
    dirs.push(dir)
    const store = new ACPSessionStore({ sqlitePath: join(dir, "acp.db") })

    const server = new ACPServer({ agentName: "devclaw", agentVersion: "0", sessionStore: store })
    await init(server)
    const created = await call(server, "session/new", {})
    const id = (created.result as { id: string }).id

    await call(server, "session/close", { sessionId: id })

    const other = new ACPServer({ agentName: "devclaw", agentVersion: "0", sessionStore: store })
    await init(other)
    const loaded = await call(other, "session/load", { sessionId: id })
    expect(loaded.error?.code).toBe(-32602)
  })
})
