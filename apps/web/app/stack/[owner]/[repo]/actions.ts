"use server"

// Server Action for the Stack Explanation page (task #89, page spec §5).
//
// The interactive flow is a Client Component; it calls this action to run the
// bounded explanation call server-side. The action is a thin wrapper over
// `runExplain` in `lib/stack-explainer.ts`, which owns the M5 backend call,
// persistence, and result mapping. The Anthropic SDK is reached only here —
// never from a Client Component.

import {
  runExplain,
  type StackExplanationActionResult,
} from "@/lib/stack-explainer"

/**
 * Run (or re-run) the stack explanation for an imported repository and return
 * a renderable, serializable result.
 */
export async function explainStackAction(input: {
  owner: string
  repo: string
}): Promise<StackExplanationActionResult> {
  return runExplain(input.owner, input.repo)
}
