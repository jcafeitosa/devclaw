export interface IdempotencyStore {
  acquire(key: string, ttlMs: number): Promise<boolean>
  getResult<T = unknown>(key: string): Promise<T | null>
  putResult(key: string, result: unknown, ttlMs: number): Promise<void>
}

interface Entry {
  value: unknown
  expiresAt: number
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private locks = new Map<string, number>()
  private results = new Map<string, Entry>()

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    const now = Date.now()
    const existing = this.locks.get(key)
    if (existing !== undefined && existing > now) return false
    this.locks.set(key, now + ttlMs)
    return true
  }

  async getResult<T>(key: string): Promise<T | null> {
    const entry = this.results.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.results.delete(key)
      return null
    }
    return entry.value as T
  }

  async putResult(key: string, result: unknown, ttlMs: number): Promise<void> {
    this.results.set(key, { value: result, expiresAt: Date.now() + ttlMs })
  }
}

export async function runIdempotent<T>(
  store: IdempotencyStore,
  key: string,
  fn: () => Promise<T>,
  ttlMs = 86_400_000,
): Promise<T> {
  const acquired = await store.acquire(key, ttlMs)
  if (!acquired) {
    const cached = await store.getResult<T>(key)
    if (cached !== null) return cached
    throw new Error(`idempotency: in-flight duplicate without cached result: ${key}`)
  }
  const result = await fn()
  await store.putResult(key, result, ttlMs)
  return result
}
