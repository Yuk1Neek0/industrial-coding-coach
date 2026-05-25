// Tests for the M9 bounded generation SDK call (Issue #142).
//
// Every test wires a fresh in-memory SQLite (so #140's DAL + #141's
// integrity check + this module compose end-to-end) and the
// `@workspace/ai/testing` mock transport (so CI never makes a live API or
// GitHub call). Mirrors the M8 review-call test posture
// (`../diff/review.test.ts`) plus the DAL-round-trip posture
// (`./challenges.test.ts`).
//
// Coverage targets (verbatim from 142.md acceptance criteria):
//   - successful generation per applicable type;
//   - cached-hit path that does not call the SDK (R2);
//   - "new challenge" force-regenerate path (R2);
//   - broken-CI gating with and without a real failing CI run (R6);
//   - integrity-check rejection — throws and persists nothing (R8 / FR-6);
//   - in/out-of-scope strictly limited to M6 map-named files (R8 / FR-3);
//   - no live API or GitHub calls (mock transport's call list audited).

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
  ChallengeType,
  NewRepoFile,
  NewRepoSnapshot,
  ProjectMapFile,
} from "../schema"
import * as schema from "../schema"
import { getChallengeBySnapshotAndType } from "./challenges"
import {
  applicableChallengeTypes,
  ChallengeIntegrityError,
  generateChallenge,
  parseChallengeContent,
  type FailingCiRun,
} from "./generation"

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
    { path: "README.md", type: "blob", sha: "d", size: 50 },
  ],
}

const keyFileMap: ProjectMapFile[] = [
  { path: "apps/web/app/page.tsx", role: "Landing page." },
  { path: "apps/web/lib/auth.ts", role: "Session helper." },
  { path: "packages/db/src/schema.ts", role: "Database schema." },
]

/** Insert the snapshot + its M6 project map + content for two key files. */
async function seed(db: CatalogDb): Promise<number> {
  const inserted = db
    .insert(schema.repoSnapshots)
    .values(snapshot)
    .returning()
    .get()
  const snapshotId = inserted.id
  const files: NewRepoFile[] = [
    {
      snapshotId,
      path: "apps/web/app/page.tsx",
      sha: "a",
      size: 200,
      content: "export default function Page() { return <div /> }",
      category: "source",
    },
    {
      snapshotId,
      path: "apps/web/lib/auth.ts",
      sha: "b",
      size: 80,
      content: "export function session() { return readToken() }",
      category: "source",
    },
    // Deliberately omit content for packages/db/src/schema.ts so a read of
    // that path surfaces an is_error tool_result (the M6 map names it but
    // the snapshot did not capture it).
  ]
  db.insert(schema.repoFiles).values(files).run()
  await createProjectMap(
    snapshotId,
    {
      architectureOverview: [
        { title: "Frontend", detail: "A single Next.js app." },
        { title: "Data", detail: "SQLite via Drizzle." },
      ],
      keyFileMap,
      requestDataFlow: [
        {
          order: 1,
          description: "User opens the page.",
          path: "apps/web/app/page.tsx",
        },
      ],
      stateFlow: [
        {
          order: 1,
          description: "Session resolves.",
          path: "apps/web/lib/auth.ts",
        },
      ],
      aiCallFlow: [],
      mermaidDiagram: "graph TD; A-->B",
      debugPath: [
        { location: "apps/web/app/page.tsx", guidance: "Inspect the page." },
      ],
    },
    db,
  )
  return snapshotId
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

/** A well-formed `submit_challenge` input grounded entirely in the M6 map. */
function validChallenge(overrides?: {
  inScopeFiles?: string[]
  outOfScopeFiles?: string[]
  sourceRefPath?: string
  taskDescription?: string
}): Record<string, unknown> {
  return {
    taskDescription:
      overrides?.taskDescription ??
      "Add a `displayName` field so the landing page can render it.",
    inScopeFiles: overrides?.inScopeFiles ?? [
      "packages/db/src/schema.ts",
      "apps/web/app/page.tsx",
    ],
    outOfScopeFiles: overrides?.outOfScopeFiles ?? ["apps/web/lib/auth.ts"],
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
        path: overrides?.sourceRefPath ?? "packages/db/src/schema.ts",
        note: "The schema file is where new columns live.",
      },
    ],
  }
}

