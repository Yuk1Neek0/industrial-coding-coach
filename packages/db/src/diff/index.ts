// Public surface of the M8 Diff Review Coach backend (diff-review epic).
//
// - `review`  — the bounded Anthropic SDK diff-review call (#112).
// - `grade`   — the bounded Anthropic SDK understanding-check grading call (#113).
// - `reviews` — the `diff_reviews` data-access layer + file-reference
//               integrity check (#114).

export {
  parseReviewContent,
  reviewDiff,
  ReviewDiffError,
  type ReviewDiffData,
  type ReviewDiffErrorKind,
  type ReviewDiffInput,
  type ReviewDiffResult,
} from "./review"

export {
  GradeDiffError,
  gradeUnderstandingCheck,
  parseGradingContent,
  type GradeDiffData,
  type GradeDiffErrorKind,
  type GradeDiffInput,
  type GradeDiffResult,
} from "./grade"

export {
  checkDiffReviewIntegrity,
  checkReviewFileReferences,
  createDiffReview,
  getDiffReview,
  getDiffReviewById,
  getDiffReviewByRepo,
  gradeDiffReview,
  listDiffReviews,
  saveDiffReview,
  updateDiffReview,
  type ChangedFileSet,
  type DiffReviewContent,
  type DiffReviewFileReferenceCheck,
  type DiffReviewGrading,
} from "./reviews"
