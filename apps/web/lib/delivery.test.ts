// Unit tests for the M12 Delivery Page server-side data access
// (`lib/delivery.ts`, task #205).
//
// In-memory SQLite (real migrations) + an injected DB — no network, no keys.
// Mirrors the harness in `apps/web/lib/portfolio.test.ts`.

import path from "node:path"
import { fileURLToPath } from "node:url"

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { beforeEach, describe, expect, it } from "vitest"

import {
  ccpmIssueLinks,
  type CatalogDb,
  type NewRepoFile,
  type NewRepoSnapshot,
  repoFiles,
  repoSnapshots,
} from "@workspace/db"
import * as schema from "@workspace/db/schema"

import { getDeliveryPageData } from "./delivery"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "db",
  "drizzle",
)

function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db as unknown as CatalogDb
}

const SNAPSHOT: NewRepoSnapshot = {
  owner: "acme",
  repo: "widgets",
  ref: "main",
  commitSha: "c1",
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/widgets",
  fileTree: [],
}

function seedSnapshot(db: CatalogDb): number {
  const [row] = db.insert(repoSnapshots).values(SNAPSHOT).returning().all()
  return row!.id
}

function seedFile(
  db: CatalogDb,
  snapshotId: number,
  filePath: string,
  content: string,
  category: NewRepoFile["category"],
): void {
  db.insert(repoFiles)
    .values({ snapshotId, path: filePath, sha: `s-${filePath}`, size: content.length, content, category })
    .run()
}

describe("getDeliveryPageData", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns snapshotExists:false when the repo is not imported", async () => {
    const data = await getDeliveryPageData("nobody", "nothing", db)
    expect(data.snapshotExists).toBe(false)
    expect(data.identity).toBeNull()
    expect(data.result).toBeNull()
  })

  it("returns the populated map for a CCPM repo, with joined links", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, ".claude/prds/feature.md", "---\nname: feature\n---\nbody", "ccpm-prd")
    seedFile(db, id, ".claude/epics/feature/epic.md", "---\nname: feature\nprd: .claude/prds/feature.md\n---\nbody", "ccpm-epic")
    seedFile(db, id, ".claude/epics/feature/001.md", "---\nname: A\ngithub: https://github.com/acme/widgets/issues/11\n---\nbody", "ccpm-task")
    db.insert(ccpmIssueLinks)
      .values({
        snapshotId: id,
        taskRef: "epic/feature/001",
        issueNumber: 11,
        issueState: "closed",
        closingPrNumber: 99,
        closingPrUrl: "https://github.com/acme/widgets/pull/99",
      })
      .run()

    const data = await getDeliveryPageData("acme", "widgets", db)
    expect(data.snapshotExists).toBe(true)
    expect(data.identity).toEqual({
      owner: "acme",
      repo: "widgets",
      branch: "main",
      snapshotId: id,
    })
    expect(data.result?.kind).toBe("map")
    if (data.result?.kind !== "map") return
    expect(data.result.map.prds.map((p) => p.name)).toEqual(["feature"])
    expect(data.result.links["epic/feature/001"]?.issueState).toBe("closed")
  })

  it("returns the degradation state for a non-CCPM repo", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, "package.json", "{}", "package-manifest")

    const data = await getDeliveryPageData("acme", "widgets", db)
    expect(data.snapshotExists).toBe(true)
    expect(data.result?.kind).toBe("absent")
    if (data.result?.kind !== "absent") return
    expect(data.result.teaching.goldenPath.slug).toBe("agentic-ccpm-workflow")
  })
})
