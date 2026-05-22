// Server-side data access for the Project Logic Mapper pages (task #108).
//
// Wraps the M6 backend — the LangGraph mapping pipeline (`@workspace/ai`'s
// `runMappingPipeline`, #105) and the `project_maps` data-access layer
// (`@workspace/db`'s `mapper`, #106) — and maps their typed results onto the
// serializable view shapes the `/map` routes render. Imported only by server
// code (Server Components + the Server Action) — never by a Client Component.
// Mirrors `lib/stack-explainer.ts`.

import path from "node:path"

import {
  createAnthropicMapperModel,
  type MapperModel,
  runMappingPipeline,
} from "@workspace/ai/mapper"
import {
  type CatalogDb,
  checkProjectMapFileReferences,
  createCatalogDb,
  getImportedRepo,
  getProjectMap,
  ingestSnapshotForRepo,
  type ProjectMap,
  type ProjectMapContent,
  type ProjectMapReferenceCheck,
  listImportedRepos,
  listRepoFiles,
  saveProjectMap,
} from "@workspace/db"

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function mapperDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/**
 * Resolve the catalog database: an injected one (tests) or a lazily created
 * package default (the app — first call only, keeping build-time safe).
 */
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  cached ??= createCatalogDb(mapperDbFile())
  return cached
}

/** One imported repository as the `/map` chooser renders it. */
export interface ChooserRepo {
  owner: string
  repo: string
  /** The imported ref/branch. */
  branch: string
  /** ISO timestamp of when the snapshot was imported. */
  importedAt: string
  /** Whether this repo already has a stored project map. */
  hasMap: boolean
}

/** The repo identity shown on `/map/[owner]/[repo]` before/around mapping. */
export interface RepoIdentity {
  owner: string
  repo: string
  branch: string
}

/**
 * A project map as the map page renders it (fully serializable).
 *
 * It is the pipeline's {@link ProjectMapContent} — all seven outputs — plus the
 * snapshot identity, the generation timestamp, the integrity check over its
 * cited file paths, and the pipeline's graceful-degradation notes.
 */
export interface ProjectMapView {
  owner: string
  repo: string
  branch: string
  /** ISO timestamp of when the map was generated/updated. */
  updatedAt: string
  /** The architecture overview — one entry per layer/area of the project. */
  architectureOverview: ProjectMapContent["architectureOverview"]
  /** The key-file map — files worth knowing and the role each plays. */
  keyFileMap: ProjectMapContent["keyFileMap"]
  /** The request/data flow, traced step by step. */
  requestDataFlow: ProjectMapContent["requestDataFlow"]
  /** The state flow, traced step by step. */
  stateFlow: ProjectMapContent["stateFlow"]
  /** The AI-call flow, traced step by step. */
  aiCallFlow: ProjectMapContent["aiCallFlow"]
  /** The Mermaid diagram source — rendered client-side in the UI. */
  mermaidDiagram: string
  /** The debug path — where to start when something breaks. */
  debugPath: ProjectMapContent["debugPath"]
  /** The file-reference integrity check (#106) of this map's cited paths. */
  integrity: ProjectMapReferenceCheck
  /** Graceful-degradation notes from the pipeline run, if any. */
  notes: string[]
}

/** What the map page's Server Component loads for a repo. */
export interface MapPageData {
  /** Whether the repo has an imported snapshot at all. */
  snapshotExists: boolean
  /** Repo identity — `null` when the repo is not imported. */
  identity: RepoIdentity | null
  /** The stored map — `null` when not imported or not yet mapped. */
  map: ProjectMapView | null
}

/** The coarse error kinds the Project Logic Mapper UI renders (page spec §11). */
export type MapErrorKind =
  | "not-imported"
  | "missing-api-key"
  | "empty-snapshot"
  | "pipeline-failure"
  | "unknown"

/** The discriminated result the generate Server Action returns. */
export type ProjectMapActionResult =
  | { ok: true; map: ProjectMapView }
  | { ok: false; error: { kind: MapErrorKind; message: string } }

/**
 * Project a stored `project_maps` row (or pipeline content) onto the
 * serializable view, attaching the integrity check over its cited file paths.
 */
function toView(
  snapshot: { owner: string; repo: string; ref: string },
  content: ProjectMapContent,
  updatedAt: Date,
  integrity: ProjectMapReferenceCheck,
  notes: string[],
): ProjectMapView {
  return {
    owner: snapshot.owner,
    repo: snapshot.repo,
    branch: snapshot.ref,
    updatedAt: updatedAt.toISOString(),
    architectureOverview: content.architectureOverview,
    keyFileMap: content.keyFileMap,
    requestDataFlow: content.requestDataFlow,
    stateFlow: content.stateFlow,
    aiCallFlow: content.aiCallFlow,
    mermaidDiagram: content.mermaidDiagram,
    debugPath: content.debugPath,
    integrity,
    notes,
  }
}

