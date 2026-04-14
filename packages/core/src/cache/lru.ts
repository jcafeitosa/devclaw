import type { Cache, CacheSetOptions, CacheStats } from "./types.ts"

interface Entry<V> {
  value: V
  expiresAt: number // 0 = no expiry
}

export interface LruTtlCacheConfig {
  maxEntries: number
  defaultTtlMs?: number
  now?: () => number
}

export class LruTtlCache<V = unknown> implements Cache<V> {
  private readonly map = new Map<string, Entry<V>>()
  private readonly maxEntries: number
  private readonly defaultTtlMs: number
  private readonly now: () => number
  private hits = 0
  private misses = 0

  constructor(cfg: LruTtlCacheConfig) {
    this.maxEntries = cfg.maxEntries
    this.defaultTtlMs = cfg.defaultTtlMs ?? 0
    this.now = cfg.now ?? Date.now
  }

  async get(key: string): Promise<V | undefined> {
    const entry = this.map.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }
    if (entry.expiresAt > 0 && this.now() >= entry.expiresAt) {
      this.map.delete(key)
      this.misses++
      return undefined
    }
    this.map.delete(key)
    this.map.set(key, entry)
    this.hits++
    return entry.value
  }

  async set(key: string, value: V, opts: CacheSetOptions = {}): Promise<void> {
    const ttlMs = opts.ttlMs ?? this.defaultTtlMs
    const expiresAt = ttlMs > 0 ? this.now() + ttlMs : 0
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, { value, expiresAt })
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = this.map.get(key)
    if (!entry) return false
    if (entry.expiresAt > 0 && this.now() >= entry.expiresAt) {
      this.map.delete(key)
      return false
    }
    return true
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key)
  }

  async clear(): Promise<void> {
    this.map.clear()
    this.hits = 0
    this.misses = 0
  }

  stats(): CacheStats {
    const total = this.hits + this.misses
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.map.size,
      hitRate: total === 0 ? 0 : this.hits / total,
    }
  }
}
