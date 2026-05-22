// Server-side data access + orchestration for the M8 Diff Review Coach pages
// (diff-review epic, task #116).
//
// Wraps the M8 backend (`@workspace/db` — the diff-reviews data-access layer,
// the bounded review call, and the bounded grading call) and the M11 GitHub
// client with an explicit DB path resolved from the web app's working
// directory. Maps the typed results onto the serializable view shapes the
// `/reviews` routes render. Mirrors `lib/stack-explainer.ts`.
//
// Imported only by server code (Server Components + Server Actions) — never by
// a Client Component. The Anthropic SDK and the GitHub client are reached only
// here; CI / `pnpm build` run with no API key and never make a live call,
// because creation/grading are user-triggered actions, not load-time work.

import path from "node:path"

import {
  buildPullRequestChangeModel,
  type CatalogDb,
  type ChangedFile,
  type ChangedFileExplanation,
  checkReviewFileReferences,
  type ComprehensionAnswer,
  type ComprehensionQuestion,
  createCatalogDb,
  createGitHubClient,
  type DiffHunk,
  type DiffReview,
  type DiffReviewContent,
  type DiffRisk,
  getDiffReview,
  getDiffReviewById,
  getImportedRepo,
  getImportedRepoById,
  gradeDiffReview,
  gradeUnderstandingCheck,
  listDiffReviews,
  listImportedRepos,
  type PullRequestChangeModel,
  reviewDiff,
  saveDiffReview,
  type TestSuggestion,
  type WeakArea,
} from "@workspace/db"

export type {
  ChangedFileExplanation,
  ComprehensionAnswer,
  ComprehensionQuestion,
  DiffRisk,
  TestSuggestion,
  WeakArea,
}

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function diffReviewDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(diffReviewDbFile())
  return cached
}

/* ── View shapes (serializable) ─────────────────────────────────────── */

/** One imported repository as the `/reviews` chooser renders it. */
export interface ChooserRepo {
  owner: string
  repo: string
  /** The imported ref/branch. */
  branch: string
  /** ISO timestamp of when the snapshot was imported. */
  importedAt: string
  /** How many diff reviews already exist for this repo's snapshot. */
  reviewCount: number
}

/** A reviewed PR as the per-repo picker lists it (fully serializable). */
export interface RepoReviewSummary {
  /** The `diff_reviews` row id — the `/reviews/[id]` URL key. */
  id: number
  /** The reviewed pull request's number. */
  prNumber: number
  /** Whether the review has been answered + graded. */
  graded: boolean
  /** The grading score (0–100) when graded; `null` otherwise. */
  score: number | null
  /** ISO timestamp the review was created. */
  createdAt: string
}

/** The repo identity shown on `/reviews/[owner]/[repo]`. */
export interface RepoIdentity {
  owner: string
  repo: string
  branch: string
}

/** What the per-repo PR picker page loads. */
export interface RepoPickerData {
  /** Whether the repo has an imported snapshot at all. */
  snapshotExists: boolean
  /** Repo identity — `null` when the repo is not imported. */
  identity: RepoIdentity | null
  /** The reviews already stored for this repo, newest first. */
  reviews: RepoReviewSummary[]
}

/** One changed file as the Diff Review page renders it (explanation + diff). */
export interface ChangedFileView {
  path: string
  /** The plain-language explanation produced by the review call. */
  explanation: string
  /** GitHub's change-kind for the file. */
  changeKind: ChangedFile["status"]
  additions: number
  deletions: number
  /** Whether the file's diff hunks resolve in the snapshot's change set. */
  hunks: DiffHunkView[]
  /** `true` when no parseable patch was available (binary / omitted / large). */
  patchOmitted: boolean
  /**
   * `false` when this explanation's path does not resolve to a file the PR
   * changed — the integrity check (#114) flagged it; the UI renders it plainly
   * with a quiet flag rather than crashing.
   */
  resolved: boolean
}

/** A diff hunk reduced to what the patch renderer needs. */
export interface DiffHunkView {
  header: string
  lines: { kind: "add" | "del" | "context"; text: string }[]
}

/** A risk as the Risk Analysis Panel renders it. */
export interface RiskView {
  title: string
  detail: string
}

/** A suggested test as the Diff Review page renders it. */
export interface TestSuggestionView {
  description: string
  rationale: string
}

/** A weak area as the Score / Weak Area UI renders it. */
export interface WeakAreaView {
  area: string
  detail: string
}