describe("generateChallenge — successful generation", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = await seed(db)
  })

  it("produces and persists a challenge after the model reads a file", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse("read_snapshot_file", { path: "apps/web/app/page.tsx" }),
          ]),
          reply([toolUse("submit_challenge", validChallenge())]),
        ],
      }),
    )
    const result = await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
      client,
      db,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.cached).toBe(false)
      expect(result.data.challenge.type).toBe("add-small-field")
      expect(result.data.challenge.snapshotId).toBe(snapshotId)
      expect(result.data.challenge.inScopeFiles).toEqual([
        "packages/db/src/schema.ts",
        "apps/web/app/page.tsx",
      ])
      expect(result.data.challenge.acceptanceCriteria).toHaveLength(2)
    }
    // Persistence: the row is in the DB after the call.
    const cached = await getChallengeBySnapshotAndType(
      snapshotId,
      "add-small-field",
      db,
    )
    expect(cached?.taskDescription).toContain("displayName")
  })

  it("accepts an immediate submission with no file reads", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [reply([toolUse("submit_challenge", validChallenge())])],
      }),
    )
    const result = await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
      client,
      db,
    })
    expect(result.ok).toBe(true)
  })

  it("generates one challenge per applicable type in sequence", async () => {
    // Two types in sequence: each call gets a fresh mock transport so we
    // can assert that each call invoked the SDK exactly once and produced
    // its own row.
    const types: ChallengeType[] = ["add-small-field", "add-unit-test"]
    for (const type of types) {
      const transport = createMockTransport({
        replies: [reply([toolUse("submit_challenge", validChallenge())])],
      })
      const result = await generateChallenge({
        owner: "acme",
        repo: "portfolio",
        type,
        client: createLlmClient(transport),
        db,
      })
      expect(result.ok).toBe(true)
      expect(transport.calls).toHaveLength(1)
    }
    expect(
      (await getChallengeBySnapshotAndType(snapshotId, "add-small-field", db))
        ?.type,
    ).toBe("add-small-field")
    expect(
      (await getChallengeBySnapshotAndType(snapshotId, "add-unit-test", db))
        ?.type,
    ).toBe("add-unit-test")
  })
})

describe("generateChallenge — R2 cache and force-regenerate", () => {
  let db: CatalogDb

  beforeEach(async () => {
    db = makeTestDb()
    await seed(db)
  })

  it("returns the cached row on a second open and does NOT call the SDK", async () => {
    const firstTransport = createMockTransport({
      replies: [reply([toolUse("submit_challenge", validChallenge())])],
    })
    const first = await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
      client: createLlmClient(firstTransport),
      db,
    })
    expect(first.ok && first.data.cached).toBe(false)
    expect(firstTransport.calls).toHaveLength(1)

    // Second open — a new transport that, if invoked, would record a call.
    const secondTransport = createMockTransport({
      replies: [reply([toolUse("submit_challenge", validChallenge())])],
    })
    const second = await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
      client: createLlmClient(secondTransport),
      db,
    })
    expect(second.ok && second.data.cached).toBe(true)
    expect(secondTransport.calls).toHaveLength(0)
    if (first.ok && second.ok) {
      expect(second.data.challenge.id).toBe(first.data.challenge.id)
    }
  })

  it("forceRegenerate re-invokes the SDK and overwrites the cached row", async () => {
    // Seed the cache.
    await generateChallenge(
      {
        owner: "acme",
        repo: "portfolio",
        type: "add-small-field",
        client: createLlmClient(
          createMockTransport({
            replies: [reply([toolUse("submit_challenge", validChallenge())])],
          }),
        ),
        db,
      },
    )

    // New challenge action: same type, different task description.
    const newTransport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_challenge",
            validChallenge({
              taskDescription:
                "A different displayName challenge for the same type.",
            }),
          ),
        ]),
      ],
    })
    const result = await generateChallenge(
      {
        owner: "acme",
        repo: "portfolio",
        type: "add-small-field",
        client: createLlmClient(newTransport),
        db,
      },
      { forceRegenerate: true },
    )
    expect(result.ok).toBe(true)
    expect(newTransport.calls).toHaveLength(1)
    if (result.ok) {
      expect(result.data.cached).toBe(false)
      expect(result.data.challenge.taskDescription).toContain("different")
    }
  })
})

