// File-reference integrity check for M9 Debug and Expansion Challenges
// (debug-expansion-challenge PRD FR-6, R8; Issue #141).
//
// This is the project-grounding guard that keeps M9 honest: every file/module
// path a generated challenge or a grading output names must resolve to a file
// the M6 project map explicitly lists (R8). It is the M9 analogue of the M6
// `checkProjectMapFileReferences` (#106) — but the authoritative set is the
// narrower M6-named set, not the raw snapshot tree, because R8 binds M9 to the
// files M6 intentionally surfaced.
//
// Pure and synchronous. Imported by:
//   - the M9 generation pipeline (#142): called on every generated challenge
//     before persistence; a rejection means the generator hallucinated a path
//     M6 did not name and the candidate is thrown away.
//   - the M9 grading pipeline (#143): called on every grading output before
//     persistence; a rejection means the grader fabricated a file reference
//     and the output is thrown away (FR-6).
//
// No DB, no SDK, no network. The module deliberately depends only on a
// project-map *shape* (`keyFileMap[].path` is the authoritative set) so it
// does not couple to the M9 data-access layer (#140) — both callers can
// import this module without cycles. Style mirrors the M6 integrity check
// in `../mapper/project-maps.ts`.
//
// R8 normative: a path is accepted iff `projectMap.keyFileMap` explicitly
// lists it. Adjacent-file inference (test files, `.d.ts` files, `index.ts`
// barrels, sibling type files) is **rejected**, even though those files
// likely exist in the snapshot. The M6 map is the narrower intentional set
// and that is what M9 must defer to.
//
// FR-7 boundary: this module is the *integrity* check, not a grader. It
// neither scores the candidate nor judges its prose — it only proves every
// file reference resolves to a M6-named path. The grading call (#143) does
// the actual scoring.

import type { ProjectMapFile } from "../schema"

// ---------------------------------------------------------------------------
// Candidate shapes
// ---------------------------------------------------------------------------
//
// The two candidate shapes — a generated challenge and a grading output —
// are typed here as the minimal structural interfaces this module reads.
// They are intentionally narrower than the eventual stored rows in #140
// (`challenges` / `challenge_attempts`): this module only cares about the
// file-reference-bearing fields. Both callers (#142, #143) pass their
// in-flight candidate before the row is persisted, so reading the storage
// types here would force a cycle and pin this module to the schema layout.

/**
 * The minimal shape of an in-flight generated challenge this module
 * validates: type, in/out-of-scope file sets, and acceptance criteria that
 * may name files.
 *
 * R8 normative — both `inScope` and `outOfScope` are strictly limited to
 * files the M6 project map explicitly names. The generator may not infer
 * adjacent files (`.test.ts`, `.d.ts`, `index.ts`, sibling types) into
 * either set.
 */
export interface CandidateChallenge {
  /**
   * Identifies the candidate as a challenge. Set this to `"challenge"` —
   * the discriminator is what lets the validator dispatch on shape without
   * trying both branches.
   */
  kind: "challenge"
  /**
   * Paths the challenge expects the user to touch. Each path must be an M6
   * project-map-named file (R8 / FR-3).
   */
  inScope: string[]
  /**
   * Paths the challenge explicitly forbids the user from touching. Each
   * path must be an M6 project-map-named file (R8 / FR-3) — the
   * out-of-scope set is for naming *real* nearby files the user should
   * leave alone, not for inventing fictitious paths.
   */
  outOfScope: string[]
  /**
   * Acceptance criteria the grader will check the user's explanation
   * against. Criteria may optionally name files that bound the criterion;
   * any path named must be in the M6 map.
   */
  acceptanceCriteria?: AcceptanceCriterion[]
}

/** One acceptance criterion in a generated challenge. */
export interface AcceptanceCriterion {
  /** A short label or identifier for the criterion, free of file paths. */
  id?: string
  /** The criterion in plain language. */
  description: string
  /** Files this criterion is scoped to, if any. Each must be M6-named. */
  paths?: string[]
}

