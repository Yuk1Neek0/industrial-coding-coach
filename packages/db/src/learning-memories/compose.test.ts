// Tests for the M10 deterministic composition module (Issue #179).
//
// The three composers (architecture explanation, learning memory tree, debug
// stories) are exercised against fresh in-memory SQLite databases with the
// real migrations applied, seeded with sample M5 stack explanation, M6
// project map, M7 learning units, M8 diff reviews, and M9 challenges +
// challenge attempts (with grading). Mirrors the test posture of
// `./memories.test.ts` and `./integrity.test.ts` — fixtures live in-process
// so every DAL read goes through the real Drizzle layer.
//
// Cases covered (179.md acceptance criteria):
//   1. All three composers on a richly seeded snapshot return well-typed
//      output that cites real M5 tools + real M6 files.
//   2. Weak-area surface: a learning unit + a diff review + a challenge
//      attempt each contribute a `stillToRevisit` entry that names the
//      milestone and the row id (PRD FR-4).
//   3. Empty-input degradation: missing M5 / M6 / M7 / M8 / M9 rows each
//      emit the "none yet" / `[]` path without throwing.
//   4. Reproducibility (NFR-2): two calls on the same fixture serialise to
//      byte-identical JSON.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import {
  createChallenge,
  createChallengeAttempt,
  gradeChallengeAttempt,
  type ChallengeAttemptSubmission,
  type ChallengeContent,
} from "../challenges/challenges"
import {
  createDiffReview,
  gradeDiffReview,
  type DiffReviewContent,
} from "../diff/reviews"
import {
  createLearningUnit,
  recordScore,
  type NewLearningUnitInput,
} from "../learning-units/units"
import { saveProjectMap, type ProjectMapContent } from "../mapper/project-maps"
import {
  type NewRepoSnapshot,
  type RepoTreeEntry,
  repoSnapshots,
} from "../schema"
import * as schema from "../schema"
import {
  saveStackExplanation,
  type StackExplanationContent,
} from "../stack/explanations"
import {
  composeArchitectureExplanation,
  composeDebugStories,
  composeLearningMemoryTree,
} from "./compose"

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

const fileTree: RepoTreeEntry[] = [
  { path: "package.json", type: "blob", sha: "a", size: 100 },
  { path: "apps/web/app/page.tsx", type: "blob", sha: "b", size: 200 },
  { path: "apps/web/app/actions.ts", type: "blob", sha: "c", size: 150 },
  { path: "packages/db/src/schema.ts", type: "blob", sha: "d", size: 300 },
]

const snapshot: NewRepoSnapshot = {
  owner: "acme",
  repo: "portfolio",
  ref: "main",
  commitSha: "deadbeef",
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/portfolio",
  fileTree,
}

const stackContent: StackExplanationContent = {
  tools: [
    {
      name: "Next.js",
      purpose: "Renders the app's routes and pages.",
      alternatives: [
        { name: "Remix", tradeOff: "Different routing and data model." },
      ],
      jobRelevance: "Heavy demand for React roles.",
    },
    {
      name: "Drizzle ORM",
      purpose: "Types the local SQLite catalog.",
      alternatives: [],
      jobRelevance: "Modern TS-native ORM.",
    },
  ],
  keyFiles: [
    { path: "package.json", reason: "Declares the dependency stack." },
  ],
  debugEntryPoints: [],
}

const projectMapContent: ProjectMapContent = {
  architectureOverview: [
    { title: "Frontend", detail: "Next.js App Router under apps/web/app/." },
    { title: "Data layer", detail: "Drizzle ORM over a local SQLite catalog." },
  ],
  keyFileMap: [
    { path: "apps/web/app/page.tsx", role: "Home page." },
    { path: "apps/web/app/actions.ts", role: "Server actions for the page." },
    { path: "packages/db/src/schema.ts", role: "Database schema." },
  ],
  requestDataFlow: [
    {
      order: 1,
      description: "Browser requests /",
      path: "apps/web/app/page.tsx",
    },
    {
      order: 2,
      description: "Server action loads data",
      path: "apps/web/app/actions.ts",
    },
  ],
  stateFlow: [],
  aiCallFlow: [],
  mermaidDiagram: "graph TD; A-->B;",
  debugPath: [],
}

