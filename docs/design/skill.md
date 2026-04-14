# Design: Skill System

> Vault: `06_agent_os/skill_system`. Phase 3 closer.

## 🎯 Goal

Reusable procedural knowledge packages — discover, version, progressively load, activate by goal matching, lifecycle-track.

## 🧩 Componentes

1. Types + errors: `Skill`, `SkillStatus` (draft/review/active/deprecated/archived), `SkillInputSpec`, `SkillConstraints`, `SkillStep`, errors.
2. Skill parser (reuses `parseFrontmatterMarkdown` from slash module).
3. `SkillRegistry`: `loadFromDir(dir)`, `register(skill)`, `get(id, version?)`, `list(status?)`, versioning (semver), lifecycle transitions.
4. `SkillActivator`: match skill to goal by triggers/tags/keyword; returns ranked matches.
5. Progressive loader: metadata-only by default; `expand(id)` returns full body + steps.
6. Barrel + `@devclaw/core/skill` subpath.

## 🔒 Invariants

- Only `active` skills participate em activation matching
- Deprecated aceita activation mas emite warning no diagnostic
- Lifecycle transitions validated (draft→review→active; active↔deprecated; archive terminal)
- Version comparison same as slash/prompt registries (numeric semver)

## 📋 Plan (6 tasks)

| # | Task |
|---|---|
| 1 | Types + errors |
| 2 | Skill parser (markdown frontmatter → Skill) |
| 3 | SkillRegistry (versioning + lifecycle) |
| 4 | SkillActivator (goal matching) |
| 5 | Progressive loader (metadata vs full) |
| 6 | Barrel + subpath |

## ✅ DoD

- 0 skip/fail/info/suppressions
- Activation test: goal matches skill by tags + trigger keywords
- Lifecycle test: invalid transition rejected
