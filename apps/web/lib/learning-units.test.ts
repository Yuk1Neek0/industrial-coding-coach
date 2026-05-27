// End-to-end happy-path test for the M7 Issue Learning Workspace integration
// (issue-based-learning-workspace epic, task #138).
//
// Drives the orchestration layer that wires the `/repos/[owner]/[repo]/issues`
// + `/repos/[owner]/[repo]/issues/[issueRef]` routes to the bounded generation
// call (#133), the bounded grading call (#134), and the `learning_units`
// data-access layer (#135). CI contract: no `ANTHROPIC_API_KEY`, no live
// GitHub calls, no network — both bounded SDK calls are injected as fakes;
// CCPM-task input is read from the M11 snapshot.
//
// Mirrors `apps/web/lib/project-mapper.test.ts` for the in-memory SQLite
// migration harness.

import path from "node:path"
import { fileURLToPath } from "node:url"

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "@workspace/db"
import {
  type GenerateLearningUnitData,
  type GenerateLearningUnitResult,
  type GradeLearningUnitData,
  type GradeLearningUnitResult,
  IntegrityError,
  type LearningUnitContent,
  type UnderstandingAnswer,
} from "@workspace/db/learning-units"
import {
  type NewRepoFile,
  type NewRepoSnapshot,
  repoFiles,
  repoSnapshots,
} from "@workspace/db/schema"
import * as schema from "@workspace/db/schema"

import {
  ensureLearningUnit,
  getIssuesPageData,
  getLearningUnitView,
  gradeLearningUnitAnswers,
  readLearningUnitView,
  toggleChecklistItem,
} from "./learning-units"

// The real migrations live in the `@workspace/db` package.
const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "db",
  "drizzle",
)

/** A fresh in-memory catalog DB with the real migrations applied. */
function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db as unknown as CatalogDb
}

/** A representative snapshot with the file paths the unit will reference. */
const snapshotFixture: NewRepoSnapshot = {
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
    { path: ".claude/epics/auth/003.md", type: "blob", sha: "c", size: 500 },
  ],
}

/** Stored content for a key file the generation call's tool would read. */
const healthRouteFile: Omit<NewRepoFile, "snapshotId" | "id" | "createdAt" | "updatedAt"> = {
  path: "apps/web/app/api/health/route.ts",
  content:
    "export async function GET() {\n  return Response.json({ status: 'ok' })\n}\n",
  size: 80,
  category: "source",
  sha: "a",
}

/** A CCPM task markdown file shipped via the snapshot, used by `listCcpmTasks`. */
const ccpmTaskFile: Omit<NewRepoFile, "snapshotId" | "id" | "createdAt" | "updatedAt"> = {
  path: ".claude/epics/auth/003.md",
  content:
    "---\nname: Add a /health endpoint\nstatus: open\n---\n\nAdd a route handler at apps/web/app/api/health/route.ts that returns 200 OK.\n",
  size: 200,
  category: "source",
  sha: "c",
}

/** The seven-part learning-unit content the fake generator returns. */
const generatedContent: LearningUnitContent = {
  restatedGoal:
    "Add a /health endpoint at apps/web/app/api/health/route.ts returning 200 OK with a small JSON body.",
  relatedFiles: [
    {
      path: "apps/web/app/api/health/route.ts",
      reason:
        "The new route handlers file the issue introduces — the route this unit teaches.",
    },
  ],
  concepts: [
    {
      name: "route handlers",
      explanation:
        "Next.js App Router route handlers live under apps/web/app/api/health/route.ts.",
    },
  ],
  agentExecutionNotes: [
    { order: 1, description: "Create the route handler file." },
    { order: 2, description: "Return Response.json({status: 'ok'})." },
  ],
  reviewChecklist: [
    {
      id: "c1",
      description:
        "apps/web/app/api/health/route.ts returns 200 OK with a JSON body.",
    },
    {
      id: "c2",
      description: "The route handlers cover the GET method.",
    },
  ],
  questions: [
    { id: "q1", prompt: "How does Next.js know this file is a route?" },
    { id: "q2", prompt: "What does Response.json do here?" },
  ],
  challengeConcept: "fault-injection",
  challengeType: "expand",
}

/** A fake bounded generation call that returns the canned unit content. */
function fakeGenerate(): (
  args: Parameters<typeof ensureLearningUnit>[4] extends
    | undefined
    | ((args: infer A) => Promise<GenerateLearningUnitResult>)
    ? A
    : never,
) => Promise<GenerateLearningUnitResult> {
  return async () => {
    const data: GenerateLearningUnitData = {
      content: generatedContent,
      integrity: { ok: true, unresolved: [] },
    }
    return { ok: true, data }
  }
}

