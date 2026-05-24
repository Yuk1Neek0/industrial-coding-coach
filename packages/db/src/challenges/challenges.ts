// Typed data-access layer for the `challenges` + `challenge_attempts` tables
// (debug-expansion-challenge PRD FR-8 / FR-9, Issue #140).
//
// This is the single server-side surface the M9 generation call (#142), the
// M9 grading call (#143), and the M9 UI integration (#148) use to persist and
// read challenges and attempts. It covers:
//
//   - challenges      — create / save (create-or-replace) / read by id / read
//                       by snapshot + type / list by snapshot.
//   - attempts        — create / list (oldest first) / get latest (R5).
//   - grading         — store the grading result against an existing attempt.
//
// The (snapshot, type) cache key drives R2's lazy-per-type generation: the
// generation call looks up an existing row before issuing a new SDK call. The
// "new challenge" action calls {@link saveChallenge} to overwrite the cached
// row; the foreign key cascade clears prior attempts on regeneration so a
// fresh challenge does not inherit a stale history.
//
// Server-side only — these functions open (or are handed) a local SQLite
// connection (ADR 0006). Every function accepts an optional `CatalogDb` so
// tests inject a fixture database; in the app, callers omit it and a lazily
// created package-local default is used. Style mirrors `../diff/reviews.ts`
// and `../mapper/project-maps.ts`: small fully typed functions, `null` for a
// clean miss, no `any`.

