// Tests for the M10 bounded interview Q&A generation SDK call (Issue #180).
//
// Every test wires a fresh in-memory SQLite (so the M5 stack + M6 map + M7
// units + M8 reviews + M9 challenges DAL composes with this module
// end-to-end) and the `@workspace/ai/testing` mock transport (so CI never
// makes a live API or GitHub call). Mirrors the M7 + M9 test posture
// (`../learning-units/generate.test.ts`, `../challenges/generation.test.ts`).
//
// Coverage targets (verbatim from 180.md acceptance criteria):
//   - happy path        — seeded M5/M6/M7/M8/M9 + mocked SDK → at least one
//                         Q&A per ground area.
//   - hallucinated file — mocked submission cites a path not in the M6 key
//                         file map → throws InterviewQAIntegrityError with
//                         the missing-references list.
//   - hallucinated tech — mocked submission cites a tech not in the M5
//                         tools[] → throws InterviewQAIntegrityError.
//   - empty source data — fixture with NO challenge_attempts → the model is
//                         allowed to skip 'debug-expansion'; the call
//                         succeeds.
//   - no ANTHROPIC_API_KEY — every reply comes from the mock; the call list
//                            is audited.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient } from "@workspace/ai"
import { createMockTransport, type MockReply } from "@workspace/ai/testing"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import {
  createChallengeAttempt,
  saveChallenge,
} from "../challenges/challenges"
import type { CatalogDb } from "../client"
import { saveDiffReview } from "../diff/reviews"
import { createLearningUnit } from "../learning-units/units"
import { saveProjectMap, type ProjectMapContent } from "../mapper/project-maps"
import {
  saveStackExplanation,
  type StackExplanationContent,
} from "../stack/explanations"
import type { NewRepoSnapshot, RepoTreeEntry } from "../schema"
import * as schema from "../schema"
import {
  GenerateInterviewQAError,
  InterviewQAIntegrityError,
  generateInterviewQA,
  parseInterviewQAItems,
} from "./generate-qa"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
)

/** A fresh in-memory catalog DB with the real migrations applied. */
function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

// --- Fixture data ----------------------------------------------------------

const fileTree: RepoTreeEntry[] = [
  { path: "apps/web/app/page.tsx", type: "blob", sha: "a", size: 200 },
  { path: "apps/web/app/actions.ts", type: "blob", sha: "b", size: 150 },
  { path: "packages/db/src/schema.ts", type: "blob", sha: "c", size: 300 },
]

const snapshotInsert: NewRepoSnapshot = {
  owner: "acme",
  repo: "portfolio",
  ref: "main",
  commitSha: "deadbeef",
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/portfolio",
  fileTree,
}

const projectMapContent: ProjectMapContent = {
  architectureOverview: [
    { title: "Frontend", detail: "Next.js App Router under apps/web/app/." },
    { title: "Data", detail: "SQLite via Drizzle." },
  ],
  keyFileMap: [
    { path: "apps/web/app/page.tsx", role: "Home page." },
    { path: "apps/web/app/actions.ts", role: "Server actions." },
    { path: "packages/db/src/schema.ts", role: "Database schema." },
  ],
  requestDataFlow: [
    {
      order: 1,
      description: "User loads page.",
      path: "apps/web/app/page.tsx",
    },
  ],
  stateFlow: [],
  aiCallFlow: [],
  mermaidDiagram: "graph TD; A-->B;",
  debugPath: [
    { location: "apps/web/app/page.tsx", guidance: "Inspect the page." },
  ],
}

const stackContent: StackExplanationContent = {
  tools: [
    {
      name: "Next.js",
      purpose: "Renders the /portfolio routes via App Router.",
      alternatives: [
        { name: "Remix", tradeOff: "Different data-fetching model." },
      ],
      jobRelevance: "Heavy demand for React roles.",
    },
    {
      name: "Drizzle ORM",
      purpose: "Types the local SQLite catalog.",
      alternatives: [],
      jobRelevance: "Modern TS-native ORM.",
    },
  ],
  keyFiles: [
    { path: "apps/web/app/page.tsx", reason: "Top-level page entry." },
  ],
  debugEntryPoints: [],
}

