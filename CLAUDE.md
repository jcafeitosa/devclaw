# CLAUDE.md — Devclaw

> Configuration file lido por Claude Code (e tools compatíveis: clawcode, opencode, codex) ao operar neste repo.
> Spec source-of-truth: Obsidian vault em `/Users/jcafeitosa/Library/Mobile Documents/iCloud~md~obsidian/Documents/Projetos/10 Projects/DevClaud/`.

## 🦾 Project

**Devclaw** — autonomous software development team for solo developers.

Stage: **pre-alpha, Phase 1 implementation** (per `vault://23_roadmap/phase_1_foundation`).

## 📚 Spec

Documentação completa (~542 arquivos) no Obsidian vault. **Sempre consultar antes de decisões arquiteturais.**

Quick refs:
- `vault://DevClaud.md` — index principal
- `vault://00_vision/` — propósito + princípios
- `vault://18_decisions/` — 18 ADRs accepted
- `vault://_implementation/` — implementation kickoff
- `vault://_diagrams/` — system diagrams

---

## 🏗️ Stack — 100% nativo + official integrations

> Per ADR-018 convention. Maximizar uso de features nativas (zero deps onde possível).

### Stack overview (resumo)

| Camada | Escolha | Razão |
|---|---|---|
| **Language** | TypeScript **6.0+** | `satisfies`, `using`, decorators stage-3, strict mode |
| **Runtime** | Bun **1.3+** (atual: 1.3.12) | Substitui ~25 deps comuns (ver tabela abaixo) |
| **Backend framework** | Elysia **1.4+** (atual: 1.4.28) | Bun-native, e2e types via Eden, JIT |
| **Frontend framework** | Astro **6.x** (atual: 6.1.6) | Islands, ship-zero-JS default, native SSR |
| **Frontend islands** | `@astrojs/solid-js` **6.x** | Lightweight, signals-based |
| **Database (dev)** | SQLite via `bun:sqlite` | Zero setup, fast |
| **Database (prod)** | Postgres 16+ + **pgvector** + AGE | Per ADR-003/004; vector + graph em mesma DB |
| **ORM** | Drizzle ORM **0.45+** | Snake_case schemas, lightweight, Bun-friendly |
| **Vector store** | pgvector (default) | Per ADR-004; Qdrant upgrade path quando >10M vectors |
| **Queue** | Redis Streams via `Bun.RedisClient` | Per ADR-005; Kafka upgrade path quando >100K events/min |
| **Cache** | Redis 7+ (mesmo cluster do queue) | `Bun.RedisClient` nativo |
| **Object storage** | S3-compatible via `Bun.S3Client` | AWS S3, Cloudflare R2, MinIO |
| **Test runner** | `bun:test` (built-in) | Jest-compatible, 10x faster |
| **Linter + formatter** | Biome **2.4+** | Single tool (substitui ESLint + Prettier) |
| **Build** | `bun build` (native bundler) | No webpack/esbuild config |
| **Hot reload** | `bun --hot` | Built-in, no nodemon |
| **Monorepo orchestration** | Turborepo **2.9+** | Caching + parallel pipelines |
| **CSS** | Tailwind **4.2+** via `@tailwindcss/vite` | Plugin pattern removido em v4 |
| **CI/CD** | GitHub Actions | Free for OSS, integrated com gh CLI |
| **Git hooks** | Husky **9+** + commitlint **20+** | Conventional Commits enforcement |

> 🔒 **Policy:** só aceitar bibliotecas na última major **atual** (verificar `npm view <pkg> version` antes de `bun add`). Sem versões EOL.

### Runtime: **Bun 1.3+** — features nativas

Bun substitui ~25 dependências comuns por features built-in:

