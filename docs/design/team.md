# Design: Team Composition + Collaboration

> Vault: `44_team_composition/`, `05_communication_os/collaboration_system`.

## 🎯 Goal

Time multi-disciplinar (13 roles) + 4 modos de interação (debate/collab/cooperation/delegation) + 6 patterns (waterfall/generator-verifier/pair/council/mentor/consult) + TeamAssembler (monta time por `ProjectSpec`).

## 🧩 Componentes

1. Types: `Role`, `RoleId` (13 IDs), `RoleDefinition{cliPreference, capabilities, budgetShare, skills}`, `TeamMember`, `Team{members, project, budget}`, `CollaborationMode`, `Interaction`, `CollaborationPattern`.
2. `ROLE_CATALOG` — definições dos 13 papéis com CLI preference + budget share.
3. `TeamAssembler` — `assemble(ProjectSpec)` → `Team` per regras do vault.
4. `Interaction` helpers: `debate`, `collab`, `cooperate`, `delegate` (typed event creation).
5. `CollaborationPattern` executor (`runPattern(pattern, team, task)`) integrando com `CognitiveEngine`.
6. Barrel + `@devclaw/core/team` subpath.

## 📋 Plan (6 tasks)

| # | Task |
|---|---|
| 1 | Types + ROLE_CATALOG + tests |
| 2 | TeamAssembler (assemble rules per vault) + tests |
| 3 | CollaborationMode + Interaction + tests |
| 4 | CollaborationPattern union + generator-verifier + delegate |
| 5 | TeamOrchestrator (wires Team + patterns + cognitive) |
| 6 | Barrel + subpath + integration |

## ✅ DoD

- 0 skip/fail/info/suppressions
- 13 roles catalogados
- Assembler respeita regras (add backend when tech_stack has backend, etc)
- Integration test: assemble → pattern → invoke via engine
