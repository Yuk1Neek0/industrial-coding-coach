// Typed data-access layer for the `project_maps` table
// (project-logic-mapper PRD FR-6, Issue #106).
//
// This is the single typed interface the M6 Project Logic Mapper reads and
// writes project maps through. It covers create / read / update, keyed by
// imported-repo snapshot, plus the file-reference integrity check FR-6
// requires: proof that every file path a generated map cites resolves to a
// real path in the snapshot it maps.
//
// Server-side only — these functions open (or are handed) a local SQLite
// connection (ADR 0006). Every function accepts an optional `CatalogDb` so
// tests inject a fixture database; in the app, callers omit it and a lazily
// created package-local default is used. Style deliberately mirrors
// `../stack/explanations.ts`: small fully typed functions, `null` for a clean
// miss, one map per snapshot, an integrity check over cited file paths.

import { eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "../client"
import { getImportedRepo, getImportedRepoById } from "../github/repos"
import {
  type ArchitectureSection,
  type DebugPathStep,
  type FlowStep,
  type ProjectMap,
  type ProjectMapFile,
  type RepoTreeEntry,
  projectMaps,
} from "../schema"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/**
 * The structured body of a project map — the seven generated sections, without
 * the snapshot key or the row's audit timestamps.
 *
 * This is the contract the M6 LangGraph pipeline (#105) produces and the
 * data-access layer persists, so the producer and the store agree on one shape.
 */
export interface ProjectMapContent {
  /** The architecture overview — one entry per layer/area of the project. */
  architectureOverview: ArchitectureSection[]
  /** The key-file map — files worth knowing and the role each plays. */
  keyFileMap: ProjectMapFile[]
  /** The request/data flow, traced step by step. */
  requestDataFlow: FlowStep[]
  /** The state flow, traced step by step. */
  stateFlow: FlowStep[]
  /** The AI-call flow, traced step by step. */
  aiCallFlow: FlowStep[]
  /** The Mermaid diagram source rendering the project's structure. */
  mermaidDiagram: string
  /** The debug path — where to start when something breaks. */
  debugPath: DebugPathStep[]
}

/**
 * Get the project map stored for a snapshot by its `id`, or `null` when the
 * snapshot has not been mapped yet.
 */
export async function getProjectMap(
  snapshotId: number,
  db?: CatalogDb,
): Promise<ProjectMap | null> {
  const rows = resolveDb(db)
    .select()
    .from(projectMaps)
    .where(eq(projectMaps.snapshotId, snapshotId))
    .limit(1)
    .all()
  return rows[0] ?? null
}

/**
 * Get the project map for an imported repository by `owner` / `repo` / `ref`,
 * resolving the snapshot through the M11 data-access layer first.
 *
 * Returns `null` both when the repository is not imported and when it is
 * imported but not yet mapped — use {@link getImportedRepo} first if the caller
 * needs to tell those two cases apart.
 */
export async function getProjectMapByRepo(
  owner: string,
  repo: string,
  ref?: string,
  db?: CatalogDb,
): Promise<ProjectMap | null> {
  const resolved = resolveDb(db)
  const snapshot = await getImportedRepo(owner, repo, ref, resolved)
  if (!snapshot) return null
  return getProjectMap(snapshot.id, resolved)
}

/**
 * Insert a new project map for a snapshot and return the stored row.
 *
 * Fails if the snapshot already has a map — the table holds at most one per
 * snapshot. Use {@link saveProjectMap} to create-or-replace.
 */
export async function createProjectMap(
  snapshotId: number,
  content: ProjectMapContent,
  db?: CatalogDb,
): Promise<ProjectMap> {
  return resolveDb(db)
    .insert(projectMaps)
    .values({ snapshotId, ...content })
    .returning()
    .get()
}

/**
 * Replace the stored content of an existing project map, bumping `updatedAt`.
 * Returns the updated row, or `null` when the snapshot has no map to update.
 */
export async function updateProjectMap(
  snapshotId: number,
  content: ProjectMapContent,
  db?: CatalogDb,
): Promise<ProjectMap | null> {
  const rows = resolveDb(db)
    .update(projectMaps)
    .set({ ...content, updatedAt: new Date() })
    .where(eq(projectMaps.snapshotId, snapshotId))
    .returning()
    .all()
  return rows[0] ?? null
}

/**
 * Create the snapshot's project map, or replace it if one already exists.
 *
 * Re-mapping a snapshot updates its row in place (schema: one map per
 * snapshot) — this is the operation the mapping pipeline calls after a
 * successful run.
 */
export async function saveProjectMap(
  snapshotId: number,
  content: ProjectMapContent,
  db?: CatalogDb,
): Promise<ProjectMap> {
  const resolved = resolveDb(db)
  const existing = await getProjectMap(snapshotId, resolved)
  if (existing) {
    // The row exists, so the update always matches — the `??` is unreachable
    // but keeps the function total without a non-null assertion.
    return (
      (await updateProjectMap(snapshotId, content, resolved)) ??
      createProjectMap(snapshotId, content, resolved)
    )
  }
  return createProjectMap(snapshotId, content, resolved)
}

/** The outcome of {@link checkProjectMapFileReferences}. */
export interface ProjectMapReferenceCheck {
  /** True when every cited file path resolves to a real snapshot file. */
  ok: boolean
  /** Cited `keyFileMap` paths that do not resolve to a snapshot file. */
  missingKeyFiles: string[]
  /**
   * Flow-step `path` values (from `requestDataFlow` / `stateFlow` /
   * `aiCallFlow`) that are present but do not resolve to a snapshot file.
   * Each entry names the flow and the unresolved path.
   */
  missingFlowPaths: string[]
  /**
   * `debugPath` locations that look like a file path (contain a `/`) but do
   * not resolve. Informational only — a debug location may legitimately be a
   * free-form area ("the server action layer") rather than a path, so it does
   * not, on its own, fail the check.
   */
  unresolvedDebugLocations: string[]
}

/** Which flow a `missingFlowPaths` entry came from, labelled for the report. */
const FLOW_LABELS = {
  requestDataFlow: "requestDataFlow",
  stateFlow: "stateFlow",
  aiCallFlow: "aiCallFlow",
} as const

/**
 * Verify every file path a project map cites against a snapshot's file tree
 * (PRD FR-6 — every file reference in a generated map resolves to a real path).
 *
 * Pure and total. `keyFileMap[].path` and a present flow-step `path` are always
 * meant to be snapshot paths, so an unresolved one fails the check.
 * `debugPath[].location` is documented as "a path or area"; a path-shaped
 * location that does not resolve is reported separately as informational and
 * does not fail `ok`.
 *
 * @param content - the project-map content to verify.
 * @param fileTree - the snapshot's file tree (`RepoSnapshot.fileTree`).
 */
export function checkProjectMapFileReferences(
  content: ProjectMapContent,
  fileTree: RepoTreeEntry[],
): ProjectMapReferenceCheck {
  const filePaths = new Set(
    fileTree.filter((e) => e.type === "blob").map((e) => e.path),
  )

  const missingKeyFiles = content.keyFileMap
    .map((file) => file.path)
    .filter((path) => !filePaths.has(path))

  const missingFlowPaths: string[] = []
  for (const flow of ["requestDataFlow", "stateFlow", "aiCallFlow"] as const) {
    for (const step of content[flow]) {
      if (step.path !== undefined && !filePaths.has(step.path)) {
        missingFlowPaths.push(`${FLOW_LABELS[flow]}: ${step.path}`)
      }
    }
  }

  const unresolvedDebugLocations = content.debugPath
    .map((step) => step.location)
    .filter((loc) => loc.includes("/") && !filePaths.has(loc))

  return {
    ok: missingKeyFiles.length === 0 && missingFlowPaths.length === 0,
    missingKeyFiles,
    missingFlowPaths,
    unresolvedDebugLocations,
  }
}

/**
 * Run {@link checkProjectMapFileReferences} for a stored map, loading both the
 * map and its snapshot's file tree from the database.
 *
 * Returns `null` when the snapshot does not exist or has no map — the caller
 * distinguishes "nothing to check" from a real integrity failure.
 */
export async function checkProjectMapIntegrity(
  snapshotId: number,
  db?: CatalogDb,
): Promise<ProjectMapReferenceCheck | null> {
  const resolved = resolveDb(db)
  const map = await getProjectMap(snapshotId, resolved)
  if (!map) return null
  const snapshot = await getImportedRepoById(snapshotId, resolved)
  if (!snapshot) return null
  return checkProjectMapFileReferences(map, snapshot.fileTree)
}
