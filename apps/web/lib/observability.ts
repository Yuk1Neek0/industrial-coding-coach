// Server-side data access for the M13 Observability Page
// (`/observability/[owner]/[repo]`, task #227).
//
// A thin DB-path-resolved facade over the M13 data-access layer
// (`@workspace/db/observability` → `getObservability`, task #225). Mirrors
// `lib/delivery.ts` / `lib/portfolio.ts`.
//
// Imported only by server code (Server Components) — never a Client Component.
// READ-ONLY and offline: `getObservability` reads only the local snapshot
// (`repo_snapshots` + `repo_files` + `llm_traces` + `llm_evals`), so viewing
// needs no GITHUB_TOKEN, no ANTHROPIC_API_KEY, and no network (ADR 0009).
// `pnpm build` / `pnpm test` run with no keys. There are NO mutations and NO
// Server Actions on this page — it is a pure read.

import path from "node:path"

import {
  type CatalogDb,
  createCatalogDb,
  getObservability,
  type ObservabilityResult,
} from "@workspace/db"

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function observabilityDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(observabilityDbFile())
  return cached
}

/**
 * Read the Observability Page's view data for one imported repository's most
 * recent snapshot (or the given `ref`). Read-only and offline —
 * `getObservability` reads the local `llm_traces` / `llm_evals` recorded when
 * the bounded calls ran (Part A) and derives the Part-B story from the
 * snapshot's `repo_files`; it makes no network call and needs no API key.
 *
 * `getObservability` never throws and never returns null: it returns either a
 * populated `observability` result (the page renders Part A + Part B) or the
 * `no-snapshot` state (the page calls `notFound()`), so the route's
 * `not-found.tsx` renders without a stack trace.
 */
export async function getObservabilityPageData(
  owner: string,
  repo: string,
  ref?: string,
  injectedDb?: CatalogDb,
): Promise<ObservabilityResult> {
  const database = injectedDb ?? db()
  return getObservability(owner, repo, ref, { db: database })
}

export type { ObservabilityResult }
