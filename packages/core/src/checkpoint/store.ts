import { Database } from "bun:sqlite"

import { CheckpointNotFoundError } from "./errors.ts"
import { type Checkpoint, DEFAULT_RETENTION, type RetentionPolicy } from "./types.ts"

export interface CheckpointStore {
  save(checkpoint: Checkpoint): Promise<void>
  get(id: string): Promise<Checkpoint>
  list(): Promise<Checkpoint[]>
  delete(id: string): Promise<void>
  prune(policy?: RetentionPolicy): Promise<{ cold: string[]; purged: string[] }>
}

export interface CheckpointStoreConfig {
  sqlitePath?: string
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly map = new Map<string, Checkpoint>()
  private readonly coldSet = new Set<string>()
  private readonly sqlite: Database | null

  constructor(cfg: CheckpointStoreConfig = {}) {
    this.sqlite = openStore(cfg.sqlitePath)
    if (!this.sqlite) return
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        is_cold INTEGER NOT NULL DEFAULT 0
      )
    `)
  }

  async save(checkpoint: Checkpoint): Promise<void> {
    if (this.sqlite) {
      const cold = this.coldSet.has(checkpoint.id) ? 1 : 0
      this.sqlite
        .query("INSERT OR REPLACE INTO checkpoints (id, payload, is_cold) VALUES (?, ?, ?)")
        .run(checkpoint.id, JSON.stringify(checkpoint), cold)
    }
    this.map.set(checkpoint.id, { ...checkpoint })
    this.coldSet.delete(checkpoint.id)
  }

  async get(id: string): Promise<Checkpoint> {
    const persisted = this.read(id)
    if (persisted) return persisted
    const c = this.map.get(id)
    if (!c) throw new CheckpointNotFoundError(id)
    return { ...c }
  }

  async list(): Promise<Checkpoint[]> {
    if (this.sqlite) return this.all()
    return [...this.map.values()].map((c) => ({ ...c })).sort((a, b) => b.createdAt - a.createdAt)
  }

  async delete(id: string): Promise<void> {
    this.sqlite?.query("DELETE FROM checkpoints WHERE id = ?").run(id)
    this.map.delete(id)
    this.coldSet.delete(id)
  }

  isCold(id: string): boolean {
    if (this.sqlite) return this.coldSet.has(id)
    return this.coldSet.has(id)
  }

  async prune(policy: RetentionPolicy = DEFAULT_RETENTION): Promise<{
    cold: string[]
    purged: string[]
  }> {
    if (this.sqlite) {
      this.map.clear()
      for (const item of await this.all()) this.map.set(item.id, item)
    }
    const rows = [...this.map.values()]
      .filter((c) => !(policy.pinnedAlwaysKept && c.pinned))
      .sort((a, b) => b.createdAt - a.createdAt)
    const cold: string[] = []
    const purged: string[] = []
    for (let i = 0; i < rows.length; i++) {
      const item = rows[i]!
      if (i < policy.hotLimit) {
        this.coldSet.delete(item.id)
        this.markCold(item.id, false)
        continue
      }
      if (i < policy.coldLimit) {
        if (!this.coldSet.has(item.id)) {
          this.coldSet.add(item.id)
          this.markCold(item.id, true)
          cold.push(item.id)
        }
        continue
      }
      this.map.delete(item.id)
      this.coldSet.delete(item.id)
      this.sqlite?.query("DELETE FROM checkpoints WHERE id = ?").run(item.id)
      purged.push(item.id)
    }
    return { cold, purged }
  }

  private all(): Checkpoint[] {
    if (!this.sqlite) return [...this.map.values()]
    const rows = this.sqlite.query("SELECT payload, is_cold FROM checkpoints").all() as Array<{
      payload: string
      is_cold: number
    }>
    this.map.clear()
    this.coldSet.clear()
    const out = rows.map((row) => {
      const checkpoint = parsePayload<Checkpoint>(row.payload)
      this.map.set(checkpoint.id, checkpoint)
      if (row.is_cold) this.coldSet.add(checkpoint.id)
      return checkpoint
    })
    return out.sort((a, b) => b.createdAt - a.createdAt)
  }

  private read(id: string): Checkpoint | null {
    if (!this.sqlite) return null
    const row = this.sqlite
      .query("SELECT payload, is_cold FROM checkpoints WHERE id = ?")
      .get(id) as { payload: string; is_cold: number } | null
    if (!row) return null
    const checkpoint = parsePayload<Checkpoint>(row.payload)
    this.map.set(checkpoint.id, checkpoint)
    if (row.is_cold) this.coldSet.add(checkpoint.id)
    return { ...checkpoint }
  }

  private markCold(id: string, cold: boolean): void {
    if (!this.sqlite) return
    this.sqlite.query("UPDATE checkpoints SET is_cold = ? WHERE id = ?").run(cold ? 1 : 0, id)
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
