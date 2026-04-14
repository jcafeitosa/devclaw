# Design: Discovery (minimal)

> Phase 1 Module #4. Spec: `vault://50_discovery/`.

## 🎯 Goal

`discover(rootDir) → DiscoveryReport` — detecta stack (language/framework/test-runner), CLIs disponíveis (claude/codex/gemini/aider), conventions (linter/formatter/branch).

## 🧭 SDD (resumo)

- **Scope Phase 1:** filesystem markers + shell `which`. Sem auth-status dos CLIs, sem infra (docker/k8s), sem models.dev, sem cache persistence.
- **API:** uma função `discover(rootDir)`; outras helpers exportadas (`detectStack`, `detectCLIs`, `detectConventions`) para reuso.
- **Shell:** `Bun.which` (nativo) > `Bun.spawn` para `--version`. Sem shell injection.
- **Resilience:** CLI ausente → entry com `{available: false}`, nunca throw.
- **Offline:** zero network.

## 📋 Plan (4 tasks)

| # | Task | Files |
|---|---|---|
| 1 | Stack detector (file markers + package.json) | `src/discovery/stack.ts` + test |
| 2 | CLI detector (Bun.which + --version) | `src/discovery/cli.ts` + test |
| 3 | Conventions (lint/format/branches/tests) | `src/discovery/conventions.ts` + test |
| 4 | Orchestrator + types + barrel | `src/discovery/index.ts` + `discover.ts` + test |

## ✅ DoD

- 4 tasks green, zero skip/fail/info
- Tests use `mkdtemp` fixtures (isolated filesystems)
- CLI detector injects resolver function for mocking (no real `which` in tests)