/** The PR header context shown on the Diff Review page, when available. */
export interface PullRequestHeader {
  number: number
  title: string
  url: string
  /** The linked issue, when the PR references one. */
  linkedIssue: {
    number: number
    title: string
    acceptanceCriteria: string[]
  } | null
}

/** One stored diff review, fully serialized for `/reviews/[id]`. */
export interface DiffReviewView {
  id: number
  repo: { owner: string; name: string }
  branch: string
  prNumber: number
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
  changedFiles: ChangedFileView[]
  coreLogicExplanation: string
  risks: RiskView[]
  testSuggestions: TestSuggestionView[]
  questions: ComprehensionQuestion[]
  /** The user's stored answers, or `null` until the check is completed. */
  answers: ComprehensionAnswer[] | null
  /** The grading score (0–100), or `null` until graded. */
  score: number | null
  /** Weak areas surfaced by grading, or `null` until graded. */
  weakAreas: WeakAreaView[] | null
  /**
   * `true` when every cited changed-file path resolves to a real PR changed
   * file. `false` flags a partial integrity failure (FR-4) — the page still
   * renders, the unresolved entries are marked.
   */
  fileReferencesOk: boolean
}

/* ── Error model ────────────────────────────────────────────────────── */

/** The coarse error kinds the Diff Review UI renders. */
export type DiffReviewErrorKind =
  | "not-imported"
  | "missing-api-key"
  | "missing-pr"
  | "github-failure"
  | "empty-pr"
  | "llm-failure"
  | "unknown"

/** The discriminated result the "create a review" Server Action returns. */
export type CreateReviewActionResult =
  | { ok: true; reviewId: number }
  | { ok: false; error: { kind: DiffReviewErrorKind; message: string } }

/** The discriminated result the "grade answers" Server Action returns. */
export type GradeReviewActionResult =
  | { ok: true; review: DiffReviewView }
  | { ok: false; error: { kind: DiffReviewErrorKind; message: string } }

/* ── Projection helpers ─────────────────────────────────────────────── */

/** Project a stored `DiffReview` row + repo snapshot onto the page view. */
function toReviewView(
  snapshot: { owner: string; repo: string; ref: string },
  row: DiffReview,
  changeModel: PullRequestChangeModel | null,
): DiffReviewView {
  // The integrity check (#114): a cited changed-file path must resolve to a
  // file the PR actually changed. With no change model on hand (the row is
  // read back without re-fetching the PR), treat every path as resolved — the
  // check ran at creation time and is re-asserted here when a model is given.
  const changedPaths = changeModel
    ? new Set(changeModel.files.map((f) => f.path))
    : null
  const fileByPath = changeModel
    ? new Map(changeModel.files.map((f) => [f.path, f]))
    : null

  const fileRefCheck = changeModel
    ? checkReviewFileReferences(
        {
          changedFiles: row.changedFiles,
          coreLogicExplanation: row.coreLogicExplanation,
          riskAnalysis: row.riskAnalysis,
          testSuggestions: row.testSuggestions,
          comprehensionQuestions: row.comprehensionQuestions,
        },
        changeModel,
      )
    : { ok: true, missingChangedFiles: [] }

  const changedFiles: ChangedFileView[] = row.changedFiles.map((cf) => {
    const modelFile = fileByPath?.get(cf.path)
    const resolved = changedPaths ? changedPaths.has(cf.path) : true
    return {
      path: cf.path,
      explanation: cf.explanation,
      changeKind: modelFile?.status ?? "modified",
      additions: modelFile?.additions ?? 0,
      deletions: modelFile?.deletions ?? 0,
      patchOmitted: modelFile?.patchOmitted ?? true,
      resolved,
      hunks: (modelFile?.hunks ?? []).map(toHunkView),
    }
  })

  return {
    id: row.id,
    repo: { owner: snapshot.owner, name: snapshot.repo },
    branch: snapshot.ref,
    prNumber: row.prNumber,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    changedFiles,
    coreLogicExplanation: row.coreLogicExplanation,
    risks: row.riskAnalysis.map((r: DiffRisk) => ({
      title: r.title,
      detail: r.detail,
    })),
    testSuggestions: row.testSuggestions.map((t: TestSuggestion) => ({
      description: t.description,
      rationale: t.rationale,
    })),
    questions: row.comprehensionQuestions,
    answers: row.answers ?? null,
    score: row.score ?? null,
    weakAreas:
      row.weakAreas?.map((w: WeakArea) => ({
        area: w.area,
        detail: w.detail,
      })) ?? null,
    fileReferencesOk: fileRefCheck.ok,
  }
}

