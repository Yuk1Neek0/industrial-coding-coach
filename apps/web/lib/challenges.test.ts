// End-to-end test for the M9 server-side data access + orchestration layer
// (task #148). Exercises the full Wave 4 path the four UI pieces depend on:
//
//   list challenges (Challenge List Page)
//     → open a challenge / generate a new one (R2 / FR-1)
//     → submit explanation (Debug Walkthrough)
//     → receive 0–100 score + weak-area (Completion Review)
//     → see attempt in history (collapsible panel)
//     → "Retry" → submit second attempt → new outcome surfaces as primary,
//       previous moves into the collapsible panel (R5 / FR-10 / US-6)
//
// CI contract: no `ANTHROPIC_API_KEY`, no live network. Wires the
// `@workspace/ai/testing` mock transport (the same posture as
// `packages/db/src/challenges/generation.test.ts` and `grading.test.ts`).
// The wrappers in `lib/challenges.ts` accept injected `client` and
// `database` parameters so the test runs entirely against an in-memory
// SQLite + scripted SDK replies.

import { createLlmClient } from "@workspace/ai"
import { createMockTransport, type MockReply } from "@workspace/ai/testing"
import type { CatalogDb } from "@workspace/db"
import { createProjectMap } from "@workspace/db"
import {
  type NewRepoFile,
  type NewRepoSnapshot,
  type ProjectMapFile,
  repoFiles,
  repoSnapshots,
} from "@workspace/db/schema"
import * as schema from "@workspace/db/schema"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import {
  challengeTypeLabel,
  generateChallengeForType,
  getChallengeDetailView,
  getChallengeListPageData,
  scoreBand,
  submitChallengeAttempt,
} from "./challenges"

// Real migrations live in the `@workspace/db` package.
const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "db",
  "drizzle",
)

/** A fresh in-memory catalog DB with the real migrations applied. */
function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db as unknown as CatalogDb
}

const snapshot: NewRepoSnapshot = {
  owner: "acme",
  repo: "portfolio",
  ref: "main",
  commitSha: "deadbeef",
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/portfolio",
  fileTree: [
    { path: "apps/web/app/page.tsx", type: "blob", sha: "a", size: 200 },
    { path: "apps/web/lib/auth.ts", type: "blob", sha: "b", size: 80 },
    { path: "packages/db/src/schema.ts", type: "blob", sha: "c", size: 300 },
  ],
}

const keyFileMap: ProjectMapFile[] = [
  { path: "apps/web/app/page.tsx", role: "Landing page." },
  { path: "apps/web/lib/auth.ts", role: "Session helper." },
  { path: "packages/db/src/schema.ts", role: "Database schema." },
]

const keyFiles: Omit<NewRepoFile, "snapshotId">[] = [
  {
    path: "apps/web/app/page.tsx",
    content: "export default function Page() { return <div /> }",
    sha: "a",
    size: 200,
    category: "source",
  },
  {
    path: "apps/web/lib/auth.ts",
    content: "export function session() { return readToken() }",
    sha: "b",
    size: 80,
    category: "source",
  },
  {
    path: "packages/db/src/schema.ts",
    content: "export const users = sqliteTable('users', {})",
    sha: "c",
    size: 300,
    category: "source",
  },
]

/** Seed the imported snapshot + key files + M6 project map. */
async function seed(db: CatalogDb): Promise<number> {
  const inserted = db
    .insert(repoSnapshots)
    .values(snapshot)
    .returning()
    .get()
  const snapshotId = inserted.id
  db.insert(repoFiles)
    .values(keyFiles.map((f) => ({ ...f, snapshotId })))
    .run()
  await createProjectMap(
    snapshotId,
    {
      architectureOverview: [
        { title: "Frontend", detail: "A single Next.js app." },
      ],
      keyFileMap,
      requestDataFlow: [],
      stateFlow: [],
      aiCallFlow: [],
      mermaidDiagram: "graph TD; A-->B",
      debugPath: [],
    },
    db,
  )
  return snapshotId
}

/**
 * A `tool_use` reply for the mock transport. The mock transport's
 * {@link MockReply.content} is typed as `Anthropic.ContentBlock[]`; we build
 * the shape structurally and cast through the helper so the test file does
 * not need to declare `@anthropic-ai/sdk` as a direct dependency (apps/web
 * doesn't ship the SDK — it consumes the LLM client through `@workspace/ai`).
 */
