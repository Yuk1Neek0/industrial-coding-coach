// Typed data-access layer for imported GitHub repository snapshots
// (Issue #40, PRD FR-5, ADR 0009).
//
// This is the single typed interface the Import UI (#42) and the analysis
// milestones (M5 Stack Explainer, M6 Project Logic Mapper) read through. It
// covers the four operations the epic names: import a repo, list imported
// repos, get one repo's snapshot + file tree, and get a file's content.
//
// Server-side only — these functions open (or are handed) a local SQLite
// connection (ADR 0006/0009). Every read function accepts an optional
// `CatalogDb` so tests inject a fixture database; in the app, callers omit it
// and a lazily-created package-local default is used. GitHub is contacted only
// by `importRepository`; the read functions never touch the network.
//
// Style mirrors the M2 catalog data-access module (`../catalog.ts`): small,
// fully typed functions, an injectable `CatalogDb`, `null` for a clean miss.

import { and, desc, eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "../client"
import {
  repoFiles,
  repoSnapshots,
  type RepoFile,
  type RepoSnapshot,
} from "../schema"
import {
  importRepository as importRepositoryModule,
  type ImportResult,
} from "./import"
import type { GitHubClient } from "./client"
import type { GitHubResult } from "./errors"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/**
 * Input for {@link importRepository}.
 *
 * This is the shape the Import page spec (`docs/design/github-import-page.md`
 * §5) calls with: an already-split `owner` / `repo` and an optional git `ref`.
 * The page parses the user's URL to `owner` + `repo` before calling.
 */
export interface ImportRepositoryInput {
  /** Repository owner (user or org), e.g. `vercel`. */
  owner: string
  /** Repository name, e.g. `next.js`. */
  repo: string
  /** Branch, tag, or commit SHA. Omitted → the repository's default branch. */
  ref?: string
  /**
   * GitHub client to use. Injectable so tests pass a mocked client and the
   * import never reaches the real API. Omitted → a client built from
   * `GITHUB_TOKEN` (ADR 0009 §1).
   */
  client?: GitHubClient
  /**
   * Catalog DB to write into. Injectable for tests (in-memory DB). Omitted →
   * the package-local catalog SQLite database.
   */
  db?: CatalogDb
}

export type { ImportResult } from "./import"
export type { GitHubResult } from "./errors"

/**
 * Import a GitHub repository into a local snapshot (PRD FR-1, US-1).
 *
 * This is the entry point the Import UI calls. It is a thin wrapper over the
 * Issue #39 import module: it adapts the page spec's `{ owner, repo, ref? }`
 * input onto the module's `RepoRef` source and forwards the optional injectable
 * client / DB. The import module owns the GitHub fetch, key-file selection, and
 * snapshot persistence — this layer does not reimplement any of it.
 *
 * Returns the import module's discriminated {@link GitHubResult}: a successful
 * {@link ImportResult}, or a typed {@link GitHubError} (`invalid_url`,
 * `not_found`, `auth_failed`, `rate_limited`, ...) the UI maps to a clear
 * boundary-error message. Re-importing the same `owner/repo/ref` updates the
 * existing snapshot in place (PRD US-3).
 */
export function importRepository(
  input: ImportRepositoryInput,
): Promise<GitHubResult<ImportResult>> {
  return importRepositoryModule({
    source: { owner: input.owner, repo: input.repo },
    ...(input.ref !== undefined ? { ref: input.ref } : {}),
    ...(input.client !== undefined ? { client: input.client } : {}),
    ...(input.db !== undefined ? { db: input.db } : {}),
  })
}

/**
 * List every imported repository snapshot, newest import first.
 *
 * Ordered by `importedAt` descending so the most recently imported (or
 * refreshed) repository is first — the order an "imported repositories" list
 * would render. Returns an empty array when nothing has been imported yet.
 */
export async function listImportedRepos(
  db?: CatalogDb,
): Promise<RepoSnapshot[]> {
  return resolveDb(db)
    .select()
    .from(repoSnapshots)
    .orderBy(desc(repoSnapshots.importedAt))
    .all()
}

/**
 * Get one imported repository's snapshot by `owner` / `repo` / `ref`.
 *
 * When `ref` is omitted, the most recently imported snapshot for that
 * `owner/repo` (across any ref) is returned — the page spec
 * (`docs/design/github-import-page.md` §5) calls this with an optional `ref` to
 * detect a re-import. Returns `null` when no snapshot matches (a clean miss).
 */
export async function getImportedRepo(
  owner: string,
  repo: string,
  ref?: string,
  db?: CatalogDb,
): Promise<RepoSnapshot | null> {
  const conditions =
    ref !== undefined
      ? and(
          eq(repoSnapshots.owner, owner),
          eq(repoSnapshots.repo, repo),
          eq(repoSnapshots.ref, ref),
        )
      : and(eq(repoSnapshots.owner, owner), eq(repoSnapshots.repo, repo))

  const rows = resolveDb(db)
    .select()
    .from(repoSnapshots)
    .where(conditions)
    .orderBy(desc(repoSnapshots.importedAt))
    .limit(1)
    .all()
  return rows[0] ?? null
}

/**
 * Get one imported repository's snapshot by its primary-key `id`, or `null`
 * when no snapshot has that id.
 */
export async function getImportedRepoById(
  id: number,
  db?: CatalogDb,
): Promise<RepoSnapshot | null> {
  const rows = resolveDb(db)
    .select()
    .from(repoSnapshots)
    .where(eq(repoSnapshots.id, id))
    .limit(1)
    .all()
  return rows[0] ?? null
}

/**
 * Get an imported repository's file tree — the full `RepoTreeEntry[]` captured
 * at import time. Returns `null` when no snapshot matches (so the caller can
 * distinguish "repo not imported" from "repo imported, empty tree").
 *
 * The tree is read from the snapshot's JSON column; it is not a network call.
 */
export async function getRepoTree(
  owner: string,
  repo: string,
  ref?: string,
  db?: CatalogDb,
): Promise<RepoSnapshot["fileTree"] | null> {
  const snapshot = await getImportedRepo(owner, repo, ref, db)
  return snapshot ? snapshot.fileTree : null
}

/**
 * List the imported key files of a repository snapshot — every `repo_files`
 * row, ordered by path.
 *
 * Returns an empty array both when the snapshot exists with no key files and
 * when no snapshot matches; use {@link getImportedRepo} first if the caller
 * needs to tell those two cases apart.
 */
export async function listRepoFiles(
  owner: string,
  repo: string,
  ref?: string,
  db?: CatalogDb,
): Promise<RepoFile[]> {
  const resolved = resolveDb(db)
  const snapshot = await getImportedRepo(owner, repo, ref, resolved)
  if (!snapshot) return []
  return resolved
    .select()
    .from(repoFiles)
    .where(eq(repoFiles.snapshotId, snapshot.id))
    .orderBy(repoFiles.path)
    .all()
}

/**
 * Get a single imported key file of a repository snapshot by its repo-relative
 * `filePath` (e.g. `apps/web/package.json`), or `null` when the snapshot or the
 * file is not present.
 *
 * This is the read M5 (Stack Decision Explainer) uses to pull `package.json`,
 * lockfiles, and config out of an imported snapshot. It reads the local
 * snapshot only — never the network (ADR 0009, local-first).
 */
export async function getRepoFile(
  owner: string,
  repo: string,
  filePath: string,
  ref?: string,
  db?: CatalogDb,
): Promise<RepoFile | null> {
  const resolved = resolveDb(db)
  const snapshot = await getImportedRepo(owner, repo, ref, resolved)
  if (!snapshot) return null
  const rows = resolved
    .select()
    .from(repoFiles)
    .where(
      and(
        eq(repoFiles.snapshotId, snapshot.id),
        eq(repoFiles.path, filePath),
      ),
    )
    .limit(1)
    .all()
  return rows[0] ?? null
}
