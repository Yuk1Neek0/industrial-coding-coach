// Tests for the M7 bounded learning-unit generation call (Issue #133).
//
// Exercised with mocked Anthropic SDK responses via `@workspace/ai/testing`.
// No live API calls; no live GitHub calls; no database — the integrity check
// runs against a synthetic snapshot file tree (the M11 DAL shape) and an
// optional fabricated project map (the M6 DAL shape). Mirrors
// `../diff/review.test.ts`.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient } from "@workspace/ai"
import { createMockTransport, type MockReply } from "@workspace/ai/testing"
import { describe, expect, it } from "vitest"

import type { LearningUnitInput } from "../github/issues"
import type { ProjectMap, RepoTreeEntry } from "../schema"
import {
  GenerateLearningUnitError,
  IntegrityError,
  generateLearningUnit,
  parseUnitContent,
} from "./generate"

// --- Fixtures --------------------------------------------------------------

const fileTree: RepoTreeEntry[] = [
  {
    path: "apps/web/app/api/health/route.ts",
    type: "blob",
    sha: "a",
    size: 200,
  },
  { path: "apps/web/app/page.tsx", type: "blob", sha: "b", size: 200 },
  { path: "packages/db/src/schema.ts", type: "blob", sha: "c", size: 300 },
  { path: "apps/web", type: "tree", sha: "d" },
]

