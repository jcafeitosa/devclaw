import { Database } from "bun:sqlite"

export type StorageKind = "sqlite" | "postgres" | "memory"

export interface StorageExecResult {
  changes: number
  lastId?: string | number
}

export interface StorageAdapter {
  readonly kind: StorageKind
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<StorageExecResult>
  transaction<T>(fn: (tx: StorageAdapter) => Promise<T>): Promise<T>
  close(): Promise<void>
}

type Row = Record<string, unknown>
type SqliteParam = string | number | bigint | boolean | Uint8Array | null

interface TableState {
  columns: string[]
  rows: Row[]
}

type StorageState = Map<string, TableState>

function norm(sql: string): string {
  return sql.replace(/\s+/g, " ").trim()
}

function parseCreate(sql: string): { table: string; columns: string[] } | null {
  const match = /^CREATE TABLE(?: IF NOT EXISTS)? ([a-zA-Z_][\w]*) \((.+)\)$/i.exec(norm(sql))
  if (!match) return null
  const table = match[1]
  const rawCols = match[2]
  if (!table || !rawCols) return null
  const columns = rawCols
    .split(",")
    .map((part) => part.trim())
    .map((part) => /^"?([a-zA-Z_][\w]*)"?/.exec(part)?.[1] ?? "")
    .filter(Boolean)
  return { table, columns }
}

function parseInsert(sql: string): { table: string; columns: string[]; replace: boolean } | null {
  const match = /^INSERT( OR REPLACE)? INTO ([a-zA-Z_][\w]*) \((.+)\) VALUES \((.+)\)$/i.exec(
    norm(sql),
  )
  if (!match) return null
  const replace = match[1]
  const table = match[2]
  const rawCols = match[3]
  if (!table || !rawCols) return null
  const columns = rawCols.split(",").map((col) => col.trim().replace(/^"|"$/g, ""))
  return { table, columns, replace: Boolean(replace) }
}

function parseSelect(
  sql: string,
): { table: string; columns: string[] | "*"; where?: string[] } | null {
  const match = /^SELECT (.+) FROM ([a-zA-Z_][\w]*)(?: WHERE (.+))?$/i.exec(norm(sql))
  if (!match) return null
  const rawCols = match[1]
  const table = match[2]
  const rawWhere = match[3]
  if (!rawCols || !table) return null
  const columns =
    rawCols.trim() === "*" ? "*" : rawCols.split(",").map((col) => col.trim().replace(/^"|"$/g, ""))
  const where = rawWhere?.split(/\s+AND\s+/i).map((part) => {
    const clause = /^"?([a-zA-Z_][\w]*)"? = \?$/.exec(part.trim())
    if (!clause) throw new Error(`memory storage does not support WHERE clause: ${part}`)
    return clause[1]!
  })
  return { table, columns, where }
}

function parseDelete(sql: string): { table: string; where?: string[] } | null {
  const match = /^DELETE FROM ([a-zA-Z_][\w]*)(?: WHERE (.+))?$/i.exec(norm(sql))
  if (!match) return null
  const table = match[1]
  const rawWhere = match[2]
  if (!table) return null
  const where = rawWhere?.split(/\s+AND\s+/i).map((part) => {
    const clause = /^"?([a-zA-Z_][\w]*)"? = \?$/.exec(part.trim())
    if (!clause) throw new Error(`memory storage does not support WHERE clause: ${part}`)
    return clause[1]!
  })
  return { table, where }
}

function parseUpdate(sql: string): { table: string; set: string[]; where?: string[] } | null {
  const match = /^UPDATE ([a-zA-Z_][\w]*) SET (.+?)(?: WHERE (.+))?$/i.exec(norm(sql))
  if (!match) return null
  const table = match[1]
  const rawSet = match[2]
  const rawWhere = match[3]
  if (!table || !rawSet) return null
  const set = rawSet.split(",").map((part) => {
    const clause = /^"?([a-zA-Z_][\w]*)"? = \?$/.exec(part.trim())
    if (!clause) throw new Error(`memory storage does not support SET clause: ${part}`)
    return clause[1]!
  })
  const where = rawWhere?.split(/\s+AND\s+/i).map((part) => {
    const clause = /^"?([a-zA-Z_][\w]*)"? = \?$/.exec(part.trim())
    if (!clause) throw new Error(`memory storage does not support WHERE clause: ${part}`)
    return clause[1]!
  })
  return { table, set, where }
}

