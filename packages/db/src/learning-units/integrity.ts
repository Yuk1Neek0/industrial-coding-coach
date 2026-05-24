// The reusable file-reference integrity check for learning units
// (issue-based-learning-workspace PRD FR-4, Issue #135).
//
// This is the durable home of `verifyLearningUnitIntegrity` — a **pure,
// synchronous** validator that, given a `LearningUnit` (or its content) plus
// the imported snapshot's file set and optionally the M6 project map for the
// same snapshot, returns a structured `{ ok, unresolved }` result.
//
// Two callers will import this:
//   - The M7 generation call (#133) calls it at the generator boundary,
//     **rejecting** any LLM output whose related-file paths do not resolve to
//     the snapshot — FR-4's primary purpose ("fail the unit rather than
//     silently rendering broken links").
//   - The M7 integration layer (#138) calls it at the integration boundary,
//     guarding UI rendering against drift after a snapshot is re-imported.
//
// The check is pure / synchronous — callers supply the inputs. The DB-backed
// wrapper {@link checkLearningUnitIntegrity} below is a convenience for
// "load the stored unit + its snapshot's file tree, then verify". Mirrors
// `../mapper/project-maps.ts`'s `checkProjectMapFileReferences` /
// `checkProjectMapIntegrity` and `../diff/reviews.ts`'s
// `checkReviewFileReferences` / `checkDiffReviewIntegrity`.

import { createCatalogDb, type CatalogDb } from "../client"
import { getImportedRepoById } from "../github/repos"
import {
  type LearningUnit,
  type ProjectMap,
  type RepoTreeEntry,
} from "../schema"
import type { LearningUnitContent } from "./units"
import { getLearningUnit } from "./units"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/** The kind of reference that failed to resolve. */
export type UnresolvedRefKind =
  | "related-file"
  | "ungrounded-concept"
  | "abstract-checklist-item"

/**
 * One unresolved reference reported by {@link verifyLearningUnitIntegrity}.
 * Tags the failure kind, the offending value (the path / concept name /
 * checklist item id), and a short human-readable reason.
 */
export interface UnresolvedRef {
  /** Which kind of reference this is — see {@link UnresolvedRefKind}. */
  kind: UnresolvedRefKind
  /**
   * The offending value:
   *   - for `related-file`, the unresolved file path;
   *   - for `ungrounded-concept`, the concept name;
   *   - for `abstract-checklist-item`, the checklist item id.
   */
  value: string
  /** One-line reason this reference failed to resolve. */
  reason: string
}

/** The outcome of {@link verifyLearningUnitIntegrity}. */
export interface LearningUnitIntegrityResult {
  /** True iff no related-file paths failed to resolve. */
  ok: boolean
  /**
   * Every unresolved reference found, in order: related-file misses first
   * (which fail `ok`), then ungrounded concepts and abstract checklist items
   * (which are informational and do not fail `ok` on their own).
   */
  unresolved: UnresolvedRef[]
}

/**
 * The verifiable parts of a learning unit. Accepts a stored {@link LearningUnit}
 * row OR a generator-produced {@link LearningUnitContent} — the integrity check
 * runs the same way at the generator boundary (#133, before persistence) and
 * the integration boundary (#138, after persistence).
 */
export type VerifiableLearningUnit = LearningUnit | LearningUnitContent

/**
 * Pull the verifiable subset out of either input shape, ignoring identity /
 * audit columns the integrity check does not look at.
 */
function verifiableParts(unit: VerifiableLearningUnit): LearningUnitContent {
  return {
    restatedGoal: unit.restatedGoal,
    relatedFiles: unit.relatedFiles,
    concepts: unit.concepts,
    agentExecutionNotes: unit.agentExecutionNotes,
    reviewChecklist: unit.reviewChecklist,
    questions: unit.questions,
    challengeConcept: unit.challengeConcept,
    challengeType: unit.challengeType,
  }
}

/**
 * The snapshot's file set the unit's references are checked against — just
 * the set of file paths. Accepts either a pre-built `Set<string>` or a
 * `RepoTreeEntry[]` straight off `RepoSnapshot.fileTree`.
 */
export type LearningUnitSnapshotFiles = Set<string> | RepoTreeEntry[]

/** Coerce {@link LearningUnitSnapshotFiles} to a `Set<string>` of file paths. */
function resolveSnapshotFiles(files: LearningUnitSnapshotFiles): Set<string> {
  if (files instanceof Set) return files
  return new Set(files.filter((e) => e.type === "blob").map((e) => e.path))
}

/**
 * Whether a concept "ties to" a related file or M6 project-map node.
 *
 * A concept is grounded when at least one of these holds:
 *   1. its `name` (case-insensitive substring) appears in any related file's
 *      `reason`, OR
 *   2. its `explanation` mentions any related file's `path`, OR
 *   3. when a project map is supplied, its `name` (case-insensitive substring)
 *      appears in any of the map's `keyFileMap[].role` strings or
 *      `architectureOverview[].title|detail`.
 *
 * The check is intentionally fuzzy — a strict structural link would require a
 * schema-level join the LLM cannot reliably produce. The check is strict
 * enough to catch a concept that names nothing the unit actually relates to
 * (the FR-4 failure mode), and loose enough not to flag well-grounded
 * concepts that phrase the link in natural language.
 */
