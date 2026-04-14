# Design: Slash Commands

> Vault: `46_slash_commands/`. Phase 2.

## 🎯 Goal

Sistema de comandos `/cmd` definidos em markdown com frontmatter, merge scan de dirs (user+project), router com validação de args, runner que integra Team+Subagent+Cognitive.

## 🧩 Componentes

1. Types + errors: `ArgSpec`, `SlashDefinition` (name/description/agents/tools/isolation/args/hooks/body), `CommandInvocation`.
2. `parseFrontmatterMarkdown(text)` → `{frontmatter, body}` (YAML subset: strings/numbers/bool/arrays of primitives).
3. `SlashRegistry`: `loadFromDir(path)`, `register(def)`, `get(name)`, `list()`. Merge order: user-claude → user-devclaw → project-claude → project-claw → project-devclaw (last wins).
4. `parseInvocation("/cmd a --b")` → `{name, positional, flags}` + arg coercion against definition's `args` spec (type/required/default).
5. `SlashRunner`: resolve → validate → assemble Team (from `agents`) → run via CognitiveEngine with tool allow/deny + budget/timeout.
6. Built-in commands (markdown inline): `/architect`, `/tdd`, `/code-review`, `/security-review` com agents/tools/isolation apropriados.
7. Barrel + `@devclaw/core/slash` subpath.

## 🔒 Invariants

- Required args missing → `CommandValidationError` exit 2-like semantics
- Tool allowlist aplicado via `PermissionChecker` overlay no runner
- Budget / timeout enforce via `BudgetGuard` do subagent module
- Last-wins merge preserves override (built-ins podem ser substituídos)
- Unknown command → `CommandNotFoundError`

## 📋 Plan (5 tasks)

| # | Task |
|---|---|
| 1 | Types + errors + `parseFrontmatterMarkdown` |
| 2 | SlashRegistry (load dirs + merge order) |
| 3 | `parseInvocation` + arg coercion/validation |
| 4 | SlashRunner (assemble Team + run) |
| 5 | Built-ins + barrel + subpath |

## ✅ DoD

- 0 skip/fail/info/suppressions
- Loader handles real markdown fixtures (tmpdir)
- Runner tested with stubbed engine + team