/**
 * Seed a snapshot + an M5 stack + an M6 project map. Used by every test;
 * additional ground-area rows (M7/M8/M9) are seeded by helpers below per
 * test so the "empty source data" case can omit them cleanly.
 */
async function seedBase(db: CatalogDb): Promise<number> {
  const row = db
    .insert(schema.repoSnapshots)
    .values(snapshotInsert)
    .returning()
    .get()
  await saveStackExplanation(row.id, stackContent, db)
  await saveProjectMap(row.id, projectMapContent, db)
  return row.id
}

/** Seed an M7 learning unit on the snapshot. */
async function seedLearningUnit(db: CatalogDb, snapshotId: number) {
  await createLearningUnit(
    {
      snapshotId,
      source: "github-issue",
      issueRef: "#42",
      restatedGoal: "Add a /portfolio handler under apps/web/app/page.tsx.",
      relatedFiles: [
        {
          path: "apps/web/app/page.tsx",
          reason: "The page that renders the portfolio.",
        },
      ],
      concepts: [
        {
          name: "App Router",
          explanation: "Next.js App Router lives under apps/web/app/.",
        },
      ],
      agentExecutionNotes: [
        { order: 1, description: "Read the page handler." },
      ],
      reviewChecklist: [
        { id: "c1", description: "page.tsx renders the portfolio data." },
      ],
      questions: [{ id: "q1", prompt: "How does the page fetch data?" }],
      challengeConcept: null,
      challengeType: null,
    },
    db,
  )
}

/** Seed an M8 diff review on the snapshot. */
async function seedDiffReview(db: CatalogDb, snapshotId: number) {
  await saveDiffReview(
    snapshotId,
    7,
    {
      changedFiles: [
        {
          path: "apps/web/app/actions.ts",
          explanation: "Adds a portfolio Server Action.",
        },
      ],
      coreLogicExplanation:
        "Introduces a Server Action that loads the portfolio rows.",
      riskAnalysis: [
        {
          title: "Unbounded query",
          detail: "The action does not paginate apps/web/app/actions.ts.",
        },
      ],
      testSuggestions: [
        {
          description: "Cover the new action.",
          rationale: "Regression risk on apps/web/app/actions.ts.",
        },
      ],
      comprehensionQuestions: [
        { id: "q1", prompt: "What does the new Server Action do?" },
      ],
    },
    db,
  )
}

/** Seed an M9 challenge + one attempt on the snapshot. */
async function seedChallengeAttempt(db: CatalogDb, snapshotId: number) {
  const challenge = await saveChallenge(
    snapshotId,
    "add-small-field",
    {
      taskDescription:
        "Add a displayName column on packages/db/src/schema.ts and render it.",
      inScopeFiles: [
        "packages/db/src/schema.ts",
        "apps/web/app/page.tsx",
      ],
      outOfScopeFiles: ["apps/web/app/actions.ts"],
      acceptanceCriteria: [
        {
          id: "c1",
          detail: "Names schema.ts as the place the new column is added.",
        },
      ],
      sourceReferences: [
        {
          section: "keyFileMap",
          path: "packages/db/src/schema.ts",
          note: "Schema home.",
        },
      ],
    },
    db,
  )
  await createChallengeAttempt(
    challenge.id,
    {
      explanation:
        "I added the column on packages/db/src/schema.ts then read it on " +
        "apps/web/app/page.tsx.",
      snippets: [],
      filePaths: ["packages/db/src/schema.ts", "apps/web/app/page.tsx"],
    },
    db,
  )
}

// --- Mock helpers ----------------------------------------------------------

/** A `tool_use` content block. */
function toolUse(
  name: string,
  input: Record<string, unknown>,
): Anthropic.ContentBlock {
  return {
    type: "tool_use",
    id: `tu_${name}`,
    name,
    input,
  } as unknown as Anthropic.ContentBlock
}

/** A `tool_use` reply for the mock transport. */
function reply(content: Anthropic.ContentBlock[]): MockReply {
  return { content, stopReason: "tool_use" }
}

