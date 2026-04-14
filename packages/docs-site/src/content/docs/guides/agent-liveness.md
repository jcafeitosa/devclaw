---
title: Agent Liveness
description: What makes agents feel autonomous, active, proactive, and "alive" in Devclaw.
---

# Agent Liveness

This guide identifies the properties that make an agent feel autonomous,
active, proactive, and continuously alive rather than merely callable.

The comparison set is:

- OpenClaw for gateway, workspace, and runtime boundaries
- Paperclip for control-plane, heartbeats, budgets, and execution lifecycle
- ClawCode for workspace metadata, skills, plugins, and learning loops

## 1. What "alive" means

An agent feels alive when it can:

- keep a stable identity across turns
- remember what it is doing
- decide its next move without constant human prompting
- notice events and react on its own
- explain what it is doing while it is doing it
- recover from errors and continue
- improve its behavior from prior runs

That breaks down into five loops:

1. Goal loop
   - What should I do next?
   - How does this connect to the higher-level mission?

2. Context loop
   - What changed since the last turn?
   - What context matters now and what can be ignored?

3. Action loop
   - Which tool or subagent should run?
   - Did the action succeed, fail, or need verification?

4. Memory loop
   - What should be stored for later?
   - What should be summarized or compacted?

5. Social loop
   - Who needs a status update?
   - Does this require approval, delegation, or escalation?

If a system lacks these loops, it may still be useful, but it feels static.

The vault expresses the concrete loop like this:

`Receive Task -> Load Context -> Build Prompt -> Plan -> Execute -> Observe -> Reflect -> Done? -> Save Outputs`

## 2. The core traits

### 2.1 Autonomy

Autonomy means the agent can carry a goal forward with partial information.

Key enablers:

- mission or role definition
- plan generation
- task decomposition
- tool selection
- subagent delegation
- budget awareness
- error recovery

In practice, autonomy is not a single feature. It is the combination of
planning, execution, reflection, and bounded self-direction.

### 2.2 Activity

Activity means the agent is visibly doing work even when the user is not
watching.

Key enablers:

- heartbeats or wakeups
- background queues
- live status updates
- run logs
- progress events
- persistent task state
- queue timing and typing indicators
- lane-based concurrency
- dependency-driven wakeups and state transitions

An active agent has a heartbeat, a state transition, or an observable run
history.

### 2.3 Proactivity

Proactivity means the agent initiates work from signals instead of waiting for a
direct prompt.

Key enablers:

- timer-based wakeups
- task assignment triggers
- event subscriptions
- reminders and nudges
- change detection
- periodic check-ins
- learned priorities
- cron-style triggers
- event-bus triggers
- queue coalescing

A proactive agent can say "this now matters" before a human explicitly asks.

### 2.4 Liveness

Liveness is the combination of continuity + responsiveness + adaptation.

Key enablers:

- stable identity
- durable workspace
- workspace metadata roots and discovery order
- resumable session state
- memory write-back
- current run state
- recoverable failures
- auditability
- consistent comms surface
- explicit workspace contract
- serialized session lane
- timeout hierarchy

This is what makes an agent feel present over time instead of reset on every
interaction.

## 3. Capability map

The table below groups the features that contribute to liveness.

| Capability | What it gives the agent | Examples in the reference systems |
|---|---|---|
| Identity | Stable role and mission | ClawCode subagent roles, Paperclip agent configs, OpenClaw agent identity files, Devclaw agent OS |
| Workspace | Durable working home | OpenClaw workspace, ClawCode local metadata roots, project-local context paths |
| Session | Continuity between turns | Paperclip resumable heartbeats, ACP sessions in Devclaw, vault session-based agent runs |
| Loop | Repeated decision/action cycle | Paperclip heartbeat, ClawCode closed-loop agent run, Devclaw cognitive loop, vault agent lifecycle |
| Planning | Next-step selection | ClawCode plan workflows, Devclaw cognitive engine |
| Tooling | Ability to act on the world | Devclaw bridge/tool/runtime layers, ClawCode local tools |
| Delegation | Parallel work and specialization | Devclaw subagents, ClawCode multi-role orchestration |
| Work | Durable state and progression | Devclaw work management, Paperclip issue checkout / wakeups |
| Memory | Long-term continuity | ClawCode memory/experience loops, Devclaw memory modules |
| Governance | Safe autonomy | Paperclip board approvals, Devclaw permission/governance |
| Observability | Visible activity | Paperclip run logs, OpenClaw gateway health, Devclaw observability |
| Recovery | Survive errors and continue | Paperclip session resume, Devclaw checkpoint/rewind/correction |
| Learning | Improve over time | ClawCode ECAP/TECAP, Devclaw reflection/learning |
| Triggering | Act without direct human input | Paperclip timers/assignments, OpenClaw gateway channels, Devclaw autonomy engine |