describe("generateChallenge — R6 broken-CI gating", () => {
  let db: CatalogDb

  beforeEach(async () => {
    db = makeTestDb()
    await seed(db)
  })

  it("omits broken-CI when no failing CI run is provided", async () => {
    // No failingCiRun supplied → type_not_applicable.
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_challenge", validChallenge())])],
    })
    const result = await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "explain-broken-ci-result",
      client: createLlmClient(transport),
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("type_not_applicable")
    }
    // No SDK call was made — gating happens before the SDK.
    expect(transport.calls).toHaveLength(0)
  })

  it("emits broken-CI when a real failing CI run is provided", async () => {
    const failingCiRun: FailingCiRun = {
      workflowName: "CI / typecheck",
      conclusion: "failure",
      logExcerpt: "TS2345: Argument of type 'string' not assignable to 'number'",
    }
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_challenge",
            validChallenge({
              taskDescription:
                "Explain why CI / typecheck is failing on this PR.",
              sourceRefPath: "apps/web/app/page.tsx",
            }),
          ),
        ]),
      ],
    })
    const result = await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "explain-broken-ci-result",
      failingCiRun,
      client: createLlmClient(transport),
      db,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.challenge.type).toBe("explain-broken-ci-result")
      expect(result.data.challenge.taskDescription).toContain("CI")
    }
    // The prompt included the failing run's grounding.
    const firstCall = transport.calls[0]
    const firstMsg = firstCall?.messages[0]
    const userPrompt =
      typeof firstMsg?.content === "string"
        ? firstMsg.content
        : JSON.stringify(firstMsg?.content)
    expect(userPrompt).toContain("CI / typecheck")
    expect(userPrompt).toContain("TS2345")
  })

  it("applicableChallengeTypes reflects R6 gating", () => {
    const types = applicableChallengeTypes({ keyFileMap })
    expect(types).not.toContain("explain-broken-ci-result")
    expect(types).toContain("add-small-field")

    const gated = applicableChallengeTypes(
      { keyFileMap },
      { workflowName: "CI" },
    )
    expect(gated).toContain("explain-broken-ci-result")
  })

  it("applicableChallengeTypes returns an empty list when the M6 map names no files", () => {
    expect(applicableChallengeTypes({ keyFileMap: [] })).toEqual([])
  })
})

