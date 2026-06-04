// Tests for the LLM observability recording seam (Issue #222).
//
// The harness mirrors `observability/schema.test.ts` / `ccpm-schema.test.ts`: a
// fresh in-memory better-sqlite3 with the REAL migrations applied (incl. 0011).
// The inner LLM client is the real `@workspace/ai` `createLlmClient` driven by a
// MOCKED transport (`createMockTransport`), so no API key and zero live calls.
//
// Coverage (AC-8): a success trace, a failure trace, multi-turn aggregation into
// ONE trace, `recordEval`, and the cardinal non-blocking guarantee — a forced
// recorder-DB write failure must NOT change the wrapped `complete()` result.

import type Anthropic from "@anthropic-ai/sdk"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { eq } from "drizzle-orm"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createLlmClient,
  fail,
  LlmError,
  ok,
  type LlmClient,
  type LlmResponse,
  type LlmResult,
} from "@workspace/ai"
import { createMockTransport, mockMessage } from "@workspace/ai/testing"

import { llmEvals, llmTraces, repoSnapshots } from "../schema"
import * as schema from "../schema"
import { createObservedLlmClient, recordEval } from "./record"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
)

/** A fresh in-memory DB with the real migrations applied (incl. 0011). */
function makeTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

type TestDb = ReturnType<typeof makeTestDb>

/** Build a full `Anthropic.Message["usage"]`, defaulting the unpriced fields. */
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
  } as Anthropic.Message["usage"]
}

/** A mock transport reply whose message carries explicit `usage`. */
function replyWithUsage(
  partialUsage: Partial<Anthropic.Message["usage"]>,
  text = "ok",
): Anthropic.Message {
  const message = mockMessage({ text })
  return { ...message, usage: usage(partialUsage) }
}

