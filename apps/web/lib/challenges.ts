// Server-side data access + orchestration for the M9 Debug and Expansion
// Challenge System pages (debug-expansion-challenge epic, task #148).
//
// Wraps the M9 backend (`@workspace/db` — the `challenges` data-access layer,
// the file-reference integrity check, the bounded generation call, and the
// bounded grading call) and the M6 project-map data-access layer with an
// explicit DB path resolved from the web app's working directory. Maps the
// typed results onto serializable view shapes the `/repos/[owner]/[repo]/
// challenges` routes render. Mirrors `lib/diff-review.ts` and
// `lib/project-mapper.ts`.
//
// Imported only by server code (Server Components + Server Actions) — never by
// a Client Component. The Anthropic SDK is reached only here; CI / `pnpm
// build` run with no API key and never make a live call, because generation
// and grading are user-triggered actions, not load-time work.

import path from "node:path"

import type { LlmClient } from "@workspace/ai"
import {
  applicableChallengeTypes,
  type CatalogDb,
  type Challenge,
  type ChallengeAcceptanceCriterion,
  type ChallengeAttempt,
  type ChallengeAttemptSnippet,
  type ChallengeAttemptSubmission,
  ChallengeGradingIntegrityError,
  type ChallengeGradingResult,
  ChallengeIntegrityError,
  type ChallengeSourceReference,
  type ChallengeType,
  createCatalogDb,
  createChallengeAttempt,
  type FailingCiRun,
  generateChallenge,
  getChallengeById,
  getImportedRepo,
  getImportedRepoById,
  getLatestChallengeOutcome,
  getProjectMap,
  gradeChallenge,
  listChallengeAttempts,
  listChallengesBySnapshot,
  type ProjectMap,
  type WeakArea,
} from "@workspace/db"

export type { ChallengeType }

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function challengesDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(challengesDbFile())
  return cached
}

/* ── View shapes (serializable) ─────────────────────────────────────── */

/** Repo identity rendered in page headers (mirrors `lib/diff-review.ts`). */
export interface ChallengesRepoIdentity {
  owner: string
  repo: string
  /** The imported snapshot's ref/branch. */
  branch: string
}

/** Compact M8-shape latest outcome surfaced per row on the list (R5 / R4). */
export interface LatestOutcomeView {
  /** 0–100 numeric score (R4). */
  score: number
  /** Calm short band label — same M8 labels. */
  scoreBand: string
  /** ISO timestamp of when the latest attempt was submitted. */
  attemptedAt: string
}

/**
 * One challenge row as the Challenge List Page renders it. A row may be
 * "applicable, generated" (challengeId is non-null) or "applicable, not yet
 * generated" (challengeId is null — clicking opens the Detail Page which
 * triggers lazy-per-type generation per R2).
 */
export interface ChallengeListEntry {
  /** The `challenges` row id when generated, `null` when not yet generated. */
  challengeId: number | null
  /** The M9 challenge type. */
  type: ChallengeType
  /** Plain-language label for the type ("Add a small field", …). */
  typeLabel: string
  /** One-line plain-language task summary; `null` until generated. */
  taskSummary: string | null
  /** In-scope file paths from the M6 project map (US-1 / R8). */
  targetFiles: string[]
  /** Latest attempt's 0–100 outcome (R5), or `null` when never attempted. */
  latestOutcome: LatestOutcomeView | null
  /** ISO timestamp of when the row was generated; `null` until generated. */
  generatedAt: string | null
}

/** What the Challenge List Page loads (per #144's Page Spec §5). */
export interface ChallengeListPageData {
  /** Whether the repo has an imported snapshot at all. */
  snapshotExists: boolean
  /** Whether the snapshot has a M6 project map (gates challenges). */
  projectMapExists: boolean
  /** Repo identity; `null` when the repo is not imported. */
  identity: ChallengesRepoIdentity | null
  /** One entry per applicable challenge type. */
  entries: ChallengeListEntry[]
}

/** A `ChallengeAttemptSnippet` as the UI renders it (serializable). */
export type ChallengeSnippetView = ChallengeAttemptSnippet

