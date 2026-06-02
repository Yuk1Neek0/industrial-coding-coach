// Unit tests for CCPM issue/PR linking (Issue #201).
//
// In-memory SQLite (real migrations) + a fixture-driven fake GitHubClient — no
// real network. Seeds a snapshot whose repo_files carry CCPM task fixtures, runs
// resolveCcpmLinks, and asserts the persisted ccpm_issue_links rows.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import {
  repoFiles,
  repoSnapshots,
  type NewRepoFile,
  type NewRepoSnapshot,
} from "../schema"
import * as schema from "../schema"
import {
  GitHubError,
  type GitHubClient,
  type IssueApiResponse,
  type TimelineEventApiResponse,
} from "../github"
import { fail, ok } from "../github/errors"
import { listCcpmLinks, resolveCcpmLinks } from "./linking"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
)

function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

const SNAPSHOT: NewRepoSnapshot = {
  owner: "acme",
  repo: "widgets",
  ref: "main",
  commitSha: "c1",
  defaultBranch: "main",
  description: null,
  primaryLanguage: "TypeScript",
  isPrivate: false,
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

/** A CCPM task file body, optionally carrying a `github:` issue ref. */
function taskFile(github: string | null): string {
  const gh = github !== null ? `github: ${github}\n` : ""
  return `---\nname: T\nstatus: open\n${gh}depends_on: []\n---\nbody`
}

function issueRes(number: number, state: "open" | "closed"): IssueApiResponse {
  return {
    number,
    title: `Issue ${number}`,
    body: null,
    state,
    html_url: `https://github.com/acme/widgets/issues/${number}`,
  }
}

function prEvent(prNumber: number): TimelineEventApiResponse {
  return {
    event: "cross-referenced",
    source: { issue: { number: prNumber, pull_request: {} } },
  }
}

interface IssueFixture {
  issue?: IssueApiResponse
  issueError?: GitHubError
  timeline?: TimelineEventApiResponse[]
}

/** A fake client serving issue + timeline fixtures keyed by issue number. */
function makeClient(fixtures: Record<number, IssueFixture>): GitHubClient {
  const unused = () => Promise.reject(new Error("not used by the linking path"))
  return {
    authenticated: false,
    getIssue(_ref, n: number) {
      const f = fixtures[n]
      if (f?.issueError) return Promise.resolve(fail(f.issueError))
      if (f?.issue) return Promise.resolve(ok(f.issue))
      return Promise.resolve(
        fail(new GitHubError("not_found", `no fixture for #${n}`)),
      )
    },
    getIssueTimeline(_ref, n: number) {
      return Promise.resolve(ok(fixtures[n]?.timeline ?? []))
    },
    getRepoMetadata: unused,
    getRepoTree: unused,
    getFileContent: unused,
    getPullRequest: unused,
    getPullRequestFiles: unused,
    getLinkedIssueNumber: unused,
    listIssues: unused,
  }
}

describe("resolveCcpmLinks", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  /** Seed a snapshot with four tasks: open, unsynced, closed+PR, failing. */
  function seedStandardSnapshot(): void {
    const id = seedSnapshot(db)
    seedFile(db, id, ".claude/prds/feature.md", "---\nname: feature\n---\n", "ccpm-prd")
    seedFile(db, id, ".claude/epics/feature/001.md", taskFile("https://github.com/acme/widgets/issues/11"), "ccpm-task")
    seedFile(db, id, ".claude/epics/feature/002.md", taskFile(null), "ccpm-task")
    seedFile(db, id, ".claude/epics/feature/003.md", taskFile("https://github.com/acme/widgets/issues/13"), "ccpm-task")
    seedFile(db, id, ".claude/epics/feature/004.md", taskFile("https://github.com/acme/widgets/issues/14"), "ccpm-task")
  }

  const standardClient = () =>
    makeClient({
      11: { issue: issueRes(11, "open") },
      13: { issue: issueRes(13, "closed"), timeline: [prEvent(99)] },
      14: { issueError: new GitHubError("not_found", "gone") },
    })

  it("resolves open / closed+PR, skips unsynced, records failures", async () => {
    seedStandardSnapshot()
    const summary = await resolveCcpmLinks("acme", "widgets", {
      client: standardClient(),
      db,
    })
    expect(summary).toEqual({ scanned: 3, linked: 2, failed: 1 })

    const links = await listCcpmLinks("acme", "widgets", { db })
    const byRef = new Map(links.map((l) => [l.taskRef, l]))

    // Open issue — no closing PR.
    const open = byRef.get("epic/feature/001")!
    expect(open.issueState).toBe("open")
    expect(open.closingPrNumber).toBeNull()
    expect(open.failureReason).toBeNull()

    // Closed issue with a linked PR — recorded as the closing PR.
    const closed = byRef.get("epic/feature/003")!
    expect(closed.issueState).toBe("closed")
    expect(closed.closingPrNumber).toBe(99)
    expect(closed.closingPrUrl).toBe("https://github.com/acme/widgets/pull/99")

    // Failed link — issueState null + beginner-safe reason, no raw HTTP code.
    const broken = byRef.get("epic/feature/004")!
    expect(broken.issueState).toBeNull()
    expect(broken.failureReason).toContain("couldn't be found")

    // Unsynced task (002) produced no row.
    expect(byRef.has("epic/feature/002")).toBe(false)
  })

  it("does not record a closing PR for an open issue that has linked PRs", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, ".claude/epics/feature/001.md", taskFile("https://github.com/acme/widgets/issues/11"), "ccpm-task")
    const client = makeClient({
      11: { issue: issueRes(11, "open"), timeline: [prEvent(50)] },
    })
    await resolveCcpmLinks("acme", "widgets", { client, db })
    const [link] = await listCcpmLinks("acme", "widgets", { db })
    expect(link!.issueState).toBe("open")
    expect(link!.closingPrNumber).toBeNull()
  })

  it("maps each boundary error to beginner-safe copy (no HTTP codes)", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, ".claude/epics/feature/001.md", taskFile("https://github.com/acme/widgets/issues/11"), "ccpm-task")
    const client = makeClient({
      11: { issueError: new GitHubError("rate_limited", "429") },
    })
    await resolveCcpmLinks("acme", "widgets", { client, db })
    const [link] = await listCcpmLinks("acme", "widgets", { db })
    expect(link!.failureReason).toContain("rate limit")
    expect(link!.failureReason).not.toContain("429")
  })

  it("replaces a snapshot's links on re-resolve (no duplicates)", async () => {
    seedStandardSnapshot()
    await resolveCcpmLinks("acme", "widgets", { client: standardClient(), db })
    await resolveCcpmLinks("acme", "widgets", { client: standardClient(), db })
    const links = await listCcpmLinks("acme", "widgets", { db })
    expect(links).toHaveLength(3)
  })

  it("is a clean no-op when the snapshot is missing", async () => {
    const summary = await resolveCcpmLinks("nobody", "nothing", {
      client: standardClient(),
      db,
    })
    expect(summary).toEqual({ scanned: 0, linked: 0, failed: 0 })
    expect(await listCcpmLinks("nobody", "nothing", { db })).toEqual([])
  })
})
