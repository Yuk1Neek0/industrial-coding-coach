// Tests for the M10 reusable file + stack-reference integrity check
// (Issue #177, FR-3 / NFR-5).
//
// The checks are exercised against fresh in-memory SQLite databases with
// the real migrations applied, seeded with a sample snapshot + M5 stack
// explanation + M6 project map. Mirrors the test posture of
// `../mapper/project-maps.test.ts`, `../stack/explanations.test.ts`, and
// `../challenges/integrity-check.test.ts` — fixtures live in-process so
// the check's DAL fetches go through the real Drizzle layer.
//
// The PRD-mandated cases (177.md acceptance criteria):
//   1. all-resolved file references → `ok: true`.
//   2. all-resolved stack references → `ok: true`.
//   3. partial-missing files → `ok: false` with the right `missing` list.
//   4. partial-missing technologies → `ok: false` with the right `missing` list.
//   5. empty inputs → `ok: true`.
//   6. case sensitivity matches M9 (`Next.js` ≠ `next.js`).
//   7. `checkArtifactIntegrity` extracts paths + technologies from the
//      `interviewQa[]` / `resumeBullets[]` shapes and runs both checks.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import { saveProjectMap, type ProjectMapContent } from "../mapper/project-maps"
import {
  saveStackExplanation,
  type StackExplanationContent,
} from "../stack/explanations"
import {
  type NewRepoSnapshot,
  type RepoTreeEntry,
  repoSnapshots,
} from "../schema"
import * as schema from "../schema"
import {
  checkArtifactIntegrity,
  checkFileReferences,
  checkStackReferences,
  type IntegrityArtifact,
} from "./integrity"

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

/** A synthetic M6 project map naming three files. */
const projectMapContent: ProjectMapContent = {
  architectureOverview: [
    { title: "Frontend", detail: "Next.js App Router under apps/web/app/." },
  ],
  keyFileMap: [
    { path: "apps/web/app/page.tsx", role: "Home page." },
    { path: "apps/web/app/actions.ts", role: "Server actions for the page." },
    { path: "packages/db/src/schema.ts", role: "Database schema." },
  ],
  requestDataFlow: [],
  stateFlow: [],
  aiCallFlow: [],
  mermaidDiagram: "graph TD; A-->B;",
  debugPath: [],
}

/** A synthetic M5 stack explanation naming two tools. */
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

/**
 * Insert the sample snapshot + seed an M5 stack explanation and an M6
 * project map for it, returning the snapshot id. Used by every test that
 * needs the "happy path" backing data.
 */
async function seedAll(db: CatalogDb): Promise<number> {
  const snapshotId = db
    .insert(repoSnapshots)
    .values(snapshot)
    .returning()
    .get().id
  await saveStackExplanation(snapshotId, stackContent, db)
  await saveProjectMap(snapshotId, projectMapContent, db)
  return snapshotId
}

// ---------------------------------------------------------------------------
// checkFileReferences
// ---------------------------------------------------------------------------

