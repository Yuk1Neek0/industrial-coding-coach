"use server"

// Server Action for the Diff Review page (`/reviews/r/[id]`, task #116).
//
// The Understanding Check is a Client Component; on submit it calls this
// action, which runs the bounded grading call and persists the answers, score,
// and weak areas through the data-access layer. The Anthropic SDK is reached
// only here — never from a Client Component. This closes the answer-and-score
// loop server-side (ADR 0006: no API route).

import {
  type ComprehensionAnswer,
  type GradeReviewActionResult,
  gradeReviewAnswers,
} from "@/lib/diff-review"

/**
 * Grade a user's answers to a stored review's comprehension questions and
 * return the updated, graded review — or a typed in-page error so the
 * Understanding Check can offer a calm "try again" without losing the answers.
 */
export async function gradeReviewAction(input: {
  reviewId: number
  answers: ComprehensionAnswer[]
}): Promise<GradeReviewActionResult> {
  return gradeReviewAnswers(input.reviewId, input.answers)
}