/**
 * Decide whether an error thrown while running the pipeline is the
 * "no API key" boundary. The mapper model is backed by LangChain's
 * `ChatAnthropic`, which surfaces a missing key as an error mentioning the
 * `ANTHROPIC_API_KEY` env var — detected here so the UI can render the calm
 * `missing-api-key` state rather than a generic failure.
 */
function isMissingApiKey(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : String(error ?? "")
  return /api[\s_-]?key|anthropic_api_key/i.test(message)
}

/**
 * List every imported repository for the `/map` chooser, newest first, each
 * flagged with whether it already has a stored project map.
 */
export async function listChooserRepos(
  injectedDb?: CatalogDb,
): Promise<ChooserRepo[]> {
  const database = resolveDb(injectedDb)
  const snapshots = await listImportedRepos(database)
  return Promise.all(
    snapshots.map(async (s) => ({
      owner: s.owner,
      repo: s.repo,
      branch: s.ref,
      importedAt: s.importedAt.toISOString(),
      hasMap: (await getProjectMap(s.id, database)) !== null,
    })),
  )
}

/**
 * Load what the `/map/[owner]/[repo]` Server Component needs: whether the repo
 * is imported, its identity, and any already-stored map (with its integrity
 * check). A stored map carries no pipeline `notes` — those are a run artifact.
 */
export async function getMapPageData(
  owner: string,
  repo: string,
  injectedDb?: CatalogDb,
): Promise<MapPageData> {
  const database = resolveDb(injectedDb)
  const snapshot = await getImportedRepo(owner, repo, undefined, database)
  if (!snapshot) {
    return { snapshotExists: false, identity: null, map: null }
  }
  const identity: RepoIdentity = {
    owner: snapshot.owner,
    repo: snapshot.repo,
    branch: snapshot.ref,
  }
  const row: ProjectMap | null = await getProjectMap(snapshot.id, database)
  if (!row) {
    return { snapshotExists: true, identity, map: null }
  }
  const integrity = checkProjectMapFileReferences(row, snapshot.fileTree)
  return {
    snapshotExists: true,
    identity,
    map: toView(snapshot, row, row.updatedAt, integrity, []),
  }
}

/**
 * Run the M6 mapping pipeline for an imported repo, persist the result, run the
 * file-reference integrity check, and adapt it for the UI (page spec §5).
 *
 * Expected failures are returned as `{ ok: false }` — never thrown — so the
 * page renders an in-page error state. Pre-checks keep the run honest: a repo
 * with no snapshot is `not-imported` and a snapshot with no source files to map
 * is `empty-snapshot`, both without an API call.
 *
 * The Anthropic SDK / LangChain model is reached only here (server-side), via
 * `createAnthropicMapperModel` — a Client Component never touches it.
 *
 * @param injectedDb - injectable `CatalogDb` for tests; omitted → the default.
 * @param injectedModel - injectable `MapperModel` for tests (a scripted fake,
 *   so CI runs with no API key); omitted → a real Anthropic-backed model.
 */
export async function runMap(
  owner: string,
  repo: string,
  injectedDb?: CatalogDb,
  injectedModel?: MapperModel,
): Promise<ProjectMapActionResult> {
  const database = resolveDb(injectedDb)

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

  // Deterministic ingestion (#103) — no network, no LLM. A snapshot with no
  // source modules at all has nothing to map: fail fast, no API call.
  const ingestion = await ingestSnapshotForRepo(
    owner,
    repo,
    undefined,
    database,
  )
  if (!ingestion || ingestion.graph.modules.length === 0) {
    return {
      ok: false,
      error: {
        kind: "empty-snapshot",
        message:
          "The imported snapshot has no recognizable source files to map.",
      },
    }
  }

  const files = await listRepoFiles(owner, repo, undefined, database)

  let result
  try {
    result = await runMappingPipeline({
      ingestion,
      files: files.map((file) => ({
        path: file.path,
        content: file.content,
      })),
      model: injectedModel ?? createAnthropicMapperModel(),
    })
  } catch (error) {
    if (isMissingApiKey(error)) {
      return {
        ok: false,
        error: {
          kind: "missing-api-key",
          message:
            "ANTHROPIC_API_KEY is not configured. The project map is " +
            "generated by an AI pipeline and needs an API key set in .env.",
        },
      }
    }
    return {
      ok: false,
      error: {
        kind: "pipeline-failure",
        message:
          "The mapping pipeline failed. This may be a rate limit or a " +
          "temporary network problem — try again.",
      },
    }
  }

  const saved = await saveProjectMap(snapshot.id, result.content, database)
  const integrity = checkProjectMapFileReferences(saved, snapshot.fileTree)
  return {
    ok: true,
    map: toView(snapshot, saved, saved.updatedAt, integrity, result.notes),
  }
}