const learningUnitInput: NewLearningUnitInput = {
  snapshotId: 0, // overwritten in seed
  source: "github-issue",
  issueRef: "#42",
  restatedGoal: "Add a /health endpoint that returns 200 OK.",
  relatedFiles: [
    {
      path: "apps/web/app/actions.ts",
      reason: "Server action layer for the new endpoint.",
    },
  ],
  concepts: [
    {
      name: "Server Actions",
      explanation: "Next.js App Router server-side procedures.",
    },
  ],
  agentExecutionNotes: [
    { order: 1, description: "Create the route handler." },
  ],
  reviewChecklist: [
    { id: "rc-1", description: "Endpoint returns 200." },
  ],
  questions: [{ id: "q-1", prompt: "Why use a server action?" }],
}

const diffReviewContent: DiffReviewContent = {
  changedFiles: [
    {
      path: "apps/web/app/actions.ts",
      explanation: "Added a /health server action.",
    },
  ],
  coreLogicExplanation:
    "The PR introduces a /health endpoint via a Next.js server action.",
  riskAnalysis: [
    { title: "Cold-start failure", detail: "DB client may not be initialised." },
  ],
  testSuggestions: [
    {
      description: "Hit /health on cold-start.",
      rationale: "Catches lazy-init issues.",
    },
  ],
  comprehensionQuestions: [
    { id: "cq-1", prompt: "Explain the cold-start risk." },
  ],
}

const challengeContent: ChallengeContent = {
  taskDescription: "Trace why /health returned 500 on cold-start.",
  inScopeFiles: ["apps/web/app/actions.ts"],
  outOfScopeFiles: ["packages/db/src/schema.ts"],
  acceptanceCriteria: [
    { id: "ac-1", detail: "Names the cold-start lazy-init issue." },
  ],
  sourceReferences: [
    {
      section: "keyFileMap",
      path: "apps/web/app/actions.ts",
      note: "M6 names this file as the server action layer.",
    },
  ],
}

const challengeSubmission: ChallengeAttemptSubmission = {
  explanation:
    "The server action threw before responding because the DB client wasn't " +
    "initialised on cold-start; the lazy-init path runs only after the first " +
    "DB read, so /health (which doesn't touch the DB) skipped the init.",
  snippets: [],
  filePaths: ["apps/web/app/actions.ts"],
}

/**
 * Seed every milestone's row for one snapshot — used by the "richly seeded"
 * cases. Returns the snapshot id. The seeded shape is intentionally minimal
 * but complete: one M5 row with two tools, one M6 row with two layers, one
 * graded M7 unit with one weak area, one graded M8 review with one weak area,
 * one M9 challenge with one graded attempt with one weak area.
 */
async function seedRichSnapshot(db: CatalogDb): Promise<number> {
  const snapshotId = db
    .insert(repoSnapshots)
    .values(snapshot)
    .returning()
    .get().id

  await saveStackExplanation(snapshotId, stackContent, db)
  await saveProjectMap(snapshotId, projectMapContent, db)

  const unit = await createLearningUnit(
    { ...learningUnitInput, snapshotId },
    db,
  )
  await recordScore(
    unit.id,
    { overall: 80, perQuestion: [{ questionId: "q-1", score: 80 }] },
    [{ area: "data-flow", detail: "Couldn't explain why the action ran twice." }],
    db,
  )

  await createDiffReview(snapshotId, 7, diffReviewContent, db)
  await gradeDiffReview(
    snapshotId,
    7,
    {
      answers: [{ questionId: "cq-1", answer: "Lazy init." }],
      score: 65,
      weakAreas: [
        {
          area: "risk-analysis",
          detail: "Did not name the cold-start surface.",
        },
      ],
    },
    db,
  )

  const challenge = await createChallenge(
    snapshotId,
    "trace-failed-api-call",
    challengeContent,
    db,
  )
  const attempt = await createChallengeAttempt(
    challenge.id,
    challengeSubmission,
    db,
  )
  await gradeChallengeAttempt(
    attempt.id,
    {
      score: 78,
      weakAreas: [
        {
          area: "error-handling",
          detail: "Did not name the lazy-init source.",
        },
      ],
      criterionResults: [
        { criterionId: "ac-1", passed: true, detail: "Named the issue." },
      ],
      feedback: "Solid trace; tighten error-handling vocabulary.",
    },
    db,
  )

  return snapshotId
}

/** Insert just the snapshot — leaves every M5/M6/M7/M8/M9 row absent. */
function seedEmptySnapshot(db: CatalogDb): number {
  return db.insert(repoSnapshots).values(snapshot).returning().get().id
}

// ---------------------------------------------------------------------------
// Richly-seeded snapshot — all three composers' shape is correct
// ---------------------------------------------------------------------------

