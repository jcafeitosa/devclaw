# Design: Context Engine (CPE)

> Full-spec per `vault://06_agent_os/context_engine` + ADR-002 (context+prompt obrigatórios).

## 🎯 Goal

Pipeline que coleta → rankeia → filtra → aplica budget → assembla `ContextObject` estruturado. Obrigatório para qualquer invocação do Cognitive Engine (ADR-002). Pluggable sources (memory, Obsidian, discovery, events, custom).

## 🧩 Componentes

1. **Types**: `ContextRequest` (goal + hints), `ContextItem` (source, kind, content, score, tokens, meta), `ContextObject` (goal/background/constraints/relevantData/dependencies/risks/expectedOutput + items + diagnostics), `ContextError` subclasses.
2. **Token counter/budgeter**: pluggable estimator (default ≈ chars/4); `trimToBudget` removes lowest-scored items until fit.
3. **Relevance ranker**: injectable; default is token-overlap between request.goal and item.content (Jaccard-like).
4. **Noise filter**: score threshold gate (default 0).
5. **ContextSource interface**: `collect(request) → ContextItem[]`. Reference impls: `TextFragmentsSource` (in-memory), `DiscoverySource` (wraps `@devclaw/core/discovery`).
6. **MultiSourceCollector**: parallel fetch with per-source timeout + error isolation (one failing source doesn't fail assembly).
7. **ContextAssembler**: orchestrator (collect → rank → filter → budget → structure); enforces quality gates (non-empty, has expectedOutput).
8. **Progressive loading** (Phase 1): expose `expand(itemId)` hook — full implementation when skill system lands.

## 🔒 Invariants

- Empty `expectedOutput` → `ContextEmptyError`
- All items truncated/dropped to fit budget (never exceed)
- Failing source isolated; diagnostics record the error
- Ranker never throws; wraps errors in diagnostics
- Deterministic ordering when scores tie (stable sort by source id + item id)

## 📋 Plan (7 tasks)

| # | Task | Files |
|---|---|---|
| 1 | Types + errors + quality gates | `src/context/types.ts` + `errors.ts` + tests |
| 2 | Token counter + budget trimmer | `src/context/budget.ts` + test |
| 3 | Default relevance ranker (overlap) | `src/context/ranker.ts` + test |
| 4 | Noise filter | `src/context/filter.ts` + test |
| 5 | MultiSourceCollector | `src/context/collector.ts` + test |
| 6 | ContextAssembler orchestrator | `src/context/assembler.ts` + test |
| 7 | Reference sources + barrel | `src/context/sources/{text,discovery}.ts` + `index.ts` + tests |

## ✅ DoD

- 7 tasks green, 0 skip/fail/info
- Assembler test exercises full pipeline end-to-end with 2+ sources
- Budget test proves trimming drops lowest-score items first
- Source timeout test verifies one slow source doesn't hang others
