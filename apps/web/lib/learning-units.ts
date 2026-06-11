// Server-side data access + orchestration for the M7 Issue Learning Workspace
// pages (issue-based-learning-workspace epic, task #138).
//
// Wraps the M7 backend (`@workspace/db/learning-units` — the typed data-access
// layer, the bounded generation call, the bounded grading call, and the
// FR-4 file-reference integrity check) and the extended M11 GitHub client
// (`@workspace/db/github` — `listIssues`, `fetchIssue`,
// `normalizeIssueToLearningUnitInput`, `listCcpmTasks`, `fetchCcpmTask`) with
// an explicit DB path resolved from the web app's working directory. Maps the
// typed results onto the serializable view shapes the `/repos/[owner]/[repo]/`
// routes render. Mirrors `lib/diff-review.ts` / `lib/project-mapper.ts`.
//
// Imported only by server code (Server Components + Server Actions) — never by
// a Client Component. The Anthropic SDK and the GitHub client are reached only
// here; CI / `pnpm build` run with no API key and never make a live call,
// because generation and grading are user-triggered actions (the page first
// reads an existing row; generation happens on explicit POST), not load-time
// work.

import path from "node:path"

import {
  type CatalogDb,
  createCatalogDb,
  createGitHubClient,
  fetchCcpmTask,
  fetchIssue,
  getImportedRepo,
  getImportedRepoById,
  getProjectMapByRepo,
  type IssueModel,
  type LearningUnitInput,
  listCcpmTasks,
  listIssues,
  normalizeIssueToLearningUnitInput,
} from "@workspace/db"
import {
  createLearningUnit,
  generateLearningUnit,
  type GenerateLearningUnitResult,
  getLearningUnit,
  getLearningUnitById,
  gradeLearningUnit,
  listLearningUnits,
  recordAnswers,
  recordScore,
  type UnderstandingAnswer,
  updateChecklistState,
  verifyLearningUnitIntegrity,
} from "@workspace/db/learning-units"
import type {
  AgentExecutionStep,
  ChecklistItemState,
  LearningConcept,
  LearningUnit,
  LearningWeakArea,
  ProjectMap,
  RelatedFile,
  RepoFile,
  RepoSnapshot,
  RepoTreeEntry,
  ReviewChecklistItem,
  UnderstandingQuestion,
  UnderstandingScore,
} from "@workspace/db/schema"

import { listRepoFiles } from "@workspace/db"

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function learningUnitsDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(learningUnitsDbFile())
  return cached
}

/* ── View shapes (serializable) ─────────────────────────────────────── */

/**
 * One imported repository as the `/repos` chooser renders it. Mirrors the M8
 * `ChooserRepo` shape so the chooser pages across milestones feel like one
 * product.
 */
export interface RepoIdentity {
  owner: string
  repo: string
  /** The imported ref/branch. */
  branch: string
}

/** The compact per-row learning-unit summary for the issues list (FR-11, R5). */
export interface LearningUnitSummary {
  /** Join key against `LearningUnitInput.issueRef`. */
  issueRef: string
  /** Where the unit came from (R1). */
  source: "github-issue" | "ccpm-task"
  /** Three-state badge: not started / in progress / scored (R6). */
  status: "not started" | "in progress" | "scored"
  /** ISO timestamp of the unit's last update; `null` when no unit exists. */
  lastUpdatedAt: string | null
}

/**
 * One issue row as the Per-repo Issues List page renders it (FR-11, R5). A
 * GitHub issue and a CCPM task share this shape (R1).
 */
export interface IssueRowView {
  source: "github-issue" | "ccpm-task"
  issueRef: string
  title: string
  labels: string[]
  state: "open" | "closed"
  linkedPrs: number[]
  /** Where to navigate the user. */
  href: string
  /** The per-row learning-unit status badge. */
  status: LearningUnitSummary["status"]
  lastUpdatedAt: string | null
}

/** Data the Per-repo Issues List page Server Component loads. */
export interface IssuesPageData {
  snapshotExists: boolean
  identity: RepoIdentity | null
  /** All issues + CCPM tasks for the repo, joined with learning-unit status. */
  rows: IssueRowView[]
  /** `true` when GitHub fetching failed (rate limit / auth / network). */
  fetchFailed: boolean
  /** Human-readable explanation of the fetch failure, when applicable. */
  fetchError: string | null
  /** `true` when the live issue list was truncated by the M11 client cap. */
  truncated: boolean
}

