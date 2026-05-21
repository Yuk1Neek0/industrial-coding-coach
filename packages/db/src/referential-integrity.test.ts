// Referential-integrity test (PRD FR-6).
//
// Every slug used in any M2 `goldenPathSeed[*].templatesReferenced` array must
// resolve to a template in the M3 Template Registry seed. This test enforces
// that the catalog has no dangling template references.

import { describe, expect, it } from "vitest"

import { goldenPathSeed } from "./seed-data"
import { templateSeed } from "./template-seed-data"

/** Every slug referenced by any Golden Path, de-duplicated. */
const referencedSlugs = [
  ...new Set(goldenPathSeed.flatMap((p) => p.templatesReferenced)),
]

/** Every slug present in the Template Registry seed. */
const templateSlugs = new Set(templateSeed.map((t) => t.slug))

describe("referential integrity: golden paths -> templates", () => {
  it("references at least one template", () => {
    expect(referencedSlugs.length).toBeGreaterThan(0)
  })

  it.each(referencedSlugs)(
    "templatesReferenced slug %s resolves to a seeded template",
    (slug) => {
      expect(templateSlugs.has(slug)).toBe(true)
    },
  )

  it("has no dangling template references across the whole catalog", () => {
    const dangling = referencedSlugs.filter((s) => !templateSlugs.has(s))
    expect(dangling).toEqual([])
  })

  it("resolves every referenced slug to exactly one template entry", () => {
    for (const slug of referencedSlugs) {
      const matches = templateSeed.filter((t) => t.slug === slug)
      expect(matches).toHaveLength(1)
    }
  })
})
