# Design: Self-Correction

> Vault: `43_self_correction/`. Phase 3.

## 🎯 Goal

Loop autônomo: `detect → hypothesize → rank → fix → verify → escalate`. Team identifica + hipotiza + corrige erros **antes** de escalar pro humano.

## 🧩 Componentes

1. Types + errors (ErrorSignal com trigger types, Hypothesis, FixAttempt, CorrectionOutcome, EscalationDecision).
2. `Detector`: interface + `DefaultDetector` (classifies ErrorSignal → ErrorClass por trigger keywords + heuristics).
3. `Hypothesizer`: interface + `DefaultHypothesizer` (rule-based generator with configurable library + likelihood ranker).
4. `Fixer` + `Verifier`: user-provided interfaces invoked by loop; `StubFixer`/`StubVerifier` for tests.
5. `CorrectionBudget`: max attempts (3), max cost multiplier (10x), max duration (30min).
6. `CorrectionLoop`: orchestrator that cycles attempts, emits events, respects budget; `decide()` returns `resolved`/`escalate-specialist`/`escalate-human` per EscalationPolicy.
7. Barrel + `@devclaw/core/correction` subpath.

## 🔒 Invariants

- Every attempt logged (audit via events)
- Budget enforced across attempts (sum of cost/duration)
- Escalate-human reached only after `maxAttempts` or hard-stop trigger
- Unknown trigger → classified as `unknown` (generic hypotheses)
- Verifier determinism: `ok` vs `fail` with reason

## 📋 Plan (6 tasks)

| # | Task |
|---|---|
| 1 | Types + errors |
| 2 | DefaultDetector (trigger classification) |
| 3 | DefaultHypothesizer (rule library + ranker) |
| 4 | CorrectionBudget + events |
| 5 | CorrectionLoop orchestrator |
| 6 | Barrel + subpath |

## ✅ DoD

- 0 skip/fail/info/suppressions
- Loop test: 3 attempts exhausted → escalates; verifier passes early → resolved
- Budget overshoot aborts cleanly
