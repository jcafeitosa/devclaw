# Design: ACP + MCP Protocols

> Vault: `57_acp_protocol/` + `56_context_engine_mcp/`. Phase 7.

## 🎯 Goal

- JSON-RPC 2.0 primitives (shared).
- **ACP server + client** (Agent Client Protocol) — DevClaw como agent servidor e como cliente.
- **MCP server** — DevClaw exposes context tools to external consumers (Claude Code, Cursor, etc).
- 6 built-in MCP tools: `search_context`, `get_file_context`, `find_related`, `get_project_overview`, `get_decisions`, `get_skills_for`.

## 🧩 Componentes

1. JSON-RPC 2.0 types + errors (Request/Response/Notification, 6 standard error codes).
2. ACP types: Capabilities, SessionInfo, PromptRequest/Response, AgentInterface, ClientInterface.
3. `ACPServer`: handler registry for ACP methods; `handle(message)` routes + validates JSON-RPC.
4. `ACPClient`: `call(method, params)` returns typed response; `notify` fire-and-forget.
5. MCP types: Tool, Resource, Prompt, server-capabilities; `listTools/callTool/listResources` methods.
6. `MCPServer`: register tool/resource/prompt; `handle(message)` routes.
7. 6 built-in MCP tools: pluggable providers (inject context search/memory/governance/skill services).
8. Barrel + `@devclaw/core/protocol` subpath.

## 📋 Plan (7 tasks)

| # | Task |
|---|---|
| 1 | JSON-RPC primitives + errors |
| 2 | ACP types + capability negotiation |
| 3 | ACPServer (method registry + dispatch) |
| 4 | ACPClient (call + notify) |
| 5 | MCPServer + typed tool registration |
| 6 | 6 built-in MCP tools (wired to core services) |
| 7 | Barrel + subpath |

## ✅ DoD

- 0 skip/fail/info/suppressions
- JSON-RPC validator rejects malformed
- ACP capability negotiation tested
- MCP tool call dispatches + returns typed result
