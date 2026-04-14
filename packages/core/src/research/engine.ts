import { ResearchBudget, type ResearchBudgetConfig } from "./budget.ts"
import { ResearchCache, type ResearchCacheConfig } from "./cache.ts"
import { NoResultsError } from "./errors.ts"
import { type RankedDocument, rankDocuments } from "./retrieval.ts"
import type { ResearchSource } from "./source.ts"
import type { Citation, Query, ResearchAnswer } from "./types.ts"

export type Synthesizer = (query: Query, results: RankedDocument[]) => Promise<string> | string

export interface ResearchEngineConfig {
  sources: ResearchSource[]
  cache?: ResearchCache | ResearchCacheConfig
  budget?: ResearchBudgetConfig
  synthesize?: Synthesizer
  now?: () => number
}

function defaultSynthesizer(_query: Query, results: RankedDocument[]): string {
  if (results.length === 0) return ""
  const top = results.slice(0, 3)
  return top.map((doc, i) => `[${i + 1}] ${doc.title}\n${doc.content.slice(0, 240)}…`).join("\n\n")
}

function citationFrom(doc: RankedDocument, index: number): Citation {
  return {
    id: `cite_${index + 1}`,
    documentId: doc.id,
    title: doc.title,
    url: doc.url,
    tier: doc.tier,
    snippet: doc.content.slice(0, 160),
  }
}

export class ResearchEngine {
  private readonly sources: ResearchSource[]
  private readonly cache: ResearchCache
  private readonly budget: ResearchBudget
  private readonly synthesize: Synthesizer
  private readonly now: () => number

  constructor(cfg: ResearchEngineConfig) {
    this.sources = cfg.sources
    this.cache = cfg.cache instanceof ResearchCache ? cfg.cache : new ResearchCache(cfg.cache)
    this.budget = new ResearchBudget(cfg.budget)
    this.synthesize = cfg.synthesize ?? defaultSynthesizer
    this.now = cfg.now ?? (() => Date.now())
  }

  budgetSnapshot() {
    return this.budget.snapshot()
  }

  async ask(query: Query): Promise<ResearchAnswer> {
    const started = performance.now()
    const documents: RankedDocument[] = []
    let fromCache = true
    const collected: RankedDocument[] = []
    for (const source of this.sources) {
      if (query.tiers && !query.tiers.includes(source.tier)) continue
      const cached = this.cache.get(query.text, source.tier, this.now())
      if (cached) {
        collected.push(...rankDocuments(query, cached, { now: this.now() }))
        continue
      }
      this.budget.consume()
      fromCache = false
      const fetched = await source.search(query)
      this.cache.set(query.text, source.tier, fetched)
      collected.push(...rankDocuments(query, fetched, { now: this.now() }))
    }
    documents.push(...collected)
    const ranked = rankDocuments(query, documents, {
      now: this.now(),
      limit: query.limit ?? 5,
      minScore: query.minScore,
    })
    if (ranked.length === 0) throw new NoResultsError(query.text)
    const summary = await this.synthesize(query, ranked)
    const citations = ranked.map(citationFrom)
    return {
      query: query.text,
      summary: typeof summary === "string" ? summary : String(summary),
      citations,
      fromCache,
      durationMs: performance.now() - started,
    }
  }
}
