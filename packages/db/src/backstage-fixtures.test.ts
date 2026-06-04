// Tests for the bundled Backstage fixtures + enrichment (M14, Issue #247).

import { describe, expect, it } from "vitest"

import { backstageFixtures } from "./backstage-fixtures"
import { mapBackstageTemplate } from "./backstage-import"
import { loadBackstageFixtures } from "./template-enrichment"
import type { NewTemplate } from "./schema"

describe("backstageFixtures", () => {
  it("bundles at least 3 real Backstage software templates", () => {
    expect(backstageFixtures.length).toBeGreaterThanOrEqual(3)
  })

  it("every fixture parses + its enrichment validates", () => {
    expect(() => loadBackstageFixtures(backstageFixtures)).not.toThrow()
    const loaded = loadBackstageFixtures(backstageFixtures)
    expect(loaded).toHaveLength(backstageFixtures.length)
    for (const f of loaded) {
      expect(f.template.kind).toBe("Template")
      expect(f.template.metadata.name).toBeTruthy()
    }
  })

  it("every fixture maps to a complete backstage-sourced registry row", () => {
    const loaded = loadBackstageFixtures(backstageFixtures)
    const rows: NewTemplate[] = loaded.map((f) =>
      mapBackstageTemplate(f.template, f.enrichment),
    )

    for (const row of rows) {
      expect(row.source).toBe("backstage")
      expect(row.sourceUrl).toContain("github.com/backstage/software-templates")
      expect(row.sourceFormat).toBe("backstage/scaffolder.v1beta3")
      // No NOT-NULL field is empty.
      for (const text of [
        row.slug,
        row.name,
        row.category,
        row.summary,
        row.whatItGenerates,
        row.whyUsed,
        row.fitCriteria,
        row.learningNotes,
      ]) {
        expect(typeof text === "string" && text.trim().length > 0).toBe(true)
      }
      expect(row.fitFactors.length).toBeGreaterThan(0)
      expect(row.risks.length).toBeGreaterThan(0)
      expect(row.alternatives.length).toBeGreaterThan(0)
      expect(row.sources.length).toBeGreaterThan(0)
      expect(row.slug.startsWith("backstage-")).toBe(true)
    }
  })

  it("exercises a spread of registry categories incl. Doc/Spec", () => {
    const rows = loadBackstageFixtures(backstageFixtures).map((f) =>
      mapBackstageTemplate(f.template, f.enrichment),
    )
    const categories = new Set(rows.map((r) => r.category))
    expect(categories.has("Doc/Spec Template")).toBe(true)
    expect(categories.has("Project Scaffold")).toBe(true)
  })

  it("produces unique slugs across fixtures", () => {
    const rows = loadBackstageFixtures(backstageFixtures).map((f) =>
      mapBackstageTemplate(f.template, f.enrichment),
    )
    const slugs = rows.map((r) => r.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
