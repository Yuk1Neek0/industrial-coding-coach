// Server-side data access for the M12 Delivery Traceability Page
// (`/delivery/[owner]/[repo]`, task #205).
//
// A thin DB-path-resolved facade over the M12 data-access layer
// (`@workspace/db/ccpm` → `getDeliveryMap`) and the M11 snapshot DAL
// (`getImportedRepo`). Mirrors `lib/portfolio.ts` / `lib/challenges.ts`.
//
// Imported only by server code (Server Components) — never a Client Component.
// READ-ONLY and offline: `getDeliveryMap` reads only the local snapshot
// (`repo_files` + `ccpm_issue_links`), so viewing needs no GITHUB_TOKEN, no
// ANTHROPIC_API_KEY, and no network (ADR 0009). `pnpm build` / `pnpm test` run
// with no keys.

import path from "node:path"

import {
  type CatalogDb,
  createCatalogDb,
  type DeliveryMapResult,
  getDeliveryMap,
  getImportedRepo,
} from "@workspace/db"

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function deliveryDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(deliveryDbFile())
  return cached
}

/** Repo identity rendered in the page header (mirrors `lib/portfolio.ts`). */
export interface DeliveryRepoIdentity {
  owner: string
  repo: string
  /** The imported snapshot's ref/branch. */
  branch: string
  /** Snapshot primary-key id. */
  snapshotId: number
}

/**
 * The Delivery Page's top-level view shape. Either the snapshot is missing
 * (the route renders its `not-found.tsx`), or it exists and the page renders
 * the header + the `DeliveryMapResult` (the populated map or the `absent`
 * educational state — both are valid resting states, never an error).
 */
export interface DeliveryPageData {
  /** `true` when the owner/repo is imported; `false` triggers `notFound()`. */
  snapshotExists: boolean
  /** Snapshot identity; only populated when `snapshotExists === true`. */
  identity: DeliveryRepoIdentity | null
  /** The composed delivery map (or degradation state); `null` only when no snapshot. */
  result: DeliveryMapResult | null
}

/**
 * Read the Delivery Page's view data for one imported repository's most recent
 * snapshot. Read-only and offline — `getDeliveryMap` joins the issue/PR links
 * that were resolved earlier at import; it makes no network call.
 *
 * Returns `snapshotExists: false` when the repo is not imported, so the page's
 * `not-found.tsx` renders without a stack trace.
 */
export async function getDeliveryPageData(
  owner: string,
  repo: string,
  injectedDb?: CatalogDb,
): Promise<DeliveryPageData> {
  const database = injectedDb ?? db()

  const snapshot = await getImportedRepo(owner, repo, undefined, database)
  if (!snapshot) {
    return { snapshotExists: false, identity: null, result: null }
  }

  const result = await getDeliveryMap(owner, repo, { db: database })

  return {
    snapshotExists: true,
    identity: {
      owner: snapshot.owner,
      repo: snapshot.repo,
      branch: snapshot.ref,
      snapshotId: snapshot.id,
    },
    result,
  }
}

export type { DeliveryMapResult }
