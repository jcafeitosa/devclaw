# CLAUDE.md — Devclaw

> Configuration file read by Claude Code (and compatible tools: clawcode, opencode, codex) when operating in this repo.
> Spec source-of-truth: Obsidian vault at `/Users/jcafeitosa/Library/Mobile Documents/iCloud~md~obsidian/Documents/Projetos/10 Projects/DevClaud/`.
> Vault REST API: `http://127.0.0.1:27123/` (Bearer token auth, Local REST API plugin).

## Project

**Devclaw** — autonomous software development team for solo developers.

Stage: **pre-alpha, Phase 1 implementation** (per `vault://23_roadmap/phase_1_foundation`).

## Spec

Complete documentation (~543 files) in Obsidian vault. **Always consult before architectural decisions.**

Quick refs (vault paths):
- `vault://DevClaud.md` — main index
- `vault://00_vision/` — purpose + principles
- `vault://18_decisions/` — 19 ADRs (all accepted)
- `vault://_implementation/` — implementation kickoff
- `vault://_diagrams/` — system diagrams

Vault access for agents:
```bash
# Filesystem (direct read)
cat "/Users/jcafeitosa/Library/Mobile Documents/iCloud~md~obsidian/Documents/Projetos/10 Projects/DevClaud/<path>"

# REST API (search, read, list)
curl http://127.0.0.1:27123/vault/10%20Projects/DevClaud/<path> \
  -H "Authorization: Bearer 2327b0214312fd38bce191a490dca4fca6867b42d21dafdceb4da7fbe917e098" \
  -H "Accept: text/markdown"

# Search vault content
curl "http://127.0.0.1:27123/search/simple/?query=<term>" \
  -H "Authorization: Bearer 2327b0214312fd38bce191a490dca4fca6867b42d21dafdceb4da7fbe917e098"
```

---

## Stack — 100% native + official integrations

> Per ADR-003 v2 + ADR-018. Maximize native runtime features (zero deps where possible).

### Stack overview

| Layer | Choice | Rationale |
|---|---|---|
| **Language** | TypeScript **6.0+** | `satisfies`, `using`, decorators stage-3, strict mode |
| **Runtime** | Bun **1.3+** (current: 1.3.12) | Replaces ~25 common deps (see table below) |
| **Backend framework** | Elysia **1.4+** (current: 1.4.28) | Bun-native, e2e types via Eden, JIT |
| **Frontend framework** | Astro **6.x** (current: 6.1.6) | Islands, ship-zero-JS default, native SSR |
| **Frontend islands** | `@astrojs/solid-js` | Lightweight, signals-based |
| **Database (dev)** | SQLite via `bun:sqlite` | Zero setup, fast |
| **Database (prod)** | Postgres 16+ + **pgvector** + AGE | Per ADR-003/004; vector + graph in same DB |
| **ORM** | Drizzle ORM **0.45+** | Snake_case schemas, lightweight, Bun-friendly |
| **Vector store** | pgvector (default) | Per ADR-004; Qdrant upgrade path when >10M vectors |
| **Queue** | Redis Streams via `Bun.RedisClient` | Per ADR-005/019; Kafka upgrade path when >100K events/min |
| **Cache** | Redis 7+ (same cluster) | `Bun.RedisClient` native |
| **Object storage** | S3-compatible via `Bun.S3Client` | AWS S3, Cloudflare R2, MinIO |
| **Test runner** | `bun:test` (built-in) | Jest-compatible, 10x faster |
| **Linter + formatter** | Biome **2.4+** | Single tool (replaces ESLint + Prettier) |
| **Build** | `bun build` (native bundler) | No webpack/esbuild config |
| **Monorepo** | Turborepo **2.9+** | Caching + parallel pipelines |
| **CSS** | Tailwind **4.2+** via `@tailwindcss/vite` | Plugin pattern removed in v4 |
| **CI/CD** | GitHub Actions | Free for OSS |
| **Git hooks** | Husky **9+** + commitlint **20+** | Conventional Commits enforcement |

