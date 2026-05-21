// Typed data-access layer for the Template Registry (PRD FR-5).
//
// Server-side only — these functions open a local SQLite connection (ADR 0006).
// Each function accepts an optional `CatalogDb` so tests can inject a fixture
// database; in the app, callers omit it and a lazily-created default is used.
//
// Mirrors `catalog.ts`: the registry lives in the same local SQLite store as
// the Golden Path Catalog. `resolveTemplates` turns a Golden Path's
// `templatesReferenced` slugs into full template entries.

import { inArray } from "drizzle-orm"
import { eq } from "drizzle-orm"

import { createCatalogDb, type CatalogDb } from "./client"
import { type Template, templates } from "./schema"

let defaultDb: CatalogDb | undefined

/** Resolve the catalog DB: an injected one (tests) or the lazy default. */
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/** List every template in the registry, ordered by name. */
export async function listTemplates(
  catalogDb?: CatalogDb,
): Promise<Template[]> {
  return resolveDb(catalogDb)
    .select()
    .from(templates)
    .orderBy(templates.name)
    .all()
}

/** Get one template by its slug, or `null` when none matches. */
export async function getTemplateBySlug(
  slug: string,
  catalogDb?: CatalogDb,
): Promise<Template | null> {
  const rows = resolveDb(catalogDb)
    .select()
    .from(templates)
    .where(eq(templates.slug, slug))
    .limit(1)
    .all()
  return rows[0] ?? null
}

/** List every template in a given category, ordered by name. */
export async function listTemplatesByCategory(
  category: string,
  catalogDb?: CatalogDb,
): Promise<Template[]> {
  return resolveDb(catalogDb)
    .select()
    .from(templates)
    .where(eq(templates.category, category))
    .orderBy(templates.name)
    .all()
}

/**
 * Resolve a Golden Path's `templatesReferenced` slugs into full template
 * entries (PRD FR-5).
 *
 * Returns one {@link Template} per slug that resolves, in the same order as the
 * input `slugs`. Duplicate slugs are de-duplicated; slugs with no matching
 * template are silently dropped — referential integrity is enforced separately
 * by the seed's integrity test (FR-6), not here.
 */
export async function resolveTemplates(
  slugs: string[],
  catalogDb?: CatalogDb,
): Promise<Template[]> {
  const uniqueSlugs = [...new Set(slugs)]
  if (uniqueSlugs.length === 0) return []

  const rows = resolveDb(catalogDb)
    .select()
    .from(templates)
    .where(inArray(templates.slug, uniqueSlugs))
    .all()

  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  return uniqueSlugs
    .map((slug) => bySlug.get(slug))
    .filter((row): row is Template => row !== undefined)
}
