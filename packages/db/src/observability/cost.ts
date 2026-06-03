import type Anthropic from "@anthropic-ai/sdk"

/**
 * Deterministic, dated per-model cost ESTIMATOR for Anthropic LLM calls.
 *
 * This module turns an Anthropic `usage` object into an estimated USD cost from
 * a static, versioned per-model price table. It is a labelled ESTIMATE, not a
 * billing source of truth — exact billing depends on tier, region, and current
 * list prices that change over time (see {@link PRICE_TABLE_DATE}).
 *
 * Design constraints (local-first, ADR 0009):
 * - Pure and total: no I/O, no network, no throwing. An unknown model falls
 *   back to a documented default rate rather than failing.
 * - The estimated value is what the M13 observability layer stores on
 *   `llm_traces.estimatedCostUsd` — the return is a plain USD number.
 *
 * The `usage` input type is the SAME type `LlmResponse.usage` carries in
 * `@workspace/ai` (`Anthropic.Message["usage"]`). `@workspace/db` already lists
 * `@anthropic-ai/sdk` as a direct dependency (see this package's package.json),
 * so we reuse the SDK's type the way `packages/ai/src/client.ts` does rather
 * than adding a dependency or duplicating a structural type.
 */

/**
 * The date the rates below were last sourced. Rates are an estimate as of this
 * date; Anthropic's public list prices change over time, so always read this
 * alongside any stored estimate.
 *
 * Source: Anthropic public pricing — https://www.anthropic.com/pricing and
 * https://docs.anthropic.com/en/docs/about-claude/pricing (per-million-token
 * list prices, standard tier).
 */
export const PRICE_TABLE_DATE = "2026-06-03"

/**
 * Per-TOKEN USD rates for a model.
 *
 * Anthropic publishes prices PER MILLION tokens; we convert to per-token by
 * dividing the per-million list price by 1_000_000. Storing per-token keeps
 * {@link estimateCostUsd} a single multiply-and-sum with no extra scaling.
 */
export interface ModelRate {
  /** USD per input (prompt) token. */
  readonly input: number
  /** USD per output (completion) token. */
  readonly output: number
  /**
   * USD per cache-WRITE token (cache creation). Anthropic prices a 5-minute
   * ephemeral cache write at 1.25x the base input rate.
   */
  readonly cacheWrite: number
  /**
   * USD per cache-READ token. Prompt-caching reads are far cheaper than fresh
   * input — Anthropic prices them at 0.1x the base input rate. This is always
   * LOWER than {@link ModelRate.input}.
   */
  readonly cacheRead: number
}

/** Convert an Anthropic per-MILLION-token list price to a per-token rate. */
const perMillion = (usdPerMillion: number): number => usdPerMillion / 1_000_000

/**
 * Build a {@link ModelRate} from the two list prices Anthropic publishes
 * (input and output, USD per million tokens), deriving the prompt-caching
 * rates from the standard multipliers:
 * - cache write (5m ephemeral) = 1.25x input
 * - cache read                 = 0.10x input
 *
 * Source for the multipliers: Anthropic prompt-caching pricing docs —
 * https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
const rate = (inputPerMillion: number, outputPerMillion: number): ModelRate => {
  const input = perMillion(inputPerMillion)
  return {
    input,
    output: perMillion(outputPerMillion),
    cacheWrite: input * 1.25,
    cacheRead: input * 0.1,
  }
}

/**
 * Static, dated per-model price table, keyed by the exact Anthropic model ids
 * the coach uses. ESTIMATE, rates as of {@link PRICE_TABLE_DATE}.
 *
 * Keys:
 * - `claude-sonnet-4-6` is the coach's `DEFAULT_MODEL`
 *   (`packages/ai/src/model.ts`).
 * - The current Opus 4.8 / Sonnet 4.6 / Haiku 4.5 ids are keyed so traces for
 *   any model the coach may select resolve to real rates rather than the
 *   fallback.
 *
 * Per-million list prices (USD, standard tier) as of {@link PRICE_TABLE_DATE}:
 * - Opus:   $15 input / $75 output
 * - Sonnet:  $3 input / $15 output
 * - Haiku:   $1 input /  $5 output
 */
export const PRICE_TABLE: Readonly<Record<string, ModelRate>> = {
  // Opus 4.8 — most capable tier.
  "claude-opus-4-8": rate(15, 75),
  // Sonnet 4.6 — the coach's cost-aware DEFAULT_MODEL.
  "claude-sonnet-4-6": rate(3, 15),
  // Haiku 4.5 — fastest / cheapest tier.
  "claude-haiku-4-5": rate(1, 5),
}

/**
 * Documented fallback rate for an UNKNOWN model id. We use the Sonnet rate (the
 * coach's default tier) so an unrecognised model yields a sensible, non-zero
 * estimate instead of throwing or under-counting. Callers that need exactness
 * should add the model to {@link PRICE_TABLE}.
 */
export const DEFAULT_RATE: ModelRate = PRICE_TABLE["claude-sonnet-4-6"]!

/** Resolve a model id to its rate, falling back to {@link DEFAULT_RATE}. */
export function rateForModel(model: string): ModelRate {
  return PRICE_TABLE[model] ?? DEFAULT_RATE
}

/**
 * Estimate the USD cost of a single Anthropic call from its token `usage`.
 *
 * ESTIMATE, rates as of {@link PRICE_TABLE_DATE} (see {@link PRICE_TABLE} for
 * the source note). Pure and total: never throws, never does I/O. An unknown
 * `model` uses {@link DEFAULT_RATE}; zero usage returns `0`.
 *
 * Cache accounting mirrors the `usage` shape the `@workspace/ai` client
 * returns: `cache_creation_input_tokens` are billed at the (higher) cache-WRITE
 * rate, and `cache_read_input_tokens` at the (lower) cache-READ rate. The SDK
 * types both as `number | null`, so we coerce null/undefined to `0`.
 *
 * Note: `input_tokens` already EXCLUDES cached tokens — Anthropic reports
 * cache-write and cache-read counts separately — so the four buckets do not
 * double-count.
 *
 * @param model - Anthropic model id (e.g. `claude-sonnet-4-6`).
 * @param usage - the `Anthropic.Message["usage"]` carried by `LlmResponse`.
 * @returns estimated cost in USD as a plain number.
 */
export function estimateCostUsd(
  model: string,
  usage: Anthropic.Message["usage"],
): number {
  const r = rateForModel(model)

  const inputTokens = usage.input_tokens
  const outputTokens = usage.output_tokens
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0

  return (
    inputTokens * r.input +
    outputTokens * r.output +
    cacheWriteTokens * r.cacheWrite +
    cacheReadTokens * r.cacheRead
  )
}
