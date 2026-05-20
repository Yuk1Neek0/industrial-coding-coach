import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import path from "node:path"
import { fileURLToPath } from "node:url"

import * as schema from "./schema"

/** Package root: packages/db (one level up from src/). */
const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

/** Default catalog database file: packages/db/catalog.db */
export const defaultDbFile = path.join(packageRoot, "catalog.db")

/**
 * Resolve the catalog SQLite file path. Uses the `DB_FILE_NAME` environment
 * variable when set, otherwise the package-local default.
 */
export function resolveDbFile(): string {
  return process.env.DB_FILE_NAME ?? defaultDbFile
}

/** A Drizzle client bound to the Golden Path Catalog database. */
export type CatalogDb = ReturnType<typeof createCatalogDb>

/**
 * Create a Drizzle client over the catalog SQLite database.
 *
 * @param dbFile - path to the SQLite file; defaults to {@link resolveDbFile}.
 */
export function createCatalogDb(dbFile: string = resolveDbFile()) {
  const sqlite = new Database(dbFile)
  sqlite.pragma("journal_mode = WAL")
  return drizzle(sqlite, { schema })
}