describe("generateChallenge — R8 integrity rejection", () => {
  let db: CatalogDb

  beforeEach(async () => {
    db = makeTestDb()
    await seed(db)
  })

  it("throws ChallengeIntegrityError and does not persist when a path is off-map", async () => {
    // The submission cites `apps/web/lib/ghost.ts` — a path the M6 key-file
    // map does not name. Integrity must reject and persist nothing.
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_challenge",
              validChallenge({
                inScopeFiles: [
                  "apps/web/app/page.tsx",
                  "apps/web/lib/ghost.ts",
                ],
              }),
            ),
          ]),
        ],
      }),
    )
    await expect(
      generateChallenge({
        owner: "acme",
        repo: "portfolio",
        type: "add-small-field",
        client,
        db,
      }),
    ).rejects.toBeInstanceOf(ChallengeIntegrityError)

    // Nothing persisted.
    const row = await getChallengeBySnapshotAndType(
      1,
      "add-small-field",
      db,
    )
    expect(row).toBeNull()
  })

  it("rejects an adjacent-but-unmapped file (R8 — no inference)", async () => {
    // `apps/web/app/page.test.tsx` is a plausible neighbor of an M6-mapped
    // file but is not in the M6 map. R8 forbids the inference.
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_challenge",
              validChallenge({
                inScopeFiles: ["apps/web/app/page.test.tsx"],
              }),
            ),
          ]),
        ],
      }),
    )
    await expect(
      generateChallenge({
        owner: "acme",
        repo: "portfolio",
        type: "add-unit-test",
        client,
        db,
      }),
    ).rejects.toBeInstanceOf(ChallengeIntegrityError)
  })

  it("rejects an out-of-scope path that is off-map (R8 covers both sets)", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_challenge",
              validChallenge({
                outOfScopeFiles: ["apps/web/app/legacy.tsx"],
              }),
            ),
          ]),
        ],
      }),
    )
    await expect(
      generateChallenge({
        owner: "acme",
        repo: "portfolio",
        type: "add-small-field",
        client,
        db,
      }),
    ).rejects.toBeInstanceOf(ChallengeIntegrityError)
  })

  it("rejects a source-reference path that is off-map", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_challenge",
              validChallenge({
                sourceRefPath: "apps/web/ghost.ts",
              }),
            ),
          ]),
        ],
      }),
    )
    await expect(
      generateChallenge({
        owner: "acme",
        repo: "portfolio",
        type: "add-small-field",
        client,
        db,
      }),
    ).rejects.toBeInstanceOf(ChallengeIntegrityError)
  })
})

describe("generateChallenge — boundary failures", () => {
  let db: CatalogDb

  beforeEach(async () => {
    db = makeTestDb()
  })

  it("returns snapshot_not_found when the repository is not imported", async () => {
    const client = createLlmClient(createMockTransport())
    const result = await generateChallenge({
      owner: "ghost",
      repo: "missing",
      type: "add-small-field",
      client,
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("snapshot_not_found")
    }
  })

  it("returns project_map_not_found when the snapshot has no M6 map", async () => {
    // Seed only the snapshot — no project map.
    db.insert(schema.repoSnapshots).values(snapshot).returning().get()
    const client = createLlmClient(createMockTransport())
    const result = await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
      client,
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("project_map_not_found")
    }
  })

  it("maps an LLM transport failure to a typed llm_error", async () => {
    await seed(db)
    const client = createLlmClient(
      createMockTransport({ throws: new Error("network down") }),
    )
    const result = await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
      client,
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("llm_error")
      expect(result.error.cause).toBeDefined()
    }
  })

  it("fails with no_structured_output when the model only returns text", async () => {
    await seed(db)
    const client = createLlmClient(
      createMockTransport({ replies: [{ text: "Here is some prose." }] }),
    )
    const result = await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
      client,
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })

  it("fails with no_structured_output when the submission is empty", async () => {
    await seed(db)
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse("submit_challenge", {
              taskDescription: "A vague task.",
              inScopeFiles: [],
              outOfScopeFiles: [],
              acceptanceCriteria: [],
              sourceReferences: [],
            }),
          ]),
        ],
      }),
    )
    const result = await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
      client,
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })

  it("forces the submission tool on the final turn", async () => {
    await seed(db)
    // The model keeps reading files; the call must still terminate.
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("read_snapshot_file", { path: "apps/web/app/page.tsx" }),
        ]),
      ],
    })
    const result = await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
      client: createLlmClient(transport),
      db,
    })
    expect(result.ok).toBe(false)
    const lastCall = transport.calls.at(-1)
    expect(lastCall?.tool_choice).toEqual({
      type: "tool",
      name: "submit_challenge",
    })
  })
})

