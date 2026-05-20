import { defineConfig } from "drizzle-kit"

// Drizzle Kit config for the Golden Path Catalog (local SQLite — see ADR 0006).
// Run from packages/db; paths are relative to this directory.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DB_FILE_NAME ?? "./catalog.db",
  },
})
