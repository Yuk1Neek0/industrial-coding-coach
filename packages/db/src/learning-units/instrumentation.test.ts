// Observability instrumentation tests for the M7 bounded learning-unit
// generation call (M13 epic llm-observability, Issue #224).
//
// Verifies that wiring `createObservedLlmClient` + `recordEval` into
// `generateLearningUnit`:
//   - records ONE trace + a PASSING integrity eval when a db is provided,
//   - records a FAILING eval (with a reason) when the integrity check rejects,
//   - is NON-BLOCKING — a broken observability db never changes the call's
//     result or makes it throw (the zero-behaviour-change guarantee), and
//   - records NOTHING when no db is provided (the existing, un-instrumented
//     behaviour is exactly preserved).
//
// `generateLearningUnit` is the lightest bounded call to drive end-to-end (it
// takes its source data by injection rather than reading the db), so it is the
// representative the AC's "a test asserts a trace + eval are written / a forced
// write failure is non-blocking" requirement is proven on. The other five
// instrumented calls (M7 grade, M9 generate/grade, M10 qa/bullets) wire the
// same `createObservedLlmClient(...)` seam; their own suites prove they stay
// green unchanged.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient } from "@workspace/ai"
import { createMockTransport, type MockReply } from "@workspace/ai/testing"
import Database from "better-sqlite3"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { LearningUnitInput } from "../github/issues"
import { llmEvals, llmTraces } from "../schema"
import * as schema from "../schema"
import type { ProjectMap, RepoTreeEntry } from "../schema"
import { generateLearningUnit } from "./generate"

// --- DB harness (mirrors observability/schema.test.ts) ---------------------

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
  return Object.assign(db, { $sqlite: sqlite })
}

// --- Fixtures (a minimal subset of generate.test.ts) -----------------------

const fileTree: RepoTreeEntry[] = [
  { path: "apps/web/app/api/health/route.ts", type: "blob", sha: "a", size: 200 },
]

const projectMap: ProjectMap = {
  id: 1,
  snapshotId: 1,
  architectureOverview: [{ title: "Frontend", detail: "Next.js App Router." }],
  keyFileMap: [
    { path: "apps/web/app/api/health/route.ts", role: "Health route handler." },
  ],
  requestDataFlow: [],
  stateFlow: [],
  aiCallFlow: [],
  mermaidDiagram: "graph TD; A-->B;",
  debugPath: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

function input(): LearningUnitInput {
  return {
    source: "github-issue",
    issueRef: "#42",
    title: "Add a /health endpoint",
    body: "Add a route handler at apps/web/app/api/health/route.ts returning 200 OK.",
    labels: ["good-first-issue"],
    state: "open",
    linkedPrs: [],
  }
}

async function readHealthOnly(filePath: string): Promise<string | null> {
  if (filePath === "apps/web/app/api/health/route.ts") {
    return "export async function GET() {\n  return Response.json({ status: 'ok' })\n}\n"
  }
  return null
}

function toolUse(
  name: string,
  inputBlock: Record<string, unknown>,
): Anthropic.ContentBlock {
  return { type: "tool_use", id: `tu_${name}`, name, input: inputBlock } as unknown as Anthropic.ContentBlock
}

function reply(content: Anthropic.ContentBlock[]): MockReply {
  return { content, stopReason: "tool_use" }
}

/** A well-formed `submit_learning_unit` input grounded in the fixture tree. */
function validUnit(relatedFilePath?: string): Record<string, unknown> {
  return {
    restatedGoal:
      "Add a /health endpoint at apps/web/app/api/health/route.ts returning 200 OK.",
    relatedFiles: [
      {
        path: relatedFilePath ?? "apps/web/app/api/health/route.ts",
        reason: "The new route handler file the issue introduces.",
      },
    ],
    concepts: [
      {
        name: "route handlers",
        explanation:
          "Next.js App Router route handlers live under apps/web/app/api/health/route.ts.",
      },
    ],
    agentExecutionNotes: [
      { order: 1, description: "Create the route handler file." },
      { order: 2, description: "Return Response.json({status: 'ok'})." },
    ],
    reviewChecklist: [
      { id: "c1", description: "apps/web/app/api/health/route.ts returns 200 OK." },
      { id: "c2", description: "The route handler covers GET." },
    ],
    questions: [
      { id: "q1", prompt: "How does Next.js know this file is a route?" },
      { id: "q2", prompt: "What does Response.json do here?" },
    ],
  }
}

/** A mock client that submits `unit` immediately (no read turn). */
function submittingClient(unit: Record<string, unknown>) {
  return createLlmClient(
    createMockTransport({
      replies: [reply([toolUse("submit_learning_unit", unit)])],
    }),
  )
}

// --- Tests -----------------------------------------------------------------

describe("generateLearningUnit observability instrumentation (#224)", () => {
  let db: ReturnType<typeof makeTestDb>

  beforeEach(() => {
    db = makeTestDb()
  })

  it("records one trace + a passing integrity eval when a db is provided", async () => {
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: submittingClient(validUnit()),
      db,
    })

    expect(result.ok).toBe(true)

    const traces = db.select().from(llmTraces).all()
    expect(traces).toHaveLength(1)
    expect(traces[0]?.name).toBe("m7.generate-unit")
    expect(traces[0]?.outcome).toBe("success")
    // No snapshotId was passed → the trace is unscoped (nullable column).
    expect(traces[0]?.snapshotId).toBeNull()
    // One `complete()` turn → one per-turn observation aggregated into the trace.
    expect(traces[0]?.observations.length).toBeGreaterThanOrEqual(1)

    const evals = db
      .select()
      .from(llmEvals)
      .where(eq(llmEvals.traceId, traces[0]!.id))
      .all()
    expect(evals).toHaveLength(1)
    expect(evals[0]?.check).toBe("learning-unit-integrity")
    expect(evals[0]?.passed).toBe(true)
  })

  it("records a failing eval when the integrity check rejects", async () => {
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      // A related-file path that is NOT in the snapshot tree → integrity fails.
      client: submittingClient(validUnit("apps/web/app/api/ghost/route.ts")),
      db,
    })

    expect(result.ok).toBe(false)

    // The trace is still recorded (the SDK turn itself succeeded)...
    expect(db.select().from(llmTraces).all()).toHaveLength(1)
    // ...and the integrity eval records the rejection with a reason.
    const evals = db.select().from(llmEvals).all()
    expect(evals).toHaveLength(1)
    expect(evals[0]?.check).toBe("learning-unit-integrity")
    expect(evals[0]?.passed).toBe(false)
    expect(evals[0]?.reason).toContain("ghost")
  })

  it("is non-blocking: a broken observability db never changes the result", async () => {
    // Drop the observability tables so every trace/eval write throws.
    db.$sqlite.exec("DROP TABLE llm_evals; DROP TABLE llm_traces;")

    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: submittingClient(validUnit()),
      db,
    })

    // The call returns its normal result, unchanged — the recorder failure was
    // swallowed (best-effort, non-blocking).
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.content.restatedGoal).toContain("/health")
      expect(result.data.content.relatedFiles).toHaveLength(1)
    }
  })

  it("records nothing when no db is provided (un-instrumented behaviour)", async () => {
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: submittingClient(validUnit()),
      // no db → the client is not wrapped
    })

    expect(result.ok).toBe(true)
    // A separate, fresh observability db sees no writes from the call above.
    expect(db.select().from(llmTraces).all()).toHaveLength(0)
    expect(db.select().from(llmEvals).all()).toHaveLength(0)
  })
})
