# DevClaw — TODO Roadmap

> Last audited: 2026-04-14 (deep implementation audit + 7-specialist debate panel).
> Tracks progress against the vault roadmap (`vault://23_roadmap/`).

Legend: ✅ done · 🟡 needs depth · ⏳ in progress · ⬜ pending · 🔒 claimed (agent working)

---

## 🎯 Panel-consolidated single bet (2026-04-14)

> **Fundar os 37 módulos existentes num loop cross-CLI consensus demoável, com medidor de custo visível, memória goal-tagged, atrás de safety-kernel + storage-adapter-ports — em TUI Ink — antes de qualquer canal, admin-UI, ou módulo novo.**

Vence os 5 rivais (openclaw/paperclip/clawcode/ClawTeam/opencode) simultaneamente:
- vs **opencode**: consensus cross-CLI (eles são single-CLI)
- vs **clawcode**: ECAP+goal-alignment
- vs **openclaw**: inteligência em vez de surface de canais
- vs **paperclip**: execution+learning+methodology vs só coordenação
- vs **ClawTeam**: é slash-command, já superado

Detalhes: ver ADRs **020** (storage ports), **022** (safety kernel), ambas foundational.

---

## 🔴 Sprint 1 (próximas 2 semanas) — BLOCKERS

| ID | Task | Why | Files | Status |
|---|---|---|---|---|
| **A-01** | **ADR-020: Storage/Vector/Queue/Blob adapter ports** | Destrava H-01 sem lock-in | `packages/core/src/adapter/{storage,vector,queue,blob}.ts` (new) | ✅ (2026-04-14, ports + memory impls + registry + queue retrofit, +8 testes, `@devclaw/core` typecheck green) |
| **A-02** | **ADR-022: Safety kernel (non-bypassable pipeline)** | Fecha 3 CVEs; entry points package-private | `packages/core/src/kernel/index.ts` (new) | ✅ (2026-04-14, core `SafetyKernel` + wiring em tool/provider/bridge fallback/cognitive, +14 integration tests, `@devclaw/core` typecheck green. Persistência de permission rules segue em S-03.) |
| **S-01** | Wire `RegexPatternModerator` em bridge + tool executor | **CVSS 8.1** — existe mas zero call-site | `bridge/spawn_bridge.ts`, `bridge/claude_code.ts`, `tool/executor.ts`, `tool/errors.ts` (+`ToolSafetyError`), `test/safety/wiring.test.ts` | ✅ (2026-04-14, TDD RED→GREEN, +8 tests, 1171 pass) |
| **S-02** | Daemon loopback bind + bearer auth (`DEVCLAW_DAEMON_TOKEN`) | **CVSS 7.3** — hoje bind `0.0.0.0` sem auth | `daemon/src/{app,bin}.ts`, `test/app_hardened.test.ts` | ✅ (2026-04-14, `requireFromLoopback` flag + auto-token `~/.devclaw/daemon.token` 0600 + bind `127.0.0.1` default, +5 tests, 1176 pass) |
| **S-04** | Per-install random salt + refuse default passphrase | Mata footgun `"devclaw-dev"` + salt fixo "devclaw.auth.v1" | `auth/file_crypto.ts`, `auth/filesystem_store.ts`, `daemon/src/bin.ts`, `test/auth/file_crypto_envelope.test.ts` | ✅ (2026-04-14, envelope format `[MAGIC\|SALT\|IV\|CT+tag]` + legacy backward-compat + refuse em NODE_ENV=production, +9 tests, 1185 pass) |
| **C-01** | Anthropic `cache_control` + capture `usage.*_tokens` | **-40% custo em 1 dia** — hoje `generate` retorna só string, descarta usage | `provider/anthropic_adapter.ts`, `provider/openai_adapter.ts`, `provider/catalog.ts`, `test/provider/prompt_cache.test.ts` | ✅ (2026-04-14, TDD RED→GREEN, +9 tests, 1163 pass) |

## 🟠 Sprint 2 (semanas 3-4) — FOUNDATION

