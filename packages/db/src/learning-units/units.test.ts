// Tests for the `learning_units` data-access layer (Issue #135).
//
// create / read / update plus the answer / score / checklist-state mutators
// are exercised against a fresh in-memory SQLite with the real migrations
// applied, so the round-trip through the M11 snapshot data-access layer is
// covered end to end. Mirrors `../mapper/project-maps.test.ts` and
// `../diff/reviews.test.ts`. No network, no LLM — server-side only.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import {
  type ChecklistItemState,
  type LearningWeakArea,
  type NewRepoSnapshot,
  repoSnapshots,
  type UnderstandingAnswer,
  type UnderstandingScore,
} from "../schema"
import * as schema from "../schema"
import {
  createLearningUnit,
  getLearningUnit,
  getLearningUnitById,
  getLearningUnitByRepo,
  listLearningUnits,
  recordAnswers,
  recordScore,
  updateChecklistState,
  updateLearningUnit,
  type LearningUnitContent,
  type LearningUnitIdentity,
  type NewLearningUnitInput,
} from "./units"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
)

/** A fresh in-memory catalog DB with the real migrations applied. */
function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
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
    {
      path: "apps/web/app/api/health/route.ts",
      type: "blob",
      sha: "a",
      size: 200,
    },
    { path: "apps/web/app/page.tsx", type: "blob", sha: "b", size: 200 },
    { path: "packages/db/src/schema.ts", type: "blob", sha: "c", size: 300 },
  ],
}

const ISSUE_REF = "#42"
const SOURCE: LearningUnitIdentity["source"] = "github-issue"

/** A fully-shaped learning-unit content body — every related-file path is real. */
const content: LearningUnitContent = {
  restatedGoal: "Add a /health endpoint that returns 200 OK.",
  relatedFiles: [
    {
      path: "apps/web/app/api/health/route.ts",
      reason: "The new route handler this issue introduces.",
    },
  ],
  concepts: [
    {
      name: "route handlers",
      explanation:
        "Next.js App Router route handlers live under app/api/health/route.ts.",
    },
  ],
  agentExecutionNotes: [
    { order: 1, description: "Create the route handler file." },
    { order: 2, description: "Return a 200 OK JSON response." },
  ],
  reviewChecklist: [
    {
      id: "c1",
      description: "route.ts returns 200 OK with a JSON body.",
    },
    {
      id: "c2",
      description: "The route handler covers the GET method.",
    },
  ],
  questions: [
    { id: "q1", prompt: "How does Next.js know this file is a route?" },
    { id: "q2", prompt: "Why is the response a JSON body, not plain text?" },
  ],
  challengeConcept: "fault-injection",
  challengeType: "expand",
}

/** Build a `NewLearningUnitInput` against the seeded snapshot. */
function makeUnit(snapshotId: number): NewLearningUnitInput {
  return { snapshotId, source: SOURCE, issueRef: ISSUE_REF, ...content }
}

/** Insert the sample snapshot and return its id. */
function seedSnapshot(db: CatalogDb): number {
  return db.insert(repoSnapshots).values(snapshot).returning().get().id
}

