// Tests for the M10 bounded résumé-bullet generation SDK call (Issue #181).
//
// Every test wires a fresh in-memory SQLite (so the M5 stack + M6 map + M7
// units + M9 challenges DAL composes with this module end-to-end) and the
// `@workspace/ai/testing` mock transport (so CI never makes a live API or
// GitHub call). Mirrors the Q&A test posture
// (`./generate-qa.test.ts`).
//
// Coverage targets (from 181.md acceptance criteria + the task brief):
//   - happy path        — seeded M5/M6/M7/M9 + mocked SDK → ≥ 4 well-formed
//                         bullets, all ≤ 160 chars, all in "verb + outcome
//                         + technology" form.
//   - hallucinated tech — mocked submission cites a tech NOT in M5 → throws
//                         ResumeBulletsIntegrityError with the missing list.
//   - hallucinated file — mocked submission cites a path NOT in M6 → throws
//                         ResumeBulletsIntegrityError.
//   - over-length       — a bullet > 160 chars → throws
//                         GenerateResumeBulletsError with kind
//                         "length_violation".
//   - verb prefix       — every bullet's first word is on the allow-list
//                         (regex shape assertion); bad-prefix bullets are
//                         rejected with a verb-prefix violation.
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
import { createLearningUnit } from "../learning-units/units"
import { saveProjectMap, type ProjectMapContent } from "../mapper/project-maps"
import {
  saveStackExplanation,
  type StackExplanationContent,
} from "../stack/explanations"
import type { NewRepoSnapshot, RepoTreeEntry } from "../schema"
import * as schema from "../schema"
import {
  GenerateResumeBulletsError,
  ResumeBulletsIntegrityError,
  generateResumeBullets,
  parseResumeBulletItems,
} from "./generate-bullets"

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
    {
      name: "TypeScript",
      purpose: "Types the entire codebase end-to-end.",
      alternatives: [],
      jobRelevance: "Industry-standard for typed JS.",
    },
  ],
  keyFiles: [
    { path: "apps/web/app/page.tsx", reason: "Top-level page entry." },
  ],
  debugEntryPoints: [],
}

/** Seed snapshot + M5 stack + M6 project map. */
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

/**
 * A well-formed `submit_resume_bullets` input grounded entirely in M5+M6.
 * Five bullets, each ≤ 160 chars, each opening with a strong verb. Every
 * `technologies` entry is in M5 `tools[]`, every `sourceFiles` entry is in
 * M6 `keyFileMap[]`. Used as the baseline for every test that does not
 * specifically need a violation.
 */
