// Tests for Backstage import + seed integration (M14, Issue #248).
//
// Verifies the seed's combined insert (curated templateSeed ++ imported
// Backstage rows): correct totals, global slug uniqueness across curated +
// imported, idempotency of the drop-and-reload, provenance on imported rows,
// and that the existing data-access layer returns imported rows unchanged.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import { backstageFixtures } from "./backstage-fixtures"
import { importBackstageTemplates } from "./backstage-import"
import type { CatalogDb } from "./client"
import { templates } from "./schema"
import * as schema from "./schema"
import { templateSeed } from "./template-seed-data"
import {
  getTemplateBySlug,
  listTemplates,
  listTemplatesByCategory,
} from "./templates"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
)

function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

/** Replicates seed.ts's combined drop-and-reload insert for the templates table. */
function seedTemplates(db: CatalogDb): number {
  const imported = importBackstageTemplates(backstageFixtures)
  db.delete(templates).run()
  db.insert(templates).values([...templateSeed, ...imported]).run()
  return imported.length
}

describe("Backstage seed integration", () => {
  let db: CatalogDb
  let importedCount: number

  beforeEach(() => {
    db = makeTestDb()
    importedCount = seedTemplates(db)
  })

  it("inserts curated + imported templates", async () => {
    const rows = await listTemplates(db)
    expect(rows).toHaveLength(templateSeed.length + importedCount)
    expect(importedCount).toBeGreaterThanOrEqual(3)
  })

  it("keeps slugs globally unique across curated + imported", async () => {
    const slugs = (await listTemplates(db)).map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    // Imported slugs are namespaced and never collide with curated ones.
    const curatedSlugs = new Set(templateSeed.map((t) => t.slug))
    for (const slug of slugs.filter((s) => s.startsWith("backstage-"))) {
      expect(curatedSlugs.has(slug)).toBe(false)
    }
  })

  it("is idempotent — re-seeding yields a stable count", async () => {
    const before = (await listTemplates(db)).length
    seedTemplates(db)
    const after = (await listTemplates(db)).length
    expect(after).toBe(before)
  })

  it("marks imported rows with backstage provenance and full fields", async () => {
    const imported = (await listTemplates(db)).filter(
      (t) => t.source === "backstage",
    )
    expect(imported.length).toBe(importedCount)
    for (const row of imported) {
      expect(row.sourceUrl).toBeTruthy()
      expect(row.sourceFormat).toBe("backstage/scaffolder.v1beta3")
      expect(row.whyUsed.trim()).not.toBe("")
      expect(row.fitFactors.length).toBeGreaterThan(0)
      expect(row.sources.length).toBeGreaterThan(0)
    }
  })

  it("leaves curated rows marked curated", async () => {
    const curated = (await listTemplates(db)).filter(
      (t) => t.source === "curated",
    )
    expect(curated).toHaveLength(templateSeed.length)
  })

  it("resolves an imported template through the data-access layer", async () => {
    const slug = importBackstageTemplates(backstageFixtures)[0]!.slug
    const row = await getTemplateBySlug(slug, db)
    expect(row).not.toBeNull()
    expect(row!.source).toBe("backstage")
  })

  it("returns imported rows from listTemplatesByCategory", async () => {
    const docs = await listTemplatesByCategory("Doc/Spec Template", db)
    expect(docs.some((t) => t.source === "backstage")).toBe(true)
  })
})
