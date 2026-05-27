// Typed data-access layer for the `learning_units` table
// (issue-based-learning-workspace PRD FR-8/FR-9, Issue #135).
//
// This is the single typed interface the M7 Issue-Based Learning Workspace
// reads and writes learning units through. It covers create / read / update
// keyed by imported-repo snapshot + input source + issue/task identifier (R1),
// storing the seven generated outputs at generation time and the user's
// answers, the per-attempt score, the weak-area breakdown, and the
// review-checklist state on the same row as JSON columns (R2, FR-8). The
// file-reference integrity check FR-4 requires lives next to this module in
// `./integrity` and is re-exported from the barrel.
//
// Server-side only — these functions open (or are handed) a local SQLite
// connection (ADR 0006). Every function accepts an optional `CatalogDb` so
// tests inject a fixture database; in the app, callers omit it and a lazily
// created package-local default is used. Style mirrors
// `../mapper/project-maps.ts` and `../diff/reviews.ts`: small fully typed
// functions, `null` for a clean miss, one unit per snapshot + source +
// issueRef.
//
// **Per R4 this layer does NOT gate** — `checklistState` is persisted for
// display, never used to block scoring. **Per R6 scoring is strictly
// per-unit** — this module computes no cross-unit aggregate.

import { and, eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "../client"
import { getImportedRepo } from "../github/repos"
import {
  type AgentExecutionStep,
  type ChecklistItemState,
  type LearningConcept,
  type LearningUnit,
  type LearningWeakArea,
  learningUnits,
  type RelatedFile,
  type ReviewChecklistItem,
  type UnderstandingAnswer,
  type UnderstandingQuestion,
  type UnderstandingScore,
} from "../schema"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/**
 * The structured body of a learning unit — the seven generated outputs the M7
 * generation call produces, without the snapshot key, the unit-identity
 * columns (`source` / `issueRef`), or the row's audit timestamps.
 *
 * This is the contract the M7 generation call (#133) produces and the
 * data-access layer persists, so the producer and the store agree on one shape.
 */
export interface LearningUnitContent {
  /** The issue / task goal, restated in plain language. */
  restatedGoal: string
  /** Files in the snapshot related to the unit, with the role each plays. */
  relatedFiles: RelatedFile[]
  /** Concepts the unit teaches, grounded in the project. */
  concepts: LearningConcept[]
  /** AI-agent execution notes — how the agent should approach the work. */
  agentExecutionNotes: AgentExecutionStep[]
  /** Review checklist the user works through (R4 — informational only). */
  reviewChecklist: ReviewChecklistItem[]
  /** Understanding questions the user must answer to demonstrate comprehension. */
  questions: UnderstandingQuestion[]
  /** Minimal challenge concept stub — full schema lands in M9 (R3). */
  challengeConcept: string | null
  /** Minimal challenge type stub — full schema lands in M9 (R3). */
  challengeType: string | null
}

/**
 * The identity columns of a learning unit — what makes one row distinct from
 * another. Snapshot + source + issueRef together form the unique key (R1).
 */
export interface LearningUnitIdentity {
  /** The imported repo snapshot this unit's repo identity is anchored to. */
  snapshotId: number
  /** Where this unit's input came from — GitHub Issue or CCPM task (R1). */
  source: "github-issue" | "ccpm-task"
  /** Issue or task identifier, e.g. `#42` or `epic/foo/003`. */
  issueRef: string
}

/**
 * The full create-time shape of a learning unit: the identity columns plus the
 * seven generated outputs. Mirrors the schema's `NewLearningUnit`, but with
 * the JSON columns the user fills in (answers / score / weak areas /
 * checklist state) explicitly omitted — those start `null` and are populated
 * by {@link recordAnswers}, {@link recordScore}, and
 * {@link updateChecklistState}.
 */
export type NewLearningUnitInput = LearningUnitIdentity & LearningUnitContent

/**
 * Get the learning unit stored for a snapshot + source + issue/task identifier,
 * or `null` when no unit has been generated for it yet.
 */
export async function getLearningUnit(
  snapshotId: number,
  source: LearningUnitIdentity["source"],
  issueRef: string,
  db?: CatalogDb,
): Promise<LearningUnit | null> {
  const rows = resolveDb(db)
    .select()
    .from(learningUnits)
    .where(
      and(
        eq(learningUnits.snapshotId, snapshotId),
        eq(learningUnits.source, source),
        eq(learningUnits.issueRef, issueRef),
      ),
    )
    .limit(1)
    .all()
  return rows[0] ?? null
}

/** Get one learning unit by its primary-key `id`, or `null` when none matches. */
export async function getLearningUnitById(
  id: number,
  db?: CatalogDb,
): Promise<LearningUnit | null> {
  const rows = resolveDb(db)
    .select()
    .from(learningUnits)
    .where(eq(learningUnits.id, id))
    .limit(1)
    .all()
  return rows[0] ?? null
}

/**
 * Get the learning unit for an imported repository by `owner` / `repo` /
 * `source` / `issueRef`, resolving the snapshot through the M11 data-access
 * layer first.
 *
 * Returns `null` both when the repository is not imported and when it is
 * imported but the issue/task has no unit yet — use {@link getImportedRepo}
 * first if the caller needs to tell those two cases apart.
 */
export async function getLearningUnitByRepo(
  owner: string,
  repo: string,
  source: LearningUnitIdentity["source"],
  issueRef: string,
  ref?: string,
  db?: CatalogDb,
): Promise<LearningUnit | null> {
  const resolved = resolveDb(db)
  const snapshot = await getImportedRepo(owner, repo, ref, resolved)
  if (!snapshot) return null
  return getLearningUnit(snapshot.id, source, issueRef, resolved)
}

/** List every learning unit stored for a snapshot, oldest first (by id). */
export async function listLearningUnits(
  snapshotId: number,
  db?: CatalogDb,
): Promise<LearningUnit[]> {
  return resolveDb(db)
    .select()
    .from(learningUnits)
    .where(eq(learningUnits.snapshotId, snapshotId))
    .orderBy(learningUnits.id)
    .all()
}

/**
 * Insert a new learning unit for a snapshot + source + issueRef and return the
 * stored row. The user-mutable fields (`userAnswers`, `score`, `weakAreas`,
 * `checklistState`) start `null` — they are populated later via
 * {@link recordAnswers}, {@link recordScore}, and
 * {@link updateChecklistState}.
 *
 * Fails if a unit already exists for the same snapshot + source + issueRef —
 * the table holds at most one per identity. Re-generating a unit goes through
 * {@link updateLearningUnit}.
 */
export async function createLearningUnit(
  unit: NewLearningUnitInput,
  db?: CatalogDb,
): Promise<LearningUnit> {
  return resolveDb(db)
    .insert(learningUnits)
    .values(unit)
    .returning()
    .get()
}

/**
 * Replace the generated content of an existing learning unit, bumping
 * `updatedAt`. Identity columns (`snapshotId`, `source`, `issueRef`) are
 * preserved; the user-mutable fields (`userAnswers`, `score`, `weakAreas`,
 * `checklistState`) are left untouched — re-generating a unit does NOT clear
 * the user's prior answers or checklist state (those are cleared explicitly
 * by the integration layer when the question shape changes). Returns the
 * updated row, or `null` when no unit exists for that identity.
 *
 * `patch` accepts any subset of the seven generated outputs; only the
 * supplied keys are written.
 */
export async function updateLearningUnit(
  identity: LearningUnitIdentity,
  patch: Partial<LearningUnitContent>,
  db?: CatalogDb,
): Promise<LearningUnit | null> {
  const rows = resolveDb(db)
    .update(learningUnits)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(learningUnits.snapshotId, identity.snapshotId),
        eq(learningUnits.source, identity.source),
        eq(learningUnits.issueRef, identity.issueRef),
      ),
    )
    .returning()
    .all()
  return rows[0] ?? null
}

