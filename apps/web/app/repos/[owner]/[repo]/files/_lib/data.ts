// Server-side data access for the M17 Snapshot File Viewer
// (`/repos/[owner]/[repo]/files`, task #268, page spec
// `docs/design/snapshot-file-viewer.page-spec.md` §5).
//
// A thin read-only view over the existing M11 snapshot DAL (`@workspace/db`,
// ADR 0011 / epic AD-1): no new DAL functions, no schema changes, and zero
// network — `importRepository` is the only network path in that module and
// this page never calls it (ADR 0009, local-first). The DB path is resolved
// from the web app's working directory, mirroring `lib/github-import.ts`.
//
// Query plan (spec §5): the file tree rides on the snapshot row, so the page
// makes ONE snapshot read via `getImportedRepo` (never a second one through
// `getRepoTree`), plus `listRepoFiles` for the captured key files. The
// returned rows include full `content`, so the selected captured file is
// served from these rows too — no extra `getRepoFile` round trip.

import path from "node:path"

import {
  type CatalogDb,
  createCatalogDb,
  getImportedRepo,
  listRepoFiles,
  type RepoFile,
  type RepoSnapshot,
} from "@workspace/db"

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function filesDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(filesDbFile())
  return cached
}

/** Everything the file-viewer page renders, from one local snapshot. */
export interface FilesPageData {
  /** The current snapshot for `owner/repo`; `null` → repo not imported (§11). */
  snapshot: RepoSnapshot | null
  /** Captured key files for the snapshot, ordered by path (full rows). */
  repoFiles: RepoFile[]
}

/**
 * Read the current (most recently imported) snapshot for `owner/repo` and its
 * captured key files. `ref` is deliberately omitted — the M17 contract has no
 * `?ref=` disambiguator (spec §4a/§15); the per-repo page convention reads the
 * latest snapshot across any ref.
 */
export async function getFilesPageData(
  owner: string,
  repo: string,
): Promise<FilesPageData> {
  const handle = db()
  const snapshot = await getImportedRepo(owner, repo, undefined, handle)
  if (!snapshot) return { snapshot: null, repoFiles: [] }
  const repoFiles = await listRepoFiles(owner, repo, undefined, handle)
  return { snapshot, repoFiles }
}
