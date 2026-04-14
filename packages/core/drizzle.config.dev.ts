import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DEVCLAW_DB_PATH ?? "./dev.db",
  },
  casing: "snake_case",
  strict: true,
  verbose: true,
})
