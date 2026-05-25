// Public surface of the M9 challenges data-access layer
// (debug-expansion-challenge epic).
//
// - `challenges`      — the `challenges` + `challenge_attempts` typed DAL
//                       covering create/read for challenges, create/read for
//                       attempts, and the latest-outcome accessor (R5 / FR-9).
//                       Issue #140.
// - `integrity-check` — the file-reference integrity check both #142 and #143
//                       use to reject outputs that name files outside the M6
//                       project map (R8 / FR-6). Issue #141.
// - `generation`      — the bounded Anthropic SDK call that produces a typed
//                       M9 challenge, lazy per type, cached per snapshot
//                       (R1 / R2 / R6 / R8 / FR-1 / FR-2 / FR-3 / FR-6).
//                       Issue #142.

export {
  createChallenge,
  createChallengeAttempt,
  getChallengeById,
  getChallengeByRepo,
  getChallengeBySnapshotAndType,
  getLatestChallengeAttempt,
  getLatestChallengeOutcome,
  gradeChallengeAttempt,
  listChallengeAttempts,
  listChallengesBySnapshot,
  saveChallenge,
  updateChallenge,
  type ChallengeAttemptSubmission,
  type ChallengeContent,
  type LatestChallengeOutcome,
} from "./challenges"

export {
  verifyChallengeIntegrity,
  type CandidateChallenge,
  type CandidateGrading,
  type IntegrityCandidate,
  type IntegrityCheckResult,
  type PerCriterionResult,
  type ProjectMapView,
  type UnresolvedOrigin,
  type UnresolvedRef,
  // `AcceptanceCriterion` is intentionally NOT re-exported here — the
  // `pull-requests` module also exports a type by that name with a
  // different shape (M8 PR acceptance criteria). The integrity-check shape
  // is only consumed via {@link CandidateChallenge.acceptanceCriteria};
  // callers that need the narrow shape import it directly from
  // `./integrity-check`.
} from "./integrity-check"

export {
  applicableChallengeTypes,
  ChallengeIntegrityError,
  GenerateChallengeError,
  generateChallenge,
  parseChallengeContent,
  type FailingCiRun,
  type GenerateChallengeData,
  type GenerateChallengeErrorKind,
  type GenerateChallengeInput,
  type GenerateChallengeOptions,
  type GenerateChallengeResult,
} from "./generation"
