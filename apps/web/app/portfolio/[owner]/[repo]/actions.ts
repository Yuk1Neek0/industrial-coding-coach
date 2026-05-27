"use server"

// Server Actions for the M10 Portfolio Page (`/portfolio/[owner]/[repo]`,
// task #184).
//
// The page exposes ONE Server Action — `regenerateMemoryAction` — which runs
// the deterministic composers + the two bounded SDK calls and upserts the
// `learning_memories` row. The two export paths (markdown ZIP + PDF) are
// served by Route Handlers under `./api/export-markdown/route.ts` and
// `./api/export-pdf/route.ts` because Next.js Server Actions cannot
// natively return a streamed binary download with the right
// `Content-Disposition` header (see the integration notes for the
// decision record).
//
// The Anthropic SDK is reached only inside `regenerateMemory` (in
// `lib/portfolio.ts`) — never from a Client Component. CI / `pnpm build`
// run with no `ANTHROPIC_API_KEY`; the action guards the key and returns a
// typed `missing-api-key` failure before issuing any SDK call.

import { revalidatePath } from "next/cache"

import {
  regenerateMemory,
  type RegenerateMemoryResult,
} from "@/lib/portfolio"

/**
 * Regenerate the cached learning memory for a snapshot. On success,
 * `revalidatePath` invalidates the Portfolio Page so the next render reads
 * the new row. On failure, returns a structured error the calling Client
 * Component renders inline (Page Spec §8 / §11).
 *
 * The action takes the snapshot id directly — the page derived it from the
 * snapshot DAL at server-render time and threaded it through to the button
 * island.
 */
export async function regenerateMemoryAction(input: {
  snapshotId: number
  /** Optional — when present, used for `revalidatePath`. */
  owner?: string
  repo?: string
}): Promise<RegenerateMemoryResult> {
  const result = await regenerateMemory(input.snapshotId)
  if (result.ok && input.owner && input.repo) {
    revalidatePath(`/portfolio/${input.owner}/${input.repo}`)
  }
  return result
}
