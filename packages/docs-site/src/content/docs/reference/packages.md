---
title: Packages
description: Subpath exports published from @devclaw/core and runtime packages.
---

## Runtime packages

- **`@devclaw/core`** — import from subpaths like `@devclaw/core/auth`, `@devclaw/core/protocol`, `@devclaw/core/runtime`, etc.
- **`@devclaw/daemon`** — Elysia app factory + bin.
- **`@devclaw/cli`** — `devclaw` binary.

## Core subpaths

| Subpath | Responsibility |
|---|---|
| `/auth` | Auth storage (api/oauth/wellknown) |
| `/bridge` | CLI bridges (claude/codex/gemini/aider) |
| `/capability` | Advanced capability wrappers + permission gate |
| `/checkpoint` | Checkpoint + rewind |
| `/cognitive` | Planner / reasoner / router / engine |
| `/comm` | Channels + threads + router + notifications |
| `/context` | Context engine (CPE) |
| `/correction` | Self-correction loop |
| `/discovery` | Stack/CLI/convention discovery |
| `/governance` | Approval gates, budget scopes, goal engine |
| `/hook` | Hook system + hard gates |
| `/learning` | ECAP/TECAP, policy engine, skill evolution |
| `/lsp` | LSP framing + client + registry |
| `/memory` | Short / long / episodic memory |
| `/node` | Node + device registry + health monitor |
| `/oauth` | PKCE flows (Codex, etc.) |
| `/prompt` | Prompt templates + provider adapters |
| `/protocol` | JSON-RPC 2.0, ACP server/client, MCP server + built-in tools |
| `/provider` | Provider catalog (Anthropic, OpenAI, ...) |
| `/queue` | Redis-Streams queue |
| `/reflection` | Reflection + rubric evaluator |
| `/research` | RAG pipeline + budget + cache |
| `/runtime` | Local / ephemeral / worktree managed runtimes + registry |
| `/skill` | Skill parser / registry / activator / progressive loader |
| `/slash` | Slash command runner |
| `/subagent` | Subagent runner + isolation (fork/worktree/none) |
| `/team` | Team composition + orchestration |
| `/terminal` | Terminal session + registry |
| `/tool` | Tool registry + executor + permissions |
| `/work` | Work management (list/kanban/gantt) |

## Vault map

These subpaths correspond to the vault's operating model:

- `06_agent_os` → `/cognitive`, `/context`, `/prompt`, `/memory`, `/skill`, `/tool`, `/subagent`
- `53_gateway_daemon` → `@devclaw/daemon` and its websocket/lifecycle boundary
- `05_communication_os` → `/comm`
- `04_work_management` → `/work`
- `07_learning` → `/learning`, `/reflection`
- `43_self_correction` → `/correction`
- `47_checkpoints_rewind` → `/checkpoint`