/** One stored attempt projected for the Detail Page (R5 prior attempts). */
export interface ChallengeAttemptView {
  id: number
  /** ISO timestamp. */
  submittedAt: string
  explanation: string
  filePaths: string[]
  snippets: ChallengeSnippetView[]
  /** The grading result; `null` only mid-flight (transient). */
  grading: ChallengeGradingResult | null
}

/** One in/out-of-scope file entry as the Detail Page renders it. */
export interface ScopeEntryView {
  path: string
}

/**
 * One stored challenge projected for the Detail Page (per #145's Page Spec
 * §5). Every file path resolves to a real M6 project-map-named path (R8 /
 * FR-6) — guaranteed by the integrity check (#141).
 */
export interface ChallengeDetailView {
  challengeId: number
  identity: ChallengesRepoIdentity
  type: ChallengeType
  typeLabel: string
  taskDescription: string
  inScope: ScopeEntryView[]
  outOfScope: ScopeEntryView[]
  acceptanceCriteria: ChallengeAcceptanceCriterion[]
  sourceReferences: ChallengeSourceReference[]
  /** ISO timestamp the challenge was generated. */
  generatedAt: string
  /** ISO timestamp the challenge row was last updated. */
  updatedAt: string
  /** The full attempt history, most-recent first (R5). */
  attempts: ChallengeAttemptView[]
  /** The union of every M6-named path the picker may offer (R8 / FR-4). */
  m6Paths: string[]
}

/* ── Error model ────────────────────────────────────────────────────── */

/** The coarse error kinds the M9 UI renders. */
export type ChallengeErrorKind =
  | "not-imported"
  | "no-project-map"
  | "challenge-not-found"
  | "type-not-applicable"
  | "missing-api-key"
  | "llm-failure"
  | "integrity-failure"
  | "unknown"

/** Discriminated result for "generate or open a challenge by type". */
export type GenerateChallengeActionResult =
  | { ok: true; challengeId: number; cached: boolean }
  | { ok: false; error: { kind: ChallengeErrorKind; message: string } }

/** Discriminated result for "submit an answer and grade it". */
export type SubmitAttemptActionResult =
  | { ok: true; attempt: ChallengeAttemptView }
  | { ok: false; error: { kind: ChallengeErrorKind; message: string } }

/* ── Type-label helpers ─────────────────────────────────────────────── */

const TYPE_LABELS: Record<ChallengeType, string> = {
  "add-small-field": "Add a small field",
  "trace-failed-api-call": "Trace a failed API call",
  "fix-schema-mismatch": "Fix a schema mismatch",
  "add-loading-error-state": "Add a loading / error state",
  "add-unit-test": "Add a unit test",
  "explain-broken-ci-result": "Explain a broken CI result",
  "extend-module-safely": "Extend a module safely",
}

/** Human-readable label for a challenge type (defaults to the enum value). */
export function challengeTypeLabel(type: ChallengeType): string {
  return TYPE_LABELS[type] ?? type
}

/**
 * Calm score-band label (mirrors `apps/web/app/reviews/r/[id]/_components/
 * score-weak-area.tsx`, the M8 shape per R4).
 */
export function scoreBand(score: number): string {
  if (score >= 80) return "Solid grasp"
  if (score >= 55) return "Getting there"
  if (score >= 30) return "Needs review"
  return "Worth re-studying"
}

/* ── Projection helpers ─────────────────────────────────────────────── */

/** Project a stored grading row onto the latest-outcome view shape. */
function toLatestOutcomeView(
  grading: ChallengeGradingResult,
  attemptedAt: Date,
): LatestOutcomeView {
  return {
    score: grading.score,
    scoreBand: scoreBand(grading.score),
    attemptedAt: attemptedAt.toISOString(),
  }
}

/** Project a stored attempt onto the page view. */
function toAttemptView(row: ChallengeAttempt): ChallengeAttemptView {
  return {
    id: row.id,
    submittedAt: row.submittedAt.toISOString(),
    explanation: row.explanation,
    filePaths: row.filePaths,
    snippets: row.snippets,
    grading: row.grading ?? null,
  }
}