function toolUseReply(
  name: string,
  input: Record<string, unknown>,
): MockReply {
  // The cast is contained here so the rest of the test reads as plain TS.
  // `MockReply.content` carries `Anthropic.ContentBlock[]` at the type
  // level; structurally a tool-use block is `{ type, id, name, input }`.
  const content = [
    { type: "tool_use", id: `tu_${name}`, name, input },
  ] as unknown as MockReply["content"]
  return { content, stopReason: "tool_use" }
}

/** A valid generation submission — M6-grounded by construction. */
function validGenerationInput(): Record<string, unknown> {
  return {
    taskDescription:
      "Add a `displayName` field so the landing page can render it.",
    inScopeFiles: [
      "packages/db/src/schema.ts",
      "apps/web/app/page.tsx",
    ],
    outOfScopeFiles: ["apps/web/lib/auth.ts"],
    acceptanceCriteria: [
      {
        id: "c1",
        detail: "Names the schema file as the place the new column is added.",
      },
      {
        id: "c2",
        detail: "Explains the migration step needed for the new column.",
      },
    ],
    sourceReferences: [
      {
        section: "keyFileMap",
        path: "packages/db/src/schema.ts",
        note: "The schema file is where new columns live.",
      },
    ],
  }
}

/** A valid grading submission — M6-grounded by construction. */
function validGradingInput(score: number, criterionResults?: {
  criterionId: string
  passed: boolean
  detail: string
}[]): Record<string, unknown> {
  return {
    score,
    weakAreas: [
      {
        area: "migration-step",
        detail:
          "Could be even more specific about the drizzle-kit command.",
      },
    ],
    criterionResults: criterionResults ?? [
      {
        criterionId: "c1",
        passed: true,
        detail: "Named packages/db/src/schema.ts as the column site.",
      },
      {
        criterionId: "c2",
        passed: true,
        detail: "Mentioned generating a migration after the schema edit.",
      },
    ],
    feedback:
      "Solid explanation; rooted in the actual schema and page files.",
  }
}