/** A `RelatedFile` with a flag for whether its path resolves in the snapshot. */
export interface RelatedFileView extends RelatedFile {
  resolved: boolean
}

/** A `ChecklistItemState` keyed view for the UI to seed checkbox values. */
export type ChecklistStateMap = Record<string, boolean>

/** The full learning-unit shape rendered by the Issue Learning Workspace. */
export interface LearningUnitView {
  id: number
  source: "github-issue" | "ccpm-task"
  issueRef: string
  /** The original issue / task title. */
  issueTitle: string
  /** When the source is a GitHub issue, the issue's HTML URL; `null` otherwise. */
  issueUrl: string | null
  /** Open / closed (carried from the input — informational header context). */
  issueState: "open" | "closed" | null
  /** Linked PR numbers carried from the input — informational only. */
  linkedPrs: number[]
  /** The repo identity for back-link / external link rendering. */
  repo: { owner: string; name: string; branch: string }
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string

  /* The six generated outputs. */
  restatedGoal: string
  relatedFiles: RelatedFileView[]
  concepts: LearningConcept[]
  agentExecutionNotes: AgentExecutionStep[]
  reviewChecklist: ReviewChecklistItem[]
  questions: UnderstandingQuestion[]

  /* The user-mutable JSON columns. */
  userAnswers: UnderstandingAnswer[] | null
  score: UnderstandingScore | null
  weakAreas: LearningWeakArea[] | null
  checklistState: ChecklistStateMap

  /* Integrity check result (FR-4). */
  integrity: {
    ok: boolean
    unresolved: {
      kind: "related-file" | "ungrounded-concept" | "abstract-checklist-item"
      value: string
      reason: string
    }[]
  }
}

/** The discriminated result of "load a learning unit for a route". */
export type LearningUnitViewResult =
  | { ok: true; unit: LearningUnitView }
  | { ok: false; reason: "not-imported" | "no-input-found" | "load-failed"; message: string }

/* ── Error model ────────────────────────────────────────────────────── */

/** The coarse error kinds the M7 server actions surface to the UI. */
export type LearningUnitErrorKind =
  | "not-imported"
  | "missing-api-key"
  | "missing-input"
  | "github-failure"
  | "integrity-failed"
  | "llm-failure"
  | "no-questions"
  | "unknown"

/** Discriminated result of the "ensure a learning unit exists" server action. */
export type EnsureUnitActionResult =
  | { ok: true; unitId: number }
  | { ok: false; error: { kind: LearningUnitErrorKind; message: string } }

/** Discriminated result of the "grade answers" server action. */
export type GradeUnitActionResult =
  | { ok: true; unit: LearningUnitView }
  | { ok: false; error: { kind: LearningUnitErrorKind; message: string } }

/** Discriminated result of the "toggle a checklist item" server action. */
export type ChecklistToggleResult =
  | { ok: true; checklistState: ChecklistStateMap }
  | { ok: false; error: { kind: LearningUnitErrorKind; message: string } }

/* ── Projection helpers ─────────────────────────────────────────────── */

/**
 * Project an array of `ChecklistItemState` into a `Record<itemId, checked>`
 * the UI can index by checklist-item id. A missing entry means unticked
 * (R4 — checklist is display-only).
 */
function checklistStateToMap(
  state: ChecklistItemState[] | null | undefined,
): ChecklistStateMap {
  const map: ChecklistStateMap = {}
  for (const entry of state ?? []) {
    map[entry.itemId] = entry.checked
  }
  return map
}

/** Project a `ChecklistStateMap` back into the schema's `ChecklistItemState[]`. */
function mapToChecklistState(map: ChecklistStateMap): ChecklistItemState[] {
  return Object.entries(map).map(([itemId, checked]) => ({ itemId, checked }))
}