function validBullets(overrides?: {
  extraItems?: Record<string, unknown>[]
  replaceItems?: Record<string, unknown>[]
}): Record<string, unknown> {
  const baseItems: Record<string, unknown>[] = [
    {
      text: "Built a Next.js /portfolio route under apps/web/app/page.tsx that renders snapshot rows on first paint.",
      technologies: ["Next.js"],
      sourceFiles: ["apps/web/app/page.tsx"],
    },
    {
      text: "Implemented a typed Drizzle ORM schema for snapshots in packages/db/src/schema.ts, replacing untyped JSON.",
      technologies: ["Drizzle ORM"],
      sourceFiles: ["packages/db/src/schema.ts"],
    },
    {
      text: "Shipped a Next.js Server Action in apps/web/app/actions.ts that loads portfolio rows under 100ms p95.",
      technologies: ["Next.js"],
      sourceFiles: ["apps/web/app/actions.ts"],
    },
    {
      text: "Designed an end-to-end TypeScript pipeline across apps/web and packages/db, eliminating any-typed glue.",
      technologies: ["TypeScript"],
      sourceFiles: ["apps/web/app/page.tsx", "packages/db/src/schema.ts"],
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
  // injected. Assert env unset at the test boundary as defence in depth.
  delete process.env.ANTHROPIC_API_KEY
})

// --- generateResumeBullets — happy path ------------------------------------

describe("generateResumeBullets — happy path", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedBase(db)
    await seedLearningUnit(db, snapshotId)
    await seedChallengeAttempt(db, snapshotId)
  })

  it("produces ≥ 4 well-formed bullets after the model reads M5 + M6 + M7 + M9", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("read_stack_explanation", {}),
          toolUse("read_project_map_entry", {}),
        ]),
        reply([
          toolUse("read_learning_unit", {}),
          toolUse("read_challenge_attempt", {}),
        ]),
        reply([toolUse("submit_resume_bullets", validBullets())]),
      ],
    })
    const items = await generateResumeBullets(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    expect(items.length).toBeGreaterThanOrEqual(4)
    for (const bullet of items) {
      // Length gate: ≤ 160 chars (US-2).
      expect(bullet.text.length).toBeLessThanOrEqual(160)
      // Verb-prefix shape: first word starts a strong past-tense verb.
      // Regex per the AC: every bullet opens with a capitalized verb token.
      expect(bullet.text).toMatch(/^[A-Z][a-z]+\b/)
      // Every cited technology must exist in M5 tools[].
      const allowedTechs = new Set(stackContent.tools.map((t) => t.name))
      for (const tech of bullet.technologies) {
        expect(allowedTechs.has(tech)).toBe(true)
      }
      // Every cited file must exist in M6 keyFileMap[].
      const allowedFiles = new Set(
        projectMapContent.keyFileMap.map((f) => f.path),
      )
      for (const file of bullet.sourceFiles) {
        expect(allowedFiles.has(file)).toBe(true)
      }
    }
  })

  it("offers all five tools and forces the submission tool on the final turn", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("read_stack_explanation", {})])],
    })
    await expect(
      generateResumeBullets(snapshotId, {
        client: createLlmClient(transport),
        db,
      }),
    ).rejects.toBeInstanceOf(GenerateResumeBulletsError)
    expect(transport.calls[0]?.tools?.map((t) => t.name)).toEqual([
      "read_stack_explanation",
      "read_project_map_entry",
      "read_learning_unit",
      "read_challenge_attempt",
      "submit_resume_bullets",
    ])
    expect(transport.calls.at(-1)?.tool_choice).toEqual({
      type: "tool",
      name: "submit_resume_bullets",
    })
  })

  it("accepts an immediate submission with no tool reads", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_resume_bullets", validBullets())])],
    })
    const items = await generateResumeBullets(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    expect(items.length).toBeGreaterThanOrEqual(4)
  })

  it("serves the M5 stack tools through read_stack_explanation", async () => {
    const transport = createMockTransport({
      replies: [
        reply([toolUse("read_stack_explanation", {})]),
        reply([toolUse("submit_resume_bullets", validBullets())]),
      ],
    })
    await generateResumeBullets(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    const second = transport.calls[1]
    const m = second?.messages.filter((x) => x.role === "user").at(-1)
    const block = Array.isArray(m?.content) ? m.content[0] : undefined
    expect(JSON.stringify(block)).toContain("Next.js")
    expect(JSON.stringify(block)).toContain("AUTHORITATIVE stack set")
  })

  it("serves the M6 project map's key files through read_project_map_entry", async () => {
    const transport = createMockTransport({
      replies: [
        reply([toolUse("read_project_map_entry", {})]),
        reply([toolUse("submit_resume_bullets", validBullets())]),
      ],
    })
    await generateResumeBullets(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    const second = transport.calls[1]
    const m = second?.messages.filter((x) => x.role === "user").at(-1)
    const block = Array.isArray(m?.content) ? m.content[0] : undefined
    expect(JSON.stringify(block)).toContain("apps/web/app/page.tsx")
    expect(JSON.stringify(block)).toContain("AUTHORITATIVE file set")
  })
})

// --- generateResumeBullets — integrity rejection (NFR-5) -------------------

describe("generateResumeBullets — integrity rejection (NFR-5)", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedBase(db)
    await seedLearningUnit(db, snapshotId)
    await seedChallengeAttempt(db, snapshotId)
  })

  it("throws ResumeBulletsIntegrityError when a bullet cites a tech NOT in the M5 stack", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_resume_bullets",
            validBullets({
              extraItems: [
                {
                  text: "Implemented a Rust-backed perf layer for portfolio rendering on apps/web/app/page.tsx.",
                  technologies: ["Rust"],
                  sourceFiles: ["apps/web/app/page.tsx"],
                },
              ],
            }),
          ),
        ]),
      ],
    })
    let thrown: unknown
    try {
      await generateResumeBullets(snapshotId, {
        client: createLlmClient(transport),
        db,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(ResumeBulletsIntegrityError)
    const err = thrown as ResumeBulletsIntegrityError
    expect(err.integrity.missing).toContain("Rust")
    // The (rejected) candidate is preserved on the error for diagnostics.
    expect(
      err.candidate.some((b) => b.technologies.includes("Rust")),
    ).toBe(true)
  })

  it("throws ResumeBulletsIntegrityError when a bullet cites a file NOT in the M6 map", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_resume_bullets",
            validBullets({
              extraItems: [
                {
                  text: "Shipped a Next.js admin dashboard under apps/web/app/admin/ghost.tsx for portfolio review.",
                  technologies: ["Next.js"],
                  sourceFiles: ["apps/web/app/admin/ghost.tsx"],
                },
              ],
            }),
          ),
        ]),
      ],
    })
    let thrown: unknown
    try {
      await generateResumeBullets(snapshotId, {
        client: createLlmClient(transport),
        db,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(ResumeBulletsIntegrityError)
    expect(
      (thrown as ResumeBulletsIntegrityError).integrity.missing,
    ).toContain("apps/web/app/admin/ghost.tsx")
  })

  it("rejects a case-mangled technology name (case-sensitive matching mirrors M9)", async () => {
    // M5 names "Next.js"; the candidate says "next.js".
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_resume_bullets",
            validBullets({
              replaceItems: [
                {
                  text: "Built a next.js portfolio route on apps/web/app/page.tsx.",
                  technologies: ["next.js"],
                  sourceFiles: ["apps/web/app/page.tsx"],
                },
              ],
            }),
          ),
        ]),
      ],
    })
    await expect(
      generateResumeBullets(snapshotId, {
        client: createLlmClient(transport),
        db,
      }),
    ).rejects.toBeInstanceOf(ResumeBulletsIntegrityError)
  })
})

