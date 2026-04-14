# DevClaw — TODO roadmap

Tracks progress against the vault roadmap (`vault://23_roadmap/`).

Legend: ✅ done · 🟡 partial · ⏳ in progress · ⬜ pending

## Packages shipped

| Package | PRs | Status |
|---|---|---|
| `@devclaw/core` | #1 #2 #4 #5 #6 #7 #8 #9 #10 #11 #12 #13 #14 | ✅ |
| `@devclaw/cli` | #15 | ✅ |
| `@devclaw/daemon` | #16 | ✅ |

## Phase 1 — Foundation + Core Execution

| Module | Vault | Status |
|---|---|---|
| Queue (ADR-019) | `12_event_system/message_queue` | ✅ |
| Auth Storage (api/oauth/wellknown) | `60_provider_connection/auth_storage` | ✅ |
| Codex OAuth (PKCE port 1455) | `60_provider_connection/oauth_flows` | ✅ |
| Provider Catalog (Anthropic + OpenAI) | `60_provider_connection/provider_catalog` | ✅ |
| Discovery (stack/CLIs/conventions) | `50_discovery/` | ✅ |
| Tool System (registry/executor/perms + fs/shell/web) | `06_agent_os/tool_system` | ✅ |
| Context Engine (CPE) | `06_agent_os/context_engine` | ✅ |
| Prompt System (templates + adapters) | `06_agent_os/prompt_system` | ✅ |
| Memory System (short/long/episodic) | `06_agent_os/memory_system` | ✅ |
| Cognitive Engine (planner/reasoner/router) | `06_agent_os/cognitive_engine` | ✅ |
| Reflection + Evaluator | `06_agent_os/cognitive_engine` | ✅ |
| CLI Bridges (claude/codex/gemini/aider) | `42_cli_bridge/` | ✅ |
| CLI package (devclaw binary) | `46_slash_commands/` (core) | ✅ |
| Daemon (Elysia HTTP+WS) | `53_gateway_daemon/` | ✅ |

**Milestones reached:** M1 (end-to-end task via CLI bridge), M2 (Codex OAuth).

## Phase 2 — Multi-Agent Team + Slash Commands ✅ (M3 reached)

| Module | Vault | Status |
|---|---|---|
| Team Composition (roles/assembly/patterns) | `44_team_composition/` | ✅ |
| Collaboration System (4 modes) | `05_communication_os/collaboration_system` | ✅ |
| Subagents w/ isolation | `06_agent_os/subagents` | ✅ |
| Slash Commands core | `46_slash_commands/` | ✅ |
| Hooks + Hard Gates | `51_hooks/` · `55_dev_methodology/hard_gates` | ✅ |
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

## Phase 6 — Polish (UI/UX)

| Module | Vault | Status |
|---|---|---|
| TUI (Ink) | `49_tui/` | ⬜ |
| Admin UI (Astro + Solid) | `18_decisions/adr_018` | ⬜ |
| Docs site (Astro + Starlight) | — | ⬜ |

## Phase 7 — Protocols (ACP + MCP)

| Module | Vault | Status |
|---|---|---|
| ACP (JSON-RPC bidirectional) | `57_acp_protocol/` · ADR-016 | ✅ |
| MCP context engine (expose core) | `56_context_engine_mcp/` · ADR-015 | ✅ |
| LSP integration | `58_lsp_integration/` | 🟡 framing + client + registry |
| PTY/Terminal | `59_pty_terminal/` | 🟡 session + registry (no raw PTY) |

## Phase 8 — Advanced

| Module | Vault | Status |
|---|---|---|
| Managed Runtimes | `52_advanced_capabilities/` · ADR-012 | 🟡 local + ephemeral + registry |
| Gateway Daemon modes | `53_gateway_daemon/` | 🟡 basic + ACP/MCP WS |
| Nodes & Devices | `54_nodes_devices/` | ✅ |
| Advanced capabilities wrappers | `52_advanced_capabilities/` | ✅ |

---

## Next PR target

**Team Composition + Collaboration System** — unlocks M3 and all Phase 2 downstream work.

Per roadmap recommendation (see `docs/design/team_composition.md` once created).
