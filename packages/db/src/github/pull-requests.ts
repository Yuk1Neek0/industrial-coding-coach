// Pull-request change model for the M11 Diff Review (Issue #111, ADR 0009).
//
// This module turns a GitHub pull request into a typed CHANGE MODEL — the
// input contract the downstream review call (Issue #112) reasons over. It is
// built ENTIRELY on the existing read-only GitHub client (`createGitHubClient`,
// ADR 0009 §1): there is no second GitHub access path and no new auth here.
//
// What the change model carries:
//   - PR metadata (title, body, head/base refs).
//   - The changed-file list, each with its status and add/delete counts.
//   - Parsed unified-diff HUNKS per file — the structured edits the review
//     call inspects, rather than a raw patch blob.
//   - The linked issue where one exists, with its acceptance criteria
//     extracted from the issue body.
//
// Graceful boundaries (Issue #111 acceptance criteria):
//   - A VERY LARGE PR is bounded: file fetching is capped (the client caps
//     pages) and the model is flagged `truncated`; per-file patches past a
//     byte ceiling are not parsed into hunks (`patchOmitted: true`).
//   - A PR with NO LINKED ISSUE yields `linkedIssue: null` — never an error.

import type { GitHubClient, RepoRef } from "./client"
import { DEFAULT_MAX_PR_FILES } from "./client"
import { ok, type GitHubResult } from "./errors"

/** The kind of change GitHub reports for a file in a pull request. */
export type FileChangeStatus =
  | "added"
  | "removed"
  | "modified"
  | "renamed"
  | "copied"
  | "changed"
  | "unchanged"

/**
 * One contiguous block of changes within a file's unified diff — a `@@ ... @@`
 * hunk. The review call (Issue #112) reasons over hunks, not the raw patch.
 */
export interface DiffHunk {
  /** 1-based start line of the hunk in the OLD (base) file. */
  oldStart: number
  /** Line count the hunk spans in the OLD file. */
  oldLines: number
  /** 1-based start line of the hunk in the NEW (head) file. */
  newStart: number
  /** Line count the hunk spans in the NEW file. */
  newLines: number
  /** The optional section heading GitHub appends after the `@@` marker. */
  header: string
  /** The hunk's body lines, each tagged by role. */
  lines: DiffLine[]
}

/** One line of a diff hunk, tagged with its role. */
export interface DiffLine {
  /** `add` (`+`), `del` (`-`), or `context` (unchanged). */
  kind: "add" | "del" | "context"
  /** The line's text content, with the leading +/-/space marker stripped. */
  content: string
}

/** A single file changed by a pull request, with its parsed hunks. */
export interface ChangedFile {
  /** Path in the head (new) tree, e.g. `apps/web/app/page.tsx`. */
  path: string
  /** Prior path when the file was renamed; `null` otherwise. */
  previousPath: string | null
  /** The kind of change GitHub reports. */
  status: FileChangeStatus
  /** Lines added in this file. */
  additions: number
  /** Lines deleted in this file. */
  deletions: number
  /** Parsed unified-diff hunks. Empty when the patch was omitted. */
  hunks: DiffHunk[]
  /**
   * `true` when no parseable patch was available — a binary file, or a file
   * GitHub omitted the patch on, or one past {@link MAX_PATCH_BYTES}. The
   * review call should treat such a file by its add/delete counts only.
   */
  patchOmitted: boolean
}

/** The acceptance criteria extracted from a linked issue's body. */
export interface AcceptanceCriterion {
  /** The criterion text (the checklist item, marker stripped). */
  text: string
  /** `true` when the source checklist item was already ticked (`[x]`). */
  checked: boolean
}

/** The issue a pull request links to, with its acceptance criteria. */
export interface LinkedIssue {
  /** The issue number. */
  number: number
  /** The issue title. */
  title: string
  /** The issue body, or `null` when empty. */
  body: string | null
  /** Canonical HTML URL of the issue. */
  htmlUrl: string
  /**
   * Acceptance criteria parsed from the issue body — the markdown checklist
   * items under an "Acceptance Criteria" heading, or every checklist item when
   * no such heading exists. Empty when the issue has none.
   */
  acceptanceCriteria: AcceptanceCriterion[]
}

/**
 * The full change model for one pull request — the input contract the M11
 * review call (Issue #112) reasons over.
 */
