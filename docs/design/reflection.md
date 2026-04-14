# Design: Reflection + Evaluator

> Fecha o loop think→plan→act→reflect per `vault://06_agent_os/cognitive_engine`.

## 🎯 Goal

Avaliar qualidade de cada step + resumir execução (reflexão) + propor correções + persistir lições no `MemoryService` como conhecimento reutilizável.

## 🧩 Componentes

1. **Types**: `EvaluationCriterion`, `Evaluation{score, criteria[], passed, feedback}`, `CorrectionProposal{action, stepId, rationale, patch?}`, `Reflection{runId, outcome, evaluations, corrections, lessons}`, errors.
2. **Evaluator** interface + `RubricEvaluator` (score cada step contra rubrica; thresholds; usa provider p/ critério "qualitativo" quando configurado; tem modo puramente programático).
3. **Reflector** interface + `DefaultReflector` (observa RunResult, evaluations, falhas → gera `CorrectionProposal[]` + `lessons[]` estruturadas).
4. **LearningFeedback**: persiste lessons em `MemoryService.write(tier:"long", kind:"lesson", ...)` com tags `["reflection", taskId]`.
5. **ReflectionPipeline**: orquestrador (evaluate → reflect → learn) chamado pós-`engine.run`.
6. **Engine hook**: `CognitiveEngine` aceita `onStepCompleted(ctx, state)` callback opcional para evaluator inline; método convenience `runAndReflect(task)` faz run + pipeline.
7. Barrel + `@devclaw/core/reflection` subpath.

## 🔒 Invariants

- Scores em [0, 1]; `passed = score >= threshold`
- Rubric vazio → score 1 (nada a avaliar ≠ falha)
- Correction propostas nunca mutam plano original (só sugerem)
- Lessons persistidas com `pinned: false` (lifecycle pode podar)
- Pipeline nunca throw em evaluation failure: captura e registra

## 📋 Plan (7 tasks)

| # | Task | Files |
|---|---|---|
| 1 | Types + errors | `src/reflection/types.ts` + `errors.ts` + test |
| 2 | RubricEvaluator (programático + optional LLM) | `src/reflection/evaluator.ts` + test |
| 3 | DefaultReflector (corrections + lessons) | `src/reflection/reflector.ts` + test |
| 4 | LearningFeedback (MemoryService wire) | `src/reflection/learning.ts` + test |
| 5 | ReflectionPipeline orchestrator | `src/reflection/pipeline.ts` + test |
| 6 | Engine hooks (`onStepCompleted`, `runAndReflect`) | editar `src/cognitive/engine.ts` + test |
| 7 | Barrel + subpath | `src/reflection/index.ts` + package |

## ✅ DoD

- 7 tasks green · 0 skip/fail/info/suppressions
- Pipeline test: falha num step → reflection inclui correction + lesson persistida
- Evaluator test com rubric programática + LLM-backed (mock provider)
- Engine integration test: `runAndReflect` retorna `{result, reflection}` com lessons em memory
