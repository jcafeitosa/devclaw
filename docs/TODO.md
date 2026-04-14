# DevClaw — TODO Roadmap

> Last audited: 2026-04-14 (deep implementation audit of all 37 modules + 4 packages).
> Tracks progress against the vault roadmap (`vault://23_roadmap/`).

Legend: ✅ done · 🟡 needs depth · ⏳ in progress · ⬜ pending · 🔒 claimed (agent working)

---

## How agents use this file

1. **Read this file** before starting any work
2. **Find the next ⬜ or 🟡 task** in priority order (top = highest)
3. **Claim it** by changing status to `🔒 claimed by <agent-id>` + timestamp
4. **Commit the claim** immediately: `git commit -m "chore: claim <task>"`
5. **Do the work** following SDD+TDD methodology
6. **Mark ✅ done** when tests pass and PR merged
7. **If blocked**, mark 🟡 with a note and move to next task

### Multi-agent collision prevention

```bash
# Before claiming, pull latest to check if someone else claimed:
git pull --rebase
# If the task you want is already 🔒, pick the NEXT unclaimed task.
# Never overwrite another agent's claim.
# Each agent works in its own git worktree (per ADR-014).
```

### Lock file (machine-level coordination)

```bash
# Create lock
echo "<agent-id> $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .devclaw/locks/<task-id>.lock
# Release lock after commit
rm .devclaw/locks/<task-id>.lock
# Stale locks (>2h old) can be reclaimed
```

---

## Codebase stats (audited 2026-04-14)

| Metric | Value |
|---|---|
| Core modules | 37 (all real implementations, zero stubs) |
| Core src files | 266 |
| Core src lines | ~17,200 |
| Test files | 191 (core: 185, cli: 3, daemon: 3) |
| Tests passing | 1,110 |
| Assertions | 1,945 |
| Test lines | ~14,600 |
| Packages | 4 (core, cli, daemon, docs-site) |
| CLI commands | 7 (auth, bridges, discover, init, invoke, providers, version) |
| Daemon routes | 9 REST + 3 WebSocket |

---

## Packages shipped

| Package | Status | Detail |
|---|---|---|
| `@devclaw/core` | ✅ | 37 modules, 266 src files, 185 tests |
| `@devclaw/cli` | ✅ | 7 commands, 12 src files, 3 tests |
| `@devclaw/daemon` | ✅ | Elysia 1.4.28, 9 REST + 3 WS endpoints, 3 tests |
| `@devclaw/docs-site` | ✅ scaffold | Astro 6.1.6 + Starlight 0.38.3, 5 content pages |

---

## Phase 1 — Foundation + Core Execution ✅

All 14 modules implemented with real logic, passing tests.

| Module | Src | Lines | Tests | Assertions | Key evidence |
|---|---|---|---|---|---|
| Queue (ADR-019) | 6 | 475 | 3 | — | Redis Streams XADD/XREADGROUP, worker pool with backoff, idempotency |
| Auth Storage | 6 | 312 | 7 | — | AES encryption, filesystem persistence, atomic rename, 0600 perms |
| OAuth (PKCE) | 7 | 443 | 7 | — | Full PKCE flow, callback server on port 1455, browser open, token exchange |
| Provider Catalog | 3 | 167 | 4 | — | Anthropic + OpenAI adapters, real HTTP POST to API endpoints |
| Discovery | 4 | 316 | 4 | — | Filesystem detection of stack/CLIs/conventions via Bun.Glob |
| Tool System | 9 | 587 | 9 | — | Registry, executor with validation+permission+timeout+audit pipeline |
| Context Engine | 9 | 429 | 8 | — | Multi-source collection, relevance ranking, token budget trimming |
| Prompt System | 8 | 354 | 6 | — | Template renderer with `{{#if}}`, `{{#each}}`, `{{var}}` syntax |
| Memory System | 8 | 622 | 7 | — | Short/long/episodic tiers, embedding dot-product similarity recall |
| Cognitive Engine | 8 | 522 | 7 | — | Full think→plan→act loop, DAG step execution, tier routing, deadlines |
| Reflection | 6 | 370 | 5 | — | Rubric evaluator (programmatic + LLM), weighted scoring, pass/fail |
| CLI Bridges | 11 | 786 | 7 | — | 4 real bridges (claude/codex/gemini/aider), subprocess spawn, event streaming |
| CLI package | 12 | ~600 | 3 | — | 7 commands, argument parser, lazy runtime, registry |
| Daemon | 3 | ~400 | 3 | — | Elysia HTTP+WS, ACP+MCP servers, graceful shutdown |

**Milestones reached:** M1 (end-to-end task via CLI bridge), M2 (Codex OAuth).

