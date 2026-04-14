import { DEFAULT_TTL, type Document, type SourceTier } from "./types.ts"

interface CacheEntry {
  documents: Document[]
  storedAt: number
  tier: SourceTier
}

export interface ResearchCacheConfig {
  maxEntries?: number
  ttlByTier?: Partial<Record<SourceTier, number>>
}

export class ResearchCache {
  private readonly store = new Map<string, CacheEntry>()
  private readonly maxEntries: number
  private readonly ttl: Record<SourceTier, number>

  constructor(cfg: ResearchCacheConfig = {}) {
    this.maxEntries = cfg.maxEntries ?? 200
    this.ttl = { ...DEFAULT_TTL, ...(cfg.ttlByTier ?? {}) } as Record<SourceTier, number>
  }

  key(query: string, tier: SourceTier): string {
    return `${tier}::${query.toLowerCase().trim()}`
  }

  get(query: string, tier: SourceTier, now: number = Date.now()): Document[] | null {
    const key = this.key(query, tier)
    const entry = this.store.get(key)
    if (!entry) return null
    const ttl = this.ttl[tier]
    if (now - entry.storedAt > ttl) {
      this.store.delete(key)
      return null
    }
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.documents.map((d) => ({ ...d }))
  }

  set(query: string, tier: SourceTier, documents: Document[]): void {
    const key = this.key(query, tier)
    this.store.set(key, {
      documents: documents.map((d) => ({ ...d })),
      storedAt: Date.now(),
      tier,
    })
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value
      if (!oldest) break
      this.store.delete(oldest)
    }
  }

  invalidate(query?: string, tier?: SourceTier): void {
    if (!query && !tier) {
      this.store.clear()
      return
    }
    for (const key of [...this.store.keys()]) {
      if (query && !key.endsWith(`::${query.toLowerCase().trim()}`)) continue
      if (tier && !key.startsWith(`${tier}::`)) continue
      this.store.delete(key)
    }
  }

  size(): number {
    return this.store.size
  }
}
