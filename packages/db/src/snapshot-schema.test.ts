// Verifies the GitHub snapshot migration (drizzle/0001_*) applies cleanly to a
// fresh database and that the repo_snapshots / repo_files tables behave as the
// schema declares (ADR 0009).

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { eq } from "drizzle-orm"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import {
  repoFiles,
  repoSnapshots,
  type NewRepoFile,
  type NewRepoSnapshot,
} from "./schema"
import * as schema from "./schema"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
)

/** A fresh in-memory DB with the real migrations applied (incl. 0001). */
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
  fileTree: [
    { path: "package.json", type: "blob", size: 1200, sha: "f1" },
    { path: "apps", type: "tree", sha: "t1" },
  ],
}

describe("github snapshot migration + schema", () => {
  let db: ReturnType<typeof makeTestDb>

  beforeEach(() => {
    db = makeTestDb()
  })

  it("migration creates repo_snapshots and stores the JSON file tree", () => {
    const [row] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()

    expect(row?.owner).toBe("vercel")
    expect(row?.fileTree).toHaveLength(2)
    expect(row?.fileTree[0]?.path).toBe("package.json")
    expect(row?.isPrivate).toBe(false)
    expect(row?.importedAt).toBeInstanceOf(Date)
  })

  it("enforces the owner/repo/ref uniqueness constraint", () => {
    db.insert(repoSnapshots).values(sampleSnapshot).run()
    expect(() =>
      db.insert(repoSnapshots).values(sampleSnapshot).run(),
    ).toThrow()
  })

  it("stores key-file contents linked to a snapshot", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()

    const file: NewRepoFile = {
      snapshotId: snap!.id,
      path: "package.json",
      sha: "f1",
      size: 1200,
      content: '{ "name": "next" }',
      category: "package-manifest",
    }
    db.insert(repoFiles).values(file).run()

    const files = db
      .select()
      .from(repoFiles)
      .where(eq(repoFiles.snapshotId, snap!.id))
      .all()
    expect(files).toHaveLength(1)
    expect(files[0]?.content).toContain("next")
  })

  it("cascades file deletion when a snapshot is removed", () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    db.insert(repoFiles)
      .values({
        snapshotId: snap!.id,
        path: "tsconfig.json",
        sha: "f2",
        size: 300,
        content: "{}",
        category: "build-config",
      })
      .run()

    db.delete(repoSnapshots).where(eq(repoSnapshots.id, snap!.id)).run()

    expect(db.select().from(repoFiles).all()).toHaveLength(0)
  })
})
