// Server-side data access for the Golden Path Catalog.
//
// Wraps the @workspace/db data-access layer with an explicit DB path resolved
// from the web app's working directory (the monorepo layout is stable).
// Imported only by server components — never by client components.

import path from "node:path"

import {
  type CatalogDb,
  createCatalogDb,
  getGoldenPathBySlug,
  type GoldenPath,
  listGoldenPaths,
} from "@workspace/db"

export type { GoldenPath }

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function catalogDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(catalogDbFile())
  return cached
}

/** Every Golden Path, ordered by name. */
export function getCatalogPaths(): Promise<GoldenPath[]> {
  return listGoldenPaths(db())
}

/** One Golden Path by slug, or `null` if none matches. */
export function getCatalogPath(slug: string): Promise<GoldenPath | null> {
  return getGoldenPathBySlug(slug, db())
}
