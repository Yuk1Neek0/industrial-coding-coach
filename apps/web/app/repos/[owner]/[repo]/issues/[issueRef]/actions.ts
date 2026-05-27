"use server"

// Server Actions for the Issue Learning Workspace page
// (`/repos/[owner]/[repo]/issues/[issueRef]`, task #138).
//
// Three actions cover the page's interactive surfaces:
//   - `ensureLearningUnitAction` — first-visit generation (run + persist).
//   - `gradeLearningUnitAction`  — the answer-and-score loop (R6, FR-5).
//   - `toggleChecklistItemAction` — checklist tick state (FR-6, R4 — never
//     gates the score).
//
// The Anthropic SDK and the GitHub client are reached only here — never from
// a Client Component. Each action returns a discriminated result so the page
// can render an in-page error state without losing user input.

import {
  type ChecklistToggleResult,
  ensureLearningUnit,
  type EnsureUnitActionResult,
  gradeLearningUnitAnswers,
  type GradeUnitActionResult,
  toggleChecklistItem,
} from "@/lib/learning-units"
import type { UnderstandingAnswer } from "@workspace/db/learning-units"

/**
 * On first visit, generate the learning unit for `(owner, repo, issueRef)` and
 * persist the typed seven-part output. Idempotent: a stored unit short-circuits
 * the generation call.
 */
export async function ensureLearningUnitAction(input: {
  owner: string
  repo: string
  issueRef: string
}): Promise<EnsureUnitActionResult> {
  return ensureLearningUnit(input.owner, input.repo, input.issueRef)
}

/**
 * Run the bounded grading call on the user's answers, persist the score +
 * weak-area breakdown, and return the updated unit view.
 *
 * R6 — scoring is strictly per-unit; this action persists nothing aggregated.
 * R4 — this action never reads the checklist state.
 */
export async function gradeLearningUnitAction(input: {
  unitId: number
  answers: UnderstandingAnswer[]
}): Promise<GradeUnitActionResult> {
  return gradeLearningUnitAnswers(input.unitId, input.answers)
}

/**
 * Toggle one checklist item's checked state for a learning unit (FR-6, R4).
 * Display-only progress; never gates the score.
 */
export async function toggleChecklistItemAction(input: {
  unitId: number
  itemId: string
  checked: boolean
}): Promise<ChecklistToggleResult> {
  return toggleChecklistItem(input.unitId, input.itemId, input.checked)
}
