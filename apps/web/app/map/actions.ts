"use server"

// Server Action for the Project Map page (task #108, page spec §5).
//
// The interactive trigger flow is a Client Component; it calls this action to
// run the M6 LangGraph mapping pipeline server-side. The action is a thin
// wrapper over `runMap` in `lib/project-mapper.ts`, which owns the pipeline
// run (#105), persistence + integrity check (#106), and result mapping. The
// Anthropic SDK / LangChain model is reached only there — never from a Client
// Component.

import { runMap, type ProjectMapActionResult } from "@/lib/project-mapper"

/**
 * Run (or re-run) the project logic map for an imported repository and return
 * a renderable, serializable result. Expected failures are returned, not
 * thrown, so the page renders an in-page error state.
 */
export async function generateProjectMapAction(input: {
  owner: string
  repo: string
}): Promise<ProjectMapActionResult> {
  return runMap(input.owner, input.repo)
}
