// Server-side data access for the Stack Explainer pages (task #89).
//
// Wraps the M5 backend (`@workspace/db/stack`) with an explicit DB path
// resolved from the web app's working directory, and maps its typed results
// onto the serializable view shapes the /stack routes render. Imported only by
// server code (Server Components + the Server Action) — never by a Client
// Component. Mirrors `lib/github-import.ts`.

import path from "node:path"

import {
  type CatalogDb,
  createCatalogDb,
  type DebugEntryPoint,
  detectStackForSnapshot,
  explainStack,
  type ExplainStackError,
  getImportedRepo,
  getStackExplanation,
  type KeyFilePointer,
  listImportedRepos,
  saveStackExplanation,
  type StackExplanation,
  type StackTool,
} from "@workspace/db"

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function stackDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(stackDbFile())
  return cached
}

/** One imported repository as the `/stack` chooser renders it. */
export interface ChooserRepo {
  owner: string
  repo: string
  /** The imported ref/branch. */
  branch: string
  /** ISO timestamp of when the snapshot was imported. */
  importedAt: string
  /** Whether this repo already has a stored stack explanation. */
  hasExplanation: boolean
}

/** A stack explanation as the explanation page renders it (fully serializable). */
export interface StackExplanationView {
  owner: string
  repo: string
  branch: string
  /** ISO timestamp of when the explanation was generated. */
  updatedAt: string
  tools: StackTool[]
  keyFiles: KeyFilePointer[]
  debugEntryPoints: DebugEntryPoint[]
}

/** The repo identity shown on `/stack/[owner]/[repo]` before/around explaining. */
export interface RepoIdentity {
  owner: string
  repo: string
  branch: string
}

/** What the explanation page's Server Component loads for a repo. */
export interface StackPageData {
  /** Whether the repo has an imported snapshot at all. */
  snapshotExists: boolean
  /** Repo identity — `null` when the repo is not imported. */
  identity: RepoIdentity | null
  /** The stored explanation — `null` when not imported or not yet explained. */
  explanation: StackExplanationView | null
}

/** The coarse error kinds the Stack Explainer UI renders (page spec §11). */
export type StackErrorKind =
  | "not-imported"
  | "missing-api-key"
  | "unrecognized-stack"
  | "llm-failure"
  | "unknown"

/** The discriminated result the explain Server Action returns. */
export type StackExplanationActionResult =
  | { ok: true; explanation: StackExplanationView }
  | { ok: false; error: { kind: StackErrorKind; message: string } }

/** Project a snapshot + stored explanation row onto the serializable view. */
function toView(
  snapshot: { owner: string; repo: string; ref: string },
  row: StackExplanation,
): StackExplanationView {
  return {
    owner: snapshot.owner,
    repo: snapshot.repo,
    branch: snapshot.ref,
    updatedAt: row.updatedAt.toISOString(),
    tools: row.tools,
    keyFiles: row.keyFiles,
    debugEntryPoints: row.debugEntryPoints,
  }
}

/** Map an `ExplainStackError` onto a UI error kind + message. */
function mapExplainError(error: ExplainStackError): {
  kind: StackErrorKind
  message: string
} {
  if (error.kind === "snapshot_not_found") {
    return { kind: "not-imported", message: error.message }
  }
  if (error.kind === "llm_error" && error.cause?.kind === "missing_api_key") {
    return { kind: "missing-api-key", message: error.cause.message }
  }
  if (error.kind === "llm_error" || error.kind === "no_structured_output") {
    return { kind: "llm-failure", message: error.message }
  }
  return { kind: "unknown", message: error.message }
}

/**
 * List every imported repository for the `/stack` chooser, newest first, each
 * flagged with whether it already has a stored stack explanation.
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
      hasExplanation: (await getStackExplanation(s.id, database)) !== null,
    })),
  )
}

/**
 * Load what the `/stack/[owner]/[repo]` Server Component needs: whether the
 * repo is imported, its identity, and any already-stored explanation.
 */
export async function getStackPageData(
  owner: string,
  repo: string,
): Promise<StackPageData> {
  const database = db()
  const snapshot = await getImportedRepo(owner, repo, undefined, database)
  if (!snapshot) {
    return { snapshotExists: false, identity: null, explanation: null }
  }
  const identity: RepoIdentity = {
    owner: snapshot.owner,
    repo: snapshot.repo,
    branch: snapshot.ref,
  }
  const row = await getStackExplanation(snapshot.id, database)
  return {
    snapshotExists: true,
    identity,
    explanation: row ? toView(snapshot, row) : null,
  }
}

/**
 * Run the bounded explanation call for an imported repo, persist the result,
 * and adapt it for the UI (page spec §5). Expected failures are returned as
 * `{ ok: false }` — never thrown — so the page renders an in-page error state.
 *
 * Pre-checks keep the call honest: a repo with no snapshot is `not-imported`
 * without an API call; a snapshot whose stack detects no major tools is
 * `unrecognized-stack` without an API call.
 */
export async function runExplain(
  owner: string,
  repo: string,
): Promise<StackExplanationActionResult> {
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

  const detected = await detectStackForSnapshot(
    owner,
    repo,
    undefined,
    database,
  )
  if (detected.tools.length === 0) {
    return {
      ok: false,
      error: {
        kind: "unrecognized-stack",
        message:
          "No major tools were detected in the imported snapshot's files.",
      },
    }
  }

  const result = await explainStack({ owner, repo, db: database })
  if (!result.ok) {
    return { ok: false, error: mapExplainError(result.error) }
  }

  const saved = await saveStackExplanation(
    snapshot.id,
    result.data.content,
    database,
  )
  return { ok: true, explanation: toView(snapshot, saved) }
}