/** Project a stored `LearningUnit` row + snapshot onto the page view. */
function toUnitView(
  unit: LearningUnit,
  snapshot: RepoSnapshot,
  projectMap: ProjectMap | null,
  input: LearningUnitInput | null,
): LearningUnitView {
  const integrity = verifyLearningUnitIntegrity(
    unit,
    snapshot.fileTree,
    projectMap ?? undefined,
  )
  const filePathSet = new Set(
    snapshot.fileTree
      .filter((e) => e.type === "blob")
      .map((e) => e.path),
  )
  const relatedFiles: RelatedFileView[] = unit.relatedFiles.map((f) => ({
    ...f,
    resolved: filePathSet.has(f.path),
  }))

  return {
    id: unit.id,
    source: unit.source,
    issueRef: unit.issueRef,
    issueTitle: input?.title ?? unit.restatedGoal.slice(0, 80),
    issueUrl: input?.source === "github-issue"
      ? `https://github.com/${snapshot.owner}/${snapshot.repo}/issues/${unit.issueRef.replace(/^#/, "")}`
      : null,
    issueState: input?.state ?? null,
    linkedPrs: input?.linkedPrs ?? [],
    repo: { owner: snapshot.owner, name: snapshot.repo, branch: snapshot.ref },
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
    restatedGoal: unit.restatedGoal,
    relatedFiles,
    concepts: unit.concepts,
    agentExecutionNotes: unit.agentExecutionNotes,
    reviewChecklist: unit.reviewChecklist,
    questions: unit.questions,
    userAnswers: unit.userAnswers ?? null,
    score: unit.score ?? null,
    weakAreas: unit.weakAreas ?? null,
    checklistState: checklistStateToMap(unit.checklistState),
    integrity,
  }
}

/** Derive a three-state status badge from a stored `LearningUnit`. */
function deriveStatus(
  unit: LearningUnit | null,
): LearningUnitSummary["status"] {
  if (!unit) return "not started"
  if (unit.score !== null && unit.score !== undefined) return "scored"
  const hasAnswers = (unit.userAnswers?.length ?? 0) > 0
  const hasChecks = (unit.checklistState ?? []).some((s) => s.checked)
  if (hasAnswers || hasChecks) return "in progress"
  return "not started"
}

/* ── Read paths (Server Components) ─────────────────────────────────── */

/**
 * Load the data the Per-repo Issues List page renders (FR-11, R5). Resolves
 * the snapshot first; if the repo is not imported, returns
 * `{ snapshotExists: false }` and the page renders the not-imported state.
 *
 * GitHub fetching is best-effort: when the M11 client fails (rate limit, auth,
 * network) the page surfaces a calm inline notice and falls back to the local
 * CCPM-task list. A page with neither issues nor CCPM tasks renders the
 * dedicated empty state.
 */
export async function getIssuesPageData(
  owner: string,
  repo: string,
  injectedDb?: CatalogDb,
): Promise<IssuesPageData> {
  const database = injectedDb ?? db()
  const snapshot = await getImportedRepo(owner, repo, undefined, database)
  if (!snapshot) {
    return {
      snapshotExists: false,
      identity: null,
      rows: [],
      fetchFailed: false,
      fetchError: null,
      truncated: false,
    }
  }

  const identity: RepoIdentity = {
    owner: snapshot.owner,
    repo: snapshot.repo,
    branch: snapshot.ref,
  }

  // GitHub issues — best-effort. A failure does not blank the page; it
  // surfaces as a calm inline notice (page-spec §11).
  let githubIssues: IssueModel[] = []
  let fetchFailed = false
  let fetchError: string | null = null
  let truncated = false
  try {
    const client = createGitHubClient()
    const result = await listIssues(client, { owner, repo }, { state: "all" })
    if (result.ok) {
      githubIssues = result.data.issues
      truncated = result.data.truncated
    } else {
      fetchFailed = true
      fetchError = result.error.message
    }
  } catch (error) {
    fetchFailed = true
    fetchError =
      error instanceof Error
        ? error.message
        : "Could not reach GitHub to list issues."
  }

  // CCPM tasks — read from the snapshot itself. Always succeeds (returns []
  // when the repo has no CCPM task files).
  const ccpmInputs = await listCcpmTasks(owner, repo, {
    ref: snapshot.ref,
    db: database,
  })

  // Stored learning units for this snapshot — to derive each row's status.
  const storedUnits = await listLearningUnits(snapshot.id, database)
  const unitByKey = new Map<string, LearningUnit>()
  for (const unit of storedUnits) {
    unitByKey.set(`${unit.source}:${unit.issueRef}`, unit)
  }

  const ghRows: IssueRowView[] = githubIssues.map((issue) => {
    const input = normalizeIssueToLearningUnitInput(issue)
    const stored = unitByKey.get(`github-issue:${input.issueRef}`) ?? null
    return {
      source: "github-issue",
      issueRef: input.issueRef,
      title: input.title,
      labels: input.labels,
      state: input.state,
      linkedPrs: input.linkedPrs,
      href: `/repos/${owner}/${repo}/issues/${encodeURIComponent(input.issueRef)}`,
      status: deriveStatus(stored),
      lastUpdatedAt: stored?.updatedAt.toISOString() ?? null,
    }
  })

  const ccpmRows: IssueRowView[] = ccpmInputs.map((input) => {
    const stored = unitByKey.get(`ccpm-task:${input.issueRef}`) ?? null
    return {
      source: "ccpm-task",
      issueRef: input.issueRef,
      title: input.title,
      labels: input.labels,
      state: input.state,
      linkedPrs: input.linkedPrs,
      href: `/repos/${owner}/${repo}/issues/${encodeURIComponent(input.issueRef)}`,
      status: deriveStatus(stored),
      lastUpdatedAt: stored?.updatedAt.toISOString() ?? null,
    }
  })

  // Order: open first, then closed; stable within each state.
  const rows = [...ghRows, ...ccpmRows].sort((a, b) => {
    if (a.state !== b.state) return a.state === "open" ? -1 : 1
    return a.issueRef.localeCompare(b.issueRef)
  })

  return {
    snapshotExists: true,
    identity,
    rows,
    fetchFailed,
    fetchError,
    truncated,
  }
}

