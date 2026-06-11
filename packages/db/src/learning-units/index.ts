// Public surface of the M7 Issue-Based Learning Workspace `learning_units`
// data-access layer (issue-based-learning-workspace epic, Issue #135).
//
// - `units`     — the typed `learning_units` data-access layer: create / read /
//                 update a unit plus dedicated mutators for the user's
//                 answers, score + weak-area breakdown, and checklist state
//                 (R2 / R4 / R6, FR-8, FR-9).
// - `integrity` — the reusable file-reference integrity check
//                 (`verifyLearningUnitIntegrity`) the M7 generation call
//                 (#133) and the integration layer (#138) both call (FR-4),
//                 plus a DB-backed convenience wrapper.
// - `generate`  — the bounded Anthropic SDK call that produces the typed
//                 six-part learning unit (FR-2 / FR-3 / FR-4, #133).
// - `grade`     — the bounded Anthropic SDK call that grades the user's
//                 answers into an `UnderstandingScore` and a
//                 `LearningWeakArea` breakdown (FR-5, #134).

export {
  createLearningUnit,
  getLearningUnit,
  getLearningUnitById,
  getLearningUnitByRepo,
  listLearningUnits,
  recordAnswers,
  recordScore,
  updateChecklistState,
  updateLearningUnit,
  type LearningUnitContent,
  type LearningUnitIdentity,
  type NewLearningUnitInput,
} from "./units"

export {
  checkLearningUnitIntegrity,
  verifyLearningUnitIntegrity,
  type LearningUnitIntegrityResult,
  type LearningUnitSnapshotFiles,
  type UnresolvedRef,
  type UnresolvedRefKind,
  type VerifiableLearningUnit,
} from "./integrity"

export {
  generateLearningUnit,
  GenerateLearningUnitError,
  IntegrityError,
  parseUnitContent,
  type GenerateLearningUnitData,
  type GenerateLearningUnitErrorKind,
  type GenerateLearningUnitInput,
  type GenerateLearningUnitResult,
} from "./generate"

export {
  gradeLearningUnit,
  GradeLearningUnitError,
  parseGradingContent,
  type GradeLearningUnitData,
  type GradeLearningUnitErrorKind,
  type GradeLearningUnitInput,
  type GradeLearningUnitResult,
} from "./grade"

// Re-export the typed question / answer / score / weak-area shapes from the
// schema so callers can import the M7 grading contract from a stable barrel.
// `questions[]` is the input contract for grading (per the acceptance
// criteria); `UnderstandingScore` + `LearningWeakArea[]` is the output shape
// (matches M8's `WeakArea` shape for the shared Score / Weak Area UI).
export type {
  LearningWeakArea,
  UnderstandingAnswer,
  UnderstandingQuestion,
  UnderstandingScore,
} from "../schema"
