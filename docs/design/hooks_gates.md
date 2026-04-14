# Design: Hooks + Hard Gates

> Vault: `51_hooks/`, `55_dev_methodology/hard_gates`. Phase 2.

## 🎯 Goal

Extensibilidade via hooks (14 types) + enforcement mandatório dos 5 hard gates (pre-design / pre-implementation / pre-production-code / pre-completion / pre-merge).

## 🧩 Componentes

1. Hook types + errors + `HookContext<T>` + `HookResult<T>` (`{action:"pass"|"block"|"modify"|"suppress"|"retry", payload?}`).
2. `HookRegistry`: register/list por `HookType`; priority-ordered (lower first); enable/disable.
3. `HookRunner`: async chain executor — corre hooks em ordem; primeiro `block` aborta; `modify` substitui payload para próximos; `suppress` ignora erro; `retry` replica up to N.
4. `GateType` (5) + `GateCheck<T>` predicate + reasons.
5. `GateManager`: `ensure(gate, ctx)` → passa ou `GateBlockedError`; `override(gate, reason, actor)` → registra audit + bypass once.
6. Integration helper: wrapper para `ToolExecutor` chamando pre/post/error hooks; typed event names + barrel.

## 🔒 Invariants

- Hooks sync ou async; exceção = emite audit + trata como `block`
- Gates não têm implicit skip (anti-pattern vault)
- Override exige `reason` + grava em `AuditLog`
- Priority < 0 = first; ordem estável por `(priority, insertOrder)`
- Disabled hooks são ignorados mas persistem

## 📋 Plan (6 tasks)

| # | Task |
|---|---|
| 1 | Types + errors |
| 2 | HookRegistry (priority + enable/disable) |
| 3 | HookRunner (chain with block/modify/suppress/retry) |
| 4 | GateType + GateCheck + GateManager |
| 5 | ToolExecutor wrapper (pre/post/error hooks) |
| 6 | Barrel + subpath + integration test |

## ✅ DoD

- 0 skip/fail/info/suppressions
- GateManager override tested (logs audit)
- Runner tested: block stops, modify flows, error suppress
