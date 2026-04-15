import { Database } from "bun:sqlite"

import { WorkNotFoundError } from "./errors.ts"
import type { WorkItem, WorkKind } from "./types.ts"

export interface CreateWorkItemInput
  extends Omit<WorkItem, "id" | "createdAt" | "updatedAt" | "priority" | "status"> {
  id?: string
  priority?: WorkItem["priority"]
  status?: WorkItem["status"]
}

export type PatchWorkItem = Partial<Omit<WorkItem, "id" | "createdAt">>

export interface WorkItemStoreConfig {
  sqlitePath?: string
}

export class WorkItemStore {
  private readonly items = new Map<string, WorkItem>()
  private readonly sqlite: Database | null

  constructor(cfg: WorkItemStoreConfig = {}) {
    this.sqlite = openStore(cfg.sqlitePath)
    if (!this.sqlite) return
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL
      )
    `)
  }

  create(input: CreateWorkItemInput): WorkItem {
    const id = input.id ?? `wi_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    const now = Date.now()
    const item: WorkItem = {
      id,
      kind: input.kind,
      title: input.title,
      description: input.description,
      status: input.status ?? "backlog",
      priority: input.priority ?? "normal",
      parentId: input.parentId,
      owner: input.owner,
      assignees: input.assignees,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
      dueAt: input.dueAt,
      startAt: input.startAt,
      estimateMs: input.estimateMs,
      actualMs: input.actualMs,
      meta: input.meta,
    }
    this.write(item)
    this.items.set(id, item)
    return item
  }

  get(id: string): WorkItem {
    const persisted = this.read(id)
    if (persisted) return persisted
    const item = this.items.get(id)
    if (!item) throw new WorkNotFoundError(id)
    return item
  }

  patch(id: string, patch: PatchWorkItem): WorkItem {
    const current = this.get(id)
    const updated: WorkItem = { ...current, ...patch, id: current.id, updatedAt: Date.now() }
    this.write(updated)
    this.items.set(id, updated)
    return updated
  }

  delete(id: string): void {
    this.sqlite?.query("DELETE FROM work_items WHERE id = ?").run(id)
    this.items.delete(id)
  }

  list(): WorkItem[] {
    if (this.sqlite) return this.all()
    return [...this.items.values()]
  }

  byKind(kind: WorkKind): WorkItem[] {
    return this.list().filter((i) => i.kind === kind)
  }

  children(parentId: string): WorkItem[] {
    return this.list().filter((i) => i.parentId === parentId)
  }

  ancestors(id: string): WorkItem[] {
    const out: WorkItem[] = []
    let current = this.get(id).parentId
    const seen = new Set<string>()
    while (current && !seen.has(current)) {
      seen.add(current)
      const item = this.items.get(current)
      if (!item) break
      out.push(item)
      current = item.parentId
    }
    return out
  }

  descendants(id: string): WorkItem[] {
    const out: WorkItem[] = []
    const stack = [...this.children(id)]
    const seen = new Set<string>()
    while (stack.length > 0) {
      const item = stack.pop()
      if (!item || seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
      stack.push(...this.children(item.id))
    }
    return out
  }

  private read(id: string): WorkItem | null {
    if (!this.sqlite) return null
    const row = this.sqlite.query("SELECT payload FROM work_items WHERE id = ?").get(id) as {
      payload: string
    } | null
    if (!row) return null
    const item = parsePayload<WorkItem>(row.payload)
    this.items.set(item.id, item)
    return item
  }

  private all(): WorkItem[] {
    if (!this.sqlite) return [...this.items.values()]
    const rows = this.sqlite.query("SELECT payload FROM work_items").all() as Array<{
      payload: string
    }>
    const items = rows.map((row) => parsePayload<WorkItem>(row.payload))
    this.items.clear()
    for (const item of items) this.items.set(item.id, item)
    return items
  }

  private write(item: WorkItem): void {
    if (this.sqlite) {
      this.sqlite
        .query("INSERT OR REPLACE INTO work_items (id, payload) VALUES (?, ?)")
        .run(item.id, JSON.stringify(item))
    }
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
