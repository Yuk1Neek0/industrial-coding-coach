// Tests for the `project_maps` data-access layer (Issue #106).
//
// create / read / update are exercised against a fresh in-memory SQLite with
// the real migrations applied, so the round-trip through the M11 snapshot
// data-access layer is covered end to end. The file-reference integrity check
// is exercised purely, including a map that cites an unresolvable path. No
// network, no LLM anywhere — mirrors `../stack/explanations.test.ts`.

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
  checkProjectMapFileReferences,
  checkProjectMapIntegrity,
  createProjectMap,
  getProjectMap,
  getProjectMapByRepo,
  saveProjectMap,
  type ProjectMapContent,
  updateProjectMap,
} from "./project-maps"

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
  { path: "apps/web", type: "tree", sha: "b" },
  { path: "apps/web/app/page.tsx", type: "blob", sha: "c", size: 200 },
  { path: "apps/web/app/actions.ts", type: "blob", sha: "d", size: 150 },
  { path: "packages/db/src/schema.ts", type: "blob", sha: "e", size: 300 },
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

/** A complete project map covering all seven sections, all paths resolvable. */
const content: ProjectMapContent = {
  architectureOverview: [
    { title: "Frontend", detail: "Next.js App Router renders the pages." },
    { title: "Data layer", detail: "Drizzle over local SQLite." },
  ],
  keyFileMap: [
    { path: "apps/web/app/page.tsx", role: "Home page entry point." },
    { path: "packages/db/src/schema.ts", role: "The database schema." },
  ],
  requestDataFlow: [
    {
      order: 1,
      description: "Browser requests /",
      path: "apps/web/app/page.tsx",
    },
    { order: 2, description: "Server component renders HTML" },
  ],
  stateFlow: [{ order: 1, description: "Form state held in a React hook." }],
  aiCallFlow: [
    {
      order: 1,
      description: "Server action calls the Anthropic SDK.",
      path: "apps/web/app/actions.ts",
    },
  ],
  mermaidDiagram: "graph TD; Browser-->Page; Page-->Action;",
  debugPath: [
    {
      location: "apps/web/app/page.tsx",
      guidance: "Start here for render bugs.",
    },
    { location: "the server action layer", guidance: "Start here for data bugs." },
  ],
}

/** Insert the sample snapshot and return its id. */
function seedSnapshot(db: CatalogDb): number {
  return db.insert(repoSnapshots).values(snapshot).returning().get().id
}

describe("project-maps data-access", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    snapshotId = seedSnapshot(db)
  })

  it("createProjectMap stores and returns the row", async () => {
    const row = await createProjectMap(snapshotId, content, db)
    expect(row.snapshotId).toBe(snapshotId)
    expect(row.architectureOverview[0]?.title).toBe("Frontend")
    expect(row.keyFileMap).toHaveLength(2)
    expect(row.mermaidDiagram).toContain("graph TD")
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  it("getProjectMap reads back the stored map", async () => {
    await createProjectMap(snapshotId, content, db)
    const row = await getProjectMap(snapshotId, db)
    expect(row?.requestDataFlow).toHaveLength(2)
    expect(row?.requestDataFlow[0]?.path).toBe("apps/web/app/page.tsx")
    expect(row?.aiCallFlow[0]?.description).toContain("Anthropic")
    expect(row?.debugPath).toHaveLength(2)
  })

  it("getProjectMap returns null for an unmapped snapshot", async () => {
    expect(await getProjectMap(snapshotId, db)).toBeNull()
  })

  it("updateProjectMap replaces content and bumps updatedAt", async () => {
    const created = await createProjectMap(snapshotId, content, db)
    const updated = await updateProjectMap(
      snapshotId,
      { ...content, architectureOverview: [] },
      db,
    )
    expect(updated?.architectureOverview).toEqual([])
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.updatedAt.getTime(),
    )
  })

  it("updateProjectMap returns null when there is nothing to update", async () => {
    expect(await updateProjectMap(snapshotId, content, db)).toBeNull()
  })

  it("saveProjectMap creates then replaces the row in place", async () => {
    const first = await saveProjectMap(snapshotId, content, db)
    const second = await saveProjectMap(
      snapshotId,
      { ...content, mermaidDiagram: "graph TD; A-->B;" },
      db,
    )
    expect(second.id).toBe(first.id)
    expect(second.mermaidDiagram).toBe("graph TD; A-->B;")
    // Still exactly one map for the snapshot.
    expect(await getProjectMap(snapshotId, db)).not.toBeNull()
  })

  it("createProjectMap rejects a second map for the same snapshot", async () => {
    await createProjectMap(snapshotId, content, db)
    await expect(
      createProjectMap(snapshotId, content, db),
    ).rejects.toThrow()
  })

  it("getProjectMapByRepo resolves the snapshot then the map", async () => {
    await createProjectMap(snapshotId, content, db)
    const row = await getProjectMapByRepo("acme", "portfolio", "main", db)
    expect(row?.snapshotId).toBe(snapshotId)
  })

  it("getProjectMapByRepo returns null for an unknown repo", async () => {
    expect(await getProjectMapByRepo("nope", "nope", "main", db)).toBeNull()
  })
})

