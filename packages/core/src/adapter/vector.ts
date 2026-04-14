import { Database } from "bun:sqlite"

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

export interface SqliteVectorAdapterConfig {
  sqlitePath?: string
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

function matchesFilter(
  metadata: Record<string, unknown> | undefined,
  filter?: VectorFilter,
): boolean {
  if (!filter) return true
  return Object.entries(filter).every(([key, value]) => matchValue(metadata?.[key], value))
}

function cloneMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>
}

function serializeVector(vector: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(vector.length * 4)
  const view = new DataView(buffer)
  for (let i = 0; i < vector.length; i++) {
    view.setFloat32(i * 4, vector[i] ?? 0, true)
  }
  return new Uint8Array(buffer)
}

function parseVector(blob: unknown): Float32Array {
  const bytes = normalizeBytes(blob)
  const out = new Float32Array(bytes.byteLength / 4)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = 0; i < out.length; i++) {
    out[i] = view.getFloat32(i * 4, true)
  }
  return out
}

function parseMetadata(text: string | null): Record<string, unknown> | undefined {
  if (!text) return undefined
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined
  return parsed as Record<string, unknown>
}

function normalizeBytes(blob: unknown): Uint8Array {
  if (blob instanceof Uint8Array) return blob
  if (blob instanceof ArrayBuffer) return new Uint8Array(blob)
  if (ArrayBuffer.isView(blob)) {
    const view = blob as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  if (typeof blob === "string") {
    return new TextEncoder().encode(blob)
  }
  return new Uint8Array(0)
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

function extractKind(metadata?: Record<string, unknown>): string {
  const kind = metadata?.kind
  return typeof kind === "string" && kind.length > 0 ? kind : "memory"
}

function extractTags(metadata?: Record<string, unknown>): string[] {
  const tags = metadata?.tags
  if (!Array.isArray(tags)) return []
  const out: string[] = []
  for (const tag of tags) {
    if (typeof tag === "string" && tag.length > 0) out.push(tag)
  }
  return out
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  if (a.size > b.size) return intersect(b, a)
  const out = new Set<string>()
  for (const value of a) {
    if (b.has(value)) out.add(value)
  }
  return out
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key)
  if (!set) {
    set = new Set<string>()
    map.set(key, set)
  }
  set.add(value)
}

function removeFromSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key)
  if (!set) return
  set.delete(value)
  if (set.size === 0) map.delete(key)
}

export class MemoryVectorAdapter implements VectorAdapter {
  readonly kind = "memory" as const
  private readonly items = new Map<string, Entry>()
  private readonly kindIndex = new Map<string, Set<string>>()
  private readonly tagIndex = new Map<string, Set<string>>()

  async upsert(items: VectorRecord[]): Promise<void> {
    for (const item of items) {
      const existing = this.items.get(item.id)
      if (existing) this.removeIndexes(item.id, existing.metadata)
      this.items.set(item.id, {
        vector: new Float32Array(item.vector),
        metadata: cloneMetadata(item.metadata),
      })
      this.addIndexes(item.id, item.metadata)
    }
  }

  async query(vector: Float32Array, opts: VectorQueryOptions): Promise<VectorHit[]> {
    const hits: VectorHit[] = []
    const candidates = this.candidateIds(opts.filter)
    for (const [id, item] of this.items) {
      if (candidates && !candidates.has(id)) continue
      if (!matchesFilter(item.metadata, opts.filter)) continue
      hits.push({
        id,
        score: cosine(vector, item.vector),
        metadata: cloneMetadata(item.metadata),
      })
    }
    hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    return hits.slice(0, opts.topK)
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      const existing = this.items.get(id)
      if (existing) this.removeIndexes(id, existing.metadata)
      this.items.delete(id)
    }
  }

  async size(): Promise<number> {
    return this.items.size
  }

  private addIndexes(id: string, metadata?: Record<string, unknown>): void {
    addToSetMap(this.kindIndex, extractKind(metadata), id)
    for (const tag of extractTags(metadata)) addToSetMap(this.tagIndex, tag, id)
  }

  private removeIndexes(id: string, metadata?: Record<string, unknown>): void {
    removeFromSetMap(this.kindIndex, extractKind(metadata), id)
    for (const tag of extractTags(metadata)) removeFromSetMap(this.tagIndex, tag, id)
  }

  private candidateIds(filter?: VectorFilter): Set<string> | null {
    if (!filter) return null
    const candidates: Array<Set<string>> = []
    const kind = filter.kind
    if (typeof kind === "string" && kind.length > 0) {
      candidates.push(this.kindIndex.get(kind) ?? new Set())
    }
    const tags = arrayOfStrings(filter.tags)
    if (tags && tags.length > 0) {
      let tagCandidates: Set<string> | null = null
      for (const tag of tags) {
        const next = this.tagIndex.get(tag) ?? new Set()
        tagCandidates = tagCandidates ? intersect(tagCandidates, next) : new Set(next)
        if (tagCandidates.size === 0) break
      }
      if (tagCandidates) candidates.push(tagCandidates)
    }
    if (candidates.length === 0) return null
    let acc = candidates[0]!
    for (let i = 1; i < candidates.length; i++) {
      acc = intersect(acc, candidates[i]!)
      if (acc.size === 0) return acc
    }
    return acc
  }
}

