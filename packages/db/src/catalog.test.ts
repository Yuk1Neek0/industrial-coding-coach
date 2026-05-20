import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"

import { getGoldenPathBySlug, listGoldenPaths } from "./catalog.js"
import type { CatalogDb } from "./client.js"
import { goldenPaths, type NewGoldenPath } from "./schema.js"
import * as schema from "./schema.js"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
)

/** A fresh in-memory catalog DB with the real migrations applied. */
function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

const sample: NewGoldenPath[] = [
  {
    slug: "sample-beta",
    name: "Beta Path",
    summary: "Second sample path.",
    targetProjectType: "Sample project",
    fitCriteria: "Use when testing.",
    steps: [{ title: "Step one", detail: "Do the first thing." }],
    templatesReferenced: ["sample-template"],
    qualityGates: ["lint passes"],
    learningOutcomes: ["You can explain the sample."],
    rejectedAlternatives: [{ name: "Other", reason: "Out of scope." }],
    sources: [{ label: "Docs", url: "https://example.com" }],
    risks: ["This is only sample data."],
  },
  {
    slug: "sample-alpha",
    name: "Alpha Path",
    summary: "First sample path.",
    targetProjectType: "Sample project",
    fitCriteria: "Use when testing, too.",
    steps: [
      { title: "Step one", detail: "Do the first thing." },
      { title: "Step two", detail: "Do the second thing." },
    ],
    templatesReferenced: ["sample-template", "another-template"],
    qualityGates: ["build passes"],
    learningOutcomes: ["You can explain alpha."],
    rejectedAlternatives: [{ name: "Alt", reason: "Not a fit." }],
    sources: [{ label: "A plain source" }],
    risks: ["Sample data only."],
  },
]

describe("catalog data-access", () => {
  let db: CatalogDb

  beforeAll(() => {
    db = makeTestDb()
    db.insert(goldenPaths).values(sample).run()
  })

  it("listGoldenPaths returns all rows, ordered by name", async () => {
    const all = await listGoldenPaths(db)
    expect(all).toHaveLength(2)
    expect(all.map((p) => p.name)).toEqual(["Alpha Path", "Beta Path"])
  })

  it("getGoldenPathBySlug returns the matching path", async () => {
    const gp = await getGoldenPathBySlug("sample-alpha", db)
    expect(gp?.name).toBe("Alpha Path")
  })

  it("getGoldenPathBySlug returns null for an unknown slug", async () => {
    expect(await getGoldenPathBySlug("does-not-exist", db)).toBeNull()
  })

  it("parses JSON columns into typed arrays/objects", async () => {
    const gp = await getGoldenPathBySlug("sample-alpha", db)
    expect(gp?.steps).toHaveLength(2)
    expect(gp?.steps[0]?.title).toBe("Step one")
    expect(gp?.sources[0]?.label).toBe("A plain source")
  })
})
