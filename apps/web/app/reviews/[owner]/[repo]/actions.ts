"use server"

// Server Action for the PR picker page (`/reviews/[owner]/[repo]`, task #116).
//
// The picker is a Client Component; it calls this action to fetch the PR's
// change model from GitHub, run the bounded review call, and persist the
// review server-side. The Anthropic SDK and the GitHub client are reached only
// here — never from a Client Component.

import { createReviewForPr, type CreateReviewActionResult } from "@/lib/diff-review"

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
