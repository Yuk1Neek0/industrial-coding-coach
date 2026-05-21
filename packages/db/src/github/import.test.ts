// Integration tests for the repo-import module (Issue #39, PRD FR-1/US-3).
//
// The GitHub client is fully mocked — these tests never reach the real API.
// The DB is a fresh in-memory SQLite with the real migrations applied, so the
// repo_snapshots / repo_files round-trip is exercised end to end.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { eq } from "drizzle-orm"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import { repoFiles, repoSnapshots } from "../schema"
import * as schema from "../schema"
import type {
  FileContent,
  GitHubClient,
  RepoMetadata,
  RepoTree,
  TreeEntry,
} from "./client"
import { GitHubError, fail, ok, type GitHubResult } from "./errors"
import { importRepository } from "./import"

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

/** Per-path file content the fake client serves. */
const FILE_CONTENT: Record<string, string> = {
  "package.json": '{ "name": "next" }',
  "pnpm-lock.yaml": "lockfileVersion: '9.0'",
  "tsconfig.json": '{ "compilerOptions": {} }',
  "README.md": "# Next.js",
  ".github/workflows/ci.yml": "name: CI",
}

/** Options for {@link makeFakeClient} — overrides per stage of the import. */
interface FakeClientOptions {
  metadata?: GitHubResult<RepoMetadata>
  tree?: GitHubResult<RepoTree>
  /** Per-path content override; a `GitHubError` fails just that file fetch. */
  fileOverrides?: Record<string, GitHubError>
  /** Records every getFileContent path requested, in order. */
  fetchedPaths?: string[]
}

/**
 * A hand-rolled fake GitHub client. Reuses the #38 client *interface* (the
 * injectable seam) without any network — `importRepository` cannot tell it
 * apart from the real client.
 */
