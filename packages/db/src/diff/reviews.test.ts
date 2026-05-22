import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import { type NewRepoSnapshot, repoSnapshots } from "../schema"
import * as schema from "../schema"
import {
  checkDiffReviewIntegrity,
  checkReviewFileReferences,
  type ChangedFileSet,
  createDiffReview,
  type DiffReviewContent,
  type DiffReviewGrading,
  getDiffReview,
  getDiffReviewById,
  getDiffReviewByRepo,
  gradeDiffReview,
  listDiffReviews,
  saveDiffReview,
  updateDiffReview,
} from "./reviews"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
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

const snapshot: NewRepoSnapshot = {
  owner: "acme",
  repo: "portfolio",
  ref: "main",
  commitSha: "deadbeef",
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/portfolio",
  fileTree: [
    { path: "apps/web/app/page.tsx", type: "blob", sha: "a", size: 200 },
    { path: "apps/web/lib/auth.ts", type: "blob", sha: "b", size: 80 },
  ],
}

const PR_NUMBER = 42

/** The PR's changed-file set the integrity check verifies references against. */
const changeSet: ChangedFileSet = {
  files: [
    { path: "apps/web/app/page.tsx" },
    { path: "apps/web/lib/auth.ts" },
  ],
}

const content: DiffReviewContent = {
  changedFiles: [
    {
      path: "apps/web/app/page.tsx",
      explanation: "Adds the sign-in button to the landing page.",
    },
    {
      path: "apps/web/lib/auth.ts",
      explanation: "Introduces the session-token helper.",
    },
  ],
  coreLogicExplanation:
    "The PR wires a new session helper into the landing page's sign-in flow.",
  riskAnalysis: [
    {
      title: "Unvalidated token",
      detail: "auth.ts does not check token expiry before trusting it.",
    },
  ],
  testSuggestions: [
    {
      description: "Assert an expired token is rejected.",
      rationale: "Covers the expiry gap flagged in the risk analysis.",
    },
  ],
  comprehensionQuestions: [
    { id: "q1", prompt: "Why is the session helper a separate module?" },
    { id: "q2", prompt: "What happens when the token is expired?" },
  ],
}

const grading: DiffReviewGrading = {
  answers: [
    { questionId: "q1", answer: "To keep auth logic out of the page." },
    { questionId: "q2", answer: "Nothing — that is the risk." },
  ],
  score: 78,
  weakAreas: [
    {
      area: "risk-analysis",
      detail: "Did not articulate the security impact of the expiry gap.",
    },
  ],
}

/** Insert the sample snapshot and return its id. */
function seedSnapshot(db: CatalogDb): number {
  return db.insert(repoSnapshots).values(snapshot).returning().get().id
}

