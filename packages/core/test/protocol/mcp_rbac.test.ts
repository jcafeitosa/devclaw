import { describe, expect, test } from "bun:test"
import { makeRequest } from "../../src/protocol/jsonrpc.ts"
import type { MCPAuditEvent } from "../../src/protocol/mcp_server.ts"
import { MCPServer } from "../../src/protocol/mcp_server.ts"

async function callAs(
  s: MCPServer,
  consumerId: string | undefined,
  method: string,
  params?: unknown,
) {
  const id = Math.floor(Math.random() * 1e6)
  const raw = await s.handle(JSON.stringify(makeRequest(id, method, params)), { consumerId })
  if (!raw) throw new Error("no response")
  return JSON.parse(raw) as {
    id: number
    result?: unknown
    error?: { code: number; message: string }
  }
}

function srvWithTool(): MCPServer {
  const s = new MCPServer({
    serverName: "t",
    serverVersion: "0",
    policies: {
      claude: { toolsAllowed: ["safe"] },
      cursor: { toolsDenied: ["safe"] },
    },
  })
  s.registerTool({
    name: "safe",
    description: "safe tool",
    inputSchema: { type: "object" },
    handler: async () => ({ ok: true }),
  })
  s.registerTool({
    name: "other",
    description: "other tool",
    inputSchema: { type: "object" },
    handler: async () => ({ ok: true }),
  })
  return s
}

describe("MCP consumer RBAC — tools/call", () => {
  test("allowlist lets approved consumer through", async () => {
    const s = srvWithTool()
    const r = await callAs(s, "claude", "tools/call", { name: "safe", arguments: {} })
    const body = r.result as { isError?: boolean; content: { text: string }[] }
    expect(body.isError).toBeFalsy()
  })

  test("allowlist blocks tool not in toolsAllowed", async () => {
    const s = srvWithTool()
    const r = await callAs(s, "claude", "tools/call", { name: "other", arguments: {} })
    const body = r.result as { isError: boolean; content: { text: string }[] }
    expect(body.isError).toBe(true)
    expect(body.content[0]!.text).toMatch(/denied/)
  })

  test("denylist blocks explicitly denied tools", async () => {
    const s = srvWithTool()
    const r = await callAs(s, "cursor", "tools/call", { name: "safe", arguments: {} })
    const body = r.result as { isError: boolean; content: { text: string }[] }
    expect(body.isError).toBe(true)
  })

  test("consumer with no policy gets default-allow", async () => {
    const s = srvWithTool()
    const r = await callAs(s, "devclaw", "tools/call", { name: "safe", arguments: {} })
    expect((r.result as { isError?: boolean }).isError).toBeFalsy()
  })

  test("undefined consumerId respects default policy", async () => {
    const s = new MCPServer({
      serverName: "t",
      serverVersion: "0",
      defaultPolicy: { toolsDenied: ["safe"] },
    })
    s.registerTool({
      name: "safe",
      description: "",
      inputSchema: { type: "object" },
      handler: async () => ({ ok: true }),
    })
    const r = await callAs(s, undefined, "tools/call", { name: "safe", arguments: {} })
    expect((r.result as { isError: boolean }).isError).toBe(true)
  })
})

describe("MCP consumer RBAC — tools/list", () => {
  test("tools/list filters out denied tools per consumer", async () => {
    const s = srvWithTool()
    const r = await callAs(s, "claude", "tools/list")
    const names = (r.result as { tools: { name: string }[] }).tools.map((t) => t.name).sort()
    expect(names).toEqual(["safe"])
  })
})

describe("MCP consumer RBAC — resources", () => {
  test("denied resource returns InvalidParams", async () => {
    const s = new MCPServer({
      serverName: "t",
      serverVersion: "0",
      policies: { claude: { resourcesDenied: ["vault://x"] } },
    })
    s.registerResource({
      uri: "vault://x",
      name: "x",
      read: async () => "content",
    })
    const r = await callAs(s, "claude", "resources/read", { uri: "vault://x" })
    expect(r.error?.code).toBe(-32602)
  })

  test("resources/list hides denied resources", async () => {
    const s = new MCPServer({
      serverName: "t",
      serverVersion: "0",
      policies: { claude: { resourcesDenied: ["vault://x"] } },
    })
    s.registerResource({ uri: "vault://x", name: "x", read: async () => "" })
    s.registerResource({ uri: "vault://y", name: "y", read: async () => "" })
    const r = await callAs(s, "claude", "resources/list")
    const uris = (r.result as { resources: { uri: string }[] }).resources.map((x) => x.uri)
    expect(uris).toEqual(["vault://y"])
  })
})

describe("MCP audit log", () => {
  test("emits 'allowed' event on successful tools/call", async () => {
    const events: MCPAuditEvent[] = []
    const s = new MCPServer({ serverName: "t", serverVersion: "0", audit: (e) => events.push(e) })
    s.registerTool({
      name: "safe",
      description: "",
      inputSchema: { type: "object" },
      handler: async () => ({ ok: true }),
    })
    await callAs(s, "claude", "tools/call", { name: "safe", arguments: {} })
    const ev = events.find((e) => e.method === "tools/call") as
      | { consumerId?: string; toolName?: string; outcome: string }
      | undefined
    expect(ev?.outcome).toBe("allowed")
    expect(ev?.toolName).toBe("safe")
    expect(ev?.consumerId).toBe("claude")
  })

  test("emits 'denied' event when RBAC blocks", async () => {
    const events: MCPAuditEvent[] = []
    const s = new MCPServer({
      serverName: "t",
      serverVersion: "0",
      policies: { claude: { toolsDenied: ["safe"] } },
      audit: (e) => events.push(e),
    })
    s.registerTool({
      name: "safe",
      description: "",
      inputSchema: { type: "object" },
      handler: async () => ({ ok: true }),
    })
    await callAs(s, "claude", "tools/call", { name: "safe", arguments: {} })
    const ev = events.find((e) => e.method === "tools/call") as { outcome: string } | undefined
    expect(ev?.outcome).toBe("denied")
  })

  test("emits 'error' event when handler throws", async () => {
    const events: MCPAuditEvent[] = []
    const s = new MCPServer({ serverName: "t", serverVersion: "0", audit: (e) => events.push(e) })
    s.registerTool({
      name: "boom",
      description: "",
      inputSchema: { type: "object" },
      handler: async () => {
        throw new Error("kaboom")
      },
    })
    await callAs(s, "claude", "tools/call", { name: "boom", arguments: {} })
    const ev = events.find((e) => e.method === "tools/call") as { outcome: string } | undefined
    expect(ev?.outcome).toBe("error")
  })

  test("does not audit arguments content (just name + consumer)", async () => {
    const events: MCPAuditEvent[] = []
    const s = new MCPServer({ serverName: "t", serverVersion: "0", audit: (e) => events.push(e) })
    s.registerTool({
      name: "safe",
      description: "",
      inputSchema: { type: "object" },
      handler: async () => ({ ok: true }),
    })
    await callAs(s, "claude", "tools/call", {
      name: "safe",
      arguments: { secret: "hunter2" },
    })
    expect(JSON.stringify(events)).not.toContain("hunter2")
  })
})