export class SqliteVectorAdapter implements VectorAdapter {
  readonly kind = "sqlite-vec" as const
  private readonly sqlite: Database | null
  private readonly items = new Map<string, Entry>()

  constructor(cfg: SqliteVectorAdapterConfig = {}) {
    this.sqlite = openStore(cfg.sqlitePath)
    if (!this.sqlite) return
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS vector_records (
        id TEXT PRIMARY KEY NOT NULL,
        vector BLOB NOT NULL,
        metadata TEXT
      )
    `)
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS vector_record_kinds (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL
      )
    `)
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS vector_record_kinds_kind_idx
      ON vector_record_kinds(kind)
    `)
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS vector_record_tags (
        id TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (id, tag)
      )
    `)
    this.sqlite.exec(`
      CREATE INDEX IF NOT EXISTS vector_record_tags_tag_idx
      ON vector_record_tags(tag)
    `)
    this.hydrate()
  }

  async upsert(items: VectorRecord[]): Promise<void> {
    for (const item of items) {
      const entry: Entry = {
        vector: new Float32Array(item.vector),
        metadata: cloneMetadata(item.metadata),
      }
      this.items.set(item.id, entry)
      this.sqlite
        ?.query("INSERT OR REPLACE INTO vector_records (id, vector, metadata) VALUES (?, ?, ?)")
        .run(item.id, serializeVector(entry.vector), JSON.stringify(entry.metadata ?? null))
      this.sqlite
        ?.query("INSERT OR REPLACE INTO vector_record_kinds (id, kind) VALUES (?, ?)")
        .run(item.id, extractKind(entry.metadata))
      this.sqlite?.query("DELETE FROM vector_record_tags WHERE id = ?").run(item.id)
      const tags = extractTags(entry.metadata)
      if (tags.length > 0) {
        const stmt = this.sqlite?.query(
          "INSERT OR REPLACE INTO vector_record_tags (id, tag) VALUES (?, ?)",
        )
        if (stmt) {
          for (const tag of tags) stmt.run(item.id, tag)
        }
      }
    }
  }

  async query(vector: Float32Array, opts: VectorQueryOptions): Promise<VectorHit[]> {
    const hits: VectorHit[] = []
    const candidates = await this.candidateIds(opts.filter)
    for (const [id, item] of this.items) {
      if (candidates && !candidates.has(id)) continue
      if (!matchesFilter(item.metadata, opts.filter)) continue
      hits.push({
        id,
        score: cosine(vector, item.vector),
        metadata: cloneMetadata(item.metadata),
      })
    }
    hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    return hits.slice(0, opts.topK)
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.items.delete(id)
      this.sqlite?.query("DELETE FROM vector_records WHERE id = ?").run(id)
      this.sqlite?.query("DELETE FROM vector_record_kinds WHERE id = ?").run(id)
      this.sqlite?.query("DELETE FROM vector_record_tags WHERE id = ?").run(id)
    }
  }

  async size(): Promise<number> {
    return this.items.size
  }

  private hydrate(): void {
    if (!this.sqlite) return
    const rows = this.sqlite
      .query("SELECT id, vector, metadata FROM vector_records")
      .all() as Array<{
      id: string
      vector: unknown
      metadata: string | null
    }>
    this.items.clear()
    for (const row of rows) {
      this.items.set(row.id, {
        vector: parseVector(row.vector),
        metadata: parseMetadata(row.metadata),
      })
    }
  }

  private async candidateIds(filter?: VectorFilter): Promise<Set<string> | null> {
    if (!this.sqlite || !filter) return null

    const candidates: Array<Set<string>> = []
    const kind = filter.kind
    if (typeof kind === "string" && kind.length > 0) {
      const rows = this.sqlite
        .query("SELECT id FROM vector_record_kinds WHERE kind = ?")
        .all(kind) as Array<{
        id: string
      }>
      candidates.push(new Set(rows.map((row) => row.id)))
    }

    const tags = arrayOfStrings(filter.tags)
    if (tags && tags.length > 0) {
      const placeholders = tags.map(() => "?").join(", ")
      const rows = this.sqlite
        .query(
          `SELECT id FROM vector_record_tags WHERE tag IN (${placeholders}) GROUP BY id HAVING COUNT(DISTINCT tag) = ?`,
        )
        .all(...tags, tags.length) as Array<{ id: string }>
      candidates.push(new Set(rows.map((row) => row.id)))
    }

    if (candidates.length === 0) return null
    let acc = candidates[0]!
    for (let i = 1; i < candidates.length; i++) {
      acc = intersect(acc, candidates[i]!)
      if (acc.size === 0) return acc
    }
    return acc
  }
}

function openStore(path?: string): Database | null {
  try {
    return new Database(path ?? ":memory:", { create: true })
  } catch {
    return null
  }
}