export interface PullRequestChangeModel {
  /** `owner` / `repo` the PR belongs to. */
  repo: RepoRef
  /** The pull request number. */
  number: number
  /** The PR title. */
  title: string
  /** The PR description body, or `null` when empty. */
  body: string | null
  /** Canonical HTML URL of the pull request. */
  htmlUrl: string
  /** The head (source) branch ref and commit SHA. */
  head: { ref: string; sha: string }
  /** The base (target) branch ref and commit SHA. */
  base: { ref: string; sha: string }
  /** Total additions across the PR, as summed by GitHub. */
  additions: number
  /** Total deletions across the PR, as summed by GitHub. */
  deletions: number
  /** Number of files GitHub reports the PR changes (may exceed `files`). */
  changedFileCount: number
  /** The changed files in the model, each with parsed hunks. */
  files: ChangedFile[]
  /**
   * `true` when the PR was too large to model fully — the file list was capped
   * at {@link PullRequestModelOptions.maxFiles}. `files` then holds a prefix of
   * the PR's changes and the review call should note the partial coverage.
   */
  truncated: boolean
  /** The linked issue with its acceptance criteria, or `null` when none. */
  linkedIssue: LinkedIssue | null
}

/** Options for {@link buildPullRequestChangeModel}. */
export interface PullRequestModelOptions {
  /**
   * Hard cap on the number of changed files pulled into the model. Bounds a
   * very large PR (ADR 0009 §2). Defaults to {@link DEFAULT_MAX_PR_FILES}.
   */
  maxFiles?: number
}

/**
 * Byte ceiling above which a single file's patch is NOT parsed into hunks. A
 * pathological file (a regenerated lockfile, a vendored bundle) can carry a
 * megabyte-scale patch; parsing it would bloat the model the review call sees.
 * Such a file is kept with its add/delete counts and `patchOmitted: true`.
 */
export const MAX_PATCH_BYTES = 128 * 1024

/** GitHub's file `status` strings, narrowed to {@link FileChangeStatus}. */
const KNOWN_STATUSES: ReadonlySet<string> = new Set<FileChangeStatus>([
  "added",
  "removed",
  "modified",
  "renamed",
  "copied",
  "changed",
  "unchanged",
])

/** Narrow a GitHub `status` string, defaulting unknown values to `modified`. */
function normalizeStatus(status: string): FileChangeStatus {
  return KNOWN_STATUSES.has(status)
    ? (status as FileChangeStatus)
    : "modified"
}

/** The `@@ -oldStart,oldLines +newStart,newLines @@ header` hunk-line shape. */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

/**
 * Parse a file's unified-diff `patch` text into structured {@link DiffHunk}s.
 *
 * The `patch` GitHub returns for a file is the body of a unified diff WITHOUT
 * the `diff --git` / `---` / `+++` file headers — it starts at the first
 * `@@` hunk marker. Returns an empty array for an empty/whitespace patch.
 *
 * Exported so it can be unit-tested directly.
 */
export function parseUnifiedDiff(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null

  for (const rawLine of patch.split("\n")) {
    const headerMatch = HUNK_HEADER.exec(rawLine)
    if (headerMatch) {
      current = {
        oldStart: Number(headerMatch[1]),
        oldLines: headerMatch[2] === undefined ? 1 : Number(headerMatch[2]),
        newStart: Number(headerMatch[3]),
        newLines: headerMatch[4] === undefined ? 1 : Number(headerMatch[4]),
        header: (headerMatch[5] ?? "").trim(),
        lines: [],
      }
      hunks.push(current)
      continue
    }
    if (current === null) continue // pre-hunk noise — ignore.

    // `\ No newline at end of file` is metadata, not a content line.
    if (rawLine.startsWith("\\")) continue

    const marker = rawLine[0]
    if (marker === "+") {
      current.lines.push({ kind: "add", content: rawLine.slice(1) })
    } else if (marker === "-") {
      current.lines.push({ kind: "del", content: rawLine.slice(1) })
    } else {
      // A leading space is context; a bare empty string is an empty context
      // line. Either way it is unchanged context.
      current.lines.push({
        kind: "context",
        content: rawLine.startsWith(" ") ? rawLine.slice(1) : rawLine,
      })
    }
  }

  return hunks
}

/** A markdown checklist item: `- [ ] text` / `* [x] text` (any indent). */
const CHECKLIST_ITEM = /^\s*[-*+]\s+\[([ xX])\]\s+(.*\S)\s*$/
/** A markdown heading line: `## Acceptance Criteria`. */
const HEADING = /^#{1,6}\s+(.*\S)\s*$/
/** Headings that introduce an acceptance-criteria checklist. */
const ACCEPTANCE_HEADING = /acceptance criteria|definition of done/i

/**
 * Extract acceptance criteria from an issue body.
 *
 * Prefers the checklist under an "Acceptance Criteria" (or "Definition of
 * Done") heading; when the body has no such heading, falls back to EVERY
 * markdown checklist item. Returns an empty array when the body has neither.
 *
 * Exported so it can be unit-tested directly.
 */
