// Server-side data access for the GitHub Repository Import page (task #42).
//
// Wraps the @workspace/db repo-import data-access layer (#40) with an explicit
// DB path resolved from the web app's working directory, and maps its typed
// result onto the serializable view shapes the /import Client Component and its
// Server Action render. Imported only by server code (the Server Action) —
// never by a Client Component.

import path from "node:path"

import {
  type CatalogDb,
  createCatalogDb,
  type GitHubErrorKind,
  importRepository,
} from "@workspace/db"

/** One captured key file, as the success view renders it. */
export interface ImportedKeyFile {
  path: string
  bytes: number
}

/** What the success result view renders (page spec §5). */
export interface ImportSuccessView {
  owner: string
  repo: string
  /** The branch/tag imported — the resolved default branch when none was given. */
  ref: string
  defaultBranch: string
  /** Number of file (blob) entries in the imported file tree. */
  fileCount: number
  keyFiles: ImportedKeyFile[]
  /** ISO timestamp of when the snapshot was taken. */
  importedAt: string
  /** `true` when this import refreshed an existing snapshot (PRD US-3). */
  isReimport: boolean
}

/** The coarse UI error kinds the error state renders (page spec §5/§11). */
export type ImportErrorUiKind =
  | "invalid-url"
  | "not-found"
  | "rate-limited"
  | "auth-failure"
  | "unknown"

/** What an error state renders. */
export interface ImportErrorView {
  kind: ImportErrorUiKind
  /**
   * The data-access layer's human-readable message. Kept for logging/diagnosis
   * — the UI renders curated per-kind copy instead, so no raw status code or
   * stack trace reaches the page (page spec §11).
   */
  message: string
}

/** The discriminated result the Server Action returns to the Client Component. */
export type ImportActionResult =
  | { ok: true; result: ImportSuccessView }
  | { ok: false; error: ImportErrorView }

/** Input the Client Component sends — `owner`/`repo` already parsed from the URL. */
export interface ImportInput {
  owner: string
  repo: string
  /** Optional branch/tag; omitted means the repository's default branch. */
  ref?: string
}

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function importDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(importDbFile())
  return cached
}

/** Map a typed `GitHubError` kind onto the UI's coarser error kind. */
function toUiKind(kind: GitHubErrorKind): ImportErrorUiKind {
  switch (kind) {
    case "invalid_url":
      return "invalid-url"
    case "not_found":
      return "not-found"
    case "rate_limited":
      return "rate-limited"
    case "auth_failed":
      return "auth-failure"
    case "http_error":
    case "network_error":
      return "unknown"
  }
}

/**
 * Run a repository import and adapt the result for the UI.
 *
 * Calls the #40 data-access layer's `importRepository`; on success maps the
 * persisted snapshot + key files onto {@link ImportSuccessView}, and on a typed
 * boundary failure maps the error kind onto {@link ImportErrorView}. Expected
 * import failures are returned as `{ ok: false }` — never thrown — so the page
 * renders an in-page error state rather than tripping the route error boundary
 * (page spec §11).
 */
export async function runImport(
  input: ImportInput,
): Promise<ImportActionResult> {
  const result = await importRepository({
    owner: input.owner,
    repo: input.repo,
    ...(input.ref ? { ref: input.ref } : {}),
    db: db(),
  })

  if (!result.ok) {
    return {
      ok: false,
      error: {
        kind: toUiKind(result.error.kind),
        message: result.error.message,
      },
    }
  }

  const { snapshot, files, updated } = result.data
  return {
    ok: true,
    result: {
      owner: snapshot.owner,
      repo: snapshot.repo,
      ref: snapshot.ref,
      defaultBranch: snapshot.defaultBranch,
      fileCount: snapshot.fileTree.filter((entry) => entry.type === "blob")
        .length,
      keyFiles: files.map((file) => ({ path: file.path, bytes: file.size })),
      importedAt: snapshot.importedAt.toISOString(),
      isReimport: updated,
    },
  }
}
