// Typed data-access layer for the `diff_reviews` table
// (diff-review PRD FR-6/FR-7, Issue #114).
//
// This is the single typed interface the M8 Diff Review Coach Ui reads and
// writes diff reviews through. It covers create / read / update keyed by
// imported-repo snapshot + PR number, storing the user's answers to the
// comprehension questions and the grading score / weak-area breakdown, plus the
// file-reference integrity check FR-4 requires: proof that every file path a
// review cites resolves to a file in the PR's changed-file set.
//
// Server-side only — these functions open (or are handed) a local SQLite
// connection (ADR 0006). Every function accepts an optional `CatalogDb` so
// tests inject a fixture database; in the app, callers omit it and a lazily
// created package-local default is used. Style mirrors `../stack/explanations.ts`
// and `../recommendations.ts`: small fully typed functions, `null` for a clean
// miss.

import { and, eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "../client"
import { getImportedRepo, getImportedRepoById } from "../github/repos"
import type { PullRequestChangeModel } from "../github/pull-requests"
import {
  type ChangedFileExplanation,
  type ComprehensionAnswer,
  type ComprehensionQuestion,
  type DiffReview,
  diffReviews,
  type DiffRisk,
  type TestSuggestion,
  type WeakArea,
} from "../schema"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/**
 * The six generated outputs of a diff review — the JSON/prose columns produced
 * by the review call, without the snapshot key, PR number, grading fields, or
 * the row's audit timestamps.
 *
 * This is the contract the M8 diff-review call (#112) produces and the
 * data-access layer persists, so the producer and the store agree on one shape.
 */
export interface DiffReviewContent {
  /** Plain-language explanation of each changed file in the PR. */
  changedFiles: ChangedFileExplanation[]
  /** Plain-language explanation of the PR's core logic. */
  coreLogicExplanation: string
  /** Risks the PR introduces. */
  riskAnalysis: DiffRisk[]
  /** Tests suggested to cover the change. */
  testSuggestions: TestSuggestion[]
  /** Comprehension questions the user must answer to defend the change. */
  comprehensionQuestions: ComprehensionQuestion[]
}

/**
 * The grading outcome stored against a review once the user completes the
 * understanding check: their answers, the score, and the weak-area breakdown.
 *
 * This is the contract the M8 grading call (#113) produces and the data-access
 * layer persists through {@link gradeDiffReview}.
 */
export interface DiffReviewGrading {
  /** The user's answers to the comprehension questions. */
  answers: ComprehensionAnswer[]
  /** The grading score (0–100). */
  score: number
  /** Weak areas surfaced by grading. */
  weakAreas: WeakArea[]
}

/**
 * Get the diff review stored for a snapshot + PR number, or `null` when that
 * PR has not been reviewed yet.
 */
export async function getDiffReview(
  snapshotId: number,
  prNumber: number,
  db?: CatalogDb,
): Promise<DiffReview | null> {
  const rows = resolveDb(db)
    .select()
    .from(diffReviews)
    .where(
      and(
        eq(diffReviews.snapshotId, snapshotId),
        eq(diffReviews.prNumber, prNumber),
      ),
    )
    .limit(1)
    .all()
  return rows[0] ?? null
}

/** Get one diff review by its `id`, or `null` when none matches. */
export async function getDiffReviewById(
  id: number,
  db?: CatalogDb,
): Promise<DiffReview | null> {
  const rows = resolveDb(db)
    .select()
    .from(diffReviews)
    .where(eq(diffReviews.id, id))
    .limit(1)
    .all()
  return rows[0] ?? null
}

/**
 * Get the diff review for an imported repository's PR by `owner` / `repo` /
 * `prNumber`, resolving the snapshot through the M11 data-access layer first.
 *
 * Returns `null` both when the repository is not imported and when it is
 * imported but the PR has not been reviewed — use {@link getImportedRepo}
 * first if the caller needs to tell those two cases apart.
 */
export async function getDiffReviewByRepo(
  owner: string,
  repo: string,
  prNumber: number,
  ref?: string,
  db?: CatalogDb,
): Promise<DiffReview | null> {
  const resolved = resolveDb(db)
  const snapshot = await getImportedRepo(owner, repo, ref, resolved)
  if (!snapshot) return null
  return getDiffReview(snapshot.id, prNumber, resolved)
}

/** List every diff review stored for a snapshot, oldest first (by id). */
export async function listDiffReviews(
  snapshotId: number,
  db?: CatalogDb,
): Promise<DiffReview[]> {
  return resolveDb(db)
    .select()
    .from(diffReviews)
    .where(eq(diffReviews.snapshotId, snapshotId))
    .orderBy(diffReviews.id)
    .all()
}

/**
 * Insert a new diff review for a snapshot + PR number and return the stored
 * row. The grading fields (`answers`, `score`, `weakAreas`) start `null` — a
 * review is generated first and graded later via {@link gradeDiffReview}.
 *
 * Fails if the PR already has a review — the table holds at most one per
 * snapshot + PR. Use {@link saveDiffReview} to create-or-replace.
 */
export async function createDiffReview(
  snapshotId: number,
  prNumber: number,
  content: DiffReviewContent,
  db?: CatalogDb,
): Promise<DiffReview> {
  return resolveDb(db)
    .insert(diffReviews)
    .values({ snapshotId, prNumber, ...content })
    .returning()
    .get()
}

/**
 * Replace the six generated outputs of an existing diff review, bumping
 * `updatedAt`. The grading fields are left untouched. Returns the updated row,
 * or `null` when the snapshot + PR has no review to update.
 */
export async function updateDiffReview(
  snapshotId: number,
  prNumber: number,
  content: DiffReviewContent,
  db?: CatalogDb,
): Promise<DiffReview | null> {
  const rows = resolveDb(db)
    .update(diffReviews)
    .set({ ...content, updatedAt: new Date() })
    .where(
      and(
        eq(diffReviews.snapshotId, snapshotId),
        eq(diffReviews.prNumber, prNumber),
      ),
    )
    .returning()
    .all()
  return rows[0] ?? null
}

/**
 * Create the snapshot + PR's diff review, or replace its generated content if
 * one already exists.
 *
 * Re-reviewing a PR updates its row in place (schema: one review per snapshot +
 * PR) — this is the operation the review call makes after a successful run.
 * Re-reviewing does NOT clear an existing grading; clear it explicitly if the
 * regenerated review's questions changed.
 */
export async function saveDiffReview(
  snapshotId: number,
  prNumber: number,
  content: DiffReviewContent,
  db?: CatalogDb,
): Promise<DiffReview> {
  const resolved = resolveDb(db)
  const existing = await getDiffReview(snapshotId, prNumber, resolved)
  if (existing) {
    // The row exists, so the update always matches — the `??` is unreachable
    // but keeps the function total without a non-null assertion.
    return (
      (await updateDiffReview(snapshotId, prNumber, content, resolved)) ??
      createDiffReview(snapshotId, prNumber, content, resolved)
    )
  }
  return createDiffReview(snapshotId, prNumber, content, resolved)
}

/**
 * Store the user's answers and the grading result against an existing diff
 * review, bumping `updatedAt`. This is the operation the grading call (#113)
 * makes once the user completes the understanding check.
 *
 * Returns the updated row, or `null` when the snapshot + PR has no review to
 * grade.
 */
export async function gradeDiffReview(
  snapshotId: number,
  prNumber: number,
  grading: DiffReviewGrading,
  db?: CatalogDb,
): Promise<DiffReview | null> {
  const rows = resolveDb(db)
    .update(diffReviews)
    .set({
      answers: grading.answers,
      score: grading.score,
      weakAreas: grading.weakAreas,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(diffReviews.snapshotId, snapshotId),
        eq(diffReviews.prNumber, prNumber),
      ),
    )
    .returning()
    .all()
  return rows[0] ?? null
}

/** The outcome of {@link checkReviewFileReferences}. */
export interface DiffReviewFileReferenceCheck {
  /** True when every cited changed-file path resolves to a PR changed file. */
  ok: boolean
  /**
   * `changedFiles[].path` values that do not resolve to a file in the PR's
   * changed-file set. A review must only explain files the PR actually
   * changed, so an unresolved path here fails the check.
   */
  missingChangedFiles: string[]
}

/**
 * The PR changed-file set a review's references are checked against — just the
 * changed-file paths. Accepts either a full {@link PullRequestChangeModel} or a
 * bare list of paths, so callers that only have the paths need not build a
 * whole model.
 */
export type ChangedFileSet = PullRequestChangeModel | { files: { path: string }[] }

/** Collect the changed-file paths from a {@link ChangedFileSet}. */
function changedFilePaths(changeSet: ChangedFileSet): Set<string> {
  return new Set(changeSet.files.map((file) => file.path))
}

/**
 * Verify every file path a diff review cites against the PR's changed-file set
 * (PRD FR-4 — every file reference resolves to a real changed file).
 *
 * Pure and total. `changedFiles[].path` is always meant to be a path the PR
 * changed, so an unresolved one fails the check. The review is project-tied
 * output, so this guard runs at integration time before a review is surfaced.
 *
 * @param content - the review content to verify.
 * @param changeSet - the PR's change model (or its changed-file paths).
 */
export function checkReviewFileReferences(
  content: DiffReviewContent,
  changeSet: ChangedFileSet,
): DiffReviewFileReferenceCheck {
  const paths = changedFilePaths(changeSet)

  const missingChangedFiles = content.changedFiles
    .map((file) => file.path)
    .filter((path) => !paths.has(path))

  return {
    ok: missingChangedFiles.length === 0,
    missingChangedFiles,
  }
}

/**
 * Run {@link checkReviewFileReferences} for a stored review, loading the review
 * from the database and checking it against a supplied PR change set.
 *
 * The change set is passed in rather than re-fetched: the PR change model lives
 * behind the GitHub client (Issue #111) and is the caller's to provide. Returns
 * `null` when the snapshot does not exist or the PR has no stored review — the
 * caller distinguishes "nothing to check" from a real integrity failure.
 */
export async function checkDiffReviewIntegrity(
  snapshotId: number,
  prNumber: number,
  changeSet: ChangedFileSet,
  db?: CatalogDb,
): Promise<DiffReviewFileReferenceCheck | null> {
  const resolved = resolveDb(db)
  const snapshot = await getImportedRepoById(snapshotId, resolved)
  if (!snapshot) return null
  const review = await getDiffReview(snapshotId, prNumber, resolved)
  if (!review) return null
  return checkReviewFileReferences(review, changeSet)
}
