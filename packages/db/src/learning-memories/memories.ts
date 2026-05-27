// Typed data-access layer for the `learning_memories` table
// (learning-memory-portfolio-export PRD FR-9, Issue #176).
//
// This is the single typed interface the M10 Learning Memory and Portfolio
// Export reads and writes learning memories through. It covers read by
// snapshot, upsert (one row per snapshot — PRD FR-1, FR-5), and the
// stale-memory check the Portfolio Page's banner (PRD FR-11) uses.
//
// Server-side only — these functions open (or are handed) a local SQLite
// connection (ADR 0006). Every function accepts an optional `CatalogDb` so
// tests inject a fixture database; in the app, callers omit it and a lazily
// created package-local default is used. Style mirrors
// `../mapper/project-maps.ts` and `../learning-units/units.ts`: small fully
// typed functions, `null` for a clean miss, one memory per snapshot.

import { eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "../client"
import { getImportedRepo, getImportedRepoById } from "../github/repos"
import {
  type ArchitectureExplanation,
  type DebugStory,
  type InterviewQA,
  type LearningMemory,
  learningMemories,
  type LearningMemoryTree,
  type ResumeBullet,
} from "../schema"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/**
 * The structured body of a learning memory — the five generated artifacts the
 * M10 synthesis layer produces, without the snapshot key or audit timestamps.
 *
 * This is the contract M10's two bounded SDK calls (tasks #180, #181) and its
 * three deterministic composers (task #179) produce, so the producers and the
 * store agree on one shape.
 */
export interface LearningMemoryContent {
  /** Interview Q&A from the bounded SDK call (task #180). */
  interviewQa: InterviewQA[]
  /** Résumé bullets from the bounded SDK call (task #181). */
  resumeBullets: ResumeBullet[]
  /** Architecture explanation, deterministically composed from M5/M6. */
  architectureExplanation: ArchitectureExplanation
  /** Learning memory tree, deterministically composed from M7/M8/M9. */
  learningMemoryTree: LearningMemoryTree
  /** Per-attempt debug stories, deterministically composed from M9. */
  debugStories: DebugStory[]
}

/**
 * Get the learning memory stored for a snapshot by its `id`, or `null` when
 * the snapshot has no memory yet.
 */
export async function getMemory(
  snapshotId: number,
  db?: CatalogDb,
): Promise<LearningMemory | null> {
  const rows = resolveDb(db)
    .select()
    .from(learningMemories)
    .where(eq(learningMemories.snapshotId, snapshotId))
    .limit(1)
    .all()
  return rows[0] ?? null
}

/**
 * Get the learning memory for an imported repository by `owner` / `repo` /
 * `ref`, resolving the snapshot through the M11 data-access layer first.
 *
 * Returns `null` both when the repository is not imported and when it is
 * imported but not yet memorised — use {@link getImportedRepo} first if the
 * caller needs to tell those two cases apart.
 */
export async function getMemoryByRepo(
  owner: string,
  repo: string,
  ref: string | undefined,
  db?: CatalogDb,
): Promise<LearningMemory | null> {
  const resolved = resolveDb(db)
  const snapshot = await getImportedRepo(owner, repo, ref, resolved)
  if (!snapshot) return null
  return getMemory(snapshot.id, resolved)
}

/**
 * Insert a new memory row for a snapshot and return the stored row.
 *
 * Fails if the snapshot already has a memory — the table holds at most one
 * per snapshot. Use {@link upsertMemory} to create-or-replace, which is the
 * regeneration path M10 actually uses.
 */
export async function createMemory(
  snapshotId: number,
  content: LearningMemoryContent,
  db?: CatalogDb,
): Promise<LearningMemory> {
  const now = new Date()
  return resolveDb(db)
    .insert(learningMemories)
    .values({ snapshotId, ...content, generatedAt: now })
    .returning()
    .get()
}

/**
 * Replace the stored content of an existing memory, bumping `generatedAt` +
 * `updatedAt`. Returns the updated row, or `null` when the snapshot has no
 * memory to update.
 */
export async function updateMemory(
  snapshotId: number,
  content: LearningMemoryContent,
  db?: CatalogDb,
): Promise<LearningMemory | null> {
  const now = new Date()
  const rows = resolveDb(db)
    .update(learningMemories)
    .set({ ...content, generatedAt: now, updatedAt: now })
    .where(eq(learningMemories.snapshotId, snapshotId))
    .returning()
    .all()
  return rows[0] ?? null
}

/**
 * Create the snapshot's memory, or replace it if one already exists. This is
 * the regeneration path the M10 Portfolio Page's "Regenerate memory" Server
 * Action calls (PRD FR-5).
 */
export async function upsertMemory(
  snapshotId: number,
  content: LearningMemoryContent,
  db?: CatalogDb,
): Promise<LearningMemory> {
  const resolved = resolveDb(db)
  const existing = await getMemory(snapshotId, resolved)
  if (existing) {
    // The row exists, so the update always matches — the `??` is unreachable
    // but keeps the function total without a non-null assertion.
    return (
      (await updateMemory(snapshotId, content, resolved)) ??
      createMemory(snapshotId, content, resolved)
    )
  }
  return createMemory(snapshotId, content, resolved)
}

/**
 * True when the memory's `generated_at` is older than its underlying
 * snapshot's `updated_at`. Drives the "memory may be stale — regenerate"
 * banner on the Portfolio Page (PRD FR-11).
 *
 * Returns `true` if no memory exists yet — the page must offer regeneration
 * either way. Returns `false` when the memory exists and is at least as new
 * as the snapshot.
 */
export async function isMemoryStale(
  snapshotId: number,
  db?: CatalogDb,
): Promise<boolean> {
  const resolved = resolveDb(db)
  const memory = await getMemory(snapshotId, resolved)
  if (!memory) return true
  const snapshot = await getImportedRepoById(snapshotId, resolved)
  if (!snapshot) {
    // The FK protects against this, but guard defensively rather than throwing.
    return true
  }
  return snapshot.updatedAt.getTime() > memory.generatedAt.getTime()
}