describe("diff-reviews data-access", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    snapshotId = seedSnapshot(db)
  })

  it("createDiffReview stores and returns the row", async () => {
    const row = await createDiffReview(snapshotId, PR_NUMBER, content, db)
    expect(row.snapshotId).toBe(snapshotId)
    expect(row.prNumber).toBe(PR_NUMBER)
    expect(row.changedFiles).toHaveLength(2)
    expect(row.coreLogicExplanation).toContain("session helper")
    // The grading fields start null — a review is graded later.
    expect(row.answers).toBeNull()
    expect(row.score).toBeNull()
    expect(row.weakAreas).toBeNull()
  })

  it("getDiffReview reads back the stored review", async () => {
    await createDiffReview(snapshotId, PR_NUMBER, content, db)
    const row = await getDiffReview(snapshotId, PR_NUMBER, db)
    expect(row?.riskAnalysis[0]?.title).toBe("Unvalidated token")
    expect(row?.comprehensionQuestions).toHaveLength(2)
  })

  it("getDiffReview returns null for an unreviewed PR", async () => {
    expect(await getDiffReview(snapshotId, PR_NUMBER, db)).toBeNull()
  })

  it("getDiffReviewById reads a review by its id", async () => {
    const created = await createDiffReview(snapshotId, PR_NUMBER, content, db)
    const row = await getDiffReviewById(created.id, db)
    expect(row?.id).toBe(created.id)
    expect(await getDiffReviewById(9999, db)).toBeNull()
  })

  it("updateDiffReview replaces content and bumps updatedAt", async () => {
    const created = await createDiffReview(snapshotId, PR_NUMBER, content, db)
    const updated = await updateDiffReview(
      snapshotId,
      PR_NUMBER,
      { ...content, riskAnalysis: [] },
      db,
    )
    expect(updated?.riskAnalysis).toEqual([])
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.updatedAt.getTime(),
    )
  })

  it("updateDiffReview returns null when there is nothing to update", async () => {
    expect(
      await updateDiffReview(snapshotId, PR_NUMBER, content, db),
    ).toBeNull()
  })

  it("saveDiffReview creates then replaces the row in place", async () => {
    const first = await saveDiffReview(snapshotId, PR_NUMBER, content, db)
    const second = await saveDiffReview(
      snapshotId,
      PR_NUMBER,
      { ...content, riskAnalysis: [] },
      db,
    )
    expect(second.id).toBe(first.id)
    expect(second.riskAnalysis).toEqual([])
    // Still exactly one review for the snapshot + PR.
    expect(await listDiffReviews(snapshotId, db)).toHaveLength(1)
  })

  it("listDiffReviews returns every review for a snapshot, oldest first", async () => {
    await createDiffReview(snapshotId, 1, content, db)
    await createDiffReview(snapshotId, 2, content, db)
    const rows = await listDiffReviews(snapshotId, db)
    expect(rows.map((r) => r.prNumber)).toEqual([1, 2])
  })

  it("getDiffReviewByRepo resolves the snapshot then the review", async () => {
    await createDiffReview(snapshotId, PR_NUMBER, content, db)
    const row = await getDiffReviewByRepo(
      "acme",
      "portfolio",
      PR_NUMBER,
      "main",
      db,
    )
    expect(row?.snapshotId).toBe(snapshotId)
  })

  it("getDiffReviewByRepo returns null for an unknown repo", async () => {
    expect(
      await getDiffReviewByRepo("nope", "nope", PR_NUMBER, "main", db),
    ).toBeNull()
  })

  it("gradeDiffReview stores the user's answers and the score", async () => {
    await createDiffReview(snapshotId, PR_NUMBER, content, db)
    const graded = await gradeDiffReview(snapshotId, PR_NUMBER, grading, db)
    expect(graded?.answers).toHaveLength(2)
    expect(graded?.answers?.[0]?.questionId).toBe("q1")
    expect(graded?.score).toBe(78)
    expect(graded?.weakAreas?.[0]?.area).toBe("risk-analysis")
  })

  it("gradeDiffReview leaves the generated review content untouched", async () => {
    await createDiffReview(snapshotId, PR_NUMBER, content, db)
    await gradeDiffReview(snapshotId, PR_NUMBER, grading, db)
    const row = await getDiffReview(snapshotId, PR_NUMBER, db)
    expect(row?.comprehensionQuestions).toHaveLength(2)
    expect(row?.coreLogicExplanation).toContain("session helper")
  })

  it("gradeDiffReview returns null when there is no review to grade", async () => {
    expect(
      await gradeDiffReview(snapshotId, PR_NUMBER, grading, db),
    ).toBeNull()
  })

  it("a review can be re-graded, replacing the prior score", async () => {
    await createDiffReview(snapshotId, PR_NUMBER, content, db)
    await gradeDiffReview(snapshotId, PR_NUMBER, grading, db)
    const regraded = await gradeDiffReview(
      snapshotId,
      PR_NUMBER,
      { ...grading, score: 95, weakAreas: [] },
      db,
    )
    expect(regraded?.score).toBe(95)
    expect(regraded?.weakAreas).toEqual([])
  })
})

describe("checkReviewFileReferences", () => {
  it("passes when every cited changed-file path resolves in the PR", () => {
    const result = checkReviewFileReferences(content, changeSet)
    expect(result.ok).toBe(true)
    expect(result.missingChangedFiles).toEqual([])
  })

  it("fails and lists changed-file paths not in the PR's changed set", () => {
    const result = checkReviewFileReferences(
      {
        ...content,
        changedFiles: [
          { path: "apps/web/ghost.ts", explanation: "Not in this PR." },
        ],
      },
      changeSet,
    )
    expect(result.ok).toBe(false)
    expect(result.missingChangedFiles).toEqual(["apps/web/ghost.ts"])
  })

  it("accepts a full PullRequestChangeModel-shaped change set", () => {
    const model = {
      files: [
        { path: "apps/web/app/page.tsx" },
        { path: "apps/web/lib/auth.ts" },
      ],
    }
    expect(checkReviewFileReferences(content, model).ok).toBe(true)
  })
})

describe("checkDiffReviewIntegrity", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    snapshotId = seedSnapshot(db)
  })

  it("returns null when the PR has no stored review", async () => {
    expect(
      await checkDiffReviewIntegrity(snapshotId, PR_NUMBER, changeSet, db),
    ).toBeNull()
  })

  it("returns null when the snapshot does not exist", async () => {
    expect(
      await checkDiffReviewIntegrity(9999, PR_NUMBER, changeSet, db),
    ).toBeNull()
  })

  it("checks a stored review against the PR's changed-file set", async () => {
    await createDiffReview(snapshotId, PR_NUMBER, content, db)
    const result = await checkDiffReviewIntegrity(
      snapshotId,
      PR_NUMBER,
      changeSet,
      db,
    )
    expect(result?.ok).toBe(true)
  })

  it("catches a stored review that cites an unresolvable file reference", async () => {
    await createDiffReview(
      snapshotId,
      PR_NUMBER,
      {
        ...content,
        changedFiles: [
          {
            path: "apps/web/app/page.tsx",
            explanation: "A real changed file.",
          },
          {
            path: "apps/web/lib/phantom.ts",
            explanation: "Cited but never changed by the PR.",
          },
        ],
      },
      db,
    )
    const result = await checkDiffReviewIntegrity(
      snapshotId,
      PR_NUMBER,
      changeSet,
      db,
    )
    expect(result?.ok).toBe(false)
    expect(result?.missingChangedFiles).toEqual(["apps/web/lib/phantom.ts"])
  })
})
