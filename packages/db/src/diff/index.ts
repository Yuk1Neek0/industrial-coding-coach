// Public surface of the M8 Diff Review Coach backend (diff-review epic).
//
// - `reviews` — the `diff_reviews` data-access layer + file-reference
//               integrity check (#114).

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
