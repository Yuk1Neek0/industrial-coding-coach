// Server-side data access + orchestration for the M10 Portfolio Page
// (`/portfolio/[owner]/[repo]`, task #184).
//
// Wraps the M10 backend (`@workspace/db` learning-memories sub-module — the
// `learning_memories` DAL, the three deterministic composers, the two
// bounded SDK generators, and the markdown / PDF exporters) and the M11
// snapshot DAL behind an explicit DB-path-resolved facade. Mirrors
// `lib/challenges.ts` and `lib/learning-units.ts`.
//
// Imported only by server code (Server Components, Server Actions, Route
// Handlers) — never by a Client Component. The Anthropic SDK is reached
// only inside `regenerateMemory`; viewing the page is API-key-free
// (PRD FR-8). `pnpm build` and `pnpm test` run with no API key.

import path from "node:path"

import {
  type CatalogDb,
  createCatalogDb,
  getImportedRepo,
  getImportedRepoById,
  type LearningMemory,
  type RepoSnapshot,
} from "@workspace/db"
import {
  composeArchitectureExplanation,
  composeDebugStories,
  composeLearningMemoryTree,
  GenerateInterviewQAError,
  GenerateResumeBulletsError,
  generateInterviewQA,
  generateResumeBullets,
  getMemory,
  InterviewQAIntegrityError,
  isMemoryStale,
  type LearningMemoryContent,
  renderPortfolioMarkdownBundle,
  renderPortfolioPdf,
  ResumeBulletsIntegrityError,
  upsertMemory,
} from "@workspace/db/learning-memories"

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function portfolioDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(portfolioDbFile())
  return cached
}

/* ── View shapes (serializable) ────────────────────────────────────────── */

/** Repo identity rendered in the page header (mirrors `lib/challenges.ts`). */
export interface PortfolioRepoIdentity {
  owner: string
  repo: string
  /** The imported snapshot's ref/branch. */
  branch: string
  /** Snapshot primary-key id — used by all three Server Actions. */
  snapshotId: number
}

/**
 * The Portfolio Page's top-level view shape. Either the snapshot is missing
 * (the route renders its `not-found.tsx`), or the snapshot exists and the
 * page renders the header + the memory row (which may itself be `null` for
 * the first-open empty state, §10 of the Page Spec).
 */
export interface PortfolioPageData {
  /** `true` when the owner/repo is imported; `false` triggers `notFound()`. */
  snapshotExists: boolean
  /** Snapshot identity; only populated when `snapshotExists === true`. */
  identity: PortfolioRepoIdentity | null
  /**
   * The cached learning memory row. `null` for the first-open empty state
   * (§10) — the page renders the empty panel and offers Regenerate.
   */
  memory: LearningMemory | null
  /**
   * Whether the cached memory is older than the snapshot's `updated_at`
   * (FR-11). Drives the stale-data banner (§6a). Always `true` when memory
   * is `null` (per `isMemoryStale`'s contract — but the page treats the
   * `memory === null` case as "no banner, show the empty panel instead",
   * see §6a's "Hidden when not stale" rule and §10's first-open shape).
   */
  stale: boolean
}

/**
 * Read the Portfolio Page's view data for one imported repository's most
 * recent snapshot. Read-only — never triggers generation (PRD FR-5; the
 * Regenerate Server Action is the only path that touches the SDK).
 *
 * Returns `snapshotExists: false` when the repo is not imported, so the
 * page's `not-found.tsx` (FR Spec §11) renders without a stack trace.
 */
export async function getPortfolioPageData(
  owner: string,
  repo: string,
  injectedDb?: CatalogDb,
): Promise<PortfolioPageData> {
  const database = injectedDb ?? db()

  const snapshot = await getImportedRepo(owner, repo, undefined, database)
  if (!snapshot) {
    return { snapshotExists: false, identity: null, memory: null, stale: false }
  }

  const memory = await getMemory(snapshot.id, database)
  // `isMemoryStale` returns `true` when memory is `null` — but the page
  // treats the first-open shape as "show the empty panel, not the banner"
  // (Page Spec §10). The flag we return is the *banner* flag: only `true`
  // when a memory row exists AND it is older than the snapshot.
  const stale = memory !== null && (await isMemoryStale(snapshot.id, database))

  return {
    snapshotExists: true,
    identity: {
      owner: snapshot.owner,
      repo: snapshot.repo,
      branch: snapshot.ref,
      snapshotId: snapshot.id,
    },
    memory,
    stale,
  }
}

/* ── Regenerate Server Action — error model ────────────────────────────── */

/** Discriminated outcome of {@link regenerateMemory}. */
export type RegenerateMemoryResult =
  | { ok: true; memoryId: number }
  | { ok: false; error: RegenerateMemoryError }

