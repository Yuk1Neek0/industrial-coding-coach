// Recording seam for LLM observability (M13 epic llm-observability, Issue #222).
//
// `createObservedLlmClient` is a DECORATOR over a `@workspace/ai` `LlmClient`:
// it satisfies the same `LlmClient` interface (so a bounded call can swap it in
// transparently) and, as a side effect, records each `complete()` turn into the
// local `llm_traces` table. A single observed client instance corresponds to ONE
// logical bounded call: the first turn inserts the trace row, every later turn
// UPDATES its aggregates and appends to the per-turn `observations` JSON array.
// Multi-turn tool-use loops therefore roll up into ONE trace, not one per turn.
//
// `recordEval` writes one `llm_evals` row tied to a recorded trace.
//
// The CARDINAL rule (Issue #222 AC-5, ADR 0009 local-first): instrumentation is
// best-effort and NON-BLOCKING. Every observability write goes through the
// private `safeWrite`, which try/catches and logs — it never throws, never
// changes the wrapped call's result, ordering, or latency. A failed recorder DB
// is invisible to the caller: the inner `complete()` result (success OR failure)
// is always returned UNCHANGED. This module IMPORTS the Wave-1 schema, cost
// estimator, and db client; it never edits them, and it never touches the
// network.

import type Anthropic from "@anthropic-ai/sdk"
import { eq } from "drizzle-orm"

import { DEFAULT_MODEL, type LlmClient, type LlmRequest } from "@workspace/ai"

import { createCatalogDb, type CatalogDb } from "../client"
import {
  llmEvals,
  llmTraces,
  type LlmObservation,
  type LlmTraceOutcome,
  type NewLlmEval,
  type NewLlmTrace,
} from "../schema"
import { estimateCostUsd } from "./cost"

/** Options for {@link createObservedLlmClient}. */
export interface ObservedLlmClientOptions {
  /**
   * Stable call name identifying the call site, e.g. `m10.generate-qa`. Stored
   * on the trace's `name` column so traces for the same logical call are
   * recognizable across runs.
   */
  traceName: string
  /**
   * The imported repo snapshot this call runs against, if any. Nullable — not
   * every bounded call is snapshot-scoped (Issue #222 AC-1, schema note).
   */
  snapshotId?: number | null
  /** Catalog DB. Injectable for tests; omitted → the package-local default. */
  db?: CatalogDb
  /**
   * The primary model recorded on the trace before any turn has run, and used
   * for cost when a turn's `usage` does not carry a model of its own. Defaults
   * to `@workspace/ai`'s {@link DEFAULT_MODEL}; each turn still records the
   * model the request actually asked for.
   */
  model?: string
}

/**
 * An {@link LlmClient} that records its turns into `llm_traces`. It satisfies
 * the plain `LlmClient` interface (so callers can use it anywhere a client is
 * expected) and additionally exposes the just-recorded trace id so
 * {@link recordEval} can associate an eval with it.
 */
export interface ObservedLlmClient extends LlmClient {
  /**
   * The id of the `llm_traces` row this client is recording into, or `null`
   * until the first `complete()` turn has inserted it (and `null` for the
   * lifetime of the client if that first insert was swallowed by `safeWrite`).
   */
  readonly traceId: number | null
}

/** Anything {@link recordEval} can resolve a trace id from. */
export type TraceRef = ObservedLlmClient | { traceId: number | null } | number

/** One graded check to attach to a recorded trace. */
export interface EvalInput {
  /** The name of the check that was run, e.g. `valid-json`. */
  check: string
  /** Whether the check passed. */
  passed: boolean
  /** Optional plain-language reason for the result. */
  reason?: string | null
}

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

/**
 * Run an observability write, swallowing ANY error.
 *
 * This is the non-blocking guarantee in one place: a thrown write (a broken
 * recorder DB, a serialization error, anything) is caught and logged, never
 * rethrown. Callers must never let a recorder failure escape into the wrapped
 * call's result, ordering, or latency path. Returns the fn's value on success
 * and `undefined` on failure, so callers can `?.` off it safely.
 */
function safeWrite<T>(label: string, fn: () => T): T | undefined {
  try {
    return fn()
  } catch (err) {
    // Best-effort: log and move on. Never rethrow.
    console.error(`[llm-observability] ${label} write failed (ignored):`, err)
    return undefined
  }
}

/** Coerce a nullable token count to a non-negative integer. */
function tokenCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 * Resolve a {@link TraceRef} to a concrete trace id, or `null` when it cannot be
 * resolved (no trace was ever recorded). `recordEval` no-ops on `null`.
 */
function resolveTraceId(ref: TraceRef): number | null {
  if (typeof ref === "number") return ref
  return ref.traceId
}

/**
 * Create an {@link ObservedLlmClient} that wraps `inner` and records its turns.
 *
 * Trace-persistence shape — INSERT-THEN-UPDATE (Issue #222 AC-2, the
 * recommended shape): the first `complete()` turn INSERTS the `llm_traces` row
 * (so `traceId` is available immediately, before later turns), and every
 * subsequent turn UPDATEs the row's aggregate token counts, estimated cost,
 * latency, primary model, and `outcome`, and APPENDS its per-turn breakdown to
 * the `observations` JSON array. A multi-turn tool-use loop therefore produces
 * ONE trace with one entry per turn. All writes go through {@link safeWrite}, so
 * the returned `complete()` value is ALWAYS the inner client's result/throw,
 * unchanged.
 *
 * @param inner - the real (or mocked) client whose `complete()` is delegated to.
 * @param options - {@link ObservedLlmClientOptions}.
 */
