# DevClaw — TODO Roadmap

Tracks progress against the vault roadmap (`vault://23_roadmap/`).

Legend: ✅ done · 🟡 partial · ⏳ in progress · ⬜ pending · 🔒 claimed (agent working)

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
```

### Lock file (machine-level coordination)

For agents on the **same machine** (e.g., multiple Claude Code sessions):
- Check `.devclaw/locks/` directory for active locks
- Create lock: `echo "<agent-id> $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .devclaw/locks/<task-id>.lock`
- Release lock: delete the file after commit
- Stale locks (>2h old) can be reclaimed

---

## Packages shipped

| Package | PRs | Status |
|---|---|---|
| `@devclaw/core` | #1-#14 | ✅ 37 modules, 266 src, 189 tests |
| `@devclaw/cli` | #15 | ✅ 6 commands |
| `@devclaw/daemon` | #16 | ✅ Elysia HTTP+WS |
| `@devclaw/docs-site` | — | ✅ Astro + Starlight scaffold |

---

## Phase 1 — Foundation + Core Execution ✅

| Module | Vault | Status |
|---|---|---|
| Queue (ADR-019) | `12_event_system/message_queue` | ✅ |
| Auth Storage (api/oauth/wellknown) | `60_provider_connection/auth_storage` | ✅ |
| Codex OAuth (PKCE port 1455) | `60_provider_connection/oauth_flows` | ✅ |
| Provider Catalog (Anthropic + OpenAI) | `60_provider_connection/provider_catalog` | ✅ |
| Discovery (stack/CLIs/conventions) | `50_discovery/` | ✅ |
| Tool System (registry/executor/perms) | `06_agent_os/tool_system` | ✅ |
| Context Engine (CPE) | `06_agent_os/context_engine` | ✅ |
| Prompt System (templates + adapters) | `06_agent_os/prompt_system` | ✅ |
| Memory System (short/long/episodic) | `06_agent_os/memory_system` | ✅ |
| Cognitive Engine (planner/reasoner/router) | `06_agent_os/cognitive_engine` | ✅ |
| Reflection + Evaluator | `06_agent_os/cognitive_engine` | ✅ |
| CLI Bridges (claude/codex/gemini/aider) | `42_cli_bridge/` | ✅ |
| CLI package (devclaw binary) | `46_slash_commands/` | ✅ |
| Daemon (Elysia HTTP+WS) | `53_gateway_daemon/` | ✅ |

**Milestones reached:** M1 (end-to-end task via CLI bridge), M2 (Codex OAuth).

## Phase 2 — Multi-Agent Team + Slash Commands ✅

| Module | Vault | Status |
|---|---|---|
| Team Composition (roles/assembly/patterns) | `44_team_composition/` | ✅ |
| Collaboration System (4 modes) | `05_communication_os/collaboration_system` | ✅ |
| Subagents w/ isolation | `06_agent_os/subagents` | ✅ |
| Slash Commands core | `46_slash_commands/` | ✅ |
| Hooks + Hard Gates | `51_hooks/` | ✅ |
| Checkpoints & Rewind | `47_checkpoints_rewind/` | ✅ |
| Agent Communication + Channels | `05_communication_os/` | ✅ |
| Work Management (list/kanban/gantt) | `04_work_management/` | ✅ |

**Milestone reached:** M3 — multi-agent collaboration ✅

## Phase 3 — Self-Correction + Context ✅

| Module | Vault | Status |
|---|---|---|
| Self-Correction loop | `43_self_correction/` | ✅ |
| Advanced CPE (skills integration) | `06_agent_os/skill_system` | ✅ |

## Phase 4 — Learning ✅

| Module | Vault | Status |
|---|---|---|
| Experience Engine / ECAP-TECAP | `07_learning/` | ✅ |
| Knowledge Lifecycle | `07_learning/knowledge_lifecycle` | ✅ |
| Policy Engine | `07_learning/policy_engine` | ✅ |
| Skill Evolution | `07_learning/skill_evolution` | ✅ |

## Phase 5 — Governance + Research ✅

