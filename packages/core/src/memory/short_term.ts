import type { MemoryItem } from "./types.ts"

export interface ShortTermMemory {
  put(sessionId: string, item: MemoryItem, ttlMs?: number): Promise<void>
  get(sessionId: string, id: string): Promise<MemoryItem | null>
  list(sessionId: string): Promise<MemoryItem[]>
  clear(sessionId: string): Promise<void>
}

interface Entry {
  item: MemoryItem
  expiresAt: number
}

export interface InMemoryShortTermConfig {
  defaultTtlMs: number
}

export class InMemoryShortTerm implements ShortTermMemory {
  private sessions = new Map<string, Map<string, Entry>>()
  private readonly defaultTtlMs: number

  constructor(cfg: InMemoryShortTermConfig) {
    this.defaultTtlMs = cfg.defaultTtlMs
  }

  async put(sessionId: string, item: MemoryItem, ttlMs?: number): Promise<void> {
    const bucket = this.bucket(sessionId)
    bucket.set(item.id, {
      item: { ...item },
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    })
  }

  async get(sessionId: string, id: string): Promise<MemoryItem | null> {
    const bucket = this.sessions.get(sessionId)
    if (!bucket) return null
    const entry = bucket.get(id)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      bucket.delete(id)
      return null
    }
    entry.item.useCount += 1
    entry.item.lastUsedAt = Date.now()
    return { ...entry.item }
  }

  async list(sessionId: string): Promise<MemoryItem[]> {
    const bucket = this.sessions.get(sessionId)
    if (!bucket) return []
    const now = Date.now()
    const out: MemoryItem[] = []
    for (const [id, entry] of bucket) {
      if (entry.expiresAt <= now) {
        bucket.delete(id)
        continue
      }
      out.push({ ...entry.item })
    }
    return out
  }

  async clear(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  private bucket(sessionId: string): Map<string, Entry> {
    let b = this.sessions.get(sessionId)
    if (!b) {
      b = new Map()
      this.sessions.set(sessionId, b)
    }
    return b
  }
}
