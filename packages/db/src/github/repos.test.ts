// Tests for the imported-repo data-access layer (Issue #40, PRD FR-5).
//
// The DB is a fresh in-memory SQLite with the real migrations applied, so the
// repo_snapshots / repo_files round-trip is exercised end to end. The GitHub
// client is fully mocked where an import is exercised — these tests never reach
// the real API (mirrors `import.test.ts`).

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import { repoFiles, repoSnapshots, type NewRepoSnapshot } from "../schema"
import * as schema from "../schema"
import type {
  FileContent,
  GitHubClient,
  RepoMetadata,
  RepoTree,
  TreeEntry,
} from "./client"
import { GitHubError, fail, ok, type GitHubResult } from "./errors"
import {
  getImportedRepo,
  getImportedRepoById,
  getRepoFile,
  getRepoTree,
  importRepository,
  listImportedRepos,
  listRepoFiles,
} from "./repos"

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

// --------------------------------------------------------------------------
// Fixtures for the import-path tests — a fully mocked GitHub client.
// --------------------------------------------------------------------------

const META: RepoMetadata = {
  owner: "vercel",
  repo: "next.js",
  description: "The React Framework",
  defaultBranch: "main",
  primaryLanguage: "TypeScript",
  isPrivate: false,
  htmlUrl: "https://github.com/vercel/next.js",
}

const TREE_ENTRIES: TreeEntry[] = [
  { path: "package.json", type: "blob", sha: "f-pkg", size: 1200 },
  { path: "pnpm-lock.yaml", type: "blob", sha: "f-lock", size: 40_000 },
  { path: "tsconfig.json", type: "blob", sha: "f-tsc", size: 400 },
  { path: "README.md", type: "blob", sha: "f-readme", size: 2000 },
  { path: ".github/workflows/ci.yml", type: "blob", sha: "f-ci", size: 800 },
  { path: "src", type: "tree", sha: "t-src" },
  { path: "src/index.ts", type: "blob", sha: "f-src", size: 5000 },
]

const FILE_CONTENT: Record<string, string> = {
  "package.json": '{ "name": "next" }',
  "pnpm-lock.yaml": "lockfileVersion: '9.0'",
  "tsconfig.json": '{ "compilerOptions": {} }',
  "README.md": "# Next.js",
  ".github/workflows/ci.yml": "name: CI",
}

interface FakeClientOptions {
  metadata?: GitHubResult<RepoMetadata>
  tree?: GitHubResult<RepoTree>
}

/** A hand-rolled fake GitHub client — same seam the #38 client interface gives. */
function makeFakeClient(options: FakeClientOptions = {}): GitHubClient {
  return {
    authenticated: false,
    getRepoMetadata() {
      return Promise.resolve(options.metadata ?? ok(META))
    },
    getRepoTree() {
      return Promise.resolve(
        options.tree ??
          ok({
            commitSha: "commit-abc",
            entries: TREE_ENTRIES,
            truncated: false,
          }),
      )
    },
    getFileContent(_ref, filePath: string) {
      void _ref
      const content = FILE_CONTENT[filePath]
      if (content === undefined) {
        return Promise.resolve(
          fail(new GitHubError("not_found", `no fixture for ${filePath}`)),
        )
      }
      const file: FileContent = {
        path: filePath,
        sha: `sha-${filePath}`,
        size: content.length,
        content,
      }
      return Promise.resolve(ok(file))
    },
    // The import path never touches PR endpoints; these stubs only satisfy the
    // GitHubClient interface (PR fetching is covered by pull-requests.test.ts).
    getPullRequest() {
      return Promise.reject(new Error("not used by the import path"))
    },
    getPullRequestFiles() {
      return Promise.reject(new Error("not used by the import path"))
    },
    getLinkedIssueNumber() {
      return Promise.reject(new Error("not used by the import path"))
    },
    getIssue() {
      return Promise.reject(new Error("not used by the import path"))
    },
  }
}

// --------------------------------------------------------------------------
// Fixtures for the read-path tests — snapshots seeded directly into the DB,
// no GitHub client needed.
// --------------------------------------------------------------------------

/** Seed a snapshot row and return its generated id. */
function seedSnapshot(
  db: CatalogDb,
  overrides: Partial<NewRepoSnapshot> = {},
): number {
  const base: NewRepoSnapshot = {
    owner: "acme",
    repo: "widgets",
    ref: "main",
    commitSha: "c-main",
    defaultBranch: "main",
    description: "Widget factory",
    primaryLanguage: "TypeScript",
    isPrivate: false,
    htmlUrl: "https://github.com/acme/widgets",
    fileTree: [
      { path: "package.json", type: "blob", sha: "f-pkg", size: 100 },
      { path: "src", type: "tree", sha: "t-src" },
    ],
    ...overrides,
  }
  const [row] = db.insert(repoSnapshots).values(base).returning().all()
  return row!.id
}