describe("generateChallenge — tool behavior", () => {
  let db: CatalogDb

  beforeEach(async () => {
    db = makeTestDb()
    await seed(db)
  })

  it("serves a read_snapshot_file request from the snapshot's repo_files", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("read_snapshot_file", { path: "apps/web/app/page.tsx" }),
        ]),
        reply([toolUse("submit_challenge", validChallenge())]),
      ],
    })
    await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
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
    expect(block).toMatchObject({ type: "tool_result" })
    expect(JSON.stringify(block)).toContain("export default function Page()")
  })

  it("rejects a read of an off-map path with is_error (R8)", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          // README.md exists in the snapshot but is not in the M6 key-file map.
          toolUse("read_snapshot_file", { path: "README.md" }),
        ]),
        reply([toolUse("submit_challenge", validChallenge())]),
      ],
    })
    await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
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
    expect(block).toMatchObject({ type: "tool_result", is_error: true })
    expect(JSON.stringify(block)).toContain("not in the M6 project map")
  })

  it("returns an is_error tool_result when M6 names a file the snapshot did not capture", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          // schema.ts is in the M6 map but no repo_files row holds its content.
          toolUse("read_snapshot_file", {
            path: "packages/db/src/schema.ts",
          }),
        ]),
        reply([toolUse("submit_challenge", validChallenge())]),
      ],
    })
    await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
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
    expect(block).toMatchObject({ type: "tool_result", is_error: true })
    expect(JSON.stringify(block)).toContain("snapshot did not capture")
  })

  it("makes no live API calls — the mock transport serves every reply", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_challenge", validChallenge())])],
    })
    await generateChallenge({
      owner: "acme",
      repo: "portfolio",
      type: "add-small-field",
      client: createLlmClient(transport),
      db,
    })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0]?.tools?.map((t) => t.name)).toEqual([
      "read_snapshot_file",
      "submit_challenge",
    ])
  })
})

describe("parseChallengeContent", () => {
  it("parses a well-formed submission", () => {
    const parsed = parseChallengeContent(validChallenge())
    expect(parsed?.taskDescription).toContain("displayName")
    expect(parsed?.inScopeFiles).toEqual([
      "packages/db/src/schema.ts",
      "apps/web/app/page.tsx",
    ])
    expect(parsed?.acceptanceCriteria).toHaveLength(2)
    expect(parsed?.sourceReferences).toHaveLength(1)
  })

  it("rejects a non-object input", () => {
    expect(parseChallengeContent("nope")).toBeNull()
    expect(parseChallengeContent(null)).toBeNull()
  })

  it("rejects a submission with no task description", () => {
    expect(
      parseChallengeContent({ ...validChallenge(), taskDescription: "" }),
    ).toBeNull()
  })

  it("rejects a submission with no in-scope files and no criteria", () => {
    expect(
      parseChallengeContent({
        taskDescription: "A vague task.",
        inScopeFiles: [],
        outOfScopeFiles: [],
        acceptanceCriteria: [],
        sourceReferences: [],
      }),
    ).toBeNull()
  })

  it("drops malformed acceptance criteria but keeps valid ones", () => {
    const parsed = parseChallengeContent({
      ...validChallenge(),
      acceptanceCriteria: [
        { id: "c1" }, // missing detail — dropped
        { detail: "Valid criterion." }, // missing id — generated
        { id: "c1", detail: "Duplicate id." }, // dup id — re-keyed
      ],
    })
    expect(parsed?.acceptanceCriteria).toHaveLength(2)
    const ids = parsed?.acceptanceCriteria.map((c) => c.id) ?? []
    expect(new Set(ids).size).toBe(2)
  })

  it("drops a source reference with an invalid section", () => {
    const parsed = parseChallengeContent({
      ...validChallenge(),
      sourceReferences: [
        {
          section: "notARealSection",
          path: "apps/web/app/page.tsx",
          note: "n",
        },
        {
          section: "keyFileMap",
          path: "apps/web/app/page.tsx",
          note: "valid",
        },
      ],
    })
    expect(parsed?.sourceReferences).toHaveLength(1)
    expect(parsed?.sourceReferences[0]?.section).toBe("keyFileMap")
  })

  it("defaults missing list fields to empty arrays", () => {
    const parsed = parseChallengeContent({
      taskDescription: "Add a field.",
      inScopeFiles: ["apps/web/app/page.tsx"],
    })
    expect(parsed?.outOfScopeFiles).toEqual([])
    expect(parsed?.acceptanceCriteria).toEqual([])
    expect(parsed?.sourceReferences).toEqual([])
  })
})
