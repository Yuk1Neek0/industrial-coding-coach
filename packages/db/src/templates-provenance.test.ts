// Tests for the template provenance columns added in M14 (Issue #243).
//
// Verifies migration 0012 applies cleanly and that provenance behaves per
// ADR 0010: `source` defaults to `'curated'` (NOT NULL) so existing/curated
// rows are backfilled, `source_url`/`source_format` are nullable, an explicit
// `'backstage'` row round-trips, and the curated seed stamps every entry
// `source: 'curated'`.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import type { CatalogDb } from "./client"
import { type NewTemplate, templates } from "./schema"
import * as schema from "./schema"
import { templateSeed } from "./template-seed-data"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
)

/** A fresh in-memory catalog DB with the real migrations applied (incl. 0012). */
function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

/** A minimal curated template that omits the defaulted `source` column. */
const curatedRow: NewTemplate = {
  slug: "provenance-sample",
  name: "Provenance Sample",
  category: "Project Scaffold",
  summary: "A sample row for provenance tests.",
  whatItGenerates: "Nothing real.",
  whyUsed: "To test provenance defaults.",
  fitCriteria: "Use only in tests.",
  fitFactors: [{ factor: "scope", detail: "test-only." }],
  risks: ["Sample data only."],
  alternatives: [{ name: "None", reason: "Test fixture." }],
  learningNotes: "Provenance defaults to curated.",
  sources: [{ label: "Test" }],
}

describe("template provenance (migration 0012 / ADR 0010)", () => {
  it("applies the migrations cleanly (no throw)", () => {
    expect(() => makeTestDb()).not.toThrow()
  })

  it("defaults `source` to 'curated' with null source_url/source_format", () => {
    const db = makeTestDb()
    db.insert(templates).values(curatedRow).run()

    const row = db
      .select()
      .from(templates)
      .all()
      .find((t) => t.slug === "provenance-sample")

    expect(row).toBeDefined()
    expect(row!.source).toBe("curated")
    expect(row!.sourceUrl).toBeNull()
    expect(row!.sourceFormat).toBeNull()
  })

  it("round-trips an explicit Backstage-imported row", () => {
    const db = makeTestDb()
    db.insert(templates)
      .values({
        ...curatedRow,
        slug: "backstage-sample",
        source: "backstage",
        sourceUrl: "https://github.com/backstage/software-templates/x/template.yaml",
        sourceFormat: "backstage/scaffolder.v1beta3",
      })
      .run()

    const row = db
      .select()
      .from(templates)
      .all()
      .find((t) => t.slug === "backstage-sample")

    expect(row).toBeDefined()
    expect(row!.source).toBe("backstage")
    expect(row!.sourceUrl).toContain("template.yaml")
    expect(row!.sourceFormat).toBe("backstage/scaffolder.v1beta3")
  })

  it("stamps every curated seed entry with source 'curated'", () => {
    expect(templateSeed.length).toBeGreaterThan(0)
    for (const entry of templateSeed) {
      expect(entry.source).toBe("curated")
    }
  })
})
