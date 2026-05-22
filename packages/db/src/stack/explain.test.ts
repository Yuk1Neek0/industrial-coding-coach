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
import {
  type NewRepoFile,
  type NewRepoSnapshot,
  type RepoTreeEntry,
  repoFiles,
  repoSnapshots,
} from "../schema"
import * as schema from "../schema"
import { explainStack, parseExplanationContent } from "./explain"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
)

function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

const fileTree: RepoTreeEntry[] = [
  { path: "package.json", type: "blob", sha: "a", size: 120 },
  { path: "next.config.mjs", type: "blob", sha: "b", size: 40 },
]

const snapshot: NewRepoSnapshot = {
  owner: "acme",
  repo: "portfolio",
  ref: "main",
  commitSha: "deadbeef",
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/portfolio",
  fileTree,
}

const packageJson = JSON.stringify({
  name: "portfolio",
  dependencies: { next: "16.0.0", react: "19.0.0" },
})

/** Seed the sample snapshot with two key files; return its id. */
function seed(db: CatalogDb): number {
  const id = db.insert(repoSnapshots).values(snapshot).returning().get().id
  const files: NewRepoFile[] = [
    {
      snapshotId: id,
      path: "package.json",
      sha: "a",
      size: 120,
      content: packageJson,
      category: "package-manifest",
    },
    {
      snapshotId: id,
      path: "next.config.mjs",
      sha: "b",
      size: 40,
      content: "export default {}",
      category: "build-config",
    },
  ]
  db.insert(repoFiles).values(files).run()
  return id
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

/** A well-formed `submit_stack_explanation` input. */
function validExplanation(overrides?: {
  keyFilePath?: string
}): Record<string, unknown> {
  return {
    tools: [
      {
        name: "Next.js",
        purpose: "Serves the app routes in apps/web.",
        alternatives: [
          { name: "Remix", tradeOff: "Different data-loading model." },
        ],
        jobRelevance: "Next.js is widely required for React roles.",
      },
    ],
    keyFiles: [
      {
        path: overrides?.keyFilePath ?? "package.json",
        reason: "Declares the dependency stack.",
      },
    ],
    debugEntryPoints: [
      { location: "next.config.mjs", guidance: "Check build config here." },
    ],
  }
}

/** A `tool_use` reply for the mock transport. */
function reply(content: Anthropic.ContentBlock[]): MockReply {
  return { content, stopReason: "tool_use" }
}

describe("explainStack", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
    seed(db)
  })

  it("produces a structured explanation after the model reads a file", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([toolUse("read_snapshot_file", { path: "package.json" })]),
          reply([toolUse("submit_stack_explanation", validExplanation())]),
        ],
      }),
    )
    const result = await explainStack({
      owner: "acme",
      repo: "portfolio",
      ref: "main",
      client,
      db,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.content.tools[0]?.name).toBe("Next.js")
      expect(result.data.content.keyFiles).toHaveLength(1)
      expect(result.data.detected.tools.map((t) => t.name)).toContain(
        "Next.js",
      )
    }
  })

  it("accepts an immediate submission with no file reads", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([toolUse("submit_stack_explanation", validExplanation())]),
        ],
      }),
    )
    const result = await explainStack({
      owner: "acme",
      repo: "portfolio",
      client,
      db,
    })
    expect(result.ok).toBe(true)
  })

  it("runs the file-reference integrity check on the result", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_stack_explanation",
              validExplanation({ keyFilePath: "package.json" }),
            ),
          ]),
        ],
      }),
    )
    const result = await explainStack({
      owner: "acme",
      repo: "portfolio",
      client,
      db,
    })
    expect(result.ok && result.data.fileReferences.ok).toBe(true)
  })

  it("flags an explanation that cites a file missing from the snapshot", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_stack_explanation",
              validExplanation({ keyFilePath: "src/ghost.ts" }),
            ),
          ]),
        ],
      }),
    )
    const result = await explainStack({
      owner: "acme",
      repo: "portfolio",
      client,
      db,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.fileReferences.ok).toBe(false)
      expect(result.data.fileReferences.missingKeyFiles).toEqual([
        "src/ghost.ts",
      ])
    }
  })

  it("returns snapshot_not_found when the repo is not imported", async () => {
    const client = createLlmClient(createMockTransport())
    const result = await explainStack({
      owner: "nobody",
      repo: "nothing",
      client,
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("snapshot_not_found")
    }
  })

  it("maps an LLM transport failure to a typed llm_error", async () => {
    const client = createLlmClient(
      createMockTransport({ throws: new Error("network down") }),
    )
    const result = await explainStack({
      owner: "acme",
      repo: "portfolio",
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
    const client = createLlmClient(
      createMockTransport({ replies: [{ text: "Here is some prose." }] }),
    )
    const result = await explainStack({
      owner: "acme",
      repo: "portfolio",
      client,
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })

  it("fails with no_structured_output when the submission has no tools", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse("submit_stack_explanation", {
              tools: [],
              keyFiles: [],
              debugEntryPoints: [],
            }),
          ]),
        ],
      }),
    )
    const result = await explainStack({
      owner: "acme",
      repo: "portfolio",
      client,
      db,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })

  it("makes no live API calls — the mock transport serves every reply", async () => {
    const transport = createMockTransport({
      replies: [
        reply([toolUse("submit_stack_explanation", validExplanation())]),
      ],
    })
    await explainStack({
      owner: "acme",
      repo: "portfolio",
      client: createLlmClient(transport),
      db,
    })
    // One bounded call; the explanation tools were offered to the model.
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0]?.tools?.map((t) => t.name)).toEqual([
      "read_snapshot_file",
      "submit_stack_explanation",
    ])
  })
})

describe("parseExplanationContent", () => {
  it("parses a well-formed submission", () => {
    const parsed = parseExplanationContent(validExplanation())
    expect(parsed?.tools).toHaveLength(1)
    expect(parsed?.tools[0]?.alternatives[0]?.name).toBe("Remix")
  })

  it("rejects a non-object input", () => {
    expect(parseExplanationContent("nope")).toBeNull()
    expect(parseExplanationContent(null)).toBeNull()
  })

  it("rejects a submission with no usable tools", () => {
    expect(
      parseExplanationContent({ tools: [], keyFiles: [], debugEntryPoints: [] }),
    ).toBeNull()
  })

  it("drops malformed tool entries but keeps the valid ones", () => {
    const parsed = parseExplanationContent({
      tools: [
        { name: "Next.js" }, // missing purpose/jobRelevance — dropped
        {
          name: "React",
          purpose: "Renders UI.",
          jobRelevance: "Core React skill.",
          alternatives: [],
        },
      ],
      keyFiles: [],
      debugEntryPoints: [],
    })
    expect(parsed?.tools.map((t) => t.name)).toEqual(["React"])
  })

  it("defaults missing list fields to empty arrays", () => {
    const parsed = parseExplanationContent({
      tools: [
        {
          name: "React",
          purpose: "Renders UI.",
          jobRelevance: "Core skill.",
        },
      ],
    })
    expect(parsed?.keyFiles).toEqual([])
    expect(parsed?.debugEntryPoints).toEqual([])
    expect(parsed?.tools[0]?.alternatives).toEqual([])
  })
})
