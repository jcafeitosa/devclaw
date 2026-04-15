import { Database } from "bun:sqlite"

import { CapsuleImportError, CapsuleNotFoundError } from "./errors.ts"
import type { Capsule, CapsuleFeedback, CapsuleType } from "./types.ts"

export interface CapsuleSearchQuery {
  text?: string
  domain?: string
  type?: CapsuleType
  tags?: string[]
  minScore?: number
  limit?: number
}

export interface CapsuleStoreConfig {
  sqlitePath?: string
}

function matchesQuery(capsule: Capsule, q: CapsuleSearchQuery): boolean {
  if (q.type && capsule.type !== q.type) return false
  if (q.domain && capsule.domain !== q.domain) return false
  const tags = capsule.type === "individual" ? capsule.metadata.tags : []
  if (q.tags && !q.tags.every((t) => tags.includes(t))) return false
  if (q.minScore !== undefined) {
    const score = capsule.feedback.averageScore ?? 0
    if (score < q.minScore) return false
  }
  if (q.text) {
    const needle = q.text.toLowerCase()
    const haystack =
      capsule.type === "individual"
        ? `${capsule.triplet.instinct} ${capsule.triplet.experience} ${capsule.triplet.skill}`
        : capsule.lessons.join(" ")
    if (!haystack.toLowerCase().includes(needle)) return false
  }
  return true
}

export class CapsuleStore {
  private readonly capsules = new Map<string, Capsule>()
  private readonly sqlite: Database | null

  constructor(cfg: CapsuleStoreConfig = {}) {
    this.sqlite = openStore(cfg.sqlitePath)
    if (!this.sqlite) return
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS learning_capsules (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL
      )
    `)
  }

  register(capsule: Capsule): Capsule {
    this.write(capsule)
    this.capsules.set(capsule.id, capsule)
    return capsule
  }

  get(id: string): Capsule {
    const persisted = this.read(id)
    if (persisted) return persisted
    const c = this.capsules.get(id)
    if (!c) throw new CapsuleNotFoundError(id)
    return c
  }

  delete(id: string): void {
    this.sqlite?.query("DELETE FROM learning_capsules WHERE id = ?").run(id)
    this.capsules.delete(id)
  }

  list(): Capsule[] {
    if (this.sqlite) return this.all()
    return [...this.capsules.values()]
  }

  search(query: CapsuleSearchQuery): Capsule[] {
    const out = this.list().filter((c) => matchesQuery(c, query))
    out.sort((a, b) => (b.feedback.averageScore ?? 0) - (a.feedback.averageScore ?? 0))
    return out.slice(0, query.limit ?? 20)
  }

  updateFeedback(id: string, update: (f: CapsuleFeedback) => CapsuleFeedback): Capsule {
    const capsule = this.get(id)
    capsule.feedback = update(capsule.feedback)
    capsule.updatedAt = Date.now()
    this.write(capsule)
    return capsule
  }

  exportJson(id: string): string {
    return JSON.stringify(this.get(id), null, 2)
  }

  importJson(text: string): Capsule {
    try {
      const parsed = JSON.parse(text) as Capsule
      if (!parsed?.id || !parsed.type) {
        throw new Error("missing id or type")
      }
      return this.register(parsed)
    } catch (err) {
      throw new CapsuleImportError(err)
    }
  }

  private all(): Capsule[] {
    if (!this.sqlite) return [...this.capsules.values()]
    const rows = this.sqlite.query("SELECT payload FROM learning_capsules").all() as Array<{
      payload: string
    }>
    this.capsules.clear()
    const out = rows.map((row) => parsePayload<Capsule>(row.payload))
    for (const capsule of out) this.capsules.set(capsule.id, capsule)
    return out
  }

  private read(id: string): Capsule | null {
    if (!this.sqlite) return null
    const row = this.sqlite.query("SELECT payload FROM learning_capsules WHERE id = ?").get(id) as {
      payload: string
    } | null
    if (!row) return null
    const capsule = parsePayload<Capsule>(row.payload)
    this.capsules.set(capsule.id, capsule)
    return capsule
  }

  private write(capsule: Capsule): void {
    if (!this.sqlite) return
    this.sqlite
      .query("INSERT OR REPLACE INTO learning_capsules (id, payload) VALUES (?, ?)")
      .run(capsule.id, JSON.stringify(capsule))
  }
}

function openStore(path?: string): Database | null {
  if (!path) return null
  try {
    return new Database(path, { create: true })
  } catch {
    return null
  }
}

function parsePayload<T>(payload: string): T {
  return JSON.parse(payload) as T
}
