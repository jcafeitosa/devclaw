# Design: Governance + Budget + Goals + Org

> Vault: `03_company_os/`. Phase 5B closer.

## 🎯 Goal

Aprovação de decisões críticas (7 gates), overrides auditados, budget em 5 scopes, hierarquia Goal, estrutura org + escalation.

## 🧩 Componentes

1. Types + errors: `ApprovalGate`, `ApprovalRequest/Decision`, `OverrideRecord`, `BudgetScope`, `BudgetLimit`, `GoalNode` union, `OrgRole`.
2. `ApprovalGateSystem`: register gate, request decision, approve/deny, override with rationale + audit via `AuditLog` hooks.
3. `BudgetSystem`: nested scopes (company/project/sprint/agent/task), soft+hard limits, charge/check flow, emits events at thresholds.
4. `GoalEngine`: enforces hierarchy (mission→objectives→projects→epics→tasks) + prioritization.
5. `OrgStructure`: roles (CEO/CTO/COO/CFO/Coordinator/Specialist/Worker), ownership per item, escalation chain helper.
6. Barrel + `@devclaw/core/governance` subpath.

## 📋 Plan (6 tasks)

| # | Task |
|---|---|
| 1 | Types + errors |
| 2 | ApprovalGateSystem |
| 3 | BudgetSystem (nested scopes + limits) |
| 4 | GoalEngine |
| 5 | OrgStructure + escalation |
| 6 | Barrel + subpath |

## ✅ DoD

- 0 skip/fail/info/suppressions
- Approval override logged + accepted
- Budget soft warning + hard stop tested
- Goal hierarchy rejects orphan tasks
- Escalation returns correct chain
