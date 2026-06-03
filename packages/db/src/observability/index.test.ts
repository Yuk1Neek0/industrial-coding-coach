// Tests for the typed observability data-access layer (Issue #225).
//
// Mirrors the M12 ccpm/* and the M13 observability/schema.test.ts harness: a
// real in-memory better-sqlite3 with the actual drizzle migrations applied
// (incl. 0011 — the llm_traces / llm_evals migration), then exercises
// `getObservability` end to end with an injected DB. Covers:
//   - Part A: traces + evals aggregation (pass-rate + cost/latency totals/avgs);
//   - Part A empty: a snapshot with no traces yet (clean empty result);
//   - Part B absent: a non-LLM repo fixture (clean `absent` story/teaching);
//   - Part B present: an LLM repo fixture (`llm-app` story + teaching);
//   - no-snapshot: an unknown owner/repo resolves to the clean discriminated miss;
//   - OFFLINE: the read path issues no network call and needs no API key.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  llmEvals,
  llmTraces,
  repoFiles,
  repoSnapshots,
  type NewLlmEval,
  type NewLlmTrace,
  type NewRepoFile,
  type NewRepoSnapshot,
} from "../schema"
import * as schema from "../schema"
import { getObservability } from "./index"

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

const sampleSnapshot: NewRepoSnapshot = {
  owner: "acme",
  repo: "widgets",
  ref: "main",
  commitSha: "abc123",
  defaultBranch: "main",
  description: "An observed repo",
  primaryLanguage: "TypeScript",
  isPrivate: false,
  htmlUrl: "https://github.com/acme/widgets",
  fileTree: [],
}

function seedSnapshot(db: TestDb, overrides: Partial<NewRepoSnapshot> = {}): number {
  const [row] = db
    .insert(repoSnapshots)
    .values({ ...sampleSnapshot, ...overrides })
    .returning()
    .all()
  return row!.id
}

function seedFile(db: TestDb, snapshotId: number, file: Partial<NewRepoFile>): void {
  const row: NewRepoFile = {
    snapshotId,
    path: file.path ?? "package.json",
    sha: file.sha ?? "deadbeef",
    size: file.size ?? 100,
    content: file.content ?? "",
    category: file.category ?? "source",
  }
  db.insert(repoFiles).values(row).run()
}

function makeTrace(overrides: Partial<NewLlmTrace> = {}): NewLlmTrace {
  return {
    name: "m10.generate-qa",
    model: "claude-opus-4-8",
    inputTokens: 1000,
    outputTokens: 200,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    estimatedCostUsd: 0.01,
    latencyMs: 1000,
    outcome: "success",
    observations: [],
    ...overrides,
  }
}

function seedTrace(db: TestDb, overrides: Partial<NewLlmTrace> = {}): number {
  const [row] = db.insert(llmTraces).values(makeTrace(overrides)).returning().all()
  return row!.id
}

function seedEval(db: TestDb, evalRow: NewLlmEval): void {
  db.insert(llmEvals).values(evalRow).run()
}