/** The distinct failure modes the page renders (Page Spec §8 / §11). */
export type RegenerateMemoryErrorKind =
  /** `ANTHROPIC_API_KEY` is not configured at runtime. */
  | "missing-api-key"
  /** The bounded SDK output failed the file/stack integrity check (#177). */
  | "integrity-failure"
  /** A bullet violated the ≤ 160-char cap (PRD US-2). */
  | "length-violation"
  /** A bullet opened with a forbidden verb (PRD US-2). */
  | "verb-violation"
  /** The snapshot id is unknown (race against snapshot delete). */
  | "unknown-snapshot"
  /** Any other LLM-boundary or unexpected failure. */
  | "llm-failure"

/** A typed error surfaced from {@link regenerateMemory}. */
export interface RegenerateMemoryError {
  kind: RegenerateMemoryErrorKind
  message: string
}

/* ── Regenerate Server Action — implementation ─────────────────────────── */

/**
 * Inject points for tests. The default implementations call the real M10
 * backend; tests pass mocked variants so CI runs with no API key and no
 * live SDK call (mirrors `ensureLearningUnit` in `lib/learning-units.ts`).
 */
export interface RegenerateMemoryDeps {
  generateInterviewQA?: typeof generateInterviewQA
  generateResumeBullets?: typeof generateResumeBullets
  composeArchitectureExplanation?: typeof composeArchitectureExplanation
  composeLearningMemoryTree?: typeof composeLearningMemoryTree
  composeDebugStories?: typeof composeDebugStories
}

/**
 * Regenerate the cached learning memory for one snapshot: run the three
 * deterministic composers + the two bounded SDK calls, assemble a
 * `LearningMemoryContent`, and upsert the `learning_memories` row.
 *
 * The Anthropic SDK is reached only here — never from a Client Component.
 * Guards `ANTHROPIC_API_KEY` early so the page can render a setup hint
 * instead of crashing (Page Spec §8 — `missing-api-key` failure mode).
 *
 * Returns a discriminated result so the calling Server Action can render a
 * useful inline error (integrity / length / verb / missing-key) rather than
 * a generic 500.
 */
export async function regenerateMemory(
  snapshotId: number,
  injectedDb?: CatalogDb,
  deps: RegenerateMemoryDeps = {},
): Promise<RegenerateMemoryResult> {
  const database = injectedDb ?? db()

  const snapshot = await getImportedRepoById(snapshotId, database)
  if (!snapshot) {
    return {
      ok: false,
      error: {
        kind: "unknown-snapshot",
        message: "This snapshot no longer exists — re-import the repository.",
      },
    }
  }

  // Guard the API key BEFORE we issue the bounded SDK calls so the page
  // gets a typed `missing-api-key` instead of a low-level `LlmError`. The
  // deterministic composers do not need a key and run fine without it.
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: {
        kind: "missing-api-key",
        message:
          "Set ANTHROPIC_API_KEY in your .env to regenerate the AI-generated " +
          "Q&A and résumé bullets.",
      },
    }
  }

  const composeArch =
    deps.composeArchitectureExplanation ?? composeArchitectureExplanation
  const composeTree =
    deps.composeLearningMemoryTree ?? composeLearningMemoryTree
  const composeStories = deps.composeDebugStories ?? composeDebugStories
  const generateQa = deps.generateInterviewQA ?? generateInterviewQA
  const generateBullets =
    deps.generateResumeBullets ?? generateResumeBullets

  // Composers first — deterministic, no SDK, never throw on missing rows.
  const [architectureExplanation, learningMemoryTree, debugStories] =
    await Promise.all([
      composeArch(snapshotId, database),
      composeTree(snapshotId, database),
      composeStories(snapshotId, database),
    ])

  // Bounded SDK calls. Each can throw a typed integrity error — surface it
  // structurally rather than letting it crash the action.
  let interviewQa
  try {
    interviewQa = await generateQa(snapshotId, { db: database })
  } catch (err) {
    return { ok: false, error: mapInterviewError(err) }
  }
  let resumeBullets
  try {
    resumeBullets = await generateBullets(snapshotId, { db: database })
  } catch (err) {
    return { ok: false, error: mapBulletsError(err) }
  }

  const content: LearningMemoryContent = {
    interviewQa,
    resumeBullets,
    architectureExplanation,
    learningMemoryTree,
    debugStories,
  }

  const row = await upsertMemory(snapshotId, content, database)
  return { ok: true, memoryId: row.id }
}

function mapInterviewError(err: unknown): RegenerateMemoryError {
  if (err instanceof InterviewQAIntegrityError) {
    return {
      kind: "integrity-failure",
      message:
        "Couldn't ground the new artifacts against your repo. Try " +
        "regenerating; if it keeps failing, your project map or stack " +
        "explainer may need a refresh.",
    }
  }
  if (err instanceof GenerateInterviewQAError) {
    if (err.cause?.kind === "missing_api_key") {
      return { kind: "missing-api-key", message: err.cause.message }
    }
    return { kind: "llm-failure", message: err.message }
  }
  return {
    kind: "llm-failure",
    message:
      err instanceof Error
        ? err.message
        : "Couldn't regenerate. Try again.",
  }
}