| ID | Task | Depends on | Status |
|---|---|---|---|
| **H-01** | Drizzle ORM schemas + migrations (via A-01 ports) | A-01 | ✅ (2026-04-14, 11 tabelas + bun:sqlite client + drizzle migrator, dev.db gitignored) |
| **H-07** | Store adapters in-memory → SQLite | A-01 + H-01 | ✅ (2026-04-14, opt-in sqlitePath em work/checkpoint/learning/comm, 4 suites novas, 1193 pass) |
| **H-03** | Provider adapters: Google AI + Ollama | — | ✅ (2026-04-14, via Vercel AI SDK + OpenAI-compat shim; registerBuiltins carrega ambos; I-01 OpenRouter herda mesmo padrão) |
| **H-05** | E2E integration test | — | ✅ (2026-04-14, test/e2e/lifecycle.test.ts exercita auth→discover→provider→bridge→cognitive→tool→memory) |
| **H-09** | Terminal real PTY (node-pty) | — | ✅ (2026-04-14, NodePtyAdapter default + BunPtyAdapter fallback, resize/signals/stdin funcionais) |
| **S-03** | Permission persistence (SQLite + hot-reload) | H-01 | ✅ (2026-04-14, `PermissionRuleStore` SQLite + `PersistentScopedPermissionEvaluator` with `rule_changed` reload, +4 test files green, `@devclaw/core` typecheck green) |
| **I-02** | ACP session persistence + state machine + reconnect + pending-permission durable | H-01 | 🟡 (2026-04-14, `ACPSessionStore` SQLite + `ACPServer.sessionStore` para `session/new/load/close`, e `ACPPermissionRequestStore` com replay de pending permissions via `setSend()/replayPendingPermissions()` no reconnect do transporte. Falta state machine ACP mais completa.) |
| **P-01** | Memory recall via `VectorAdapter` (pgvector HNSW) — fecha B1 (800ms→8ms) | A-01 | ⬜ |
| **P-02** | Daemon concurrency semaphore + request draining + graceful shutdown | — | ⬜ |
| **D-01** | Binário `devclaw` (bin shim em package.json) + `devclaw doctor` com SHA256 binary pin | — | ⬜ |

## 🟡 Sprint 3 (semanas 5-8) — KILL SHOT DEMOÁVEL

| ID | Task | Impact | Status |
|---|---|---|---|
| **KILL-01** | **`/consensus <task>` — cross-CLI fan-out + reflection winner** | Demo único que nenhum rival tem | 🟡 (2026-04-14, `runConsensus(cfg, req)` + `ConsensusEngine` core prontos com fan-out paralelo + scorer pluggable + tie-break alfabético + graceful bridge error isolation, +8 testes. Falta: slash command `/consensus <task>` wiring e default LLM-judge scorer via RubricEvaluator) |
| **C-02** | Token-aware ranker: `score = rel × 1/(1+α·log(tokens))`, α=0.35 | -15% custo adicional; reordena prefix-stable para cache | ⬜ |
| **C-03** | Budget hard-stop $0.15/task, $2/session, $10/day + TUI warnings | Paperclip parity | ⬜ |
| **I-01** | Google AI + Ollama + **OpenRouter** (OpenRouter = 100+ modelos em 1 adapter) | Substitui H-03; unlock offline + rate-limit diversification | ⬜ |
| **D-02** | 10 slash commands wired: `/help /tdd /code-review /plan /doctor /init /checkpoint /rewind /tasks /clear` | Hoje só 4 em builtins.ts, **nenhum wired ao CLI** | ⬜ |
| **P-03** | Queue `nack` re-XADD (fix cosmetic backoff; poison msg stalls consumer hoje) | +40% throughput em carga com 1% poison | ⬜ |
| **P-04** | Bridge output cache keyed by `hash(prompt+cli+cwd.git.HEAD)` | ~15% hit em re-runs; p50 3.2s → 50ms on hit | ⬜ |

## 🟢 Sprint 4 (semanas 9-12) — POLISH + SHIP

