# Design: Learning (ECAP/TECAP + Policy + Evolution + Lifecycle)

> Vault: `07_learning/`. Phase 4.

## 🎯 Goal

Experience capsules (ECAP individual, TECAP team) como first-class artifacts + policies derivadas + evolução para skills + lifecycle de conhecimento.

## 🧩 Componentes

1. Types: `Capsule` (ECAP/TECAP union), `Triplet` (instinct/experience/skill), `Observation`, `Feedback`, `TeamTopology`, `PolicyRule`, errors.
2. `Observer`: captures events during execution into a draft capsule.
3. `CapsuleStore`: register/get/list/score/search/export-JSON/import-JSON + per-domain index.
4. `ExperienceEngine`:
   - `create(draft)` → Capsule
   - `apply(id, taskContext)` → ApplyBundle (instinct string + context text + skill hint)
   - `feedback(id, score, notes)` → updates rolling score + flags if low
5. `PolicyEngine`: rules derived from high-scoring capsules; `evaluate(input)` matches rules + returns actions.
6. `SkillEvolution`: `promote(capsuleId)` transforms capsule → Skill seed (using `@devclaw/core/skill` types).
7. `KnowledgeLifecycle`: prune unused (no apply in N days, score below threshold) com `pinned` protection.
8. Barrel + `@devclaw/core/learning` subpath.

## 🔒 Invariants

- Apply never mutates capsule body; only increments applications_count
- Feedback score clipped [0,1]
- Promote só funciona para capsulas com score ≥ threshold && applications ≥ N
- Lifecycle prune respeita `pinned`
- Observer não persiste até `finalize()`

## 📋 Plan (8 tasks)

| # | Task |
|---|---|
| 1 | Types + errors |
| 2 | Observer (event capture + finalize) |
| 3 | CapsuleStore (CRUD + search + export/import) |
| 4 | ExperienceEngine (create/apply/feedback) |
| 5 | PolicyEngine (rule derivation + evaluation) |
| 6 | SkillEvolution (promote) |
| 7 | KnowledgeLifecycle (prune) |
| 8 | Barrel + subpath |

## ✅ DoD

- 0 skip/fail/info/suppressions
- Apply test: increments count and returns enriched bundle
- Feedback test: low-score flags for review
- Promote test: capsule → Skill-compatible artifact
