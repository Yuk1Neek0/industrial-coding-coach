"use server"

// Server Actions for the PR picker page (`/reviews/[owner]/[repo]`, task #116;
// the pull-request listing was added by task #259).
//
// The picker is a Client Component; it calls these actions to list the repo's
// open pull requests, fetch a PR's change model from GitHub, run the bounded
// review call, and persist the review server-side. The Anthropic SDK and the
// GitHub client are reached only here — never from a Client Component.

import { createReviewForPr, type CreateReviewActionResult } from "@/lib/diff-review"
import { createGitHubClient, type GitHubErrorKind } from "@workspace/db"

export type { GitHubErrorKind }

/** One pull request as the picker's selectable list renders it. */
export interface PickerPullRequest {
  number: number
  title: string
  /** `open` | `closed` as reported by GitHub. */
  state: string
  /** ISO 8601 timestamp of the pull request's last update. */
  updatedAt: string
}

/** The discriminated result the "list pull requests" Server Action returns. */
export type ListPullRequestsActionResult =
  | { ok: true; pullRequests: PickerPullRequest[]; truncated: boolean }
  | { ok: false; error: { kind: GitHubErrorKind; message: string } }

/**
 * Cap on the pull requests the picker lists. Keeps the listing to a single
 * GitHub request (the list page size is 100), so the picker cannot burn an
 * unauthenticated user's rate limit (ADR 0009 §2); `truncated` flags the cut.
 */
const MAX_PICKER_PULL_REQUESTS = 50

/**
 * Create (or refresh) a diff review for an imported repository's pull request
 * and return the new review's id, or a typed in-page error.
 */
export async function createReviewAction(input: {
  owner: string
  repo: string
  prNumber: number
}): Promise<CreateReviewActionResult> {
  return createReviewForPr(input.owner, input.repo, input.prNumber)
}

/**
 * List a repository's open pull requests for the picker, or return the typed
 * error the picker degrades on (offline, rate-limited, not found, ...).
 *
 * Same client wiring as the review path: `createGitHubClient()` reads the
 * optional `GITHUB_TOKEN` server-side; with no token, public repos work at
 * GitHub's unauthenticated rate limit. Expected failures come back as
 * `{ ok: false }` — never thrown — so the picker keeps the number-entry form
 * fully usable as the fallback.
 */
export async function listOpenPullRequestsAction(input: {
  owner: string
  repo: string
}): Promise<ListPullRequestsActionResult> {
  try {
    const client = createGitHubClient()
    const result = await client.listPullRequests(
      { owner: input.owner, repo: input.repo },
      { state: "open", maxPullRequests: MAX_PICKER_PULL_REQUESTS },
    )
    if (!result.ok) {
      return {
        ok: false,
        error: { kind: result.error.kind, message: result.error.message },
      }
    }
    return {
      ok: true,
      pullRequests: result.data.pullRequests.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        updatedAt: pr.updatedAt,
      })),
      truncated: result.data.truncated,
    }
  } catch (error) {
    // The client never throws for expected boundary errors; this is the same
    // belt-and-braces guard the review path keeps around it.
    return {
      ok: false,
      error: {
        kind: "network_error",
        message:
          error instanceof Error
            ? error.message
            : "Could not reach GitHub to list pull requests.",
      },
    }
  }
}
