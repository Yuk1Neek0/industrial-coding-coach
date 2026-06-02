// Public surface + typed data-access layer for the M12 CCPM module (Issue #203).
//
// `getDeliveryMap` is the single typed read the Delivery UI (Issue #205) calls
// through a Server Action. It composes the pure pieces — parse (#198) → graph
// (#200) → teaching (#202) — over an imported snapshot, and joins the persisted
// issue/PR links (#201). It reads ONLY the local snapshot (`repo_files` +
// `ccpm_issue_links`); it never touches the network or the live filesystem
// (ADR 0009, local-first).
//
// `importRepositoryWithLinks` is the thin orchestration that resolves links at
// IMPORT time (so the view above is always offline) without editing M11's
// `import.ts`: it runs the M11 import, then the #201 linking pass.

import { parseCcpmArtifact, type CcpmArtifact } from "./parse"
import { buildTraceabilityMap, type CcpmTraceabilityMap, type NoCcpmWorkflow } from "./graph"
import {
  buildCcpmTeaching,
  type CcpmDegradationTeaching,
  type CcpmTeaching,
} from "./teaching"
import { listCcpmLinks, resolveCcpmLinks } from "./linking"
import {
  importRepository,
  listRepoFiles,
  type GitHubResult,
  type ImportRepositoryInput,
  type ImportResult,
} from "../github"
import type { CatalogDb } from "../client"
import type { CcpmIssueLink } from "../schema"

// Re-export the module's pure surface so callers can `from "@workspace/db/ccpm"`.
export * from "./parse"
export * from "./graph"
export * from "./teaching"
export * from "./linking"

/** Options for {@link getDeliveryMap}. */
export interface GetDeliveryMapOptions {
  /** The imported ref to read. Omitted → the most recent snapshot. */
  ref?: string
  /** Catalog DB. Injectable for tests; omitted → the package-local default. */
  db?: CatalogDb
}

/** A populated delivery map: graph + teaching + persisted links by taskRef. */
export interface DeliveryMap {
  kind: "map"
  map: CcpmTraceabilityMap
  teaching: CcpmTeaching
  /** Resolved issue/PR link per task, keyed by `taskRef` (empty until linked). */
  links: Record<string, CcpmIssueLink>
}

/** The degradation result: detection state + educational teaching. */
export interface DeliveryMapAbsent {
  kind: "absent"
  detection: NoCcpmWorkflow
  teaching: CcpmDegradationTeaching
}

export type DeliveryMapResult = DeliveryMap | DeliveryMapAbsent

/**
 * Read the delivery traceability map for an imported repository (Issue #203).
 *
 * Parses the snapshot's CCPM artifacts, builds the graph + teaching, and joins
 * the persisted issue/PR links. Returns the degradation result (with the
 * educational teaching) when the snapshot has no CCPM artifacts — never an error
 * or empty crash. Performs ZERO network calls and never reads the live
 * filesystem: links come from `ccpm_issue_links`, resolved earlier at import.
 */
export async function getDeliveryMap(
  owner: string,
  repo: string,
  options: GetDeliveryMapOptions = {},
): Promise<DeliveryMapResult> {
  const files = await listRepoFiles(owner, repo, options.ref, options.db)
  const artifacts: CcpmArtifact[] = []
  for (const file of files) {
    const parsed = parseCcpmArtifact(file.path, file.content)
    if (parsed !== null) artifacts.push(parsed)
  }

  const graph = buildTraceabilityMap(artifacts)
  const teaching = buildCcpmTeaching(graph)

  if (graph.kind === "absent") {
    // Teaching mirrors the graph kind by construction; narrow defensively.
    if (teaching.kind !== "absent") {
      throw new Error("unreachable: absent graph produced map teaching")
    }
    return { kind: "absent", detection: graph, teaching }
  }
  if (teaching.kind !== "map") {
    throw new Error("unreachable: map graph produced absent teaching")
  }

  const linkRows = await listCcpmLinks(owner, repo, {
    ref: options.ref,
    db: options.db,
  })
  const links: Record<string, CcpmIssueLink> = {}
  for (const row of linkRows) links[row.taskRef] = row

  return { kind: "map", map: graph, teaching, links }
}

/**
 * Import a repository AND resolve its CCPM issue/PR links in one step, so the
 * delivery map view is always offline (ADR 0009). A thin orchestration over the
 * M11 import + the #201 linking pass — it does NOT modify `import.ts`.
 *
 * Linking is best-effort: a per-issue boundary failure is stored as a per-task
 * annotation by {@link resolveCcpmLinks}, never failing the import. If the import
 * itself fails, its typed error is returned and linking is skipped.
 */
export async function importRepositoryWithLinks(
  input: ImportRepositoryInput,
): Promise<GitHubResult<ImportResult>> {
  const result = await importRepository(input)
  if (!result.ok) return result

  await resolveCcpmLinks(input.owner, input.repo, {
    ...(input.ref !== undefined ? { ref: input.ref } : {}),
    ...(input.client !== undefined ? { client: input.client } : {}),
    ...(input.db !== undefined ? { db: input.db } : {}),
  })
  return result
}
