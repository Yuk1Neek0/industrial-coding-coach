"use server"

// Server Actions for the Challenge Detail Page (`/repos/[owner]/[repo]/
// challenges/[challengeId]`, task #148). Two write paths:
//
//   - `submitAttemptAction` — persists a new attempt via the M9 DAL (#140),
//     runs the bounded grading SDK call (#143), and returns the graded
//     attempt. The integrity check (#141) is enforced inside `gradeChallenge`;
//     a rejection is surfaced as an explicit `integrity-failure` error here —
//     never silently rendered (task #148 acceptance criterion).
//
//   - `regenerateChallengeAction` — re-invokes the generation call (#142)
//     with `forceRegenerate: true`, the R2 / FR-1 "new challenge" UI action.
//     Returns the new challenge's id so the Detail Page can route to its
//     freshly generated sibling.
//
// The Anthropic SDK is reached only inside the orchestration wrappers in
// `lib/challenges.ts` — never from a Client Component. CI runs with no
// `ANTHROPIC_API_KEY`; both actions are user-triggered, so no live call
// happens at page-load or build time.

import {
  type ChallengeAttemptSnippet,
  type ChallengeType,
  type GenerateChallengeActionResult,
  generateChallengeForType,
  type SubmitAttemptActionResult,
  submitChallengeAttempt,
} from "@/lib/challenges"

/**
 * Persist a new attempt and grade it. Returns the updated attempt view with
 * the grading filled in, or a typed in-page error so the Debug Walkthrough
 * can offer a calm "try again" without losing the user's typed explanation.
 */
export async function submitAttemptAction(input: {
  challengeId: number
  explanation: string
  filePaths: string[]
  snippets: ChallengeAttemptSnippet[]
}): Promise<SubmitAttemptActionResult> {
  return submitChallengeAttempt(input.challengeId, {
    explanation: input.explanation,
    filePaths: input.filePaths,
    snippets: input.snippets,
  })
}

/**
 * Re-invoke the generation call for the same snapshot + challenge type
 * (R2 / FR-1 "new challenge"). On success the caller routes to the new
 * challenge's Detail Page; on failure it shows an inline error.
 */
export async function regenerateChallengeAction(input: {
  owner: string
  repo: string
  type: ChallengeType
}): Promise<GenerateChallengeActionResult> {
  return generateChallengeForType(input.owner, input.repo, input.type, {
    forceRegenerate: true,
  })
}
