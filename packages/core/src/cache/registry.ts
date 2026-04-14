import { LruTtlCache } from "./lru.ts"
import type { Cache, CacheStats } from "./types.ts"

export const DEFAULT_LAYERS = ["prefix", "response", "embedding", "retrieval", "tool"] as const

export type DefaultLayerName = (typeof DEFAULT_LAYERS)[number]

export interface CacheRegistryConfig {
  defaults?: Partial<Record<DefaultLayerName, Cache>>
  defaultMaxEntries?: number
  defaultTtlMs?: number
}

export class CacheRegistry {
  private readonly layers = new Map<string, Cache>()

  constructor(cfg: CacheRegistryConfig = {}) {
    const max = cfg.defaultMaxEntries ?? 1000
    const ttl = cfg.defaultTtlMs ?? 0
    for (const name of DEFAULT_LAYERS) {
      const provided = cfg.defaults?.[name]
      this.layers.set(name, provided ?? new LruTtlCache({ maxEntries: max, defaultTtlMs: ttl }))
    }
  }

  register(name: string, cache: Cache): void {
    this.layers.set(name, cache)
  }

  get<V = unknown>(name: string): Cache<V> {
    const layer = this.layers.get(name)
    if (!layer) throw new Error(`no cache layer: ${name}`)
    return layer as Cache<V>
  }

  list(): string[] {
    return [...this.layers.keys()]
  }

  totalStats(): CacheStats {
    let hits = 0
    let misses = 0
    let size = 0
    for (const layer of this.layers.values()) {
      const s = layer.stats()
      hits += s.hits
      misses += s.misses
      size += s.size
    }
    const total = hits + misses
    return { hits, misses, size, hitRate: total === 0 ? 0 : hits / total }
  }
}
