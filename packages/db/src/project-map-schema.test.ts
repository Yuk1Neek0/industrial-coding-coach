// Verifies the project_maps migration (drizzle/0005_*) applies cleanly to a
// fresh database and that the project_maps table behaves as the schema
// declares: a child of repo_snapshots, unique per snapshot, cascade-deleted
// with its parent, with the seven map sections round-tripping as JSON.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { eq } from "drizzle-orm"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import {
  projectMaps,
  repoSnapshots,
  type NewProjectMap,
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

/** A complete project map covering all seven outputs. */
function sampleMap(snapshotId: number): NewProjectMap {
  return {
    snapshotId,
    architectureOverview: [
      { title: "Frontend", detail: "Next.js App Router renders pages." },
      { title: "Data layer", detail: "Drizzle over local SQLite." },
    ],
    keyFileMap: [
      { path: "apps/web/app/page.tsx", role: "Home page entry point." },
    ],
    requestDataFlow: [
      { order: 1, description: "Browser requests /", path: "apps/web/app/page.tsx" },
      { order: 2, description: "Server component renders HTML" },
    ],
    stateFlow: [{ order: 1, description: "Form state held in a React hook." }],
    aiCallFlow: [
      { order: 1, description: "Server action calls the Anthropic SDK." },
    ],
    mermaidDiagram: "graph TD; A-->B;",
    debugPath: [
      { location: "apps/web/app", guidance: "Check the route segment first." },
    ],
  }
}

describe("project_maps migration + schema", () => {
  let db: ReturnType<typeof makeTestDb>

  beforeEach(() => {
    db = makeTestDb()
  })

  it("migration creates project_maps and round-trips the seven JSON sections", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()

    const [row] = db
      .insert(projectMaps)
      .values(sampleMap(snap!.id))
      .returning()
      .all()

    expect(row?.snapshotId).toBe(snap!.id)
    expect(row?.architectureOverview).toHaveLength(2)
    expect(row?.architectureOverview[0]?.title).toBe("Frontend")
    expect(row?.keyFileMap[0]?.path).toBe("apps/web/app/page.tsx")
    expect(row?.requestDataFlow).toHaveLength(2)
    expect(row?.requestDataFlow[0]?.order).toBe(1)
    expect(row?.stateFlow[0]?.description).toContain("React hook")
    expect(row?.aiCallFlow[0]?.description).toContain("Anthropic")
    expect(row?.mermaidDiagram).toBe("graph TD; A-->B;")
    expect(row?.debugPath[0]?.location).toBe("apps/web/app")
    expect(row?.createdAt).toBeInstanceOf(Date)
    expect(row?.updatedAt).toBeInstanceOf(Date)
  })

  it("enforces one map per snapshot", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()

    db.insert(projectMaps).values(sampleMap(snap!.id)).run()
    expect(() =>
      db.insert(projectMaps).values(sampleMap(snap!.id)).run(),
    ).toThrow()
  })

  it("requires a valid owning snapshot", () => {
    expect(() => db.insert(projectMaps).values(sampleMap(999)).run()).toThrow()
  })

  it("cascades map deletion when its snapshot is removed", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    db.insert(projectMaps).values(sampleMap(snap!.id)).run()

    db.delete(repoSnapshots).where(eq(repoSnapshots.id, snap!.id)).run()

    expect(db.select().from(projectMaps).all()).toHaveLength(0)
  })
})
