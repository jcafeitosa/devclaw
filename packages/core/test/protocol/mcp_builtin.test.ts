import { describe, expect, test } from "bun:test"
import { makeRequest } from "../../src/protocol/jsonrpc.ts"
import { registerBuiltinTools } from "../../src/protocol/mcp_builtin.ts"
import { MCPServer } from "../../src/protocol/mcp_server.ts"

async function callTool(s: MCPServer, name: string, args: unknown) {
  const id = 1
  const raw = await s.handle(
    JSON.stringify(makeRequest(id, "tools/call", { name, arguments: args })),
  )
  if (!raw) throw new Error("no response")
  const parsed = JSON.parse(raw) as {
    result: { content: { text: string }[]; isError?: boolean }
  }
  return parsed.result
}

function setup() {
  const s = new MCPServer({ serverName: "t", serverVersion: "0" })
  registerBuiltinTools(s, {
    searchContext: async (q, limit) => [{ snippet: `hit:${q}`, score: 1, limit: limit ?? 5 }],
    getFileContext: async (path) => ({ path, lines: 10, summary: `file ${path}` }),
    findRelated: async (path, limit) => [
      { path: `${path}.related`, score: 0.9, limit: limit ?? 5 },
    ],
    getProjectOverview: async () => ({ name: "devclaw", phase: 7, packages: ["core"] }),
    getDecisions: async (filter) => [{ id: "ADR-001", title: "use bun", filter: filter ?? "*" }],
    getSkillsFor: async (task) => [{ name: "tdd", reason: `applies to ${task}` }],
  })
  return s
}

describe("built-in MCP tools", () => {
  test("registers all 6 tools", async () => {
    const s = setup()
    const raw = await s.handle(JSON.stringify(makeRequest(1, "tools/list")))
    const tools = (JSON.parse(raw!) as { result: { tools: { name: string }[] } }).result.tools
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual([
      "find_related",
      "get_decisions",
      "get_file_context",
      "get_project_overview",
      "get_skills_for",
      "search_context",
    ])
  })

  test("search_context dispatches to backend", async () => {
    const r = await callTool(setup(), "search_context", { query: "auth", limit: 3 })
    expect(r.isError).toBeFalsy()
    expect(JSON.parse(r.content[0]!.text)).toEqual([{ snippet: "hit:auth", score: 1, limit: 3 }])
  })

  test("get_file_context returns file payload", async () => {
    const r = await callTool(setup(), "get_file_context", { path: "src/x.ts" })
    expect(JSON.parse(r.content[0]!.text)).toEqual({
      path: "src/x.ts",
      lines: 10,
      summary: "file src/x.ts",
    })
  })

  test("find_related uses defaults when limit absent", async () => {
    const r = await callTool(setup(), "find_related", { path: "a.ts" })
    expect(JSON.parse(r.content[0]!.text)).toEqual([{ path: "a.ts.related", score: 0.9, limit: 5 }])
  })

  test("get_project_overview takes no args", async () => {
    const r = await callTool(setup(), "get_project_overview", {})
    expect(JSON.parse(r.content[0]!.text)).toEqual({
      name: "devclaw",
      phase: 7,
      packages: ["core"],
    })
  })

  test("get_decisions accepts filter", async () => {
    const r = await callTool(setup(), "get_decisions", { filter: "auth" })
    expect(JSON.parse(r.content[0]!.text)[0]).toMatchObject({ id: "ADR-001", filter: "auth" })
  })

  test("get_skills_for requires task", async () => {
    const r = await callTool(setup(), "get_skills_for", { task: "refactor" })
    expect(JSON.parse(r.content[0]!.text)).toEqual([{ name: "tdd", reason: "applies to refactor" }])
  })

  test("backend missing yields isError content", async () => {
    const s = new MCPServer({ serverName: "t", serverVersion: "0" })
    registerBuiltinTools(s, {})
    const r = await callTool(s, "search_context", { query: "x" })
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toMatch(/not configured/)
  })

  test("missing required arg yields isError", async () => {
    const r = await callTool(setup(), "search_context", {})
    expect(r.isError).toBe(true)
    expect(r.content[0]!.text).toMatch(/query/)
  })
})