export function createObservedLlmClient(
  inner: LlmClient,
  options: ObservedLlmClientOptions,
): ObservedLlmClient {
  const db = resolveDb(options.db)
  const primaryModel = options.model ?? DEFAULT_MODEL
  const snapshotId = options.snapshotId ?? null

  // Per-client (= per-logical-call) running aggregate, accumulated across turns.
  let traceId: number | null = null
  const observations: LlmObservation[] = []
  let inputTokens = 0
  let outputTokens = 0
  let cacheCreationTokens = 0
  let cacheReadTokens = 0
  let estimatedCostUsd = 0
  let totalLatencyMs = 0
  // The aggregate trace outcome: `success` while every turn has succeeded,
  // otherwise the FIRST failure kind seen (it sticks once a turn fails).
  let outcome: LlmTraceOutcome = "success"
  let model = primaryModel

  /** Persist the running aggregate: insert on the first turn, update after. */
  function persist(startedAt: Date): void {
    safeWrite("trace", () => {
      if (traceId === null) {
        const row: NewLlmTrace = {
          name: options.traceName,
          snapshotId,
          model,
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          estimatedCostUsd,
          latencyMs: totalLatencyMs,
          outcome,
          startedAt,
          observations,
        }
        const [inserted] = db.insert(llmTraces).values(row).returning().all()
        traceId = inserted?.id ?? null
      } else {
        db.update(llmTraces)
          .set({
            model,
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            estimatedCostUsd,
            latencyMs: totalLatencyMs,
            outcome,
            observations,
            updatedAt: new Date(),
          })
          .where(eq(llmTraces.id, traceId))
          .run()
      }
    })
  }

  /** Record one successful turn into the running aggregate, then persist. */
  function recordSuccess(
    request: LlmRequest,
    usage: Anthropic.Message["usage"],
    latencyMs: number,
    startedAt: Date,
  ): void {
    const turnModel = request.model ?? primaryModel
    model = turnModel
    const turnInput = tokenCount(usage.input_tokens)
    const turnOutput = tokenCount(usage.output_tokens)
    const turnCacheWrite = tokenCount(usage.cache_creation_input_tokens)
    const turnCacheRead = tokenCount(usage.cache_read_input_tokens)

    inputTokens += turnInput
    outputTokens += turnOutput
    cacheCreationTokens += turnCacheWrite
    cacheReadTokens += turnCacheRead
    estimatedCostUsd += estimateCostUsd(turnModel, usage)
    totalLatencyMs += latencyMs

    observations.push({
      model: turnModel,
      inputTokens: turnInput,
      outputTokens: turnOutput,
      cacheCreationTokens: turnCacheWrite,
      cacheReadTokens: turnCacheRead,
      latencyMs,
      outcome: "success",
    })
    persist(startedAt)
  }

  /** Record one FAILED turn (no usage available) into the aggregate. */
  function recordFailure(
    request: LlmRequest,
    failureKind: LlmTraceOutcome,
    latencyMs: number,
    startedAt: Date,
  ): void {
    const turnModel = request.model ?? primaryModel
    model = turnModel
    totalLatencyMs += latencyMs
    // The first failure kind seen becomes the aggregate trace outcome.
    if (outcome === "success") outcome = failureKind

    observations.push({
      model: turnModel,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      latencyMs,
      outcome: failureKind,
    })
    persist(startedAt)
  }

  return {
    get traceId() {
      return traceId
    },

    async complete(request) {
      const startedAt = new Date()
      const start = Date.now()
      try {
        const result = await inner.complete(request)
        const latencyMs = Date.now() - start
        // A discriminated failure `LlmResult` is recorded with its error kind;
        // the result itself is returned to the caller UNCHANGED (AC-4).
        if (result.ok) {
          recordSuccess(request, result.data.usage, latencyMs, startedAt)
        } else {
          recordFailure(request, result.error.kind, latencyMs, startedAt)
        }
        return result
      } catch (err) {
        // The inner client THREW (it does not normally — `createLlmClient`
        // returns a failure result instead — but a custom/mock client may).
        // Record the failure, then RETHROW unchanged so behaviour is identical
        // to calling the inner client directly (AC-4).
        const latencyMs = Date.now() - start
        recordFailure(request, "error", latencyMs, startedAt)
        throw err
      }
    },
  }
}

/**
 * Record one eval (graded check) against a recorded trace — best-effort and
 * non-blocking (Issue #222 AC-6). `traceRef` is the {@link ObservedLlmClient}
 * the trace was recorded by (or its `traceId`); when the trace was never
 * persisted (`traceId === null`), this no-ops. The write goes through
 * {@link safeWrite}, so a broken recorder DB never surfaces to the caller.
 *
 * @param traceRef - the observed client, a `{ traceId }` handle, or a raw id.
 * @param input - the {@link EvalInput} to persist.
 * @param db - catalog DB; injectable for tests, omitted → the package default.
 */
export function recordEval(
  traceRef: TraceRef,
  input: EvalInput,
  db?: CatalogDb,
): void {
  const traceId = resolveTraceId(traceRef)
  if (traceId === null) {
    // No trace to attach to (it was never recorded) — nothing to do.
    return
  }
  const handle = resolveDb(db)
  safeWrite("eval", () => {
    const row: NewLlmEval = {
      traceId,
      check: input.check,
      passed: input.passed,
      reason: input.reason ?? null,
    }
    handle.insert(llmEvals).values(row).run()
  })
}
