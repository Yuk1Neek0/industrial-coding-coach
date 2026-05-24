// Public surface of the M9 challenges data-access layer
// (debug-expansion-challenge epic, Issue #140).
//
// - `challenges` — the `challenges` + `challenge_attempts` typed DAL covering
//                  create/read for challenges, create/read for attempts, and
//                  the latest-outcome accessor (R5 / FR-9).

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
