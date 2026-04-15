# Design: Subagents

> Vault: `06_agent_os/subagents`. Phase 2 — paralelismo + isolamento + segurança.
> Vault relationship: `agent_lifecycle` + `cognitive_engine` + `autonomy_engine`.

## 🎯 Goal

Spawn subagents (filhos curta duração) com 5 isolation modes, restrições de tools/budget, 2 modes de operação (plan/execution), eventos lifecycle, auditoria.
Subagents are a core liveness primitive: the parent keeps planning while children execute or inspect in parallel.

## 🧩 Componentes

1. Types: `IsolationMode` ("none"|"worktree"|"sandbox"|"container"|"fork"), `SubagentMode` ("plan"|"execution"), `SubagentSpec` (id/parentId/mode/isolation/restrictions/task), `SubagentRestrictions` (allowlist/denylist tools, budget), `SubagentResult`, lifecycle events.
2. `IsolationProvider` interface: `allocate/cleanup`. Impls:
   - `NoneIsolation` (no-op, same process)
   - `ForkIsolation` (separate `Bun.spawn` with restricted env)
   - `WorktreeIsolation` (git worktree add/remove com cleanup guarantee)
   - `SandboxIsolation` (read-only mount — stub interface + "not supported" on default)
   - `ContainerIsolation` (docker run — stub interface)
3. `BudgetGuard`: enforces duration, cost, tokens; aborts over-budget.
4. `ContextFilter`: narrows parent `ContextObject` por restrictions (kind/tags/tool allowlist).
5. `SubagentRunner`: `spawn(spec)` → isolate → filter context → delegate to provided `executor` → emit lifecycle events → cleanup → `SubagentResult`.
6. Integration: `CognitiveEngine.runSubagent(spec)` helper e events (`subagent_spawned`/`subagent_tool_called`/`subagent_completed`/`subagent_failed`).

## Liveness fit

Subagents make the agent system feel active because they:

- preserve parent continuity while work is delegated
- separate read-only analysis from mutating execution
- keep worktree or sandbox cleanup explicit
- emit auditable lifecycle events
- allow specialist parallelism without losing the main loop

## 🔒 Invariants

- Cleanup sempre roda (try/finally); worktree nunca fica órfão
- `delegate_stripping: true` → subagent não pode spawn outro (guard check)
- Plan mode → executor não deve escrever (enforçado via tools allowlist)
- Budget violation → abort + event
- Audit entry por spawn + complete/fail
- Subagent inherits workspace/session identity but only the allowed write
  surface from the parent restriction set

## 📋 Plan (6 tasks)

| # | Task |
|---|---|
| 1 | Types + errors + events |
| 2 | IsolationProvider interface + None/Fork impls |
| 3 | WorktreeIsolation (Bun.spawn git + tmp path) |
| 4 | BudgetGuard + ContextFilter |
| 5 | SubagentRunner orchestrator |
| 6 | Barrel + subpath |

## ✅ DoD

- Zero skip/fail/info/suppressions
- WorktreeIsolation testado com git real em tmpdir
- Budget/filter tests cobrem edge cases
