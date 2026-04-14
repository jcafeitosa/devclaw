# Design: Research Engine (RAG)

> Vault: `45_research_engine/`. Phase 5A.

## 🎯 Goal

Pipeline multi-source de pesquisa + ranking autoridade/freshness + cache + citations + budget.

## 🧩 Componentes

1. Types + errors: `ResearchSource`, `Document`, `Chunk`, `Query`, `Citation`, `ResearchAnswer`, `Freshness`, errors.
2. Authority ranking (7 tiers) + Freshness policies por source type.
3. `Source` interface + reference impls: `StaticSource` (injected docs), `HttpSource` (injectable fetcher), `AggregateSource`.
4. Ingestion: `ingest(rawText)` → chunks (paragraph split + token budget).
5. Retrieval: `search(query)` across sources → rank by authority × token-overlap × freshness.
6. `ResearchCache` (LRU + TTL per source tier).
7. `ResearchBudget` (max calls per task).
8. `ResearchEngine` orchestrator: cache → search → rank → synthesize-stub → cite → store.
9. Barrel + `@devclaw/core/research` subpath.

## 📋 Plan (7 tasks)

| # | Task |
|---|---|
| 1 | Types + errors + Freshness |
| 2 | Ingestion (chunk splitter) |
| 3 | Source interface + Static/Http/Aggregate impls |
| 4 | ResearchCache (LRU + TTL) |
| 5 | Retrieval (authority × relevance × freshness ranking) |
| 6 | ResearchEngine orchestrator + ResearchBudget |
| 7 | Barrel + subpath |

## ✅ DoD

- 0 skip/fail/info/suppressions
- Cache hit avoids second source fetch
- Ranking test: authority tier + freshness affect order
- Budget test: over-limit throws
