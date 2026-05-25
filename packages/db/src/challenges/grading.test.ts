// Tests for the M9 bounded grading SDK call (Issue #143).
//
// Every test wires a fresh in-memory SQLite (so #140's DAL + #141's
// integrity check + this module compose end-to-end) and the
// `@workspace/ai/testing` mock transport (so CI never makes a live API
// call). Mirrors the M8 grade-call test posture (`../diff/grade.test.ts`)
// plus the DAL-round-trip posture (`./challenges.test.ts`).
//
// Coverage targets (verbatim from 143.md acceptance criteria):
//   - a passing submission (high score + per-criterion + feedback);
//   - a partial submission (mid score, weak areas surfaced);
//   - an empty submission graced gracefully (low score, never crashes);
//   - an off-project file reference in grading rejected by the integrity
//     check — throws and persists nothing (R8 / FR-6);
//   - a multi-attempt sequence each carrying its own grading result (US-6).
//
// Plus shape-correctness tests for {@link parseGradingContent} so the parse
// boundary stays honest, mirroring `../diff/grade.test.ts`.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient } from "@workspace/ai"
import { createMockTransport, type MockReply } from "@workspace/ai/testing"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import { createProjectMap } from "../mapper/project-maps"
import type {
  Challenge,
  ChallengeAttempt,
  ChallengeAttemptSnippet,
  NewRepoSnapshot,
  ProjectMapFile,
} from "../schema"
import * as schema from "../schema"
import {
  createChallenge,
  createChallengeAttempt,
  getLatestChallengeAttempt,
  listChallengeAttempts,
  type ChallengeAttemptSubmission,
  type ChallengeContent,
} from "./challenges"
import {
  ChallengeGradingIntegrityError,
  gradeChallenge,
  parseGradingContent,
} from "./grading"

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

/** A complete add-small-field challenge, every cited path resolvable in M6. */
const challengeContent: ChallengeContent = {
  taskDescription:
    "Add a `displayName` field to the user record so the landing page can " +
    "show it after sign-in.",
  inScopeFiles: ["packages/db/src/schema.ts", "apps/web/app/page.tsx"],
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
      note: "The schema file is where user-record columns live.",
    },
  ],
}

/** Seed the snapshot + M6 project map and create the challenge row. */
async function seed(
  db: CatalogDb,
): Promise<{ snapshotId: number; challenge: Challenge }> {
  const inserted = db
    .insert(schema.repoSnapshots)
    .values(snapshot)
    .returning()
    .get()
  const snapshotId = inserted.id
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
  const challenge = await createChallenge(
    snapshotId,
    "add-small-field",
    challengeContent,
    db,
  )
  return { snapshotId, challenge }
}

/** A submission with a complete, on-topic explanation. */
function passingSubmission(): ChallengeAttemptSubmission {
  return {
    explanation:
      "I would add a `displayName` text column in packages/db/src/schema.ts " +
      "and render it on apps/web/app/page.tsx after sign-in. After editing " +
      "the schema, I would run drizzle-kit generate to produce a new " +
      "migration so the database picks up the column.",
    snippets: [
      {
        path: "packages/db/src/schema.ts",
        code: "displayName: text('display_name').notNull()",
      },
    ],
    filePaths: ["packages/db/src/schema.ts", "apps/web/app/page.tsx"],
  }
}

/** A submission whose explanation only covers half the criteria. */
function partialSubmission(): ChallengeAttemptSubmission {
  return {
    explanation:
      "I would add a `displayName` column in packages/db/src/schema.ts and " +
      "show it on the landing page.",
    snippets: [] as ChallengeAttemptSnippet[],
    filePaths: ["packages/db/src/schema.ts"],
  }
}

/** A submission with no explanation at all. */
function emptySubmission(): ChallengeAttemptSubmission {
  return {
    explanation: "",
    snippets: [] as ChallengeAttemptSnippet[],
    filePaths: [],
  }
}

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

