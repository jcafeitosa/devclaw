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

## Agent liveness

The external systems we compared are useful because they show different parts
of the same problem: how an agent becomes a durable, observable, proactive
worker instead of a one-shot chat completion.

The key layers are:

- identity and mission
- workspace and session continuity, including metadata roots
- planning and tool execution loops
- wakeups, heartbeats, and event triggers
- memory, learning, and reflection
- communication, delegation, and approvals
- budget and safety boundaries

Devclaw already has pieces of this in `core/`, `daemon/`, and the docs vault,
but they are not yet documented as one coherent liveness model.

For the full breakdown, see [Agent liveness](/guides/agent-liveness/).

## Vault alignment

The Obsidian vault already models the system in a way that is more explicit
than the current repo docs. The main working groups are:

- `06_agent_os` for cognition, context, prompts, memory, skills, tools, and autonomy
- `53_gateway_daemon` for the long-lived host process and wire protocol
- `05_communication_os` for channels and collaboration
- `07_learning` for experience and skill evolution
- `43_self_correction` for detect → hypothesize → fix → verify loops
- `47_checkpoints_rewind` for snapshots and rollback
- `14_sdlc` for agent roles and stage mapping

That model is already present in the vault, but it is only partially surfaced in
the repo docs. The next step is to keep the docs aligned with that structure
instead of inventing a second vocabulary.
