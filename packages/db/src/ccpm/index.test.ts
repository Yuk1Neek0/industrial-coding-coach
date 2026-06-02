// Unit tests for the CCPM data-access layer (Issue #203).
//
// getDeliveryMap is exercised against a seeded in-memory snapshot (no client —
// it is offline by construction). importRepositoryWithLinks is exercised end to
// end with a fake client that serves both the import (metadata/tree/content)
// and the linking (getIssue/timeline) calls.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import {
  ccpmIssueLinks,
  repoFiles,
  repoSnapshots,
  type NewCcpmIssueLink,
  type NewRepoFile,
  type NewRepoSnapshot,
} from "../schema"
import * as schema from "../schema"
import {
  GitHubError,
  type FileContent,
  type GitHubClient,
  type IssueApiResponse,
  type RepoMetadata,
  type RepoTree,
  type TreeEntry,
} from "../github"
import { ok } from "../github/errors"
import { getDeliveryMap, importRepositoryWithLinks } from "./index"

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

describe("getDeliveryMap — offline read", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("composes graph + teaching + persisted links for a CCPM repo", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, ".claude/prds/feature.md", "---\nname: feature\n---\nbody", "ccpm-prd")
    seedFile(db, id, ".claude/epics/feature/epic.md", "---\nname: feature\nprd: .claude/prds/feature.md\n---\nbody", "ccpm-epic")
    seedFile(db, id, ".claude/epics/feature/001.md", "---\nname: A\ngithub: https://github.com/acme/widgets/issues/11\n---\nbody", "ccpm-task")
    seedFile(db, id, "package.json", "{}", "package-manifest")
    const link: NewCcpmIssueLink = {
      snapshotId: id,
      taskRef: "epic/feature/001",
      issueNumber: 11,
      issueState: "closed",
      closingPrNumber: 99,
      closingPrUrl: "https://github.com/acme/widgets/pull/99",
    }
    db.insert(ccpmIssueLinks).values(link).run()

    const result = await getDeliveryMap("acme", "widgets", { db })
    expect(result.kind).toBe("map")
    if (result.kind !== "map") return

    expect(result.map.prds.map((p) => p.name)).toEqual(["feature"])
    expect(result.map.stats.taskCount).toBe(1)
    expect(result.teaching.kind).toBe("map")
    // Persisted link is joined by taskRef.
    expect(result.links["epic/feature/001"]?.issueState).toBe("closed")
    expect(result.links["epic/feature/001"]?.closingPrNumber).toBe(99)
  })

  it("returns the degradation result for a non-CCPM snapshot", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, "package.json", "{}", "package-manifest")
    seedFile(db, id, "README.md", "# hi", "readme")

    const result = await getDeliveryMap("acme", "widgets", { db })
    expect(result.kind).toBe("absent")
    if (result.kind !== "absent") return
    expect(result.detection.kind).toBe("absent")
    expect(result.teaching.goldenPath.slug).toBe("agentic-ccpm-workflow")
  })

  it("returns the degradation result when the snapshot is missing", async () => {
    const result = await getDeliveryMap("nobody", "nothing", { db })
    expect(result.kind).toBe("absent")
  })

  it("renders a map even when no links have been resolved yet", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, ".claude/epics/feature/001.md", "---\nname: A\ngithub: https://github.com/acme/widgets/issues/11\n---\nbody", "ccpm-task")
    const result = await getDeliveryMap("acme", "widgets", { db })
    expect(result.kind).toBe("map")
    if (result.kind !== "map") return
    expect(result.map.stats.taskCount).toBe(1)
    expect(result.links).toEqual({})
  })
})

describe("importRepositoryWithLinks — import + link in one step", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  const META: RepoMetadata = {
    owner: "acme",
    repo: "widgets",
    description: null,
    defaultBranch: "main",
    primaryLanguage: "TypeScript",
    isPrivate: false,
    htmlUrl: "https://github.com/acme/widgets",
  }

  const TREE: TreeEntry[] = [
    { path: "package.json", type: "blob", sha: "p", size: 10 },
    { path: ".claude/epics/feature/001.md", type: "blob", sha: "t1", size: 90 },
  ]

  const CONTENT: Record<string, string> = {
    "package.json": "{}",
    ".claude/epics/feature/001.md":
      "---\nname: A\nstatus: closed\ngithub: https://github.com/acme/widgets/issues/11\ndepends_on: []\n---\nbody",
  }

  function combinedClient(): GitHubClient {
    const unused = () => Promise.reject(new Error("not used"))
    return {
      authenticated: false,
      getRepoMetadata: () => Promise.resolve(ok(META)),
      getRepoTree: () =>
        Promise.resolve(ok({ commitSha: "c", entries: TREE, truncated: false } as RepoTree)),
      getFileContent: (_ref, filePath: string) => {
        const content = CONTENT[filePath]
        if (content === undefined) {
          return Promise.resolve({
            ok: false as const,
            error: new GitHubError("not_found", `no fixture for ${filePath}`),
          })
        }
        const file: FileContent = { path: filePath, sha: `s-${filePath}`, size: content.length, content }
        return Promise.resolve(ok(file))
      },
      getIssue: (_ref, n: number) => {
        const issue: IssueApiResponse = {
          number: n,
          title: `Issue ${n}`,
          body: null,
          state: "closed",
          html_url: `https://github.com/acme/widgets/issues/${n}`,
        }
        return Promise.resolve(ok(issue))
      },
      getIssueTimeline: () => Promise.resolve(ok([])),
      getPullRequest: unused,
      getPullRequestFiles: unused,
      getLinkedIssueNumber: unused,
      listIssues: unused,
    }
  }

  it("imports the snapshot AND resolves links, so the map view is offline", async () => {
    const imported = await importRepositoryWithLinks({
      owner: "acme",
      repo: "widgets",
      client: combinedClient(),
      db,
    })
    expect(imported.ok).toBe(true)

    // No client passed here — the view reads links purely from local storage.
    const result = await getDeliveryMap("acme", "widgets", { db })
    expect(result.kind).toBe("map")
    if (result.kind !== "map") return
    expect(result.links["epic/feature/001"]?.issueState).toBe("closed")
  })
})