function mapBulletsError(err: unknown): RegenerateMemoryError {
  if (err instanceof ResumeBulletsIntegrityError) {
    return {
      kind: "integrity-failure",
      message:
        "Couldn't ground the new artifacts against your repo. Try " +
        "regenerating; if it keeps failing, your project map or stack " +
        "explainer may need a refresh.",
    }
  }
  if (err instanceof GenerateResumeBulletsError) {
    if (err.kind === "length_violation") {
      return {
        kind: "length-violation",
        message:
          "The generator produced a bullet longer than 160 characters. " +
          "Try regenerating.",
      }
    }
    if (err.kind === "verb_prefix_violation") {
      return {
        kind: "verb-violation",
        message:
          "The generator produced a bullet without a strong opening verb. " +
          "Try regenerating.",
      }
    }
    if (err.cause?.kind === "missing_api_key") {
      return { kind: "missing-api-key", message: err.cause.message }
    }
    return { kind: "llm-failure", message: err.message }
  }
  return {
    kind: "llm-failure",
    message:
      err instanceof Error
        ? err.message
        : "Couldn't regenerate. Try again.",
  }
}

/* ── Export Server Action helpers ──────────────────────────────────────── */

/** The rendered bytes + filename for the markdown ZIP export. */
export interface ExportBundleOk {
  ok: true
  bytes: Buffer
  filename: string
  /** MIME type — kept here so the route-handler caller can stay tiny. */
  contentType: "application/zip"
}

/** The rendered bytes + filename for the PDF export. */
export interface ExportPdfOk {
  ok: true
  bytes: Buffer
  filename: string
  contentType: "application/pdf"
}

/** A typed failure surfaced from either export path. */
export interface ExportFailure {
  ok: false
  error: { kind: "no-memory" | "unknown-snapshot" | "export-failed"; message: string }
}

export type ExportBundleResult = ExportBundleOk | ExportFailure
export type ExportPdfResult = ExportPdfOk | ExportFailure

/**
 * Render the markdown bundle ZIP for one snapshot's learning memory. The
 * Route Handler wraps the returned bytes in a streaming `Response` with the
 * appropriate `Content-Disposition` header (Page Spec §8).
 */
export async function exportPortfolioBundle(
  snapshotId: number,
  injectedDb?: CatalogDb,
): Promise<ExportBundleResult> {
  const database = injectedDb ?? db()
  const snapshot = await getImportedRepoById(snapshotId, database)
  if (!snapshot) {
    return {
      ok: false,
      error: {
        kind: "unknown-snapshot",
        message: "This snapshot no longer exists.",
      },
    }
  }
  const memory = await getMemory(snapshotId, database)
  if (!memory) {
    return {
      ok: false,
      error: {
        kind: "no-memory",
        message:
          "No learning memory has been generated for this snapshot yet — " +
          "click Regenerate first.",
      },
    }
  }
  try {
    const bundle = await renderPortfolioMarkdownBundle(memory, snapshot)
    return {
      ok: true,
      bytes: bundle.zip,
      filename: bundle.zipFilename,
      contentType: "application/zip",
    }
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "export-failed",
        message:
          err instanceof Error
            ? err.message
            : "Couldn't render the markdown bundle.",
      },
    }
  }
}

/**
 * Render the portfolio PDF for one snapshot's learning memory. The Route
 * Handler wraps the returned bytes in a streaming `Response` with the
 * appropriate `Content-Disposition` header (Page Spec §8).
 */
export async function exportPortfolioPdf(
  snapshotId: number,
  injectedDb?: CatalogDb,
): Promise<ExportPdfResult> {
  const database = injectedDb ?? db()
  const snapshot = await getImportedRepoById(snapshotId, database)
  if (!snapshot) {
    return {
      ok: false,
      error: {
        kind: "unknown-snapshot",
        message: "This snapshot no longer exists.",
      },
    }
  }
  const memory = await getMemory(snapshotId, database)
  if (!memory) {
    return {
      ok: false,
      error: {
        kind: "no-memory",
        message:
          "No learning memory has been generated for this snapshot yet — " +
          "click Regenerate first.",
      },
    }
  }
  try {
    const rendered = await renderPortfolioPdf(memory, snapshot)
    return {
      ok: true,
      bytes: rendered.pdf,
      filename: rendered.pdfFilename,
      contentType: "application/pdf",
    }
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "export-failed",
        message:
          err instanceof Error
            ? err.message
            : "Couldn't render the PDF.",
      },
    }
  }
}

/** Re-exports for tests and route handlers. */
export type { LearningMemory, LearningMemoryContent, RepoSnapshot }
