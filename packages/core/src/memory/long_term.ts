import { cosineSimilarity, type Embedder } from "./embedding.ts"
import type { MemoryItem, MemoryKind, RecallHit, RecallQuery, SearchQuery } from "./types.ts"

export interface LongTermMemory {
  write(item: MemoryItem): Promise<void>
  get(id: string): Promise<MemoryItem | null>
  list(): Promise<MemoryItem[]>
  recall(query: RecallQuery): Promise<RecallHit[]>
  search(query: SearchQuery): Promise<MemoryItem[]>
  prune(opts: PruneOptions): Promise<string[]>
  delete(id: string): Promise<void>
}

export interface PruneOptions {
  maxAgeMs: number
  now?: number
}

export interface InMemoryLongTermConfig {
  embedder: Embedder
}

function matchTags(item: MemoryItem, tags?: string[]): boolean {
  if (!tags || tags.length === 0) return true
  return tags.every((t) => item.tags.includes(t))
}

function matchKind(item: MemoryItem, kinds?: MemoryKind[]): boolean {
  if (!kinds || kinds.length === 0) return true
  return kinds.includes(item.kind)
}

export class InMemoryLongTerm implements LongTermMemory {
  private items = new Map<string, MemoryItem>()
  private readonly embedder: Embedder

  constructor(cfg: InMemoryLongTermConfig) {
    this.embedder = cfg.embedder
  }

  async write(item: MemoryItem): Promise<void> {
    const embedding = item.embedding ?? (await this.embedder.embed(item.content))
    this.items.set(item.id, { ...item, embedding })
  }

  async get(id: string): Promise<MemoryItem | null> {
    const it = this.items.get(id)
    return it ? { ...it } : null
  }

  async list(): Promise<MemoryItem[]> {
    return [...this.items.values()].map((i) => ({ ...i }))
  }

  async recall(query: RecallQuery): Promise<RecallHit[]> {
    const queryVec = await this.embedder.embed(query.text)
    const minScore = query.minScore ?? 0
    const hits: RecallHit[] = []
    for (const item of this.items.values()) {
      if (!matchTags(item, query.tags)) continue
      if (!matchKind(item, query.kinds)) continue
      if (!item.embedding) continue
      const score = cosineSimilarity(queryVec, item.embedding)
      if (score < minScore) continue
      hits.push({ item: { ...item }, score })
    }
    hits.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    return hits.slice(0, query.limit ?? 10)
  }

  async search(query: SearchQuery): Promise<MemoryItem[]> {
    const text = query.text?.toLowerCase()
    const since = query.since ?? 0
    const out: MemoryItem[] = []
    for (const item of this.items.values()) {
      if (!matchTags(item, query.tags)) continue
      if (!matchKind(item, query.kinds)) continue
      if (item.createdAt < since) continue
      if (text && !item.content.toLowerCase().includes(text)) continue
      out.push({ ...item })
    }
    out.sort((a, b) => b.createdAt - a.createdAt)
    return out.slice(0, query.limit ?? 100)
  }

  async prune(opts: PruneOptions): Promise<string[]> {
    const now = opts.now ?? Date.now()
    const cutoff = now - opts.maxAgeMs
    const removed: string[] = []
    for (const [id, item] of this.items) {
      if (item.pinned) continue
      if (item.lastUsedAt < cutoff) {
        this.items.delete(id)
        removed.push(id)
      }
    }
    return removed
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id)
  }
}