// --- generateResumeBullets — length violation (US-2 hard cap) --------------

describe("generateResumeBullets — length violation", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedBase(db)
    await seedLearningUnit(db, snapshotId)
    await seedChallengeAttempt(db, snapshotId)
  })

  it("rejects a bullet that exceeds the 160-char cap with a length-violation message", async () => {
    // A deliberately too-long bullet — 200+ chars — with valid grounding so
    // ONLY the length gate fires.
    const tooLong =
      "Built a tremendously elaborate Next.js portfolio dashboard under apps/web/app/page.tsx that orchestrates snapshot loading, " +
      "renders multi-section memory artifacts, and persists every interaction back to the catalog database."
    expect(tooLong.length).toBeGreaterThan(160)
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_resume_bullets",
            validBullets({
              extraItems: [
                {
                  text: tooLong,
                  technologies: ["Next.js"],
                  sourceFiles: ["apps/web/app/page.tsx"],
                },
              ],
            }),
          ),
        ]),
      ],
    })
    let thrown: unknown
    try {
      await generateResumeBullets(snapshotId, {
        client: createLlmClient(transport),
        db,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(GenerateResumeBulletsError)
    const err = thrown as GenerateResumeBulletsError
    expect(err.kind).toBe("length_violation")
    expect(err.message).toMatch(/160-character cap/i)
    expect(err.offendingBullets?.length).toBe(1)
    expect(err.offendingBullets?.[0]?.text.length).toBeGreaterThan(160)
  })

  it("rejects without silently truncating — the offending bullet is the full original text", async () => {
    const tooLong =
      "Implemented an end-to-end TypeScript pipeline across apps/web and packages/db with full typing of every layer including the SQLite catalog, the Drizzle ORM schema, and every Server Action handler."
    expect(tooLong.length).toBeGreaterThan(160)
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("submit_resume_bullets", {
            items: [
              {
                text: tooLong,
                technologies: ["TypeScript"],
                sourceFiles: ["apps/web/app/page.tsx"],
              },
            ],
          }),
        ]),
      ],
    })
    let thrown: unknown
    try {
      await generateResumeBullets(snapshotId, {
        client: createLlmClient(transport),
        db,
      })
    } catch (err) {
      thrown = err
    }
    const err = thrown as GenerateResumeBulletsError
    // Bullet is preserved verbatim — not truncated.
    expect(err.offendingBullets?.[0]?.text).toBe(tooLong)
  })
})

// --- generateResumeBullets — verb-prefix gate ------------------------------

describe("generateResumeBullets — verb-prefix gate", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedBase(db)
    await seedLearningUnit(db, snapshotId)
    await seedChallengeAttempt(db, snapshotId)
  })

  it("rejects a bullet that opens with a résumé-weak verb (e.g. 'Helped')", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_resume_bullets",
            validBullets({
              extraItems: [
                {
                  text: "Helped with the Next.js portfolio routes on apps/web/app/page.tsx.",
                  technologies: ["Next.js"],
                  sourceFiles: ["apps/web/app/page.tsx"],
                },
              ],
            }),
          ),
        ]),
      ],
    })
    let thrown: unknown
    try {
      await generateResumeBullets(snapshotId, {
        client: createLlmClient(transport),
        db,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(GenerateResumeBulletsError)
    const err = thrown as GenerateResumeBulletsError
    expect(err.kind).toBe("verb_prefix_violation")
    expect(err.offendingBullets?.length).toBe(1)
    expect(err.offendingBullets?.[0]?.text.startsWith("Helped")).toBe(true)
  })

  it("rejects a lower-cased opener (allow-list is case-sensitive)", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("submit_resume_bullets", {
            items: [
              {
                text: "built the Next.js portfolio routes on apps/web/app/page.tsx.",
                technologies: ["Next.js"],
                sourceFiles: ["apps/web/app/page.tsx"],
              },
            ],
          }),
        ]),
      ],
    })
    await expect(
      generateResumeBullets(snapshotId, {
        client: createLlmClient(transport),
        db,
      }),
    ).rejects.toMatchObject({ kind: "verb_prefix_violation" })
  })

  it("every happy-path bullet's first word resolves on the allow-list (regex shape assertion)", async () => {
    // This test is the AC's "verb + outcome + technology prefix check"
    // covered as a regex / shape assertion on each bullet.
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_resume_bullets", validBullets())])],
    })
    const items = await generateResumeBullets(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    const verbAllowList = new Set([
      "Built",
      "Implemented",
      "Shipped",
      "Designed",
      "Wrote",
      "Reduced",
      "Improved",
      "Refactored",
      "Migrated",
      "Integrated",
      "Automated",
      "Optimized",
      "Architected",
      "Created",
      "Developed",
      "Engineered",
      "Delivered",
      "Established",
      "Introduced",
      "Launched",
      "Modernized",
      "Streamlined",
      "Composed",
      "Modeled",
    ])
    for (const bullet of items) {
      const firstWord = bullet.text.split(/\s+/)[0]?.replace(/[^A-Za-z]+$/, "")
      expect(firstWord).toBeTruthy()
      expect(verbAllowList.has(firstWord ?? "")).toBe(true)
    }
  })
})