/** A fake bounded grading call producing a fixed score + one weak area. */
async function fakeGrade(input: {
  answers: UnderstandingAnswer[]
}): Promise<GradeLearningUnitResult> {
  const data: GradeLearningUnitData = {
    score: {
      overall: 78,
      perQuestion: [
        { questionId: "q1", score: 85 },
        { questionId: "q2", score: 70 },
      ],
    },
    weakAreas: [
      {
        area: "http-semantics",
        detail:
          "Could explain Response.json in more depth — content-type, defaults.",
      },
    ],
    answers: input.answers,
  }
  return { ok: true, data }
}

/** Seed a snapshot + its key file + a CCPM task file. */
function seedSnapshot(db: CatalogDb): number {
  const snap = db
    .insert(repoSnapshots)
    .values(snapshotFixture)
    .returning()
    .get()
  db.insert(repoFiles)
    .values({ ...healthRouteFile, snapshotId: snap.id })
    .run()
  db.insert(repoFiles)
    .values({ ...ccpmTaskFile, snapshotId: snap.id })
    .run()
  return snap.id
}

describe("M7 apps/web integration — happy path (#138)", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    snapshotId = seedSnapshot(db)
  })

  it("getIssuesPageData lists CCPM tasks even when GitHub is unreachable", async () => {
    // With no GITHUB_TOKEN and no network in CI, `listIssues` will fail; the
    // page still renders with the CCPM tasks from the snapshot.
    const data = await getIssuesPageData("acme", "portfolio", db)
    expect(data.snapshotExists).toBe(true)
    expect(data.identity?.owner).toBe("acme")
    const ccpmRow = data.rows.find((r) => r.source === "ccpm-task")
    expect(ccpmRow).toBeDefined()
    expect(ccpmRow?.issueRef).toBe("epic/auth/003")
    // No learning unit yet, so the row reads `not started`.
    expect(ccpmRow?.status).toBe("not started")
  })

  it("getIssuesPageData renders not-imported state for an unknown repo", async () => {
    const data = await getIssuesPageData("ghost", "nope", db)
    expect(data.snapshotExists).toBe(false)
    expect(data.rows).toHaveLength(0)
  })

  it("ensureLearningUnit generates a unit on first visit and short-circuits on the second (FR-2, FR-3)", async () => {
    const generated = await ensureLearningUnit(
      "acme",
      "portfolio",
      "epic/auth/003",
      db,
      fakeGenerate(),
    )
    expect(generated.ok).toBe(true)
    if (!generated.ok) return
    const firstUnitId = generated.unitId

    // Second call hits the short-circuit (no generator invocation needed —
    // the unit already exists for this identity).
    const sneverInvoked = await ensureLearningUnit(
      "acme",
      "portfolio",
      "epic/auth/003",
      db,
      async () => {
        throw new Error("should not be called — unit already exists")
      },
    )
    expect(sneverInvoked.ok).toBe(true)
    if (sneverInvoked.ok) {
      expect(sneverInvoked.unitId).toBe(firstUnitId)
    }
  })

  it("ensureLearningUnit surfaces an integrity failure as a typed error (FR-4)", async () => {
    const result = await ensureLearningUnit(
      "acme",
      "portfolio",
      "epic/auth/003",
      db,
      async () => ({
        ok: false,
        error: new IntegrityError(
          "Unit references unknown path.",
          [
            {
              kind: "related-file",
              value: "apps/web/missing.ts",
              reason: "Path not in snapshot.",
            },
          ],
          generatedContent,
        ),
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("integrity-failed")
    }
  })

  it("getLearningUnitView projects a stored unit with related files and integrity (FR-4)", async () => {
    const ensured = await ensureLearningUnit(
      "acme",
      "portfolio",
      "epic/auth/003",
      db,
      fakeGenerate(),
    )
    expect(ensured.ok).toBe(true)

    const view = await getLearningUnitView(
      "acme",
      "portfolio",
      "epic/auth/003",
      db,
    )
    expect(view.ok).toBe(true)
    if (!view.ok) return
    const u = view.unit
    expect(u.restatedGoal).toContain("/health")
    expect(u.relatedFiles).toHaveLength(1)
    expect(u.relatedFiles[0]?.resolved).toBe(true)
    expect(u.concepts).toHaveLength(1)
    expect(u.agentExecutionNotes).toHaveLength(2)
    expect(u.reviewChecklist).toHaveLength(2)
    expect(u.questions).toHaveLength(2)
    expect(u.integrity.ok).toBe(true)
    // FR-6 / R4 — no checklist state yet, no answers, no score.
    expect(u.checklistState).toEqual({})
    expect(u.userAnswers).toBeNull()
    expect(u.score).toBeNull()
  })

  it("toggleChecklistItem persists tick state and never affects the score (R4)", async () => {
    const ensured = await ensureLearningUnit(
      "acme",
      "portfolio",
      "epic/auth/003",
      db,
      fakeGenerate(),
    )
    expect(ensured.ok).toBe(true)
    if (!ensured.ok) return

    const toggled = await toggleChecklistItem(ensured.unitId, "c1", true, db)
    expect(toggled.ok).toBe(true)
    if (!toggled.ok) return
    expect(toggled.checklistState["c1"]).toBe(true)
    expect(toggled.checklistState["c2"]).toBeUndefined()

    // Reload the view — the tick state persists, the score remains null
    // (no answers submitted; ticking does not grade — R4).
    const reread = await readLearningUnitView(ensured.unitId, db)
    expect(reread?.checklistState["c1"]).toBe(true)
    expect(reread?.score).toBeNull()
  })

  it("gradeLearningUnitAnswers persists Score + WeakArea[] and the issues list flips to 'scored' (R6, FR-5)", async () => {
    const ensured = await ensureLearningUnit(
      "acme",
      "portfolio",
      "epic/auth/003",
      db,
      fakeGenerate(),
    )
    expect(ensured.ok).toBe(true)
    if (!ensured.ok) return

    // Mark a checklist item BEFORE grading to prove R4 (checklist independent).
    await toggleChecklistItem(ensured.unitId, "c1", true, db)

    const answers: UnderstandingAnswer[] = [
      { questionId: "q1", answer: "Convention-based routing under app/api." },
      { questionId: "q2", answer: "Response.json sets the JSON content-type." },
    ]
    const graded = await gradeLearningUnitAnswers(
      ensured.unitId,
      answers,
      db,
      fakeGrade,
    )
    expect(graded.ok).toBe(true)
    if (!graded.ok) return
    expect(graded.unit.score?.overall).toBe(78)
    expect(graded.unit.weakAreas?.[0]?.area).toBe("http-semantics")
    expect(graded.unit.userAnswers).toHaveLength(2)
    // The checklist tick persisted across grading — independent at the
    // persistence layer (R4).
    expect(graded.unit.checklistState["c1"]).toBe(true)

    // The Per-repo Issues List page now reads the unit as `scored` (R6).
    const issues = await getIssuesPageData("acme", "portfolio", db)
    const row = issues.rows.find((r) => r.issueRef === "epic/auth/003")
    expect(row?.status).toBe("scored")
    expect(row?.lastUpdatedAt).not.toBeNull()
  })

  it("reloading the unit page after answering renders the persisted Score / Weak Area state", async () => {
    const ensured = await ensureLearningUnit(
      "acme",
      "portfolio",
      "epic/auth/003",
      db,
      fakeGenerate(),
    )
    expect(ensured.ok).toBe(true)
    if (!ensured.ok) return

    const answers: UnderstandingAnswer[] = [
      { questionId: "q1", answer: "Convention-based routing." },
    ]
    await gradeLearningUnitAnswers(ensured.unitId, answers, db, fakeGrade)

    // A returning user lands directly in the graded state (page spec §12).
    const view = await getLearningUnitView(
      "acme",
      "portfolio",
      "epic/auth/003",
      db,
    )
    expect(view.ok).toBe(true)
    if (!view.ok) return
    expect(view.unit.score?.overall).toBe(78)
    expect(view.unit.userAnswers).toHaveLength(1)
    expect(view.unit.weakAreas).toHaveLength(1)
  })

  it("getIssuesPageData reflects in-progress status after ticking one checklist item (FR-6)", async () => {
    const ensured = await ensureLearningUnit(
      "acme",
      "portfolio",
      "epic/auth/003",
      db,
      fakeGenerate(),
    )
    if (!ensured.ok) return
    await toggleChecklistItem(ensured.unitId, "c1", true, db)

    const data = await getIssuesPageData("acme", "portfolio", db)
    const row = data.rows.find((r) => r.issueRef === "epic/auth/003")
    expect(row?.status).toBe("in progress")
  })

  it("readLearningUnitView returns null for an unknown unit id", async () => {
    expect(await readLearningUnitView(9999, db)).toBeNull()
  })
})
