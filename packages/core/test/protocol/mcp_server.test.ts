import { describe, expect, test } from "bun:test"
import { makeRequest } from "../../src/protocol/jsonrpc.ts"
import { MCPServer } from "../../src/protocol/mcp_server.ts"

async function call(s: MCPServer, method: string, params?: unknown) {
  const id = Math.floor(Math.random() * 1e6)
  const raw = await s.handle(JSON.stringify(makeRequest(id, method, params)))
  if (!raw) throw new Error("no response")
  return JSON.parse(raw) as {
    id: number
    result?: unknown
    error?: { code: number; message: string }
  }
}

function srv(): MCPServer {
  return new MCPServer({ serverName: "devclaw-mcp", serverVersion: "0.0.0" })
}

describe("MCPServer", () => {
  test("initialize returns server info + protocol version", async () => {
    const s = srv()
    const res = await call(s, "initialize", { clientInfo: { name: "t", version: "0" } })
    const r = res.result as { serverInfo: { name: string }; protocolVersion: string }
    expect(r.serverInfo.name).toBe("devclaw-mcp")
    expect(r.protocolVersion).toBeString()
  })

  test("tools/list returns registered tools", async () => {
    const s = srv()
    s.registerTool({
      name: "echo",
      description: "echo input",
      inputSchema: { type: "object", properties: { msg: { type: "string" } } },
      handler: async (i) => ({ out: (i as { msg: string }).msg }),
    })
    const res = await call(s, "tools/list")
    const r = res.result as { tools: { name: string }[] }
    expect(r.tools).toHaveLength(1)
    expect(r.tools[0]!.name).toBe("echo")
  })

  test("tools/call invokes handler and returns content", async () => {
    const s = srv()
    s.registerTool({
      name: "echo",
      description: "echo",
      inputSchema: { type: "object" },
      handler: async (i) => ({ out: (i as { msg: string }).msg }),
    })
    const res = await call(s, "tools/call", { name: "echo", arguments: { msg: "hi" } })
    const r = res.result as { content: { type: string; text: string }[]; isError?: boolean }
    expect(r.isError).toBeFalsy()
    expect(r.content[0]!.type).toBe("text")
    expect(JSON.parse(r.content[0]!.text)).toEqual({ out: "hi" })
  })

  test("tools/call unknown tool returns error result", async () => {
    const s = srv()
    const res = await call(s, "tools/call", { name: "ghost", arguments: {} })
    const r = res.result as { isError: boolean; content: { text: string }[] }
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toMatch(/ghost/)
  })

  test("tools/call handler throw returns isError content (not protocol error)", async () => {
    const s = srv()
    s.registerTool({
      name: "boom",
      description: "always throws",
      inputSchema: { type: "object" },
      handler: async () => {
        throw new Error("kaboom")
      },
    })
    const res = await call(s, "tools/call", { name: "boom", arguments: {} })
    const r = res.result as { isError: boolean; content: { text: string }[] }
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toMatch(/kaboom/)
  })

  test("resources/list + resources/read", async () => {
    const s = srv()
    s.registerResource({
      uri: "devclaw://about",
      name: "About",
      mimeType: "text/plain",
      read: async () => "DevClaw MCP",
    })
    const list = await call(s, "resources/list")
    expect((list.result as { resources: { uri: string }[] }).resources[0]!.uri).toBe(
      "devclaw://about",
    )
    const read = await call(s, "resources/read", { uri: "devclaw://about" })
    const r = read.result as { contents: { uri: string; mimeType: string; text: string }[] }
    expect(r.contents[0]!.text).toBe("DevClaw MCP")
  })

  test("resources/read unknown uri returns InvalidParams", async () => {
    const s = srv()
    const res = await call(s, "resources/read", { uri: "x://nope" })
    expect(res.error?.code).toBe(-32602)
  })

  test("prompts/list + prompts/get", async () => {
    const s = srv()
    s.registerPrompt({
      name: "summarize",
      description: "summarize text",
      arguments: [{ name: "text", required: true }],
      build: (args) => ({
        messages: [{ role: "user", content: { type: "text", text: `Summarize: ${args.text}` } }],
      }),
    })
    const list = await call(s, "prompts/list")
    expect((list.result as { prompts: { name: string }[] }).prompts[0]!.name).toBe("summarize")
    const get = await call(s, "prompts/get", { name: "summarize", arguments: { text: "hi" } })
    const r = get.result as { messages: { content: { text: string } }[] }
    expect(r.messages[0]!.content.text).toBe("Summarize: hi")
  })

  test("unknown method returns MethodNotFound", async () => {
    const s = srv()
    const res = await call(s, "mystery")
    expect(res.error?.code).toBe(-32601)
  })

  test("ping returns pong", async () => {
    const s = srv()
    const res = await call(s, "ping")
    expect(res.result).toEqual({})
  })
})