describe("checkProjectMapFileReferences", () => {
  it("passes when every cited file path resolves in the snapshot", () => {
    const result = checkProjectMapFileReferences(content, fileTree)
    expect(result.ok).toBe(true)
    expect(result.missingKeyFiles).toEqual([])
    expect(result.missingFlowPaths).toEqual([])
  })

  it("fails and lists key-file paths that do not resolve", () => {
    const result = checkProjectMapFileReferences(
      {
        ...content,
        keyFileMap: [{ path: "src/ghost.ts", role: "Does not exist." }],
      },
      fileTree,
    )
    expect(result.ok).toBe(false)
    expect(result.missingKeyFiles).toEqual(["src/ghost.ts"])
  })

  it("fails on an unresolvable flow-step path and names the flow", () => {
    const result = checkProjectMapFileReferences(
      {
        ...content,
        aiCallFlow: [
          {
            order: 1,
            description: "Calls a model.",
            path: "apps/web/app/missing.ts",
          },
        ],
      },
      fileTree,
    )
    expect(result.ok).toBe(false)
    expect(result.missingFlowPaths).toEqual([
      "aiCallFlow: apps/web/app/missing.ts",
    ])
  })

  it("ignores flow steps that have no path", () => {
    const result = checkProjectMapFileReferences(
      {
        ...content,
        stateFlow: [{ order: 1, description: "Conceptual state step." }],
      },
      fileTree,
    )
    expect(result.missingFlowPaths).toEqual([])
  })

  it("does not resolve a path against a directory tree entry", () => {
    const result = checkProjectMapFileReferences(
      { ...content, keyFileMap: [{ path: "apps/web", role: "A directory." }] },
      fileTree,
    )
    expect(result.ok).toBe(false)
    expect(result.missingKeyFiles).toEqual(["apps/web"])
  })

  it("reports a path-shaped debug location that does not resolve", () => {
    const result = checkProjectMapFileReferences(
      {
        ...content,
        debugPath: [
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
    const result = checkProjectMapFileReferences(
      {
        ...content,
        debugPath: [
          { location: "the routing layer", guidance: "Conceptual area." },
        ],
      },
      fileTree,
    )
    expect(result.unresolvedDebugLocations).toEqual([])
  })
})

describe("checkProjectMapIntegrity", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    snapshotId = seedSnapshot(db)
  })

  it("returns null when the snapshot has no map", async () => {
    expect(await checkProjectMapIntegrity(snapshotId, db)).toBeNull()
  })

  it("checks a stored map against its snapshot's file tree", async () => {
    await createProjectMap(snapshotId, content, db)
    const result = await checkProjectMapIntegrity(snapshotId, db)
    expect(result?.ok).toBe(true)
  })

  it("catches a stored map that cites a missing file", async () => {
    await createProjectMap(
      snapshotId,
      { ...content, keyFileMap: [{ path: "gone.ts", role: "Removed." }] },
      db,
    )
    const result = await checkProjectMapIntegrity(snapshotId, db)
    expect(result?.ok).toBe(false)
    expect(result?.missingKeyFiles).toEqual(["gone.ts"])
  })
})
