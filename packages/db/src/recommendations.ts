// Typed data-access layer for M4 recommendations (recommendation-engine PRD
// FR-6 / FR-7).
//
// Server-side only — opens a local SQLite connection (ADR 0006). Mirrors
// `catalog.ts` / `templates.ts`: each function accepts an optional `CatalogDb`
// so tests inject a fixture database; the app omits it and a lazily-created
// default is used. `updateRecommendation` supports human review and edit of a
// stored recommendation (FR-7).

import { eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "./client"
import {
  type NewRecommendation,
  type Recommendation,
  type RecommendationNarrative,
  recommendations,
  type RejectedRecommendation,
} from "./schema"

let defaultDb: CatalogDb | undefined

/** Resolve the catalog DB: an injected one (tests) or the lazy default. */
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/**
 * Persist a new recommendation and return the stored row, including its
 * generated `id` and timestamps.
 */
export async function createRecommendation(
  recommendation: NewRecommendation,
  catalogDb?: CatalogDb,
): Promise<Recommendation> {
  const rows = resolveDb(catalogDb)
    .insert(recommendations)
    .values(recommendation)
    .returning()
    .all()
  const row = rows[0]
  if (!row) {
    throw new Error("createRecommendation: insert returned no row.")
  }
  return row
}

/** Get one recommendation by its id, or `null` when none matches. */
export async function getRecommendationById(
  id: number,
  catalogDb?: CatalogDb,
): Promise<Recommendation | null> {
  const rows = resolveDb(catalogDb)
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, id))
    .limit(1)
    .all()
  return rows[0] ?? null
}

/** List every stored recommendation, oldest first (by id). */
export async function listRecommendations(
  catalogDb?: CatalogDb,
): Promise<Recommendation[]> {
  return resolveDb(catalogDb)
    .select()
    .from(recommendations)
    .orderBy(recommendations.id)
    .all()
}

/**
 * The fields a human reviewer may edit on a stored recommendation (FR-7). The
 * intake is the immutable input the recommendation was computed from and is not
 * editable; `narrative` may be set to `null` to clear it.
 */
export interface RecommendationEdit {
  recommendedGoldenPathSlug?: string
  recommendedTemplateSlugs?: string[]
  rejectedAlternatives?: RejectedRecommendation[]
  narrative?: RecommendationNarrative | null
}

/**
 * Apply a human edit to a stored recommendation and persist it (FR-7). Returns
 * the updated row, or `null` when no recommendation has that id. `updatedAt` is
 * always advanced.
 */
export async function updateRecommendation(
  id: number,
  edit: RecommendationEdit,
  catalogDb?: CatalogDb,
): Promise<Recommendation | null> {
  const rows = resolveDb(catalogDb)
    .update(recommendations)
    .set({ ...edit, updatedAt: new Date() })
    .where(eq(recommendations.id, id))
    .returning()
    .all()
  return rows[0] ?? null
}