> Policy: only accept libraries at their **current** latest major (check `npm view <pkg> version` before `bun add`). No EOL versions.

### Bun 1.3+ native APIs (replaces ~25 deps)

| Need | Bun native | Avoided dep |
|---|---|---|
| HTTP server | `Bun.serve()` | express, hono (but we use Elysia for DX) |
| Test runner | `bun:test` | vitest, jest |
| Bundler | `bun build` | esbuild, webpack |
| Transpiler | built-in | tsx, swc |
| Package manager | `bun install` | npm, pnpm, yarn |
| Hot reload | `--hot` | nodemon |
| File I/O | `Bun.file()`, `Bun.write()` | fs/promises |
| Shell exec | `Bun.$` | execa, zx |
| Subprocess | `Bun.spawn()` | child_process |
| SQLite driver | `bun:sqlite` | better-sqlite3 |
| Postgres/MySQL | `Bun.SQL` | pg, mysql2 |
| Redis client | `Bun.RedisClient` | ioredis, redis |
| S3 driver | `Bun.S3Client` | aws-sdk |
| Password hashing | `Bun.password.hash/verify` | bcrypt, argon2 |
| Glob | `Bun.Glob` | glob |
| Semver | `Bun.semver` | semver |
| Streams | Web Streams API | through2 |
| HTMLRewriter | built-in | cheerio, jsdom |
| YAML/TOML/JSON5 | built-in parsers | yaml, toml, json5 |
| HTTP client | native `fetch` | axios, ky |
| WebSocket | built-in | ws |
| .env loading | automatic | dotenv |
| tsconfig paths | automatic | tsconfig-paths |

### External deps (justified)

Only where no native alternative exists:

| Dep | Reason |
|---|---|
| `drizzle-orm` + `drizzle-kit` | Type-safe ORM with snake_case (per ADR-003) |
| `elysia` | Backend framework (Bun-native, Eden types) |
| `@anthropic-ai/sdk` | Claude API direct (when bridge unavailable) |
| `ulid` | Sortable IDs (better than `crypto.randomUUID`) |
| Vercel AI SDK (`@ai-sdk/*`) | Per ADR-017 — multi-provider abstraction |

---

## Style guide (mandatory)

### Naming
- **Single-word names default** (cfg, err, opts, dir, root, child, state, pid)
- Multi-word only when ambiguous
- No `inputPID`, `existingClient` → use `pid`, `client`
- Snake_case in DB schemas (Drizzle convention)
- camelCase in TS code

### Control flow
- **Avoid `else`** — early returns
- **Avoid `any`** — use `unknown` + type guards
- **Try-catch only at boundaries** — I/O, subprocess, JSON parse, external APIs
- **Typed error classes** — every module has its own error hierarchy (see below)

### Error handling pattern

```typescript
// Typed error classes — every module follows this pattern
// See vault://10_observability/error_handling for full taxonomy (60+ error classes)

export type BridgeErrorCode = "NOT_AVAILABLE" | "TIMEOUT" | "EXEC_FAILED" | "PARSE"

export class BridgeError extends Error {
  readonly code: BridgeErrorCode
  readonly recoverable: boolean
  constructor(code: BridgeErrorCode, message: string, recoverable = false) {
    super(message)
    this.name = "BridgeError"
    this.code = code
    this.recoverable = recoverable
  }
}

// Try-catch at I/O boundaries — transform to typed error
async function executeBridge(req: BridgeRequest): Promise<BridgeResponse> {
  try {
    const proc = Bun.spawn(["claude", "--prompt", req.prompt])
    return parseOutput(await proc.stdout.text())
  } catch (raw) {
    throw new BridgeExecFailedError(req.cli, (raw as Error).message)
  }
}

// Check-then-act for non-I/O (no try-catch needed)
const item = store.get(id)
if (!item) throw new WorkNotFoundError(id)
```