/**
 * Resolve the normalized input for one `issueRef` on a repo — either by
 * fetching the GitHub issue or by reading the CCPM task file in the snapshot.
 *
 * Returns `null` when neither source resolves; the caller treats `null` as
 * not-found (404). A GitHub-side failure when reading an issue is logged into
 * the message but not thrown — the caller decides whether to fall back.
 */
async function resolveLearningUnitInput(
  owner: string,
  repo: string,
  issueRef: string,
  database: CatalogDb,
): Promise<LearningUnitInput | null> {
  const ccpmMatch = /^epic\/[^/]+\/\d+$/.exec(issueRef)
  if (ccpmMatch) {
    return fetchCcpmTask(owner, repo, issueRef, { db: database })
  }
  // GitHub issue path — strip the leading `#` to get a number.
  const num = Number(issueRef.replace(/^#/, ""))
  if (!Number.isInteger(num) || num <= 0) return null
  try {
    const client = createGitHubClient()
    const result = await fetchIssue(client, { owner, repo }, num)
    if (!result.ok) return null
    return normalizeIssueToLearningUnitInput(result.data)
  } catch {
    return null
  }
}

/**
 * Load (or generate) the learning unit for one `owner/repo/issueRef`,
 * returning the typed page view ready to render. On first visit the route
 * calls {@link ensureLearningUnit} via the Server Action; this read path
 * returns a not-found-style result when no unit exists yet so the page can
 * decide whether to offer generation.
 */
export async function getLearningUnitView(
  owner: string,
  repo: string,
  issueRef: string,
  injectedDb?: CatalogDb,
): Promise<LearningUnitViewResult> {
  const database = injectedDb ?? db()
  const snapshot = await getImportedRepo(owner, repo, undefined, database)
  if (!snapshot) {
    return {
      ok: false,
      reason: "not-imported",
      message: `${owner}/${repo} has not been imported.`,
    }
  }

  const source = /^epic\/[^/]+\/\d+$/.test(issueRef)
    ? "ccpm-task"
    : "github-issue"

  // Try local-first: a stored unit needs no GitHub call to render.
  const stored = await getLearningUnit(snapshot.id, source, issueRef, database)
  const projectMap = await getProjectMapByRepo(owner, repo, undefined, database)

  if (stored) {
    // Best-effort: enrich with the live input so the header can render the
    // original issue title / external URL. A fetch failure is non-fatal.
    let input: LearningUnitInput | null = null
    try {
      input = await resolveLearningUnitInput(owner, repo, issueRef, database)
    } catch {
      input = null
    }
    return {
      ok: true,
      unit: toUnitView(stored, snapshot, projectMap, input),
    }
  }

  // No stored unit; signal not-found so the page surfaces a generation CTA.
  return {
    ok: false,
    reason: "no-input-found",
    message: `No learning unit exists for ${issueRef} on ${owner}/${repo} yet.`,
  }
}

/* ── Write paths (Server Actions) ───────────────────────────────────── */

/** Read snapshot-stored file content for the generation call's tool use. */
function makeSnapshotReader(
  files: RepoFile[],
): (path: string) => Promise<string | null> {
  const byPath = new Map(files.map((f) => [f.path, f.content]))
  return async (p: string) => byPath.get(p) ?? null
}

/**
 * Ensure a learning unit exists for `(owner, repo, issueRef)`. On first call:
 * resolves the input (GitHub or CCPM), runs the bounded generation call, and
 * persists the result via the data-access layer (FR-2, FR-3, FR-4). Subsequent
 * calls short-circuit on the stored row.
 *
 * The integrity check (FR-4) runs at the generator boundary inside
 * `generateLearningUnit`; a violation returns `integrity-failed` so the UI
 * renders an explicit error state instead of silently rendering broken links.
 */
export async function ensureLearningUnit(
  owner: string,
  repo: string,
  issueRef: string,
  injectedDb?: CatalogDb,
  injectedGenerate?: (
    args: Parameters<typeof generateLearningUnit>[0],
  ) => Promise<GenerateLearningUnitResult>,
): Promise<EnsureUnitActionResult> {
  const database = injectedDb ?? db()

  const snapshot = await getImportedRepo(owner, repo, undefined, database)
  if (!snapshot) {
    return {
      ok: false,
      error: {
        kind: "not-imported",
        message: `${owner}/${repo} has not been imported.`,
      },
    }
  }

  const input = await resolveLearningUnitInput(owner, repo, issueRef, database)
  if (!input) {
    return {
      ok: false,
      error: {
        kind: "missing-input",
        message: `No issue or CCPM task found for ${issueRef} on ${owner}/${repo}.`,
      },
    }
  }

  // Short-circuit: a unit already exists for this identity.
  const existing = await getLearningUnit(
    snapshot.id,
    input.source,
    input.issueRef,
    database,
  )
  if (existing) {
    return { ok: true, unitId: existing.id }
  }

  // Generate. The bounded SDK call is reachable only here (server-side).
  const projectMap = await getProjectMapByRepo(owner, repo, undefined, database)
  const files = await listRepoFiles(owner, repo, undefined, database)
  const fileTree: RepoTreeEntry[] = snapshot.fileTree
  const generator = injectedGenerate ?? generateLearningUnit
  const generated = await generator({
    input,
    snapshotFileTree: fileTree,
    readSnapshotFile: makeSnapshotReader(files),
    projectMap: projectMap ?? null,
  })
  if (!generated.ok) {
    const kind = generated.error.kind
    if (kind === "integrity_failed") {
      return {
        ok: false,
        error: {
          kind: "integrity-failed",
          message: generated.error.message,
        },
      }
    }
    if (
      kind === "llm_error" &&
      generated.error.cause?.kind === "missing_api_key"
    ) {
      return {
        ok: false,
        error: {
          kind: "missing-api-key",
          message: generated.error.cause.message,
        },
      }
    }
    return {
      ok: false,
      error: { kind: "llm-failure", message: generated.error.message },
    }
  }

  const created = await createLearningUnit(
    {
      snapshotId: snapshot.id,
      source: input.source,
      issueRef: input.issueRef,
      ...generated.data.content,
    },
    database,
  )
  return { ok: true, unitId: created.id }
}

/**
 * Grade a user's answers for one learning unit. Runs the bounded grading
 * call, persists the answers via `recordAnswers`, persists the score +
 * weak-area breakdown via `recordScore`, and returns the updated view.
 *
 * R4 — this never reads the checklist state; the checklist is display-only.
 * R6 — the score is strictly per-unit; no cross-unit rollup is computed.
 */
export async function gradeLearningUnitAnswers(
  unitId: number,
  answers: UnderstandingAnswer[],
  injectedDb?: CatalogDb,
  injectedGrade?: typeof gradeLearningUnit,
): Promise<GradeUnitActionResult> {
  const database = injectedDb ?? db()

  const unit = await getLearningUnitById(unitId, database)
  if (!unit) {
    return {
      ok: false,
      error: { kind: "unknown", message: "That learning unit no longer exists." },
    }
  }
  const snapshot = await getImportedRepoById(unit.snapshotId, database)
  if (!snapshot) {
    return {
      ok: false,
      error: {
        kind: "unknown",
        message: "That unit's repository snapshot is missing.",
      },
    }
  }

  if (unit.questions.length === 0) {
    return {
      ok: false,
      error: {
        kind: "no-questions",
        message: "This learning unit has no understanding questions to grade.",
      },
    }
  }

  const grader = injectedGrade ?? gradeLearningUnit
  const graded = await grader({
    questions: unit.questions,
    answers,
  })
  if (!graded.ok) {
    if (
      graded.error.kind === "llm_error" &&
      graded.error.cause?.kind === "missing_api_key"
    ) {
      return {
        ok: false,
        error: {
          kind: "missing-api-key",
          message: graded.error.cause.message,
        },
      }
    }
    if (graded.error.kind === "no_questions") {
      return {
        ok: false,
        error: { kind: "no-questions", message: graded.error.message },
      }
    }
    return {
      ok: false,
      error: { kind: "llm-failure", message: graded.error.message },
    }
  }

  // Persist answers, score, and weak-area breakdown (R6).
  await recordAnswers(unitId, graded.data.answers, database)
  const scored = await recordScore(
    unitId,
    graded.data.score,
    graded.data.weakAreas,
    database,
  )
  if (!scored) {
    return {
      ok: false,
      error: { kind: "unknown", message: "Could not save the grading result." },
    }
  }

  const projectMap = await getProjectMapByRepo(
    snapshot.owner,
    snapshot.repo,
    undefined,
    database,
  )
  let input: LearningUnitInput | null = null
  try {
    input = await resolveLearningUnitInput(
      snapshot.owner,
      snapshot.repo,
      scored.issueRef,
      database,
    )
  } catch {
    input = null
  }
  return { ok: true, unit: toUnitView(scored, snapshot, projectMap, input) }
}

/**
 * Toggle one checklist item's checked state for a learning unit (FR-6, R4).
 * Reads the current state, applies the toggle, and persists it via the DAL.
 * Never reads or writes `score` — the checklist is strictly informational.
 */
export async function toggleChecklistItem(
  unitId: number,
  itemId: string,
  checked: boolean,
  injectedDb?: CatalogDb,
): Promise<ChecklistToggleResult> {
  const database = injectedDb ?? db()

  const unit = await getLearningUnitById(unitId, database)
  if (!unit) {
    return {
      ok: false,
      error: { kind: "unknown", message: "That learning unit no longer exists." },
    }
  }

  const knownIds = new Set(unit.reviewChecklist.map((c) => c.id))
  if (!knownIds.has(itemId)) {
    return {
      ok: false,
      error: { kind: "unknown", message: "Unknown checklist item." },
    }
  }

  const currentMap = checklistStateToMap(unit.checklistState ?? null)
  currentMap[itemId] = checked
  const nextState = mapToChecklistState(currentMap)
  const updated = await updateChecklistState(unitId, nextState, database)
  if (!updated) {
    return {
      ok: false,
      error: {
        kind: "unknown",
        message: "Could not save your checklist change.",
      },
    }
  }
  return { ok: true, checklistState: currentMap }
}

/**
 * Re-read a stored unit + its snapshot to produce a fresh view (used after
 * a checklist toggle to give the UI an up-to-date snapshot without re-fetching
 * the input source).
 */
export async function readLearningUnitView(
  unitId: number,
  injectedDb?: CatalogDb,
): Promise<LearningUnitView | null> {
  const database = injectedDb ?? db()
  const unit = await getLearningUnitById(unitId, database)
  if (!unit) return null
  const snapshot = await getImportedRepoById(unit.snapshotId, database)
  if (!snapshot) return null
  const projectMap = await getProjectMapByRepo(
    snapshot.owner,
    snapshot.repo,
    undefined,
    database,
  )
  return toUnitView(unit, snapshot, projectMap, null)
}