import { and, desc, eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "../client"
import { getImportedRepo } from "../github/repos"
import {
  challengeAttempts,
  challenges,
  type Challenge,
  type ChallengeAcceptanceCriterion,
  type ChallengeAttempt,
  type ChallengeAttemptSnippet,
  type ChallengeGradingResult,
  type ChallengeSourceReference,
  type ChallengeType,
} from "../schema"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/**
 * The typed challenge model (FR-3), without the snapshot key, the challenge
 * type, or the row's audit timestamps. This is the contract the M9 generation
 * call (#142) produces and the data-access layer persists, so the producer and
 * the store agree on one shape.
 */
export interface ChallengeContent {
  /** Plain-language description of what the user must do. */
  taskDescription: string
  /** In-scope file paths — strictly M6-project-map-named (R8 / FR-3). */
  inScopeFiles: string[]
  /** Out-of-scope file paths — strictly M6-project-map-named (R8 / FR-3). */
  outOfScopeFiles: string[]
  /** Acceptance criteria the grader will check the explanation against. */
  acceptanceCriteria: ChallengeAcceptanceCriterion[]
  /** Pointers back into the M6 project map this challenge was grounded in. */
  sourceReferences: ChallengeSourceReference[]
}

/**
 * The user's submission to a challenge (FR-4) — explanation, optional snippets,
 * and the paths the user said they would change. The grading result is added
 * later by {@link gradeChallengeAttempt} after the M9 grading call (#143) runs.
 */
export interface ChallengeAttemptSubmission {
  /** The user's free-text explanation — the graded artifact (R3 / FR-7). */
  explanation: string
  /** Optional per-file code snippets — illustrative, not graded (R3). */
  snippets: ChallengeAttemptSnippet[]
  /** Paths the user said they would change — illustrative, not graded. */
  filePaths: string[]
}

// --- challenges ------------------------------------------------------------

/**
 * Get the cached challenge for a snapshot + type, or `null` when that type has
 * not been generated for the snapshot yet. This is R2's lazy-per-type cache
 * lookup — the generation call calls this before issuing an SDK call.
 */
export async function getChallengeBySnapshotAndType(
  snapshotId: number,
  type: ChallengeType,
  db?: CatalogDb,
): Promise<Challenge | null> {
  const rows = resolveDb(db)
    .select()
    .from(challenges)
    .where(
      and(eq(challenges.snapshotId, snapshotId), eq(challenges.type, type)),
    )
    .limit(1)
    .all()
  return rows[0] ?? null
}

/** Get one challenge by its `id`, or `null` when none matches. */
export async function getChallengeById(
  id: number,
  db?: CatalogDb,
): Promise<Challenge | null> {
  const rows = resolveDb(db)
    .select()
    .from(challenges)
    .where(eq(challenges.id, id))
    .limit(1)
    .all()
  return rows[0] ?? null
}

/**
 * Get a snapshot's challenge of a given type by `owner` / `repo` / `type`,
 * resolving the snapshot through the M11 data-access layer first.
 *
 * Returns `null` both when the repository is not imported and when it is
 * imported but that challenge type has not been generated — use
 * {@link getImportedRepo} first if the caller needs to tell those two cases
 * apart.
 */
export async function getChallengeByRepo(
  owner: string,
  repo: string,
  type: ChallengeType,
  ref?: string,
  db?: CatalogDb,
): Promise<Challenge | null> {
  const resolved = resolveDb(db)
  const snapshot = await getImportedRepo(owner, repo, ref, resolved)
  if (!snapshot) return null
  return getChallengeBySnapshotAndType(snapshot.id, type, resolved)
}

/**
 * List every challenge stored for a snapshot, oldest first (by id). This is
 * the read the Challenge List Page uses to render every cached challenge for
 * the current snapshot.
 */
export async function listChallengesBySnapshot(
  snapshotId: number,
  db?: CatalogDb,
): Promise<Challenge[]> {
  return resolveDb(db)
    .select()
    .from(challenges)
    .where(eq(challenges.snapshotId, snapshotId))
    .orderBy(challenges.id)
    .all()
}

/**
 * Insert a new challenge for a snapshot + type and return the stored row.
 * Fails if the (snapshot, type) row already exists — the table holds at most
 * one challenge per (snapshot, type). Use {@link saveChallenge} to
 * create-or-replace.
 */
export async function createChallenge(
  snapshotId: number,
  type: ChallengeType,
  content: ChallengeContent,
  db?: CatalogDb,
): Promise<Challenge> {
  return resolveDb(db)
    .insert(challenges)
    .values({ snapshotId, type, ...content })
    .returning()
    .get()
}

/**
 * Replace the stored content of an existing challenge for a snapshot + type,
 * bumping `updatedAt`. Returns the updated row, or `null` when the
 * (snapshot, type) row does not exist.
 *
 * Replacing the content of a cached row preserves the row's `id` so the
 * `challenge_attempts` foreign key keeps pointing at the same logical
 * challenge — see {@link saveChallenge} for the "new challenge" workflow
 * that intentionally discards prior attempts.
 */
export async function updateChallenge(
  snapshotId: number,
  type: ChallengeType,
  content: ChallengeContent,
  db?: CatalogDb,
): Promise<Challenge | null> {
  const rows = resolveDb(db)
    .update(challenges)
    .set({ ...content, updatedAt: new Date() })
    .where(
      and(eq(challenges.snapshotId, snapshotId), eq(challenges.type, type)),
    )
    .returning()
    .all()
  return rows[0] ?? null
}

/**
 * Create-or-replace the cached challenge for a snapshot + type, returning the
 * stored row.
 *
 * This is the operation the generation call (#142) makes after a successful
 * run. The "new challenge" action calls this too — replacing the content of
 * the cached row, while the foreign-key `ON DELETE CASCADE` on
 * `challenge_attempts` is unaffected because the row's `id` is reused. If a
 * caller wants the regeneration to start a fresh attempt history they must
 * delete the row first; that is intentional — the "new challenge" UI flow
 * decides the policy, not the data-access layer.
 */
export async function saveChallenge(
  snapshotId: number,
  type: ChallengeType,
  content: ChallengeContent,
  db?: CatalogDb,
): Promise<Challenge> {
  const resolved = resolveDb(db)
  const existing = await getChallengeBySnapshotAndType(snapshotId, type, resolved)
  if (existing) {
    // The row exists, so the update always matches — the `??` is unreachable
    // but keeps the function total without a non-null assertion.
    return (
      (await updateChallenge(snapshotId, type, content, resolved)) ??
      createChallenge(snapshotId, type, content, resolved)
    )
  }
  return createChallenge(snapshotId, type, content, resolved)
}

// --- attempts --------------------------------------------------------------

/**
 * Append a new attempt to a challenge and return the stored row. The grading
 * result starts `null` — it is filled later by {@link gradeChallengeAttempt}
 * after the M9 grading call (#143) runs. Multiple attempts per challenge are
 * preserved (US-6); the latest is the one returned by
 * {@link getLatestChallengeAttempt}.
 */
export async function createChallengeAttempt(
  challengeId: number,
  submission: ChallengeAttemptSubmission,
  db?: CatalogDb,
): Promise<ChallengeAttempt> {
  return resolveDb(db)
    .insert(challengeAttempts)
    .values({ challengeId, ...submission })
    .returning()
    .get()
}

/**
 * List every attempt on a challenge, oldest first (by `submittedAt`). This is
 * the read the Challenge Detail Page uses to render the prior-attempts
 * collapsible (R5). Returns an empty array for a challenge with no attempts.
 */
export async function listChallengeAttempts(
  challengeId: number,
  db?: CatalogDb,
): Promise<ChallengeAttempt[]> {
  return resolveDb(db)
    .select()
    .from(challengeAttempts)
    .where(eq(challengeAttempts.challengeId, challengeId))
    .orderBy(challengeAttempts.submittedAt, challengeAttempts.id)
    .all()
}

/**
 * Get the most recent attempt on a challenge, or `null` when the challenge
 * has no attempts. This is R5's "latest outcome" accessor — the Detail Page
 * renders this attempt as the primary outcome and the rest as prior history.
 *
 * Ordered by `submittedAt` descending, then `id` descending as a tiebreaker so
 * two attempts that happen to share a clock tick still resolve to a stable
 * "most recent" row.
 */
export async function getLatestChallengeAttempt(
  challengeId: number,
  db?: CatalogDb,
): Promise<ChallengeAttempt | null> {
  const rows = resolveDb(db)
    .select()
    .from(challengeAttempts)
    .where(eq(challengeAttempts.challengeId, challengeId))
    .orderBy(desc(challengeAttempts.submittedAt), desc(challengeAttempts.id))
    .limit(1)
    .all()
  return rows[0] ?? null
}

/**
 * The latest-outcome row for a challenge: the latest attempt (or `null` when
 * none) and its grading result (or `null` when the attempt has not been graded
 * yet). The Detail Page renders these as the primary outcome (R5); a `null`
 * `grading` means "submitted, awaiting grading" — not "not attempted".
 */
export interface LatestChallengeOutcome {
  /** The most recent attempt, or `null` when the challenge has no attempts. */
  attempt: ChallengeAttempt | null
  /**
   * The grading result of the latest attempt, or `null` when there is no
   * latest attempt or the attempt has not been graded yet.
   */
  grading: ChallengeGradingResult | null
}

/**
 * Convenience read combining {@link getLatestChallengeAttempt} with its
 * grading column — the shape the Detail Page and the Completion Review UI
 * want without two round-trips. The two `null`s are distinguishable: a `null`
 * attempt means the challenge has never been submitted to; a non-`null`
 * attempt with `null` grading means submitted-but-not-yet-graded.
 */
export async function getLatestChallengeOutcome(
  challengeId: number,
  db?: CatalogDb,
): Promise<LatestChallengeOutcome> {
  const attempt = await getLatestChallengeAttempt(challengeId, db)
  return {
    attempt,
    grading: attempt?.grading ?? null,
  }
}

/**
 * Store the M9 grading result against an existing attempt, bumping
 * `updatedAt`. Returns the updated row, or `null` when the attempt does not
 * exist. Re-grading an attempt overwrites the prior grading in place — the
 * row's `submittedAt` (which drives "latest outcome") is left untouched so a
 * regraded attempt does not silently reorder against newer attempts.
 */
export async function gradeChallengeAttempt(
  attemptId: number,
  grading: ChallengeGradingResult,
  db?: CatalogDb,
): Promise<ChallengeAttempt | null> {
  const rows = resolveDb(db)
    .update(challengeAttempts)
    .set({ grading, updatedAt: new Date() })
    .where(eq(challengeAttempts.id, attemptId))
    .returning()
    .all()
  return rows[0] ?? null
}