| Necessidade | Solução nativa Bun | Dep evitada |
|---|---|---|
| HTTP server | `Bun.serve()` | express, hono (mas usamos Elysia para DX) |
| Test runner | `bun:test` | vitest, jest |
| Bundler | `bun build` | esbuild, webpack |
| Transpiler | built-in | tsx, swc |
| Package manager | `bun install` | npm, pnpm, yarn |
| Hot reload | `--hot` | nodemon, tsx watch |
| File I/O | `Bun.file()`, `Bun.write()` | fs/promises wrappers |
| Shell exec | `Bun.$` | execa, zx, shelljs |
| Subprocess | `Bun.spawn()` | child_process wrappers |
| **SQLite driver** | `bun:sqlite` | better-sqlite3 |
| **Postgres/MySQL/SQLite SQL** | `Bun.SQL` | pg, mysql2 |
| **Redis client** | native `Bun.RedisClient` | ioredis, redis |
| **S3 driver** | `Bun.S3Client` | aws-sdk |
| **Password hashing** | `Bun.password.hash/verify` | bcrypt, argon2 |
| **Glob** | `Bun.Glob` | glob |
| **Semver** | `Bun.semver` | semver |
| **Streams** | native Web Streams API | through2, etc. |
| **HTMLRewriter** | built-in | cheerio, jsdom |
| **CSRF + cookies** | built-in | csurf, cookie |
| **gzip/DEFLATE** | built-in | zlib wrappers |
| **YAML/TOML/JSON5/Markdown** | built-in parsers | yaml, toml, json5 |
| **HTTP client** | native `fetch` | axios, ky, got |
| **DNS, TCP, UDP** | native modules | dns, net |
| **WebSocket** | built-in | ws |
| **FFI** | `bun:ffi` | node-ffi-napi |
| **Workers** | Web Workers API | worker_threads wrapper |
| **.env loading** | automatic | dotenv |
| **tsconfig paths** | automatic | tsconfig-paths |

### Backend framework: **Elysia 1.4+**

Elysia escolhido por DX superior + Bun-native + end-to-end type safety.

**Native em Elysia (sem plugin):**
- Routing + handlers
- Type inference automática (sem code-gen)
- Validation via `Elysia.t` (built-in schema builder)
- Standard Schema support (aceita Zod, Valibot, ArkType, Effect, Yup, Joi)
- WebSocket
- Plugin system + lifecycle hooks
- JIT compiler (perf)
- **Eden** — end-to-end client (no code-gen needed)

**Plugins oficiais Elysia (lista completa 2025, ordem alfabética):**
| Plugin | Use case | Phase |
|---|---|---|
| `@elysiajs/bearer` | Bearer token extraction | Phase 1 (auth) |
| `@elysiajs/cors` | CORS handling | Phase 2 |
| `@elysiajs/cron` | Scheduled tasks | Phase 4 (autonomy) |
| `@elysiajs/graphql-apollo` | GraphQL via Apollo | ❌ não usar (REST + Eden suficiente) |
| `@elysiajs/graphql-yoga` | GraphQL via Yoga | ❌ não usar |
| `@elysiajs/html` | HTML responses | ⚠️ Astro handles UI |
| `@elysiajs/jwt` | JWT auth | Phase 2 |
| `@elysiajs/openapi` | OpenAPI/Swagger docs auto-gen | Phase 1 |
| `@elysiajs/opentelemetry` | Distributed tracing | Phase 6 (observability) |
| `@elysiajs/server-timing` | Performance metrics em headers | Phase 3 |
| `@elysiajs/static` | Serve static files | ⚠️ Astro adapter handles |

### Frontend framework: **Astro 6.x**

**Native em Astro (sem integração):**
- **Islands architecture** — selective hydration
- **Content Collections** — TS-validated structured content (substitui contentlayer)
- **View Transitions** — page transitions sem JS
- **Server Actions** (Astro 5+) — RPC-like sem API endpoints
- **Image Optimization** (`astro:assets`) — substitui sharp/imagemin manual
- **Font management** (`astro:fonts`) — substitui webfontloader
- **Dev Toolbar** — debugging
- **Sitemap generation** — SEO
- **RSS feed support**
- TypeScript native (sem `@types`)
- ESM native

**Integrações oficiais Astro (lista completa 2025):**

