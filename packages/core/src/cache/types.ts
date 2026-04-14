export interface CacheStats {
  hits: number
  misses: number
  size: number
  hitRate: number
}

export interface CacheSetOptions {
  ttlMs?: number
}

export interface Cache<V = unknown> {
  get(key: string): Promise<V | undefined>
  set(key: string, value: V, opts?: CacheSetOptions): Promise<void>
  has(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  stats(): CacheStats
}