/** A well-formed `submit_grading` input, M6-grounded by default. */
function validGrading(overrides?: {
  score?: number
  feedback?: string
  weakAreas?: { area: string; detail: string }[]
  criterionResults?: { criterionId: string; passed: boolean; detail: string }[]
}): Record<string, unknown> {
  return {
    score: overrides?.score ?? 88,
    weakAreas: overrides?.weakAreas ?? [
      {
        area: "migration-step",
        detail: "Could be even more specific about the drizzle-kit command.",
      },
    ],
    criterionResults: overrides?.criterionResults ?? [
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
      overrides?.feedback ??
      "Solid explanation; rooted in the actual schema and page files.",
  }
}

describe("gradeChallenge — passing submission", () => {
  let db: CatalogDb
  let challenge: Challenge

  beforeEach(async () => {
    db = makeTestDb()
    ;({ challenge } = await seed(db))
  })

  it("produces a structured grading and persists it onto the attempt", async () => {
    const attempt = await createChallengeAttempt(
      challenge.id,
      passingSubmission(),
      db,
    )
    const client = createLlmClient(
      createMockTransport({
        replies: [reply([toolUse("submit_grading", validGrading())])],
      }),
    )
    const result = await gradeChallenge({ challenge, attempt, client, db })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.grading.score).toBe(88)
      expect(result.data.grading.weakAreas).toHaveLength(1)
      expect(result.data.grading.weakAreas[0]?.area).toBe("migration-step")
      expect(result.data.grading.criterionResults).toHaveLength(2)
      expect(result.data.grading.criterionResults[0]?.criterionId).toBe("c1")
      expect(result.data.grading.criterionResults[0]?.passed).toBe(true)
      expect(result.data.grading.feedback).toContain("Solid explanation")
      // The grading was persisted onto the attempt row (#140 DAL).
      expect(result.data.attempt.id).toBe(attempt.id)
      expect(result.data.attempt.grading?.score).toBe(88)
    }
    const stored = await getLatestChallengeAttempt(challenge.id, db)
    expect(stored?.grading?.score).toBe(88)
  })

  it("makes one bounded SDK call with submit_grading forced", async () => {
    const attempt = await createChallengeAttempt(
      challenge.id,
      passingSubmission(),
      db,
    )
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_grading", validGrading())])],
    })
    await gradeChallenge({
      challenge,
      attempt,
      client: createLlmClient(transport),
      db,
    })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0]?.tools?.map((t) => t.name)).toEqual([
      "submit_grading",
    ])
    expect(transport.calls[0]?.tool_choice).toEqual({
      type: "tool",
      name: "submit_grading",
    })
  })

  it("includes the acceptance criteria and the explanation in the prompt", async () => {
    const attempt = await createChallengeAttempt(
      challenge.id,
      passingSubmission(),
      db,
    )
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_grading", validGrading())])],
    })
    await gradeChallenge({
      challenge,
      attempt,
      client: createLlmClient(transport),
      db,
    })
    const firstMsg = transport.calls[0]?.messages[0]
    const prompt =
      typeof firstMsg?.content === "string"
        ? firstMsg.content
        : JSON.stringify(firstMsg?.content)
    // Every criterion is named, in order, with its id.
    expect(prompt).toContain("(id: c1)")
    expect(prompt).toContain("(id: c2)")
    // The explanation is the graded artifact and is in the prompt.
    expect(prompt).toContain("THE GRADED ARTIFACT")
    expect(prompt).toContain("drizzle-kit generate")
    // The snippets and the file-path list are labelled illustrative.
    expect(prompt).toContain("DO NOT GRADE")
  })
})

