import { describe, expect, test } from "bun:test"
import { ACPServer } from "../../src/protocol/acp_server.ts"
import type { ACPPromptContent, ACPStreamChunk } from "../../src/protocol/acp_types.ts"
import { makeRequest } from "../../src/protocol/jsonrpc.ts"

async function call(server: ACPServer, method: string, params?: unknown) {
  const id = Math.floor(Math.random() * 1e6)
  const raw = await server.handle(JSON.stringify(makeRequest(id, method, params)))
  if (!raw) throw new Error("no response")
  return JSON.parse(raw) as {
    id: number
    result?: unknown
    error?: { code: number; message: string }
  }
}

async function initSession(s: ACPServer): Promise<string> {
  await call(s, "initialize", { clientName: "t", clientVersion: "0", capabilities: {} })
  const r = await call(s, "session/new", {})
  return (r.result as { id: string }).id
}

describe("ACP prompt — content blocks", () => {
  test("accepts prompt as plain string (back-compat)", async () => {
    let received: ACPPromptContent[] | undefined
    const s = new ACPServer({
      agentName: "a",
      agentVersion: "0",
      handlers: {
        prompt: async (p) => {
          received = p.content
          return { sessionId: p.sessionId, summary: "ok", toolCalls: 0, durationMs: 0 }
        },
      },
    })
    const sid = await initSession(s)
    await call(s, "prompt", { sessionId: sid, prompt: "hello" })
    expect(received).toEqual([{ type: "text", text: "hello" }])
  })

  test("accepts prompt as content block array", async () => {
    let received: ACPPromptContent[] | undefined
    const s = new ACPServer({
      agentName: "a",
      agentVersion: "0",
      handlers: {
        prompt: async (p) => {
          received = p.content
          return { sessionId: p.sessionId, summary: "ok", toolCalls: 0, durationMs: 0 }
        },
      },
    })
    const sid = await initSession(s)
    await call(s, "prompt", {
      sessionId: sid,
      prompt: [
        { type: "text", text: "hi" },
        { type: "image", mimeType: "image/png", data: "b64..." },
      ],
    })
    expect(received).toEqual([
      { type: "text", text: "hi" },
      { type: "image", mimeType: "image/png", data: "b64..." },
    ])
  })
})

describe("ACP prompt — streaming updates", () => {
  test("handler emits session/update notifications via ctx", async () => {
    const sent: { method?: string; params?: unknown }[] = []
    const s = new ACPServer({
      agentName: "a",
      agentVersion: "0",
      send: (raw) => {
        sent.push(JSON.parse(raw))
      },
      handlers: {
        prompt: async (p, ctx) => {
          ctx.update({ kind: "text", content: "step 1" })
          ctx.update({ kind: "tool_call", payload: { name: "read" } })
          ctx.update({ kind: "text", content: "step 2" })
          return { sessionId: p.sessionId, summary: "done", toolCalls: 1, durationMs: 0 }
        },
      },
    })
    const sid = await initSession(s)
    await call(s, "prompt", { sessionId: sid, prompt: "go" })
    const updates = sent.filter((m) => m.method === "session/update")
    expect(updates).toHaveLength(3)
    const firstParams = updates[0]!.params as ACPStreamChunk
    expect(firstParams.sessionId).toBe(sid)
    expect(firstParams.kind).toBe("text")
    expect(firstParams.content).toBe("step 1")
  })

  test("updates fire even when no send callback is configured (best-effort)", async () => {
    const s = new ACPServer({
      agentName: "a",
      agentVersion: "0",
      handlers: {
        prompt: async (p, ctx) => {
          ctx.update({ kind: "text", content: "noop" })
          return { sessionId: p.sessionId, summary: "ok", toolCalls: 0, durationMs: 0 }
        },
      },
    })
    const sid = await initSession(s)
    const r = await call(s, "prompt", { sessionId: sid, prompt: "x" })
    expect((r.result as { summary: string }).summary).toBe("ok")
  })
})

