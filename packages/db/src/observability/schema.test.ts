// Verifies the LLM observability migration (drizzle/0011_*) applies cleanly to
// a fresh database and that the `llm_traces` / `llm_evals` tables behave as the
// schema declares (llm-observability PRD, Issue #219). Mirrors the M12
// ccpm-schema.test.ts harness: a real in-memory migrate, an insert+read round
// trip, and the FK-cascade assertions.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { eq } from "drizzle-orm"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import {
  llmEvals,
  llmTraces,
  repoSnapshots,
  type NewLlmEval,
  type NewLlmTrace,
  type NewRepoSnapshot,
} from "../schema"
import * as schema from "../schema"

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
  // Keep the raw handle reachable for direct sqlite_master inspection.
  return Object.assign(db, { $sqlite: sqlite })
}

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

/** A snapshot-scoped trace covering every column, incl. the JSON breakdown. */
function makeTrace(overrides: Partial<NewLlmTrace> = {}): NewLlmTrace {
  return {
    name: "m10.generate-qa",
    model: "claude-opus-4-8",
    inputTokens: 1200,
    outputTokens: 340,
    cacheCreationTokens: 800,
    cacheReadTokens: 400,
    estimatedCostUsd: 0.0123,
    latencyMs: 4200,
    outcome: "success",
    observations: [
      {
        model: "claude-opus-4-8",
        inputTokens: 1200,
        outputTokens: 340,
        cacheCreationTokens: 800,
        cacheReadTokens: 400,
        latencyMs: 4200,
        outcome: "success",
      },
    ],
    ...overrides,
  }
}

describe("llm_traces + llm_evals migration + schema", () => {
  let db: ReturnType<typeof makeTestDb>

  beforeEach(() => {
    db = makeTestDb()
  })

  /** Seed a snapshot and return its id. */
  function seedSnapshot(): number {
    const [row] = db
      .insert(repoSnapshots)
      .values(sampleSnapshot)
      .returning()
      .all()
    return row!.id
  }

  /** Insert a trace and return its id. */
  function seedTrace(overrides: Partial<NewLlmTrace> = {}): number {
    const [row] = db
      .insert(llmTraces)
      .values(makeTrace(overrides))
      .returning()
      .all()
    return row!.id
  }

  it("inserts and reads back a trace with its JSON observations", () => {
    const snapshotId = seedSnapshot()
    const traceId = seedTrace({ snapshotId })

    const [row] = db
      .select()
      .from(llmTraces)
      .where(eq(llmTraces.id, traceId))
      .all()
    expect(row?.name).toBe("m10.generate-qa")
    expect(row?.snapshotId).toBe(snapshotId)
    expect(row?.model).toBe("claude-opus-4-8")
    expect(row?.inputTokens).toBe(1200)
    expect(row?.outputTokens).toBe(340)
    expect(row?.cacheCreationTokens).toBe(800)
    expect(row?.cacheReadTokens).toBe(400)
    expect(row?.estimatedCostUsd).toBeCloseTo(0.0123)
    expect(row?.latencyMs).toBe(4200)
    expect(row?.outcome).toBe("success")
    expect(row?.startedAt).toBeInstanceOf(Date)
    expect(row?.createdAt).toBeInstanceOf(Date)
    // JSON column round-trips as a structured array.
    expect(row?.observations).toHaveLength(1)
    expect(row?.observations[0]?.outcome).toBe("success")
    expect(row?.observations[0]?.cacheReadTokens).toBe(400)
  })

  it("stores `outcome` as free text (a failure kind, no CHECK/enum)", () => {
    const id = seedTrace({ outcome: "parse-error", observations: [] })
    const [row] = db.select().from(llmTraces).where(eq(llmTraces.id, id)).all()
    expect(row?.outcome).toBe("parse-error")
  })

  it("allows a snapshot-less trace (snapshotId nullable)", () => {
    const id = seedTrace()
    const [row] = db.select().from(llmTraces).where(eq(llmTraces.id, id)).all()
    expect(row?.snapshotId).toBeNull()
  })

  it("inserts and reads back evals for a trace", () => {
    const traceId = seedTrace()
    const evals: NewLlmEval[] = [
      { traceId, check: "valid-json", passed: true, reason: null },
      {
        traceId,
        check: "cited-files-resolve",
        passed: false,
        reason: "Cited apps/web/missing.ts is not in the snapshot.",
      },
    ]
    db.insert(llmEvals).values(evals).run()

    const rows = db
      .select()
      .from(llmEvals)
      .where(eq(llmEvals.traceId, traceId))
      .all()
    expect(rows).toHaveLength(2)
    const passing = rows.find((r) => r.check === "valid-json")
    const failing = rows.find((r) => r.check === "cited-files-resolve")
    expect(passing?.passed).toBe(true)
    expect(passing?.reason).toBeNull()
    expect(failing?.passed).toBe(false)
    expect(failing?.reason).toContain("not in the snapshot")
    expect(failing?.createdAt).toBeInstanceOf(Date)
  })

  it("cascades eval deletion when its trace is removed", () => {
    const traceId = seedTrace()
    db.insert(llmEvals)
      .values({ traceId, check: "valid-json", passed: true })
      .run()

    db.delete(llmTraces).where(eq(llmTraces.id, traceId)).run()

    expect(db.select().from(llmEvals).all()).toHaveLength(0)
  })

  it("cascades trace + eval deletion when the snapshot is removed", () => {
    const snapshotId = seedSnapshot()
    const traceId = seedTrace({ snapshotId })
    db.insert(llmEvals)
      .values({ traceId, check: "valid-json", passed: true })
      .run()

    db.delete(repoSnapshots).where(eq(repoSnapshots.id, snapshotId)).run()

    expect(db.select().from(llmTraces).all()).toHaveLength(0)
    expect(db.select().from(llmEvals).all()).toHaveLength(0)
  })

  it("exercises the snapshot index path (per-repo reads)", () => {
    const snapshotId = seedSnapshot()
    const [other] = db
      .insert(repoSnapshots)
      .values({ ...sampleSnapshot, ref: "canary" })
      .returning()
      .all()
    seedTrace({ snapshotId, name: "m5.explain-stack" })
    seedTrace({ snapshotId, name: "m6.map-project" })
    seedTrace({ snapshotId: other!.id, name: "m10.generate-qa" })

    // The query the `llm_traces_snapshot_idx` index serves: all traces for one
    // repo snapshot.
    const forSnapshot = db
      .select()
      .from(llmTraces)
      .where(eq(llmTraces.snapshotId, snapshotId))
      .all()
    expect(forSnapshot).toHaveLength(2)
    expect(forSnapshot.map((t) => t.name).sort()).toEqual([
      "m5.explain-stack",
      "m6.map-project",
    ])

    // Confirm the index physically exists in the migrated schema.
    const indexes = db.$sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'llm_traces'",
      )
      .all() as { name: string }[]
    expect(indexes.map((i) => i.name)).toContain("llm_traces_snapshot_idx")
  })
})