const projectMap: ProjectMap = {
  id: 1,
  snapshotId: 1,
  architectureOverview: [
    {
      title: "Frontend",
      detail: "Next.js App Router with route handlers under app/api/.",
    },
  ],
  keyFileMap: [
    {
      path: "apps/web/app/api/health/route.ts",
      role: "Health route handlers entry point.",
    },
  ],
  requestDataFlow: [],
  stateFlow: [],
  aiCallFlow: [],
  mermaidDiagram: "graph TD; A-->B;",
  debugPath: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

function input(overrides?: Partial<LearningUnitInput>): LearningUnitInput {
  return {
    source: "github-issue",
    issueRef: "#42",
    title: "Add a /health endpoint",
    body:
      "Add a route handler at apps/web/app/api/health/route.ts that returns " +
      "200 OK with a small JSON body.",
    labels: ["good-first-issue"],
    state: "open",
    linkedPrs: [],
    ...overrides,
  }
}

/** A read function that serves health route.ts content; everything else null. */
async function readHealthOnly(path: string): Promise<string | null> {
  if (path === "apps/web/app/api/health/route.ts") {
    return (
      "export async function GET() {\n" +
      "  return Response.json({ status: 'ok' })\n" +
      "}\n"
    )
  }
  return null
}

/** A `tool_use` content block. */
function toolUse(
  name: string,
  inputBlock: Record<string, unknown>,
): Anthropic.ContentBlock {
  return { type: "tool_use", id: `tu_${name}`, name, input: inputBlock } as
    unknown as Anthropic.ContentBlock
}

/** A `tool_use` reply for the mock transport. */
function reply(content: Anthropic.ContentBlock[]): MockReply {
  return { content, stopReason: "tool_use" }
}

/** A well-formed `submit_learning_unit` input grounded in the fixture tree. */
function validUnit(overrides?: {
  relatedFilePath?: string
}): Record<string, unknown> {
  return {
    restatedGoal:
      "Add a /health endpoint at apps/web/app/api/health/route.ts " +
      "returning 200 OK with a small JSON body.",
    relatedFiles: [
      {
        path: overrides?.relatedFilePath ?? "apps/web/app/api/health/route.ts",
        reason:
          "The new route handlers file the issue introduces — the route " +
          "this unit teaches.",
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
      {
        id: "c1",
        description:
          "apps/web/app/api/health/route.ts returns 200 OK with a JSON body.",
      },
      {
        id: "c2",
        description: "The route handlers cover the GET method.",
      },
    ],
    questions: [
      { id: "q1", prompt: "How does Next.js know this file is a route?" },
      { id: "q2", prompt: "What does Response.json do here?" },
    ],
    challengeConcept: "fault-injection",
    challengeType: "expand",
  }
}

// --- generateLearningUnit --------------------------------------------------

describe("generateLearningUnit", () => {
  it("produces a typed seven-part unit after the model reads a snapshot file", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse("read_snapshot_file", {
              path: "apps/web/app/api/health/route.ts",
            }),
          ]),
          reply([toolUse("submit_learning_unit", validUnit())]),
        ],
      }),
    )
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const c = result.data.content
      expect(c.restatedGoal).toContain("/health")
      expect(c.relatedFiles).toHaveLength(1)
      expect(c.concepts).toHaveLength(1)
      expect(c.agentExecutionNotes).toHaveLength(2)
      expect(c.reviewChecklist).toHaveLength(2)
      expect(c.questions).toHaveLength(2)
      expect(c.challengeConcept).toBe("fault-injection")
      expect(c.challengeType).toBe("expand")
      expect(result.data.integrity.ok).toBe(true)
    }
  })

  it("accepts an immediate submission with no tool reads", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [reply([toolUse("submit_learning_unit", validUnit())])],
      }),
    )
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client,
    })
    expect(result.ok).toBe(true)
  })

  it("rejects a unit whose related-file path is not in the snapshot (FR-4)", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_learning_unit",
              validUnit({ relatedFilePath: "apps/web/app/api/ghost/route.ts" }),
            ),
          ]),
        ],
      }),
    )
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(IntegrityError)
      expect(result.error.kind).toBe("integrity_failed")
      const err = result.error as IntegrityError
      expect(
        err.unresolved.some(
          (u) =>
            u.kind === "related-file" &&
            u.value === "apps/web/app/api/ghost/route.ts",
        ),
      ).toBe(true)
      // The content is preserved on the error for diagnostics — not silently
      // dropped or rendered.
      expect(err.content.relatedFiles[0]?.path).toBe(
        "apps/web/app/api/ghost/route.ts",
      )
    }
  })

  it("serves a read_snapshot_file request from the snapshot DAL", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("read_snapshot_file", {
            path: "apps/web/app/api/health/route.ts",
          }),
        ]),
        reply([toolUse("submit_learning_unit", validUnit())]),
      ],
    })
    await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: createLlmClient(transport),
    })
    const secondCall = transport.calls[1]
    const userMsg = secondCall?.messages
      .filter((m) => m.role === "user")
      .at(-1)
    const block = Array.isArray(userMsg?.content)
      ? userMsg.content[0]
      : undefined
    expect(block).toMatchObject({ type: "tool_result" })
    expect(JSON.stringify(block)).toContain("Response.json")
  })

  it("returns an error to the model when read_snapshot_file misses the tree", async () => {
    const transport = createMockTransport({
      replies: [
        reply([toolUse("read_snapshot_file", { path: "no/such/file.ts" })]),
        reply([toolUse("submit_learning_unit", validUnit())]),
      ],
    })
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(true)
    const userMsg = transport.calls[1]?.messages
      .filter((m) => m.role === "user")
      .at(-1)
    const block = Array.isArray(userMsg?.content)
      ? userMsg.content[0]
      : undefined
    expect(block).toMatchObject({ type: "tool_result", is_error: true })
  })

  it("returns 'content not snapshotted' for a path in the tree without stored content", async () => {
    const transport = createMockTransport({
      replies: [
        // schema.ts IS in the fixture tree, but readHealthOnly returns null.
        reply([
          toolUse("read_snapshot_file", { path: "packages/db/src/schema.ts" }),
        ]),
        reply([toolUse("submit_learning_unit", validUnit())]),
      ],
    })
    await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: createLlmClient(transport),
    })
    const userMsg = transport.calls[1]?.messages
      .filter((m) => m.role === "user")
      .at(-1)
    const block = Array.isArray(userMsg?.content)
      ? userMsg.content[0]
      : undefined
    expect(block).toMatchObject({ type: "tool_result" })
    expect(JSON.stringify(block)).toContain("content not snapshotted")
  })

  it("serves a read_project_map_node request from the M6 map", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("read_project_map_node", {
            nodeRef: "apps/web/app/api/health/route.ts",
          }),
        ]),
        reply([toolUse("submit_learning_unit", validUnit())]),
      ],
    })
    await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: createLlmClient(transport),
    })
    const userMsg = transport.calls[1]?.messages
      .filter((m) => m.role === "user")
      .at(-1)
    const block = Array.isArray(userMsg?.content)
      ? userMsg.content[0]
      : undefined
    expect(JSON.stringify(block)).toContain("Health route handlers entry point")
  })

  it("matches an architecture-section node by title", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("read_project_map_node", { nodeRef: "Frontend" }),
        ]),
        reply([toolUse("submit_learning_unit", validUnit())]),
      ],
    })
    await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: createLlmClient(transport),
    })
    const userMsg = transport.calls[1]?.messages
      .filter((m) => m.role === "user")
      .at(-1)
    const block = Array.isArray(userMsg?.content)
      ? userMsg.content[0]
      : undefined
    expect(JSON.stringify(block)).toContain("Next.js App Router")
  })

  it("degrades gracefully when no M6 project map exists", async () => {
    // The model asks for a project-map node anyway; the tool returns the
    // "project map unavailable" sentinel rather than failing.
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("read_project_map_node", { nodeRef: "Frontend" }),
        ]),
        reply([toolUse("submit_learning_unit", validUnit())]),
      ],
    })
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      // projectMap intentionally omitted.
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(true)
    const userMsg = transport.calls[1]?.messages
      .filter((m) => m.role === "user")
      .at(-1)
    const block = Array.isArray(userMsg?.content)
      ? userMsg.content[0]
      : undefined
    expect(JSON.stringify(block)).toContain("project map unavailable")
    // The initial prompt should also have flagged the missing map.
    const firstUser = transport.calls[0]?.messages[0]
    expect(typeof firstUser?.content === "string" ? firstUser.content : "")
      .toContain("No M6 project map exists")
  })

  it("degrades gracefully on an empty issue body (NFR Resilient)", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_learning_unit", validUnit())])],
    })
    const result = await generateLearningUnit({
      input: input({ body: "" }),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(true)
    // The seed prompt should flag the empty body to the model so it can
    // annotate the restated goal.
    const firstUser = transport.calls[0]?.messages[0]
    const promptText =
      typeof firstUser?.content === "string" ? firstUser.content : ""
    expect(promptText).toContain("issue body is empty")
  })

  it("maps an LLM transport failure to a typed llm_error", async () => {
    const client = createLlmClient(
      createMockTransport({ throws: new Error("network down") }),
    )
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(GenerateLearningUnitError)
      expect(result.error.kind).toBe("llm_error")
      expect(result.error.cause).toBeDefined()
    }
  })

  it("fails with no_structured_output when the model only returns text", async () => {
    const client = createLlmClient(
      createMockTransport({ replies: [{ text: "Here is some prose." }] }),
    )
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("no_structured_output")
  })

  it("fails with no_structured_output when the submission is empty", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse("submit_learning_unit", {
              restatedGoal: "Goal.",
              relatedFiles: [],
              concepts: [],
              agentExecutionNotes: [],
              reviewChecklist: [],
              questions: [],
            }),
          ]),
        ],
      }),
    )
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("no_structured_output")
  })

  it("offers all three tools and makes one bounded call on a clean submission", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_learning_unit", validUnit())])],
    })
    await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: createLlmClient(transport),
    })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0]?.tools?.map((t) => t.name)).toEqual([
      "read_snapshot_file",
      "read_project_map_node",
      "submit_learning_unit",
    ])
  })

  it("forces the submission tool on the final turn", async () => {
    // The model keeps reading files; the call must still terminate at the cap.
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse("read_snapshot_file", {
            path: "apps/web/app/api/health/route.ts",
          }),
        ]),
      ],
    })
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(false)
    const lastCall = transport.calls.at(-1)
    expect(lastCall?.tool_choice).toEqual({
      type: "tool",
      name: "submit_learning_unit",
    })
  })

  it("never reaches the live Anthropic API — every reply comes from the mock", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_learning_unit", validUnit())])],
    })
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(true)
    // One bounded round-trip; the call exited as soon as the model submitted.
    expect(transport.calls).toHaveLength(1)
  })

  it("preserves the typed Question[] shape (input contract for #134's grading call)", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_learning_unit", validUnit())])],
    })
    const result = await generateLearningUnit({
      input: input(),
      snapshotFileTree: fileTree,
      readSnapshotFile: readHealthOnly,
      projectMap,
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      for (const q of result.data.content.questions) {
        expect(typeof q.id).toBe("string")
        expect(typeof q.prompt).toBe("string")
        expect(q.id.length).toBeGreaterThan(0)
        expect(q.prompt.length).toBeGreaterThan(0)
      }
    }
  })
})

