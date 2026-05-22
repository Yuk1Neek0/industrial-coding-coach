// Tests for the recommendations data-access layer (FR-6 / FR-7).

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "./client"
import {
  createRecommendation,
  getRecommendationById,
  listRecommendations,
  updateRecommendation,
} from "./recommendations"
import type { NewRecommendation, RecommendationIntake } from "./schema"
import * as schema from "./schema"

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

const sampleIntake: RecommendationIntake = {
  goal: "Build a Next.js portfolio app",
  experienceLevel: "junior",
  knownStack: ["React", "TypeScript"],
  jobTarget: "frontend developer",
  timeBudget: "three weeks",
  complexityTolerance: "moderate",
  projectType: "A Next.js web application",
  aiToolPreference: "Claude Code",
  learningFocus: "routing",
}

/** Build a recommendation row, with optional field overrides. */
function sampleRecommendation(
  overrides: Partial<NewRecommendation> = {},
): NewRecommendation {
  return {
    intake: sampleIntake,
    recommendedGoldenPathSlug: "ai-native-nextjs-app",
    recommendedTemplateSlugs: ["create-next-app", "shadcn-ui-monorepo"],
    rejectedAlternatives: [
      {
        slug: "agentic-ccpm-workflow",
        kind: "golden_path",
        reason: "Lower fit score for a Next.js project.",
      },
    ],
    narrative: null,
    ...overrides,
  }
}

describe("recommendations data-access", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("createRecommendation persists a row and returns it with an id", async () => {
    const created = await createRecommendation(sampleRecommendation(), db)
    expect(created.id).toBeGreaterThan(0)
    expect(created.recommendedGoldenPathSlug).toBe("ai-native-nextjs-app")
    expect(created.narrative).toBeNull()
  })

  it("createRecommendation round-trips JSON columns into typed values", async () => {
    const created = await createRecommendation(sampleRecommendation(), db)
    const stored = await getRecommendationById(created.id, db)
    expect(stored?.intake.goal).toBe(sampleIntake.goal)
    expect(stored?.intake.knownStack).toEqual(["React", "TypeScript"])
    expect(stored?.recommendedTemplateSlugs).toEqual([
      "create-next-app",
      "shadcn-ui-monorepo",
    ])
    expect(stored?.rejectedAlternatives[0]?.kind).toBe("golden_path")
  })

  it("getRecommendationById returns null for an unknown id", async () => {
    expect(await getRecommendationById(999, db)).toBeNull()
  })

  it("listRecommendations returns every row, oldest first", async () => {
    await createRecommendation(sampleRecommendation(), db)
    await createRecommendation(
      sampleRecommendation({ recommendedGoldenPathSlug: "contract-first-fullstack-app" }),
      db,
    )
    const all = await listRecommendations(db)
    expect(all).toHaveLength(2)
    expect(all[0]?.id).toBeLessThan(all[1]?.id ?? 0)
  })

  it("updateRecommendation persists a human edit to the narrative (FR-7)", async () => {
    const created = await createRecommendation(sampleRecommendation(), db)
    const edited = await updateRecommendation(
      created.id,
      {
        narrative: {
          whyItFits: "Edited rationale.",
          complexityRisks: "Edited risks.",
          learningCheckpoints: ["Edited checkpoint."],
          portfolioValue: "Edited portfolio value.",
        },
      },
      db,
    )
    expect(edited?.narrative?.whyItFits).toBe("Edited rationale.")

    const reloaded = await getRecommendationById(created.id, db)
    expect(reloaded?.narrative?.whyItFits).toBe("Edited rationale.")
  })

  it("updateRecommendation persists edits to the recommended entries", async () => {
    const created = await createRecommendation(sampleRecommendation(), db)
    const edited = await updateRecommendation(
      created.id,
      {
        recommendedGoldenPathSlug: "repo-understanding-review-coach",
        recommendedTemplateSlugs: ["claude-code-templates"],
      },
      db,
    )
    expect(edited?.recommendedGoldenPathSlug).toBe(
      "repo-understanding-review-coach",
    )
    expect(edited?.recommendedTemplateSlugs).toEqual(["claude-code-templates"])
  })

  it("updateRecommendation advances updatedAt", async () => {
    const created = await createRecommendation(sampleRecommendation(), db)
    const edited = await updateRecommendation(
      created.id,
      { recommendedGoldenPathSlug: "contract-first-fullstack-app" },
      db,
    )
    expect(edited?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.updatedAt.getTime(),
    )
  })

  it("updateRecommendation returns null for an unknown id", async () => {
    expect(
      await updateRecommendation(999, { recommendedGoldenPathSlug: "x" }, db),
    ).toBeNull()
  })
})
