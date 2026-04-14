import type { ContextItem } from "../context/types.ts"
import type { Embedder } from "./embedding.ts"
import type { EpisodeQuery, EpisodicMemory } from "./episodic.ts"
import type { LongTermMemory } from "./long_term.ts"
import type { ShortTermMemory } from "./short_term.ts"
import type { Episode, MemoryItem, MemoryKind, RecallHit } from "./types.ts"

export interface MemoryServiceConfig {
  shortTerm: ShortTermMemory
  longTerm: LongTermMemory
  episodic: EpisodicMemory
  embedder: Embedder
}

export interface WriteRequest {
  tier: "short" | "long"
  sessionId?: string
  content: string
  kind?: MemoryKind
  tags?: string[]
  meta?: Record<string, string>
  pinned?: boolean
  id?: string
  at?: number
  ttlMs?: number
}

export interface RecallRequest {
  text: string
  sessionId?: string
  tags?: string[]
  kinds?: MemoryKind[]
  limit?: number
  minScore?: number
}

export interface SearchRequest {
  text?: string
  sessionId?: string
  tags?: string[]
  kinds?: MemoryKind[]
  limit?: number
  since?: number
}

export interface InjectRequest {
  text: string
  sessionId?: string
  tags?: string[]
  limit?: number
  minScore?: number
}

export interface PruneRequest {
  maxAgeMs: number
  now?: number
}

export interface PruneResult {
  longTerm: string[]
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

export class MemoryService {
  constructor(private readonly cfg: MemoryServiceConfig) {}

  async write(req: WriteRequest): Promise<MemoryItem> {
    const now = req.at ?? Date.now()
    const item: MemoryItem = {
      id: req.id ?? nextId("mem"),
      kind: req.kind ?? "fragment",
      content: req.content,
      tags: req.tags ?? [],
      meta: req.meta,
      pinned: req.pinned,
      createdAt: now,
      lastUsedAt: now,
      useCount: 0,
    }
    if (req.tier === "short") {
      if (!req.sessionId) throw new Error("memory.write: sessionId required for short-term")
      await this.cfg.shortTerm.put(req.sessionId, item, req.ttlMs)
    } else {
      const embedding = await this.cfg.embedder.embed(item.content)
      await this.cfg.longTerm.write({ ...item, embedding })
    }
    return item
  }

  async recall(req: RecallRequest): Promise<RecallHit[]> {
    const hits: RecallHit[] = []
    const long = await this.cfg.longTerm.recall({
      text: req.text,
      tags: req.tags,
      kinds: req.kinds,
      limit: req.limit,
      minScore: req.minScore,
    })
    hits.push(...long)
    if (req.sessionId) {
      const liveShort = await this.cfg.shortTerm.list(req.sessionId)
      const queryVec = await this.cfg.embedder.embed(req.text)
      for (const item of liveShort) {
        if (req.tags && !req.tags.every((t) => item.tags.includes(t))) continue
        const emb = item.embedding ?? (await this.cfg.embedder.embed(item.content))
        const score = dot(queryVec, emb)
        if ((req.minScore ?? 0) > score) continue
        hits.push({ item: { ...item, embedding: emb }, score })
      }
      hits.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    }
    return hits.slice(0, req.limit ?? 10)
  }

  async search(req: SearchRequest): Promise<MemoryItem[]> {
    const out = await this.cfg.longTerm.search({
      text: req.text,
      tags: req.tags,
      kinds: req.kinds,
      limit: req.limit,
      since: req.since,
    })
    if (req.sessionId) {
      const live = await this.cfg.shortTerm.list(req.sessionId)
      const needle = req.text?.toLowerCase()
      for (const item of live) {
        if (needle && !item.content.toLowerCase().includes(needle)) continue
        if (req.tags && !req.tags.every((t) => item.tags.includes(t))) continue
        out.push(item)
      }
    }
    return out
  }

  async inject(req: InjectRequest): Promise<ContextItem[]> {
    const hits = await this.recall({
      text: req.text,
      sessionId: req.sessionId,
      tags: req.tags,
      limit: req.limit,
      minScore: req.minScore,
    })
    return hits.map<ContextItem>(({ item, score }) => ({
      id: item.id,
      sourceId: "memory",
      kind: "memory",
      content: item.content,
      score,
      meta: item.meta,
    }))
  }

  async recordEpisode(ep: Episode): Promise<void> {
    await this.cfg.episodic.append(ep)
  }

  async episodes(query: EpisodeQuery): Promise<Episode[]> {
    return this.cfg.episodic.query(query)
  }

  async prune(req: PruneRequest): Promise<PruneResult> {
    const longTerm = await this.cfg.longTerm.prune({
      maxAgeMs: req.maxAgeMs,
      now: req.now,
    })
    return { longTerm }
  }

  async flush(): Promise<void> {
    // in-memory impls are eager; hook for persistent backends
  }
}

function dot(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < len; i++) sum += (a[i] ?? 0) * (b[i] ?? 0)
  let na = 0
  let nb = 0
  for (let i = 0; i < len; i++) {
    na += (a[i] ?? 0) ** 2
    nb += (b[i] ?? 0) ** 2
  }
  if (na === 0 || nb === 0) return 0
  return sum / (Math.sqrt(na) * Math.sqrt(nb))
}