/** A well-formed `submit_interview_qa` input grounded entirely in M5+M6. */
function validQAItems(overrides?: {
  extraItems?: Record<string, unknown>[]
  replaceItems?: Record<string, unknown>[]
}): Record<string, unknown> {
  const baseItems: Record<string, unknown>[] = [
    {
      question:
        "Why does THIS project use Next.js for the /portfolio routes?",
      answer:
        "The project picks Next.js because App Router under " +
        "apps/web/app/page.tsx renders the portfolio routes without an extra " +
        "server.",
      groundArea: "stack",
      sourceReferences: ["Next.js", "apps/web/app/page.tsx"],
    },
    {
      question:
        "How does the request flow reach apps/web/app/page.tsx in THIS repo?",
      answer:
        "The architecture overview names Frontend under apps/web/app/ and " +
        "the request flow loads page.tsx first.",
      groundArea: "architecture",
      sourceReferences: ["apps/web/app/page.tsx"],
    },
    {
      question:
        "What did learning unit #42 teach about apps/web/app/page.tsx?",
      answer:
        "Issue #42 restated the /portfolio handler goal grounded in " +
        "apps/web/app/page.tsx as the route entry.",
      groundArea: "issue-learning",
      sourceReferences: ["apps/web/app/page.tsx"],
    },
    {
      question:
        "What risk did the PR #7 diff review surface about apps/web/app/actions.ts?",
      answer:
        "The unbounded query risk in apps/web/app/actions.ts is the core " +
        "risk surfaced by the diff review.",
      groundArea: "diff-review",
      sourceReferences: ["apps/web/app/actions.ts"],
    },
    {
      question:
        "Walk me through the add-small-field challenge attempt on packages/db/src/schema.ts.",
      answer:
        "The attempt added the displayName column on packages/db/src/schema.ts " +
        "and read it on apps/web/app/page.tsx — grounded entirely in M6.",
      groundArea: "debug-expansion",
      sourceReferences: [
        "packages/db/src/schema.ts",
        "apps/web/app/page.tsx",
      ],
    },
  ]
  const items =
    overrides?.replaceItems ??
    (overrides?.extraItems
      ? [...baseItems, ...overrides.extraItems]
      : baseItems)
  return { items }
}

// --- Test environment ------------------------------------------------------

beforeEach(() => {
  // The bounded SDK call must never read ANTHROPIC_API_KEY when a client is
  // injected. Assert the env is unset at the test boundary as a defence-
  // in-depth check: if any test accidentally builds a real client, it must
  // not silently succeed in CI.
  delete process.env.ANTHROPIC_API_KEY
})

// --- generateInterviewQA — happy path -------------------------------------