describe("gradeChallenge — partial submission", () => {
  let db: CatalogDb
  let challenge: Challenge

  beforeEach(async () => {
    db = makeTestDb()
    ;({ challenge } = await seed(db))
  })

  it("grades a partial submission rather than failing", async () => {
    const attempt = await createChallengeAttempt(
      challenge.id,
      partialSubmission(),
      db,
    )
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_grading",
              validGrading({
                score: 55,
                criterionResults: [
                  {
                    criterionId: "c1",
                    passed: true,
                    detail: "Named the schema file as the column site.",
                  },
                  {
                    criterionId: "c2",
                    passed: false,
                    detail: "Did not mention the migration step.",
                  },
                ],
                weakAreas: [
                  {
                    area: "c2",
                    detail:
                      "The explanation did not cover the migration generation.",
                  },
                ],
              }),
            ),
          ]),
        ],
      }),
    )
    const result = await gradeChallenge({ challenge, attempt, client, db })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.grading.score).toBe(55)
      expect(result.data.grading.criterionResults).toHaveLength(2)
      const c2 = result.data.grading.criterionResults.find(
        (c) => c.criterionId === "c2",
      )
      expect(c2?.passed).toBe(false)
    }
  })
})

describe("gradeChallenge — empty submission (NFR Resilient)", () => {
  let db: CatalogDb
  let challenge: Challenge

  beforeEach(async () => {
    db = makeTestDb()
    ;({ challenge } = await seed(db))
  })

  it("grades an empty submission gracefully with a low score", async () => {
    const attempt = await createChallengeAttempt(
      challenge.id,
      emptySubmission(),
      db,
    )
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_grading",
            validGrading({
              score: 0,
              feedback:
                "The submission was empty — no explanation to grade against the criteria.",
              criterionResults: [
                {
                  criterionId: "c1",
                  passed: false,
                  detail: "No explanation given.",
                },
                {
                  criterionId: "c2",
                  passed: false,
                  detail: "No explanation given.",
                },
              ],
              weakAreas: [
                { area: "c1", detail: "Not addressed — empty explanation." },
                { area: "c2", detail: "Not addressed — empty explanation." },
              ],
            }),
          ),
        ]),
      ],
    })
    const result = await gradeChallenge({
      challenge,
      attempt,
      client: createLlmClient(transport),
      db,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.grading.score).toBe(0)
      expect(result.data.grading.criterionResults).toHaveLength(2)
      expect(
        result.data.grading.criterionResults.every((c) => c.passed === false),
      ).toBe(true)
    }
    // The prompt names every criterion AND signals the empty-submission case.
    const firstMsg = transport.calls[0]?.messages[0]
    const prompt =
      typeof firstMsg?.content === "string"
        ? firstMsg.content
        : JSON.stringify(firstMsg?.content)
    expect(prompt).toContain("(no explanation given)")
    expect(prompt).toContain("no explanation")
  })
})

describe("gradeChallenge — R8 integrity rejection (FR-6)", () => {
  let db: CatalogDb
  let challenge: Challenge

  beforeEach(async () => {
    db = makeTestDb()
    ;({ challenge } = await seed(db))
  })

  it("throws ChallengeGradingIntegrityError and persists nothing when feedback names an off-map file", async () => {
    // The grading's `feedback` paragraph cites `apps/web/lib/ghost.ts` — a
    // path the M6 key-file map does not name. Integrity must reject.
    const attempt = await createChallengeAttempt(
      challenge.id,
      passingSubmission(),
      db,
    )
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_grading",
              validGrading({
                feedback:
                  "Solid, but consider how apps/web/lib/ghost.ts would fit in.",
              }),
            ),
          ]),
        ],
      }),
    )
    await expect(
      gradeChallenge({ challenge, attempt, client, db }),
    ).rejects.toBeInstanceOf(ChallengeGradingIntegrityError)

    // Nothing persisted onto the attempt — grading stayed null.
    const stored = await getLatestChallengeAttempt(challenge.id, db)
    expect(stored?.grading).toBeNull()
  })

  it("accepts feedback that references only M6-named files", async () => {
    const attempt = await createChallengeAttempt(
      challenge.id,
      passingSubmission(),
      db,
    )
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_grading",
              validGrading({
                feedback:
                  "Solid explanation rooted in apps/web/app/page.tsx and packages/db/src/schema.ts.",
              }),
            ),
          ]),
        ],
      }),
    )
    const result = await gradeChallenge({ challenge, attempt, client, db })
    expect(result.ok).toBe(true)
  })
})