| ID | Task | Status |
|---|---|---|
| **KILL-02** | Preencher `vault://16_agents/` com 14 role prompts (PM/Arch/BE/FE/QA/SRE/Sec/Doc/...) hot-load via `skill` module | ⬜ |
| **KILL-03** | Goal-aligned ECAP/TECAP — adicionar `goal_id` em capsules + query view "o que aprendi sobre shipping auth" | ⬜ |
| **D-03** | TUI (Ink) mínima: chat + task list + cost meter em tempo real | ⬜ |
| **D-04** | Install script (`curl \| bash`) + brew tap + 5 docs pages rewrite (home/install/10-commands/mental-model/FAQ) | ⬜ |
| **C-04** | Anthropic/OpenAI Batch API para async (-50% em 30% do tráfego) | ⬜ |

## ⚫ Deferred (pós-v0.1, rastreado)

| ID | Task | Why deferred |
|---|---|---|
| **A-03** | ADR-021 tsconfig project refs + tier split `core/` em `core-domain/core-services/core-adapters` | Refactor grande, baixo user-impact imediato |
| **H-09** | Real PTY via node-pty (resize/signals) | P7 polish, não kill shot |
| **H-05** | E2E integration test | Evolui com KILL-01 (consensus loop) |
| **I-03** | Canais Slack/Telegram/Discord | Produto arbitrou contra (dilui positioning) |
| **I-04** | OpenCode bridge (Mode A) + `devclaw pair opencode` (Mode B) | Só depois que interop tiver demanda |
| **I-05** | Plugin manifest loader | Depois de módulos estabilizarem |
| **P6-02** | Admin-UI / Web console | Só depois TUI ser amada |
| **P-05** | Memoize ranker goalVocab | Micro-otimização (~30ms p95) |
| **S-05** | Audit chain expansion (bridge.stderr, memory mutations) | Fica como stretch de ADR-022 |
| **Team comp** | Preencher `vault://44_team_composition/` (5 stubs) | Parte de KILL-02 sprint 4 |

## 🚨 Red flags do painel (rastreados em ADR-022)

1. 🛡️ **PATH-hijack `claude` trojan** → `devclaw doctor` SHA256-pin em D-01
2. 🏛️ **Silent data loss on daemon crash** → bridge WAL + idempotency em /invoke (P-02)
3. 💰 **`generate` retorna só `string`, usage descartado** → blocker de tudo (C-01)
4. 🔌 **ACP permission-pending em memória** → reconnect = "denied" falso (I-02)

## 📊 SLO targets (post-Sprint 2)

- `POST /invoke` p95 <8s, p99 <15s (50% cached, Claude Sonnet)
- `queue.dequeue` p99 <50ms
- `memory.recall` p99 <20ms @ 100k items (pgvector HNSW)
- `context.assemble` p95 <100ms, p99 <300ms
- Daemon graceful shutdown <30s com zero in-flight loss
- Cost per task: $0.30 → $0.10 (current $0.30 → Sprint 1 C-01 puts at ~$0.18 → Sprint 3 C-02+C-03 ~$0.13 → Sprint 4 C-04 ~$0.098)
- 0 CVSS≥7.0 em scan pós-Sprint 1

---

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

## Codebase stats (audited 2026-04-14, post-Sprint 1+2)

