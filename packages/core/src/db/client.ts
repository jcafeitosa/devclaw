import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"

import * as schema from "./schema/index.ts"

export interface DbOpts {
  path?: string
  readonly?: boolean
  create?: boolean
}

export function defaultDbPath(): string {
  if (process.env.DEVCLAW_DB_PATH) return process.env.DEVCLAW_DB_PATH
  return new URL("../../dev.db", import.meta.url).pathname
}

export function openSqlite(opts: DbOpts = {}): Database {
  return new Database(opts.path ?? defaultDbPath(), {
    readonly: opts.readonly ?? false,
    create: opts.create ?? true,
  })
}

export function makeDb(opts: DbOpts = {}) {
  const sqlite = openSqlite(opts)
  sqlite.exec("PRAGMA foreign_keys = ON;")
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

export type DevclawDb = ReturnType<typeof makeDb>["db"]
