// Repo-import module (Issue #39, PRD FR-1/FR-2/FR-3, ADR 0009).
//
// Given an `owner/repo` (+ optional ref), this:
//   1. uses the #38 GitHub client to fetch repository metadata,
//   2. fetches the recursive file tree,
//   3. SELECTS the key files (package.json, lockfiles, framework/build config,
//      README, CI workflows — see key-files.ts) and fetches ONLY their content,
//   4. writes the result into the `repo_snapshots` + `repo_files` tables.
//
// Re-importing the same `owner/repo/ref` UPDATES the existing snapshot row in
// place (PRD US-3). GitHub is contacted only here, at import time; downstream
// analysis reads the local snapshot (ADR 0009, local-first).
//
// Read-only: this never writes to a user's GitHub repository. Typed boundary
// errors from the #38 client are surfaced cleanly via `GitHubResult<T>`.

import { and, eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "../client"
import {
  repoFiles,
  repoSnapshots,
  type RepoFile,
  type RepoSnapshot,
} from "../schema"
import {
  createGitHubClient,
  parseRepoUrl,
  type GitHubClient,
  type RepoRef,
} from "./client"
import { fail, ok, type GitHubResult } from "./errors"
import { selectKeyFiles, type KeyFileCategory } from "./key-files"

/** Options for {@link importRepository}. */
export interface ImportRepoOptions {
  /**
   * A GitHub repo URL or `owner/repo` shorthand, OR a pre-parsed {@link RepoRef}.
   * Strings are parsed with the #38 `parseRepoUrl`; an invalid string yields a
   * typed `invalid_url` failure.
   */
  source: string | RepoRef
  /**
   * Branch, tag, or commit SHA to import. Omitted → the repository's default
   * branch. The snapshot is keyed by `owner/repo` + this resolved ref.
   */
  ref?: string
  /**
   * GitHub client to use. Injectable so tests pass a mocked client and the
   * import never reaches the real API. Defaults to a client built from
   * `GITHUB_TOKEN` (ADR 0009 §1).
   */
  client?: GitHubClient
  /**
   * Catalog DB to write into. Injectable for tests (in-memory DB). Defaults to
   * the package-local catalog SQLite database.
   */
  db?: CatalogDb
}

/** One key file that could not be fetched, kept so the import can still finish. */
export interface SkippedKeyFile {
  /** Repo-relative path of the file. */
  path: string
  /** Why it was selected (its key-file category). */
  category: KeyFileCategory
  /** Human-readable reason the fetch was skipped. */
  reason: string
}

/** The result of a successful import. */
export interface ImportResult {
  /** The persisted snapshot row (a fresh insert or an updated existing row). */
  snapshot: RepoSnapshot
  /** The persisted key-file rows. */
  files: RepoFile[]
  /** `true` when this import replaced an existing snapshot (re-import, US-3). */
  updated: boolean
  /**
   * `true` when GitHub truncated the recursive tree (very large repo). Key-file
   * selection then ran over a partial tree; the caller can surface this.
   */
  treeTruncated: boolean
  /**
   * Key files that were selected but could not be fetched (e.g. a 404 because
   * the file vanished between tree and contents calls). The import still
   * succeeds with the files that did fetch; these are reported, not fatal.
   */
  skipped: SkippedKeyFile[]
}

/** Resolve the catalog DB: an injected one (tests) or a lazy default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/**
 * Import a GitHub repository into a local snapshot (PRD FR-1).
 *
 * The flow fails fast and typed: a bad URL, a missing repo, an auth failure, or
 * a rate-limit hit short-circuits with the #38 client's `GitHubError`. Once the
 * metadata and tree are in hand, key-file fetches are best-effort — a single
 * file 404'ing is recorded in {@link ImportResult.skipped}, not fatal, so the
 * snapshot still captures the rest of the repository.
 *
 * Re-importing the same `owner/repo/ref` updates the existing snapshot row and
 * replaces its key files (US-3).
 */
export async function importRepository(
  options: ImportRepoOptions,
): Promise<GitHubResult<ImportResult>> {
  // 1. Resolve owner/repo — parse a string source, or accept a RepoRef.
  let repoRef: RepoRef
  if (typeof options.source === "string") {
    const parsed = parseRepoUrl(options.source)
    if (!parsed.ok) return parsed
    repoRef = parsed.data
  } else {
    repoRef = options.source
  }

  const client = options.client ?? createGitHubClient()
  const db = resolveDb(options.db)

  // 2. Fetch repository metadata. Surfaces not_found / auth_failed / rate_limited.
  const metaResult = await client.getRepoMetadata(repoRef)
  if (!metaResult.ok) return metaResult
  const metadata = metaResult.data

  // The ref the snapshot is keyed by — the requested ref, or the default branch.
  const requestedRef =
    options.ref && options.ref.trim().length > 0
      ? options.ref.trim()
      : metadata.defaultBranch

  // 3. Fetch the recursive file tree at the resolved ref.
  const treeResult = await client.getRepoTree(repoRef, requestedRef)
  if (!treeResult.ok) return treeResult
  const tree = treeResult.data

  // 4. Select key files and fetch ONLY their contents (rate/size-aware).
  const keyFiles = selectKeyFiles(tree.entries)
  const fetchedFiles: {
    path: string
    sha: string
    size: number
    content: string
    category: KeyFileCategory
  }[] = []
  const skipped: SkippedKeyFile[] = []

  for (const { entry, category } of keyFiles) {
    const fileResult = await client.getFileContent(
      repoRef,
      entry.path,
      requestedRef,
    )
    if (!fileResult.ok) {
      // A rate-limit hit mid-import is fatal — stop cleanly and surface it
      // (ADR 0009 §2). Other per-file errors are non-fatal: record and move on.
      if (fileResult.error.kind === "rate_limited") {
        return fail(fileResult.error)
      }
      skipped.push({
        path: entry.path,
        category,
        reason: fileResult.error.message,
      })
      continue
    }
    fetchedFiles.push({
      path: fileResult.data.path,
      sha: fileResult.data.sha,
      size: fileResult.data.size,
      content: fileResult.data.content,
      category,
    })
  }

  // 5. Persist the snapshot + its key files in one transaction. Re-importing
  //    the same owner/repo/ref updates the existing row in place (US-3).
  const now = new Date()
  const result = db.transaction((tx): { snapshot: RepoSnapshot; updated: boolean } => {
    const [existing] = tx
      .select()
      .from(repoSnapshots)
      .where(
        and(
          eq(repoSnapshots.owner, repoRef.owner),
          eq(repoSnapshots.repo, repoRef.repo),
          eq(repoSnapshots.ref, requestedRef),
        ),
      )
      .limit(1)
      .all()

    const snapshotValues = {
      owner: repoRef.owner,
      repo: repoRef.repo,
      ref: requestedRef,
      commitSha: tree.commitSha,
      defaultBranch: metadata.defaultBranch,
      description: metadata.description,
      primaryLanguage: metadata.primaryLanguage,
      isPrivate: metadata.isPrivate,
      htmlUrl: metadata.htmlUrl,
      fileTree: tree.entries,
      importedAt: now,
      updatedAt: now,
    }

    let snapshotRow: RepoSnapshot
    let updated: boolean
    if (existing) {
      // Re-import: update the snapshot row and replace its key files.
      const [row] = tx
        .update(repoSnapshots)
        .set(snapshotValues)
        .where(eq(repoSnapshots.id, existing.id))
        .returning()
        .all()
      snapshotRow = row!
      updated = true
      tx.delete(repoFiles).where(eq(repoFiles.snapshotId, existing.id)).run()
    } else {
      const [row] = tx
        .insert(repoSnapshots)
        .values(snapshotValues)
        .returning()
        .all()
      snapshotRow = row!
      updated = false
    }

    if (fetchedFiles.length > 0) {
      tx.insert(repoFiles)
        .values(
          fetchedFiles.map((f) => ({
            snapshotId: snapshotRow.id,
            path: f.path,
            sha: f.sha,
            size: f.size,
            content: f.content,
            category: f.category,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .run()
    }

    return { snapshot: snapshotRow, updated }
  })

  const files = db
    .select()
    .from(repoFiles)
    .where(eq(repoFiles.snapshotId, result.snapshot.id))
    .all()

  return ok({
    snapshot: result.snapshot,
    files,
    updated: result.updated,
    treeTruncated: tree.truncated,
    skipped,
  })
}