| Metric | Value |
|---|---|
| Core modules | 38 (37 originais + `adapter/` ADR-020) |
| Core src files | 294 |
| Test files | 198 |
| Tests passing | 1,193 |
| Assertions | 2,111 |
| Packages | 4 (core, cli, daemon, docs-site) |
| CLI commands | 7 (auth, bridges, discover, init, invoke, providers, version) |
| Daemon routes | 9 REST + 3 WebSocket (loopback-bound + bearer-guarded por S-02) |

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
| H-01 | **Drizzle ORM schemas + migrations** | Add `drizzle-orm` dep, create `packages/core/src/db/schema/` with 11 tables from vault spec (`11_data_models/schemas`), add `bun db:generate` + `bun db:migrate` scripts, wire SQLite for dev | `packages/core/src/db/` (new), `packages/core/package.json`, root `package.json` | ✅ |
| H-02 | **Daemon HTTP auth** | Add `@elysiajs/bearer` + `@elysiajs/jwt`, protect all routes except `GET /health`, loopback bypass for 127.0.0.1 | `packages/daemon/src/app.ts`, `packages/daemon/package.json` | ✅ (coberto por S-02) |
| H-03 | **Provider adapters: Google AI + Ollama** | Add Google + Ollama adapters to `provider/`, register in catalog via `registerBuiltins()`, Vercel AI SDK wrappers | `packages/core/src/provider/` (new files), `packages/core/package.json` | ✅ |
| H-04 | **Safety integration into pipeline** | Wire `safety/moderator` into bridge execute path (pre-prompt) + cognitive engine (post-output), add integration tests | `packages/core/src/bridge/fallback.ts`, `packages/core/src/cognitive/engine.ts`, tests | ✅ (coberto por S-01) |
| H-05 | **E2E integration test** | Full lifecycle: auth → discover → provider → bridge → cognitive → tool → result. In `test/e2e/` | `packages/core/test/e2e/` (new) | ✅ |
| H-06 | **Root dev scripts** | Wire `bun dev:daemon` (Elysia hot reload), `bun dev:docs` (Astro dev server) in root `package.json`, turbo dev pipeline | `package.json`, `turbo.json` | ✅ |
| H-07 | **Store adapters: in-memory → SQLite** | Replace `Map<>` stores (work, checkpoint, learning, comm) with SQLite via `bun:sqlite` + Drizzle, keeping in-memory as fallback | `packages/core/src/work/store.ts`, `checkpoint/store.ts`, `learning/store.ts`, `comm/thread.ts` | ✅ |
| H-08 | **Missing test coverage for audit module** | audit has 1 test file (136 lines) vs 249 lines of src — needs hash chain verification tests, multi-sink tests | `packages/core/test/audit/` | ✅ |
| H-09 | **Terminal: real PTY support** | Current `BunPtyAdapter` uses `Bun.spawn` without PTY. Add `node-pty` or native PTY via Bun FFI for resize/signals | `packages/core/src/terminal/adapter.ts` | ✅ |

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

---

## Full vault → code → TODO coverage matrix

> Every vault module (62 numbered + 4 special) mapped to implementation status.
> Ensures NO documentation is orphaned — every spec either has code, a TODO task, or an explicit deferral.

### ✅ Implemented (vault spec → code exists → tests pass)