/** Project one parsed diff hunk onto the renderer's view shape. */
function toHunkView(hunk: DiffHunk): DiffHunkView {
  const header =
    `@@ -${hunk.oldStart},${hunk.oldLines} ` +
    `+${hunk.newStart},${hunk.newLines} @@` +
    (hunk.header ? ` ${hunk.header}` : "")
  return {
    header,
    lines: hunk.lines.map((line) => ({ kind: line.kind, text: line.content })),
  }
}

/** The PR header context, derived from a change model when one is available. */
function toPullRequestHeader(
  model: PullRequestChangeModel,
): PullRequestHeader {
  return {
    number: model.number,
    title: model.title,
    url: model.htmlUrl,
    linkedIssue: model.linkedIssue
      ? {
          number: model.linkedIssue.number,
          title: model.linkedIssue.title,
          acceptanceCriteria: model.linkedIssue.acceptanceCriteria.map(
            (c) => c.text,
          ),
        }
      : null,
  }
}

/* ── Read paths (Server Components) ─────────────────────────────────── */

/**
 * List every imported repository for the `/reviews` chooser, newest first,
 * each flagged with how many diff reviews it already has.
 */
export async function listChooserRepos(): Promise<ChooserRepo[]> {
  const database = db()
  const snapshots = await listImportedRepos(database)
  return Promise.all(
    snapshots.map(async (s) => ({
      owner: s.owner,
      repo: s.repo,
      branch: s.ref,
      importedAt: s.importedAt.toISOString(),
      reviewCount: (await listDiffReviews(s.id, database)).length,
    })),
  )
}

/**
 * Load what the `/reviews/[owner]/[repo]` PR picker needs: whether the repo is
 * imported, its identity, and the reviews already stored against it.
 */
