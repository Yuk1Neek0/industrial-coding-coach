// Seed script for the Golden Path Catalog.
//
// Idempotent (drop-and-reload): runs migrations, clears the table, then inserts
// the five Golden Paths from `seed-data.ts`. Safe to re-run. Invoke with the
// `db:seed` package script.

import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { createCatalogDb, resolveDbFile } from "./client"
import { goldenPaths } from "./schema"
import { goldenPathSeed } from "./seed-data"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
)

function seed(): void {
  const dbFile = resolveDbFile()
  const db = createCatalogDb(dbFile)
  migrate(db, { migrationsFolder })
  db.delete(goldenPaths).run()
  db.insert(goldenPaths).values(goldenPathSeed).run()
  console.log(`Seeded ${goldenPathSeed.length} Golden Paths into ${dbFile}`)
}

seed()