| Vault module | Code module | Lines | Tests | TODO ref |
|---|---|---|---|---|
| `00_vision` | — (design only, no code needed) | — | — | — |
| `01_prd` | — (design only) | — | — | — |
| `02_architecture` | — (design only) | — | — | — |
| `03_company_os` | `governance` | 553 | 5 | Phase 5 ✅ |
| `04_work_management` | `work` | 647 | 5 | Phase 2 ✅ |
| `05_communication_os` | `comm` | 594 | 5 | Phase 2 ✅ |
| `06_agent_os` (cognitive) | `cognitive` | 522 | 7 | Phase 1 ✅ |
| `06_agent_os` (context) | `context` | 429 | 8 | Phase 1 ✅ |
| `06_agent_os` (memory) | `memory` | 622 | 7 | Phase 1 ✅ |
| `06_agent_os` (prompt) | `prompt` | 354 | 6 | Phase 1 ✅ |
| `06_agent_os` (skill) | `skill` | 452 | 5 | Phase 3 ✅ |
| `06_agent_os` (subagents) | `subagent` | 463 | 5 | Phase 2 ✅ |
| `06_agent_os` (tool) | `tool` | 587 | 9 | Phase 1 ✅ |
| `07_learning` | `learning` + `reflection` | 724+370 | 7+5 | Phase 4 ✅ |
| `08_runtime` | `runtime` | 1024 | 9 | Phase 1 ✅ |
| `09_security` (audit) | `audit` | 249 | 1 | Phase 5 ✅ (H-08 for more tests) |
| `09_security` (permission) | `permission` | 162 | 2 | Phase 5 ✅ |
| `10_observability` | `observability` | 440 | 4 | Phase 5 ✅ |
| `12_event_system` | `queue` + `hook` | 475+409 | 3+5 | Phase 1+2 ✅ |
| `14_sdlc` | — (methodology, enforced by hooks) | — | — | — |
| `15_templates` | — (vault reference) | — | — | — |
| `18_decisions` | — (19 ADRs, all accepted) | — | — | — |
| `35_ai_safety` | `safety` | 166 | 1 | Phase 1 ✅ (H-04 to wire in) |
| `36_cost_optimizer` | `cost` + `cache` | 217+158 | 3+2 | Phase 5 ✅ |
| `42_cli_bridge` | `bridge` | 786 | 7 | Phase 1 ✅ |
| `43_self_correction` | `correction` | 464 | 5 | Phase 3 ✅ |
| `44_team_composition` | `team` | 501 | 5 | Phase 2 ✅ |
| `45_research_engine` | `research` | 552 | 6 | Phase 5 ✅ |
| `46_slash_commands` | `slash` | 651 | 5 | Phase 2 ✅ |
| `47_checkpoints_rewind` | `checkpoint` | 442 | 6 | Phase 2 ✅ |
| `50_discovery` | `discovery` | 316 | 4 | Phase 1 ✅ |
| `51_hooks` | `hook` | 409 | 5 | Phase 2 ✅ |
| `53_gateway_daemon` | daemon package | ~400 | 3 | Phase 1 ✅ (P8-02 for 3-mode) |
| `54_nodes_devices` | `node` | 304 | 4 | Phase 8 ✅ |
| `56_context_engine_mcp` | `protocol` (MCP) | (in 1382) | (in 9) | Phase 7 ✅ |
| `57_acp_protocol` | `protocol` (ACP) + `capability` | (in 1382)+130 | (in 9)+1 | Phase 7 ✅ |
| `58_lsp_integration` | `lsp` | 566 | 5 | Phase 7 🟡 (P7-03) |
| `59_pty_terminal` | `terminal` | 375 | 4 | Phase 7 🟡 (P7-04 + H-09) |
| `60_provider_connection` | `auth` + `oauth` + `provider` | 312+443+167 | 7+7+4 | Phase 1 ✅ (H-03 for more adapters) |
| `61_concrete_adapters` | `bridge` (claude/codex/gemini/aider) | (in 786) | (in 7) | Phase 1 ✅ |
| `52_advanced_capabilities` | `runtime` (exec) | (in 1024) | (in 9) | Phase 8 🟡 (P8-01) |
| `55_dev_methodology` | — (methodology, enforced by workflow) | — | — | — |

### 🟡 Partially implemented (code exists, needs depth)

| Vault module | Code | What's missing | TODO ref |
|---|---|---|---|
| `11_data_models` | **No code** — schemas in vault only | Drizzle ORM + SQLite + migrations | **H-01** + **H-07** |
| `52_advanced_capabilities` | `runtime/managed` | Cloud managed agent integration | **P8-01** |
| `53_gateway_daemon` | daemon package | Only single-process mode, no CLI-only/distributed | **P8-02** |
| `58_lsp_integration` | `lsp` | Pool works, no actual LSP binary spawning | **P7-03** |
| `59_pty_terminal` | `terminal` | Bun.spawn only, no real PTY resize/signals | **P7-04** + **H-09** |

### ⬜ Not yet implemented (vault spec exists, no code)