describe("checkFileReferences", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedAll(db)
  })

  it("returns ok when every path resolves to an M6-named file", async () => {
    const result = await checkFileReferences(
      snapshotId,
      ["apps/web/app/page.tsx", "packages/db/src/schema.ts"],
      db,
    )
    expect(result).toEqual({ ok: true })
  })

  it("returns ok for an empty list of paths (nothing to verify)", async () => {
    const result = await checkFileReferences(snapshotId, [], db)
    expect(result).toEqual({ ok: true })
  })

  it("reports a single missing path in the `missing` list", async () => {
    const result = await checkFileReferences(
      snapshotId,
      ["apps/web/app/page.tsx", "apps/web/app/ghost.tsx"],
      db,
    )
    expect(result).toEqual({
      ok: false,
      missing: ["apps/web/app/ghost.tsx"],
    })
  })

  it("reports every missing path, not just the first", async () => {
    const result = await checkFileReferences(
      snapshotId,
      ["nope/a.ts", "apps/web/app/page.tsx", "nope/b.ts"],
      db,
    )
    expect(result).toEqual({
      ok: false,
      missing: ["nope/a.ts", "nope/b.ts"],
    })
  })

  it(
    "rejects an adjacent-but-unmapped file (FR-3: no adjacent-file inference, " +
      "even though `.test.tsx` next to `page.tsx` likely exists)",
    async () => {
      const result = await checkFileReferences(
        snapshotId,
        ["apps/web/app/page.test.tsx"],
        db,
      )
      expect(result).toEqual({
        ok: false,
        missing: ["apps/web/app/page.test.tsx"],
      })
    },
  )

  it("is case-sensitive (matches M9 `Set.has` behaviour)", async () => {
    // The map names `apps/web/app/page.tsx`; mixed-case is rejected.
    const result = await checkFileReferences(
      snapshotId,
      ["apps/web/app/Page.tsx"],
      db,
    )
    expect(result).toEqual({
      ok: false,
      missing: ["apps/web/app/Page.tsx"],
    })
  })

  it("de-duplicates a repeated missing path", async () => {
    const result = await checkFileReferences(
      snapshotId,
      ["nope/a.ts", "nope/a.ts", "nope/a.ts"],
      db,
    )
    expect(result).toEqual({ ok: false, missing: ["nope/a.ts"] })
  })

  it("fails every non-empty list when no project map exists for the snapshot", async () => {
    const unmappedId = db
      .insert(repoSnapshots)
      .values({ ...snapshot, ref: "feature" })
      .returning()
      .get().id
    const result = await checkFileReferences(
      unmappedId,
      ["apps/web/app/page.tsx"],
      db,
    )
    expect(result).toEqual({
      ok: false,
      missing: ["apps/web/app/page.tsx"],
    })
  })
})

// ---------------------------------------------------------------------------
// checkStackReferences
// ---------------------------------------------------------------------------

describe("checkStackReferences", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedAll(db)
  })

  it("returns ok when every name resolves to an M5-named tool", async () => {
    const result = await checkStackReferences(
      snapshotId,
      ["Next.js", "Drizzle ORM"],
      db,
    )
    expect(result).toEqual({ ok: true })
  })

  it("returns ok for an empty list of technologies", async () => {
    const result = await checkStackReferences(snapshotId, [], db)
    expect(result).toEqual({ ok: true })
  })

  it("reports a single missing technology in the `missing` list", async () => {
    const result = await checkStackReferences(
      snapshotId,
      ["Next.js", "FastAPI"],
      db,
    )
    expect(result).toEqual({ ok: false, missing: ["FastAPI"] })
  })

  it("reports every missing technology, not just the first", async () => {
    const result = await checkStackReferences(
      snapshotId,
      ["FastAPI", "Next.js", "Rails"],
      db,
    )
    expect(result).toEqual({
      ok: false,
      missing: ["FastAPI", "Rails"],
    })
  })

  it(
    "is case-sensitive (mirrors M9): `next.js` does not match `Next.js`",
    async () => {
      const result = await checkStackReferences(snapshotId, ["next.js"], db)
      expect(result).toEqual({ ok: false, missing: ["next.js"] })
    },
  )

  it("does not match alternatives or only matches `tools[].name`", async () => {
    // `Remix` is an *alternative* of `Next.js`, not an explained tool — so
    // citing it must fail. The check is anchored on `tools[].name` only.
    const result = await checkStackReferences(snapshotId, ["Remix"], db)
    expect(result).toEqual({ ok: false, missing: ["Remix"] })
  })

  it("de-duplicates a repeated missing technology", async () => {
    const result = await checkStackReferences(
      snapshotId,
      ["FastAPI", "FastAPI"],
      db,
    )
    expect(result).toEqual({ ok: false, missing: ["FastAPI"] })
  })

  it("fails every non-empty list when no stack explanation exists for the snapshot", async () => {
    const unexplainedId = db
      .insert(repoSnapshots)
      .values({ ...snapshot, ref: "feature" })
      .returning()
      .get().id
    const result = await checkStackReferences(unexplainedId, ["Next.js"], db)
    expect(result).toEqual({ ok: false, missing: ["Next.js"] })
  })
})