// --- generateResumeBullets — boundary failures ----------------------------

describe("generateResumeBullets — boundary failures", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedBase(db)
    await seedLearningUnit(db, snapshotId)
    await seedChallengeAttempt(db, snapshotId)
  })

  it("maps an LLM transport failure to a typed llm_error", async () => {
    const client = createLlmClient(
      createMockTransport({ throws: new Error("network down") }),
    )
    let thrown: unknown
    try {
      await generateResumeBullets(snapshotId, { client, db })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(GenerateResumeBulletsError)
    expect((thrown as GenerateResumeBulletsError).kind).toBe("llm_error")
    expect((thrown as GenerateResumeBulletsError).cause).toBeDefined()
  })

  it("throws no_structured_output when the model only returns text", async () => {
    const client = createLlmClient(
      createMockTransport({ replies: [{ text: "Here is some prose." }] }),
    )
    let thrown: unknown
    try {
      await generateResumeBullets(snapshotId, { client, db })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(GenerateResumeBulletsError)
    expect((thrown as GenerateResumeBulletsError).kind).toBe(
      "no_structured_output",
    )
  })

  it("throws no_structured_output when the submission is empty", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [reply([toolUse("submit_resume_bullets", { items: [] })])],
      }),
    )
    let thrown: unknown
    try {
      await generateResumeBullets(snapshotId, { client, db })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(GenerateResumeBulletsError)
    expect((thrown as GenerateResumeBulletsError).kind).toBe(
      "no_structured_output",
    )
  })
})

// --- generateResumeBullets — mock-transport audit -------------------------

describe("generateResumeBullets — mock-transport audit", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seedBase(db)
    await seedLearningUnit(db, snapshotId)
    await seedChallengeAttempt(db, snapshotId)
  })

  it("never reaches the live Anthropic API — every reply comes from the mock", async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_resume_bullets", validBullets())])],
    })
    await generateResumeBullets(snapshotId, {
      client: createLlmClient(transport),
      db,
    })
    expect(transport.calls).toHaveLength(1)
  })
})

// --- parseResumeBulletItems ------------------------------------------------

describe("parseResumeBulletItems", () => {
  it("parses a well-formed submission", () => {
    const parsed = parseResumeBulletItems(validBullets())
    expect(parsed).not.toBeNull()
    expect(parsed?.length).toBe(4)
    expect(parsed?.[0]?.text).toMatch(/^Built /)
  })

  it("rejects a non-object input", () => {
    expect(parseResumeBulletItems("nope")).toBeNull()
    expect(parseResumeBulletItems(null)).toBeNull()
  })

  it("rejects a submission with no items array", () => {
    expect(parseResumeBulletItems({ items: "nope" })).toBeNull()
  })

  it("rejects a submission with an empty items array", () => {
    expect(parseResumeBulletItems({ items: [] })).toBeNull()
  })

  it("drops items missing the required `text` field", () => {
    const parsed = parseResumeBulletItems({
      items: [
        {
          text: "",
          technologies: ["Next.js"],
          sourceFiles: [],
        },
        {
          text: "Built something on apps/web/app/page.tsx with Next.js.",
          technologies: ["Next.js"],
          sourceFiles: ["apps/web/app/page.tsx"],
        },
      ],
    })
    expect(parsed).toHaveLength(1)
    expect(parsed?.[0]?.text.startsWith("Built")).toBe(true)
  })

  it("defaults technologies / sourceFiles to empty arrays when omitted", () => {
    const parsed = parseResumeBulletItems({
      items: [{ text: "Built a thing." }],
    })
    expect(parsed?.[0]?.technologies).toEqual([])
    expect(parsed?.[0]?.sourceFiles).toEqual([])
  })
})
