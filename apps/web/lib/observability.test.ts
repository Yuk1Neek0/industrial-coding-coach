// Unit tests for the M13 Observability Page server-side data access
// (`lib/observability.ts`, task #227).
//
// In-memory SQLite (real migrations) + an injected DB — no network, no keys.
// Mirrors the harness in `apps/web/lib/delivery.test.ts` / `portfolio.test.ts`.

import path from "node:path"
import { fileURLToPath } from "node:url"

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { beforeEach, describe, expect, it } from "vitest"

import {
  type CatalogDb,
  llmEvals,
  llmTraces,
  type NewLlmEval,
  type NewLlmTrace,
  type NewRepoFile,
  type NewRepoSnapshot,
  repoFiles,
  repoSnapshots,
} from "@workspace/db"
import * as schema from "@workspace/db/schema"

import { getObservabilityPageData } from "./observability"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "db",
  "drizzle",
)

function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db as unknown as CatalogDb
}

const SNAPSHOT: NewRepoSnapshot = {
  owner: "acme",
  repo: "widgets",
  ref: "main",
  commitSha: "c1",
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/widgets",
  fileTree: [],
}

function seedSnapshot(db: CatalogDb): number {
  const [row] = db.insert(repoSnapshots).values(SNAPSHOT).returning().all()
  return row!.id
}

function seedFile(
  db: CatalogDb,
  snapshotId: number,
  filePath: string,
  content: string,
  category: NewRepoFile["category"],
): void {
  db.insert(repoFiles)
    .values({
      snapshotId,
      path: filePath,
      sha: `s-${filePath}`,
      size: content.length,
      content,
      category,
    })
    .run()
}

function seedTrace(
  db: CatalogDb,
  overrides: Partial<NewLlmTrace> & Pick<NewLlmTrace, "name" | "snapshotId">,
): number {
  const base: NewLlmTrace = {
    model: "claude-sonnet-4-6",
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    estimatedCostUsd: 0.01,
    latencyMs: 1200,
    outcome: "success",
    startedAt: new Date("2026-06-01T12:00:00Z"),
    observations: [],
    ...overrides,
  }
  const [row] = db.insert(llmTraces).values(base).returning().all()
  return row!.id
}

function seedEval(
  db: CatalogDb,
  traceId: number,
  check: string,
  passed: boolean,
  reason: string | null = null,
): void {
  const value: NewLlmEval = { traceId, check, passed, reason }
  db.insert(llmEvals).values(value).run()
}

describe("getObservabilityPageData", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns the no-snapshot state when the repo is not imported", async () => {
    const result = await getObservabilityPageData("nobody", "nothing", undefined, db)
    expect(result.kind).toBe("no-snapshot")
    if (result.kind !== "no-snapshot") return
    expect(result.owner).toBe("nobody")
    expect(result.repo).toBe("nothing")
  })

  it("returns Part A traces+aggregates and a Part-B llm-app story for an imported LLM repo", async () => {
    const id = seedSnapshot(db)
    seedFile(
      db,
      id,
      "package.json",
      JSON.stringify({ dependencies: { "@anthropic-ai/sdk": "^0.99.0" } }),
      "package-manifest",
    )
    seedFile(
      db,
      id,
      "src/chat.ts",
      "const r = await client.messages.create({})",
      "source",
    )

    // Two calls of one name (one graded, one passing) + one ungraded name.
    const t1 = seedTrace(db, {
      name: "m10.generate-qa",
      snapshotId: id,
      estimatedCostUsd: 0.02,
      latencyMs: 1000,
      startedAt: new Date("2026-06-01T10:00:00Z"),
    })
    seedEval(db, t1, "valid-json", true)
    const t2 = seedTrace(db, {
      name: "m10.generate-qa",
      snapshotId: id,
      outcome: "error",
      estimatedCostUsd: 0.04,
      latencyMs: 2000,
      startedAt: new Date("2026-06-01T11:00:00Z"),
    })
    seedEval(db, t2, "cited-files-resolve", false, "a cited file was missing")
    seedTrace(db, {
      name: "m7.generate-unit",
      snapshotId: id,
      startedAt: new Date("2026-06-01T09:00:00Z"),
    })

    const result = await getObservabilityPageData("acme", "widgets", undefined, db)
    expect(result.kind).toBe("observability")
    if (result.kind !== "observability") return

    expect(result.snapshotId).toBe(id)
    // Part A — three traces, two aggregate names.
    expect(result.partA.traces).toHaveLength(3)
    const qa = result.partA.aggregates.find(
      (a) => a.traceName === "m10.generate-qa",
    )
    expect(qa?.callCount).toBe(2)
    expect(qa?.evalCount).toBe(2)
    expect(qa?.evalPassCount).toBe(1)
    expect(qa?.evalPassRate).toBeCloseTo(0.5)
    // Ungraded name → null pass-rate (distinct from "0% passed").
    const unit = result.partA.aggregates.find(
      (a) => a.traceName === "m7.generate-unit",
    )
    expect(unit?.evalPassRate).toBeNull()

    // Part B — detected as an LLM app (Anthropic SDK + call site).
    expect(result.partB.story.kind).toBe("llm-app")
    expect(result.partB.teaching.kind).toBe("llm-app")
    if (result.partB.teaching.kind !== "llm-app") return
    expect(result.partB.teaching.concepts.map((c) => c.concept)).toEqual([
      "tracing",
      "failures",
      "evals",
    ])
  })

  it("returns Part-A empty and Part-B absent for a freshly imported non-LLM repo", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, "package.json", "{}", "package-manifest")

    const result = await getObservabilityPageData("acme", "widgets", undefined, db)
    expect(result.kind).toBe("observability")
    if (result.kind !== "observability") return

    // Part A empty — both arrays empty (a calm resting state, not an error).
    expect(result.partA.traces).toEqual([])
    expect(result.partA.aggregates).toEqual([])
    // Part B absent — the educational explainer, with primer cards.
    expect(result.partB.story.kind).toBe("absent")
    expect(result.partB.teaching.kind).toBe("absent")
    if (result.partB.teaching.kind !== "absent") return
    expect(result.partB.teaching.primer).toHaveLength(3)
  })
})
