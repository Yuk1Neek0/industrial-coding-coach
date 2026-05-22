// Referential-integrity test for stored recommendations (FR-4 / FR-6).
//
// Proves the end-to-end engine output is referentially sound: a recommendation
// scored over the real M2/M3 seed catalog and persisted via the data-access
// layer cites only slugs that resolve to real catalog entries — no dangling
// references in the recommended path, the recommended templates, or the
// rejected alternatives.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vitest"

import { getGoldenPathBySlug } from "./catalog"
import type { CatalogDb } from "./client"
import { scoreRecommendation } from "./recommendation-scoring"
import { createRecommendation } from "./recommendations"
import { goldenPaths, type RecommendationIntake, templates } from "./schema"
import * as schema from "./schema"
import { goldenPathSeed } from "./seed-data"
import { getTemplateBySlug } from "./templates"
import { templateSeed } from "./template-seed-data"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
)

/** A fresh in-memory catalog DB seeded with the real M2/M3 catalog. */
function makeSeededDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  db.insert(goldenPaths).values(goldenPathSeed).run()
  db.insert(templates).values(templateSeed).run()
  return db
}

const sampleIntake: RecommendationIntake = {
  goal: "Build a modern Next.js web app with React and explain how it works",
  experienceLevel: "junior",
  knownStack: ["JavaScript", "React", "Next.js", "TypeScript"],
  jobTarget: "frontend developer",
  timeBudget: "a few weeks",
  complexityTolerance: "moderate",
  projectType: "A Next.js and React web application",
  aiToolPreference: "Claude Code",
  learningFocus: "routing and the server and client component split",
}

describe("referential integrity: stored recommendations -> catalog", () => {
  let db: CatalogDb

  beforeAll(() => {
    db = makeSeededDb()
  })

  it("every slug a stored recommendation cites resolves to a real catalog entry", async () => {
    const scored = scoreRecommendation(sampleIntake, goldenPathSeed, templateSeed)
    const stored = await createRecommendation(
      {
        intake: sampleIntake,
        recommendedGoldenPathSlug: scored.recommendedGoldenPathSlug,
        recommendedTemplateSlugs: scored.recommendedTemplateSlugs,
        rejectedAlternatives: scored.rejectedAlternatives,
        narrative: null,
      },
      db,
    )

    // The recommendation cites a path, templates, and at least one alternative.
    expect(stored.recommendedTemplateSlugs.length).toBeGreaterThan(0)
    expect(stored.rejectedAlternatives.length).toBeGreaterThan(0)

    // The recommended Golden Path resolves.
    expect(
      await getGoldenPathBySlug(stored.recommendedGoldenPathSlug, db),
    ).not.toBeNull()

    // Every recommended template resolves.
    for (const slug of stored.recommendedTemplateSlugs) {
      expect(await getTemplateBySlug(slug, db)).not.toBeNull()
    }

    // Every rejected alternative resolves, against the catalog its kind names.
    for (const alternative of stored.rejectedAlternatives) {
      const resolved =
        alternative.kind === "golden_path"
          ? await getGoldenPathBySlug(alternative.slug, db)
          : await getTemplateBySlug(alternative.slug, db)
      expect(resolved).not.toBeNull()
    }
  })
})