export function extractAcceptanceCriteria(
  body: string | null | undefined,
): AcceptanceCriterion[] {
  if (!body) return []
  const lines = body.split("\n")

  // First pass: collect items that sit under an acceptance-criteria heading.
  const underHeading: AcceptanceCriterion[] = []
  let inSection = false
  for (const line of lines) {
    const heading = HEADING.exec(line)
    if (heading) {
      inSection = ACCEPTANCE_HEADING.test(heading[1] ?? "")
      continue
    }
    if (!inSection) continue
    const item = CHECKLIST_ITEM.exec(line)
    if (item) {
      underHeading.push({
        text: item[2]!.trim(),
        checked: item[1]!.toLowerCase() === "x",
      })
    }
  }
  if (underHeading.length > 0) return underHeading

  // Fallback: no acceptance-criteria heading — take every checklist item.
  const all: AcceptanceCriterion[] = []
  for (const line of lines) {
    const item = CHECKLIST_ITEM.exec(line)
    if (item) {
      all.push({
        text: item[2]!.trim(),
        checked: item[1]!.toLowerCase() === "x",
      })
    }
  }
  return all
}

/**
 * Build the typed {@link PullRequestChangeModel} for a pull request.
 *
 * Reuses the existing read-only GitHub client (ADR 0009) — pass a client made
 * with {@link createGitHubClient}. Fetches the PR, its changed files (capped
 * for a very large PR), and the linked issue where one exists, then parses the
 * per-file patches into hunks and the linked issue's acceptance criteria.
 *
 * Returns a typed {@link GitHubResult}: any boundary failure (not found, auth,
 * rate limit, network) surfaces as the same `GitHubError` the rest of the
 * client uses. A PR with no linked issue is NOT a failure — `linkedIssue` is
 * `null`.
 *
 * @param client - a client from `createGitHubClient` (the ADR 0009 path).
 * @param repo - the `owner`/`repo` the PR belongs to.
 * @param prNumber - the pull request number.
 * @param options - `maxFiles` caps the modeled file count.
 */
export async function buildPullRequestChangeModel(
  client: GitHubClient,
  repo: RepoRef,
  prNumber: number,
  options: PullRequestModelOptions = {},
): Promise<GitHubResult<PullRequestChangeModel>> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_PR_FILES

  // 1. PR metadata.
  const prResult = await client.getPullRequest(repo, prNumber)
  if (!prResult.ok) return prResult
  const pr = prResult.data

  // 2. Changed files — capped, so a very large PR stays bounded.
  const filesResult = await client.getPullRequestFiles(
    repo,
    prNumber,
    maxFiles,
  )
  if (!filesResult.ok) return filesResult

  const files: ChangedFile[] = filesResult.data.files.map((file) => {
    const patch = file.patch
    // Omit the patch for binary files, GitHub-omitted patches, and patches
    // past the byte ceiling — the model keeps the counts but not the hunks.
    const patchOmitted =
      patch === undefined ||
      patch.length === 0 ||
      Buffer.byteLength(patch, "utf-8") > MAX_PATCH_BYTES
    return {
      path: file.filename,
      previousPath: file.previous_filename ?? null,
      status: normalizeStatus(file.status),
      additions: file.additions,
      deletions: file.deletions,
      hunks: patchOmitted ? [] : parseUnifiedDiff(patch!),
      patchOmitted,
    }
  })

  // 3. Linked issue — `null` when the PR links none (a valid state).
  let linkedIssue: LinkedIssue | null = null
  const linkResult = await client.getLinkedIssueNumber(
    repo,
    prNumber,
    pr.body,
  )
  if (!linkResult.ok) return linkResult
  if (linkResult.data !== null) {
    const issueResult = await client.getIssue(repo, linkResult.data)
    if (!issueResult.ok) {
      // A link that points at a missing issue should not sink the whole
      // model — degrade gracefully to "no linked issue" instead.
      if (issueResult.error.kind !== "not_found") return issueResult
    } else {
      const issue = issueResult.data
      linkedIssue = {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        htmlUrl: issue.html_url,
        acceptanceCriteria: extractAcceptanceCriteria(issue.body),
      }
    }
  }

  return ok({
    repo: { owner: repo.owner, repo: repo.repo },
    number: pr.number,
    title: pr.title,
    body: pr.body,
    htmlUrl: pr.html_url,
    head: { ref: pr.head.ref, sha: pr.head.sha },
    base: { ref: pr.base.ref, sha: pr.base.sha },
    additions: pr.additions,
    deletions: pr.deletions,
    changedFileCount: pr.changed_files,
    files,
    truncated: filesResult.data.truncated,
    linkedIssue,
  })
}