## Phase 2 — Multi-Agent Team + Slash Commands ✅

| Module | Src | Lines | Tests | Key evidence |
|---|---|---|---|---|
| Team Composition | 6 | 501 | 5 | Dynamic role assembly by tech stack/risk/design flags, budget allocation |
| Collaboration (comm) | 6 | 594 | 5 | Channel pub/sub with access policies, threads, notifications |
| Subagents | 8 | 463 | 5 | Worktree isolation (real `git worktree add`), budget filtering, spawn |
| Slash Commands | 7 | 651 | 5 | Markdown parsing, team assembly from hints, template rendering |
| Hooks + Gates | 6 | 409 | 5 | Hook runner with retry/block/modify/suppress, gate checks |
| Checkpoints | 8 | 442 | 6 | Real `git stash create` + `git update-ref`, retention policies |
| Work Management | 6 | 647 | 5 | CPM critical path, topological sort, dependency engine with cycle detection |

**Milestone reached:** M3 — multi-agent collaboration ✅

## Phase 3 — Self-Correction + Context ✅

| Module | Src | Lines | Tests | Key evidence |
|---|---|---|---|---|
| Self-Correction | 6 | 464 | 5 | Full error→classify→hypothesize→fix→verify loop, escalation to specialist |
| Skill System | 6 | 452 | 5 | Load .md from disk, versioned registry, state transitions, activation matching |

## Phase 4 — Learning ✅

| Module | Src | Lines | Tests | Key evidence |
|---|---|---|---|---|
| Experience Engine | 8 | 724 | 7 | ECAP/TECAP capture, triplet storage, feedback scoring, low-score flagging |
| Knowledge Lifecycle | — | (in learning) | — | TTL-based archival policies (aged-out, idle, low-score) |
| Policy Engine | — | (in learning) | — | Rule matching with source capsule linking |
| Skill Evolution | — | (in skill) | — | Draft→review→active→deprecated transitions |

## Phase 5 — Governance + Research ✅

| Module | Src | Lines | Tests | Key evidence |
|---|---|---|---|---|
| Research Engine | 8 | 552 | 6 | Multi-source retrieval, tier ranking (0.6 relevance + 0.25 authority + 0.15 freshness), citation gen, caching |
| Governance | 6 | 553 | 5 | Approval gates (arch/security/financial/release), auto-approve rules, override with rationale |
| Cost Tracking | 3 | 217 | 3 | Rate card registry, per-call USD calculation, aggregation by provider/model/task |
| Observability | 5 | 440 | 4 | Structured logger with level filtering, trace spans, metric counters/gauges/histograms |

---

## 🎯 CURRENT PRIORITY: Hardening + Integration Gaps

> Before advancing to Phase 6 UI, existing modules need hardening.
> Tasks are **independent** (parallelizable). Pick in order.

| ID | Task | Scope | Files touched | Status |
|---|---|---|---|---|
| H-01 | **Drizzle ORM schemas + migrations** | Add `drizzle-orm` dep, create `packages/core/src/db/schema/` with 11 tables from vault spec (`11_data_models/schemas`), add `bun db:generate` + `bun db:migrate` scripts, wire SQLite for dev | `packages/core/src/db/` (new), `packages/core/package.json`, root `package.json` | ⬜ |
| H-02 | **Daemon HTTP auth** | Add `@elysiajs/bearer` + `@elysiajs/jwt`, protect all routes except `GET /health`, loopback bypass for 127.0.0.1 | `packages/daemon/src/app.ts`, `packages/daemon/package.json` | ⬜ |
| H-03 | **Provider adapters: Google AI + Ollama** | Add Google + Ollama adapters to `provider/`, register in catalog via `registerBuiltins()`, Vercel AI SDK wrappers | `packages/core/src/provider/` (new files), `packages/core/package.json` | ⬜ |
| H-04 | **Safety integration into pipeline** | Wire `safety/moderator` into bridge execute path (pre-prompt) + cognitive engine (post-output), add integration tests | `packages/core/src/bridge/fallback.ts`, `packages/core/src/cognitive/engine.ts`, tests | ⬜ |
| H-05 | **E2E integration test** | Full lifecycle: auth → discover → provider → bridge → cognitive → tool → result. In `test/e2e/` | `packages/core/test/e2e/` (new) | ⬜ |
| H-06 | **Root dev scripts** | Wire `bun dev:daemon` (Elysia hot reload), `bun dev:docs` (Astro dev server) in root `package.json`, turbo dev pipeline | `package.json`, `turbo.json` | ⬜ |
| H-07 | **Store adapters: in-memory → SQLite** | Replace `Map<>` stores (work, checkpoint, learning, comm) with SQLite via `bun:sqlite` + Drizzle, keeping in-memory as fallback | `packages/core/src/work/store.ts`, `checkpoint/store.ts`, `learning/store.ts`, `comm/thread.ts` | ⬜ |
| H-08 | **Missing test coverage for audit module** | audit has 1 test file (136 lines) vs 249 lines of src — needs hash chain verification tests, multi-sink tests | `packages/core/test/audit/` | ✅ |
| H-09 | **Terminal: real PTY support** | Current `BunPtyAdapter` uses `Bun.spawn` without PTY. Add `node-pty` or native PTY via Bun FFI for resize/signals | `packages/core/src/terminal/adapter.ts` | ⬜ |