// ---------------------------------------------------------------------------
// checkArtifactIntegrity
// ---------------------------------------------------------------------------

describe("checkArtifactIntegrity", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedAll(db)
  })

  it("returns ok when every Q&A + bullet reference resolves", async () => {
    const artifact: IntegrityArtifact = {
      interviewQa: [
        { sourceReferences: ["apps/web/app/page.tsx"] },
        { sourceReferences: ["packages/db/src/schema.ts"] },
      ],
      resumeBullets: [
        {
          technologies: ["Next.js"],
          sourceFiles: ["apps/web/app/actions.ts"],
        },
      ],
    }
    const result = await checkArtifactIntegrity(snapshotId, artifact, db)
    expect(result).toEqual({ ok: true })
  })

  it("returns ok for an empty artifact (no Q&A, no bullets)", async () => {
    const result = await checkArtifactIntegrity(snapshotId, {}, db)
    expect(result).toEqual({ ok: true })
  })

  it("returns ok for an artifact with empty Q&A + bullet lists", async () => {
    const result = await checkArtifactIntegrity(
      snapshotId,
      { interviewQa: [], resumeBullets: [] },
      db,
    )
    expect(result).toEqual({ ok: true })
  })

  it("reports a missing file path cited by a Q&A item", async () => {
    const artifact: IntegrityArtifact = {
      interviewQa: [{ sourceReferences: ["apps/web/app/ghost.tsx"] }],
    }
    const result = await checkArtifactIntegrity(snapshotId, artifact, db)
    expect(result).toEqual({
      ok: false,
      missing: ["apps/web/app/ghost.tsx"],
    })
  })

  it("reports a missing technology cited by a résumé bullet", async () => {
    const artifact: IntegrityArtifact = {
      resumeBullets: [
        {
          technologies: ["FastAPI"],
          sourceFiles: ["apps/web/app/page.tsx"],
        },
      ],
    }
    const result = await checkArtifactIntegrity(snapshotId, artifact, db)
    expect(result).toEqual({ ok: false, missing: ["FastAPI"] })
  })

  it("merges missing file paths and missing technologies into one list", async () => {
    const artifact: IntegrityArtifact = {
      interviewQa: [{ sourceReferences: ["nope/a.ts"] }],
      resumeBullets: [
        { technologies: ["Rails"], sourceFiles: ["nope/b.ts"] },
      ],
    }
    const result = await checkArtifactIntegrity(snapshotId, artifact, db)
    expect(result.ok).toBe(false)
    if (result.ok) return // type narrowing for the assertion below
    // File paths come first in the merged list, technologies last.
    expect(result.missing).toEqual(["nope/a.ts", "nope/b.ts", "Rails"])
  })

  it("de-duplicates references repeated across multiple Q&A / bullet items", async () => {
    const artifact: IntegrityArtifact = {
      interviewQa: [
        { sourceReferences: ["nope/a.ts"] },
        { sourceReferences: ["nope/a.ts"] },
      ],
      resumeBullets: [
        { technologies: ["Rails", "Rails"], sourceFiles: ["nope/a.ts"] },
      ],
    }
    const result = await checkArtifactIntegrity(snapshotId, artifact, db)
    expect(result).toEqual({
      ok: false,
      missing: ["nope/a.ts", "Rails"],
    })
  })

  it("is case-sensitive across the merged artifact", async () => {
    const artifact: IntegrityArtifact = {
      interviewQa: [{ sourceReferences: ["apps/web/app/Page.tsx"] }],
      resumeBullets: [
        { technologies: ["next.js"], sourceFiles: [] },
      ],
    }
    const result = await checkArtifactIntegrity(snapshotId, artifact, db)
    expect(result).toEqual({
      ok: false,
      missing: ["apps/web/app/Page.tsx", "next.js"],
    })
  })
})