describe("ACP session/cancel", () => {
  test("cancel triggers AbortSignal on in-flight prompt", async () => {
    let signalAborted = false
    const started = Promise.withResolvers<void>()
    const s = new ACPServer({
      agentName: "a",
      agentVersion: "0",
      handlers: {
        prompt: async (p, ctx) => {
          started.resolve()
          await new Promise<void>((resolve) => {
            ctx.signal.addEventListener("abort", () => {
              signalAborted = true
              resolve()
            })
          })
          return { sessionId: p.sessionId, summary: "aborted", toolCalls: 0, durationMs: 0 }
        },
      },
    })
    const sid = await initSession(s)
    const pending = call(s, "prompt", { sessionId: sid, prompt: "slow" })
    await started.promise
    const cancelled = await call(s, "session/cancel", { sessionId: sid })
    expect((cancelled.result as { cancelled: boolean }).cancelled).toBe(true)
    await pending
    expect(signalAborted).toBe(true)
  })

  test("cancel on unknown session returns cancelled:false", async () => {
    const s = new ACPServer({ agentName: "a", agentVersion: "0" })
    await call(s, "initialize", { clientName: "t", clientVersion: "0", capabilities: {} })
    const r = await call(s, "session/cancel", { sessionId: "ghost" })
    expect((r.result as { cancelled: boolean }).cancelled).toBe(false)
  })
})

describe("ACP permission request flow", () => {
  test("ctx.requestPermission sends notification and awaits response", async () => {
    const sent: { method?: string; id?: number; params?: unknown }[] = []
    let requestId = 0
    const s = new ACPServer({
      agentName: "a",
      agentVersion: "0",
      send: (raw) => {
        const msg = JSON.parse(raw)
        sent.push(msg)
        if (msg.method === "session/permission/request") {
          requestId = msg.id
          setTimeout(() => {
            void s.handle(
              JSON.stringify({
                jsonrpc: "2.0",
                id: requestId,
                result: { allow: true },
              }),
            )
          }, 0)
        }
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
    const sid = await initSession(s)
    const r = await call(s, "prompt", { sessionId: sid, prompt: "go" })
    expect((r.result as { summary: string }).summary).toBe("permit=true")
    const permReq = sent.find((m) => m.method === "session/permission/request")
    expect(permReq).toBeDefined()
  })

  test("permission requests move the session through running -> awaiting_permission -> running -> idle", async () => {
    const sent: { method?: string; id?: number; params?: unknown }[] = []
    const requestSeen = Promise.withResolvers<void>()
    let requestId = 0
    let sessionId = ""
    let server!: ACPServer
    server = new ACPServer({
      agentName: "a",
      agentVersion: "0",
      send: (raw) => {
        const msg = JSON.parse(raw)
        sent.push(msg)
        if (msg.method === "session/permission/request") {
          requestId = msg.id
          const state = server.listSessions().find((s) => s.id === sessionId)
          expect(state?.state).toBe("awaiting_permission")
          requestSeen.resolve()
        }
      },
      handlers: {
        prompt: async (p, ctx) => {
          const running = server.listSessions().find((s) => s.id === p.sessionId)
          expect(running?.state).toBe("running")
          const decision = await ctx.requestPermission({
            toolId: "write_file",
            input: { path: "/tmp/x" },
            reason: "test",
            riskLevel: "medium",
          })
          const resumed = server.listSessions().find((s) => s.id === p.sessionId)
          expect(resumed?.state).toBe("running")
          return {
            sessionId: p.sessionId,
            summary: `permit=${decision.allow}`,
            toolCalls: 0,
            durationMs: 0,
          }
        },
      },
    })
    sessionId = await initSession(server)
    const pending = call(server, "prompt", { sessionId, prompt: "go" })
    await requestSeen.promise
    await server.handle(
      JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        result: { allow: true },
      }),
    )
    const result = await pending
    expect((result.result as { summary: string }).summary).toBe("permit=true")
    const final = server.listSessions().find((s) => s.id === sessionId)
    expect(final?.state).toBe("idle")
  })

  test("requestPermission throws if send not configured", async () => {
    const s = new ACPServer({
      agentName: "a",
      agentVersion: "0",
      handlers: {
        prompt: async (_p, ctx) => {
          try {
            await ctx.requestPermission({
              toolId: "x",
              input: {},
              reason: "r",
              riskLevel: "low",
            })
            throw new Error("should have thrown")
          } catch (err) {
            return {
              sessionId: _p.sessionId,
              summary: (err as Error).message,
              toolCalls: 0,
              durationMs: 0,
            }
          }
        },
      },
    })
    const sid = await initSession(s)
    const r = await call(s, "prompt", { sessionId: sid, prompt: "go" })
    expect((r.result as { summary: string }).summary).toMatch(/permission.*transport|send/i)
  })
})
