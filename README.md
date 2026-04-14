# Devclaw

Autonomous software development team for solo developers.

**Pre-alpha, Phase 1.** Stack: Bun 1.3 · Elysia 1.4 · Astro 6 · TypeScript 6 · Biome 2 · Turborepo 2.9.

Spec canonical: Obsidian vault (`10 Projects/DevClaud/`). Local bootstrap: `CLAUDE.md`.

## Quick start

```bash
bun install
bun test
bun typecheck
bun lint
```

Redis integration tests:

```bash
BUN_TEST_REDIS=redis://localhost:6379 bun test
```

## Architecture

Devclaw is a monorepo with 4 packages and 37 core modules.

```
packages/
├── core/           37 modules · 266 src · 189 tests
│   ├── audit/         Unified audit log with hash chain + multi sink
│   ├── auth/          3-type auth storage (api/oauth/wellknown)
│   ├── bridge/        CLI bridge protocol + adapters (Claude, Codex, Gemini, Aider)
│   ├── cache/         LRU+TTL cache + 5-layer registry
│   ├── capability/    Capability declarations for agents
│   ├── checkpoint/    State snapshots, rewind, git integration
│   ├── cognitive/     Plan graphs, reasoning engine, model routing
│   ├── comm/          Communication protocols (channels, threads)
│   ├── context/       Context assembly, filtering, ranking
│   ├── correction/    Self-correction loop (error → hypothesis → fix → verify)
│   ├── cost/          Rate cards, cost tracking, budget enforcement
│   ├── discovery/     CLI tool and service auto-detection
│   ├── governance/    Policy enforcement, approval workflows
│   ├── hook/          Event hooks, gates, pipeline runners
│   ├── learning/      ECAP/TECAP knowledge extraction
│   ├── lsp/           Language Server Protocol pool management
│   ├── memory/        Short-term, long-term, episodic memory
│   ├── node/          Multi-node device management
│   ├── oauth/         OAuth 2.0 + PKCE flows for CLI subscriptions
│   ├── observability/ Structured logging, tracing, metrics
│   ├── permission/    Conditional rule evaluator + scope stacks
│   ├── prompt/        Template rendering, prompt builders
│   ├── protocol/      ACP (JSON-RPC 2.0) + MCP implementation
│   ├── provider/      Provider catalog and registry (20+ adapters)
│   ├── queue/         Redis Streams queue + worker pools + idempotency
│   ├── reflection/    Learning pipelines, experience processing
│   ├── research/      Source retrieval, ingestion, citation
│   ├── runtime/       Code execution (local, Docker, managed)
│   ├── safety/        Regex pattern moderation, PII/injection filtering
│   ├── skill/         Skill discovery, execution, evolution
│   ├── slash/         Slash command handling and routing
│   ├── subagent/      Isolation, worktrees, budget filtering
│   ├── team/          Multi-agent orchestration, roles, collaboration
│   ├── terminal/      PTY adapters, sessions, security
│   ├── tool/          Tool registry, validation, permissions
│   ├── util/          Async mutex, typed event emitter
│   └── work/          Task queuing, scheduling, dependencies
├── cli/            6 commands (auth, discover, init, invoke, providers, version)
├── daemon/         Elysia 1.4 HTTP + WebSocket server
└── docs-site/      Astro 6 + Starlight documentation site
```

## ADRs

19 accepted Architecture Decision Records. See `vault://18_decisions/`.

| # | Decision | Impact |
|---|---|---|
| 003 v2 | **Bun + Elysia + Astro** | Definitive stack (post-pivot) |
| 010 | **Agnostic First** | Universal adapter pattern |
| 014 | **SDD + TDD methodology** | Mandatory dev workflow |
| 017 | **OpenCode mechanism** | Provider connection foundation |
| 019 | Bun-native Redis Streams | Queue with idempotent consumers |

## Methodology

Per ADR-014: **Spec-Driven Development (SDD) + Test-Driven Development (TDD)**.

7-stage cycle: Brainstorm → Worktrees → Plans → Execution → TDD → Review → Finish.

Hard gates:
- No code before design approved
- No production code before failing test
- No merge before code review (0 critical findings)

## License

MIT