## 4. What each reference emphasizes

### 4.1 OpenClaw

OpenClaw emphasizes the runtime surface:

- one gateway controls the host
- handshake and framing are strict
- events are not replayed, so reconnect behavior matters
- the workspace is private and explicit
- sandboxing is an architecture choice

This makes the agent feel alive because the runtime is always on, observable,
and bounded.

### 4.2 Paperclip

Paperclip emphasizes the control plane:

- it coordinates, it does not try to be the execution runtime
- heartbeats create recurring agent activity
- wakeups are coalesced
- lane serialization prevents session races
- tasks are the communication channel
- budgets and governance shape behavior

This makes agents feel alive because they are continuously checked in, measured,
and managed like workers.

### 4.3 ClawCode

ClawCode emphasizes local workspace fluency:

- project metadata roots are merged
- agent and skill definitions live in the filesystem
- multi-role orchestration is normal
- learning loops are part of the product
- many tool surfaces are integrated in one terminal-native shell

This makes agents feel alive because they have persistent local memory, local
rituals, and a broad action surface.

## 5. Devclaw today

Devclaw already has several strong liveness primitives:

- ACP sessions with persistence
- MCP and protocol plumbing
- queue idempotency
- subagent isolation and budgets
- memory and reflection modules
- governance and permission layers
- bridge/runtime/tool abstractions
- checkpoints, rewind, correction, and observability

Those are the raw ingredients. The missing piece is a documented liveness
model that ties them together into one operating story.

The vault already expresses this story across `Agent OS`, `Autonomy Engine`,
`Gateway Daemon`, `Communication OS`, `Memory System`, `Cognitive Engine`,
`Subagents`, `Checkpoint/Rewind`, `Self-Correction`, and `Learning`.

## 6. Gaps to close

The main gaps inferred from the comparison are:

1. A formal gateway contract
   - host lifecycle
   - handshake
   - reconnect/gap policy
   - channel multiplexing

2. A first-class workspace contract
   - root workspace
   - metadata roots
   - discovery order
   - sandbox policy
   - workspace-local state

3. A heartbeat and wakeup model
   - timer wakeups
   - assignment wakeups
   - manual wakeups
   - coalescing and cancellation
   - queue modes and debounce
   - lane-based concurrency

4. A run lifecycle model
   - queued/running/succeeded/failed/cancelled
   - live logs
   - resume state
   - status events
   - typing indicators while queued
   - timeout hierarchy

5. A social/organizational model
   - approvals
   - delegation
   - escalation
   - task checkout
   - channels and threads
   - notifications and presence

6. A learning loop surfaced in docs
   - what is remembered
   - what is reflected
   - what becomes reusable

## 7. Devclaw terms worth standardizing

If we want consistent docs and code, the following terms should be defined and
used everywhere:

- autonomous
- active
- proactive
- liveness
- wakeup
- heartbeat
- session resume
- workspace contract
- work state
- runtime state
- live update
- event replay
- coalescing
- task checkout
- prompt engineering
- context engineering
- budget gate
- reflection loop

## 8. Recommended follow-up docs

This page should stay aligned with:

- `README.md`
- `packages/docs-site/src/content/docs/guides/architecture.md`
- `docs/design/daemon.md`
- `docs/design/subagents.md`
- `docs/design/work.md`
- `docs/TODO.md`

If we implement a new liveness primitive, it should get a small spec before it
gets new code.
