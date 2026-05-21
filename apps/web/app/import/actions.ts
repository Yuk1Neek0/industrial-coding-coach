"use server"

// Server Action for the GitHub Repository Import page (task #42, page spec §5).
//
// The interactive flow is a Client Component; it calls this action to run the
// import server-side. The action is a thin wrapper over `runImport` in
// `lib/github-import.ts`, which owns the data-access call and result mapping.

import { runImport } from "@/lib/github-import"
import type { ImportActionResult, ImportInput } from "@/lib/github-import"

/**
 * Import a GitHub repository and return a renderable, serializable result.
 *
 * `input.owner` / `input.repo` are already parsed from the URL client-side
 * (page spec §7); an unparseable URL never reaches this action.
 */
export async function importRepoAction(
  input: ImportInput,
): Promise<ImportActionResult> {
  return runImport(input)
}
