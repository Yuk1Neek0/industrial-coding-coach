// Public surface + typed data-access layer for the M13 LLM-observability module
// (Issue #225).
//
// `getObservability` is the single typed read the Observability UI calls through
// a Server Action. It composes the two halves the page renders:
//
//   - Part A — the RUNTIME story: the `llm_traces` recorded against the
//     snapshot (each with its `llm_evals`), plus per-`traceName` aggregates
//     (call count, eval pass-rate, total + average cost in USD and latency in
//     ms). This is what the app actually observed about its own bounded SDK
//     calls (Wave-1 record seam, Issue #222), read back per repo.
//   - Part B — the REPO story + teaching: run the pure Part-B analyzer
//     (`analyzeObservability`, Issue #221) over the snapshot's `repo_files` and
//     turn it into beginner-first teaching (`buildObservabilityTeaching`, Issue
//     #223). This is "how observable is THIS repo, and how would you talk about
//     monitoring it" — independent of whether the app has recorded any traces.
//
// This layer adds NO new analysis: it QUERIES the Wave-1 tables and SHAPES the
// existing pure modules. It reads ONLY the local SQLite catalog (`repo_snapshots`
// + `repo_files` + `llm_traces` + `llm_evals`); it performs ZERO network calls
// and needs no API key (ADR 0009, local-first — the data-access layer issues no
// SDK call). The snapshot is resolved for `owner/repo` exactly the way
// `getDeliveryMap` (M12) does: latest import, or the given `ref`.

import { eq, inArray } from "drizzle-orm"

import { getImportedRepo, listRepoFiles } from "../github"
import { llmEvals, llmTraces, type LlmEval, type LlmTrace } from "../schema"
import type { CatalogDb } from "../client"
import { createCatalogDb } from "../client"
import {
  analyzeObservability,
  type ObservabilityFile,
  type ObservabilityStory,
} from "./detect"
import {
  buildObservabilityTeaching,
  type ObservabilityTeachingResult,
} from "./teaching"

// Re-export the module's pure surface so callers can `from "@workspace/db/observability"`.
// Names are DISTINCT across cost / detect / teaching / record (and the result
// types below), so `export *` from the package barrel cannot collide (the M12
// lesson — see ccpm's `*Artifact` suffixing).
export * from "./cost"
export * from "./detect"
export * from "./teaching"
export * from "./record"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/** Options for {@link getObservability}. */
export interface GetObservabilityOptions {
  /** The imported ref to read. Omitted → the most recent snapshot. */
  ref?: string
  /** Catalog DB. Injectable for tests; omitted → the package-local default. */
  db?: CatalogDb
}

/**
 * One recorded trace joined with its graded checks — the per-call detail the
 * Observability UI lists. `evals` is empty when the trace was never graded.
 */
export interface TraceWithEvals {
  /** The recorded `llm_traces` row. */
  trace: LlmTrace
  /** The `llm_evals` rows for this trace, in id order; empty when ungraded. */
  evals: LlmEval[]
}

/**
 * Per-`traceName` aggregates over the snapshot's recorded traces — the summary
 * row the Observability UI shows for each logical call site (e.g.
 * `m10.generate-qa`).
 */
export interface TraceNameAggregate {
  /** The stable trace name these aggregates roll up, e.g. `m10.generate-qa`. */
  traceName: string
  /** Number of recorded traces (calls) with this name. */
  callCount: number
  /** Total number of evals (graded checks) across this name's traces. */
  evalCount: number
  /** Number of those evals that passed. */
  evalPassCount: number
  /**
   * Eval pass-rate in `[0, 1]`, or `null` when no evals were recorded for this
   * name (so the UI can distinguish "0% passed" from "nothing graded yet").
   */
  evalPassRate: number | null
  /** Total estimated cost across this name's traces, in USD. */
  totalCostUsd: number
  /** Average estimated cost per call, in USD (`totalCostUsd / callCount`). */
  averageCostUsd: number
  /** Total wall-clock latency across this name's traces, in ms. */
  totalLatencyMs: number
  /** Average latency per call, in ms (`totalLatencyMs / callCount`). */
  averageLatencyMs: number
}