describe("generateInterviewQA — happy path", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedBase(db)
    await seedLearningUnit(db, snapshotId)
    await seedDiffReview(db, snapshotId)
    await seedChallengeAttempt(db, snapshotId)
  })

  it("produces ≥ one Q&A per ground area after the model reads each source", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("read_stack_explanation", {}),
          toolUse("read_project_map_entry", {}),
        ]),
        reply([
          toolUse("read_learning_unit", {}),
          toolUse("read_diff_review", {}),
          toolUse("read_challenge_attempt", {}),
        ]),
        reply([toolUse("submit_interview_qa", validQAItems())]),
      ],
    })
    const items = await generateInterviewQA(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    expect(items).toHaveLength(5)
    const areas = new Set(items.map((i) => i.groundArea))
    expect(areas.has("stack")).toBe(true)
    expect(areas.has("architecture")).toBe(true)
    expect(areas.has("issue-learning")).toBe(true)
    expect(areas.has("diff-review")).toBe(true)
    expect(areas.has("debug-expansion")).toBe(true)
  })

  it("accepts an immediate submission with no tool reads", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_interview_qa", validQAItems())])],
    })
    const items = await generateInterviewQA(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    expect(items).toHaveLength(5)
  })

  it("offers all six tools and forces the submission tool on the final turn", async () => {
    // The model keeps reading sources; the call must still terminate.
    const transport = createMockTransport({
      replies: [reply([toolUse("read_stack_explanation", {})])],
    })
    await expect(
      generateInterviewQA(snapshotId, {
        client: createLlmClient(transport),
        db,
      }),
    ).rejects.toBeInstanceOf(GenerateInterviewQAError)
    // Tool list on every call equals the six fixed tools, in order.
    expect(transport.calls[0]?.tools?.map((t) => t.name)).toEqual([
      "read_stack_explanation",
      "read_project_map_entry",
      "read_learning_unit",
      "read_diff_review",
      "read_challenge_attempt",
      "submit_interview_qa",
    ])
    // The final turn forces the submission tool.
    expect(transport.calls.at(-1)?.tool_choice).toEqual({
      type: "tool",
      name: "submit_interview_qa",
    })
  })

  it("serves the M6 project map's key files through read_project_map_entry", async () => {
    const transport = createMockTransport({
      replies: [
        reply([toolUse("read_project_map_entry", {})]),
        reply([toolUse("submit_interview_qa", validQAItems())]),
      ],
    })
    await generateInterviewQA(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    const secondCall = transport.calls[1]
    const userMsg = secondCall?.messages
      .filter((m) => m.role === "user")
      .at(-1)
    const block = Array.isArray(userMsg?.content)
      ? userMsg.content[0]
      : undefined
    expect(JSON.stringify(block)).toContain("apps/web/app/page.tsx")
    expect(JSON.stringify(block)).toContain("AUTHORITATIVE file set")
  })

  it("serves the M5 stack's tools through read_stack_explanation", async () => {
    const transport = createMockTransport({
      replies: [
        reply([toolUse("read_stack_explanation", {})]),
        reply([toolUse("submit_interview_qa", validQAItems())]),
      ],
    })
    await generateInterviewQA(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    const block = (() => {
      const second = transport.calls[1]
      const m = second?.messages.filter((x) => x.role === "user").at(-1)
      return Array.isArray(m?.content) ? m.content[0] : undefined
    })()
    expect(JSON.stringify(block)).toContain("Next.js")
    expect(JSON.stringify(block)).toContain("AUTHORITATIVE stack set")
  })
})

// --- generateInterviewQA — integrity rejection ----------------------------

describe("generateInterviewQA — integrity rejection (NFR-5)", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedBase(db)
    await seedLearningUnit(db, snapshotId)
    await seedDiffReview(db, snapshotId)
    await seedChallengeAttempt(db, snapshotId)
  })

  it("throws InterviewQAIntegrityError when an item cites a file NOT in the M6 map", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_interview_qa",
            validQAItems({
              extraItems: [
                {
                  question:
                    "What does apps/web/app/ghost.tsx do in this project?",
                  answer:
                    "It is referenced by the architecture overview as the " +
                    "ghost route.",
                  groundArea: "architecture",
                  sourceReferences: ["apps/web/app/ghost.tsx"],
                },
              ],
            }),
          ),
        ]),
      ],
    })
    let thrown: unknown
    try {
      await generateInterviewQA(snapshotId, {
        client: createLlmClient(transport),
        db,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(InterviewQAIntegrityError)
    const err = thrown as InterviewQAIntegrityError
    expect(err.integrity.missing).toContain("apps/web/app/ghost.tsx")
    // The (rejected) candidate is preserved on the error for diagnostics —
    // never silently softened or returned.
    expect(err.candidate.some((i) => i.groundArea === "architecture")).toBe(
      true,
    )
  })

  it("throws InterviewQAIntegrityError when an item cites a technology NOT in the M5 stack", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_interview_qa",
            validQAItems({
              extraItems: [
                {
                  question:
                    "Why does THIS project use Rust for the /portfolio handler?",
                  answer:
                    "Rust is named alongside Next.js in the stack decision " +
                    "map for performance.",
                  groundArea: "stack",
                  sourceReferences: ["Rust"],
                },
              ],
            }),
          ),
        ]),
      ],
    })
    let thrown: unknown
    try {
      await generateInterviewQA(snapshotId, {
        client: createLlmClient(transport),
        db,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(InterviewQAIntegrityError)
    expect(
      (thrown as InterviewQAIntegrityError).integrity.missing,
    ).toContain("Rust")
  })

  it("rejects a case-mangled technology name (case-sensitive matching mirrors M9)", async () => {
    // M5 names "Next.js"; the candidate says "next.js" — case-mismatch.
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_interview_qa",
            validQAItems({
              replaceItems: [
                {
                  question:
                    "Why does THIS project use next.js for the /portfolio handler?",
                  answer: "Lower-cased name.",
                  groundArea: "stack",
                  sourceReferences: ["next.js"],
                },
              ],
            }),
          ),
        ]),
      ],
    })
    await expect(
      generateInterviewQA(snapshotId, {
        client: createLlmClient(transport),
        db,
      }),
    ).rejects.toBeInstanceOf(InterviewQAIntegrityError)
  })
})