describe("importRepository (data-access wrapper)", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("imports a repo from { owner, repo } input and persists a snapshot", async () => {
    const result = await importRepository({
      owner: "vercel",
      repo: "next.js",
      client: makeFakeClient(),
      db,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.snapshot.owner).toBe("vercel")
    expect(result.data.snapshot.repo).toBe("next.js")
    expect(result.data.snapshot.ref).toBe("main")
    expect(result.data.updated).toBe(false)
    // Only the 5 key files were captured — never src/index.ts.
    expect(result.data.files).toHaveLength(5)

    // The snapshot is actually in the DB and reachable via the read layer.
    const stored = await getImportedRepo("vercel", "next.js", "main", db)
    expect(stored?.commitSha).toBe("commit-abc")
  })

  it("forwards an explicit ref onto the imported snapshot", async () => {
    const result = await importRepository({
      owner: "vercel",
      repo: "next.js",
      ref: "canary",
      client: makeFakeClient(),
      db,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.snapshot.ref).toBe("canary")
  })

  it("re-importing the same owner/repo/ref updates the snapshot in place (US-3)", async () => {
    const first = await importRepository({
      owner: "vercel",
      repo: "next.js",
      client: makeFakeClient(),
      db,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = await importRepository({
      owner: "vercel",
      repo: "next.js",
      client: makeFakeClient({
        tree: ok({
          commitSha: "commit-xyz",
          entries: TREE_ENTRIES,
          truncated: false,
        }),
      }),
      db,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    expect(second.data.updated).toBe(true)
    expect(second.data.snapshot.id).toBe(first.data.snapshot.id)
    expect(db.select().from(repoSnapshots).all()).toHaveLength(1)
  })

  it("surfaces a typed not_found error and persists nothing", async () => {
    const result = await importRepository({
      owner: "vercel",
      repo: "ghost-repo",
      client: makeFakeClient({
        metadata: fail(new GitHubError("not_found", "repo missing")),
      }),
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("not_found")
    expect(db.select().from(repoSnapshots).all()).toHaveLength(0)
  })
})

describe("listImportedRepos", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns an empty array when nothing has been imported", async () => {
    expect(await listImportedRepos(db)).toEqual([])
  })

  it("returns every imported snapshot, newest import first", async () => {
    seedSnapshot(db, {
      owner: "acme",
      repo: "old",
      importedAt: new Date("2026-01-01T00:00:00Z"),
    })
    seedSnapshot(db, {
      owner: "acme",
      repo: "new",
      importedAt: new Date("2026-05-01T00:00:00Z"),
    })
    seedSnapshot(db, {
      owner: "acme",
      repo: "mid",
      importedAt: new Date("2026-03-01T00:00:00Z"),
    })

    const all = await listImportedRepos(db)
    expect(all.map((s) => s.repo)).toEqual(["new", "mid", "old"])
  })
})

describe("getImportedRepo", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns the matching snapshot for owner/repo/ref", async () => {
    seedSnapshot(db, { owner: "acme", repo: "widgets", ref: "main" })
    const snap = await getImportedRepo("acme", "widgets", "main", db)
    expect(snap?.owner).toBe("acme")
    expect(snap?.ref).toBe("main")
  })

  it("returns null when no snapshot matches (clean miss)", async () => {
    expect(await getImportedRepo("acme", "widgets", "main", db)).toBeNull()
  })

  it("returns null when the ref does not match an imported snapshot", async () => {
    seedSnapshot(db, { owner: "acme", repo: "widgets", ref: "main" })
    expect(await getImportedRepo("acme", "widgets", "dev", db)).toBeNull()
  })

  it("returns the newest snapshot across refs when ref is omitted", async () => {
    seedSnapshot(db, {
      owner: "acme",
      repo: "widgets",
      ref: "main",
      importedAt: new Date("2026-01-01T00:00:00Z"),
    })
    seedSnapshot(db, {
      owner: "acme",
      repo: "widgets",
      ref: "canary",
      importedAt: new Date("2026-05-01T00:00:00Z"),
    })

    const snap = await getImportedRepo("acme", "widgets", undefined, db)
    expect(snap?.ref).toBe("canary")
  })
})

describe("getImportedRepoById", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns the snapshot with the given id", async () => {
    const id = seedSnapshot(db)
    const snap = await getImportedRepoById(id, db)
    expect(snap?.id).toBe(id)
  })

  it("returns null for an unknown id", async () => {
    expect(await getImportedRepoById(9999, db)).toBeNull()
  })
})