/**
 * Part A — the runtime observability story for a snapshot: every recorded trace
 * (with its evals) plus the per-`traceName` aggregates. Empty (both arrays `[]`)
 * for a snapshot that has recorded no traces yet — a clean, valid result.
 */
export interface ObservabilityPartA {
  /** Every recorded trace for the snapshot, each joined with its evals. */
  traces: TraceWithEvals[]
  /** Per-`traceName` aggregates, ordered by trace name. */
  aggregates: TraceNameAggregate[]
}

/**
 * Part B — the repo observability story + its teaching, derived from the
 * snapshot's `repo_files`. `story.kind` / `teaching.kind` is `"llm-app"` for a
 * detected LLM app, or `"absent"` for a non-LLM repo (a clean, valid result —
 * never an error).
 */
export interface ObservabilityPartB {
  /** The pure Part-B detection result (Issue #221). */
  story: ObservabilityStory
  /** The teaching built from the story (Issue #223). */
  teaching: ObservabilityTeachingResult
}

/**
 * A populated observability read for a resolved snapshot: Part A (runtime
 * traces + aggregates) and Part B (repo story + teaching).
 */
export interface Observability {
  kind: "observability"
  /** The resolved snapshot's primary-key id (traces are filtered by it). */
  snapshotId: number
  /** Part A — the recorded traces, evals, and per-name aggregates. */
  partA: ObservabilityPartA
  /** Part B — the repo observability story + teaching. */
  partB: ObservabilityPartB
}

/**
 * The clean miss: no imported snapshot matched `owner/repo` (+ `ref`). Mirrors
 * `getDeliveryMap`'s graceful absent shape — a discriminated result, never a
 * throw — so the UI can render an "import this repo first" state instead of
 * crashing.
 */
export interface ObservabilityNoSnapshot {
  kind: "no-snapshot"
  owner: string
  repo: string
  /** The ref that was requested, if any. */
  ref?: string
}

export type ObservabilityResult = Observability | ObservabilityNoSnapshot

/**
 * Read the LLM-observability view for an imported repository (Issue #225).
 *
 * Composes Part A (the snapshot's recorded traces + evals + per-`traceName`
 * cost/latency/pass-rate aggregates) and Part B (the repo observability story +
 * teaching, from `repo_files` via `analyzeObservability` → `buildObservability-
 * Teaching`). Resolves the snapshot for `owner/repo` (latest, or `ref` when
 * given) exactly the way `getDeliveryMap` does, via {@link getImportedRepo}.
 *
 * NEVER throws and always returns a clean result:
 *   - no snapshot found            → `{ kind: "no-snapshot", ... }`;
 *   - snapshot with no traces yet  → Part A `{ traces: [], aggregates: [] }`;
 *   - non-LLM repo                 → Part B `story.kind === "absent"`.
 *
 * Performs ZERO network calls and needs no API key: traces/evals come from the
 * Wave-1 tables filtered by `snapshotId`, Part B from the snapshot's `repo_files`
 * — the read path issues no SDK call (ADR 0009, local-first, offline).
 */
export async function getObservability(
  owner: string,
  repo: string,
  ref?: string,
  options: GetObservabilityOptions = {},
): Promise<ObservabilityResult> {
  const db = resolveDb(options.db)
  // Resolve the snapshot for owner/repo (+ ref) the same way getDeliveryMap does.
  const snapshot = await getImportedRepo(owner, repo, ref ?? options.ref, db)
  if (!snapshot) {
    const resolvedRef = ref ?? options.ref
    return {
      kind: "no-snapshot",
      owner,
      repo,
      ...(resolvedRef !== undefined ? { ref: resolvedRef } : {}),
    }
  }

  const partA = await readPartA(snapshot.id, db)
  const partB = await readPartB(owner, repo, ref ?? options.ref, db)

  return { kind: "observability", snapshotId: snapshot.id, partA, partB }
}

/**
 * Part A — read every trace for the snapshot, join each with its evals, and roll
 * up the per-`traceName` aggregates. Returns empty arrays for a snapshot with no
 * recorded traces (a clean, valid result). Reads only the Wave-1 tables, filtered
 * by `snapshotId`; joins evals by `traceId`.
 */
