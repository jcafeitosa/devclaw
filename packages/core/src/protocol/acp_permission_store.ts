import { Database } from "bun:sqlite"

import type { ACPPermissionRequest } from "./acp_types.ts"

export interface ACPPendingPermission {
  requestId: number
  sessionId: string
  request: ACPPermissionRequest
  createdAt: number
}

export interface ACPPermissionRequestStoreConfig {
  sqlitePath?: string
}

export interface ACPPermissionRequestQuery {
  sessionId?: string
}

export class ACPPermissionRequestStore {
  private readonly items = new Map<number, ACPPendingPermission>()
  private readonly sqlite: Database | null

  constructor(cfg: ACPPermissionRequestStoreConfig = {}) {
    this.sqlite = openStore(cfg.sqlitePath)
    if (!this.sqlite) return
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS acp_pending_permissions (
        request_id INTEGER PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        payload TEXT NOT NULL
      )
    `)
  }

  async save(item: ACPPendingPermission): Promise<void> {
    if (this.sqlite) {
      this.sqlite
        .query(
          "INSERT OR REPLACE INTO acp_pending_permissions (request_id, session_id, payload) VALUES (?, ?, ?)",
        )
        .run(item.requestId, item.sessionId, JSON.stringify(item))
    }
    this.items.set(item.requestId, cloneItem(item))
  }

  async delete(requestId: number): Promise<void> {
    this.sqlite?.query("DELETE FROM acp_pending_permissions WHERE request_id = ?").run(requestId)
    this.items.delete(requestId)
  }

  async list(query: ACPPermissionRequestQuery = {}): Promise<ACPPendingPermission[]> {
    if (this.sqlite) return this.all(query)
    return [...this.items.values()]
      .filter((item) => (query.sessionId ? item.sessionId === query.sessionId : true))
      .map(cloneItem)
      .sort((a, b) => a.requestId - b.requestId)
  }

  private all(query: ACPPermissionRequestQuery): ACPPendingPermission[] {
    if (!this.sqlite) return []
    const rows = query.sessionId
      ? (this.sqlite
          .query(
            "SELECT payload FROM acp_pending_permissions WHERE session_id = ? ORDER BY request_id ASC",
          )
          .all(query.sessionId) as Array<{ payload: string }>)
      : (this.sqlite
          .query("SELECT payload FROM acp_pending_permissions ORDER BY request_id ASC")
          .all() as Array<{
          payload: string
        }>)
    this.items.clear()
    const out = rows.map((row) => JSON.parse(row.payload) as ACPPendingPermission)
    for (const item of out) this.items.set(item.requestId, item)
    return out.map(cloneItem)
  }
}

function cloneItem(item: ACPPendingPermission): ACPPendingPermission {
  return {
    requestId: item.requestId,
    sessionId: item.sessionId,
    request: { ...item.request, input: item.request.input },
    createdAt: item.createdAt,
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