describe("getRepoTree", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns the snapshot's file tree", async () => {
    seedSnapshot(db, { owner: "acme", repo: "widgets", ref: "main" })
    const tree = await getRepoTree("acme", "widgets", "main", db)
    expect(tree).not.toBeNull()
    expect(tree?.map((e) => e.path)).toEqual(["package.json", "src"])
  })

  it("returns null when the repo was never imported", async () => {
    expect(await getRepoTree("acme", "missing", "main", db)).toBeNull()
  })

  it("returns an empty tree (not null) for a snapshot with no entries", async () => {
    seedSnapshot(db, { owner: "acme", repo: "empty", ref: "main", fileTree: [] })
    const tree = await getRepoTree("acme", "empty", "main", db)
    expect(tree).toEqual([])
  })
})

describe("listRepoFiles", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns the snapshot's key files, ordered by path", async () => {
    const id = seedSnapshot(db, { owner: "acme", repo: "widgets", ref: "main" })
    db.insert(repoFiles)
      .values([
        {
          snapshotId: id,
          path: "tsconfig.json",
          sha: "s1",
          size: 10,
          content: "{}",
          category: "build-config",
        },
        {
          snapshotId: id,
          path: "package.json",
          sha: "s2",
          size: 20,
          content: '{ "name": "widgets" }',
          category: "package-manifest",
        },
      ])
      .run()

    const files = await listRepoFiles("acme", "widgets", "main", db)
    expect(files.map((f) => f.path)).toEqual([
      "package.json",
      "tsconfig.json",
    ])
  })

  it("returns an empty array for a snapshot with no key files", async () => {
    seedSnapshot(db, { owner: "acme", repo: "widgets", ref: "main" })
    expect(await listRepoFiles("acme", "widgets", "main", db)).toEqual([])
  })

  it("returns an empty array when the repo was never imported", async () => {
    expect(await listRepoFiles("acme", "missing", "main", db)).toEqual([])
  })
})

describe("getRepoFile", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns the imported key file at the given path", async () => {
    const id = seedSnapshot(db, { owner: "acme", repo: "widgets", ref: "main" })
    db.insert(repoFiles)
      .values({
        snapshotId: id,
        path: "package.json",
        sha: "s1",
        size: 20,
        content: '{ "name": "widgets" }',
        category: "package-manifest",
      })
      .run()

    const file = await getRepoFile(
      "acme",
      "widgets",
      "package.json",
      "main",
      db,
    )
    expect(file?.content).toBe('{ "name": "widgets" }')
    expect(file?.category).toBe("package-manifest")
  })

  it("returns null when the path is not a captured key file", async () => {
    seedSnapshot(db, { owner: "acme", repo: "widgets", ref: "main" })
    expect(
      await getRepoFile("acme", "widgets", "src/index.ts", "main", db),
    ).toBeNull()
  })

  it("returns null when the repo was never imported", async () => {
    expect(
      await getRepoFile("acme", "missing", "package.json", "main", db),
    ).toBeNull()
  })

  it("scopes the file lookup to the right snapshot", async () => {
    const mainId = seedSnapshot(db, {
      owner: "acme",
      repo: "widgets",
      ref: "main",
    })
    const devId = seedSnapshot(db, {
      owner: "acme",
      repo: "widgets",
      ref: "dev",
    })
    db.insert(repoFiles)
      .values([
        {
          snapshotId: mainId,
          path: "package.json",
          sha: "s-main",
          size: 10,
          content: "main content",
          category: "package-manifest",
        },
        {
          snapshotId: devId,
          path: "package.json",
          sha: "s-dev",
          size: 10,
          content: "dev content",
          category: "package-manifest",
        },
      ])
      .run()

    const file = await getRepoFile(
      "acme",
      "widgets",
      "package.json",
      "dev",
      db,
    )
    expect(file?.content).toBe("dev content")
  })
})

describe("data-access layer — end-to-end import then read", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("an imported repo is fully readable through every query function", async () => {
    const imported = await importRepository({
      owner: "vercel",
      repo: "next.js",
      client: makeFakeClient(),
      db,
    })
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    // list
    const all = await listImportedRepos(db)
    expect(all).toHaveLength(1)

    // get one
    const snap = await getImportedRepo("vercel", "next.js", "main", db)
    expect(snap?.id).toBe(imported.data.snapshot.id)

    // by id
    expect((await getImportedRepoById(imported.data.snapshot.id, db))?.repo).toBe(
      "next.js",
    )

    // tree
    const tree = await getRepoTree("vercel", "next.js", "main", db)
    expect(tree?.length).toBe(TREE_ENTRIES.length)

    // files
    const files = await listRepoFiles("vercel", "next.js", "main", db)
    expect(files).toHaveLength(5)

    // single file content
    const pkg = await getRepoFile(
      "vercel",
      "next.js",
      "package.json",
      "main",
      db,
    )
    expect(pkg?.content).toBe('{ "name": "next" }')
  })
})