describe("getObservability", () => {
  let db: TestDb

  beforeEach(() => {
    db = makeTestDb()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns the no-snapshot miss for an unknown owner/repo (never throws)", async () => {
    const result = await getObservability("nobody", "nothing", undefined, { db })
    expect(result.kind).toBe("no-snapshot")
    if (result.kind === "no-snapshot") {
      expect(result.owner).toBe("nobody")
      expect(result.repo).toBe("nothing")
      expect(result.ref).toBeUndefined()
    }
  })

  it("returns empty Part A for a snapshot with no traces yet", async () => {
    seedSnapshot(db)
    const result = await getObservability("acme", "widgets", undefined, { db })

    expect(result.kind).toBe("observability")
    if (result.kind !== "observability") return
    expect(result.partA.traces).toEqual([])
    expect(result.partA.aggregates).toEqual([])
  })

  it("aggregates traces + evals: pass-rate, cost, and latency per trace name", async () => {
    const snapshotId = seedSnapshot(db)

    // Two `generate-qa` calls and one `map-project` call, all for this snapshot.
    const qa1 = seedTrace(db, {
      snapshotId,
      name: "m10.generate-qa",
      estimatedCostUsd: 0.02,
      latencyMs: 1000,
      startedAt: new Date("2026-06-01T00:00:00Z"),
    })
    const qa2 = seedTrace(db, {
      snapshotId,
      name: "m10.generate-qa",
      estimatedCostUsd: 0.04,
      latencyMs: 3000,
      startedAt: new Date("2026-06-02T00:00:00Z"),
    })
    seedTrace(db, {
      snapshotId,
      name: "m6.map-project",
      estimatedCostUsd: 0.1,
      latencyMs: 500,
      startedAt: new Date("2026-06-03T00:00:00Z"),
    })

    // qa1: 2 evals, 1 pass. qa2: 1 eval, 1 pass. → 3 evals, 2 pass → 2/3 rate.
    seedEval(db, { traceId: qa1, check: "valid-json", passed: true })
    seedEval(db, { traceId: qa1, check: "cited-files-resolve", passed: false })
    seedEval(db, { traceId: qa2, check: "valid-json", passed: true })

    // A trace for a DIFFERENT snapshot must NOT leak into this read.
    const otherSnap = seedSnapshot(db, { ref: "canary" })
    const otherTrace = seedTrace(db, { snapshotId: otherSnap, name: "m10.generate-qa" })
    seedEval(db, { traceId: otherTrace, check: "valid-json", passed: true })

    const result = await getObservability("acme", "widgets", "main", { db })
    expect(result.kind).toBe("observability")
    if (result.kind !== "observability") return

    // Only this snapshot's three traces.
    expect(result.partA.traces).toHaveLength(3)
    expect(result.snapshotId).toBe(snapshotId)

    // Each trace carries its own evals.
    const qa1Joined = result.partA.traces.find((t) => t.trace.id === qa1)
    expect(qa1Joined?.evals).toHaveLength(2)
    const mapJoined = result.partA.traces.find(
      (t) => t.trace.name === "m6.map-project",
    )
    expect(mapJoined?.evals).toEqual([])

    // Aggregates, ordered by trace name.
    expect(result.partA.aggregates.map((a) => a.traceName)).toEqual([
      "m10.generate-qa",
      "m6.map-project",
    ])

    const qaAgg = result.partA.aggregates.find(
      (a) => a.traceName === "m10.generate-qa",
    )!
    expect(qaAgg.callCount).toBe(2)
    expect(qaAgg.evalCount).toBe(3)
    expect(qaAgg.evalPassCount).toBe(2)
    expect(qaAgg.evalPassRate).toBeCloseTo(2 / 3)
    expect(qaAgg.totalCostUsd).toBeCloseTo(0.06)
    expect(qaAgg.averageCostUsd).toBeCloseTo(0.03)
    expect(qaAgg.totalLatencyMs).toBe(4000)
    expect(qaAgg.averageLatencyMs).toBe(2000)

    // A trace name with no evals reports a null pass-rate (not 0).
    const mapAgg = result.partA.aggregates.find(
      (a) => a.traceName === "m6.map-project",
    )!
    expect(mapAgg.callCount).toBe(1)
    expect(mapAgg.evalCount).toBe(0)
    expect(mapAgg.evalPassRate).toBeNull()
    expect(mapAgg.totalCostUsd).toBeCloseTo(0.1)
    expect(mapAgg.averageCostUsd).toBeCloseTo(0.1)
  })

  it("returns the absent Part B for a non-LLM repo fixture", async () => {
    const snapshotId = seedSnapshot(db)
    seedFile(db, snapshotId, {
      path: "package.json",
      category: "package-manifest",
      content: JSON.stringify({
        name: "plain-app",
        dependencies: { express: "^4.0.0", react: "^19.0.0" },
      }),
    })

    const result = await getObservability("acme", "widgets", undefined, { db })
    expect(result.kind).toBe("observability")
    if (result.kind !== "observability") return

    expect(result.partB.story.kind).toBe("absent")
    expect(result.partB.teaching.kind).toBe("absent")
    if (result.partB.story.kind === "absent") {
      expect(result.partB.story.searched.length).toBeGreaterThan(0)
    }
  })

  it("returns the llm-app Part B (story + teaching) for an LLM repo fixture", async () => {
    const snapshotId = seedSnapshot(db)
    seedFile(db, snapshotId, {
      path: "package.json",
      category: "package-manifest",
      content: JSON.stringify({
        name: "ai-app",
        dependencies: { "@anthropic-ai/sdk": "^0.99.0" },
      }),
    })
    seedFile(db, snapshotId, {
      path: "src/chat.ts",
      category: "source",
      content:
        'import Anthropic from "@anthropic-ai/sdk"\n' +
        "const client = new Anthropic()\n" +
        "await client.messages.create({})\n",
    })

    const result = await getObservability("acme", "widgets", undefined, { db })
    expect(result.kind).toBe("observability")
    if (result.kind !== "observability") return

    expect(result.partB.story.kind).toBe("llm-app")
    expect(result.partB.teaching.kind).toBe("llm-app")
    if (result.partB.story.kind === "llm-app") {
      expect(result.partB.story.sdks.map((s) => s.name)).toContain(
        "Anthropic SDK",
      )
      expect(result.partB.story.callSites.length).toBeGreaterThan(0)
    }
  })

  it("composes Part A + Part B together for one read", async () => {
    const snapshotId = seedSnapshot(db)
    seedFile(db, snapshotId, {
      path: "package.json",
      category: "package-manifest",
      content: JSON.stringify({ dependencies: { openai: "^4.0.0" } }),
    })
    const traceId = seedTrace(db, { snapshotId, name: "m5.explain-stack" })
    seedEval(db, { traceId, check: "valid-json", passed: true })

    const result = await getObservability("acme", "widgets", undefined, { db })
    expect(result.kind).toBe("observability")
    if (result.kind !== "observability") return

    expect(result.partA.traces).toHaveLength(1)
    expect(result.partA.aggregates[0]?.traceName).toBe("m5.explain-stack")
    expect(result.partB.story.kind).toBe("llm-app")
  })

  it("is OFFLINE: the read path issues no network fetch and needs no API key", async () => {
    const snapshotId = seedSnapshot(db)
    seedFile(db, snapshotId, {
      path: "package.json",
      category: "package-manifest",
      content: JSON.stringify({ dependencies: { "@anthropic-ai/sdk": "^0.99.0" } }),
    })
    seedTrace(db, { snapshotId, name: "m10.generate-qa" })

    // No API key in the environment for this read.
    const savedKey = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY

    // Any network call would go through global fetch — assert it is never called.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network access is forbidden in this read"))

    try {
      const result = await getObservability("acme", "widgets", undefined, { db })
      expect(result.kind).toBe("observability")
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey
    }
  })
})
