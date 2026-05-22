// Typed data-access layer for the `stack_explanations` table
// (stack-explainer PRD FR-6/FR-7, Issue #87).
//
// This is the single typed interface the Stack Explainer UI (#89) reads and
// writes stack explanations through. It covers create / read / update, keyed by
// imported-repo snapshot, plus the file-reference integrity check FR-4 requires:
// proof that every file path an explanation cites resolves to a real path in
// the snapshot it explains.
//
// Server-side only — these functions open (or are handed) a local SQLite
// connection (ADR 0006). Every function accepts an optional `CatalogDb` so
// tests inject a fixture database; in the app, callers omit it and a lazily
// created package-local default is used. Style mirrors `../templates.ts` and
// `../github/repos.ts`: small fully typed functions, `null` for a clean miss.

import { eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "../client"
import { getImportedRepo, getImportedRepoById } from "../github/repos"
import {
  type DebugEntryPoint,
  type KeyFilePointer,
  type RepoTreeEntry,
  type StackExplanation,
  type StackTool,
  stackExplanations,
} from "../schema"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/**
 * The structured body of a stack explanation — the JSON-column fields, without
 * the snapshot key or the row's audit timestamps.
 *
 * This is the contract the M5 explanation call (#86) produces and the
 * data-access layer persists, so the producer and the store agree on one shape.
 */
export interface StackExplanationContent {
  /** The explained stack — one entry per major tool (the decision map). */
  tools: StackTool[]
  /** Key files worth inspecting to understand the project. */
  keyFiles: KeyFilePointer[]
  /** Where to start debugging common failures. */
  debugEntryPoints: DebugEntryPoint[]
}

/**
 * Get the stack explanation stored for a snapshot by its `id`, or `null` when
 * the snapshot has not been explained yet.
 */
export async function getStackExplanation(
  snapshotId: number,
  db?: CatalogDb,
): Promise<StackExplanation | null> {
  const rows = resolveDb(db)
    .select()
    .from(stackExplanations)
    .where(eq(stackExplanations.snapshotId, snapshotId))
    .limit(1)
    .all()
  return rows[0] ?? null
}

/**
 * Get the stack explanation for an imported repository by `owner` / `repo` /
 * `ref`, resolving the snapshot through the M11 data-access layer first.
 *
 * Returns `null` both when the repository is not imported and when it is
 * imported but not yet explained — use {@link getImportedRepo} first if the
 * caller needs to tell those two cases apart.
 */
export async function getStackExplanationByRepo(
  owner: string,
  repo: string,
  ref?: string,
  db?: CatalogDb,
): Promise<StackExplanation | null> {
  const resolved = resolveDb(db)
  const snapshot = await getImportedRepo(owner, repo, ref, resolved)
  if (!snapshot) return null
  return getStackExplanation(snapshot.id, resolved)
}

/**
 * Insert a new stack explanation for a snapshot and return the stored row.
 *
 * Fails if the snapshot already has an explanation — the table holds at most
 * one per snapshot. Use {@link saveStackExplanation} to create-or-replace.
 */
export async function createStackExplanation(
  snapshotId: number,
  content: StackExplanationContent,
  db?: CatalogDb,
): Promise<StackExplanation> {
  return resolveDb(db)
    .insert(stackExplanations)
    .values({ snapshotId, ...content })
    .returning()
    .get()
}

/**
 * Replace the stored content of an existing stack explanation, bumping
 * `updatedAt`. Returns the updated row, or `null` when the snapshot has no
 * explanation to update.
 */
export async function updateStackExplanation(
  snapshotId: number,
  content: StackExplanationContent,
  db?: CatalogDb,
): Promise<StackExplanation | null> {
  const rows = resolveDb(db)
    .update(stackExplanations)
    .set({ ...content, updatedAt: new Date() })
    .where(eq(stackExplanations.snapshotId, snapshotId))
    .returning()
    .all()
  return rows[0] ?? null
}

/**
 * Create the snapshot's stack explanation, or replace it if one already exists.
 *
 * Re-explaining a snapshot updates its row in place (schema: one explanation
 * per snapshot) — this is the operation the explainer calls after a successful
 * explanation call.
 */
export async function saveStackExplanation(
  snapshotId: number,
  content: StackExplanationContent,
  db?: CatalogDb,
): Promise<StackExplanation> {
  const resolved = resolveDb(db)
  const existing = await getStackExplanation(snapshotId, resolved)
  if (existing) {
    // The row exists, so the update always matches — the `??` is unreachable
    // but keeps the function total without a non-null assertion.
    return (
      (await updateStackExplanation(snapshotId, content, resolved)) ??
      createStackExplanation(snapshotId, content, resolved)
    )
  }
  return createStackExplanation(snapshotId, content, resolved)
}

/** The outcome of {@link checkFileReferences}. */
export interface FileReferenceCheck {
  /** True when every cited key-file path resolves to a real snapshot file. */
  ok: boolean
  /** Cited `keyFiles` paths that do not resolve to a snapshot file. */
  missingKeyFiles: string[]
  /**
   * `debugEntryPoints` locations that look like a file path (contain a `/`)
   * but do not resolve. Informational only — a debug location may legitimately
   * be a free-form area ("the server action layer") rather than a path, so it
   * does not, on its own, fail the check.
   */
  unresolvedDebugLocations: string[]
}

/**
 * Verify every file path a stack explanation cites against a snapshot's file
 * tree (PRD FR-4 — "every file reference resolves to a real path").
 *
 * Pure and total. `keyFiles[].path` is always meant to be a snapshot path, so
 * an unresolved one fails the check. `debugEntryPoints[].location` is
 * documented as "a path or area"; a path-shaped location that does not resolve
 * is reported separately as informational and does not fail `ok`.
 *
 * @param content - the explanation content to verify.
 * @param fileTree - the snapshot's file tree (`RepoSnapshot.fileTree`).
 */
export function checkFileReferences(
  content: StackExplanationContent,
  fileTree: RepoTreeEntry[],
): FileReferenceCheck {
  const filePaths = new Set(
    fileTree.filter((e) => e.type === "blob").map((e) => e.path),
  )

  const missingKeyFiles = content.keyFiles
    .map((k) => k.path)
    .filter((path) => !filePaths.has(path))

  const unresolvedDebugLocations = content.debugEntryPoints
    .map((d) => d.location)
    .filter((loc) => loc.includes("/") && !filePaths.has(loc))

  return {
    ok: missingKeyFiles.length === 0,
    missingKeyFiles,
    unresolvedDebugLocations,
  }
}

/**
 * Run {@link checkFileReferences} for a stored explanation, loading both the
 * explanation and its snapshot's file tree from the database.
 *
 * Returns `null` when the snapshot does not exist or has no explanation — the
 * caller distinguishes "nothing to check" from a real integrity failure.
 */
export async function checkStackExplanationIntegrity(
  snapshotId: number,
  db?: CatalogDb,
): Promise<FileReferenceCheck | null> {
  const resolved = resolveDb(db)
  const explanation = await getStackExplanation(snapshotId, resolved)
  if (!explanation) return null
  const snapshot = await getImportedRepoById(snapshotId, resolved)
  if (!snapshot) return null
  return checkFileReferences(explanation, snapshot.fileTree)
}