// --- generateInterviewQA — empty source data (skip area) ------------------

describe("generateInterviewQA — empty source data (skip area)", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedBase(db)
    // Seed M7 + M8 only — NO M9 challenge attempts. The model must skip the
    // 'debug-expansion' ground area rather than fabricating a Q&A.
    await seedLearningUnit(db, snapshotId)
    await seedDiffReview(db, snapshotId)
  })

  it("succeeds when the model skips the debug-expansion area because no attempts exist", async () => {
    // The valid pack omits the debug-expansion item — only four items.
    const transport = createMockTransport({
      replies: [
        reply([toolUse("read_challenge_attempt", {})]),
        reply([
          toolUse("submit_interview_qa", {
            items: [
              {
                question: "Why Next.js for THIS project's /portfolio handler?",
                answer:
                  "Next.js renders the portfolio routes via App Router under " +
                  "apps/web/app/page.tsx.",
                groundArea: "stack",
                sourceReferences: ["Next.js", "apps/web/app/page.tsx"],
              },
              {
                question:
                  "How does the request flow reach apps/web/app/page.tsx?",
                answer:
                  "The Frontend layer in the architecture overview loads " +
                  "page.tsx first.",
                groundArea: "architecture",
                sourceReferences: ["apps/web/app/page.tsx"],
              },
              {
                question: "What did learning unit #42 teach about page.tsx?",
                answer:
                  "Issue #42's restated goal was the /portfolio handler on " +
                  "apps/web/app/page.tsx.",
                groundArea: "issue-learning",
                sourceReferences: ["apps/web/app/page.tsx"],
              },
              {
                question:
                  "What risk did PR #7 surface about apps/web/app/actions.ts?",
                answer:
                  "An unbounded query risk on apps/web/app/actions.ts.",
                groundArea: "diff-review",
                sourceReferences: ["apps/web/app/actions.ts"],
              },
            ],
          }),
        ]),
      ],
    })
    const items = await generateInterviewQA(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    expect(items).toHaveLength(4)
    expect(items.some((i) => i.groundArea === "debug-expansion")).toBe(false)

    // The read_challenge_attempt tool MUST have returned a "no challenge
    // attempts" sentinel that explicitly tells the model to skip the area.
    const userMsg = transport.calls[1]?.messages
      .filter((m) => m.role === "user")
      .at(-1)
    const block = Array.isArray(userMsg?.content)
      ? userMsg.content[0]
      : undefined
    expect(JSON.stringify(block)).toContain("no challenge attempts")
    expect(JSON.stringify(block)).toContain("Skip the 'debug-expansion'")
  })

  it("flags the empty area in the initial prompt inventory", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("submit_interview_qa", {
            items: [
              {
                question: "Why Next.js for THIS project?",
                answer: "Renders the routes on apps/web/app/page.tsx.",
                groundArea: "stack",
                sourceReferences: ["Next.js"],
              },
            ],
          }),
        ]),
      ],
    })
    await generateInterviewQA(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    const firstUser = transport.calls[0]?.messages[0]
    const prompt =
      typeof firstUser?.content === "string" ? firstUser.content : ""
    // The inventory explicitly tells the model to skip 'debug-expansion'.
    expect(prompt).toContain("debug-expansion")
    expect(prompt).toMatch(/skip 'debug-expansion'/i)
  })
})

// --- generateInterviewQA — boundary failures ------------------------------