| Pacote | Categoria | Use case | Phase |
|---|---|---|---|
| `@astrojs/solid-js` | UI framework | Islands (DevClaud choice) | Phase 6 (admin-ui) |
| `@astrojs/node` | Adapter | **Bun-compat** via mode `standalone` (Bun roda Node code) | Phase 6 |
| `@astrojs/cloudflare` | Adapter | Edge deploy (out-of-scope inicialmente) | future |
| `@astrojs/vercel` | Adapter | Vercel deploy (out-of-scope) | future |
| `@astrojs/netlify` | Adapter | Netlify deploy (out-of-scope) | future |
| `@astrojs/mdx` | Content | Markdown + componentes | Phase 6 |
| `@astrojs/markdoc` | Content | Markdoc syntax (não usar — MDX suficiente) | ❌ |
| `@astrojs/sitemap` | SEO | XML sitemap auto-gen | Phase 6 (docs) |
| `@astrojs/db` | Data | LibSQL hosted DB (não usar — temos pgvector) | ❌ |
| `@astrojs/partytown` | Perf | 3rd-party scripts em web worker (não usar inicialmente) | future |
| `@astrojs/react` | UI framework | Não usar — Solid escolhido | ❌ |
| `@astrojs/preact` | UI framework | Não usar | ❌ |
| `@astrojs/svelte` | UI framework | Não usar | ❌ |
| `@astrojs/vue` | UI framework | Não usar | ❌ |
| `@astrojs/alpinejs` | UI framework | Não usar | ❌ |

**Pacotes Astro NÃO classificados como integration (mas oficiais):**
| Pacote | O que é | Use |
|---|---|---|
| `@astrojs/starlight` | Standalone framework para docs (built on Astro) | Phase 6 (`packages/docs-site/`) |
| `@astrojs/check` | TypeScript CLI checker | Phase 1 (CI typecheck) |
| `astro` | Core (já inclui tudo nativo) | sempre |

**Outras deps frontend (não-Astro mas oficiais ecosystem):**
| Pacote | Use |
|---|---|
| `@tailwindcss/vite` | Tailwind 4 (sem `@astrojs/tailwind` — Tailwind 4 abandonou plugin pattern) |
| `tailwindcss` | Core Tailwind 4 |

> ⚠️ **NÃO existe `@astrojs/bun` oficial.** Use `@astrojs/node` com `mode: standalone` — Bun executa Node-compatible code transparentemente.

### Real-time bidirectional (confirmed)

Canal primário: **WebSocket Elysia + ACP (JSON-RPC 2.0 bidirectional)**.

| Layer | Transport | Protocol | Spec |
|---|---|---|---|
| Client ↔ Agent | WS | ACP (JSON-RPC 2.0) | `vault://57_acp_protocol` · ADR-016 |
| Context / Tools | WS (mesmo socket, multiplexed) | MCP streaming | `vault://56_context_engine_mcp` · ADR-015 |
| Event bus fan-out | WS pub/sub | Custom envelope sobre Elysia WS | `vault://12_event_system` |
| TUI / admin-ui live | WS | Eden Treaty subscriptions | `vault://53_gateway_daemon` |
| Fallback degrade | SSE (server→client) + POST (client→server) | HTTP/1.1 | quando WS bloqueado (proxies) |

**Princípios:**
- Um único WS endpoint no daemon Elysia (`Bun.serve` underneath uWS)
- Multiplex via envelope `{channel: "acp"|"mcp"|"event"|"treaty", payload}`
- Backpressure nativo via Bun WS `drain` event
- Heartbeat 30s (`ping`/`pong` frames)
- Reconnect com resume token (session continuity per `vault://08_runtime/sessions`)
- Auth: bearer token no WS upgrade header (JWT via `@elysiajs/jwt`)

**Deps:** zero — tudo nativo Bun + Elysia. Eden Treaty (parte do `elysia`) cobre client side com types.

### Deps externas justificadas

Apenas onde não há alternativa nativa:

| Dep | Razão |
|---|---|
| `drizzle-orm` | Type-safe ORM com snake_case (per ADR-003); Bun.SQL é raw |
| `drizzle-kit` | Migrations |
| `effect` (opcional) | Functional patterns from opencode (avaliar uso por módulo) |
| `@anthropic-ai/sdk` | Claude API direct (quando bridge não disponível) |
| `@openai/codex` | Codex CLI bridge integration |
| `ulid` | Sortable IDs (better than `crypto.randomUUID`) |
| Vercel AI SDK (`@ai-sdk/*`) | Per ADR-017 — multi-provider abstraction |

### Future migration paths (NÃO usar dia 1)

| Stack atual | Migrar para | Trigger |
|---|---|---|
| pgvector | Qdrant | >10M vectors per tenant OR p99 search >200ms |
| Redis Streams | Kafka | >100K events/min sustained per tenant |
| `Bun.SQL` | `pg` driver | Need pg-specific features (LISTEN/NOTIFY advanced, etc.) |
| `bun:test` | Vitest | Need plugin-specific feature (rare) |
| Single-region | Multi-region | Enterprise tier (out-of-scope per pivot) |

