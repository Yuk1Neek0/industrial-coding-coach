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