/**
 * The minimal shape of an in-flight grading output this module validates:
 * per-criterion results that may name files plus a free-text feedback
 * paragraph that may mention files in prose.
 *
 * R8 / FR-6 normative — every file reference, whether listed in a
 * per-criterion result or mentioned in feedback prose, must resolve to an
 * M6-named file.
 */
export interface CandidateGrading {
  /**
   * Identifies the candidate as a grading output. Set this to `"grading"`.
   */
  kind: "grading"
  /** Per-criterion results matching the challenge's acceptance criteria. */
  perCriterion: PerCriterionResult[]
  /**
   * Short free-text feedback paragraph that may mention files. The
   * validator extracts path-shaped tokens (containing `/`) from this prose
   * and rejects any that are not M6-named.
   */
  feedback?: string
}

/** One per-criterion result inside a grading output. */
export interface PerCriterionResult {
  /** Which acceptance criterion this result is for. */
  criterionId?: string
  /** Short verdict — passed / partially / missed, etc. — for the criterion. */
  verdict: string
  /**
   * Files the grader explicitly named for this criterion (e.g. "the user
   * correctly identified `apps/web/app/page.tsx`"). Each must be M6-named.
   */
  paths?: string[]
}

/** Either kind of in-flight M9 candidate the validator accepts. */
export type IntegrityCandidate = CandidateChallenge | CandidateGrading

// ---------------------------------------------------------------------------
// Project-map view
// ---------------------------------------------------------------------------

/**
 * The minimal view of a M6 project map this validator reads. The
 * authoritative set per R8 is the `keyFileMap[].path` list — those are the
 * files M6 intentionally surfaced for the snapshot. Re-using the
 * `ProjectMapFile` type from the schema means generation (#142) and grading
 * (#143) can hand the full M6 `ProjectMap` row through unchanged.
 */
export interface ProjectMapView {
  /** Files the M6 project map explicitly named. */
  keyFileMap: ProjectMapFile[]
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** Where an unresolved file reference came from in the candidate. */
export type UnresolvedOrigin =
  | "inScope"
  | "outOfScope"
  | "acceptanceCriterion"
  | "perCriterion"
  | "feedback"

/** One file reference in the candidate that the M6 map does not name. */
export interface UnresolvedRef {
  /** The candidate field the offending reference came from. */
  origin: UnresolvedOrigin
  /** The path that does not resolve to an M6-named file. */
  path: string
  /**
   * For per-criterion / acceptance-criterion origins, the criterion's id
   * (if the candidate provided one) so the caller can name which criterion
   * is at fault.
   */
  criterionId?: string
}

/** The outcome of {@link verifyChallengeIntegrity}. */
export interface IntegrityCheckResult {
  /** True when every file reference in the candidate is M6-named. */
  ok: boolean
  /** Every reference that did not resolve. Empty when `ok` is true. */
  unresolved: UnresolvedRef[]
}

// ---------------------------------------------------------------------------
// Path extraction from prose
// ---------------------------------------------------------------------------

/**
 * Path-shaped tokens we will pull out of feedback prose. A token is treated
 * as a candidate path when it:
 *   - contains at least one `/` (so a bare word like "page" is not a path),
 *   - contains no whitespace,
 *   - matches a path-character set (letters, digits, `.`, `_`, `-`, `/`).
 *
 * The negative lookbehind keeps the match from starting mid-token after a
 * path character (`\w`, `/`, `.`, `-`) — that excludes the `nextjs.org/docs`
 * tail of a URL (preceded by `/`) and the `org/docs` tail of any host/path
 * combination. URLs are further rejected post-hoc by the `://` check below
 * as a defence in depth.
 *
 * Surrounding backticks are stripped by the optional `\`` groups, and a
 * trailing sentence period is stripped post-hoc — Markdown-style citations
 * like `\`apps/web/page.tsx\`` and mid-sentence references like
 * `apps/web/page.tsx,` or `apps/web/page.tsx.` are common in LLM prose and
 * we don't want trailing punctuation to fail a real reference.
 *
 * The regex is intentionally conservative. Anything resembling a path in
 * the prose is validated; if it's not in the M6 map, the candidate is
 * rejected. The cost of a false positive (a path-shaped token that wasn't
 * really a file reference) is low — the prose is a few sentences and a
 * generator that produces non-path tokens with slashes is itself a bug.
 */
const PATH_TOKEN = /(?<![\w/.-])`?([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+)`?/g

/** Trailing punctuation we strip from a captured path token. */
const TRAILING_PUNCT = /[.,;:)\]]+$/