Cada migration via [[../48_agnostic_architecture/adapter_pattern|adapter pattern]] — swap sem refactor.

### Stack triad confirmada (visual)

```
┌─────────────────────────────────────────────────────────┐
│ Astro 6.x (frontend, islands, SSR)                     │
│   ├── @astrojs/solid-js   (UI islands)                  │
│   ├── @astrojs/node       (Bun-compat, mode standalone) │
│   ├── @astrojs/mdx        (Markdown components)         │
│   ├── @astrojs/sitemap    (SEO)                         │
│   ├── @astrojs/check      (TypeScript checker)          │
│   ├── @astrojs/starlight  (docs site framework)         │
│   ├── @tailwindcss/vite   (Tailwind 4)                  │
│   └── astro (core: islands, content, view transitions,  │
│              server actions, image opt, fonts native)   │
├─────────────────────────────────────────────────────────┤
│ Elysia 1.4+ (backend, types, WS)                       │
│   ├── @elysiajs/openapi      (API docs)                 │
│   ├── @elysiajs/cors         (CORS)                     │
│   ├── @elysiajs/jwt          (JWT auth)                 │
│   ├── @elysiajs/bearer       (token extraction)         │
│   ├── @elysiajs/cron         (scheduled tasks)          │
│   ├── @elysiajs/server-timing (perf headers)            │
│   ├── @elysiajs/opentelemetry (tracing — Phase 6)       │
│   └── elysia (core: routing, types, WS, JIT, Eden)      │
├─────────────────────────────────────────────────────────┤
│ Bun 1.3+ (runtime + tooling)                           │
│   ├── bun:test          (Jest-compat tests)             │
│   ├── bun:sqlite        (SQLite native driver)          │
│   ├── Bun.SQL           (Postgres/MySQL/SQLite unified) │
│   ├── Bun.RedisClient   (cache + queue)                 │
│   ├── Bun.S3Client      (object storage S3-compat)     │
│   ├── Bun.password      (argon2id hashing)              │
│   ├── Bun.$             (shell scripting)               │
│   ├── Bun.serve         (HTTP server, sob Elysia)       │
│   ├── Bun.spawn         (subprocess)                    │
│   ├── Bun.file          (file I/O)                      │
│   ├── Bun.Glob          (file patterns)                 │
│   ├── Bun.semver        (version comparison)            │
│   ├── Bun.password      (auth)                          │
│   ├── HTMLRewriter      (HTML transform)                │
│   ├── crypto            (Web Crypto API)                │
│   ├── fetch / WebSocket (Web standards)                 │
│   └── 25+ outras APIs nativas                           │
├─────────────────────────────────────────────────────────┤
│ Tooling                                                 │
│   ├── Biome 2.4+        (lint + format, single tool)    │
│   ├── Drizzle ORM       (type-safe SQL com snake_case)  │
│   ├── drizzle-kit       (migrations)                    │
│   ├── Turborepo         (monorepo orchestration)        │
│   ├── Husky + commitlint (git hooks)                    │
│   └── @astrojs/check    (TypeScript em CI)              │
├─────────────────────────────────────────────────────────┤
│ Storage / Infra                                         │
│   ├── Postgres 16+ + pgvector + AGE  (prod DB)          │
│   ├── Redis 7+          (queue Streams + cache)         │
│   ├── S3-compatible     (R2/MinIO/AWS via Bun.S3Client) │
│   └── GitHub Actions    (CI/CD)                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Style guide (mandatory)

Per opencode AGENTS.md style:

### Naming
- **Single-word names default** (cfg, err, opts, dir, root, child, state, timeout, pid)
- Multi-word só quando ambíguo
- Sem `inputPID`, `existingClient` → use `pid`, `client`
- Snake_case em DB schemas (Drizzle convention)
- camelCase em TS code

### Control flow
- **Avoid `else`** — early returns
- **Avoid try/catch** — Effect Result pattern OR `?` operator
- **Avoid `any`** — use `unknown` + type guards

### Variables
- Prefer `const` over `let`
- Inline single-use values (reduce variable count)
- Avoid unnecessary destructuring (`obj.a` not `const {a} = obj`)
- Type inference > explicit annotations (only export types)

### Bun-first APIs
```typescript
// ✅ Use native Bun
const text = await Bun.file("./data.json").text()
const json = await Bun.file("./data.json").json()
await Bun.write("./output.txt", "hello")
const result = await Bun.$`ls -la`.text()
const proc = Bun.spawn(["echo", "hi"])
const hash = await Bun.password.hash(password)
const verify = await Bun.password.verify(password, hash)
const sqlite = new Database("./db.sqlite") // bun:sqlite
const sql = new Bun.SQL("postgres://...")
const redis = new Bun.RedisClient()
const s3 = new Bun.S3Client()

