import { Database } from "bun:sqlite"

import { InvalidLinkError, NotFoundError, ThreadClosedError } from "./errors.ts"
import type { Thread, ThreadLinks } from "./types.ts"

export interface CreateThreadInput {
  id?: string
  channelId: string
  title: string
  openedBy: string
  links: ThreadLinks
}

export interface ThreadStoreConfig {
  requiredLinks?: Array<keyof ThreadLinks>
  sqlitePath?: string
}

export class ThreadStore {
  private readonly threads = new Map<string, Thread>()
  private readonly required: Array<keyof ThreadLinks>
  private readonly sqlite: Database | null

  constructor(cfg: ThreadStoreConfig = {}) {
    this.required = cfg.requiredLinks ?? ["projectId"]
    this.sqlite = openStore(cfg.sqlitePath)
    if (!this.sqlite) return
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY NOT NULL,
        channel_id TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `)
  }

  create(input: CreateThreadInput): Thread {
    const missing: string[] = []
    for (const key of this.required) {
      const v = input.links[key]
      if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) {
        missing.push(key)
      }
    }
    if (missing.length > 0) throw new InvalidLinkError(missing)
    const id = input.id ?? `th_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    const thread: Thread = {
      id,
      channelId: input.channelId,
      title: input.title,
      openedBy: input.openedBy,
      links: { ...input.links },
      open: true,
      createdAt: Date.now(),
    }
    this.write(thread)
    this.threads.set(id, thread)
    return thread
  }

  get(id: string): Thread {
    const persisted = this.read(id)
    if (persisted) return persisted
    const t = this.threads.get(id)
    if (!t) throw new NotFoundError("thread", id)
    return t
  }

  listByChannel(channelId: string): Thread[] {
    if (this.sqlite) return this.all().filter((t) => t.channelId === channelId)
    return [...this.threads.values()].filter((t) => t.channelId === channelId)
  }

  close(id: string, actor: string, reason?: string): Thread {
    const thread = this.get(id)
    if (!thread.open) throw new ThreadClosedError(id)
    thread.open = false
    thread.closedAt = Date.now()
    thread.closedBy = actor
    thread.closedReason = reason
    this.write(thread)
    return thread
  }

  reopen(id: string): Thread {
    const thread = this.get(id)
    thread.open = true
    thread.closedAt = undefined
    thread.closedBy = undefined
    thread.closedReason = undefined
    this.write(thread)
    return thread
  }

  private all(): Thread[] {
    if (!this.sqlite) return [...this.threads.values()]
    const rows = this.sqlite.query("SELECT payload FROM threads").all() as Array<{
      payload: string
    }>
    this.threads.clear()
    const out = rows.map((row) => parsePayload<Thread>(row.payload))
    for (const thread of out) this.threads.set(thread.id, thread)
    return out
  }

  private read(id: string): Thread | null {
    if (!this.sqlite) return null
    const row = this.sqlite.query("SELECT payload FROM threads WHERE id = ?").get(id) as {
      payload: string
    } | null
    if (!row) return null
    const thread = parsePayload<Thread>(row.payload)
    this.threads.set(thread.id, thread)
    return thread
  }

  private write(thread: Thread): void {
    if (!this.sqlite) return
    this.sqlite
      .query("INSERT OR REPLACE INTO threads (id, channel_id, payload) VALUES (?, ?, ?)")
      .run(thread.id, thread.channelId, JSON.stringify(thread))
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