describe("createObservedLlmClient", () => {
  let db: TestDb

  beforeEach(() => {
    db = makeTestDb()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A real client whose transport always returns the given Anthropic message. */
  function clientReturning(message: Anthropic.Message): LlmClient {
    const transport = createMockTransport()
    // Override createMessage to serve our exact usage-bearing message.
    transport.createMessage = () => Promise.resolve(message)
    return createLlmClient(transport)
  }

  it("records ONE success trace with aggregate tokens + cost", async () => {
    const inner = clientReturning(
      replyWithUsage({
        input_tokens: 1_000,
        output_tokens: 500,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 100,
      }),
    )
    const client = createObservedLlmClient(inner, {
      traceName: "m10.generate-qa",
      model: "claude-sonnet-4-6",
      db,
    })

    const result = await client.complete({ messages: [], model: "claude-sonnet-4-6" })

    expect(result.ok).toBe(true)
    expect(client.traceId).not.toBeNull()

    const rows = db.select().from(llmTraces).all()
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.name).toBe("m10.generate-qa")
    expect(row.model).toBe("claude-sonnet-4-6")
    expect(row.inputTokens).toBe(1_000)
    expect(row.outputTokens).toBe(500)
    expect(row.cacheCreationTokens).toBe(200)
    expect(row.cacheReadTokens).toBe(100)
    expect(row.estimatedCostUsd).toBeGreaterThan(0)
    expect(row.outcome).toBe("success")
    expect(row.observations).toHaveLength(1)
    expect(row.observations[0]?.outcome).toBe("success")
    expect(row.observations[0]?.inputTokens).toBe(1_000)
  })

  it("ties a trace to a snapshot when snapshotId is set", async () => {
    const [snap] = db
      .insert(repoSnapshots)
      .values({
        owner: "acme",
        repo: "widgets",
        ref: "main",
        commitSha: "abc",
        defaultBranch: "main",
        htmlUrl: "https://github.com/acme/widgets",
        fileTree: [],
      })
      .returning()
      .all()
    const client = createObservedLlmClient(
      clientReturning(replyWithUsage({ input_tokens: 10, output_tokens: 5 })),
      { traceName: "m5.explain", snapshotId: snap!.id, db },
    )
    await client.complete({ messages: [] })
    const row = db.select().from(llmTraces).all()[0]!
    expect(row.snapshotId).toBe(snap!.id)
  })

  it("records a FAILURE trace and returns the failure result UNCHANGED", async () => {
    // Inner client returns a discriminated failure LlmResult (does not throw).
    const innerError = new LlmError("rate_limited", "rate limited")
    const inner: LlmClient = {
      complete: () => Promise.resolve(fail(innerError)),
    }
    const client = createObservedLlmClient(inner, {
      traceName: "m6.map",
      db,
    })

    const result = await client.complete({ messages: [] })

    // The exact failure result is passed through unchanged.
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(innerError)
      expect(result.error.kind).toBe("rate_limited")
    }

    const row = db.select().from(llmTraces).all()[0]!
    expect(row.outcome).toBe("rate_limited")
    expect(row.observations).toHaveLength(1)
    expect(row.observations[0]?.outcome).toBe("rate_limited")
    expect(row.inputTokens).toBe(0)
  })

  it("records a failure + RETHROWS when the inner client throws", async () => {
    const boom = new Error("transport exploded")
    const inner: LlmClient = {
      complete: () => Promise.reject(boom),
    }
    const client = createObservedLlmClient(inner, { traceName: "m8.review", db })

    await expect(client.complete({ messages: [] })).rejects.toBe(boom)

    const row = db.select().from(llmTraces).all()[0]!
    expect(row.outcome).toBe("error")
    expect(row.observations[0]?.outcome).toBe("error")
  })

  it("aggregates a multi-turn tool-use loop into ONE trace", async () => {
    // Three turns through ONE observed client = one logical bounded call.
    const usages = [
      { input_tokens: 100, output_tokens: 50 },
      { input_tokens: 200, output_tokens: 60, cache_read_input_tokens: 40 },
      { input_tokens: 300, output_tokens: 70 },
    ]
    let turn = 0
    const inner: LlmClient = {
      complete: (): Promise<LlmResult<LlmResponse>> => {
        const u = usages[turn]!
        turn += 1
        return Promise.resolve(
          ok({ content: [], stopReason: "end_turn", usage: usage(u) }),
        )
      },
    }
    const client = createObservedLlmClient(inner, {
      traceName: "m10.generate-bullets",
      model: "claude-opus-4-8",
      db,
    })

    const firstTraceId = (async () => {
      await client.complete({ messages: [] })
      return client.traceId
    })()
    const idAfterFirst = await firstTraceId
    await client.complete({ messages: [] })
    await client.complete({ messages: [] })

    // Exactly ONE trace row, and the id was stable from the first turn on.
    const rows = db.select().from(llmTraces).all()
    expect(rows).toHaveLength(1)
    expect(client.traceId).toBe(idAfterFirst)

    const row = rows[0]!
    // Aggregated token counts across the three turns.
    expect(row.inputTokens).toBe(600)
    expect(row.outputTokens).toBe(180)
    expect(row.cacheReadTokens).toBe(40)
    // One observation entry per turn.
    expect(row.observations).toHaveLength(3)
    expect(row.observations.map((o) => o.inputTokens)).toEqual([100, 200, 300])
    expect(row.outcome).toBe("success")
  })

  it("keeps `success` outcome until a later turn fails, then sticks", async () => {
    let turn = 0
    const inner: LlmClient = {
      complete: (): Promise<LlmResult<LlmResponse>> => {
        turn += 1
        if (turn === 1) {
          return Promise.resolve(
            ok({
              content: [],
              stopReason: "end_turn",
              usage: usage({ input_tokens: 10, output_tokens: 5 }),
            }),
          )
        }
        return Promise.resolve(fail(new LlmError("timeout", "slow")))
      },
    }
    const client = createObservedLlmClient(inner, { traceName: "m9.grade", db })

    await client.complete({ messages: [] })
    await client.complete({ messages: [] })

    const rows = db.select().from(llmTraces).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.outcome).toBe("timeout")
    expect(rows[0]!.observations.map((o) => o.outcome)).toEqual([
      "success",
      "timeout",
    ])
  })

  describe("recordEval", () => {
    it("writes an eval tied to the recorded trace", async () => {
      const client = createObservedLlmClient(
        clientReturning(replyWithUsage({ input_tokens: 10, output_tokens: 5 })),
        { traceName: "m10.generate-qa", db },
      )
      await client.complete({ messages: [] })

      recordEval(
        client,
        { check: "valid-json", passed: true, reason: "parsed cleanly" },
        db,
      )
      recordEval(client, { check: "cited-files-resolve", passed: false }, db)

      const evals = db
        .select()
        .from(llmEvals)
        .where(eq(llmEvals.traceId, client.traceId!))
        .all()
      expect(evals).toHaveLength(2)
      const passing = evals.find((e) => e.check === "valid-json")!
      expect(passing.passed).toBe(true)
      expect(passing.reason).toBe("parsed cleanly")
      const failing = evals.find((e) => e.check === "cited-files-resolve")!
      expect(failing.passed).toBe(false)
      expect(failing.reason).toBeNull()
    })

    it("no-ops when the trace was never recorded (traceId null)", () => {
      // A handle whose trace id never materialized.
      recordEval({ traceId: null }, { check: "x", passed: true }, db)
      expect(db.select().from(llmEvals).all()).toHaveLength(0)
    })

    it("accepts a raw trace id", async () => {
      const client = createObservedLlmClient(
        clientReturning(replyWithUsage({ input_tokens: 1, output_tokens: 1 })),
        { traceName: "m7.unit", db },
      )
      await client.complete({ messages: [] })
      recordEval(client.traceId!, { check: "grounded", passed: true }, db)
      expect(db.select().from(llmEvals).all()).toHaveLength(1)
    })
  })

  describe("non-blocking guarantee (the cardinal rule)", () => {
    it("returns the inner result UNCHANGED when the recorder DB throws", async () => {
      // Force EVERY observability write to throw by breaking the db handle.
      const exploding = {
        insert: () => {
          throw new Error("recorder DB is down")
        },
        update: () => {
          throw new Error("recorder DB is down")
        },
      } as unknown as TestDb

      const innerResult = ok<LlmResponse>({
        content: [{ type: "text", text: "real answer", citations: null }],
        stopReason: "end_turn",
        usage: usage({ input_tokens: 42, output_tokens: 7 }),
      })
      const inner: LlmClient = { complete: () => Promise.resolve(innerResult) }

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const client = createObservedLlmClient(inner, {
        traceName: "m5.explain",
        db: exploding,
      })

      // Must NOT throw, and must return the EXACT inner result.
      const result = await client.complete({ messages: [] })
      expect(result).toBe(innerResult)
      expect(result.ok).toBe(true)
      // traceId stays null because the insert was swallowed.
      expect(client.traceId).toBeNull()
      // The failure was logged (best-effort), not rethrown.
      expect(errorSpy).toHaveBeenCalled()
    })

    it("recordEval swallows a thrown write and never throws", () => {
      const exploding = {
        insert: () => {
          throw new Error("recorder DB is down")
        },
      } as unknown as TestDb
      vi.spyOn(console, "error").mockImplementation(() => {})
      // A real trace id, but the write blows up — must not throw.
      expect(() =>
        recordEval(123, { check: "x", passed: true }, exploding),
      ).not.toThrow()
    })
  })
})
