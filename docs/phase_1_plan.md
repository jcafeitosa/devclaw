# Phase 1 Plan — E2E SDD+TDD

> Lives in repo as working doc. Canonical spec: `vault://23_roadmap/phase_1_foundation`.

## Scope (6 modules, dependency order)

| # | Module | Why this order |
|---|---|---|
| 0 | **Queue** (idempotency / BunRedisStreamsQueue / InMemoryQueue / WorkerPool) | ✅ Done (PR #1) |
| 1 | **Auth Storage** | Codex OAuth persists tokens here |
| 2 | **Codex OAuth bridge** (port 1455 PKCE) | First subscription leverage proof |
| 3 | **Provider Catalog** (Anthropic + OpenAI direct) | Needed to invoke anything |
| 4 | **Discovery** (`/discover`) | Detects stack/CLIs/infra |
| 5 | **Cognitive Engine minimal** | Planner stub + invoke flow |
| 6 | **CLI `/init` + `/invoke`** | User-facing entry |

**M1 milestone:** first task E2E via CLI bridge.

## 7-stage cycle per module

1. Brainstorm (SDD 9-step) — answers in `docs/design/<module>.md`
2. Worktree — `git worktree add .claude/worktrees/<feat>`
3. Plan — 5-10 tasks × 2-5 min each in same design doc
4. Subagent execution — fresh per task
5. TDD — RED→GREEN→REFACTOR strict (hard gate: no production code antes de failing test)
6. Code review — severity-ranked
7. Finish — PR + squash-merge + delete branch

## Hard gates (non-negotiable)

- ❌ No code without design approved
- ❌ No production code without failing test first
- ❌ No completion without verification (real tests, not "looks correct")
- ❌ No merge without code review (0 critical)
- ❌ No force-push to main (branch protection enforces)

## Conventions

- Branch: `feat/<module>` (e.g. `feat/auth-storage`)
- Worktree: `.claude/worktrees/<module>` (sibling to main checkout)
- Commits: Conventional, granular per RED-GREEN cycle
- PR: squash-merge, delete branch after
- Tests ≥80% coverage global, ≥95% core/auth/security

## Current focus: Module #1 — Auth Storage

See `docs/design/auth_storage.md`.