describe("generateInterviewQA — boundary failures", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedBase(db)
    await seedLearningUnit(db, snapshotId)
    await seedDiffReview(db, snapshotId)
    await seedChallengeAttempt(db, snapshotId)
  })

  it("maps an LLM transport failure to a typed llm_error", async () => {
    const client = createLlmClient(
      createMockTransport({ throws: new Error("network down") }),
    )
    let thrown: unknown
    try {
      await generateInterviewQA(snapshotId, { client, db })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(GenerateInterviewQAError)
    expect((thrown as GenerateInterviewQAError).kind).toBe("llm_error")
    expect((thrown as GenerateInterviewQAError).cause).toBeDefined()
  })

  it("throws no_structured_output when the model only returns text", async () => {
    const client = createLlmClient(
      createMockTransport({ replies: [{ text: "Here is some prose." }] }),
    )
    let thrown: unknown
    try {
      await generateInterviewQA(snapshotId, { client, db })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(GenerateInterviewQAError)
    expect((thrown as GenerateInterviewQAError).kind).toBe(
      "no_structured_output",
    )
  })

  it("throws no_structured_output when the submission is empty", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [reply([toolUse("submit_interview_qa", { items: [] })])],
      }),
    )
    let thrown: unknown
    try {
      await generateInterviewQA(snapshotId, { client, db })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(GenerateInterviewQAError)
    expect((thrown as GenerateInterviewQAError).kind).toBe(
      "no_structured_output",
    )
  })
})

// --- generateInterviewQA — mock-transport audit ---------------------------

describe("generateInterviewQA — mock-transport audit", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedBase(db)
    await seedLearningUnit(db, snapshotId)
    await seedDiffReview(db, snapshotId)
    await seedChallengeAttempt(db, snapshotId)
  })

  it("never reaches the live Anthropic API — every reply comes from the mock", async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_interview_qa", validQAItems())])],
    })
    await generateInterviewQA(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    // One bounded round-trip; the call exited as soon as the model submitted.
    expect(transport.calls).toHaveLength(1)
  })
})

// --- parseInterviewQAItems -------------------------------------------------

describe("parseInterviewQAItems", () => {
  it("parses a well-formed submission", () => {
    const parsed = parseInterviewQAItems(validQAItems())
    expect(parsed).not.toBeNull()
    expect(parsed?.length).toBe(5)
    expect(parsed?.[0]?.groundArea).toBe("stack")
  })

  it("rejects a non-object input", () => {
    expect(parseInterviewQAItems("nope")).toBeNull()
    expect(parseInterviewQAItems(null)).toBeNull()
  })

  it("rejects a submission with no items array", () => {
    expect(parseInterviewQAItems({ items: "nope" })).toBeNull()
  })

  it("rejects a submission with an empty items array", () => {
    expect(parseInterviewQAItems({ items: [] })).toBeNull()
  })

  it("drops items with an invalid groundArea", () => {
    const parsed = parseInterviewQAItems({
      items: [
        {
          question: "Q1",
          answer: "A1",
          groundArea: "stack",
          sourceReferences: ["Next.js"],
        },
        {
          question: "Q2",
          answer: "A2",
          groundArea: "not-a-real-area",
          sourceReferences: [],
        },
      ],
    })
    expect(parsed).toHaveLength(1)
    expect(parsed?.[0]?.groundArea).toBe("stack")
  })

  it("drops items missing a required field", () => {
    const parsed = parseInterviewQAItems({
      items: [
        {
          question: "",
          answer: "A1",
          groundArea: "stack",
          sourceReferences: [],
        },
        {
          question: "Q2",
          answer: "A2",
          groundArea: "stack",
          sourceReferences: ["Next.js"],
        },
      ],
    })
    expect(parsed).toHaveLength(1)
    expect(parsed?.[0]?.question).toBe("Q2")
  })

  it("defaults sourceReferences to an empty array when omitted", () => {
    const parsed = parseInterviewQAItems({
      items: [
        {
          question: "Q",
          answer: "A",
          groundArea: "stack",
        },
      ],
    })
    expect(parsed?.[0]?.sourceReferences).toEqual([])
  })
})