// ❌ Don't use unless required
import fs from "fs/promises"
import { execa } from "execa"
import bcrypt from "bcrypt"
import { Database } from "better-sqlite3"
import { Pool } from "pg"
import Redis from "ioredis"
import { S3Client } from "@aws-sdk/client-s3"
```

### Elysia patterns
```typescript
// ✅ End-to-end types
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
// ✅ Server-rendered, zero JS by default
import Layout from "@/layout/Default.astro"
import { fetchTasks } from "@/lib/api"
const tasks = await fetchTasks() // SSR
---

<Layout>
  {/* Static content (no JS) */}
  <h1>{tasks.length} tasks</h1>

  {/* Interactive island (only this ships JS) */}
  <TaskBoard client:visible tasks={tasks} />
</Layout>
```

---

## 🔬 Methodology (mandatory per ADR-014)

### 7-stage cycle
1. Brainstorming (SDD) — 9-step Socratic
2. Git Worktrees
3. Writing Plans — 2-5min tasks
4. Subagent Execution — fresh per task
5. TDD — RED-GREEN-REFACTOR strict
6. Code Review — severity-ranked
7. Finishing Branch

### Hard gates
- ❌ No code antes de design approved
- ❌ No implementation antes de plan
- ❌ **No production code antes de failing test (TDD)**
- ❌ No completion antes de verification
- ❌ No merge antes de code review (0 critical)

### TDD essential principle
> **Production code → test exists and failed first. Otherwise → not TDD.**

```bash
# ✅ Correct TDD flow
$ bun test test/auth/types.test.ts
✗ FAIL — module not found (RED)

# Now write minimal code
$ vim src/auth/types.ts

$ bun test test/auth/types.test.ts
✓ PASS (GREEN)

$ git commit -m "feat(auth): ..."
```

---

## 📋 Conventions

### Branches
- `main` (always green)
- `dev` (integration)
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

## 🛠️ Commands

```bash
# Development
bun dev                   # CLI dev mode
bun dev:daemon            # daemon (Elysia hot reload)
bun dev:admin             # admin UI (Astro dev server)
bun dev:docs              # docs site (Astro + Starlight)

# Testing (bun:test native)
bun test                  # all tests
bun test --watch          # watch mode
bun test --coverage       # com coverage

# Quality
bun typecheck             # tsc --noEmit
bun lint                  # biome check
bun lint:fix              # biome check --apply
bun format                # biome format

# Database (Drizzle Kit)
bun db:generate           # generate migrations
bun db:migrate            # apply migrations
bun db:studio             # GUI

# Build
bun build                 # production build (native bundler)

# Direct invoke
bun run packages/cli/src/index.ts <command>
```

---

## 🌉 CLI bridge preferences (bootstrap)

Durante implementação Phase 1:

| Task | Preferred CLI |
|---|---|
| Architecture / ADRs | `claude` (Opus, deep reasoning) |
| Implementation | `claude` (Sonnet) |
| Refactor | `aider` |
| Frontend (Astro) | `claude` (Sonnet) ou `codex` |
| Quick fixes | `claude` (Haiku) |
| Research | `gemini` (search-augmented) |
| Test gen (TDD) | `claude` (Sonnet) |
| Code review | `claude` (Sonnet) |

---

## 🔐 Permissions

### Tools allowed
- Read, Write, Edit
- Bash, Grep, Glob, WebFetch
- `gh` (GitHub CLI for PR/issue ops)
- File system within repo

### Tools blocked (sem rationale documentado)
- `git push --force`
- `rm -rf` outside `node_modules`, `dist`, `.turbo`, `.next`, `coverage`
- `deploy` (no production target em early stage)
- Modifying `~/.devclaud/auth.json` outside auth module
- Installing global packages without ADR
- Adding new dependencies sem checar Bun native equivalent first

### Allowed network
- API providers (api.anthropic.com, api.openai.com, generativelanguage.googleapis.com)
- Package registries (registry.npmjs.org, github.com)
- Docs sources (docs.* domains)

---

## 🎓 Skills auto-active (per Bun+Elysia+Astro convention)

- `bun-native-first` — check Bun native API antes de adicionar dep
- `elysia-end-to-end-types` — design API com type sync
- `astro-islands-best-practices` — when to use which `client:*`
- `astro-content-collections` — schema design
- `drizzle-snake-case-schemas` — convention
- `tdd-enforcement`
- `sdd-brainstorming`
- `verification-before-completion`

---

## 🚫 Out-of-scope (don't touch sem ADR)

- Production deployment (Phase 6+)
- Multi-tenant features (out-of-scope per pivot)
- Billing/marketplace (out-of-scope per pivot)
- Mobile app (out-of-scope per pivot)

---

## 🎯 Current focus (Phase 1)

Per `vault://23_roadmap/phase_1_foundation`:

