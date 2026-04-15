import type { BlobAdapter } from "./blob.ts"
import type { QueueAdapter } from "./queue.ts"
import type { StorageAdapter } from "./storage.ts"
import type { VectorAdapter } from "./vector.ts"

export interface AdapterMap {
  storage: StorageAdapter
  vector: VectorAdapter
  queue: QueueAdapter
  blob: BlobAdapter
}

export type AdapterDomain = keyof AdapterMap

export class AdapterRegistry {
  private readonly map = new Map<AdapterDomain, AdapterMap[AdapterDomain]>()

  register<K extends AdapterDomain>(domain: K, adapter: AdapterMap[K]): this {
    this.map.set(domain, adapter)
    return this
  }

  has(domain: AdapterDomain): boolean {
    return this.map.has(domain)
  }

  get<K extends AdapterDomain>(domain: K): AdapterMap[K] {
    const adapter = this.map.get(domain)
    if (!adapter) throw new Error(`adapter not registered: ${domain}`)
    return adapter as AdapterMap[K]
  }
}

export const adapters = new AdapterRegistry()
