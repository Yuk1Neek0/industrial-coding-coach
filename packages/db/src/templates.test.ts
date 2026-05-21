import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"

import type { CatalogDb } from "./client"
import { type NewTemplate, templates } from "./schema"
import * as schema from "./schema"
import {
  getTemplateBySlug,
  listTemplates,
  listTemplatesByCategory,
  resolveTemplates,
} from "./templates"

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

const sample: NewTemplate[] = [
  {
    slug: "sample-scaffold",
    name: "Beta Scaffold",
    category: "Project Scaffold",
    summary: "A second sample template.",
    whatItGenerates: "A project skeleton.",
    whyUsed: "To start fast.",
    fitCriteria: "Use when starting a new app.",
    fitFactors: [{ factor: "stack", detail: "Next.js + TypeScript." }],
    risks: ["This is only sample data."],
    alternatives: [{ name: "Other scaffold", reason: "Different stack." }],
    learningNotes: "Learn how scaffolds work.",
    sources: [{ label: "Docs", url: "https://example.com" }],
  },
  {
    slug: "sample-ci",
    name: "Alpha CI",
    category: "CI",
    summary: "A first sample template.",
    whatItGenerates: "A CI workflow file.",
    whyUsed: "To gate merges.",
    fitCriteria: "Use when you need automated checks.",
    fitFactors: [{ factor: "runner", detail: "GitHub-hosted." }],
    risks: ["Sample data only."],
    alternatives: [{ name: "Other CI", reason: "Self-hosted." }],
    learningNotes: "Learn what a quality gate is.",
    sources: [{ label: "A plain source" }],
  },
  {
    slug: "sample-scaffold-two",
    name: "Gamma Scaffold",
    category: "Project Scaffold",
    summary: "A third sample template, same category as the first.",
    whatItGenerates: "Another project skeleton.",
    whyUsed: "To compare scaffolds.",
    fitCriteria: "Use when evaluating scaffolds.",
    fitFactors: [{ factor: "stack", detail: "T3 stack." }],
    risks: ["Sample data only."],
    alternatives: [{ name: "Beta Scaffold", reason: "Simpler." }],
    learningNotes: "Learn to compare building blocks.",
    sources: [{ label: "Source", url: "https://example.org" }],
  },
]

describe("template registry data-access", () => {
  let db: CatalogDb

  beforeAll(() => {
    db = makeTestDb()
    db.insert(templates).values(sample).run()
  })

  it("listTemplates returns all rows, ordered by name", async () => {
    const all = await listTemplates(db)
    expect(all).toHaveLength(3)
    expect(all.map((t) => t.name)).toEqual([
      "Alpha CI",
      "Beta Scaffold",
      "Gamma Scaffold",
    ])
  })

  it("getTemplateBySlug returns the matching template", async () => {
    const tpl = await getTemplateBySlug("sample-ci", db)
    expect(tpl?.name).toBe("Alpha CI")
  })

  it("getTemplateBySlug returns null for an unknown slug", async () => {
    expect(await getTemplateBySlug("does-not-exist", db)).toBeNull()
  })

  it("parses JSON columns into typed arrays/objects", async () => {
    const tpl = await getTemplateBySlug("sample-scaffold", db)
    expect(tpl?.fitFactors).toHaveLength(1)
    expect(tpl?.fitFactors[0]?.factor).toBe("stack")
    expect(tpl?.alternatives[0]?.name).toBe("Other scaffold")
    expect(tpl?.sources[0]?.label).toBe("Docs")
    expect(tpl?.risks[0]).toBe("This is only sample data.")
  })

  it("listTemplatesByCategory returns only that category, ordered by name", async () => {
    const scaffolds = await listTemplatesByCategory("Project Scaffold", db)
    expect(scaffolds.map((t) => t.name)).toEqual([
      "Beta Scaffold",
      "Gamma Scaffold",
    ])
  })

  it("listTemplatesByCategory returns an empty array for an unknown category", async () => {
    expect(await listTemplatesByCategory("Nonexistent", db)).toEqual([])
  })

  it("resolveTemplates expands slugs into full entries, in input order", async () => {
    const resolved = await resolveTemplates(["sample-ci", "sample-scaffold"], db)
    expect(resolved.map((t) => t.slug)).toEqual([
      "sample-ci",
      "sample-scaffold",
    ])
    expect(resolved[0]?.name).toBe("Alpha CI")
  })

  it("resolveTemplates de-duplicates repeated slugs", async () => {
    const resolved = await resolveTemplates(
      ["sample-ci", "sample-ci", "sample-scaffold"],
      db,
    )
    expect(resolved.map((t) => t.slug)).toEqual([
      "sample-ci",
      "sample-scaffold",
    ])
  })

  it("resolveTemplates drops slugs with no matching template", async () => {
    const resolved = await resolveTemplates(
      ["sample-ci", "missing-template"],
      db,
    )
    expect(resolved.map((t) => t.slug)).toEqual(["sample-ci"])
  })

  it("resolveTemplates returns an empty array for an empty slug list", async () => {
    expect(await resolveTemplates([], db)).toEqual([])
  })
})
