"use server"

// Server Actions for the Challenge List Page (`/repos/[owner]/[repo]/
// challenges`, task #148). The list view renders read-only; the only
// mutating affordance is the inline "Generate this challenge" button on
// rows where no cached row exists yet. That button calls
// `generateForTypeAction`, which runs the bounded generation SDK call
// (#142) server-side and returns the new challenge id.
//
// The Anthropic SDK is reached only inside `generateChallengeForType` — never
// from a Client Component. CI runs with no `ANTHROPIC_API_KEY`; generation
// is user-triggered, so no live call happens at page-load or build time.

import {
  type ChallengeType,
  type GenerateChallengeActionResult,
  generateChallengeForType,
} from "@/lib/challenges"

/**
 * Run the bounded generation SDK call for a snapshot + challenge type, lazy
 * per type and cached per snapshot (R2). On success the caller routes to
 * `/repos/[owner]/[repo]/challenges/[challengeId]`; on failure the caller
 * shows an inline error.
 */
export async function generateForTypeAction(input: {
  owner: string
  repo: string
  type: ChallengeType
}): Promise<GenerateChallengeActionResult> {
  return generateChallengeForType(input.owner, input.repo, input.type)
}
