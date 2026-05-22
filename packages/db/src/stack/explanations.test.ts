import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import {
  type NewRepoSnapshot,
  type RepoTreeEntry,
  repoSnapshots,
} from "../schema"
import * as schema from "../schema"
import {
  checkFileReferences,
  checkStackExplanationIntegrity,
  createStackExplanation,
  getStackExplanation,
  getStackExplanationByRepo,
  saveStackExplanation,
  type StackExplanationContent,
  updateStackExplanation,
} from "./explanations"

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

const fileTree: RepoTreeEntry[] = [
  { path: "package.json", type: "blob", sha: "a", size: 100 },
  { path: "next.config.mjs", type: "blob", sha: "b", size: 50 },
  { path: "apps/web", type: "tree", sha: "c" },
  { path: "apps/web/app/page.tsx", type: "blob", sha: "d", size: 200 },
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

const content: StackExplanationContent = {
  tools: [
    {
      name: "Next.js",
      purpose: "Renders the app's routes and pages.",
      alternatives: [
        { name: "Remix", tradeOff: "Different routing and data model." },
      ],
      jobRelevance: "Next.js is in heavy demand for React roles.",
    },
  ],
  keyFiles: [
    { path: "package.json", reason: "Declares the dependency stack." },
    { path: "apps/web/app/page.tsx", reason: "The app's entry route." },
  ],
  debugEntryPoints: [
    { location: "apps/web/app/page.tsx", guidance: "Start here for render bugs." },
    { location: "the server action layer", guidance: "Start here for data bugs." },
  ],
}

/** Insert the sample snapshot and return its id. */
function seedSnapshot(db: CatalogDb): number {
  return db.insert(repoSnapshots).values(snapshot).returning().get().id
}

describe("stack-explanations data-access", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    snapshotId = seedSnapshot(db)
  })

  it("createStackExplanation stores and returns the row", async () => {
    const row = await createStackExplanation(snapshotId, content, db)
    expect(row.snapshotId).toBe(snapshotId)
    expect(row.tools[0]?.name).toBe("Next.js")
    expect(row.keyFiles).toHaveLength(2)
  })

  it("getStackExplanation reads back the stored explanation", async () => {
    await createStackExplanation(snapshotId, content, db)
    const row = await getStackExplanation(snapshotId, db)
    expect(row?.tools[0]?.alternatives[0]?.name).toBe("Remix")
    expect(row?.debugEntryPoints).toHaveLength(2)
  })

  it("getStackExplanation returns null for an unexplained snapshot", async () => {
    expect(await getStackExplanation(snapshotId, db)).toBeNull()
  })

  it("updateStackExplanation replaces content and bumps updatedAt", async () => {
    const created = await createStackExplanation(snapshotId, content, db)
    const updated = await updateStackExplanation(
      snapshotId,
      { ...content, tools: [] },
      db,
    )
    expect(updated?.tools).toEqual([])
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.updatedAt.getTime(),
    )
  })

  it("updateStackExplanation returns null when there is nothing to update", async () => {
    expect(await updateStackExplanation(snapshotId, content, db)).toBeNull()
  })

  it("saveStackExplanation creates then replaces the row in place", async () => {
    const first = await saveStackExplanation(snapshotId, content, db)
    const second = await saveStackExplanation(
      snapshotId,
      { ...content, tools: [] },
      db,
    )
    expect(second.id).toBe(first.id)
    expect(second.tools).toEqual([])
    // Still exactly one explanation for the snapshot.
    expect(await getStackExplanation(snapshotId, db)).not.toBeNull()
  })

  it("getStackExplanationByRepo resolves the snapshot then the explanation", async () => {
    await createStackExplanation(snapshotId, content, db)
    const row = await getStackExplanationByRepo("acme", "portfolio", "main", db)
    expect(row?.snapshotId).toBe(snapshotId)
  })

  it("getStackExplanationByRepo returns null for an unknown repo", async () => {
    expect(await getStackExplanationByRepo("nope", "nope", "main", db)).toBeNull()
  })
})

describe("checkFileReferences", () => {
  it("passes when every cited key-file path resolves in the snapshot", () => {
    const result = checkFileReferences(content, fileTree)
    expect(result.ok).toBe(true)
    expect(result.missingKeyFiles).toEqual([])
  })

  it("fails and lists key-file paths that do not resolve", () => {
    const result = checkFileReferences(
      {
        ...content,
        keyFiles: [{ path: "src/ghost.ts", reason: "Does not exist." }],
      },
      fileTree,
    )
    expect(result.ok).toBe(false)
    expect(result.missingKeyFiles).toEqual(["src/ghost.ts"])
  })

  it("does not resolve a path against a directory tree entry", () => {
    const result = checkFileReferences(
      { ...content, keyFiles: [{ path: "apps/web", reason: "A directory." }] },
      fileTree,
    )
    expect(result.ok).toBe(false)
  })

  it("reports a path-shaped debug location that does not resolve", () => {
    const result = checkFileReferences(
      {
        ...content,
        debugEntryPoints: [
          { location: "src/missing.ts", guidance: "Not a real file." },
        ],
      },
      fileTree,
    )
    expect(result.unresolvedDebugLocations).toEqual(["src/missing.ts"])
    // A bad debug *location* alone does not fail the integrity check.
    expect(result.ok).toBe(true)
  })

  it("treats a free-form debug location (no slash) as valid", () => {
    const result = checkFileReferences(
      {
        ...content,
        debugEntryPoints: [
          { location: "the routing layer", guidance: "Conceptual area." },
        ],
      },
      fileTree,
    )
    expect(result.unresolvedDebugLocations).toEqual([])
  })
})

describe("checkStackExplanationIntegrity", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    snapshotId = seedSnapshot(db)
  })

  it("returns null when the snapshot has no explanation", async () => {
    expect(await checkStackExplanationIntegrity(snapshotId, db)).toBeNull()
  })

  it("checks a stored explanation against its snapshot's file tree", async () => {
    await createStackExplanation(snapshotId, content, db)
    const result = await checkStackExplanationIntegrity(snapshotId, db)
    expect(result?.ok).toBe(true)
  })

  it("catches a stored explanation that cites a missing file", async () => {
    await createStackExplanation(
      snapshotId,
      {
        ...content,
        keyFiles: [{ path: "gone.ts", reason: "Removed." }],
      },
      db,
    )
    const result = await checkStackExplanationIntegrity(snapshotId, db)
    expect(result?.ok).toBe(false)
    expect(result?.missingKeyFiles).toEqual(["gone.ts"])
  })
})