describe("learning-units data-access", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    snapshotId = seedSnapshot(db)
  })

  it("createLearningUnit stores and returns the row", async () => {
    const row = await createLearningUnit(makeUnit(snapshotId), db)
    expect(row.snapshotId).toBe(snapshotId)
    expect(row.source).toBe(SOURCE)
    expect(row.issueRef).toBe(ISSUE_REF)
    expect(row.restatedGoal).toContain("/health")
    expect(row.relatedFiles).toHaveLength(1)
    expect(row.concepts[0]?.name).toBe("route handlers")
    expect(row.agentExecutionNotes).toHaveLength(2)
    expect(row.reviewChecklist).toHaveLength(2)
    expect(row.questions).toHaveLength(2)
    expect(row.challengeConcept).toBe("fault-injection")
    expect(row.challengeType).toBe("expand")
    // The user-mutable fields start null — R2 / R4 / R6.
    expect(row.userAnswers).toBeNull()
    expect(row.score).toBeNull()
    expect(row.weakAreas).toBeNull()
    expect(row.checklistState).toBeNull()
    expect(row.createdAt).toBeInstanceOf(Date)
    expect(row.updatedAt).toBeInstanceOf(Date)
  })

  it("getLearningUnit reads back the stored unit", async () => {
    await createLearningUnit(makeUnit(snapshotId), db)
    const row = await getLearningUnit(snapshotId, SOURCE, ISSUE_REF, db)
    expect(row?.restatedGoal).toContain("/health")
    expect(row?.relatedFiles[0]?.path).toBe(
      "apps/web/app/api/health/route.ts",
    )
    expect(row?.questions).toHaveLength(2)
  })

  it("getLearningUnit returns null for an issue/task without a unit", async () => {
    expect(await getLearningUnit(snapshotId, SOURCE, ISSUE_REF, db)).toBeNull()
  })

  it("getLearningUnit distinguishes the same issueRef across sources (R1)", async () => {
    await createLearningUnit(makeUnit(snapshotId), db)
    await createLearningUnit(
      { ...makeUnit(snapshotId), source: "ccpm-task", issueRef: ISSUE_REF },
      db,
    )
    const github = await getLearningUnit(snapshotId, "github-issue", ISSUE_REF, db)
    const ccpm = await getLearningUnit(snapshotId, "ccpm-task", ISSUE_REF, db)
    expect(github?.id).not.toBe(ccpm?.id)
  })

  it("getLearningUnitById reads a unit by its id", async () => {
    const created = await createLearningUnit(makeUnit(snapshotId), db)
    const row = await getLearningUnitById(created.id, db)
    expect(row?.id).toBe(created.id)
    expect(await getLearningUnitById(9999, db)).toBeNull()
  })

  it("getLearningUnitByRepo resolves the snapshot then the unit", async () => {
    await createLearningUnit(makeUnit(snapshotId), db)
    const row = await getLearningUnitByRepo(
      "acme",
      "portfolio",
      SOURCE,
      ISSUE_REF,
      "main",
      db,
    )
    expect(row?.snapshotId).toBe(snapshotId)
  })

  it("getLearningUnitByRepo returns null for an unknown repo", async () => {
    expect(
      await getLearningUnitByRepo("nope", "nope", SOURCE, ISSUE_REF, "main", db),
    ).toBeNull()
  })

  it("listLearningUnits returns every unit for a snapshot, oldest first", async () => {
    await createLearningUnit(makeUnit(snapshotId), db)
    await createLearningUnit(
      { ...makeUnit(snapshotId), issueRef: "#43" },
      db,
    )
    const rows = await listLearningUnits(snapshotId, db)
    expect(rows.map((r) => r.issueRef)).toEqual(["#42", "#43"])
  })

  it("updateLearningUnit replaces content and bumps updatedAt", async () => {
    const created = await createLearningUnit(makeUnit(snapshotId), db)
    const updated = await updateLearningUnit(
      { snapshotId, source: SOURCE, issueRef: ISSUE_REF },
      {
        restatedGoal: "Add /health and /ready endpoints.",
        challengeConcept: null,
      },
      db,
    )
    expect(updated?.restatedGoal).toContain("/ready")
    expect(updated?.challengeConcept).toBeNull()
    // The seven generated outputs we did NOT patch are preserved.
    expect(updated?.concepts).toHaveLength(1)
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.updatedAt.getTime(),
    )
  })

  it("updateLearningUnit returns null when there is nothing to update", async () => {
    expect(
      await updateLearningUnit(
        { snapshotId, source: SOURCE, issueRef: ISSUE_REF },
        { restatedGoal: "nope" },
        db,
      ),
    ).toBeNull()
  })

  it("createLearningUnit rejects a duplicate snapshot + source + issueRef", async () => {
    await createLearningUnit(makeUnit(snapshotId), db)
    await expect(
      createLearningUnit(makeUnit(snapshotId), db),
    ).rejects.toThrow()
  })

  it("recordAnswers persists the user's answers and leaves score/checklist alone (R4)", async () => {
    const created = await createLearningUnit(makeUnit(snapshotId), db)
    const answers: UnderstandingAnswer[] = [
      { questionId: "q1", answer: "Filename convention under app/api." },
      { questionId: "q2", answer: "API consumers expect JSON." },
    ]
    const updated = await recordAnswers(created.id, answers, db)
    expect(updated?.userAnswers).toHaveLength(2)
    expect(updated?.userAnswers?.[0]?.questionId).toBe("q1")
    // Score / weak areas / checklist state are not touched — R4 / R6.
    expect(updated?.score).toBeNull()
    expect(updated?.weakAreas).toBeNull()
    expect(updated?.checklistState).toBeNull()
  })

  it("recordAnswers returns null when no unit has that id", async () => {
    expect(await recordAnswers(9999, [], db)).toBeNull()
  })

  it("recordScore persists the score and weak-area breakdown without touching answers (R6)", async () => {
    const created = await createLearningUnit(makeUnit(snapshotId), db)
    const answers: UnderstandingAnswer[] = [
      { questionId: "q1", answer: "Conventional file routing." },
    ]
    await recordAnswers(created.id, answers, db)

    const score: UnderstandingScore = {
      overall: 82,
      perQuestion: [
        { questionId: "q1", score: 90 },
        { questionId: "q2", score: 74 },
      ],
    }
    const weakAreas: LearningWeakArea[] = [
      { area: "http-semantics", detail: "Did not mention HTTP method exports." },
    ]
    const updated = await recordScore(created.id, score, weakAreas, db)
    expect(updated?.score?.overall).toBe(82)
    expect(updated?.score?.perQuestion[0]?.questionId).toBe("q1")
    expect(updated?.weakAreas?.[0]?.area).toBe("http-semantics")
    // Answers are preserved — R6 does not couple the two writes.
    expect(updated?.userAnswers).toHaveLength(1)
  })

  it("recordScore returns null when no unit has that id", async () => {
    const score: UnderstandingScore = { overall: 0, perQuestion: [] }
    expect(await recordScore(9999, score, [], db)).toBeNull()
  })

  it("updateChecklistState persists tick state without affecting scoring (R4)", async () => {
    const created = await createLearningUnit(makeUnit(snapshotId), db)
    const state: ChecklistItemState[] = [
      { itemId: "c1", checked: true },
      { itemId: "c2", checked: false },
    ]
    const updated = await updateChecklistState(created.id, state, db)
    expect(updated?.checklistState).toHaveLength(2)
    expect(updated?.checklistState?.[0]?.checked).toBe(true)
    // Scoring fields are explicitly untouched — R4 is the load-bearing rule.
    expect(updated?.score).toBeNull()
    expect(updated?.weakAreas).toBeNull()
  })

  it("updateChecklistState returns null when no unit has that id", async () => {
    expect(await updateChecklistState(9999, [], db)).toBeNull()
  })

  it("a unit can be re-scored, replacing the prior score", async () => {
    const created = await createLearningUnit(makeUnit(snapshotId), db)
    await recordScore(
      created.id,
      { overall: 40, perQuestion: [{ questionId: "q1", score: 40 }] },
      [{ area: "weak", detail: "first attempt" }],
      db,
    )
    const second = await recordScore(
      created.id,
      { overall: 95, perQuestion: [{ questionId: "q1", score: 95 }] },
      [],
      db,
    )
    expect(second?.score?.overall).toBe(95)
    expect(second?.weakAreas).toEqual([])
  })
})