| Vault module | Scope | Phase | TODO ref |
|---|---|---|---|
| `49_tui` | Terminal UI with Ink framework | Phase 6 | **P6-01** |
| `22_ux_flows` | Admin dashboard views, onboarding flow | Phase 6 | **P6-02** |
| `37_knowledge_graph` | Entity relationships beyond vector (AGE extension) | Phase 5b | **P5b-01** (new) |
| `13_integrations` (Slack/MCP) | External channel connectors | Phase 2+ | **INT-01** (new) |
| `26_api_sdk` | Public REST/GraphQL/gRPC API surface + SDK | Phase 6+ | **API-01** (new) |
| `39_notifications` | Notification routing/dedup/preferences | Phase 6+ | **NOT-01** (new) |
| `16_agents` (concrete prompts) | Per-agent system prompts for 14 roles | Phase 2+ | **AGT-01** (new) |
| `40_reporting` | Dashboards, scheduled reports, exports | Phase 6+ | **RPT-01** (new) |
| `41_workflow_designer` | Visual workflow builder (low-code) | Phase 8+ | **WFD-01** (new) |
| `38_ab_testing` | Prompt/policy/feature experimentation | Phase 8+ | **ABT-01** (new) |
| `32_i18n` | Multilingual support (22+ locales) | Phase 6+ | **I18-01** (new) |

### 🚫 Deferred (out-of-scope per pivot, vault status: deferred)

| Vault module | Reason | Reactivation trigger |
|---|---|---|
| `27_billing` | Personal tooling, no billing needed | Commercial pivot |
| `28_marketplace` | No marketplace for personal tool | Commercial pivot |
| `29_tenant_management` | Single-user, no multi-tenancy | Commercial pivot |
| `30_compliance` | No SOC2/HIPAA certs needed | Commercial pivot |
| `31_disaster_recovery` | Local-first, no DR infrastructure | Production deployment |
| `33_mobile` | No mobile app planned | User demand |
| `34_voice` | No voice channel planned | User demand |

### 📚 Reference-only (design docs, no code needed)

| Vault module | Purpose |
|---|---|
| `00_vision` | Mission, principles, positioning |
| `01_prd` | Product requirements document |
| `02_architecture` | System overview, layers, scaling |
| `14_sdlc` | SDLC lifecycle (enforced via hooks, not code module) |
| `15_templates` | Document templates for vault |
| `17_tasks` | Task tracking structure (vault folders) |
| `18_decisions` | 19 ADRs (all accepted) |
| `19_logs` | Log storage structure (vault folders) |
| `20_knowledge_base` | Patterns/incidents collection (vault curation) |
| `21_heritage` | Ancestry analysis (6 deep analyses) |
| `23_roadmap` | 8 phases + milestones |
| `24_risks` | Risk analysis (5 categories) |
| `25_glossary` | Term definitions |
| `48_agnostic_architecture` | Adapter pattern design (implemented across all modules) |
| `55_dev_methodology` | SDD+TDD methodology (enforced via hooks + workflow) |
| `_audits` | Audit reports |
| `_diagrams` | System diagrams |
| `_implementation` | Implementation guides + scaffolding |

---

## Future backlog (documented in vault, not yet in any phase)

> These vault modules have specs but aren't assigned to current phases.
> They require an ADR or roadmap update before implementation.

| ID | Vault module | Scope | Prerequisite |
|---|---|---|---|
| P5b-01 | `37_knowledge_graph` | AGE graph extension in Postgres, entity extraction, semantic queries | H-01 (Drizzle/DB) |
| INT-01 | `13_integrations` (channels) | Slack/Discord/Telegram connectors via adapter pattern | Phase 2 comm module |
| API-01 | `26_api_sdk` | Public API surface (OpenAPI auto-gen from Elysia is partially there) | H-02 (daemon auth) |
| NOT-01 | `39_notifications` | Delivery routing, dedup, user preferences | Phase 2 comm module |
| AGT-01 | `16_agents` (prompts) | Concrete system prompts for 14 agent roles (CEO, CTO, Backend, QA, etc.) | Phase 2 team module |
| RPT-01 | `40_reporting` | Cost/performance dashboards, scheduled exports | P6-02 (admin-ui) |
| WFD-01 | `41_workflow_designer` | Visual workflow builder (drag-and-drop nodes) | P6-02 (admin-ui) |
| ABT-01 | `38_ab_testing` | Prompt/policy/feature A/B experiments | Phase 4 learning |
| I18-01 | `32_i18n` | i18n for agent prompts + UI (22+ locales) | P6-01 or P6-02 |
