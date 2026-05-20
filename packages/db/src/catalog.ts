// Typed data-access layer for the Golden Path Catalog (PRD FR-3).
//
// Server-side only — these functions open a local SQLite connection (ADR 0006).
// Each function accepts an optional `CatalogDb` so tests can inject a fixture
// database; in the app, callers omit it and a lazily-created default is used.

import { eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "./client"
import { type GoldenPath, goldenPaths } from "./schema"

let defaultDb: CatalogDb | undefined

/** Resolve the catalog DB: an injected one (tests) or the lazy default. */
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/** List every Golden Path in the catalog, ordered by name. */
export async function listGoldenPaths(
  catalogDb?: CatalogDb,
): Promise<GoldenPath[]> {
  return resolveDb(catalogDb).select().from(goldenPaths).orderBy(goldenPaths.name).all()
}

/** Get one Golden Path by its slug, or `null` when none matches. */
export async function getGoldenPathBySlug(
  slug: string,
  catalogDb?: CatalogDb,
): Promise<GoldenPath | null> {
  const rows = resolveDb(catalogDb)
    .select()
    .from(goldenPaths)
    .where(eq(goldenPaths.slug, slug))
    .limit(1)
    .all()
  return rows[0] ?? null
}
