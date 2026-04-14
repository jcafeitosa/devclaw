# Design: CLI Bridge

> Full-spec per `vault://42_cli_bridge/`. Módulo crítico do pivot — usa subscriptions.

## 🎯 Goal

Abstração para spawnar CLIs oficiais (claude/codex/gemini/aider) como executores, retornar streaming events, com registry + fallback para `ProviderCatalog` quando CLI indisponível.

## 🧩 Componentes (2 PRs)

### PR A (foundation):
1. Types + errors (BridgeRequest, BridgeResponse, BridgeEvent, Capabilities, CostEstimate, Bridge interface).
2. ProcessRunner — injectable `spawn(cmd, args, stdinText)` retornando `{stdout, stderr, exitCode, kill}`; default usa `Bun.spawn`.
3. EventStream — converte linhas stdout (JSONL ou text) em `AsyncIterable<BridgeEvent>`.
4. BridgeRegistry — register/list/select por fit (capabilities) + availability + cost.
5. ClaudeCodeBridge — wrapper da `claude` CLI (prova o padrão).

### PR B (expansion):
6. CodexBridge (uses `codex` + OAuth já shipped)
7. GeminiBridge + AiderBridge
8. FallbackStrategy (registry + `ProviderCatalog`)
9. Barrel + subpath final

## 🔒 Invariants

- `execute` retorna AsyncIterable (lazy consumption)
- `cancel(taskId)` para processos in-flight via stored pid map
- Cost default 0 (subscription) quando CLI disponível
- Fallback em tom API só quando `isAvailable()` false
- Logs nunca incluem auth tokens

## ✅ DoD (ambas PRs)

- Zero skip/fail/info/suppressions
- Testes usam mock `spawn` injetado (não executam binários reais)
- Events parser cobre JSONL, text-line, error-on-exit
