// Verifies the CCPM issue/PR link migration (drizzle/0010_*) applies cleanly to
// a fresh database and that the `ccpm_issue_links` table behaves as the schema
// declares (ccpm-integration PRD FR-4, AD-4, Issue #197).

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { eq } from "drizzle-orm"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import {
  ccpmIssueLinks,
  repoSnapshots,
  type NewCcpmIssueLink,
  type NewRepoSnapshot,
} from "./schema"
import * as schema from "./schema"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
)

/** A fresh in-memory DB with the real migrations applied (incl. 0010). */
function makeTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

const sampleSnapshot: NewRepoSnapshot = {
  owner: "acme",
  repo: "widgets",
  ref: "main",
  commitSha: "abc123",
  defaultBranch: "main",
  description: "A CCPM-managed repo",
  primaryLanguage: "TypeScript",
  isPrivate: false,
  htmlUrl: "https://github.com/acme/widgets",
  fileTree: [],
}

describe("ccpm_issue_links migration + schema", () => {
  let db: ReturnType<typeof makeTestDb>

  beforeEach(() => {
    db = makeTestDb()
  })

  /** Seed a snapshot and return its id. */
  function seedSnapshot(): number {
    const [row] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    return row!.id
  }

  it("stores a resolved link (closed issue + closing PR)", () => {
    const snapshotId = seedSnapshot()
    const link: NewCcpmIssueLink = {
      snapshotId,
      taskRef: "epic/feature/001",
      issueNumber: 501,
      issueState: "closed",
      closingPrNumber: 42,
      closingPrUrl: "https://github.com/acme/widgets/pull/42",
      closingPrTitle: "Issue #501: add the thing",
      failureReason: null,
    }
    db.insert(ccpmIssueLinks).values(link).run()

    const [row] = db
      .select()
      .from(ccpmIssueLinks)
      .where(eq(ccpmIssueLinks.snapshotId, snapshotId))
      .all()
    expect(row?.taskRef).toBe("epic/feature/001")
    expect(row?.issueNumber).toBe(501)
    expect(row?.issueState).toBe("closed")
    expect(row?.closingPrNumber).toBe(42)
    expect(row?.failureReason).toBeNull()
    expect(row?.createdAt).toBeInstanceOf(Date)
  })

  it("stores an open issue with no closing PR (nullable PR fields)", () => {
    const snapshotId = seedSnapshot()
    db.insert(ccpmIssueLinks)
      .values({
        snapshotId,
        taskRef: "epic/feature/002",
        issueNumber: 502,
        issueState: "open",
      })
      .run()

    const [row] = db.select().from(ccpmIssueLinks).all()
    expect(row?.issueState).toBe("open")
    expect(row?.closingPrNumber).toBeNull()
    expect(row?.closingPrUrl).toBeNull()
    expect(row?.failureReason).toBeNull()
  })

  it("stores a failed link (issueState null + beginner-safe reason)", () => {
    const snapshotId = seedSnapshot()
    db.insert(ccpmIssueLinks)
      .values({
        snapshotId,
        taskRef: "epic/feature/003",
        issueNumber: 503,
        issueState: null,
        failureReason: "We couldn't reach GitHub to check this issue's status.",
      })
      .run()

    const [row] = db.select().from(ccpmIssueLinks).all()
    expect(row?.issueState).toBeNull()
    expect(row?.failureReason).toContain("couldn't reach GitHub")
  })

  it("enforces one link per (snapshot, taskRef)", () => {
    const snapshotId = seedSnapshot()
    const base: NewCcpmIssueLink = {
      snapshotId,
      taskRef: "epic/feature/001",
      issueNumber: 501,
      issueState: "open",
    }
    db.insert(ccpmIssueLinks).values(base).run()
    expect(() => db.insert(ccpmIssueLinks).values(base).run()).toThrow()
  })

  it("allows the same taskRef under two different snapshots", () => {
    const first = seedSnapshot()
    const [second] = db
      .insert(repoSnapshots)
      .values({ ...sampleSnapshot, ref: "canary" })
      .returning()
      .all()
    const mk = (snapshotId: number): NewCcpmIssueLink => ({
      snapshotId,
      taskRef: "epic/feature/001",
      issueNumber: 501,
      issueState: "open",
    })
    db.insert(ccpmIssueLinks).values(mk(first)).run()
    db.insert(ccpmIssueLinks).values(mk(second!.id)).run()
    expect(db.select().from(ccpmIssueLinks).all()).toHaveLength(2)
  })

  it("cascades link deletion when its snapshot is removed", () => {
    const snapshotId = seedSnapshot()
    db.insert(ccpmIssueLinks)
      .values({
        snapshotId,
        taskRef: "epic/feature/001",
        issueNumber: 501,
        issueState: "open",
      })
      .run()

    db.delete(repoSnapshots).where(eq(repoSnapshots.id, snapshotId)).run()

    expect(db.select().from(ccpmIssueLinks).all()).toHaveLength(0)
  })
})
