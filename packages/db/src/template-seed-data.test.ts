import { describe, expect, it } from "vitest"

import { templateSeed } from "./template-seed-data"

/** Categories the registry browses by (PRD FR-3). */
const KNOWN_CATEGORIES = new Set([
  "Project Scaffold",
  "Agentic Workflow",
  "CI",
  "Security",
  "Doc/Spec Template",
  "Contract",
  "Observability",
])

describe("Template Registry seed data", () => {
  it("contains exactly 15 templates", () => {
    expect(templateSeed).toHaveLength(15)
  })

  it("has unique slugs", () => {
    const slugs = templateSeed.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("uses stable kebab-case slugs", () => {
    for (const t of templateSeed) {
      expect(t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it("assigns every template a known browsing category", () => {
    for (const t of templateSeed) {
      expect(KNOWN_CATEGORIES.has(t.category)).toBe(true)
    }
  })

  it("fully populates every explanation field on every entry", () => {
    for (const t of templateSeed) {
      expect(t.name.trim().length).toBeGreaterThan(0)
      expect(t.slug.trim().length).toBeGreaterThan(0)
      expect(t.category.trim().length).toBeGreaterThan(0)
      expect(t.summary.trim().length).toBeGreaterThan(0)
      expect(t.whatItGenerates.trim().length).toBeGreaterThan(0)
      expect(t.whyUsed.trim().length).toBeGreaterThan(0)
      expect(t.fitCriteria.trim().length).toBeGreaterThan(0)
      expect(t.learningNotes.trim().length).toBeGreaterThan(0)
      expect(t.fitFactors.length).toBeGreaterThan(0)
      expect(t.risks.length).toBeGreaterThan(0)
      expect(t.alternatives.length).toBeGreaterThan(0)
      expect(t.sources.length).toBeGreaterThan(0)
    }
  })

  it("populates structured fit factors with factor and detail text", () => {
    for (const t of templateSeed) {
      for (const f of t.fitFactors) {
        expect(f.factor.trim().length).toBeGreaterThan(0)
        expect(f.detail.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it("gives every alternative a name and a reason", () => {
    for (const t of templateSeed) {
      for (const a of t.alternatives) {
        expect(a.name.trim().length).toBeGreaterThan(0)
        expect(a.reason.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it("gives every source a non-empty label", () => {
    for (const t of templateSeed) {
      for (const s of t.sources) {
        expect(s.label.trim().length).toBeGreaterThan(0)
      }
    }
  })
})