1. **Auth storage** (3-type: api/oauth/wellknown) — `Bun.password` + `Bun.file` for storage
2. **Codex OAuth bridge** (port 1455 PKCE) — `Bun.serve` for local OAuth callback
3. **Provider catalog basics** (Anthropic + OpenAI direct) — Vercel AI SDK
4. **Discovery service** — `Bun.Glob`, `Bun.file`, `Bun.semver`
5. **Cognitive Engine minimal** — composition em Elysia handlers
6. **`/init` slash command** — generates this CLAUDE.md
7. **First end-to-end task** via CLI bridge

**M1 milestone:** First task end-to-end via CLI bridge.

---

## 🌐 Heritage (per `vault://21_heritage/`)

- [Anthropic Claude](https://platform.claude.com/docs)
- [opencode (anomalyco)](https://github.com/anomalyco/opencode) — provider mechanism foundation (ADR-017)
- [clawcode](https://github.com/deepelementlab/clawcode) — ECAP/TECAP learning
- [superpowers (obra)](https://github.com/obra/superpowers) — SDD+TDD methodology (ADR-014)
- [OpenClaw docs](https://docs.openclaw.ai) — gateway daemon pattern
- [Augment Code](https://docs.augmentcode.com) — context engine MCP (ADR-015)

---

## ⚠️ Critical reminders for AI agents

1. **Read vault first** — never invent architectural decisions
2. **Bun native FIRST** — check `Bun.*` API antes de `bun add`
3. **TDD strict** — test fails first, watch fail, then code
4. **No `else`** — early returns
5. **No try/catch** — Effect Result pattern
6. **Single-word names** — `cfg` not `configuration`
7. **Bun APIs** — `Bun.file()` not `fs.readFile`
8. **Snake_case em DB** — Drizzle convention
9. **Update vault when finding spec ambiguity** — keep spec in sync
10. **Conventional commits** — granular per RED-GREEN cycle
11. **Verify before declaring done** — actual tests, not "looks correct"
12. **Astro: zero JS by default** — only ship JS via `client:*` directives

---

## 📦 Package structure (per ADR-018 convention)

```
devclaw/
├── packages/
│   ├── core/                # Bun runtime + Effect (per ADR-017)
│   │   ├── auth/
│   │   ├── provider/
│   │   ├── bridge/
│   │   ├── agent/
│   │   ├── tool/
│   │   ├── session/
│   │   ├── permission/
│   │   └── audit/
│   ├── daemon/              # Elysia HTTP+WS + Bun.serve
│   │   └── (ACP server, MCP server, Canvas host)
│   ├── cli/                 # Bun runtime
│   ├── tui/                 # Ink (React for terminal)
│   ├── admin-ui/            # Astro + Solid islands
│   ├── docs-site/           # Astro + Starlight
│   ├── shared/              # types, utils
│   └── sdk-ts/              # @devclaw/sdk for external consumers
├── DEVCLAUD.md / CLAUDE.md  # this file (symlink CLAUDE → DEVCLAUD)
├── package.json             # workspace root
├── biome.json               # lint+format
├── bunfig.toml              # Bun config
├── turbo.json               # build orchestration
└── .github/workflows/ci.yml # GitHub Actions
```

---

**Vault is canonical. This file is local cache + bootstrap config.**
**When in doubt: check `vault://18_decisions/` (ADRs) and `vault://_diagrams/` (architecture).**
