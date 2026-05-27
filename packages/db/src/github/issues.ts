// Issue-fetch surface for the M7 issue-based learning workspace
// (Issue #132, ADR 0009, PRD FR-1, R1).
//
// Mirrors the M8 PR-fetch extension to the M11 GitHub client (see
// `pull-requests.ts`): the typed `IssueModel` is the domain-level shape the
// learning-unit generation call (Issue #133) reasons over, built ENTIRELY on
// the read-only `GitHubClient` (ADR 0009 §1). There is no second GitHub access
// path here — no new auth code, no separate `fetch` wrapper, no second token.
//
// What this module ships:
//   - `fetchIssue` — typed issue with number, title, body, labels, state,
//     and linked PR numbers (where the timeline carries them).
//   - `listIssues` — paginated list of typed issues for a repo, with the
//     `pull_request` entries filtered out (GitHub's `/issues` feed mixes the
//     two; only true issues belong in the learning workspace, FR-1).
//   - `LearningUnitInput` — the normalized R1 input shape; both GitHub-issue
//     and CCPM-task surfaces fold into it. The learning unit and the
//     generation call do not differentiate by `source`.
//   - `normalizeIssueToLearningUnitInput` — converts an `IssueModel` to the
//     normalized shape.
//
// Read-only: the module issues only GET requests (via the client). It does
// not create issues, comment, edit, or close anything (ADR 0009).

import type {
  GitHubClient,
  IssueLabelApiResponse,
  RepoRef,
} from "./client"
import { GitHubError, fail, ok, type GitHubResult } from "./errors"

/** The state GitHub reports an issue in, narrowed to the two product states. */
export type IssueState = "open" | "closed"

/**
 * A normalized GitHub issue — the domain-level shape the learning-unit
 * generation call reads. Built from {@link IssueApiResponse} so the M8
 * PR-fetch surface is left intact.
 */
export interface IssueModel {
  /** `owner` / `repo` the issue belongs to. */
  repo: RepoRef
  /** The issue number. */
  number: number
  /** The issue title. */
  title: string
  /** The issue body, or `null` when empty. */
  body: string | null
  /** Label names attached to the issue (deduplicated, empty for none). */
  labels: string[]
  /** Open vs closed; unrecognized values from GitHub fall back to `open`. */
  state: IssueState
  /** Canonical HTML URL of the issue. */
  htmlUrl: string
  /**
   * Pull-request numbers linked to this issue, where the timeline reports any.
   * Empty when the issue has no linked PRs (a valid, gracefully handled state).
   */
  linkedPrs: number[]
}

/** The input contract for the M7 learning-unit generation call (R1). */
export interface LearningUnitInput {
  /** Which surface this input came from (metadata only — R1). */
  source: "github-issue" | "ccpm-task"
  /**
   * Stable reference string for the input. `#42` for a GitHub issue;
   * `epic/<name>/<task>` or similar for a CCPM task. The schema stores this
   * verbatim as `learning_units.issue_ref` (R1).
   */
  issueRef: string
  /** The issue/task title. */
  title: string
  /** The issue/task body — empty string when none. */
  body: string
  /** Labels (GitHub) or status-like markers (CCPM). Empty when none. */
  labels: string[]
  /** Open vs closed — defaults to `open` for an in-flight CCPM task. */
  state: IssueState
  /** Linked PR numbers (GitHub only — always empty for a CCPM task). */
  linkedPrs: number[]
}

/** Narrow a GitHub `state` string to {@link IssueState}; default to `open`. */
function normalizeState(state: string): IssueState {
  return state === "closed" ? "closed" : "open"
}

/**
 * Extract distinct label names from GitHub's labels payload. GitHub returns
 * either `{ name, color, ... }` objects (the modern shape) or bare strings
 * (older clients); the M7 surface only consumes the names.
 */
function extractLabelNames(
  labels: (IssueLabelApiResponse | string)[] | undefined,
): string[] {
  if (!labels) return []
  const names = new Set<string>()
  for (const label of labels) {
    if (typeof label === "string") {
      if (label.length > 0) names.add(label)
    } else if (label && typeof label.name === "string" && label.name.length > 0) {
      names.add(label.name)
    }
  }
  return [...names]
}

/**
 * Walk an issue's timeline for `cross-referenced` / `connected` events whose
 * source IS a pull request — those are the PRs linked to the issue. This is
 * the dual of `GitHubClient.getLinkedIssueNumber` (PR → issue).
 *
 * A `not_found` timeline (the issue has no events to read) gracefully yields
 * an empty list — never a failure. Any other error surfaces.
 */
async function fetchLinkedPrNumbers(
  client: GitHubClient,
  repo: RepoRef,
  issueNumber: number,
): Promise<GitHubResult<number[]>> {
  const events = await client.getIssueTimeline(repo, issueNumber)
  if (!events.ok) {
    if (events.error.kind === "not_found") return ok([])
    return events
  }

  const numbers = new Set<number>()
  for (const event of events.data) {
    if (event.event !== "cross-referenced" && event.event !== "connected") {
      continue
    }
    const issue = event.source?.issue
    // The source is a PR exactly when its `pull_request` key is present.
    if (issue && issue.pull_request !== undefined) {
      numbers.add(issue.number)
    }
  }
  return ok([...numbers])
}