/** The union of every M6-mapped path the snippet/file picker may offer (R8). */
function collectMapPaths(
  challenge: Challenge,
  projectMap: ProjectMap,
): string[] {
  const seen = new Set<string>()
  for (const file of projectMap.keyFileMap) seen.add(file.path)
  // Also surface in-scope / out-of-scope / source-ref paths even if the
  // M6 map is later trimmed — the integrity check guaranteed they were
  // M6-named at persistence time (R8). Adding them defensively keeps the
  // picker non-empty if the map drifts after the challenge was generated.
  for (const p of challenge.inScopeFiles) seen.add(p)
  for (const p of challenge.outOfScopeFiles) seen.add(p)
  for (const r of challenge.sourceReferences) seen.add(r.path)
  return [...seen].sort((a, b) => a.localeCompare(b))
}

/* ── Read paths (Server Components) ─────────────────────────────────── */

/**
 * Load what the Challenge List Page renders for a repo. Reads the cached
 * `challenges` rows for the snapshot and joins each with its latest-outcome
 * row (R5). The list view never triggers SDK generation — it returns one
 * entry per applicable type whether or not a row has been generated yet
 * (R2 — the Detail Page is what triggers generation).
 *
 * @param owner - the repository owner from the URL.
 * @param repo - the repository name from the URL.
 * @param database - optional injected DB (tests); omitted → package default.
 */
export async function getChallengeListPageData(
  owner: string,
  repo: string,
  database?: CatalogDb,
): Promise<ChallengeListPageData> {
  const resolved = database ?? db()
  const snapshot = await getImportedRepo(owner, repo, undefined, resolved)
  if (!snapshot) {
    return {
      snapshotExists: false,
      projectMapExists: false,
      identity: null,
      entries: [],
    }
  }
  const identity: ChallengesRepoIdentity = {
    owner: snapshot.owner,
    repo: snapshot.repo,
    branch: snapshot.ref,
  }
  const projectMap = await getProjectMap(snapshot.id, resolved)
  if (!projectMap) {
    return {
      snapshotExists: true,
      projectMapExists: false,
      identity,
      entries: [],
    }
  }

  // Applicable types come from the generation module — same source as the
  // generator's runtime gating (R1 / R6). The broken-CI type is gated on a
  // real failing CI run; until M11 surfaces those it is omitted.
  const applicable = applicableChallengeTypes(projectMap)

  const stored = await listChallengesBySnapshot(snapshot.id, resolved)
  const storedByType = new Map<ChallengeType, Challenge>()
  for (const c of stored) storedByType.set(c.type, c)

  const entries: ChallengeListEntry[] = await Promise.all(
    applicable.map(async (type) => {
      const cached = storedByType.get(type) ?? null
      if (!cached) {
        return {
          challengeId: null,
          type,
          typeLabel: challengeTypeLabel(type),
          taskSummary: null,
          // No generated row yet — show the M6-mapped key files as the
          // candidate target set the generator will draw from. This is the
          // "applicable, not yet generated" state per the Page Spec §5.
          targetFiles: projectMap.keyFileMap
            .map((f) => f.path)
            .slice(0, 3),
          latestOutcome: null,
          generatedAt: null,
        }
      }
      const outcome = await getLatestChallengeOutcome(cached.id, resolved)
      const latestOutcome =
        outcome.attempt && outcome.grading
          ? toLatestOutcomeView(outcome.grading, outcome.attempt.submittedAt)
          : null
      return {
        challengeId: cached.id,
        type,
        typeLabel: challengeTypeLabel(type),
        taskSummary: cached.taskDescription,
        targetFiles: cached.inScopeFiles,
        latestOutcome,
        generatedAt: cached.createdAt.toISOString(),
      }
    }),
  )

  return {
    snapshotExists: true,
    projectMapExists: true,
    identity,
    entries,
  }
}

/**
 * Load what the Challenge Detail Page renders for a single challenge id. The
 * full attempt history is loaded server-side so the inline collapsible prior-
 * attempts panel (R5) is renderable as one server response. Returns `null`
 * when the challenge id does not resolve (the page renders `notFound()`).
 */