describe("gradeChallenge — multi-attempt sequence (US-6 / R5)", () => {
  let db: CatalogDb
  let challenge: Challenge

  beforeEach(async () => {
    db = makeTestDb()
    ;({ challenge } = await seed(db))
  })

  it("each attempt persists its own grading and the latest is the latest", async () => {
    // Three attempts, three different gradings.
    const firstAttempt = await createChallengeAttempt(
      challenge.id,
      emptySubmission(),
      db,
    )
    await gradeChallenge({
      challenge,
      attempt: firstAttempt,
      client: createLlmClient(
        createMockTransport({
          replies: [reply([toolUse("submit_grading", validGrading({ score: 10 }))])],
        }),
      ),
      db,
    })

    // Force a strictly later `submittedAt` so latest-outcome ordering is
    // deterministic even when the test machine ticks the clock in <1ms.
    await new Promise((r) => setTimeout(r, 5))
    const secondAttempt = await createChallengeAttempt(
      challenge.id,
      partialSubmission(),
      db,
    )
    await gradeChallenge({
      challenge,
      attempt: secondAttempt,
      client: createLlmClient(
        createMockTransport({
          replies: [reply([toolUse("submit_grading", validGrading({ score: 55 }))])],
        }),
      ),
      db,
    })

    await new Promise((r) => setTimeout(r, 5))
    const thirdAttempt = await createChallengeAttempt(
      challenge.id,
      passingSubmission(),
      db,
    )
    await gradeChallenge({
      challenge,
      attempt: thirdAttempt,
      client: createLlmClient(
        createMockTransport({
          replies: [reply([toolUse("submit_grading", validGrading({ score: 92 }))])],
        }),
      ),
      db,
    })

    // Every attempt carries its own grading — none was overwritten.
    const all = await listChallengeAttempts(challenge.id, db)
    expect(all).toHaveLength(3)
    const scoresById = new Map<number, number | undefined>(
      all.map((a: ChallengeAttempt) => [a.id, a.grading?.score]),
    )
    expect(scoresById.get(firstAttempt.id)).toBe(10)
    expect(scoresById.get(secondAttempt.id)).toBe(55)
    expect(scoresById.get(thirdAttempt.id)).toBe(92)

    // The latest attempt is the one whose grading is the current outcome (R5).
    const latest = await getLatestChallengeAttempt(challenge.id, db)
    expect(latest?.id).toBe(thirdAttempt.id)
    expect(latest?.grading?.score).toBe(92)
  })
})

describe("gradeChallenge — boundary failures", () => {
  let db: CatalogDb
  let challenge: Challenge
  let attempt: ChallengeAttempt

  beforeEach(async () => {
    db = makeTestDb()
    ;({ challenge } = await seed(db))
    attempt = await createChallengeAttempt(
      challenge.id,
      passingSubmission(),
      db,
    )
  })

  it("returns challenge_not_found when the challenge row is missing", async () => {
    const fakeChallenge: Challenge = { ...challenge, id: 9999 }
    const client = createLlmClient(createMockTransport())
    const result = await gradeChallenge({
      challenge: fakeChallenge,
      attempt,
      client,
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("challenge_not_found")
    }
  })

  it("returns project_map_not_found when the snapshot has no M6 map", async () => {
    // Insert a second snapshot with NO project map, then a challenge against it.
    const otherSnap = db
      .insert(schema.repoSnapshots)
      .values({ ...snapshot, repo: "no-map", commitSha: "cafebabe" })
      .returning()
      .get()
    const orphan = await createChallenge(
      otherSnap.id,
      "add-small-field",
      challengeContent,
      db,
    )
    const orphanAttempt = await createChallengeAttempt(
      orphan.id,
      passingSubmission(),
      db,
    )
    const client = createLlmClient(createMockTransport())
    const result = await gradeChallenge({
      challenge: orphan,
      attempt: orphanAttempt,
      client,
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("project_map_not_found")
    }
  })

  it("maps an LLM transport failure to a typed llm_error", async () => {
    const client = createLlmClient(
      createMockTransport({ throws: new Error("network down") }),
    )
    const result = await gradeChallenge({ challenge, attempt, client, db })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("llm_error")
      expect(result.error.cause).toBeDefined()
    }
  })

  it("fails with no_structured_output when the model only returns text", async () => {
    const client = createLlmClient(
      createMockTransport({ replies: [{ text: "Looks fine." }] }),
    )
    const result = await gradeChallenge({ challenge, attempt, client, db })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })

  it("fails with no_structured_output when the submitted grade has no score", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse("submit_grading", {
              weakAreas: [],
              criterionResults: [],
              feedback: "Looks ok.",
            }),
          ]),
        ],
      }),
    )
    const result = await gradeChallenge({ challenge, attempt, client, db })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })

  it("makes no live API calls — the mock transport serves the reply", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_grading", validGrading())])],
    })
    const result = await gradeChallenge({
      challenge,
      attempt,
      client: createLlmClient(transport),
      db,
    })
    expect(result.ok).toBe(true)
    expect(transport.calls).toHaveLength(1)
  })
})