// --- parseUnitContent ------------------------------------------------------

describe("parseUnitContent", () => {
  it("parses a well-formed submission", () => {
    const parsed = parseUnitContent(validUnit())
    expect(parsed?.relatedFiles).toHaveLength(1)
    expect(parsed?.questions[0]?.id).toBe("q1")
    expect(parsed?.challengeConcept).toBe("fault-injection")
    expect(parsed?.challengeType).toBe("expand")
  })

  it("rejects a non-object input", () => {
    expect(parseUnitContent("nope")).toBeNull()
    expect(parseUnitContent(null)).toBeNull()
  })

  it("rejects a submission with no restated goal", () => {
    expect(parseUnitContent({ ...validUnit(), restatedGoal: "" })).toBeNull()
  })

  it("rejects a submission with no related files and no questions", () => {
    expect(
      parseUnitContent({
        restatedGoal: "Goal.",
        relatedFiles: [],
        concepts: [],
        agentExecutionNotes: [],
        reviewChecklist: [],
        questions: [],
      }),
    ).toBeNull()
  })

  it("drops malformed list entries but keeps the valid ones", () => {
    const parsed = parseUnitContent({
      restatedGoal: "Goal.",
      relatedFiles: [
        { path: "a.ts" }, // missing reason — dropped
        { path: "b.ts", reason: "A real reason." },
      ],
      concepts: [{ name: "X" }], // missing explanation — dropped
      agentExecutionNotes: [
        { order: 1, description: "Step." },
        { order: 2 }, // missing description — dropped
      ],
      reviewChecklist: [{ id: "c1", description: "Check b.ts." }],
      questions: [{ id: "q1", prompt: "Why?" }],
    })
    expect(parsed?.relatedFiles.map((f) => f.path)).toEqual(["b.ts"])
    expect(parsed?.concepts).toEqual([])
    expect(parsed?.agentExecutionNotes).toHaveLength(1)
  })

  it("gives questions stable unique ids for the grading call", () => {
    const parsed = parseUnitContent({
      restatedGoal: "Goal.",
      relatedFiles: [{ path: "a.ts", reason: "A reason." }],
      concepts: [],
      agentExecutionNotes: [],
      reviewChecklist: [],
      questions: [
        { prompt: "First, no id?" }, // generated id
        { id: "dup", prompt: "Second?" },
        { id: "dup", prompt: "Third, duplicate?" }, // de-duplicated
      ],
    })
    const ids = parsed?.questions.map((q) => q.id) ?? []
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  it("gives checklist items stable unique ids", () => {
    const parsed = parseUnitContent({
      restatedGoal: "Goal.",
      relatedFiles: [{ path: "a.ts", reason: "A reason." }],
      concepts: [],
      agentExecutionNotes: [],
      reviewChecklist: [
        { description: "Item one, no id." },
        { id: "x", description: "Item two." },
        { id: "x", description: "Item three, duplicate." },
      ],
      questions: [{ id: "q1", prompt: "Why?" }],
    })
    const ids = parsed?.reviewChecklist.map((c) => c.id) ?? []
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  it("defaults challenge stub fields to null when omitted (R3)", () => {
    const parsed = parseUnitContent({
      restatedGoal: "Goal.",
      relatedFiles: [{ path: "a.ts", reason: "A reason." }],
      concepts: [],
      agentExecutionNotes: [],
      reviewChecklist: [],
      questions: [{ id: "q1", prompt: "Why?" }],
    })
    expect(parsed?.challengeConcept).toBeNull()
    expect(parsed?.challengeType).toBeNull()
  })
})
