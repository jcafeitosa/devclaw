import { migrate } from "drizzle-orm/bun-sqlite/migrator"

import { makeDb } from "./client.ts"

function migrationsFolder(): string {
  return new URL("../../drizzle", import.meta.url).pathname
}

const { db, sqlite } = makeDb()

try {
  migrate(db, { migrationsFolder: migrationsFolder() })
  console.log(`migrated sqlite database at ${sqlite.filename}`)
} finally {
  sqlite.close()
}
