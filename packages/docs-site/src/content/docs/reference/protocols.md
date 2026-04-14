---
title: Protocols
description: ACP and MCP server/client surfaces exposed by DevClaw.
---

## ACP — Agent Client Protocol

DevClaw exposes an ACP server on the daemon's `/acp` WebSocket endpoint
and ships a matching client under `@devclaw/core/protocol`.

### Methods

| Method | Direction | Purpose |
|---|---|---|
| `initialize` | C → S | Handshake, capability negotiation |
| `session/new` | C → S | Open a new session |
| `session/load` | C → S | Resume an existing session |
| `session/close` | C → S | Close a session |
| `prompt` | C → S | Run a prompt turn in a session |
| `capabilities` | C → S | Return current agent capabilities |

Streaming uses `stream_chunk` events emitted by the server-side `EventEmitter`.

## MCP — Model Context Protocol

The `/mcp` WebSocket endpoint serves an MCP server. Besides the spec methods
(`initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`,
`resources/read`, `prompts/list`, `prompts/get`), DevClaw registers six
built-in tools with pluggable backends:

- `search_context`
- `get_file_context`
- `find_related`
- `get_project_overview`
- `get_decisions`
- `get_skills_for`

Backends are passed to `AppConfig.mcpBackends` when building the daemon.

## LSP

`@devclaw/core/lsp` ships the wire framing (Content-Length header +
streaming decoder) and an `LSPClient` with the standard lifecycle
(`initialize`, `initialized`, `didOpen`, `didChange`, `didClose`,
`shutdown`, `exit`) plus a `publishDiagnostics` subscription.