function isConceptGrounded(
  conceptName: string,
  conceptExplanation: string,
  relatedFiles: LearningUnitContent["relatedFiles"],
  projectMap: ProjectMap | undefined,
): boolean {
  const name = conceptName.toLowerCase().trim()
  if (name.length === 0) return false

  // (1) name shows up in any related-file reason.
  for (const file of relatedFiles) {
    if (file.reason.toLowerCase().includes(name)) return true
  }

  // (2) explanation mentions a related-file path (or its basename).
  const explanation = conceptExplanation.toLowerCase()
  for (const file of relatedFiles) {
    const path = file.path.toLowerCase()
    if (explanation.includes(path)) return true
    const basename = path.split("/").pop() ?? ""
    if (basename.length > 0 && explanation.includes(basename)) return true
  }

  // (3) name shows up in any project-map node when a map is supplied.
  if (projectMap) {
    for (const file of projectMap.keyFileMap) {
      if (file.role.toLowerCase().includes(name)) return true
    }
    for (const section of projectMap.architectureOverview) {
      if (
        section.title.toLowerCase().includes(name) ||
        section.detail.toLowerCase().includes(name)
      ) {
        return true
      }
    }
  }

  return false
}

/**
 * Whether a review-checklist item is "concrete to this issue" — i.e. it names
 * at least one related-file path / basename or one concept name.
 *
 * An abstract checklist item (e.g. "the code looks good") names neither and
 * is reported as informational; it does not fail `ok` on its own, because the
 * primary FR-4 failure mode is unresolved file references.
 */
function isChecklistItemConcrete(
  description: string,
  relatedFiles: LearningUnitContent["relatedFiles"],
  concepts: LearningUnitContent["concepts"],
): boolean {
  const desc = description.toLowerCase()

  for (const file of relatedFiles) {
    const path = file.path.toLowerCase()
    if (desc.includes(path)) return true
    const basename = path.split("/").pop() ?? ""
    if (basename.length > 0 && desc.includes(basename)) return true
  }

  for (const concept of concepts) {
    const name = concept.name.toLowerCase().trim()
    if (name.length > 0 && desc.includes(name)) return true
  }

  return false
}

/**
 * Verify a learning unit's file references against a snapshot's file set
 * (PRD FR-4 — every file reference resolves, every concept ties to a related
 * file or M6 project-map node, every checklist item is concrete).
 *
 * Pure and total. The primary failure mode is an unresolved related-file
 * path: a unit that cites a path the snapshot does not contain is rejected
 * (`ok: false`), because rendering it would surface a broken link. Ungrounded
 * concepts and abstract checklist items are reported in `unresolved` for the
 * caller to surface, but they do **not** flip `ok` — the LLM's grounding
 * language is fuzzier than a path lookup, and false positives there would
 * reject otherwise-correct units.
 *
 * The check is the **reusable** validator the M7 generation call (#133)
 * runs at the generator boundary and the integration layer (#138) runs at
 * the integration boundary. Callers supply the inputs (no DB / network).
 *
 * @param unit - the learning unit (stored row or pre-persistence content).
 * @param snapshotFiles - the snapshot's file set (a `Set` of paths or a
 *                        `RepoTreeEntry[]` straight off `fileTree`).
 * @param projectMap - the M6 project map for the same snapshot, if any. When
 *                     omitted, concept grounding is checked against the
 *                     related files only — degrading gracefully (the epic's
 *                     "project map unavailable" path).
 */
export function verifyLearningUnitIntegrity(
  unit: VerifiableLearningUnit,
  snapshotFiles: LearningUnitSnapshotFiles,
  projectMap?: ProjectMap,
): LearningUnitIntegrityResult {
  const content = verifiableParts(unit)
  const files = resolveSnapshotFiles(snapshotFiles)
  const unresolved: UnresolvedRef[] = []

  // (1) Every related-file path must resolve.
  for (const related of content.relatedFiles) {
    if (!files.has(related.path)) {
      unresolved.push({
        kind: "related-file",
        value: related.path,
        reason: "Related file path does not resolve to a snapshot file.",
      })
    }
  }

  // (2) Every concept should tie to a related file or project-map node.
  for (const concept of content.concepts) {
    if (
      !isConceptGrounded(
        concept.name,
        concept.explanation,
        content.relatedFiles,
        projectMap,
      )
    ) {
      unresolved.push({
        kind: "ungrounded-concept",
        value: concept.name,
        reason: projectMap
          ? "Concept does not tie to a related file or project-map node."
          : "Concept does not tie to a related file (no project map supplied).",
      })
    }
  }

  // (3) Every checklist item should be concrete to this issue.
  for (const item of content.reviewChecklist) {
    if (!isChecklistItemConcrete(item.description, content.relatedFiles, content.concepts)) {
      unresolved.push({
        kind: "abstract-checklist-item",
        value: item.id,
        reason:
          "Checklist item references no related file or concept — too abstract.",
      })
    }
  }

  // `ok` is gated on the primary FR-4 failure mode (unresolved file refs).
  const ok = !unresolved.some((u) => u.kind === "related-file")
  return { ok, unresolved }
}

/**
 * Run {@link verifyLearningUnitIntegrity} for a stored unit, loading both the
 * unit and its snapshot's file tree from the database. The optional project
 * map is supplied by the caller; this wrapper does not load one — it stays
 * additive over the pure check.
 *
 * Returns `null` when the snapshot does not exist or no unit exists for the
 * given snapshot + source + issueRef — the caller distinguishes "nothing to
 * check" from a real integrity failure.
 */
export async function checkLearningUnitIntegrity(
  snapshotId: number,
  source: LearningUnit["source"],
  issueRef: string,
  projectMap?: ProjectMap,
  db?: CatalogDb,
): Promise<LearningUnitIntegrityResult | null> {
  const resolved = resolveDb(db)
  const unit = await getLearningUnit(snapshotId, source, issueRef, resolved)
  if (!unit) return null
  const snapshot = await getImportedRepoById(snapshotId, resolved)
  if (!snapshot) return null
  return verifyLearningUnitIntegrity(unit, snapshot.fileTree, projectMap)
}
