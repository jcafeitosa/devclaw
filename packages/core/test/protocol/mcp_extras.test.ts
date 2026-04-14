import { describe, expect, test } from "bun:test"
import { makeRequest } from "../../src/protocol/jsonrpc.ts"
import { registerBuiltinTools } from "../../src/protocol/mcp_builtin.ts"
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

describe("MCP listChanged notifications", () => {
  test("registerTool emits notifications/tools/list_changed when send is configured", () => {
    const sent: { method?: string }[] = []
    const s = new MCPServer({
      serverName: "t",
      serverVersion: "0",
      send: (raw) => {
        sent.push(JSON.parse(raw))
      },
    })
    s.registerTool({
      name: "echo",
      description: "",
      inputSchema: { type: "object" },
      handler: async () => null,
    })
    expect(sent.some((m) => m.method === "notifications/tools/list_changed")).toBe(true)
  })

  test("registerResource emits notifications/resources/list_changed", () => {
    const sent: { method?: string }[] = []
    const s = new MCPServer({
      serverName: "t",
      serverVersion: "0",
      send: (raw) => {
        sent.push(JSON.parse(raw))
      },
    })
    s.registerResource({ uri: "x://a", name: "a", read: async () => "" })
    expect(sent.some((m) => m.method === "notifications/resources/list_changed")).toBe(true)
  })

  test("registerPrompt emits notifications/prompts/list_changed", () => {
    const sent: { method?: string }[] = []
    const s = new MCPServer({
      serverName: "t",
      serverVersion: "0",
      send: (raw) => {
        sent.push(JSON.parse(raw))
      },
    })
    s.registerPrompt({
      name: "p",
      description: "",
      build: () => ({ messages: [] }),
    })
    expect(sent.some((m) => m.method === "notifications/prompts/list_changed")).toBe(true)
  })

  test("registers without send are silent (no crash, no emission)", () => {
    const s = new MCPServer({ serverName: "t", serverVersion: "0" })
    expect(() =>
      s.registerTool({
        name: "x",
        description: "",
        inputSchema: { type: "object" },
        handler: async () => null,
      }),
    ).not.toThrow()
  })
})

describe("MCP submit_observation tool", () => {
  test("registerBuiltinTools wires submit_observation to backend", async () => {
    const observations: { kind: string; payload: unknown }[] = []
    const s = new MCPServer({ serverName: "t", serverVersion: "0" })
    registerBuiltinTools(s, {
      submitObservation: async (kind, payload) => {
        observations.push({ kind, payload })
        return { stored: true }
      },
    })
    const r = await call(s, "tools/call", {
      name: "submit_observation",
      arguments: { kind: "lesson", payload: { text: "tdd works" } },
    })
    const body = r.result as { isError?: boolean; content: { text: string }[] }
    expect(body.isError).toBeFalsy()
    expect(observations).toEqual([{ kind: "lesson", payload: { text: "tdd works" } }])
    expect(JSON.parse(body.content[0]!.text)).toEqual({ stored: true })
  })

  test("missing backend returns isError content", async () => {
    const s = new MCPServer({ serverName: "t", serverVersion: "0" })
    registerBuiltinTools(s, {})
    const r = await call(s, "tools/call", {
      name: "submit_observation",
      arguments: { kind: "lesson", payload: {} },
    })
    const body = r.result as { isError: boolean; content: { text: string }[] }
    expect(body.isError).toBe(true)
    expect(body.content[0]!.text).toMatch(/not configured/)
  })

  test("missing 'kind' arg returns isError", async () => {
    const s = new MCPServer({ serverName: "t", serverVersion: "0" })
    registerBuiltinTools(s, { submitObservation: async () => ({}) })
    const r = await call(s, "tools/call", {
      name: "submit_observation",
      arguments: { payload: {} },
    })
    const body = r.result as { isError: boolean; content: { text: string }[] }
    expect(body.isError).toBe(true)
    expect(body.content[0]!.text).toMatch(/kind/)
  })
})
