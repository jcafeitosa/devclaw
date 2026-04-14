# Design: Work Management

> Vault: `04_work_management/`. Phase 2 — final item.

## 🎯 Goal

Entidades canônicas + dependências (8 types + cycle detect + critical path) + workflow engine (6 triggers + 6 actions) + 3 views (list/kanban/gantt).

## 🧩 Componentes

1. Types + errors: `WorkItem` union (project/epic/task/subtask/ticket/milestone/sprint), `Dependency`, `DependencyType`, `WorkStatus`, `Priority`, errors.
2. `WorkItemStore`: CRUD + hierarchy traversal (childrenOf, ancestorsOf); index por tipo/status/owner.
3. `DependencyEngine`: add/remove, cycle detection (DAG reject), critical path (topo sort + forward/backward pass), events `dependency_satisfied`.
4. `WorkflowEngine`: rule list with triggers (`item-created`/`item-moved`/`dep-unblocked`/`budget-exceeded`/`deadline-missed`/`agent-failed`) → actions (`reassign`/`create-subtask`/`trigger-agent`/`notify`/`escalate`/`freeze`).
5. Views: `toListView(filter)`, `toKanbanView(columnField)`, `toGanttView(now)` com critical path.
6. Barrel + `@devclaw/core/work` subpath.

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