/**
 * Extract path-shaped tokens from a free-text prose paragraph. Returns each
 * distinct token in the order it first appears, with surrounding backticks
 * and trailing punctuation stripped.
 */
function extractPathsFromProse(prose: string): string[] {
  if (prose.trim() === "") return []
  const seen = new Set<string>()
  const paths: string[] = []
  for (const match of prose.matchAll(PATH_TOKEN)) {
    const raw = match[1]
    if (raw === undefined) continue
    if (raw.includes("://")) continue
    const trimmed = raw.replace(TRAILING_PUNCT, "")
    if (trimmed === "" || !trimmed.includes("/")) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    paths.push(trimmed)
  }
  return paths
}

// ---------------------------------------------------------------------------
// Core validator
// ---------------------------------------------------------------------------

/**
 * Verify every file reference in an in-flight M9 candidate against the M6
 * project map's named-file set (R8 + FR-6).
 *
 * Pure and synchronous. The validator never throws on a malformed
 * candidate — it just reports the offending references. Callers
 * (#142 generation, #143 grading) treat any non-empty `unresolved` list as
 * a rejection and discard the candidate before persistence.
 *
 * Adjacent-file inference is **not** allowed: a path that exists in the
 * snapshot but is not in `projectMap.keyFileMap` still fails. The M6 map
 * is the narrower intentional set per R8.
 *
 * @param candidate - the in-flight generated challenge or grading output.
 * @param projectMap - the M6 project map for the snapshot the candidate is
 *   tied to. Only `keyFileMap[].path` is read.
 */
export function verifyChallengeIntegrity(
  candidate: IntegrityCandidate,
  projectMap: ProjectMapView,
): IntegrityCheckResult {
  const allowed = new Set(projectMap.keyFileMap.map((file) => file.path))
  const unresolved: UnresolvedRef[] = []

  if (candidate.kind === "challenge") {
    for (const path of candidate.inScope) {
      if (!allowed.has(path)) {
        unresolved.push({ origin: "inScope", path })
      }
    }
    for (const path of candidate.outOfScope) {
      if (!allowed.has(path)) {
        unresolved.push({ origin: "outOfScope", path })
      }
    }
    for (const criterion of candidate.acceptanceCriteria ?? []) {
      for (const path of criterion.paths ?? []) {
        if (!allowed.has(path)) {
          unresolved.push({
            origin: "acceptanceCriterion",
            path,
            ...(criterion.id !== undefined && { criterionId: criterion.id }),
          })
        }
      }
    }
  } else {
    for (const result of candidate.perCriterion) {
      for (const path of result.paths ?? []) {
        if (!allowed.has(path)) {
          unresolved.push({
            origin: "perCriterion",
            path,
            ...(result.criterionId !== undefined && {
              criterionId: result.criterionId,
            }),
          })
        }
      }
    }
    if (candidate.feedback !== undefined) {
      for (const path of extractPathsFromProse(candidate.feedback)) {
        if (!allowed.has(path)) {
          unresolved.push({ origin: "feedback", path })
        }
      }
    }
  }

  return { ok: unresolved.length === 0, unresolved }
}