describe("compose — richly seeded snapshot", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedRichSnapshot(db)
  })

  it("composeArchitectureExplanation cites M5 tools + M6 files", async () => {
    const explanation = await composeArchitectureExplanation(snapshotId, db)
    // Stack section names every M5 tool by its canonical name.
    expect(explanation.stackSection.heading).toBe("Stack & tooling")
    expect(explanation.stackSection.body).toContain("Next.js")
    expect(explanation.stackSection.body).toContain("Drizzle ORM")
    expect(explanation.stackSection.citedFiles).toEqual(["package.json"])

    // Architecture section names every M6 layer + cites M6 keyFileMap paths.
    expect(explanation.architectureSection.heading).toBe("Architectural layers")
    expect(explanation.architectureSection.body).toContain("Frontend")
    expect(explanation.architectureSection.body).toContain("Data layer")
    expect(explanation.architectureSection.citedFiles).toEqual([
      "apps/web/app/actions.ts",
      "apps/web/app/page.tsx",
      "packages/db/src/schema.ts",
    ])

    // Key-flows section cites the path on the request/data flow step.
    expect(explanation.keyFlowsSection.heading).toBe("Key flows")
    expect(explanation.keyFlowsSection.body).toContain("Request / data flow")
    expect(explanation.keyFlowsSection.citedFiles).toEqual([
      "apps/web/app/actions.ts",
      "apps/web/app/page.tsx",
    ])

    // Intro names tools + layers.
    expect(explanation.intro).toContain("Next.js")
    expect(explanation.intro).toContain("Frontend")
  })

  it("composeLearningMemoryTree builds branches per milestone source", async () => {
    const tree = await composeLearningMemoryTree(snapshotId, db)

    const headings = tree.branches.map((b) => b.heading)
    expect(headings).toContain("From learning units")
    expect(headings).toContain("From diff reviews")
    expect(headings).toContain("From debug & expansion challenges")

    const unitBranch = tree.branches.find((b) => b.heading === "From learning units")
    expect(unitBranch?.leaves[0]?.source.milestone).toBe("M7")
    expect(unitBranch?.leaves[0]?.concept).toBe("Server Actions")

    const reviewBranch = tree.branches.find((b) => b.heading === "From diff reviews")
    expect(reviewBranch?.leaves[0]?.source.milestone).toBe("M8")

    const challengeBranch = tree.branches.find(
      (b) => b.heading === "From debug & expansion challenges",
    )
    expect(challengeBranch?.leaves[0]?.source.milestone).toBe("M9")
  })

  it("composeDebugStories returns one story per attempt", async () => {
    const stories = await composeDebugStories(snapshotId, db)
    expect(stories).toHaveLength(1)
    const [story] = stories
    expect(story?.challengeType).toBe("trace-failed-api-call")
    expect(story?.taskSummary).toBe(challengeContent.taskDescription)
    expect(story?.explanationExcerpt).toContain("DB client")
    expect(story?.gradingResult.score).toBe(78)
    expect(story?.gradingResult.passed).toBe(true)
    expect(story?.gradingResult.topWeakArea).toEqual({
      area: "error-handling",
      detail: "Did not name the lazy-init source.",
    })
  })
})

// ---------------------------------------------------------------------------
// Weak-area surface (PRD FR-4) — M7 + M8 + M9 each contribute one entry
// ---------------------------------------------------------------------------

describe("compose — weak-area surface (PRD FR-4)", () => {
  it(
    "stillToRevisit holds one entry per M7 / M8 / M9 weak area, each naming " +
      "its milestone and row id",
    async () => {
      const db = makeTestDb()
      const snapshotId = await seedRichSnapshot(db)
      const tree = await composeLearningMemoryTree(snapshotId, db)

      expect(tree.stillToRevisit).toHaveLength(3)
      const milestones = tree.stillToRevisit.map((e) => e.source.milestone)
      expect(milestones).toEqual(["M7", "M8", "M9"])

      // Each entry names a positive row id from its milestone's table.
      for (const entry of tree.stillToRevisit) {
        expect(entry.source.rowId).toBeGreaterThan(0)
      }

      const m7 = tree.stillToRevisit.find((e) => e.source.milestone === "M7")
      expect(m7?.area).toBe("data-flow")

      const m8 = tree.stillToRevisit.find((e) => e.source.milestone === "M8")
      expect(m8?.area).toBe("risk-analysis")

      const m9 = tree.stillToRevisit.find((e) => e.source.milestone === "M9")
      expect(m9?.area).toBe("error-handling")
    },
  )
})