function cloneState(state: StorageState): StorageState {
  return new Map(
    [...state.entries()].map(([name, table]) => [
      name,
      {
        columns: [...table.columns],
        rows: table.rows.map((row) => ({ ...row })),
      },
    ]),
  )
}

function matchesWhere(
  row: Row,
  cols: string[] | undefined,
  params: unknown[],
  offset = 0,
): boolean {
  if (!cols || cols.length === 0) return true
  return cols.every((col, idx) => row[col] === params[offset + idx])
}

export class MemoryStorage implements StorageAdapter {
  readonly kind = "memory" as const

  constructor(private state: StorageState = new Map()) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const spec = parseSelect(sql)
    if (!spec) throw new Error(`memory storage does not support query: ${sql}`)
    const table = this.state.get(spec.table)
    if (!table) return []
    const rows = table.rows.filter((row) => matchesWhere(row, spec.where, params))
    return rows.map((row) => {
      if (spec.columns === "*") return { ...row } as T
      const out: Row = {}
      for (const col of spec.columns) out[col] = row[col]
      return out as T
    })
  }

  async execute(sql: string, params: unknown[] = []): Promise<StorageExecResult> {
    const create = parseCreate(sql)
    if (create) {
      if (!this.state.has(create.table)) {
        this.state.set(create.table, { columns: create.columns, rows: [] })
      }
      return { changes: 0 }
    }

    const insert = parseInsert(sql)
    if (insert) {
      const table = this.state.get(insert.table)
      if (!table) throw new Error(`table not found: ${insert.table}`)
      const row = Object.fromEntries(insert.columns.map((col, idx) => [col, params[idx]]))
      const pk = insert.columns[0]
      if (!pk) throw new Error(`memory storage insert requires at least one column: ${sql}`)
      const existing = table.rows.findIndex((current) => current[pk] === row[pk])
      if (existing >= 0) {
        if (!insert.replace) throw new Error(`duplicate primary key: ${String(row[pk])}`)
        table.rows[existing] = { ...table.rows[existing], ...row }
      } else {
        table.rows.push(row)
      }
      return { changes: 1, lastId: row[pk] as string | number | undefined }
    }

    const update = parseUpdate(sql)
    if (update) {
      const table = this.state.get(update.table)
      if (!table) throw new Error(`table not found: ${update.table}`)
      let changes = 0
      for (const row of table.rows) {
        if (!matchesWhere(row, update.where, params, update.set.length)) continue
        for (const [idx, col] of update.set.entries()) row[col] = params[idx]
        changes++
      }
      return { changes }
    }

    const del = parseDelete(sql)
    if (del) {
      const table = this.state.get(del.table)
      if (!table) return { changes: 0 }
      const kept = table.rows.filter((row) => !matchesWhere(row, del.where, params))
      const changes = table.rows.length - kept.length
      table.rows = kept
      return { changes }
    }

    throw new Error(`memory storage does not support execute: ${sql}`)
  }

  async transaction<T>(fn: (tx: StorageAdapter) => Promise<T>): Promise<T> {
    const draft = cloneState(this.state)
    const tx = new MemoryStorage(draft)
    const out = await fn(tx)
    this.state = draft
    return out
  }

  async close(): Promise<void> {
    this.state.clear()
  }
}

export interface SqliteStorageConfig {
  path?: string
  readonly?: boolean
}

export class SqliteStorage implements StorageAdapter {
  readonly kind = "sqlite" as const
  private readonly db: Database

  constructor(cfg: SqliteStorageConfig = {}) {
    this.db = new Database(cfg.path ?? ":memory:", {
      create: !cfg.readonly,
      readonly: cfg.readonly ?? false,
    })
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.query(sql).all(...this.sqliteParams(params)) as T[]
  }

  async execute(sql: string, params: unknown[] = []): Promise<StorageExecResult> {
    const result = this.db.query(sql).run(...this.sqliteParams(params)) as {
      changes?: number
      lastInsertRowid?: number
    }
    return {
      changes: result.changes ?? 0,
      lastId: result.lastInsertRowid,
    }
  }

  async transaction<T>(fn: (tx: StorageAdapter) => Promise<T>): Promise<T> {
    this.db.exec("BEGIN")
    try {
      const out = await fn(this)
      this.db.exec("COMMIT")
      return out
    } catch (err) {
      this.db.exec("ROLLBACK")
      throw err
    }
  }

  async close(): Promise<void> {
    this.db.close()
  }

  private sqliteParams(params: unknown[]): SqliteParam[] {
    return params as SqliteParam[]
  }
}