/**
 * Fetch a single GitHub issue by number, returning a typed {@link IssueModel}.
 *
 * Reuses the existing read-only client (ADR 0009 §1) — pass a client made
 * with `createGitHubClient`. Returns a typed {@link GitHubResult}: any
 * boundary failure (`not_found`, `auth_failed`, `rate_limited`, network)
 * surfaces as the same `GitHubError` the rest of the client uses. An issue
 * with no body, no labels, or no linked PR is NOT a failure — those fields
 * surface as `null` / empty array.
 *
 * If GitHub returns a row whose `pull_request` key is set, the entry is a
 * pull request, not an issue — this function rejects it as `not_found`
 * (the learning workspace operates on issues only, FR-1).
 *
 * @param client - a client from `createGitHubClient` (the ADR 0009 path).
 * @param repo - the `owner` / `repo` the issue belongs to.
 * @param issueNumber - the issue number.
 */
export async function fetchIssue(
  client: GitHubClient,
  repo: RepoRef,
  issueNumber: number,
): Promise<GitHubResult<IssueModel>> {
  const result = await client.getIssue(repo, issueNumber)
  if (!result.ok) return result

  const raw = result.data
  if (raw.pull_request !== undefined) {
    return fail(
      new GitHubError(
        "not_found",
        `#${issueNumber} on ${repo.owner}/${repo.repo} is a pull request, not an issue.`,
      ),
    )
  }

  const linkedPrsResult = await fetchLinkedPrNumbers(client, repo, issueNumber)
  if (!linkedPrsResult.ok) return linkedPrsResult

  return ok({
    repo: { owner: repo.owner, repo: repo.repo },
    number: raw.number,
    title: raw.title,
    body: raw.body,
    labels: extractLabelNames(raw.labels),
    state: normalizeState(raw.state),
    htmlUrl: raw.html_url,
    linkedPrs: linkedPrsResult.data,
  })
}

/** Options for {@link listIssues}. */
export interface ListIssuesOptions {
  /**
   * Which state to list — `all`, `open`, `closed`. Defaults to `all`. Mirrors
   * GitHub's `state` query parameter.
   */
  state?: "open" | "closed" | "all"
  /**
   * Hard cap on the number of issues fetched across pages. Defaults to the
   * client's `DEFAULT_MAX_ISSUES`. Bounds a very large repo (ADR 0009 §2).
   */
  maxIssues?: number
  /**
   * When `true`, fetch each issue's linked PR list as well. Defaults to
   * `false` for the listing path — the per-repo Issues list (FR-11, R5)
   * does not need linked PRs at list time. The detail page calls
   * {@link fetchIssue} to load them.
   */
  includeLinkedPrs?: boolean
}

/** The result of {@link listIssues}: typed issues + truncation flag. */
export interface ListIssuesResult {
  /** Issues in GitHub's returned order, with PR entries filtered out. */
  issues: IssueModel[]
  /** `true` when the repo had more issues than the cap (ADR 0009 §2). */
  truncated: boolean
}

/**
 * List a repository's issues as typed {@link IssueModel}s.
 *
 * GitHub's `/issues` endpoint mixes issues AND pull requests in one paged
 * feed — pull requests carry a `pull_request` key. This function filters
 * those out so callers receive only true issues (the M7 learning workspace
 * operates on issues only, FR-1).
 *
 * Linked PR numbers are NOT fetched for each entry by default — that adds
 * an O(N) round trip and the listing screen does not need them. Pass
 * `includeLinkedPrs: true` to fetch them per issue.
 *
 * @param client - a client from `createGitHubClient` (the ADR 0009 path).
 * @param repo - the `owner` / `repo` to list.
 * @param options - listing options.
 */
export async function listIssues(
  client: GitHubClient,
  repo: RepoRef,
  options: ListIssuesOptions = {},
): Promise<GitHubResult<ListIssuesResult>> {
  const listOptions: { state?: "open" | "closed" | "all"; maxIssues?: number } =
    {}
  if (options.state !== undefined) listOptions.state = options.state
  if (options.maxIssues !== undefined) listOptions.maxIssues = options.maxIssues

  const result = await client.listIssues(repo, listOptions)
  if (!result.ok) return result

  const includeLinkedPrs = options.includeLinkedPrs ?? false
  const issues: IssueModel[] = []
  for (const raw of result.data.issues) {
    // GitHub returns PRs in this feed; only true issues are kept.
    if (raw.pull_request !== undefined) continue

    let linkedPrs: number[] = []
    if (includeLinkedPrs) {
      const linkedResult = await fetchLinkedPrNumbers(client, repo, raw.number)
      if (!linkedResult.ok) return linkedResult
      linkedPrs = linkedResult.data
    }

    issues.push({
      repo: { owner: repo.owner, repo: repo.repo },
      number: raw.number,
      title: raw.title,
      body: raw.body,
      labels: extractLabelNames(raw.labels),
      state: normalizeState(raw.state),
      htmlUrl: raw.html_url,
      linkedPrs,
    })
  }

  return ok({ issues, truncated: result.data.truncated })
}

/**
 * Normalize an {@link IssueModel} onto the {@link LearningUnitInput} shape
 * (R1, FR-1). The output is the input contract for the learning-unit
 * generation call (Issue #133); the unit and the call do not differentiate
 * GitHub issues from CCPM tasks.
 */
export function normalizeIssueToLearningUnitInput(
  issue: IssueModel,
): LearningUnitInput {
  return {
    source: "github-issue",
    issueRef: `#${issue.number}`,
    title: issue.title,
    body: issue.body ?? "",
    labels: issue.labels,
    state: issue.state,
    linkedPrs: issue.linkedPrs,
  }
}