**Rules:**
- try-catch at I/O boundaries (file, subprocess, network, JSON parse)
- Always transform raw errors → domain-typed errors with `code` + `recoverable`
- Never catch-and-ignore (at minimum log)
- Check-then-throw for in-memory lookups (no try-catch needed)
- See `vault://10_observability/error_handling` for full error taxonomy

### Variables
- Prefer `const` over `let`
- Inline single-use values
- `obj.a` not `const {a} = obj`
- Type inference > explicit annotations (only export types)

### Bun-first APIs
```typescript
// Always use native Bun
const text = await Bun.file("./data.json").text()
await Bun.write("./output.txt", "hello")
const result = await Bun.$`ls -la`.text()
const hash = await Bun.password.hash(password)
const sqlite = new Database("./db.sqlite") // bun:sqlite

// Never use (unless Bun native unavailable)
import fs from "fs/promises"     // use Bun.file()
import { execa } from "execa"    // use Bun.$
import bcrypt from "bcrypt"      // use Bun.password
```

### Test pattern

```typescript
// Standard test structure in this project
import { describe, test, expect, beforeEach } from "bun:test"
import { tenantFixture, taskFixture } from "../../test/fixtures"

describe("TaskService", () => {
  test("creates task with valid data", () => {
    const tenant = tenantFixture()
    const task = taskFixture({ tenant_id: tenant.id, title: "Implement OAuth" })
    expect(task.status).toBe("backlog")
    expect(task.tenant_id).toBe(tenant.id)
  })

  test("rejects task without title", () => {
    const result = validateTask({ ...taskFixture(), title: "" })
    expect(result.ok).toBe(false)
  })
})
```

Fixtures: `vault://15_templates/test_fixtures_template` — factory functions for all entities.

### Elysia patterns
```typescript
const app = new Elysia()
  .post("/users", ({ body }) => createUser(body), {
    body: t.Object({ email: t.String({ format: "email" }) }),
    response: t.Object({ id: t.String(), email: t.String() })
  })

// Eden client gets full types automatically
const { data } = await client.users.post({ email: "..." })
```

### Astro patterns
```astro
---
// Server-rendered, zero JS by default
import Layout from "@/layout/Default.astro"
const tasks = await fetchTasks() // SSR
---
<Layout>
  <h1>{tasks.length} tasks</h1>
  <!-- Interactive island (only this ships JS) -->
  <TaskBoard client:visible tasks={tasks} />
</Layout>
```

---

## Methodology (mandatory per ADR-014)

### 7-stage cycle
1. Brainstorming (SDD) — 9-step Socratic
2. Git Worktrees — isolated workspace
3. Writing Plans — 2-5min tasks
4. Subagent Execution — fresh per task
5. TDD — RED-GREEN-REFACTOR strict
6. Code Review — severity-ranked
7. Finishing Branch — verification + cleanup

### Hard gates
- No code before design approved
- No implementation before plan
- **No production code before failing test (TDD)**
- No completion before verification
- No merge before code review (0 critical)

### TDD essential principle
> **Production code → test exists and failed first. Otherwise → not TDD.**

```bash
# Correct TDD flow
$ bun test test/auth/types.test.ts
✗ FAIL — module not found (RED)

$ vim src/auth/types.ts          # write minimal code

$ bun test test/auth/types.test.ts
✓ PASS (GREEN)

$ git commit -m "feat(auth): add auth types"
```

---

## Conventions

### Branches
- `main` (always green)
- `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`

### Commits (Conventional Commits)
```
feat(auth): add OAuth PKCE flow for Codex

Per spec vault://60_provider_connection/oauth_flows.

- Browser flow on port 1455
- Concurrent refresh protection
- Multi-account support

Tests: 15 passing
```

### Coverage thresholds
- Global: 80% line + branch
- Core/auth/security: 95%
- Adapters: 80%