async function readPartA(
  snapshotId: number,
  db: CatalogDb,
): Promise<ObservabilityPartA> {
  // Traces for this snapshot, oldest first (startedAt) so a name's calls read in
  // chronological order; falls back to id for a stable, deterministic tiebreak.
  const traceRows = db
    .select()
    .from(llmTraces)
    .where(eq(llmTraces.snapshotId, snapshotId))
    .all()

  if (traceRows.length === 0) {
    return { traces: [], aggregates: [] }
  }

  const orderedTraces = [...traceRows].sort(compareTraces)

  // Evals for those traces, grouped by traceId (one query for all of them).
  const traceIds = orderedTraces.map((t) => t.id)
  const evalRows = db
    .select()
    .from(llmEvals)
    .where(inArray(llmEvals.traceId, traceIds))
    .all()
  const evalsByTrace = new Map<number, LlmEval[]>()
  for (const evalRow of evalRows) {
    const bucket = evalsByTrace.get(evalRow.traceId)
    if (bucket) bucket.push(evalRow)
    else evalsByTrace.set(evalRow.traceId, [evalRow])
  }
  for (const bucket of evalsByTrace.values()) {
    bucket.sort((a, b) => a.id - b.id)
  }

  const traces: TraceWithEvals[] = orderedTraces.map((trace) => ({
    trace,
    evals: evalsByTrace.get(trace.id) ?? [],
  }))

  const aggregates = aggregateByTraceName(traces)

  return { traces, aggregates }
}

/**
 * Part B — run the pure Part-B analyzer over the snapshot's `repo_files`, then
 * build the teaching. Reads only `repo_files` (via `listRepoFiles`, which
 * resolves the same snapshot); returns the `absent` story/teaching for a non-LLM
 * repo. No network, no SDK call.
 */
async function readPartB(
  owner: string,
  repo: string,
  ref: string | undefined,
  db: CatalogDb,
): Promise<ObservabilityPartB> {
  const files = await listRepoFiles(owner, repo, ref, db)
  const obsFiles: ObservabilityFile[] = files.map((file) => ({
    path: file.path,
    content: file.content,
    category: file.category,
  }))
  const story = analyzeObservability(obsFiles)
  const teaching = buildObservabilityTeaching(story)
  return { story, teaching }
}

/** Stable trace ordering: by `startedAt` ascending, then by id. */
function compareTraces(a: LlmTrace, b: LlmTrace): number {
  const at = a.startedAt instanceof Date ? a.startedAt.getTime() : 0
  const bt = b.startedAt instanceof Date ? b.startedAt.getTime() : 0
  if (at !== bt) return at - bt
  return a.id - b.id
}

/**
 * Roll up per-`traceName` aggregates over the joined traces, ordered by trace
 * name. Pass-rate is `null` when a name's traces recorded no evals (so the UI
 * can distinguish "nothing graded" from "0% passed"); averages divide by call
 * count (always ≥ 1 within a group).
 */
function aggregateByTraceName(traces: TraceWithEvals[]): TraceNameAggregate[] {
  interface Acc {
    callCount: number
    evalCount: number
    evalPassCount: number
    totalCostUsd: number
    totalLatencyMs: number
  }
  const byName = new Map<string, Acc>()

  for (const { trace, evals } of traces) {
    const acc = byName.get(trace.name) ?? {
      callCount: 0,
      evalCount: 0,
      evalPassCount: 0,
      totalCostUsd: 0,
      totalLatencyMs: 0,
    }
    acc.callCount += 1
    acc.evalCount += evals.length
    acc.evalPassCount += evals.filter((e) => e.passed).length
    acc.totalCostUsd += trace.estimatedCostUsd
    acc.totalLatencyMs += trace.latencyMs
    byName.set(trace.name, acc)
  }

  return [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([traceName, acc]) => ({
      traceName,
      callCount: acc.callCount,
      evalCount: acc.evalCount,
      evalPassCount: acc.evalPassCount,
      evalPassRate:
        acc.evalCount > 0 ? acc.evalPassCount / acc.evalCount : null,
      totalCostUsd: acc.totalCostUsd,
      averageCostUsd: acc.totalCostUsd / acc.callCount,
      totalLatencyMs: acc.totalLatencyMs,
      averageLatencyMs: acc.totalLatencyMs / acc.callCount,
    }))
}