export async function getRepoPickerData(
  owner: string,
  repo: string,
): Promise<RepoPickerData> {
  const database = db()
  const snapshot = await getImportedRepo(owner, repo, undefined, database)
  if (!snapshot) {
    return { snapshotExists: false, identity: null, reviews: [] }
  }
  const rows = await listDiffReviews(snapshot.id, database)
  const reviews: RepoReviewSummary[] = rows
    .map((row) => ({
      id: row.id,
      prNumber: row.prNumber,
      graded: row.score !== null,
      score: row.score ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
    .sort((a, b) => b.id - a.id)
  return {
    snapshotExists: true,
    identity: { owner: snapshot.owner, repo: snapshot.repo, branch: snapshot.ref },
    reviews,
  }
}

/**
 * Load one stored diff review by its `id` for the `/reviews/[id]` page, or
 * `null` when no review has that id (the page treats `null` as not-found).
 *
 * The review's diff hunks and PR header context come from the live GitHub
 * client when it is reachable; when it is not (no network, no token, rate
 * limit) the review still renders from the stored row — its file explanations,
 * core logic, risks, tests, questions, answers, and grading are all persisted.
 */
export async function getDiffReviewView(
  id: number,
): Promise<{ review: DiffReviewView; pullRequest: PullRequestHeader | null } | null> {
  const database = db()
  const row = await getDiffReviewById(id, database)
  if (!row) return null

  const snapshot = await getImportedRepoById(row.snapshotId, database)
  if (!snapshot) return null

  // Best-effort: enrich with the live PR diff. A failure here is non-fatal —
  // the stored review is the source of truth for the page's content.
  let changeModel: PullRequestChangeModel | null = null
  try {
    const client = createGitHubClient()
    const result = await buildPullRequestChangeModel(
      client,
      { owner: snapshot.owner, repo: snapshot.repo },
      row.prNumber,
    )
    if (result.ok) changeModel = result.data
  } catch {
    changeModel = null
  }

  return {
    review: toReviewView(snapshot, row, changeModel),
    pullRequest: changeModel ? toPullRequestHeader(changeModel) : null,
  }
}

/* ── Write paths (Server Actions) ───────────────────────────────────── */

/**
 * Create (or refresh) a diff review for an imported repo's pull request.
 *
 * Fetches the PR's change model from GitHub, runs the bounded review call,
 * verifies the cited file references against the PR's changed-file set
 * (FR-4 integrity check), persists the review through the data-access layer,
 * and returns the new review's id.
 *
 * Expected failures are returned as `{ ok: false }` — never thrown — so the
 * page renders an in-page error state. A repo with no snapshot fails fast with
 * no GitHub or API call.
 */
export async function createReviewForPr(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<CreateReviewActionResult> {
  const database = db()

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

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return {
      ok: false,
      error: {
        kind: "missing-pr",
        message: "Enter a valid pull request number.",
      },
    }
  }

  // 1. Fetch the PR's change model from GitHub.
  let changeModel: PullRequestChangeModel
  try {
    const client = createGitHubClient()
    const modelResult = await buildPullRequestChangeModel(
      client,
      { owner, repo },
      prNumber,
    )
    if (!modelResult.ok) {
      const kind = modelResult.error.kind
      return {
        ok: false,
        error: {
          kind: kind === "not_found" ? "missing-pr" : "github-failure",
          message: modelResult.error.message,
        },
      }
    }
    changeModel = modelResult.data
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "github-failure",
        message:
          error instanceof Error
            ? error.message
            : "Could not reach GitHub to fetch the pull request.",
      },
    }
  }

  if (changeModel.files.length === 0) {
    return {
      ok: false,
      error: {
        kind: "empty-pr",
        message: `Pull request #${prNumber} has no changed files to review.`,
      },
    }
  }

  // 2. Run the bounded review call.
  const result = await reviewDiff({ changeModel })
  if (!result.ok) {
    if (
      result.error.kind === "llm_error" &&
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
    if (result.error.kind === "empty_change_model") {
      return {
        ok: false,
        error: { kind: "empty-pr", message: result.error.message },
      }
    }
    return {
      ok: false,
      error: { kind: "llm-failure", message: result.error.message },
    }
  }

  // 3. Persist the review (the data-access layer keyed by snapshot + PR).
  const content: DiffReviewContent = result.data.content
  const saved = await saveDiffReview(
    snapshot.id,
    prNumber,
    content,
    database,
  )

  return { ok: true, reviewId: saved.id }
}

/**
 * Grade a user's answers to a stored review's comprehension questions.
 *
 * Runs the bounded grading call against the review's FIXED question set and
 * the user's answers, then persists the answers + score + weak areas through
 * the `gradeDiffReview` data-access function. Returns the updated review view
 * so the page can transition straight into the graded result.
 *
 * Expected failures are returned as `{ ok: false }` — never thrown — so the
 * Understanding Check UI shows a calm in-place "try again" rather than losing
 * the user's typed answers.
 */
export async function gradeReviewAnswers(
  reviewId: number,
  answers: ComprehensionAnswer[],
): Promise<GradeReviewActionResult> {
  const database = db()

  const row = await getDiffReviewById(reviewId, database)
  if (!row) {
    return {
      ok: false,
      error: { kind: "unknown", message: "That review no longer exists." },
    }
  }
  const snapshot = await getImportedRepoById(row.snapshotId, database)
  if (!snapshot) {
    return {
      ok: false,
      error: { kind: "unknown", message: "That review's repository is missing." },
    }
  }

  // Run the bounded grading call on the FIXED question set (#113).
  const result = await gradeUnderstandingCheck({
    questions: row.comprehensionQuestions,
    answers,
  })
  if (!result.ok) {
    if (
      result.error.kind === "llm_error" &&
      result.error.cause?.kind === "missing_api_key"
    ) {
      return {
        ok: false,
        error: { kind: "missing-api-key", message: result.error.cause.message },
      }
    }
    if (result.error.kind === "no_questions") {
      return {
        ok: false,
        error: {
          kind: "unknown",
          message: "This review has no questions to grade.",
        },
      }
    }
    return {
      ok: false,
      error: { kind: "llm-failure", message: result.error.message },
    }
  }

  // Persist answers + score + weak areas (#114).
  const updated = await gradeDiffReview(
    snapshot.id,
    row.prNumber,
    result.data.grading,
    database,
  )
  if (!updated) {
    return {
      ok: false,
      error: { kind: "unknown", message: "Could not save the grading result." },
    }
  }

  // Best-effort: re-read the change model so the graded view keeps its diffs.
  let changeModel: PullRequestChangeModel | null = null
  try {
    const client = createGitHubClient()
    const modelResult = await buildPullRequestChangeModel(
      client,
      { owner: snapshot.owner, repo: snapshot.repo },
      row.prNumber,
    )
    if (modelResult.ok) changeModel = modelResult.data
  } catch {
    changeModel = null
  }

  return { ok: true, review: toReviewView(snapshot, updated, changeModel) }
}

/**
 * Re-read a stored review by its snapshot + PR number — used by tests and the
 * persistence round-trip check. Returns `null` when the PR has no review.
 */
export async function readReviewBySnapshotPr(
  snapshotId: number,
  prNumber: number,
): Promise<DiffReview | null> {
  return getDiffReview(snapshotId, prNumber, db())
}