---

## Phase 6 — Polish (UI/UX)

| ID | Task | Vault | Status |
|---|---|---|---|
| P6-01 | **TUI (Ink framework)** | `vault://49_tui/` | ⬜ |
| P6-02 | **Admin UI (Astro + Solid islands)** | ADR-018 | ⬜ |
| P6-03 | **Docs site content expansion** | docs-site | 🟡 scaffold + 5 pages, needs guides for each module |

## Phase 7 — Protocols

| ID | Task | Vault | Detail | Status |
|---|---|---|---|---|
| P7-01 | ACP protocol | `57_acp_protocol/` | Full JSON-RPC 2.0 with session lifecycle, streaming, permissions | ✅ |
| P7-02 | MCP context engine | `56_context_engine_mcp/` | Tool/resource/prompt registration with consumer policies | ✅ |
| P7-03 | **LSP: raw LSP connection** | `58_lsp_integration/` | Pool management + client exist, but no actual LSP binary spawning | 🟡 |
| P7-04 | **PTY: raw terminal** | `59_pty_terminal/` | Session + registry exist, BunPtyAdapter uses Bun.spawn (no real PTY) | 🟡 |

## Phase 8 — Advanced

| ID | Task | Vault | Detail | Status |
|---|---|---|---|---|
| P8-01 | **Managed Runtimes (cloud)** | `52_advanced_capabilities/` | Local + ephemeral adapters work, no cloud (Anthropic managed) integration | 🟡 |
| P8-02 | **Gateway Daemon (3 modes)** | `53_gateway_daemon/` | Single-process mode works, CLI-only and distributed modes not implemented | 🟡 |
| P8-03 | Nodes & Devices | `54_nodes_devices/` | LocalNodeAdapter with pub/sub, capability execution, registry | ✅ |
| P8-04 | Advanced capability wrappers | `52_advanced_capabilities/` | Runtime registry with code exec adapters | ✅ |

---

## Implementation depth detail (for modules marked ✅ but with known limits)

| Module | Lines | What works | Known limit | Impact |
|---|---|---|---|---|
| `provider` | 167 | Anthropic + OpenAI real HTTP calls | Only 2 of 20+ spec'd adapters | Can't use Google/Ollama/Azure/etc. |
| `safety` | 166 | Regex PII + injection detection | Not wired into bridge/cognitive pipeline | Unsafe prompts pass through |
| `audit` | 249 | SHA256 hash chain, 3 sink types | Only 1 test file (136 lines) | Chain verification undertested |
| `terminal` | 375 | BunPtyAdapter spawns processes | No real PTY (no resize, no signals) | Can't run interactive programs |
| `lsp` | 566 | Pool management, crash recovery | No actual LSP binary spawning | Can't provide code intelligence |
| `provider/catalog` | 167 | Registry + generate delegation | No model listing, no streaming | Can't enumerate available models |
| `runtime/managed` | (in runtime) | Local + ephemeral code exec | No Anthropic managed agent integration | Can't offload to cloud |
| `research` | 552 | Multi-source with caching + ranking | Citation is tier-based, no real URL verification | Citations may be stale |
| `permission` | 162 | Rule evaluation + scope stack | No persistent rule storage | Rules lost on restart |
| `cost` | 217 | Rate card + tracking | No budget enforcement (only tracking) | Can't block over-budget runs |

---

## Dependency map for hardening tasks

```
H-01 (Drizzle schemas) ──→ H-07 (Store adapters use Drizzle)
H-02 (Daemon auth)     ──→ independent
H-03 (Provider adapters)──→ independent
H-04 (Safety pipeline)  ──→ independent
H-05 (E2E test)         ──→ benefits from H-01..H-04 but not blocked
H-06 (Dev scripts)      ──→ independent
H-08 (Audit tests)      ──→ independent
H-09 (Real PTY)         ──→ independent
```

Only H-07 depends on H-01. All others are parallelizable.
