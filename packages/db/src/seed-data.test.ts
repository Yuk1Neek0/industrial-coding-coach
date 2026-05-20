import { describe, expect, it } from "vitest"

import { goldenPathSeed } from "./seed-data"

describe("Golden Path seed data", () => {
  it("contains exactly 5 Golden Paths", () => {
    expect(goldenPathSeed).toHaveLength(5)
  })

  it("has unique slugs", () => {
    const slugs = goldenPathSeed.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("fully populates every explanation field on every entry", () => {
    for (const p of goldenPathSeed) {
      expect(p.name.trim().length).toBeGreaterThan(0)
      expect(p.slug.trim().length).toBeGreaterThan(0)
      expect(p.summary.trim().length).toBeGreaterThan(0)
      expect(p.targetProjectType.trim().length).toBeGreaterThan(0)
      expect(p.fitCriteria.trim().length).toBeGreaterThan(0)
      expect(p.steps.length).toBeGreaterThan(0)
      expect(p.templatesReferenced.length).toBeGreaterThan(0)
      expect(p.qualityGates.length).toBeGreaterThan(0)
      expect(p.learningOutcomes.length).toBeGreaterThan(0)
      expect(p.rejectedAlternatives.length).toBeGreaterThan(0)
      expect(p.sources.length).toBeGreaterThan(0)
      expect(p.risks.length).toBeGreaterThan(0)
    }
  })
})
