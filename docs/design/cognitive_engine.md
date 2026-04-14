# Design: Cognitive Engine Core

> Full-spec per `vault://06_agent_os/cognitive_engine`. Integra context + prompt + provider + memory + tool.

## 🎯 Goal

Orchestrator think→plan→act (reflect/evaluator ficam em PR separada): Planner quebra objetivo em DAG, Reasoner escolhe próximo passo, Model Router seleciona tier (executor/advisor/fallback), Engine roda iterações até conclusão ou limite.

## 🧩 Componentes

1. **Types + errors**: `Plan`, `Step`, `StepStatus`, `Decision`, `Tier`, `RunResult`, `CognitiveError` subclasses.
2. **PlanGraph**: DAG helper — `ready()` (steps sem deps pendentes), `complete/fail(id)`, `pending()`, `isDone()`.
3. **Planner**: interface + `LLMPlanner` (usa `ProviderCatalog` + `PromptBuilder` com template de planning, parse JSON `{steps: []}`) + `StubPlanner` (test).
4. **Reasoner**: interface + `DefaultReasoner` (retorna step ready de maior prioridade).
5. **ModelRouter**: regra-based tier selection (`executor | advisor | fallback`); mapeia tier → providerId + model; suporta fallback quando tier indisponível.
6. **CognitiveEngine**: orquestrador — recebe `Task {goal, expectedOutput, context?}`, chama Planner (cached), loop (Reasoner.pick → Router.choose → Executor.run) até plano completo ou `maxSteps`; grava `Episode` no `MemoryService`.
7. **StepExecutor**: interface para executar steps (default: LLM-backed via provider; extensível para tool-only). Recebe Step + context e retorna output/erro.
8. Barrel + `@devclaw/core/cognitive` subpath.

## 🔒 Invariants

- Reasoner nunca retorna step com deps não completas
- Router nunca retorna tier não configurado
- Engine abortar se > `maxSteps` (default 20) ou deadline
- Episode gravado por step concluído
- Plan persisted em memory (sessionId) para resume

## 📋 Plan (7 tasks)

| # | Task | Files |
|---|---|---|
| 1 | Types + errors | `src/cognitive/types.ts` + `errors.ts` + test |
| 2 | PlanGraph DAG helper | `src/cognitive/plan_graph.ts` + test |
| 3 | Planner (interface + LLMPlanner + StubPlanner) | `src/cognitive/planner.ts` + test |
| 4 | Reasoner (interface + default) | `src/cognitive/reasoner.ts` + test |
| 5 | ModelRouter (tier-based) | `src/cognitive/router.ts` + test |
| 6 | CognitiveEngine orchestrator + StepExecutor | `src/cognitive/engine.ts` + `step_executor.ts` + test |
| 7 | Barrel + subpath | `src/cognitive/index.ts` + `package.json` |

## ✅ DoD

- 7 tasks green · 0 skip/fail/info/suppressions
- Engine end-to-end test: stub planner returns 3 steps, engine runs all 3, records 3 episodes
- Router fallback test: primary tier unavailable → picks fallback
- PlanGraph test covers cycle detection, ready resolution, completion