---

## Commands (available now)

```bash
# These scripts exist in root package.json:
bun test                  # all tests (bun:test native)
bun test --watch          # watch mode
bun typecheck             # tsc --noEmit
bun lint                  # biome check
bun lint:fix              # biome check --write
bun format                # biome format --write

# Per-package:
bun test --filter @devclaw/core    # core tests only
bun run packages/cli/src/index.ts  # direct CLI invoke
bun run packages/daemon/src/bin.ts # direct daemon invoke

# Redis integration tests:
BUN_TEST_REDIS=redis://localhost:6379 bun test
```

### Commands NOT yet wired (planned):
```bash
# These DO NOT exist yet — do not run:
# bun dev, bun dev:daemon, bun dev:admin, bun dev:docs
# bun db:generate, bun db:migrate, bun db:studio
# bun build
```

---

## Package structure (actual)

```
devclaw/
├── packages/
│   ├── core/           # @devclaw/core — 37 modules, 266 src files, 189 tests
│   ├── cli/            # @devclaw/cli — 6 commands, 12 src files
│   ├── daemon/         # @devclaw/daemon — Elysia HTTP+WS (elysia 1.4.28)
│   └── docs-site/      # Astro 6.1.6 + Starlight 0.38.3
├── CLAUDE.md           # this file
├── package.json        # workspace root
├── biome.json          # lint+format (Biome 2.4.11)
├── bunfig.toml         # Bun config
├── turbo.json          # build orchestration (Turborepo 2.9.6)
├── tsconfig.json       # TypeScript 6.0.2, strict, ESNext
└── .github/workflows/  # CI/CD
```

### Planned packages (NOT yet created):
- `tui/` — Ink (React for terminal)
- `admin-ui/` — Astro + Solid islands
- `shared/` — types, utils
- `sdk-ts/` — @devclaw/sdk for external consumers

---

## Core modules (37 implemented)

### Module → vault spec mapping

| Module | Vault spec | Status |
|---|---|---|
| `audit` | `vault://09_security/audit_system` | Implemented |
| `auth` | `vault://60_provider_connection/auth_storage` | Implemented |
| `bridge` | `vault://42_cli_bridge/bridge_protocol` | Implemented |
| `cache` | `vault://36_cost_optimizer/caching_strategies` | Implemented |
| `capability` | `vault://57_acp_protocol/acp_capability_negotiation` | Implemented |
| `checkpoint` | `vault://47_checkpoints_rewind/checkpoint_overview` | Implemented |
| `cognitive` | `vault://06_agent_os/cognitive_engine` | Implemented |
| `comm` | `vault://05_communication_os/communication_model` | Implemented |
| `context` | `vault://06_agent_os/context_engine` | Implemented |
| `correction` | `vault://43_self_correction/sc_overview` | Implemented |
| `cost` | `vault://36_cost_optimizer/cost_strategy` | Implemented |
| `discovery` | `vault://50_discovery/discovery_overview` | Implemented |
| `governance` | `vault://03_company_os/governance` | Implemented |
| `hook` | `vault://51_hooks/hooks_overview` | Implemented |
| `learning` | `vault://07_learning/learning_architecture` | Implemented |
| `lsp` | `vault://58_lsp_integration/lsp_overview` | Implemented |
| `memory` | `vault://06_agent_os/memory_system` | Implemented |
| `node` | `vault://54_nodes_devices/node_overview` | Implemented |
| `oauth` | `vault://60_provider_connection/oauth_flows` | Implemented |
| `observability` | `vault://10_observability/logging` | Implemented |
| `permission` | `vault://09_security/permission_system` | Implemented |
| `prompt` | `vault://06_agent_os/prompt_system` | Implemented |
| `protocol` | `vault://57_acp_protocol/acp_overview` | Implemented |
| `provider` | `vault://60_provider_connection/provider_catalog` | Implemented |
| `queue` | `vault://12_event_system/message_queue` + ADR-019 | Implemented |
| `reflection` | `vault://07_learning/experience_engine` | Implemented |
| `research` | `vault://45_research_engine/research_overview` | Implemented |
| `runtime` | `vault://08_runtime/execution_runtime` | Implemented |
| `safety` | `vault://35_ai_safety/content_moderation` | Implemented |
| `skill` | `vault://06_agent_os/skill_system` | Implemented |
| `slash` | `vault://46_slash_commands/sc_overview` | Implemented |
| `subagent` | `vault://06_agent_os/subagents` | Implemented |
| `team` | `vault://44_team_composition/team_overview` | Implemented |
| `terminal` | `vault://59_pty_terminal/pty_overview` | Implemented |
| `tool` | `vault://06_agent_os/tool_system` | Implemented |
| `util` | Internal (async mutex, event emitter) | Implemented |
| `work` | `vault://04_work_management/work_model` | Implemented |

