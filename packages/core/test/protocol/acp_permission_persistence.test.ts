import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { ACPServer } from "../../src/protocol/acp_server.ts"
import { ACPPermissionRequestStore } from "../../src/protocol/acp_permission_store.ts"
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
  return JSON.parse(raw) as { result?: unknown }
}

async function initSession(server: ACPServer): Promise<string> {
  await call(server, "initialize", { clientName: "t", clientVersion: "0", capabilities: {} })
  const r = await call(server, "session/new", {})
  return (r.result as { id: string }).id
}

describe("ACP pending permission persistence", () => {
  test("replays pending permission requests when transport reconnects", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-acp-perm-"))
    dirs.push(dir)
    const store = new ACPPermissionRequestStore({ sqlitePath: join(dir, "acp-perm.db") })
    const sentA: Array<{ id?: number; method?: string; params?: unknown }> = []
    const sentB: Array<{ id?: number; method?: string; params?: unknown }> = []

    const server = new ACPServer({
      agentName: "a",
      agentVersion: "0",
      permissionStore: store,
      send: (raw) => {
        sentA.push(JSON.parse(raw))
      },
      handlers: {
        prompt: async (p, ctx) => {
          const decision = await ctx.requestPermission({
            toolId: "write_file",
            input: { path: "/tmp/x" },
            reason: "test",
            riskLevel: "medium",
          })
          return {
            sessionId: p.sessionId,
            summary: `permit=${decision.allow}`,
            toolCalls: 0,
            durationMs: 0,
          }
        },
      },
    })

    const sessionId = await initSession(server)
    const pendingPrompt = call(server, "prompt", { sessionId, prompt: "go" })
    await Bun.sleep(10)

    const firstReq = sentA.find((msg) => msg.method === "session/permission/request")
    expect(firstReq).toBeDefined()
    expect(await store.list({ sessionId })).toHaveLength(1)

    server.setSend((raw) => {
      sentB.push(JSON.parse(raw))
    })
    await server.replayPendingPermissions(sessionId)

    const replayReq = sentB.find((msg) => msg.method === "session/permission/request")
    expect(replayReq).toBeDefined()
    expect(replayReq?.id).toBe(firstReq?.id)

    await server.handle(
      JSON.stringify({
        jsonrpc: "2.0",
        id: replayReq?.id,
        result: { allow: true },
      }),
    )

    const result = await pendingPrompt
    expect((result.result as { summary: string }).summary).toBe("permit=true")
    expect(await store.list({ sessionId })).toHaveLength(0)
  })
})