export async function getChallengeDetailView(
  challengeId: number,
  database?: CatalogDb,
): Promise<ChallengeDetailView | null> {
  const resolved = database ?? db()
  const challenge = await getChallengeById(challengeId, resolved)
  if (!challenge) return null

  const projectMap = await getProjectMap(challenge.snapshotId, resolved)
  if (!projectMap) return null

  const snapshotRow = await getImportedRepoById(
    challenge.snapshotId,
    resolved,
  )
  if (!snapshotRow) return null

  const identity: ChallengesRepoIdentity = {
    owner: snapshotRow.owner,
    repo: snapshotRow.repo,
    branch: snapshotRow.ref,
  }

  const attemptRows = await listChallengeAttempts(challenge.id, resolved)
  // listChallengeAttempts returns oldest first; the Detail Page wants
  // most-recent first per R5. Reverse rather than re-query for stability.
  const attemptsNewestFirst = [...attemptRows].reverse()

  return {
    challengeId: challenge.id,
    identity,
    type: challenge.type,
    typeLabel: challengeTypeLabel(challenge.type),
    taskDescription: challenge.taskDescription,
    inScope: challenge.inScopeFiles.map((p) => ({ path: p })),
    outOfScope: challenge.outOfScopeFiles.map((p) => ({ path: p })),
    acceptanceCriteria: challenge.acceptanceCriteria,
    sourceReferences: challenge.sourceReferences,
    generatedAt: challenge.createdAt.toISOString(),
    updatedAt: challenge.updatedAt.toISOString(),
    attempts: attemptsNewestFirst.map(toAttemptView),
    m6Paths: collectMapPaths(challenge, projectMap),
  }
}

/* ── Write paths (Server Actions) ───────────────────────────────────── */

/**
 * Generate (or read from cache) a challenge of a given type for a snapshot.
 * Called from the Challenge List Page's "open this type" action — the first
 * open of a category triggers generation; subsequent opens read the cached
 * row (R2 / FR-1). The `forceRegenerate` flag is the "new challenge" UI
 * action; it re-invokes the SDK and overwrites the cached row.
 *
 * Returns the challenge id on success so the caller can route to
 * `/repos/[owner]/[repo]/challenges/[challengeId]`. Expected failures are
 * returned as `{ ok: false }` — never thrown — so the page renders a calm
 * inline error.
 *
 * The integrity check (#141) is run server-side by `generateChallenge`; an
 * integrity rejection throws `ChallengeIntegrityError`, which this wrapper
 * catches and surfaces as an explicit `integrity-failure` (the user sees an
 * error state, not a silent render — task #148 acceptance criterion).
 */
export async function generateChallengeForType(
  owner: string,
  repo: string,
  type: ChallengeType,
  options?: {
    forceRegenerate?: boolean
    failingCiRun?: FailingCiRun
    /** Injectable for tests (mock transport); production uses the default. */
    client?: LlmClient
  },
  database?: CatalogDb,
): Promise<GenerateChallengeActionResult> {
  const resolved = database ?? db()

  try {
    const result = await generateChallenge(
      {
        owner,
        repo,
        type,
        ...(options?.failingCiRun ? { failingCiRun: options.failingCiRun } : {}),
        ...(options?.client ? { client: options.client } : {}),
        db: resolved,
      },
      { forceRegenerate: options?.forceRegenerate ?? false },
    )
    if (!result.ok) {
      const kind = result.error.kind
      if (
        kind === "llm_error" &&
        result.error.cause?.kind === "missing_api_key"
      ) {
        return {
          ok: false,
          error: {
            kind: "missing-api-key",
            message: result.error.cause.message,
          },
        }
      }
      if (kind === "snapshot_not_found") {
        return {
          ok: false,
          error: { kind: "not-imported", message: result.error.message },
        }
      }
      if (kind === "project_map_not_found") {
        return {
          ok: false,
          error: { kind: "no-project-map", message: result.error.message },
        }
      }
      if (kind === "type_not_applicable") {
        return {
          ok: false,
          error: {
            kind: "type-not-applicable",
            message: result.error.message,
          },
        }
      }
      return {
        ok: false,
        error: { kind: "llm-failure", message: result.error.message },
      }
    }
    return {
      ok: true,
      challengeId: result.data.challenge.id,
      cached: result.data.cached,
    }
  } catch (error) {
    if (error instanceof ChallengeIntegrityError) {
      return {
        ok: false,
        error: {
          kind: "integrity-failure",
          message:
            "The generated challenge referenced files outside the project " +
            "map. The candidate was rejected — try again.",
        },
      }
    }
    return {
      ok: false,
      error: {
        kind: "unknown",
        message:
          error instanceof Error
            ? error.message
            : "Could not generate this challenge.",
      },
    }
  }
}

