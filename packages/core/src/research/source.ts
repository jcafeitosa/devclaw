import { SourceFailedError } from "./errors.ts"
import type { Document, Query, SourceTier } from "./types.ts"

export interface ResearchSource {
  readonly id: string
  readonly tier: SourceTier
  search(query: Query): Promise<Document[]>
}

export interface StaticSourceConfig {
  id: string
  tier: SourceTier
  documents: Document[]
  matcher?: (doc: Document, query: Query) => boolean
}

function defaultMatcher(doc: Document, query: Query): boolean {
  const needle = query.text.toLowerCase()
  return (
    doc.content.toLowerCase().includes(needle) ||
    doc.title.toLowerCase().includes(needle) ||
    (doc.tags?.some((t) => needle.includes(t.toLowerCase())) ?? false)
  )
}

export class StaticSource implements ResearchSource {
  readonly id: string
  readonly tier: SourceTier
  private readonly documents: Document[]
  private readonly matcher: (doc: Document, q: Query) => boolean

  constructor(cfg: StaticSourceConfig) {
    this.id = cfg.id
    this.tier = cfg.tier
    this.documents = cfg.documents
    this.matcher = cfg.matcher ?? defaultMatcher
  }

  async search(query: Query): Promise<Document[]> {
    return this.documents.filter((d) => this.matcher(d, query))
  }
}

export interface HttpSourceConfig {
  id: string
  tier: SourceTier
  fetch: (query: Query) => Promise<Document[]>
}

export class HttpSource implements ResearchSource {
  readonly id: string
  readonly tier: SourceTier
  private readonly fetcher: (q: Query) => Promise<Document[]>

  constructor(cfg: HttpSourceConfig) {
    this.id = cfg.id
    this.tier = cfg.tier
    this.fetcher = cfg.fetch
  }

  async search(query: Query): Promise<Document[]> {
    try {
      return await this.fetcher(query)
    } catch (err) {
      throw new SourceFailedError(this.id, err)
    }
  }
}

export interface AggregateSourceConfig {
  id: string
  tier: SourceTier
  children: ResearchSource[]
  continueOnError?: boolean
}

export interface AggregateResult {
  documents: Document[]
  errors: Array<{ sourceId: string; error: string }>
}

export class AggregateSource {
  readonly id: string
  readonly tier: SourceTier
  private readonly children: ResearchSource[]
  private readonly continueOnError: boolean

  constructor(cfg: AggregateSourceConfig) {
    this.id = cfg.id
    this.tier = cfg.tier
    this.children = cfg.children
    this.continueOnError = cfg.continueOnError ?? true
  }

  async search(query: Query): Promise<AggregateResult> {
    const documents: Document[] = []
    const errors: Array<{ sourceId: string; error: string }> = []
    for (const child of this.children) {
      try {
        documents.push(...(await child.search(query)))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ sourceId: child.id, error: message })
        if (!this.continueOnError) throw err
      }
    }
    return { documents, errors }
  }
}
