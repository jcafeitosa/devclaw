import { MemoryVectorAdapter, type VectorAdapter, type VectorFilter } from "../adapter/vector.ts"
import type { Embedder } from "./embedding.ts"
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
  vector?: VectorAdapter
}

function matchTags(item: MemoryItem, tags?: string[]): boolean {
  if (!tags || tags.length === 0) return true
  return tags.every((t) => item.tags.includes(t))
}

function matchKind(item: MemoryItem, kinds?: MemoryKind[]): boolean {
  if (!kinds || kinds.length === 0) return true
  return kinds.includes(item.kind)
}

function vectorMetadata(item: MemoryItem): Record<string, unknown> {
  return {
    kind: item.kind,
    tags: [...item.tags],
    content: item.content,
    meta: item.meta ? { ...item.meta } : undefined,
    pinned: item.pinned ?? false,
    createdAt: item.createdAt,
    lastUsedAt: item.lastUsedAt,
    useCount: item.useCount,
    embedding: item.embedding ? [...item.embedding] : undefined,
  }
}

function hydrateItem(id: string, metadata?: Record<string, unknown>): MemoryItem | null {
  if (!metadata) return null
  const kind = typeof metadata.kind === "string" ? metadata.kind : null
  const content = typeof metadata.content === "string" ? metadata.content : null
  const tags = arrayOfStrings(metadata.tags)
  const createdAt = typeof metadata.createdAt === "number" ? metadata.createdAt : null
  const lastUsedAt = typeof metadata.lastUsedAt === "number" ? metadata.lastUsedAt : null
  const useCount = typeof metadata.useCount === "number" ? metadata.useCount : null
  if (
    !kind ||
    !content ||
    !tags ||
    createdAt === null ||
    lastUsedAt === null ||
    useCount === null
  ) {
    return null
  }
  return {
    id,
    kind: kind as MemoryKind,
    content,
    tags,
    meta: recordOfStrings(metadata.meta),
    pinned: Boolean(metadata.pinned),
    createdAt,
    lastUsedAt,
    useCount,
    embedding: arrayOfNumbers(metadata.embedding),
  }
}

function buildVectorFilter(query: RecallQuery): VectorFilter | undefined {
  const filter: VectorFilter = {}
  if (query.tags && query.tags.length > 0) filter.tags = query.tags
  if (query.kinds && query.kinds.length === 1) filter.kind = query.kinds[0]
  return Object.keys(filter).length > 0 ? filter : undefined
}

function arrayOfStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string") return null
    out.push(item)
  }
  return out
}

function arrayOfNumbers(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: number[] = []
  for (const item of value) {
    if (typeof item !== "number") return undefined
    out.push(item)
  }
  return out
}

function recordOfStrings(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string") return undefined
    out[key] = entry
  }
  return out
}

export class InMemoryLongTerm implements LongTermMemory {
  private items = new Map<string, MemoryItem>()
  private readonly embedder: Embedder
  private readonly vector: VectorAdapter

  constructor(cfg: InMemoryLongTermConfig) {
    this.embedder = cfg.embedder
    this.vector = cfg.vector ?? new MemoryVectorAdapter()
  }

  async write(item: MemoryItem): Promise<void> {
    const embedding = item.embedding ?? (await this.embedder.embed(item.content))
    const stored = { ...item, embedding }
    this.items.set(item.id, stored)
    await this.vector.upsert([
      {
        id: stored.id,
        vector: Float32Array.from(embedding),
        metadata: vectorMetadata(stored),
      },
    ])
  }

  async get(id: string): Promise<MemoryItem | null> {
    const it = this.items.get(id)
    return it ? { ...it } : null
  }

  async list(): Promise<MemoryItem[]> {
    return [...this.items.values()].map((i) => ({ ...i }))
  }

  async recall(query: RecallQuery): Promise<RecallHit[]> {
    const queryVec = Float32Array.from(await this.embedder.embed(query.text))
    const minScore = query.minScore ?? 0
    const ranked = await this.vector.query(queryVec, {
      topK: Math.max((query.limit ?? 10) * 4, 8),
      filter: buildVectorFilter(query),
    })
    const hits: RecallHit[] = []
    for (const hit of ranked) {
      const item = this.items.get(hit.id) ?? hydrateItem(hit.id, hit.metadata)
      if (!item) continue
      if (!matchTags(item, query.tags)) continue
      if (!matchKind(item, query.kinds)) continue
      if (hit.score < minScore) continue
      if (!this.items.has(item.id)) this.items.set(item.id, item)
      hits.push({ item: { ...item }, score: hit.score })
    }
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
        await this.vector.delete([id])
        removed.push(id)
      }
    }
    return removed
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id)
    await this.vector.delete([id])
  }
}
