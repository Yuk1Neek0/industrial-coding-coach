// CCPM issue/PR linking at import (Issue #201, M12 epic, ADR 0009).
//
// For each CCPM task in an imported snapshot that carries a `github:` issue
// reference, resolve the issue's state and (for a closed issue) its linked PR
// using M11's read-only GitHub client (`fetchIssue`), and persist the result
// into `ccpm_issue_links`. The delivery-map view (Issue #203) then reads links
// LOCALLY and makes zero network calls (local-first).
//
// Boundary failures are non-fatal: each one is stored as a per-task,
// beginner-safe `failureReason` (never a raw HTTP code), so one unreachable
// issue does not sink the whole pass. Re-resolving replaces the snapshot's links
// wholesale (re-import safe), mirroring how `import.ts` replaces `repo_files`.
//
// This module deliberately does NOT edit `import.ts` — it is a separate pass the
// data-access layer (Issue #203) invokes after a snapshot exists, so M11's
// import stays pure and the snapshot-coverage task (#199) and this one never
// conflict.

import { eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "../client"
import {
  ccpmIssueLinks,
  type CcpmIssueLink,
  type NewCcpmIssueLink,
} from "../schema"
import {
  createGitHubClient,
  fetchIssue,
  getImportedRepo,
  listRepoFiles,
  GitHubError,
  type GitHubClient,
} from "../github"
import { parseTask } from "./parse"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/** Options for {@link resolveCcpmLinks} / {@link listCcpmLinks}. */
export interface CcpmLinkOptions {
  /** The imported ref to operate on. Omitted → the most recent snapshot. */
  ref?: string
  /**
   * GitHub client to use. Injectable so tests pass a mocked client and linking
   * never reaches the real API. Omitted → a client from `GITHUB_TOKEN`.
   */
  client?: GitHubClient
  /** Catalog DB. Injectable for tests; omitted → the package-local default. */
  db?: CatalogDb
}

/** A summary of one {@link resolveCcpmLinks} pass. */
export interface CcpmLinkResolution {
  /** Tasks carrying a `github:` issue ref (each produced a stored row). */
  scanned: number
  /** How many resolved successfully (issue state read). */
  linked: number
  /** How many failed to resolve (stored with a beginner-safe reason). */
  failed: number
}

/** Parse a trailing `/issues/<N>` number from a task's `github:` field. */
function issueNumberFromGithub(github: string | null): number | null {
  if (github === null) return null
  const match = /\/issues\/(\d+)\b/.exec(github)
  return match ? Number(match[1]) : null
}

/** Map a GitHub boundary error to beginner-safe copy (no raw HTTP codes). */
function friendlyLinkFailure(error: GitHubError): string {
  switch (error.kind) {
    case "not_found":
      return "This issue couldn't be found on GitHub — it may have been deleted, or the repository is private."
    case "auth_failed":
      return "We couldn't access this issue. A GITHUB_TOKEN is needed for private repositories."
    case "rate_limited":
      return "We hit GitHub's rate limit while checking this issue. Add a GITHUB_TOKEN and re-import to raise the limit."
    case "network_error":
      return "We couldn't reach GitHub to check this issue's status. Check your connection and re-import."
    case "invalid_url":
    case "http_error":
    default:
      return "We couldn't check this issue's status on GitHub right now."
  }
}

/**
 * Resolve and persist the issue/PR links for an imported snapshot's CCPM tasks.
 *
 * Reads every `ccpm-task` file from the snapshot, and for each task carrying a
 * `github:` issue ref, calls {@link fetchIssue} to read the issue state and its
 * linked PRs. For a CLOSED issue with a linked PR, the first linked PR is
 * recorded as the closing PR (number + deterministic URL; the title is left for
 * a later enhancement to avoid an extra fetch per task). All rows for the
 * snapshot are replaced in one transaction.
 *
 * Tasks without a `github:` ref are skipped (no row). The function itself does
 * not fail on a per-issue boundary error — that becomes a stored row with a
 * `failureReason`. Returns a small summary.
 */
export async function resolveCcpmLinks(
  owner: string,
  repo: string,
  options: CcpmLinkOptions = {},
): Promise<CcpmLinkResolution> {
  const db = resolveDb(options.db)
  const snapshot = await getImportedRepo(owner, repo, options.ref, db)
  if (snapshot === null) return { scanned: 0, linked: 0, failed: 0 }

  const files = await listRepoFiles(owner, repo, options.ref, db)
  const client = options.client ?? createGitHubClient()
  const repoRef = { owner, repo }

  const rows: NewCcpmIssueLink[] = []
  let linked = 0
  let failed = 0

  for (const file of files) {
    if (file.category !== "ccpm-task") continue
    const task = parseTask(file.content, file.path)
    const issueNumber = issueNumberFromGithub(task.frontmatter.github)
    if (issueNumber === null) continue // unsynced task — nothing to link

    const result = await fetchIssue(client, repoRef, issueNumber)
    if (!result.ok) {
      failed += 1
      rows.push({
        snapshotId: snapshot.id,
        taskRef: task.taskRef,
        issueNumber,
        issueState: null,
        failureReason: friendlyLinkFailure(result.error),
      })
      continue
    }

    linked += 1
    const issue = result.data
    const closingPrNumber =
      issue.state === "closed" && issue.linkedPrs.length > 0
        ? issue.linkedPrs[0]!
        : null
    rows.push({
      snapshotId: snapshot.id,
      taskRef: task.taskRef,
      issueNumber,
      issueState: issue.state,
      closingPrNumber,
      closingPrUrl:
        closingPrNumber !== null
          ? `https://github.com/${owner}/${repo}/pull/${closingPrNumber}`
          : null,
      closingPrTitle: null,
      failureReason: null,
    })
  }

  // Replace this snapshot's links wholesale (re-import safe), in one transaction.
  db.transaction((tx) => {
    tx.delete(ccpmIssueLinks)
      .where(eq(ccpmIssueLinks.snapshotId, snapshot.id))
      .run()
    if (rows.length > 0) tx.insert(ccpmIssueLinks).values(rows).run()
  })

  return { scanned: rows.length, linked, failed }
}

/**
 * Read the persisted issue/PR links for an imported snapshot — the local,
 * offline read the data-access layer (Issue #203) joins onto the graph's task
 * nodes by `taskRef`. Returns an empty array for a clean miss (no snapshot or
 * no links). No network access (ADR 0009).
 */
export async function listCcpmLinks(
  owner: string,
  repo: string,
  options: Pick<CcpmLinkOptions, "ref" | "db"> = {},
): Promise<CcpmIssueLink[]> {
  const db = resolveDb(options.db)
  const snapshot = await getImportedRepo(owner, repo, options.ref, db)
  if (snapshot === null) return []
  return db
    .select()
    .from(ccpmIssueLinks)
    .where(eq(ccpmIssueLinks.snapshotId, snapshot.id))
    .all()
}