| Module | Vault | Status |
|---|---|---|
| Research Engine (RAG) | `45_research_engine/` | ✅ |
| Governance / policies | `03_company_os/governance` | ✅ |
| Budget System | `03_company_os/budget_system` | ✅ |
| Goal Engine | `03_company_os/goal_engine` | ✅ |
| Org Structure | `03_company_os/org_structure` | ✅ |

---

## 🎯 CURRENT PRIORITY: Hardening + Integration gaps

> Before advancing to Phase 6 UI, existing modules need hardening.
> Pick tasks in order. Each task is independent (parallelizable).

| ID | Task | Vault spec | Scope | Status |
|---|---|---|---|---|
| H-01 | **Drizzle ORM schemas + migrations** | `11_data_models/schemas` | Add drizzle-orm dep, create `packages/core/src/db/schema/`, implement 11 tables from vault spec, add `bun db:generate` and `bun db:migrate` scripts | ⬜ |
| H-02 | **Daemon HTTP auth** | `53_gateway_daemon/security_pairing` | Add `@elysiajs/bearer` + `@elysiajs/jwt` to daemon, protect all routes except GET /health, loopback bypass | ⬜ |
| H-03 | **Provider adapters (Google + Ollama)** | `60_provider_connection/provider_catalog` | Add Google AI + Ollama adapters to provider/, register in catalog, Vercel AI SDK wrappers | ⬜ |
| H-04 | **Safety integration** | `35_ai_safety/content_moderation` | Wire safety module into bridge execute path + cognitive engine, add PII filter tests | ⬜ |
| H-05 | **E2E integration test** | `_implementation/first_module` | Create `test/e2e/` with full task lifecycle: auth → provider → bridge → cognitive → tool → result | ⬜ |
| H-06 | **Root dev scripts** | — | Wire `bun dev:daemon`, `bun dev:docs` in root package.json, turborepo dev pipeline | ⬜ |

---

## Phase 6 — Polish (UI/UX)

| ID | Task | Vault | Status |
|---|---|---|---|
| P6-01 | TUI (Ink framework) | `49_tui/` | ⬜ |
| P6-02 | Admin UI (Astro + Solid islands) | ADR-018 | ⬜ |
| P6-03 | Docs site content (guides, API ref) | docs-site | 🟡 scaffold only |

## Phase 7 — Protocols (ACP + MCP)

| ID | Task | Vault | Status |
|---|---|---|---|
| P7-01 | ACP protocol | `57_acp_protocol/` | ✅ |
| P7-02 | MCP context engine | `56_context_engine_mcp/` | ✅ |
| P7-03 | LSP integration (raw LSP) | `58_lsp_integration/` | 🟡 framing + client, no raw LSP |
| P7-04 | PTY/Terminal (raw PTY) | `59_pty_terminal/` | 🟡 session + registry, no raw PTY |

## Phase 8 — Advanced

| ID | Task | Vault | Status |
|---|---|---|---|
| P8-01 | Managed Runtimes (cloud) | `52_advanced_capabilities/` | 🟡 local + ephemeral only |
| P8-02 | Gateway Daemon modes (3 modes) | `53_gateway_daemon/` | 🟡 basic + ACP/MCP WS |
| P8-03 | Nodes & Devices | `54_nodes_devices/` | ✅ |
| P8-04 | Advanced capabilities wrappers | `52_advanced_capabilities/` | ✅ |

---

## Implementation depth audit

> Modules marked ✅ above but needing depth improvement.
> NOT blocking — these are enhancement tasks.

| ID | Module | Lines | Gap | Priority |
|---|---|---|---|---|
| D-01 | `safety` | 168 | Only regex patterns, no integration into bridge/cognitive flow | Medium |
| D-02 | `provider` | 293 | Only Anthropic + OpenAI, spec claims 20+ | Medium |
| D-03 | `correction` | 428 | Loop exists but hypothesis→fix→verify cycle thin | Low |
| D-04 | `learning` | 732 | ECAP/TECAP capture exists, feedback loop to policy unclear | Low |
| D-05 | `research` | 560 | Retrieval works, citation generation minimal | Low |
