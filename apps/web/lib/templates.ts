// Server-side data access for the Template Registry.
//
// Wraps the @workspace/db data-access layer with an explicit DB path resolved
// from the web app's working directory (the monorepo layout is stable).
// Mirrors `lib/catalog.ts`. Imported only by server components — never by
// client components.

import path from "node:path"

import {
  type CatalogDb,
  createCatalogDb,
  getTemplateBySlug,
  listTemplates,
  type Template,
} from "@workspace/db"

export type { Template }

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function registryDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(registryDbFile())
  return cached
}

/** Every template in the registry, ordered by name. */
export function getTemplates(): Promise<Template[]> {
  return listTemplates(db())
}

/** One template by slug, or `null` if none matches. */
export function getTemplate(slug: string): Promise<Template | null> {
  return getTemplateBySlug(slug, db())
}
