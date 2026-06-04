// Tests for the deterministic, dated per-model cost estimator.
//
// These assertions pin the ESTIMATE behaviour (rates as of PRICE_TABLE_DATE):
// a known model prices each token bucket from the table, cache-read tokens are
// strictly cheaper than fresh input tokens, an unknown model falls back without
// throwing, and zero usage yields exactly 0.

import type Anthropic from "@anthropic-ai/sdk"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_RATE,
  estimateCostUsd,
  PRICE_TABLE,
  rateForModel,
} from "./cost"

/**
 * Build a full `Anthropic.Message["usage"]` object. The SDK's `Usage` type has
 * several required fields beyond the token counts we price; we default them so
 * each test only states the counts that matter.
 */
function usage(
  partial: Partial<Anthropic.Message["usage"]>,
): Anthropic.Message["usage"] {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cache_creation: null,
    inference_geo: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
    ...partial,
  }
}

const SONNET = "claude-sonnet-4-6"

describe("estimateCostUsd", () => {
  it("prices a known model from its table rate (input + output)", () => {
    const r = PRICE_TABLE[SONNET]!
    const result = estimateCostUsd(
      SONNET,
      usage({ input_tokens: 1_000, output_tokens: 500 }),
    )
    expect(result).toBeCloseTo(1_000 * r.input + 500 * r.output, 12)
    // Sanity against the documented $3/$15 per-million Sonnet list price.
    expect(result).toBeCloseTo(1_000 * 3e-6 + 500 * 15e-6, 12)
    expect(result).toBeGreaterThan(0)
  })

  it("prices cache-read tokens at the LOWER cache-read rate", () => {
    const r = PRICE_TABLE[SONNET]!
    // cache-read must be cheaper than fresh input, per prompt-caching pricing.
    expect(r.cacheRead).toBeLessThan(r.input)

    const sameTokenCount = 10_000
    const asInput = estimateCostUsd(
      SONNET,
      usage({ input_tokens: sameTokenCount }),
    )
    const asCacheRead = estimateCostUsd(
      SONNET,
      usage({ cache_read_input_tokens: sameTokenCount }),
    )
    // Identical token volume costs strictly less when read from cache.
    expect(asCacheRead).toBeLessThan(asInput)
    expect(asCacheRead).toBeCloseTo(sameTokenCount * r.cacheRead, 12)
  })

  it("prices cache-write tokens at the higher cache-write rate", () => {
    const r = PRICE_TABLE[SONNET]!
    expect(r.cacheWrite).toBeGreaterThan(r.input)
    const tokens = 2_000
    const result = estimateCostUsd(
      SONNET,
      usage({ cache_creation_input_tokens: tokens }),
    )
    expect(result).toBeCloseTo(tokens * r.cacheWrite, 12)
  })

  it("sums all four token buckets for a cache-aware call", () => {
    const r = PRICE_TABLE[SONNET]!
    const u = usage({
      input_tokens: 1_000,
      output_tokens: 800,
      cache_creation_input_tokens: 400,
      cache_read_input_tokens: 5_000,
    })
    expect(estimateCostUsd(SONNET, u)).toBeCloseTo(
      1_000 * r.input +
        800 * r.output +
        400 * r.cacheWrite +
        5_000 * r.cacheRead,
      12,
    )
  })

  it("falls back to the default rate for an UNKNOWN model without throwing", () => {
    const u = usage({ input_tokens: 1_000, output_tokens: 500 })
    let result = NaN
    expect(() => {
      result = estimateCostUsd("definitely-not-a-real-model", u)
    }).not.toThrow()
    // Fallback equals the documented DEFAULT_RATE result.
    expect(result).toBeCloseTo(
      1_000 * DEFAULT_RATE.input + 500 * DEFAULT_RATE.output,
      12,
    )
    expect(rateForModel("definitely-not-a-real-model")).toBe(DEFAULT_RATE)
  })

  it("returns exactly 0 for zero usage (null caches included)", () => {
    expect(estimateCostUsd(SONNET, usage({}))).toBe(0)
    expect(estimateCostUsd("unknown-model", usage({}))).toBe(0)
  })

  it("keys the real Opus / Sonnet / Haiku model ids", () => {
    for (const id of [
      "claude-opus-4-8",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ]) {
      expect(PRICE_TABLE[id]).toBeDefined()
      expect(PRICE_TABLE[id]!.input).toBeGreaterThan(0)
    }
  })
})
