---
title: Vault Alignment
description: How the Obsidian vault maps onto the current Devclaw repository and documentation.
---

# Vault Alignment

This page is the bridge between the Obsidian vault and the repository docs.
The vault is the canonical system model. The repo should mirror it, not replace
it.

## 1. The vault model

The vault organizes the system around a few stable centers:

- `06_agent_os` — agent cognition and autonomy
- `53_gateway_daemon` — long-lived host process and wire protocol
- `05_communication_os` — channels and collaboration
- `04_work_management` — work items and workflow engine
- `07_learning` — experience and skill evolution
- `43_self_correction` — detect, hypothesize, fix, verify
- `47_checkpoints_rewind` — snapshots and rewind
- `14_sdlc` — role/stage mapping
- `18_decisions` — ADRs

That structure is the cleanest expression of how Devclaw agents become
autonomous, active, and recoverable.

## 2. Agent OS in practice

The vault's `Agent OS` is the "think, remember, act, learn" layer.

It is composed of:

- `agent_architecture` for hierarchy
- `agent_lifecycle` for the loop
- `cognitive_engine` for plan/reason/reflect/model routing
- `context_engine` for structured input
- `prompt_system` for prompt construction
- `memory_system` for short-term, long-term, and episodic memory
- `skill_system` for reusable capabilities
- `tool_system` for tool invocation and permissions
- `autonomy_engine` for wakeups, queues, lanes, and timing
- `subagents` for parallel scoped execution
- `plugin_system` and `provider_layer` for extensibility

In other words, liveness in the vault is not one feature. It is the composition
of these modules around the agent loop.

## 3. Gateway daemon in practice

`53_gateway_daemon` is the host-level runtime boundary.

The vault treats it as:

- a long-lived process
- the owner of connections and events
- the place where health and supervision live
- an optional deployment pattern, but still a real architectural boundary

That is more specific than the current repo docs, which still describe the
daemon mainly as an HTTP/WebSocket surface. The vault adds host ownership,
supervision, wire protocol, and connection lifecycle.

## 4. Autonomy engine in practice

The vault's `Autonomy Engine` explains why agents feel "alive":

- heartbeat scheduler wakes them up
- cron can trigger scheduled work
- event bus triggers can wake them on outside events
- queue manager controls inbound work
- session lanes serialize per-session execution
- typing indicators tell the user the agent is alive even while queued
- debounce and coalescing reduce thrash
- timeout hierarchy keeps runs bounded
- backpressure prevents overload

This is the operational layer that makes the loop continuously active.

## 5. Workspace and local metadata

The ClawCode analysis is useful here because it makes the local workspace model
very explicit.

Important patterns:

- the workspace root is the agent's local home for project work
- project-local metadata can be merged from multiple roots
- writes prefer one canonical root while reads merge across roots
- agent definitions are Markdown files with YAML frontmatter
- skills, plugins, and context paths are all discovered from the workspace

For Devclaw, this suggests the docs should describe not just "workspace" but
"workspace + metadata roots + discovery order".

That matters because it changes where agent identity, prompt context, and
reusable instructions live.

## 6. What Devclaw already covers

The current repo already has a lot of the underlying primitives:

- `packages/core/src/cognitive`
- `packages/core/src/context`
- `packages/core/src/memory`
- `packages/core/src/tool`
- `packages/core/src/subagent`
- `packages/core/src/protocol`
- `packages/core/src/queue`
- `packages/core/src/checkpoint`
- `packages/core/src/reflection`
- `packages/core/src/learning`
- `packages/core/src/governance`
- `packages/daemon/src/app.ts`

The gap is mostly vocabulary and integration. The code has many of the parts,
but the documentation still needs to explain how those parts compose into a
single agent operating model.

## 7. What should be surfaced next

The repo docs should explicitly surface:

- agent lifecycle: receive -> context -> prompt -> plan -> execute -> observe -> reflect -> save
- autonomy engine: wakeups, queues, lanes, debounce, typing, backpressure
- gateway daemon: host ownership, supervision, handshake, connection lifecycle
- workspace contract: root workspace, metadata roots, sandbox policy
- work management: item states, dependencies, workflow rules
- communication: threads, channels, notifications, access policy
- liveness model: identity, memory, proactive triggers, recovery, learning

## 8. Why this matters

Without this alignment, the repo docs look like separate modules. With it, the
system reads as one operating model:

1. The gateway keeps the agent connected.
2. The autonomy engine decides when the agent should wake.
3. Agent OS loads context, builds prompts, plans, acts, and reflects.
4. Memory and learning preserve state across turns.
5. Self-correction and checkpoints let the system recover.

That is the actual "alive agent" story.

## 9. Additional borrowings to surface

The comparison work with the temporary repositories suggests a few more
high-value concepts that should remain visible in Devclaw docs:

- Paperclip-style routines and wake reasons as a first-class proactive entry point
- atomic issue checkout with stale-lock adoption and release ownership
- activity-ledger / run-log semantics for every mutation and wake
- execution workspace lifecycle, including managed checkouts and runtime services
- portable experience capsules with feedback and replay semantics
- security defaults that separate loopback, remote exposure, and channel trust

These are not just implementation details. They are the missing pieces that
make an agent feel continuously alive rather than merely callable.