describe("M9 UI integration (end-to-end)", () => {
  let db: CatalogDb

  beforeEach(async () => {
    db = makeTestDb()
    await seed(db)
  })

  it("renders the Challenge List Page from the cached challenges + project map", async () => {
    const data = await getChallengeListPageData("acme", "portfolio", db)
    expect(data.snapshotExists).toBe(true)
    expect(data.projectMapExists).toBe(true)
    expect(data.identity).toEqual({
      owner: "acme",
      repo: "portfolio",
      branch: "main",
    })
    // Six default applicable types (broken-CI gated on R6) — no cached row
    // yet, so every entry has challengeId === null and a generation CTA.
    expect(data.entries.length).toBe(6)
    expect(data.entries.every((e) => e.challengeId === null)).toBe(true)
    // Every row names target files from the M6 map (US-1 / R8).
    for (const entry of data.entries) {
      expect(entry.targetFiles.length).toBeGreaterThan(0)
      for (const p of entry.targetFiles) {
        expect(keyFileMap.map((f) => f.path)).toContain(p)
      }
    }
  })

  it("type labels are plain-language", () => {
    expect(challengeTypeLabel("add-small-field")).toBe("Add a small field")
    expect(challengeTypeLabel("trace-failed-api-call")).toBe(
      "Trace a failed API call",
    )
  })

  it("scoreBand matches the M8 labels (R4)", () => {
    expect(scoreBand(95)).toBe("Solid grasp")
    expect(scoreBand(70)).toBe("Getting there")
    expect(scoreBand(40)).toBe("Needs review")
    expect(scoreBand(10)).toBe("Worth re-studying")
  })

  it("omits the broken-CI type until a failing CI run is surfaced (R6)", async () => {
    const data = await getChallengeListPageData("acme", "portfolio", db)
    const types = data.entries.map((e) => e.type)
    expect(types).not.toContain("explain-broken-ci-result")
  })

  it("returns not-imported when the repo has no snapshot", async () => {
    const data = await getChallengeListPageData("nobody", "nothing", db)
    expect(data.snapshotExists).toBe(false)
    expect(data.identity).toBeNull()
    expect(data.entries).toHaveLength(0)
  })

  it("end-to-end happy path: generate → list → open → submit → grade → retry", async () => {
    // 1. Generate a challenge (lazy per type, R2). The first call invokes
    //    the SDK; the second returns the cached row.
    const generateClient = createLlmClient(
      createMockTransport({
        replies: [toolUseReply("submit_challenge", validGenerationInput())],
      }),
    )
    const gen = await generateChallengeForType(
      "acme",
      "portfolio",
      "add-small-field",
      { client: generateClient },
      db,
    )
    expect(gen.ok).toBe(true)
    if (!gen.ok) return
    expect(gen.cached).toBe(false)
    const challengeId = gen.challengeId

    // 1a. Re-call with no replies queued — cached hit must NOT issue an SDK
    //     call; if it did, the mock transport would return an empty reply
    //     and the parse would fail.
    const cachedClient = createLlmClient(createMockTransport({ replies: [] }))
    const cached = await generateChallengeForType(
      "acme",
      "portfolio",
      "add-small-field",
      { client: cachedClient },
      db,
    )
    expect(cached.ok).toBe(true)
    if (!cached.ok) return
    expect(cached.cached).toBe(true)
    expect(cached.challengeId).toBe(challengeId)

    // 2. Open the list — the generated row is now present with targetFiles
    //    from the M6 map and no latest outcome (no attempts yet).
    const listAfterGen = await getChallengeListPageData(
      "acme",
      "portfolio",
      db,
    )
    const generatedEntry = listAfterGen.entries.find(
      (e) => e.type === "add-small-field",
    )
    expect(generatedEntry).toBeDefined()
    expect(generatedEntry?.challengeId).toBe(challengeId)
    expect(generatedEntry?.taskSummary).toContain("displayName")
    expect(generatedEntry?.targetFiles).toContain(
      "packages/db/src/schema.ts",
    )
    expect(generatedEntry?.latestOutcome).toBeNull()

    // 3. Open the Detail Page — it reads the challenge + (empty) attempt
    //    history. The Walkthrough UI's picker candidates are the M6-mapped
    //    paths (R8).
    const detail = await getChallengeDetailView(challengeId, db)
    expect(detail).not.toBeNull()
    if (!detail) return
    expect(detail.type).toBe("add-small-field")
    expect(detail.acceptanceCriteria).toHaveLength(2)
    expect(detail.inScope.map((e) => e.path)).toContain(
      "packages/db/src/schema.ts",
    )
    expect(detail.attempts).toHaveLength(0)
    // R8 / FR-4: the picker candidates are M6-mapped paths only.
    for (const p of detail.m6Paths) {
      expect([
        "apps/web/app/page.tsx",
        "apps/web/lib/auth.ts",
        "packages/db/src/schema.ts",
      ]).toContain(p)
    }

    // 4. Submit the first attempt and grade it (FR-4 / FR-5). The grading
    //    call is bounded — one forced submit_grading turn.
    const firstSubmitClient = createLlmClient(
      createMockTransport({
        replies: [toolUseReply("submit_grading", validGradingInput(82))],
      }),
    )
    const firstSubmit = await submitChallengeAttempt(
      challengeId,
      {
        explanation:
          "I would add `displayName` in packages/db/src/schema.ts and " +
          "render it on apps/web/app/page.tsx. After editing the schema I " +
          "would generate a migration.",
        filePaths: [
          "packages/db/src/schema.ts",
          "apps/web/app/page.tsx",
        ],
        snippets: [
          {
            path: "packages/db/src/schema.ts",
            code: "displayName: text('display_name')",
          },
        ],
      },
      db,
      { client: firstSubmitClient },
    )
    expect(firstSubmit.ok).toBe(true)
    if (!firstSubmit.ok) return
    expect(firstSubmit.attempt.grading?.score).toBe(82)
    expect(firstSubmit.attempt.grading?.weakAreas).toHaveLength(1)
    expect(firstSubmit.attempt.grading?.criterionResults).toHaveLength(2)
    expect(firstSubmit.attempt.grading?.feedback).toContain(
      "Solid explanation",
    )

    // 5. Re-read the Detail Page — the attempt is in history; the most-
    //    recent is the just-submitted one (R5).
    const afterFirst = await getChallengeDetailView(challengeId, db)
    expect(afterFirst).not.toBeNull()
    if (!afterFirst) return
    expect(afterFirst.attempts).toHaveLength(1)
    expect(afterFirst.attempts[0]?.id).toBe(firstSubmit.attempt.id)
    expect(afterFirst.attempts[0]?.grading?.score).toBe(82)

    // 5a. The list-page row now surfaces the latest 0–100 outcome (R5 /
    //     R4 — M8 shape).
    const listAfterFirst = await getChallengeListPageData(
      "acme",
      "portfolio",
      db,
    )
    const rowAfterFirst = listAfterFirst.entries.find(
      (e) => e.type === "add-small-field",
    )
    expect(rowAfterFirst?.latestOutcome).not.toBeNull()
    expect(rowAfterFirst?.latestOutcome?.score).toBe(82)
    expect(rowAfterFirst?.latestOutcome?.scoreBand).toBe("Solid grasp")

    // 6. Retry — submit a second attempt with a higher score. The new
    //    attempt becomes the primary outcome; the prior attempt rotates
    //    into the inline collapsible panel (R5 / FR-10 / US-6).
    const secondSubmitClient = createLlmClient(
      createMockTransport({
        replies: [toolUseReply("submit_grading", validGradingInput(94))],
      }),
    )
    const secondSubmit = await submitChallengeAttempt(
      challengeId,
      {
        explanation:
          "Sharper version: I'd add `displayName` to the users table in " +
          "packages/db/src/schema.ts, run `drizzle-kit generate` to emit " +
          "the migration, then read the field on apps/web/app/page.tsx.",
        filePaths: [
          "packages/db/src/schema.ts",
          "apps/web/app/page.tsx",
        ],
        snippets: [],
      },
      db,
      { client: secondSubmitClient },
    )
    expect(secondSubmit.ok).toBe(true)
    if (!secondSubmit.ok) return
    expect(secondSubmit.attempt.grading?.score).toBe(94)

    const afterSecond = await getChallengeDetailView(challengeId, db)
    expect(afterSecond).not.toBeNull()
    if (!afterSecond) return
    expect(afterSecond.attempts).toHaveLength(2)
    // Most-recent first per R5 — the 94-score attempt is primary.
    expect(afterSecond.attempts[0]?.id).toBe(secondSubmit.attempt.id)
    expect(afterSecond.attempts[0]?.grading?.score).toBe(94)
    // The prior attempt (82) is now in the collapsible panel.
    expect(afterSecond.attempts[1]?.id).toBe(firstSubmit.attempt.id)
    expect(afterSecond.attempts[1]?.grading?.score).toBe(82)
  })

  it('"new challenge" force-regenerates and overwrites the cached row (R2)', async () => {
    // First generation.
    const firstClient = createLlmClient(
      createMockTransport({
        replies: [toolUseReply("submit_challenge", validGenerationInput())],
      }),
    )
    const first = await generateChallengeForType(
      "acme",
      "portfolio",
      "add-small-field",
      { client: firstClient },
      db,
    )
    expect(first.ok).toBe(true)
    if (!first.ok) return

    // "New challenge" — re-invokes the SDK and overwrites the row's
    // content. The challenge id is preserved (the DAL replaces in place);
    // a new generation reply is consumed.
    const regenInput = {
      ...validGenerationInput(),
      taskDescription:
        "Trace where the `displayName` would flow once added (debug path).",
    }
    const regenClient = createLlmClient(
      createMockTransport({
        replies: [toolUseReply("submit_challenge", regenInput)],
      }),
    )
    const regen = await generateChallengeForType(
      "acme",
      "portfolio",
      "add-small-field",
      { forceRegenerate: true, client: regenClient },
      db,
    )
    expect(regen.ok).toBe(true)
    if (!regen.ok) return
    expect(regen.cached).toBe(false)

    const detail = await getChallengeDetailView(regen.challengeId, db)
    expect(detail).not.toBeNull()
    if (!detail) return
    expect(detail.taskDescription).toContain("Trace")
  })

  it("returns type-not-applicable when broken-CI is requested without a failing run (R6)", async () => {
    const client = createLlmClient(createMockTransport({ replies: [] }))
    const result = await generateChallengeForType(
      "acme",
      "portfolio",
      "explain-broken-ci-result",
      { client },
      db,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("type-not-applicable")
    }
  })

  it("returns no-project-map when the snapshot has no M6 map", async () => {
    // Insert a second snapshot without a project map.
    const inserted = db
      .insert(repoSnapshots)
      .values({
        ...snapshot,
        owner: "acme",
        repo: "no-map",
      })
      .returning()
      .get()
    expect(inserted.id).toBeGreaterThan(0)

    const data = await getChallengeListPageData("acme", "no-map", db)
    expect(data.snapshotExists).toBe(true)
    expect(data.projectMapExists).toBe(false)
    expect(data.entries).toHaveLength(0)
  })

  it("submitChallengeAttempt returns challenge-not-found for a stale id", async () => {
    const client = createLlmClient(createMockTransport({ replies: [] }))
    const result = await submitChallengeAttempt(
      99999,
      { explanation: "", filePaths: [], snippets: [] },
      db,
      { client },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("challenge-not-found")
    }
  })
})
