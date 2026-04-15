import { Database } from "bun:sqlite"

import type { ACPSessionInfo } from "./acp_types.ts"

export interface ACPSessionStoreConfig {
  sqlitePath?: string
}

export class ACPSessionStore {
  private readonly sessions = new Map<string, ACPSessionInfo>()
  private readonly sqlite: Database | null

  constructor(cfg: ACPSessionStoreConfig = {}) {
    this.sqlite = openStore(cfg.sqlitePath)
    if (!this.sqlite) return
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS acp_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL
      )
    `)
  }

  async save(info: ACPSessionInfo): Promise<void> {
    if (this.sqlite) {
      this.sqlite
        .query("INSERT OR REPLACE INTO acp_sessions (id, payload) VALUES (?, ?)")
        .run(info.id, JSON.stringify(info))
    }
    this.sessions.set(info.id, { ...info })
  }

  async get(id: string): Promise<ACPSessionInfo | null> {
    const persisted = this.read(id)
    if (persisted) return persisted
    const info = this.sessions.get(id)
    return info ? { ...info } : null
  }

  async delete(id: string): Promise<boolean> {
    const existed = (await this.get(id)) !== null
    this.sqlite?.query("DELETE FROM acp_sessions WHERE id = ?").run(id)
    this.sessions.delete(id)
    return existed
  }

  async list(): Promise<ACPSessionInfo[]> {
    if (!this.sqlite) return [...this.sessions.values()].map((session) => ({ ...session }))
    const rows = this.sqlite.query("SELECT payload FROM acp_sessions").all() as Array<{
      payload: string
    }>
    this.sessions.clear()
    const out = rows.map((row) => JSON.parse(row.payload) as ACPSessionInfo)
    for (const session of out) this.sessions.set(session.id, session)
    return out
  }

  async close(): Promise<void> {
    this.sqlite?.close()
    this.sessions.clear()
  }

  private read(id: string): ACPSessionInfo | null {
    if (!this.sqlite) return null
    const row = this.sqlite.query("SELECT payload FROM acp_sessions WHERE id = ?").get(id) as {
      payload: string
    } | null
    if (!row) return null
    const info = JSON.parse(row.payload) as ACPSessionInfo
    this.sessions.set(info.id, info)
    return info
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
