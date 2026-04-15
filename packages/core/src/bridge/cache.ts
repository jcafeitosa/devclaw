import { createHash } from "node:crypto"

import { LruTtlCache } from "../cache/lru.ts"
import type { CacheStats } from "../cache/types.ts"
import type { BridgeEvent, BridgeRequest } from "./types.ts"

export type BridgeCacheKeyInputs = Pick<BridgeRequest, "prompt" | "cli" | "cwd" | "model">

export function bridgeCacheKey(req: BridgeCacheKeyInputs, gitHead: string): string {
  const h = createHash("sha256")
  h.update(req.cli)
  h.update("\0")
  h.update(req.cwd)
  h.update("\0")
  h.update(gitHead)
  h.update("\0")
  h.update(req.model ?? "")
  h.update("\0")
  h.update(req.prompt)
  return h.digest("hex")
}

export interface BridgeOutputCacheConfig {
  maxEntries: number
  defaultTtlMs?: number
  now?: () => number
}

export class BridgeOutputCache {
  private readonly inner: LruTtlCache<BridgeEvent[]>

  constructor(cfg: BridgeOutputCacheConfig) {
    this.inner = new LruTtlCache<BridgeEvent[]>({
      maxEntries: cfg.maxEntries,
      defaultTtlMs: cfg.defaultTtlMs ?? 3_600_000,
      now: cfg.now,
    })
  }

  async get(key: string): Promise<BridgeEvent[] | null> {
    const hit = await this.inner.get(key)
    if (!hit) return null
    return hit.map((event) => ({ ...event }))
  }

  async set(key: string, events: readonly BridgeEvent[]): Promise<void> {
    await this.inner.set(
      key,
      events.map((event) => ({ ...event })),
    )
  }

  async delete(key: string): Promise<void> {
    await this.inner.delete(key)
  }

  async clear(): Promise<void> {
    await this.inner.clear()
  }

  stats(): CacheStats {
    return this.inner.stats()
  }
}