### CLI commands (6 implemented)
| Command | Spec |
|---|---|
| `auth` | `vault://60_provider_connection/auth_storage` |
| `discover` | `vault://50_discovery/discover_command` |
| `init` | `vault://46_slash_commands/engineering_commands` |
| `invoke` | `vault://42_cli_bridge/bridge_overview` |
| `providers` | `vault://60_provider_connection/provider_catalog` |
| `version` | Internal |

---

## Permissions

### Tools allowed
- Read, Write, Edit, Bash, Grep, Glob, WebFetch
- `gh` (GitHub CLI for PR/issue ops)
- File system within repo
- Vault filesystem + REST API (read-only)

### Tools blocked
- `git push --force`
- `rm -rf` outside `node_modules`, `dist`, `.turbo`, `.next`, `coverage`
- `deploy` (no production target)
- Modifying `~/.devclaud/auth.json` outside auth module
- Installing global packages without ADR
- Adding new dependencies without checking Bun native equivalent first

### Allowed network
- API providers (api.anthropic.com, api.openai.com, generativelanguage.googleapis.com)
- Package registries (registry.npmjs.org, github.com)
- Docs sources (docs.* domains)
- Localhost (vault REST API, daemon)

---

## Out-of-scope (don't touch without ADR)

- Production deployment (Phase 6+)
- Multi-tenant features (out-of-scope per pivot)
- Billing/marketplace (vault modules 27-29 marked `status: deferred`)
- Mobile app (vault module 33 marked `status: deferred`)
- Voice channel (vault module 34 marked `status: deferred`)

---

## Current status + what to do next

**Completed:** Phase 1-5 + Phase 7 protocols + Phase 8 partial (37 core modules, 266 src, 1110 tests, 1945 assertions, all passing).
**Current:** Hardening + integration gaps (9 tasks: H-01 to H-09) before Phase 6 UI.
**Milestones reached:** M1 (end-to-end task), M2 (Codex OAuth), M3 (multi-agent).
**Key gaps:** Zero database (all in-memory), only 2 provider adapters, safety not wired into pipeline.

### Task board: `docs/TODO.md`

**Always read `docs/TODO.md` before starting work.** It contains:
- Full progress tracker per phase (✅/🟡/⬜/🔒)
- Prioritized next tasks with IDs (H-01, H-02, etc.)
- Claiming protocol for multi-agent coordination
- Implementation depth audit for existing modules

### How to pick your next task

```bash
# 1. Pull latest (someone may have claimed a task)
git pull --rebase

# 2. Read the task board
cat docs/TODO.md

# 3. Find first unclaimed task (⬜) in CURRENT PRIORITY section
# 4. Claim it (change ⬜ → 🔒 + create lock file)
echo "claude-$(date +%s) $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .devclaw/locks/H-01.lock
# 5. Commit the claim
git add docs/TODO.md && git commit -m "chore: claim H-01"
# 6. Do the work (SDD+TDD)
# 7. Mark ✅ when done, delete lock file
```

