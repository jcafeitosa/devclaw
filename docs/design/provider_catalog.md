# Design: Provider Catalog (minimal)

> Phase 1 Module #3. Spec: `vault://60_provider_connection/provider_catalog`.

## 🎯 Goal

Registry de providers + 2 adapters (Anthropic API direct, OpenAI API direct) com interface uniforme `generate(prompt) → string`. Base para futuros adapters (Codex OAuth bridge, Google, Bedrock, etc.).

## 🧭 SDD (resumo)

- **Scope Phase 1:** texto plano only, non-streaming, API-key auth. Sem tools/vision/streaming (Phase 2+).
- **Transport:** raw `fetch` contra REST oficial de cada provider (zero deps; `@ai-sdk/*` vira upgrade Phase 2 quando ganha valor).
- **Auth:** recebe `AuthInfo` via `AuthStore` (reutiliza módulo #1). API key → header.
- **Catalog:** em memória, populado no bootstrap (`registerBuiltins`). Extensível via `.register(descriptor)`.
- **Errors:** `ProviderError { status, body, providerId }` — mapping HTTP → error.
- **Rate/retry:** out-of-scope Phase 1 (queue worker já tem retry quando chamador roda via fila).
- **Models:** hardcoded default model por provider Phase 1 (Anthropic `claude-opus-4-5-20250929`, OpenAI `gpt-4o-mini`). Override via opts.

## 📋 Plan (4 tasks)

| # | Task | Arquivos |
|---|---|---|
| 1 | Descriptor types + `ProviderCatalog` registry | `src/provider/types.ts` + `src/provider/catalog.ts` + tests |
| 2 | Anthropic adapter (Messages API) | `src/provider/anthropic_adapter.ts` + test (mock issuer) |
| 3 | OpenAI adapter (Chat Completions) | `src/provider/openai_adapter.ts` + test (mock issuer) |
| 4 | Barrel + index wiring + builtins registration | `src/provider/index.ts` + package.json subpath |

## ✅ DoD

- 4 tasks green, zero skip/fail/suppressions
- Mock HTTP tests provam request shape + response parsing
- Invoke via `catalog.generate("anthropic", {prompt, authStore})` retorna string
- `ProviderError` ao receber 4xx/5xx
