import type { MCPServer } from "./mcp_server.ts"

export interface BuiltinToolBackends {
  searchContext?: (query: string, limit?: number) => Promise<unknown> | unknown
  getFileContext?: (path: string) => Promise<unknown> | unknown
  findRelated?: (path: string, limit?: number) => Promise<unknown> | unknown
  getProjectOverview?: () => Promise<unknown> | unknown
  getDecisions?: (filter?: string) => Promise<unknown> | unknown
  getSkillsFor?: (task: string) => Promise<unknown> | unknown
}

function ensure<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null || value === "") {
    throw new Error(`missing required argument: ${name}`)
  }
  return value
}

function configured<T>(fn: T | undefined, key: string): T {
  if (!fn) throw new Error(`backend '${key}' not configured`)
  return fn
}

export function registerBuiltinTools(server: MCPServer, backends: BuiltinToolBackends): void {
  server.registerTool({
    name: "search_context",
    description: "Search the project context engine for relevant snippets.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "search query" },
        limit: { type: "number", description: "max results", default: 5 },
      },
      required: ["query"],
    },
    handler: async (input) => {
      const i = input as { query?: string; limit?: number }
      const fn = configured(backends.searchContext, "searchContext")
      return fn(ensure(i.query, "query"), i.limit)
    },
  })

  server.registerTool({
    name: "get_file_context",
    description: "Retrieve summarized context for a single file path.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    handler: async (input) => {
      const i = input as { path?: string }
      const fn = configured(backends.getFileContext, "getFileContext")
      return fn(ensure(i.path, "path"))
    },
  })

  server.registerTool({
    name: "find_related",
    description: "Find files related to the given path via semantic + graph signals.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, limit: { type: "number", default: 5 } },
      required: ["path"],
    },
    handler: async (input) => {
      const i = input as { path?: string; limit?: number }
      const fn = configured(backends.findRelated, "findRelated")
      return fn(ensure(i.path, "path"), i.limit)
    },
  })

  server.registerTool({
    name: "get_project_overview",
    description: "Return the high-level project overview (stack, phase, packages).",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const fn = configured(backends.getProjectOverview, "getProjectOverview")
      return fn()
    },
  })

  server.registerTool({
    name: "get_decisions",
    description: "List architectural decisions, optionally filtered by topic.",
    inputSchema: {
      type: "object",
      properties: { filter: { type: "string", description: "topic substring" } },
    },
    handler: async (input) => {
      const i = input as { filter?: string }
      const fn = configured(backends.getDecisions, "getDecisions")
      return fn(i.filter)
    },
  })

  server.registerTool({
    name: "get_skills_for",
    description: "Return skills applicable to the given task description.",
    inputSchema: {
      type: "object",
      properties: { task: { type: "string" } },
      required: ["task"],
    },
    handler: async (input) => {
      const i = input as { task?: string }
      const fn = configured(backends.getSkillsFor, "getSkillsFor")
      return fn(ensure(i.task, "task"))
    },
  })
}