describe("parseGradingContent", () => {
  it("parses a well-formed submission", () => {
    const parsed = parseGradingContent(validGrading())
    expect(parsed?.score).toBe(88)
    expect(parsed?.weakAreas).toHaveLength(1)
    expect(parsed?.criterionResults).toHaveLength(2)
    expect(parsed?.feedback).toContain("Solid explanation")
  })

  it("rejects a non-object input", () => {
    expect(parseGradingContent("nope")).toBeNull()
    expect(parseGradingContent(null)).toBeNull()
  })

  it("rejects a submission with no numeric score", () => {
    expect(
      parseGradingContent({
        weakAreas: [],
        criterionResults: [],
        feedback: "x",
      }),
    ).toBeNull()
    expect(
      parseGradingContent({
        score: "high",
        weakAreas: [],
        criterionResults: [],
        feedback: "x",
      }),
    ).toBeNull()
  })

  it("clamps an out-of-range score into 0-100", () => {
    expect(
      parseGradingContent({
        score: 150,
        weakAreas: [],
        criterionResults: [],
        feedback: "",
      })?.score,
    ).toBe(100)
    expect(
      parseGradingContent({
        score: -20,
        weakAreas: [],
        criterionResults: [],
        feedback: "",
      })?.score,
    ).toBe(0)
  })

  it("rounds a fractional score to an integer", () => {
    expect(
      parseGradingContent({
        score: 73.6,
        weakAreas: [],
        criterionResults: [],
        feedback: "",
      })?.score,
    ).toBe(74)
  })

  it("drops malformed weak-area entries but keeps the valid ones", () => {
    const parsed = parseGradingContent({
      score: 60,
      weakAreas: [
        { area: "good", detail: "A real gap." },
        { area: "missing-detail" }, // no detail — dropped
        "nope", // not an object — dropped
      ],
      criterionResults: [],
      feedback: "",
    })
    expect(parsed?.weakAreas).toEqual([
      { area: "good", detail: "A real gap." },
    ])
  })

  it("drops malformed criterion-result entries but keeps the valid ones", () => {
    const parsed = parseGradingContent({
      score: 70,
      weakAreas: [],
      criterionResults: [
        { criterionId: "c1", passed: true, detail: "Good." },
        { criterionId: "c2", passed: "yes", detail: "x" }, // passed not bool
        { criterionId: "c3", passed: false }, // missing detail
        "nope", // not an object
      ],
      feedback: "",
    })
    expect(parsed?.criterionResults).toEqual([
      { criterionId: "c1", passed: true, detail: "Good." },
    ])
  })

  it("defaults missing list fields to empty arrays and empty feedback", () => {
    const parsed = parseGradingContent({ score: 90 })
    expect(parsed?.weakAreas).toEqual([])
    expect(parsed?.criterionResults).toEqual([])
    expect(parsed?.feedback).toBe("")
  })
})