/**
 * Persist a new attempt on a challenge and run the bounded grading call
 * against it (R3 / R4 / FR-5). Returns the updated attempt view with the
 * grading filled in. Expected failures are returned as `{ ok: false }` so
 * the Debug Walkthrough UI can offer a calm "try again" without losing the
 * user's typed explanation.
 *
 * The integrity check (#141) runs server-side inside `gradeChallenge`; an
 * integrity rejection throws `ChallengeGradingIntegrityError`, which this
 * wrapper catches and surfaces as an explicit `integrity-failure` — never a
 * silent render (task #148 acceptance criterion).
 */
export async function submitChallengeAttempt(
  challengeId: number,
  submission: ChallengeAttemptSubmission,
  database?: CatalogDb,
  options?: {
    /** Injectable for tests (mock transport); production uses the default. */
    client?: LlmClient
  },
): Promise<SubmitAttemptActionResult> {
  const resolved = database ?? db()

  const challenge = await getChallengeById(challengeId, resolved)
  if (!challenge) {
    return {
      ok: false,
      error: {
        kind: "challenge-not-found",
        message: `No challenge with id ${challengeId}.`,
      },
    }
  }

  // 1. Persist the attempt — US-3 / FR-9: the answer is durable before the
  //    grading call runs, so a failure of the grading leg never loses work.
  const attempt = await createChallengeAttempt(
    challenge.id,
    submission,
    resolved,
  )

  // 2. Bounded grading call (R3 / R4 / FR-5).
  try {
    const result = await gradeChallenge({
      challenge,
      attempt,
      ...(options?.client ? { client: options.client } : {}),
      db: resolved,
    })
    if (!result.ok) {
      const kind = result.error.kind
      if (
        kind === "llm_error" &&
        result.error.cause?.kind === "missing_api_key"
      ) {
        return {
          ok: false,
          error: {
            kind: "missing-api-key",
            message: result.error.cause.message,
          },
        }
      }
      if (kind === "project_map_not_found") {
        return {
          ok: false,
          error: { kind: "no-project-map", message: result.error.message },
        }
      }
      if (kind === "challenge_not_found") {
        return {
          ok: false,
          error: {
            kind: "challenge-not-found",
            message: result.error.message,
          },
        }
      }
      return {
        ok: false,
        error: { kind: "llm-failure", message: result.error.message },
      }
    }
    return { ok: true, attempt: toAttemptView(result.data.attempt) }
  } catch (error) {
    if (error instanceof ChallengeGradingIntegrityError) {
      return {
        ok: false,
        error: {
          kind: "integrity-failure",
          message:
            "Grading referenced files outside the project map. The grade " +
            "was rejected — your answer is saved; try again.",
        },
      }
    }
    return {
      ok: false,
      error: {
        kind: "unknown",
        message:
          error instanceof Error
            ? error.message
            : "Could not grade this attempt.",
      },
    }
  }
}

/* ── Internal types re-export (test-only convenience) ──────────────── */

export type {
  Challenge,
  ChallengeAcceptanceCriterion,
  ChallengeAttempt,
  ChallengeAttemptSnippet,
  ChallengeAttemptSubmission,
  ChallengeGradingResult,
  ChallengeSourceReference,
  WeakArea,
}
