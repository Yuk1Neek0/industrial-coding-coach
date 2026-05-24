// Verifies the learning_units migration (drizzle/0007_*) applies cleanly to a
// fresh database and that the learning_units table behaves as the schema
// declares: a child of repo_snapshots keyed by snapshot + source + issue ref,
// with the seven generated outputs round-tripping as JSON, the user-mutable
// columns (answers / score / weak areas / checklist state) null until
// populated, and the row cascade-deleted with its parent (M7
// issue-based-learning-workspace PRD; ADR 0006; R1 / R2 / R3 / R4).

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { eq } from "drizzle-orm"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import {
  learningUnits,
  repoSnapshots,
  type NewLearningUnit,
  type NewRepoSnapshot,
} from "./schema"
import * as schema from "./schema"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
)

/** A fresh in-memory DB with the real migrations applied (incl. 0007). */
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

/** A learning unit with the seven generated outputs but no answers/score yet. */
function makeUnit(
  snapshotId: number,
  overrides: Partial<NewLearningUnit> = {},
): NewLearningUnit {
  return {
    snapshotId,
    source: "github-issue",
    issueRef: "#42",
    restatedGoal: "Add a /health endpoint that returns 200 OK.",
    relatedFiles: [
      { path: "apps/web/app/api/health/route.ts", reason: "New endpoint." },
    ],
    concepts: [
      {
        name: "route handlers",
        explanation: "Next.js App Router file-based API routes.",
      },
    ],
    agentExecutionNotes: [
      { order: 1, description: "Create the route handler file." },
      { order: 2, description: "Return a 200 OK JSON response." },
    ],
    reviewChecklist: [
      { id: "c1", description: "Endpoint returns 200 OK." },
      { id: "c2", description: "Endpoint is reachable from the browser." },
    ],
    questions: [
      { id: "q1", prompt: "How does Next.js know this file is a route?" },
    ],
    challengeConcept: "fault-injection",
    challengeType: "expand",
    ...overrides,
  }
}

describe("learning_units migration + schema", () => {
  let db: ReturnType<typeof makeTestDb>

  beforeEach(() => {
    db = makeTestDb()
  })

  it("migration creates learning_units and stores the seven JSON outputs", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()

    const [row] = db
      .insert(learningUnits)
      .values(makeUnit(snap!.id))
      .returning()
      .all()

    expect(row?.snapshotId).toBe(snap!.id)
    expect(row?.source).toBe("github-issue")
    expect(row?.issueRef).toBe("#42")
    expect(row?.restatedGoal).toContain("/health")
    expect(row?.relatedFiles).toHaveLength(1)
    expect(row?.relatedFiles[0]?.path).toBe("apps/web/app/api/health/route.ts")
    expect(row?.concepts[0]?.name).toBe("route handlers")
    expect(row?.agentExecutionNotes).toHaveLength(2)
    expect(row?.agentExecutionNotes[0]?.order).toBe(1)
    expect(row?.reviewChecklist).toHaveLength(2)
    expect(row?.reviewChecklist[0]?.id).toBe("c1")
    expect(row?.questions[0]?.id).toBe("q1")
    expect(row?.challengeConcept).toBe("fault-injection")
    expect(row?.challengeType).toBe("expand")
    expect(row?.createdAt).toBeInstanceOf(Date)
    expect(row?.updatedAt).toBeInstanceOf(Date)
  })

  it("accepts the ccpm-task source value (R1 normalization)", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()

    const [row] = db
      .insert(learningUnits)
      .values(
        makeUnit(snap!.id, { source: "ccpm-task", issueRef: "epic/foo/003" }),
      )
      .returning()
      .all()

    expect(row?.source).toBe("ccpm-task")
    expect(row?.issueRef).toBe("epic/foo/003")
  })

  it("leaves user answers, score, weak areas, and checklist state null until populated (R2, R4)", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    const [row] = db
      .insert(learningUnits)
      .values(makeUnit(snap!.id))
      .returning()
      .all()

    expect(row?.userAnswers).toBeNull()
    expect(row?.score).toBeNull()
    expect(row?.weakAreas).toBeNull()
    expect(row?.checklistState).toBeNull()
  })

  it("leaves the challenge stub fields null when omitted (R3 — stub only)", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    const [row] = db
      .insert(learningUnits)
      .values(
        makeUnit(snap!.id, { challengeConcept: null, challengeType: null }),
      )
      .returning()
      .all()

    expect(row?.challengeConcept).toBeNull()
    expect(row?.challengeType).toBeNull()
  })

  it("stores graded answers, the per-attempt score, the weak-area breakdown, and checklist state", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    const [row] = db
      .insert(learningUnits)
      .values(makeUnit(snap!.id))
      .returning()
      .all()

    db.update(learningUnits)
      .set({
        userAnswers: [
          { questionId: "q1", answer: "The file's location in app/api." },
        ],
        score: {
          overall: 80,
          perQuestion: [{ questionId: "q1", score: 80 }],
        },
        weakAreas: [
          {
            area: "route-handler-conventions",
            detail: "Did not mention HTTP method exports.",
          },
        ],
        checklistState: [
          { itemId: "c1", checked: true },
          { itemId: "c2", checked: false },
        ],
      })
      .where(eq(learningUnits.id, row!.id))
      .run()

    const [graded] = db
      .select()
      .from(learningUnits)
      .where(eq(learningUnits.id, row!.id))
      .all()

    expect(graded?.userAnswers?.[0]?.answer).toContain("app/api")
    expect(graded?.score?.overall).toBe(80)
    expect(graded?.score?.perQuestion[0]?.questionId).toBe("q1")
    expect(graded?.weakAreas?.[0]?.area).toBe("route-handler-conventions")
    expect(graded?.checklistState).toHaveLength(2)
    expect(graded?.checklistState?.[0]?.checked).toBe(true)
  })

  it("enforces the snapshot + source + issueRef uniqueness constraint", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    db.insert(learningUnits)
      .values(makeUnit(snap!.id, { source: "github-issue", issueRef: "#7" }))
      .run()

    // Same (snapshot, source, issueRef) — must fail.
    expect(() =>
      db
        .insert(learningUnits)
        .values(makeUnit(snap!.id, { source: "github-issue", issueRef: "#7" }))
        .run(),
    ).toThrow()

    // Same snapshot + issueRef but different source — allowed (R1: source is
    // part of the unit's identity).
    expect(() =>
      db
        .insert(learningUnits)
        .values(makeUnit(snap!.id, { source: "ccpm-task", issueRef: "#7" }))
        .run(),
    ).not.toThrow()
  })

  it("requires a valid owning snapshot", () => {
    expect(() =>
      db.insert(learningUnits).values(makeUnit(999)).run(),
    ).toThrow()
  })

  it("cascades unit deletion when its snapshot is removed", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    db.insert(learningUnits).values(makeUnit(snap!.id)).run()

    db.delete(repoSnapshots).where(eq(repoSnapshots.id, snap!.id)).run()

    expect(db.select().from(learningUnits).all()).toHaveLength(0)
  })
})
