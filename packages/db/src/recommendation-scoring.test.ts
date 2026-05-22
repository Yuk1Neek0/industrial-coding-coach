// Tests for the deterministic recommendation scoring module (FR-2 / FR-4).
//
// The catalog under test is the real M2 Golden Path and M3 Template seed data,
// so the assertions also prove the engine produces sensible recommendations
// over the actual catalog, and that every cited slug resolves to a real entry.

import { describe, expect, it } from "vitest"

import { scoreRecommendation } from "./recommendation-scoring"
import type { RecommendationIntake } from "./schema"
import { goldenPathSeed } from "./seed-data"
import { templateSeed } from "./template-seed-data"

/** A junior dev building an AI-assisted Next.js web app. */
const nextjsIntake: RecommendationIntake = {
  goal: "Build a modern Next.js web app with React and explain how it works",
  experienceLevel: "junior",
  knownStack: ["JavaScript", "React", "Next.js", "TypeScript", "Tailwind"],
  jobTarget: "frontend developer",
  timeBudget: "a few weeks",
  complexityTolerance: "moderate",
  projectType: "A Next.js and React web application scaffolded with AI tools",
  aiToolPreference: "Claude Code",
  learningFocus: "routing and the server and client component split",
}

/** A junior dev building an instrumented LLM application. */
const llmIntake: RecommendationIntake = {
  goal: "Understand how an app traces, costs, and evaluates its LLM calls",
  experienceLevel: "junior",
  knownStack: ["TypeScript", "Node"],
  jobTarget: "AI engineer",
  timeBudget: "a few weeks",
  complexityTolerance: "high",
  projectType: "An app that calls an LLM API and needs observability and evals",
  aiToolPreference: "Anthropic API",
  learningFocus: "tracing, prompt logging, cost tracking, and evaluation",
}

const goldenPathSlugs = new Set(goldenPathSeed.map((p) => p.slug))
const templateSlugs = new Set(templateSeed.map((t) => t.slug))

describe("recommendation scoring", () => {
  it("recommends a Golden Path that resolves to a real catalog slug", () => {
    const result = scoreRecommendation(nextjsIntake, goldenPathSeed, templateSeed)
    expect(goldenPathSlugs.has(result.recommendedGoldenPathSlug)).toBe(true)
  })

  it("recommends the Next.js path for a Next.js intake", () => {
    const result = scoreRecommendation(nextjsIntake, goldenPathSeed, templateSeed)
    expect(result.recommendedGoldenPathSlug).toBe("ai-native-nextjs-app")
  })

  it("recommends the observability path for an LLM-app intake", () => {
    const result = scoreRecommendation(llmIntake, goldenPathSeed, templateSeed)
    expect(result.recommendedGoldenPathSlug).toBe("llm-observability-eval-app")
  })

  it("produces an identical ranking for identical input (deterministic)", () => {
    const first = scoreRecommendation(nextjsIntake, goldenPathSeed, templateSeed)
    const second = scoreRecommendation(nextjsIntake, goldenPathSeed, templateSeed)
    expect(first).toEqual(second)
  })

  it("ranks every Golden Path, best fit first", () => {
    const { goldenPathRanking } = scoreRecommendation(
      nextjsIntake,
      goldenPathSeed,
      templateSeed,
    )
    expect(goldenPathRanking).toHaveLength(goldenPathSeed.length)
    const scores = goldenPathRanking.map((c) => c.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })

  it("scores every Template entry", () => {
    const { templateRanking } = scoreRecommendation(
      nextjsIntake,
      goldenPathSeed,
      templateSeed,
    )
    expect(templateRanking).toHaveLength(templateSeed.length)
  })

  it("recommends templates that resolve to real registry slugs", () => {
    const result = scoreRecommendation(nextjsIntake, goldenPathSeed, templateSeed)
    expect(result.recommendedTemplateSlugs.length).toBeGreaterThan(0)
    for (const slug of result.recommendedTemplateSlugs) {
      expect(templateSlugs.has(slug)).toBe(true)
    }
  })

  it("recommends only templates the winning path references", () => {
    const result = scoreRecommendation(nextjsIntake, goldenPathSeed, templateSeed)
    const winner = goldenPathSeed.find(
      (p) => p.slug === result.recommendedGoldenPathSlug,
    )
    const referenced = new Set(winner?.templatesReferenced ?? [])
    for (const slug of result.recommendedTemplateSlugs) {
      expect(referenced.has(slug)).toBe(true)
    }
  })

  it("lists every other Golden Path as a rejected alternative with a reason", () => {
    const result = scoreRecommendation(nextjsIntake, goldenPathSeed, templateSeed)
    expect(result.rejectedAlternatives).toHaveLength(goldenPathSeed.length - 1)
    for (const alt of result.rejectedAlternatives) {
      expect(alt.kind).toBe("golden_path")
      expect(goldenPathSlugs.has(alt.slug)).toBe(true)
      expect(alt.reason.length).toBeGreaterThan(0)
      expect(alt.slug).not.toBe(result.recommendedGoldenPathSlug)
    }
  })

  it("breaks score ties by slug so the ranking is total and stable", () => {
    // Two intakes with no fit signal at all — every path scores zero, so the
    // tie-break (slug order) alone decides a stable, identical ranking.
    const empty: RecommendationIntake = {
      goal: "",
      experienceLevel: "",
      knownStack: [],
      jobTarget: "",
      timeBudget: "",
      complexityTolerance: "",
      projectType: "",
      aiToolPreference: "",
      learningFocus: "",
    }
    const result = scoreRecommendation(empty, goldenPathSeed, templateSeed)
    const slugs = result.goldenPathRanking.map((c) => c.slug)
    expect(slugs).toEqual([...slugs].sort())
    expect(result.goldenPathRanking.every((c) => c.score === 0)).toBe(true)
  })

  it("throws when there are no Golden Paths to score", () => {
    expect(() => scoreRecommendation(nextjsIntake, [], templateSeed)).toThrow()
  })
})