### Multi-agent coordination

When multiple agents run in parallel (Claude Code + Codex + Aider):
- **Git-based claiming:** Each agent commits a claim to `docs/TODO.md` before starting
- **Lock files:** `.devclaw/locks/<task-id>.lock` for same-machine sessions
- **Pull before claim:** Always `git pull --rebase` to see existing claims
- **Stale locks:** Locks older than 2h can be reclaimed
- **Independent tasks:** H-01 through H-06 are designed to be **parallelizable** (no deps)
- **Worktrees:** Each agent works in its own `git worktree` (per ADR-014 methodology)

---

## ADRs (19 accepted)

| ADR | Title | Key impact |
|---|---|---|
| 001 | Obsidian as Documentation SoT | Vault is canonical |
| 002 | Context + Prompt Mandatory | No agent runs without context |
| **003 v2** | **Stack: Bun+Elysia+Astro** | **Definitive stack (post-pivot)** |
| 004 | Vector: pgvector → Qdrant | pgvector default, Qdrant at scale |
| 005 | Queue: Redis Streams → Kafka | Redis default, Kafka at scale |
| 006 | LLM Provider Strategy | Multi-provider, Anthropic primary |
| 007 | Open Source Strategy | Core open, platform proprietary |
| **008 v2** | **Auth: Bun-native** | **`Bun.password` + JWT, no WorkOS** |
| 009 | Claude Code compatible format | Ecosystem compatibility |
| **010** | **Agnostic First** | **Universal adapter pattern** |
| 011 | Skills format + Context mgmt | Anthropic skills format |
| 012 | Managed Runtimes | Optional cloud deployment |
| 013 | Gateway Daemon | 3 deployment modes |
| **014** | **SDD + TDD methodology** | **Mandatory dev workflow** |
| 015 | Context Engine via MCP | DevClaud exposes MCP server |
| 016 | ACP + OpenCode integration | Agent Client Protocol |
| **017** | **OpenCode mechanism wholesale** | **Provider connection foundation** |
| 018 | Astro frontend convention | Astro when Bun/Elysia |
| 019 | Bun-native Redis Streams | Queue implementation |

Foundational (check all decisions against): **ADR-010**, **ADR-014**, **ADR-017**.

---

## Heritage

- [opencode (anomalyco)](https://github.com/anomalyco/opencode) — provider mechanism (ADR-017)
- [superpowers (obra)](https://github.com/obra/superpowers) — SDD+TDD methodology (ADR-014)
- [clawcode](https://github.com/deepelementlab/clawcode) — ECAP/TECAP learning
- [OpenClaw docs](https://docs.openclaw.ai) — gateway daemon pattern
- [Augment Code](https://docs.augmentcode.com) — context engine MCP (ADR-015)

---

## Critical reminders for AI agents

1. **Read vault first** — never invent architectural decisions
2. **Bun native FIRST** — check `Bun.*` API before `bun add`
3. **TDD strict** — test fails first, watch fail, then code
4. **No `else`** — early returns only
5. **Try-catch only at I/O boundaries** — typed error classes, never catch-and-ignore
6. **Single-word names** — `cfg` not `configuration`
7. **Bun APIs** — `Bun.file()` not `fs.readFile`
8. **Snake_case in DB** — Drizzle convention
9. **Update vault when finding spec ambiguity** — keep spec in sync
10. **Conventional commits** — granular per RED-GREEN cycle
11. **Verify before declaring done** — run actual tests
12. **Astro: zero JS by default** — only ship JS via `client:*` directives
13. **Check module→vault mapping above** — find spec before implementing
14. **Don't create planned packages** (tui, admin-ui, shared, sdk-ts) without ADR

---

**Vault is canonical. This file is local cache + bootstrap config.**
**When in doubt: check `vault://18_decisions/` (ADRs) and `vault://_diagrams/` (architecture).**