/**
 * Persist the user's answers to the understanding questions into
 * `userAnswers`, bumping `updatedAt`. Returns the updated row, or `null` when
 * no unit has the given `id`.
 *
 * **R4 / R6:** this writes the answers and nothing else — it does not score,
 * grade, or read `checklistState`. Scoring is a separate operation
 * ({@link recordScore}) driven by the M7 grading call (#134).
 */
export async function recordAnswers(
  id: number,
  answers: UnderstandingAnswer[],
  db?: CatalogDb,
): Promise<LearningUnit | null> {
  const rows = resolveDb(db)
    .update(learningUnits)
    .set({ userAnswers: answers, updatedAt: new Date() })
    .where(eq(learningUnits.id, id))
    .returning()
    .all()
  return rows[0] ?? null
}

/**
 * Persist the per-attempt score and the weak-area breakdown into `score` and
 * `weakAreas`, bumping `updatedAt`. Returns the updated row, or `null` when
 * no unit has the given `id`.
 *
 * **R6:** scoring is strictly per-unit — this module computes no cross-unit
 * aggregate. **R4:** this does NOT read `checklistState`; checklist
 * completion never gates the score.
 */
export async function recordScore(
  id: number,
  score: UnderstandingScore,
  weakAreas: LearningWeakArea[],
  db?: CatalogDb,
): Promise<LearningUnit | null> {
  const rows = resolveDb(db)
    .update(learningUnits)
    .set({ score, weakAreas, updatedAt: new Date() })
    .where(eq(learningUnits.id, id))
    .returning()
    .all()
  return rows[0] ?? null
}

/**
 * Persist the user's review-checklist tick state into `checklistState`,
 * bumping `updatedAt`. Returns the updated row, or `null` when no unit has
 * the given `id`.
 *
 * **R4:** `checklistState` is a display-only progress indicator — it is never
 * used to block scoring. This function is intentionally separate from
 * {@link recordScore} for that reason.
 */
export async function updateChecklistState(
  id: number,
  state: ChecklistItemState[],
  db?: CatalogDb,
): Promise<LearningUnit | null> {
  const rows = resolveDb(db)
    .update(learningUnits)
    .set({ checklistState: state, updatedAt: new Date() })
    .where(eq(learningUnits.id, id))
    .returning()
    .all()
  return rows[0] ?? null
}
