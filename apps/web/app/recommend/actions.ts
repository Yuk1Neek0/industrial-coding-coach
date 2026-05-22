"use server"

// Server Actions for the M4 Recommendation Engine (page specs §5).
//
// The interactive intake form and result view are Client Components; they call
// these actions to run the engine server-side. Each action is a thin wrapper
// over `lib/recommendations.ts`, which owns the data access and orchestration.

import { revalidatePath } from "next/cache"

import {
  createRecommendationFromIntake,
  editRecommendation,
  generateNarrativeForRecommendation,
  type RecommendationEdit,
  type RecommendationIntake,
} from "@/lib/recommendations"

/**
 * Score a user's intake, generate its coaching narrative, and persist it.
 * Returns the new recommendation's id, or a renderable error message. The
 * client navigates to `/recommend/[id]` on success.
 */
export async function createRecommendationAction(
  intake: RecommendationIntake,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  try {
    const id = await createRecommendationFromIntake(intake)
    return { ok: true, id }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred building the recommendation.",
    }
  }
}

/** Apply a human edit to a stored recommendation (FR-7) and refresh its page. */
export async function updateRecommendationAction(
  id: number,
  edit: RecommendationEdit,
): Promise<{ ok: boolean }> {
  const updated = await editRecommendation(id, edit)
  if (updated) revalidatePath(`/recommend/${id}`)
  return { ok: updated !== null }
}

/** Generate (or regenerate) the coaching narrative and refresh the page. */
export async function generateNarrativeAction(
  id: number,
): Promise<{ ok: boolean }> {
  const result = await generateNarrativeForRecommendation(id)
  revalidatePath(`/recommend/${id}`)
  return result
}
