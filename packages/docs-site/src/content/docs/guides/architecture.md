---
title: Architecture
description: Top-level view of DevClaw's components and how they connect.
---

DevClaw is a monorepo of three runtime packages and one documentation site:

| Package | Role |
|---|---|
| `@devclaw/core` | Pure TypeScript business logic — auth, providers, bridges, cognitive engine, protocols, runtime, nodes, capabilities, LSP, terminal. |
| `@devclaw/daemon` | Elysia HTTP + WebSocket service. Exposes REST + `/ws` + `/acp` + `/mcp`. |
| `@devclaw/cli` | Bun-executable CLI wrapping the daemon API. |
| `@devclaw/docs-site` | This site (Astro + Starlight). |

## Layered view

```
┌─── UI ────────────────────────────────────────────────┐
│  CLI · docs-site · (planned) TUI · admin-ui           │
└───────────────────────────────────────────────────────┘
┌─── Daemon ────────────────────────────────────────────┐
│  Elysia HTTP + /ws bridge + ACP WS + MCP WS           │
└───────────────────────────────────────────────────────┘
┌─── Core ──────────────────────────────────────────────┐
│  Cognitive  Memory  Learning  Research  Governance    │
│  Team  Subagent  Skill  Slash  Hook  Correction       │
│  Context  Prompt  Provider  Bridge  Auth  Queue       │
│  Protocol (ACP/MCP)  Runtime  Node  Capability  LSP   │
│  Terminal  Work  Comm  Reflection  Checkpoint         │
└───────────────────────────────────────────────────────┘
┌─── Heritage ──────────────────────────────────────────┐
│  opencode · clawcode · superpowers · openclaw · ...   │
└───────────────────────────────────────────────────────┘
```

See [Phases](/guides/phases/) for the roadmap status.
