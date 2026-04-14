import { describe, expect, test } from "bun:test"
import { ACPServer } from "../../src/protocol/acp_server.ts"
import { makeRequest } from "../../src/protocol/jsonrpc.ts"

async function call(
  server: ACPServer,
  method: string,
  params?: unknown,
): Promise<{
  id: number
  result?: unknown
  error?: { code: number; message: string }
}> {
  const id = Math.floor(Math.random() * 1_000_000)
  const req = makeRequest(id, method, params)
  const raw = await server.handle(JSON.stringify(req))
  if (!raw) throw new Error("no response for request")
  return JSON.parse(raw)
}

function baseServer(): ACPServer {
  return new ACPServer({
    agentName: "devclaw",
    agentVersion: "0.0.0",
    handlers: {
      prompt: async (p) => ({
        sessionId: p.sessionId,
        summary: `handled: ${p.prompt}`,
        toolCalls: 0,
        durationMs: 0,
      }),
    },
  })
}

describe("ACPServer", () => {
  test("initialize returns agent info + capabilities", async () => {
    const s = baseServer()
    const res = await call(s, "initialize", {
      clientName: "test",
      clientVersion: "0",
      capabilities: {},
    })
    expect((res.result as { agentName: string }).agentName).toBe("devclaw")
  })

  test("rejects pre-initialize session/new", async () => {
    const s = baseServer()
    const res = await call(s, "session/new", {})
    expect(res.error?.code).toBe(-32600)
  })

  test("session/new returns session id", async () => {
    const s = baseServer()
    await call(s, "initialize", { clientName: "t", clientVersion: "0", capabilities: {} })
    const res = await call(s, "session/new", { cwd: "/tmp" })
    const info = res.result as { id: string }
    expect(info.id).toMatch(/^sess_/)
  })

  test("prompt invokes handler + returns summary", async () => {
    const s = baseServer()
    await call(s, "initialize", { clientName: "t", clientVersion: "0", capabilities: {} })
    const session = await call(s, "session/new", {})
    const sessionId = (session.result as { id: string }).id
    const out = await call(s, "prompt", { sessionId, prompt: "hello" })
    expect((out.result as { summary: string }).summary).toBe("handled: hello")
  })

  test("prompt without session throws InvalidParams", async () => {
    const s = baseServer()
    await call(s, "initialize", { clientName: "t", clientVersion: "0", capabilities: {} })
    const res = await call(s, "prompt", { sessionId: "ghost", prompt: "x" })
    expect(res.error?.code).toBe(-32602)
  })

  test("unknown method returns MethodNotFound", async () => {
    const s = baseServer()
    const res = await call(s, "mystery", {})
    expect(res.error?.code).toBe(-32601)
  })

  test("malformed JSON returns ParseError with null id", async () => {
    const s = baseServer()
    const raw = await s.handle("{bad")
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(parsed.id).toBeNull()
    expect(parsed.error?.code).toBe(-32700)
  })

  test("capabilities method returns current caps", async () => {
    const s = baseServer()
    const res = await call(s, "capabilities", {})
    expect((res.result as { capabilities: Record<string, boolean> }).capabilities.streaming).toBe(
      true,
    )
  })

  test("session/close deletes session", async () => {
    const s = baseServer()
    await call(s, "initialize", { clientName: "t", clientVersion: "0", capabilities: {} })
    const open = await call(s, "session/new", {})
    const sessionId = (open.result as { id: string }).id
    const closed = await call(s, "session/close", { sessionId })
    expect((closed.result as { closed: boolean }).closed).toBe(true)
    expect(s.listSessions()).toHaveLength(0)
  })
})
