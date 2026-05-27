// Tests for the reusable file-reference integrity check (Issue #135, FR-4).
//
// The pure check is exercised against a synthetic snapshot file set and a
// fabricated project map — no DB or LLM. The DB-backed wrapper is exercised
// against a fresh in-memory SQLite with the real migrations applied. Mirrors
// the rejection-case tests in `../mapper/project-maps.test.ts`
// (`checkProjectMapFileReferences`) and `../diff/reviews.test.ts`
// (`checkReviewFileReferences`).

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import {
  type NewRepoSnapshot,
  type ProjectMap,
  type RepoTreeEntry,
  repoSnapshots,
} from "../schema"
import * as schema from "../schema"
import {
  checkLearningUnitIntegrity,
  verifyLearningUnitIntegrity,
} from "./integrity"
import {
  createLearningUnit,
  type LearningUnitContent,
  type LearningUnitIdentity,
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

const fileTree: RepoTreeEntry[] = [
  {
    path: "apps/web/app/api/health/route.ts",
    type: "blob",
    sha: "a",
    size: 200,
  },
  { path: "apps/web/app/page.tsx", type: "blob", sha: "b", size: 200 },
  { path: "packages/db/src/schema.ts", type: "blob", sha: "c", size: 300 },
  { path: "apps/web", type: "tree", sha: "d" },
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

const identity: LearningUnitIdentity = {
  snapshotId: 0, // set per test
  source: "github-issue",
  issueRef: "#42",
}

/** A fully-shaped content body — every related-file path resolves; concepts grounded. */
const content: LearningUnitContent = {
  restatedGoal: "Add a /health endpoint that returns 200 OK.",
  relatedFiles: [
    {
      path: "apps/web/app/api/health/route.ts",
      reason: "The new route handler this issue introduces — a route handlers file.",
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
  ],
  reviewChecklist: [
    {
      id: "c1",
      description: "route.ts returns 200 OK with a JSON body.",
    },
    {
      id: "c2",
      description: "The route handlers cover the GET method.",
    },
  ],
  questions: [
    { id: "q1", prompt: "How does Next.js know this file is a route?" },
  ],
  challengeConcept: "fault-injection",
  challengeType: "expand",
}

/** A project map whose keyFileMap roles + architecture cover the concept names. */
const projectMap: ProjectMap = {
  id: 1,
  snapshotId: 1,
  architectureOverview: [
    {
      title: "Frontend",
      detail: "Next.js App Router with route handlers under app/api/.",
    },
  ],
  keyFileMap: [
    {
      path: "apps/web/app/api/health/route.ts",
      role: "Health route handlers entry point.",
    },
  ],
  requestDataFlow: [],
  stateFlow: [],
  aiCallFlow: [],
  mermaidDiagram: "graph TD; A-->B;",
  debugPath: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

describe("verifyLearningUnitIntegrity (pure)", () => {
  it("passes when every related-file path resolves and concepts/checklist are grounded", () => {
    const result = verifyLearningUnitIntegrity(content, fileTree)
    expect(result.ok).toBe(true)
    expect(
      result.unresolved.filter((u) => u.kind === "related-file"),
    ).toEqual([])
  })

  it("accepts a pre-built Set<string> as the snapshot file set", () => {
    const files = new Set(
      fileTree.filter((e) => e.type === "blob").map((e) => e.path),
    )
    const result = verifyLearningUnitIntegrity(content, files)
    expect(result.ok).toBe(true)
  })

  it("fails and reports an unresolvable related-file path (FR-4 primary failure)", () => {
    const result = verifyLearningUnitIntegrity(
      {
        ...content,
        relatedFiles: [
          {
            path: "apps/web/app/api/ghost/route.ts",
            reason: "Not in the snapshot.",
          },
        ],
        // Keep concepts/checklist grounded against the (non-resolving) path so
        // only the related-file miss flips `ok`.
        concepts: [
          {
            name: "route handlers",
            explanation:
              "Concept tied to apps/web/app/api/ghost/route.ts in the unit.",
          },
        ],
        reviewChecklist: [
          {
            id: "c1",
            description:
              "Cite apps/web/app/api/ghost/route.ts and the route handlers concept.",
          },
        ],
      },
      fileTree,
    )
    expect(result.ok).toBe(false)
    const fileMisses = result.unresolved.filter(
      (u) => u.kind === "related-file",
    )
    expect(fileMisses).toHaveLength(1)
    expect(fileMisses[0]?.value).toBe("apps/web/app/api/ghost/route.ts")
  })

  it("rejects a path that matches only a directory tree entry, not a blob", () => {
    const result = verifyLearningUnitIntegrity(
      {
        ...content,
        relatedFiles: [{ path: "apps/web", reason: "A directory." }],
      },
      fileTree,
    )
    expect(result.ok).toBe(false)
    expect(result.unresolved[0]?.kind).toBe("related-file")
  })

  it("reports an ungrounded concept as informational, not a hard failure", () => {
    const result = verifyLearningUnitIntegrity(
      {
        ...content,
        concepts: [
          {
            name: "websockets",
            explanation: "A concept that names nothing the unit relates to.",
          },
        ],
      },
      fileTree,
    )
    // Related-file paths still resolve, so `ok` stays true.
    expect(result.ok).toBe(true)
    const ungrounded = result.unresolved.filter(
      (u) => u.kind === "ungrounded-concept",
    )
    expect(ungrounded.map((u) => u.value)).toEqual(["websockets"])
  })

  it("grounds a concept against a supplied M6 project map's keyFileMap role", () => {
    const result = verifyLearningUnitIntegrity(
      {
        ...content,
        // Strip the related-file reason / explanation grounding so only the
        // project-map role can ground this concept.
        relatedFiles: [
          {
            path: "apps/web/app/api/health/route.ts",
            reason: "Touched by this issue.",
          },
        ],
        concepts: [
          {
            name: "route handlers",
            explanation: "A concept with no path mentioned in its explanation.",
          },
        ],
      },
      fileTree,
      projectMap,
    )
    expect(
      result.unresolved.filter((u) => u.kind === "ungrounded-concept"),
    ).toEqual([])
  })

  it("reports an abstract checklist item as informational, not a hard failure", () => {
    const result = verifyLearningUnitIntegrity(
      {
        ...content,
        reviewChecklist: [
          { id: "abstract", description: "The code looks good." },
        ],
      },
      fileTree,
    )
    expect(result.ok).toBe(true)
    const abstractItems = result.unresolved.filter(
      (u) => u.kind === "abstract-checklist-item",
    )
    expect(abstractItems.map((u) => u.value)).toEqual(["abstract"])
  })

  it("accepts a stored LearningUnit row (post-persistence shape) as input", () => {
    // Simulate a stored row by adding the schema's audit + identity / nullable
    // columns to the verifiable content. The integrity check ignores them.
    const storedRow = {
      ...content,
      id: 1,
      snapshotId: 1,
      source: "github-issue" as const,
      issueRef: "#42",
      userAnswers: null,
      score: null,
      weakAreas: null,
      checklistState: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const result = verifyLearningUnitIntegrity(storedRow, fileTree)
    expect(result.ok).toBe(true)
  })

  it("degrades gracefully when no project map is supplied (epic 'project map unavailable')", () => {
    // Same input as the project-map-grounded test, but with no map: the concept
    // is reported as ungrounded (informational), and `ok` still passes since
    // the related-file path resolves.
    const result = verifyLearningUnitIntegrity(
      {
        ...content,
        relatedFiles: [
          {
            path: "apps/web/app/api/health/route.ts",
            reason: "Touched by this issue.",
          },
        ],
        concepts: [
          {
            name: "websockets",
            explanation: "A concept with no path mentioned in its explanation.",
          },
        ],
      },
      fileTree,
      // no project map
    )
    expect(result.ok).toBe(true)
    expect(
      result.unresolved.some(
        (u) =>
          u.kind === "ungrounded-concept" &&
          u.reason.includes("no project map"),
      ),
    ).toBe(true)
  })

  // Identity import is exported but not used in this file — silence the linter.
  void identity
})

describe("checkLearningUnitIntegrity (DB-backed)", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    snapshotId = db.insert(repoSnapshots).values(snapshot).returning().get().id
  })

  it("returns null when no unit exists for the snapshot + source + issueRef", async () => {
    expect(
      await checkLearningUnitIntegrity(snapshotId, "github-issue", "#42", undefined, db),
    ).toBeNull()
  })

  it("returns null when the snapshot does not exist", async () => {
    expect(
      await checkLearningUnitIntegrity(9999, "github-issue", "#42", undefined, db),
    ).toBeNull()
  })

  it("checks a stored unit against its snapshot's file tree", async () => {
    await createLearningUnit(
      { snapshotId, source: "github-issue", issueRef: "#42", ...content },
      db,
    )
    const result = await checkLearningUnitIntegrity(
      snapshotId,
      "github-issue",
      "#42",
      undefined,
      db,
    )
    expect(result?.ok).toBe(true)
  })

  it("catches a stored unit that cites an unresolvable related-file path", async () => {
    await createLearningUnit(
      {
        snapshotId,
        source: "github-issue",
        issueRef: "#42",
        ...content,
        relatedFiles: [
          {
            path: "apps/web/app/api/phantom/route.ts",
            reason: "Cited but never in the snapshot.",
          },
        ],
      },
      db,
    )
    const result = await checkLearningUnitIntegrity(
      snapshotId,
      "github-issue",
      "#42",
      undefined,
      db,
    )
    expect(result?.ok).toBe(false)
    const fileMisses =
      result?.unresolved.filter((u) => u.kind === "related-file") ?? []
    expect(fileMisses.map((u) => u.value)).toEqual([
      "apps/web/app/api/phantom/route.ts",
    ])
  })
})