function makeFakeClient(options: FakeClientOptions = {}): GitHubClient {
  return {
    authenticated: false,
    getRepoMetadata() {
      return Promise.resolve(options.metadata ?? ok(META))
    },
    getRepoTree() {
      return Promise.resolve(
        options.tree ??
          ok({ commitSha: "commit-abc", entries: TREE_ENTRIES, truncated: false }),
      )
    },
    getFileContent(_ref, filePath: string) {
      void _ref
      options.fetchedPaths?.push(filePath)
      const override = options.fileOverrides?.[filePath]
      if (override) return Promise.resolve(fail(override))
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
  }
}

describe("importRepository — happy path", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("imports metadata, tree, and key-file contents into a snapshot", async () => {
    const result = await importRepository({
      source: "vercel/next.js",
      client: makeFakeClient(),
      db,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { snapshot, files, updated, treeTruncated } = result.data
    expect(updated).toBe(false)
    expect(treeTruncated).toBe(false)

    // Snapshot carries the metadata + full tree.
    expect(snapshot.owner).toBe("vercel")
    expect(snapshot.repo).toBe("next.js")
    expect(snapshot.ref).toBe("main")
    expect(snapshot.commitSha).toBe("commit-abc")
    expect(snapshot.defaultBranch).toBe("main")
    expect(snapshot.primaryLanguage).toBe("TypeScript")
    expect(snapshot.fileTree).toHaveLength(TREE_ENTRIES.length)

    // Only the key files were persisted — never src/index.ts.
    const paths = files.map((f) => f.path).sort()
    expect(paths).toEqual([
      ".github/workflows/ci.yml",
      "README.md",
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig.json",
    ])
    expect(paths).not.toContain("src/index.ts")
  })

  it("tags each persisted file with its key-file category", async () => {
    const result = await importRepository({
      source: "vercel/next.js",
      client: makeFakeClient(),
      db,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const byPath = new Map(
      result.data.files.map((f) => [f.path, f.category]),
    )
    expect(byPath.get("package.json")).toBe("package-manifest")
    expect(byPath.get("pnpm-lock.yaml")).toBe("lockfile")
    expect(byPath.get("tsconfig.json")).toBe("build-config")
    expect(byPath.get("README.md")).toBe("readme")
    expect(byPath.get(".github/workflows/ci.yml")).toBe("ci-workflow")
  })

  it("fetches contents ONLY for key files, not every file (rate-limit aware)", async () => {
    const fetchedPaths: string[] = []
    await importRepository({
      source: "vercel/next.js",
      client: makeFakeClient({ fetchedPaths }),
      db,
    })
    // 5 key files in the fixture tree; src/index.ts is never fetched.
    expect(fetchedPaths).toHaveLength(5)
    expect(fetchedPaths).not.toContain("src/index.ts")
  })

  it("accepts a full GitHub URL as the source", async () => {
    const result = await importRepository({
      source: "https://github.com/vercel/next.js",
      client: makeFakeClient(),
      db,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.snapshot.owner).toBe("vercel")
  })

  it("accepts a pre-parsed RepoRef as the source", async () => {
    const result = await importRepository({
      source: { owner: "vercel", repo: "next.js" },
      client: makeFakeClient(),
      db,
    })
    expect(result.ok).toBe(true)
  })

  it("keys the snapshot by an explicit ref when one is given", async () => {
    const result = await importRepository({
      source: "vercel/next.js",
      ref: "canary",
      client: makeFakeClient(),
      db,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.snapshot.ref).toBe("canary")
  })

  it("reports a truncated tree without failing the import", async () => {
    const result = await importRepository({
      source: "vercel/next.js",
      client: makeFakeClient({
        tree: ok({
          commitSha: "commit-abc",
          entries: TREE_ENTRIES,
          truncated: true,
        }),
      }),
      db,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.treeTruncated).toBe(true)
  })
})

describe("importRepository — re-import (PRD US-3)", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("updates the existing snapshot row instead of inserting a new one", async () => {
    const first = await importRepository({
      source: "vercel/next.js",
      client: makeFakeClient(),
      db,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const firstId = first.data.snapshot.id

    // Re-import the same owner/repo/ref — tree now reports a new commit.
    const second = await importRepository({
      source: "vercel/next.js",
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
    expect(second.data.snapshot.id).toBe(firstId)
    expect(second.data.snapshot.commitSha).toBe("commit-xyz")

    // Exactly one snapshot row exists for this owner/repo/ref.
    const allSnapshots = db.select().from(repoSnapshots).all()
    expect(allSnapshots).toHaveLength(1)
  })

  it("replaces the key files on re-import — no stale duplicates", async () => {
    await importRepository({
      source: "vercel/next.js",
      client: makeFakeClient(),
      db,
    })
    const second = await importRepository({
      source: "vercel/next.js",
      client: makeFakeClient(),
      db,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    // Still 5 key files for the one snapshot — not 10.
    const files = db
      .select()
      .from(repoFiles)
      .where(eq(repoFiles.snapshotId, second.data.snapshot.id))
      .all()
    expect(files).toHaveLength(5)
    expect(db.select().from(repoFiles).all()).toHaveLength(5)
  })

  it("keeps distinct refs of the same repo as separate snapshots", async () => {
    await importRepository({
      source: "vercel/next.js",
      ref: "main",
      client: makeFakeClient(),
      db,
    })
    await importRepository({
      source: "vercel/next.js",
      ref: "canary",
      client: makeFakeClient(),
      db,
    })
    expect(db.select().from(repoSnapshots).all()).toHaveLength(2)
  })
})

describe("importRepository — typed error surfacing (PRD FR-7)", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("surfaces an invalid_url error for a malformed source", async () => {
    const result = await importRepository({
      source: "not a repo at all",
      client: makeFakeClient(),
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("invalid_url")
  })

  it("surfaces a not_found error from the metadata call", async () => {
    const result = await importRepository({
      source: "vercel/ghost-repo",
      client: makeFakeClient({
        metadata: fail(new GitHubError("not_found", "repo missing")),
      }),
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("not_found")
    // Nothing was persisted on a failed import.
    expect(db.select().from(repoSnapshots).all()).toHaveLength(0)
  })

  it("surfaces an auth_failed error from the metadata call", async () => {
    const result = await importRepository({
      source: "vercel/next.js",
      client: makeFakeClient({
        metadata: fail(new GitHubError("auth_failed", "bad token")),
      }),
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("auth_failed")
  })

  it("surfaces a tree-fetch failure", async () => {
    const result = await importRepository({
      source: "vercel/next.js",
      client: makeFakeClient({
        tree: fail(new GitHubError("not_found", "ref missing")),
      }),
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("not_found")
    expect(db.select().from(repoSnapshots).all()).toHaveLength(0)
  })

  it("aborts the whole import when a key-file fetch hits a rate limit", async () => {
    const result = await importRepository({
      source: "vercel/next.js",
      client: makeFakeClient({
        fileOverrides: {
          "tsconfig.json": new GitHubError(
            "rate_limited",
            "rate limit exceeded",
          ),
        },
      }),
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("rate_limited")
  })

  it("records a non-fatal per-file 404 in `skipped` and still succeeds", async () => {
    const result = await importRepository({
      source: "vercel/next.js",
      client: makeFakeClient({
        fileOverrides: {
          "tsconfig.json": new GitHubError(
            "not_found",
            "file vanished between tree and contents",
          ),
        },
      }),
      db,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The import finished; the other 4 key files were stored.
    expect(result.data.files).toHaveLength(4)
    expect(result.data.skipped).toHaveLength(1)
    expect(result.data.skipped[0]?.path).toBe("tsconfig.json")
    expect(result.data.skipped[0]?.category).toBe("build-config")
    expect(result.data.files.map((f) => f.path)).not.toContain(
      "tsconfig.json",
    )
  })
})
