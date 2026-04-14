# Design: Memory System

> Full-spec per `vault://06_agent_os/memory_system`.

## 🎯 Goal

Memória multi-camada (short-term, long-term semantic, episodic) + 6 operações (write/recall/search/prune/inject/flush) + knowledge lifecycle.

## 🧩 Componentes

1. **Types + errors**: `MemoryItem` (id/kind/content/embedding?/tags/meta/createdAt/lastUsedAt/useCount), `Episode` (id/taskId/outcome/ts/meta/content), `MemoryError` hierarchy.
2. **Embedder** interface + `HashEmbedder` (FNV-1a bag-of-words → 384-dim vector, deterministic) + `cosineSimilarity` util.
3. **ShortTermMemory**: interface + `InMemoryShortTerm` (Map + TTL scheduler; fetched items bump `lastUsedAt`).
4. **LongTermMemory**: interface + `InMemoryLongTerm` (vector + lexical hybrid scan; tag filter; prune by lifecycle).
5. **EpisodicMemory**: interface + `InMemoryEpisodic` (append-only + range queries by taskId / time / outcome).
6. **MemoryService**: orchestrator exposing the 6 ops; `inject(ctxRequest)` produces `ContextItem[]` for CE.
7. **MemoryContextSource**: wraps `MemoryService.inject` for `ContextAssembler`.
8. Barrel + `@devclaw/core/memory` subpath.

## 🔒 Invariants

- Write is atomic (mutex) per layer
- Cosine similarity returns [-1, 1]; recall applies floor
- Prune never deletes items `pinned: true`
- Episodic log append-only (no mutation); ordered insertion preserved
- All layers work without external infra (InMemory impls are reference)

## 📋 Plan (8 tasks)

| # | Task | Files |
|---|---|---|
| 1 | Types + errors | `src/memory/types.ts` + `errors.ts` + tests |
| 2 | Embedder + HashEmbedder + cosine | `src/memory/embedding.ts` + test |
| 3 | ShortTermMemory + InMemory impl | `src/memory/short_term.ts` + test |
| 4 | LongTermMemory + InMemory impl | `src/memory/long_term.ts` + test |
| 5 | EpisodicMemory + InMemory impl | `src/memory/episodic.ts` + test |
| 6 | MemoryService orchestrator | `src/memory/service.ts` + test |
| 7 | MemoryContextSource | `src/memory/context_source.ts` + test |
| 8 | Barrel + subpath | `src/memory/index.ts` + `package.json` |

## ✅ DoD

- 8 tasks green · 0 skip/fail/info/suppressions
- Prune lifecycle tested (staleness + pinned)
- Episodic temporal queries tested
- Recall vector search tested with HashEmbedder
- Context source integration test exercises CE + Memory together
