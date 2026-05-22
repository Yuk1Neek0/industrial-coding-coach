// Verifies the diff_reviews migration (drizzle/0005_*) applies cleanly to a
// fresh database and that the diff_reviews table behaves as the schema declares
// (M8 diff-review PRD; ADR 0006).

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { eq } from "drizzle-orm"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import {
  diffReviews,
  repoSnapshots,
  type NewDiffReview,
  type NewRepoSnapshot,
} from "./schema"
import * as schema from "./schema"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
)

/** A fresh in-memory DB with the real migrations applied (incl. 0005). */
function makeTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

const sampleSnapshot: NewRepoSnapshot = {
  owner: "vercel",
  repo: "next.js",
  ref: "main",
  commitSha: "abc123",
  defaultBranch: "main",
  description: "The React Framework",
  primaryLanguage: "TypeScript",
  isPrivate: false,
  htmlUrl: "https://github.com/vercel/next.js",
  fileTree: [{ path: "package.json", type: "blob", size: 1200, sha: "f1" }],
}

/** A diff review with the six generated outputs but no answers/score yet. */
function makeReview(snapshotId: number, prNumber = 42): NewDiffReview {
  return {
    snapshotId,
    prNumber,
    changedFiles: [
      { path: "src/app.ts", explanation: "Adds the request handler." },
    ],
    coreLogicExplanation: "Routes incoming requests to the new handler.",
    riskAnalysis: [
      { title: "Unbounded input", detail: "No size limit on the request body." },
    ],
    testSuggestions: [
      {
        description: "Reject oversized request bodies.",
        rationale: "Covers the unbounded-input risk.",
      },
    ],
    comprehensionQuestions: [
      { id: "q1", prompt: "What does the new handler do?" },
    ],
  }
}

describe("diff_reviews migration + schema", () => {
  let db: ReturnType<typeof makeTestDb>

  beforeEach(() => {
    db = makeTestDb()
  })

  it("migration creates diff_reviews and stores the JSON review outputs", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()

    const [row] = db
      .insert(diffReviews)
      .values(makeReview(snap!.id))
      .returning()
      .all()

    expect(row?.prNumber).toBe(42)
    expect(row?.changedFiles).toHaveLength(1)
    expect(row?.changedFiles[0]?.path).toBe("src/app.ts")
    expect(row?.coreLogicExplanation).toContain("Routes")
    expect(row?.riskAnalysis[0]?.title).toBe("Unbounded input")
    expect(row?.testSuggestions).toHaveLength(1)
    expect(row?.comprehensionQuestions[0]?.id).toBe("q1")
    expect(row?.createdAt).toBeInstanceOf(Date)
  })

  it("leaves answers and score null until the check is completed", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    const [row] = db
      .insert(diffReviews)
      .values(makeReview(snap!.id))
      .returning()
      .all()

    expect(row?.answers).toBeNull()
    expect(row?.score).toBeNull()
    expect(row?.weakAreas).toBeNull()
  })

  it("stores graded answers, score, and the weak-area breakdown", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    const [row] = db
      .insert(diffReviews)
      .values(makeReview(snap!.id))
      .returning()
      .all()

    db.update(diffReviews)
      .set({
        answers: [{ questionId: "q1", answer: "It routes requests." }],
        score: 80,
        weakAreas: [
          { area: "risk-analysis", detail: "Missed the input-size risk." },
        ],
      })
      .where(eq(diffReviews.id, row!.id))
      .run()

    const [graded] = db
      .select()
      .from(diffReviews)
      .where(eq(diffReviews.id, row!.id))
      .all()

    expect(graded?.answers?.[0]?.answer).toBe("It routes requests.")
    expect(graded?.score).toBe(80)
    expect(graded?.weakAreas?.[0]?.area).toBe("risk-analysis")
  })

  it("enforces the snapshot/PR-number uniqueness constraint", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    db.insert(diffReviews).values(makeReview(snap!.id, 7)).run()

    expect(() =>
      db.insert(diffReviews).values(makeReview(snap!.id, 7)).run(),
    ).toThrow()
  })

  it("cascades review deletion when its snapshot is removed", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    db.insert(diffReviews).values(makeReview(snap!.id)).run()

    db.delete(repoSnapshots).where(eq(repoSnapshots.id, snap!.id)).run()

    expect(db.select().from(diffReviews).all()).toHaveLength(0)
  })
})