// ---------------------------------------------------------------------------
// Empty-input degradation — missing rows emit "none yet" / [] without throwing
// ---------------------------------------------------------------------------

describe("compose — empty-input degradation", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    snapshotId = seedEmptySnapshot(db)
  })

  it(
    "composeArchitectureExplanation emits 'none yet' bodies for missing " +
      "M5 + M6 rows and does not throw",
    async () => {
      const explanation = await composeArchitectureExplanation(snapshotId, db)
      expect(explanation.stackSection.body).toMatch(/No stack explanation/)
      expect(explanation.stackSection.citedFiles).toEqual([])
      expect(explanation.architectureSection.body).toMatch(
        /No project logic map/,
      )
      expect(explanation.architectureSection.citedFiles).toEqual([])
      expect(explanation.keyFlowsSection.body).toMatch(/No project logic map/)
      expect(explanation.keyFlowsSection.citedFiles).toEqual([])
      expect(explanation.intro).toBeTypeOf("string")
    },
  )

  it(
    "composeArchitectureExplanation only-M5 still emits 'none yet' for the " +
      "architecture + flows sections",
    async () => {
      await saveStackExplanation(snapshotId, stackContent, db)
      const explanation = await composeArchitectureExplanation(snapshotId, db)
      expect(explanation.stackSection.body).toContain("Next.js")
      expect(explanation.architectureSection.body).toMatch(
        /No project logic map/,
      )
      expect(explanation.keyFlowsSection.body).toMatch(/No project logic map/)
    },
  )

  it(
    "composeArchitectureExplanation only-M6 still emits 'none yet' for the " +
      "stack section",
    async () => {
      await saveProjectMap(snapshotId, projectMapContent, db)
      const explanation = await composeArchitectureExplanation(snapshotId, db)
      expect(explanation.stackSection.body).toMatch(/No stack explanation/)
      expect(explanation.architectureSection.body).toContain("Frontend")
    },
  )

  it("composeLearningMemoryTree returns empty branches + empty stillToRevisit", async () => {
    const tree = await composeLearningMemoryTree(snapshotId, db)
    expect(tree.branches).toEqual([])
    expect(tree.stillToRevisit).toEqual([])
  })

  it("composeDebugStories returns [] for a snapshot with no challenges", async () => {
    const stories = await composeDebugStories(snapshotId, db)
    expect(stories).toEqual([])
  })

  it(
    "composeDebugStories returns [] when a challenge exists but has no " +
      "attempts (challenge generated, never attempted)",
    async () => {
      await createChallenge(snapshotId, "add-small-field", challengeContent, db)
      const stories = await composeDebugStories(snapshotId, db)
      expect(stories).toEqual([])
    },
  )

  it(
    "composeDebugStories renders an ungraded attempt with score 0 / passed " +
      "false / no topWeakArea (does not throw on null grading)",
    async () => {
      const challenge = await createChallenge(
        snapshotId,
        "add-small-field",
        challengeContent,
        db,
      )
      await createChallengeAttempt(challenge.id, challengeSubmission, db)
      const stories = await composeDebugStories(snapshotId, db)
      expect(stories).toHaveLength(1)
      expect(stories[0]?.gradingResult.score).toBe(0)
      expect(stories[0]?.gradingResult.passed).toBe(false)
      expect(stories[0]?.gradingResult.topWeakArea).toBeUndefined()
    },
  )
})

// ---------------------------------------------------------------------------
// Reproducibility (NFR-2) — two calls on identical seed serialise identically
// ---------------------------------------------------------------------------

describe("compose — reproducibility (NFR-2)", () => {
  it("composeArchitectureExplanation yields byte-identical JSON on two calls", async () => {
    const db = makeTestDb()
    const snapshotId = await seedRichSnapshot(db)
    const a = await composeArchitectureExplanation(snapshotId, db)
    const b = await composeArchitectureExplanation(snapshotId, db)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("composeLearningMemoryTree yields byte-identical JSON on two calls", async () => {
    const db = makeTestDb()
    const snapshotId = await seedRichSnapshot(db)
    const a = await composeLearningMemoryTree(snapshotId, db)
    const b = await composeLearningMemoryTree(snapshotId, db)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("composeDebugStories yields byte-identical JSON on two calls", async () => {
    const db = makeTestDb()
    const snapshotId = await seedRichSnapshot(db)
    const a = await composeDebugStories(snapshotId, db)
    const b = await composeDebugStories(snapshotId, db)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
