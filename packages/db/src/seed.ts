// Seed script for the local catalog database (Golden Path Catalog + Template
// Registry).
//
// Idempotent (drop-and-reload): runs migrations, clears each table, then
// inserts the five Golden Paths from `seed-data.ts` and the 15 templates from
// `template-seed-data.ts`. Safe to re-run. Invoke with the `db:seed` package
// script.

import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { createCatalogDb, resolveDbFile } from "./client"
import { goldenPaths, templates } from "./schema"
import { goldenPathSeed } from "./seed-data"
import { templateSeed } from "./template-seed-data"

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

  db.delete(templates).run()
  db.insert(templates).values(templateSeed).run()

  console.log(
    `Seeded ${goldenPathSeed.length} Golden Paths and ` +
      `${templateSeed.length} templates into ${dbFile}`,
  )
}

seed()
