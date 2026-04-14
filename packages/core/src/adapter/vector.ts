export type VectorKind = "pgvector" | "qdrant" | "memory" | "sqlite-vec"

export interface VectorRecord {
  id: string
  vector: Float32Array
  metadata?: Record<string, unknown>
}

export interface VectorHit {
  id: string
  score: number
  metadata?: Record<string, unknown>
}

export type VectorFilter = Record<string, unknown>

export interface VectorQueryOptions {
  topK: number
  filter?: VectorFilter
}

export interface VectorAdapter {
  readonly kind: VectorKind
  upsert(items: VectorRecord[]): Promise<void>
  query(vector: Float32Array, opts: VectorQueryOptions): Promise<VectorHit[]>
  delete(ids: string[]): Promise<void>
  size(): Promise<number>
}

interface Entry {
  vector: Float32Array
  metadata?: Record<string, unknown>
}

function cosine(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    dot += av * bv
    na += av * av
    nb += bv * bv
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function matchValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false
    return expected.every((value) => actual.includes(value))
  }
  return actual === expected
}

function matchesFilter(metadata: Record<string, unknown> | undefined, filter?: VectorFilter): boolean {
  if (!filter) return true
  return Object.entries(filter).every(([key, value]) => matchValue(metadata?.[key], value))
}

export class MemoryVectorAdapter implements VectorAdapter {
  readonly kind = "memory" as const
  private readonly items = new Map<string, Entry>()

  async upsert(items: VectorRecord[]): Promise<void> {
    for (const item of items) {
      this.items.set(item.id, {
        vector: new Float32Array(item.vector),
        metadata: item.metadata ? { ...item.metadata } : undefined,
      })
    }
  }

  async query(vector: Float32Array, opts: VectorQueryOptions): Promise<VectorHit[]> {
    const hits: VectorHit[] = []
    for (const [id, item] of this.items) {
      if (!matchesFilter(item.metadata, opts.filter)) continue
      hits.push({
        id,
        score: cosine(vector, item.vector),
        metadata: item.metadata ? { ...item.metadata } : undefined,
      })
    }
    hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    return hits.slice(0, opts.topK)
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) this.items.delete(id)
  }

  async size(): Promise<number> {
    return this.items.size
  }
}
