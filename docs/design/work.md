# Design: Work Management

> Vault: `04_work_management/`. Phase 2 — final item.
> Vault relationship: `communication_os` + `autonomy_engine` + `self_correction`.

## 🎯 Goal

Entidades canônicas + dependências (8 types + cycle detect + critical path) + workflow engine (6 triggers + 6 actions) + 3 views (list/kanban/gantt).
Work is the durable carrier of agent activity across turns and wakes.

## 🧩 Componentes

1. Types + errors: `WorkItem` union (project/epic/task/subtask/ticket/milestone/sprint), `Dependency`, `DependencyType`, `WorkStatus`, `Priority`, errors.
2. `WorkItemStore`: CRUD + hierarchy traversal (childrenOf, ancestorsOf); index por tipo/status/owner.
3. `DependencyEngine`: add/remove, cycle detection (DAG reject), critical path (topo sort + forward/backward pass), events `dependency_satisfied`.
4. `WorkflowEngine`: rule list with triggers (`item-created`/`item-moved`/`dep-unblocked`/`budget-exceeded`/`deadline-missed`/`agent-failed`) → actions (`reassign`/`create-subtask`/`trigger-agent`/`notify`/`escalate`/`freeze`).
5. Views: `toListView(filter)`, `toKanbanView(columnField)`, `toGanttView(now)` com critical path.
6. Barrel + `@devclaw/core/work` subpath.

## Liveness fit

Work management is where autonomy becomes visible:

- state transitions show what is alive, blocked, or done
- dependencies can wake other work
- workflow rules turn events into proactive behavior
- critical path shows what should happen next
- freeze/escalation protect the system when continuation is unsafe

## 📋 Plan (6 tasks)

| # | Task |
|---|---|
| 1 | Types + errors |
| 2 | WorkItemStore |
| 3 | DependencyEngine (cycle + critical path) |
| 4 | WorkflowEngine |
| 5 | Views (list/kanban/gantt) |
| 6 | Barrel + subpath |

## ✅ DoD

- 0 skip/fail/info/suppressions
- Critical path correctness test (multi-path DAG)
- Cycle rejection test
- Trigger/action matrix test for the core workflow rules
