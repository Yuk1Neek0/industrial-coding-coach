import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient } from "@workspace/ai"
import { createMockTransport, type MockReply } from "@workspace/ai/testing"
import { describe, expect, it } from "vitest"

import type { PullRequestChangeModel } from "../github/pull-requests"
import { parseReviewContent, reviewDiff } from "./review"

/** A sample change model — two changed files with parsed hunks. */
function changeModel(
  overrides?: Partial<PullRequestChangeModel>,
): PullRequestChangeModel {
  return {
    repo: { owner: "acme", repo: "portfolio" },
    number: 42,
    title: "Add session-token helper",
    body: "Wires a new session helper into the sign-in flow.",
    htmlUrl: "https://github.com/acme/portfolio/pull/42",
    head: { ref: "feature/auth", sha: "headsha" },
    base: { ref: "main", sha: "basesha" },
    additions: 30,
    deletions: 4,
    changedFileCount: 2,
    truncated: false,
    linkedIssue: {
      number: 7,
      title: "Session handling",
      body: "## Acceptance Criteria\n- [ ] Tokens expire",
      htmlUrl: "https://github.com/acme/portfolio/issues/7",
      acceptanceCriteria: [{ text: "Tokens expire", checked: false }],
    },
    files: [
      {
        path: "apps/web/lib/auth.ts",
        previousPath: null,
        status: "added",
        additions: 20,
        deletions: 0,
        patchOmitted: false,
        hunks: [
          {
            oldStart: 0,
            oldLines: 0,
            newStart: 1,
            newLines: 3,
            header: "",
            lines: [
              { kind: "add", content: "export function session() {" },
              { kind: "add", content: "  return readToken()" },
              { kind: "add", content: "}" },
            ],
          },
        ],
      },
      {
        path: "apps/web/app/page.tsx",
        previousPath: null,
        status: "modified",
        additions: 10,
        deletions: 4,
        patchOmitted: false,
        hunks: [
          {
            oldStart: 1,
            oldLines: 2,
            newStart: 1,
            newLines: 3,
            header: "Home",
            lines: [
              { kind: "context", content: "export default function Page() {" },
              { kind: "add", content: "  const s = session()" },
              { kind: "del", content: "  return <Landing />" },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

/** A `tool_use` content block. */
function toolUse(
  name: string,
  input: Record<string, unknown>,
): Anthropic.ContentBlock {
  return { type: "tool_use", id: `tu_${name}`, name, input } as unknown as
    Anthropic.ContentBlock
}

/** A well-formed `submit_diff_review` input. */
function validReview(overrides?: {
  changedFilePath?: string
}): Record<string, unknown> {
  return {
    changedFiles: [
      {
        path: overrides?.changedFilePath ?? "apps/web/lib/auth.ts",
        explanation: "Adds the session-token helper module.",
      },
      {
        path: "apps/web/app/page.tsx",
        explanation: "Calls the new session helper from the landing page.",
      },
    ],
    coreLogicExplanation:
      "The PR introduces a session helper and uses it on the landing page.",
    riskAnalysis: [
      {
        title: "Unvalidated token",
        detail: "auth.ts trusts readToken() without checking expiry.",
      },
    ],
    testSuggestions: [
      {
        description: "Assert an expired token is rejected.",
        rationale: "Covers the expiry gap in auth.ts.",
      },
    ],
    comprehensionQuestions: [
      { id: "q1", prompt: "Why is the session helper a separate module?" },
      { id: "q2", prompt: "What happens when the token is expired?" },
    ],
  }
}

/** A `tool_use` reply for the mock transport. */
function reply(content: Anthropic.ContentBlock[]): MockReply {
  return { content, stopReason: "tool_use" }
}

describe("reviewDiff", () => {
  it("produces a structured review after the model reads a file", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([toolUse("read_pr_file", { path: "apps/web/lib/auth.ts" })]),
          reply([toolUse("submit_diff_review", validReview())]),
        ],
      }),
    )
    const result = await reviewDiff({ changeModel: changeModel(), client })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.content.changedFiles).toHaveLength(2)
      expect(result.data.content.coreLogicExplanation).toContain("session")
      expect(result.data.content.riskAnalysis[0]?.title).toBe(
        "Unvalidated token",
      )
      expect(result.data.content.comprehensionQuestions).toHaveLength(2)
    }
  })

  it("accepts an immediate submission with no file reads", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [reply([toolUse("submit_diff_review", validReview())])],
      }),
    )
    const result = await reviewDiff({ changeModel: changeModel(), client })
    expect(result.ok).toBe(true)
  })

  it("runs the file-reference integrity check on the result", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [reply([toolUse("submit_diff_review", validReview())])],
      }),
    )
    const result = await reviewDiff({ changeModel: changeModel(), client })
    expect(result.ok && result.data.fileReferences.ok).toBe(true)
  })

  it("flags a review that cites a file not changed by the PR", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_diff_review",
              validReview({ changedFilePath: "apps/web/ghost.ts" }),
            ),
          ]),
        ],
      }),
    )
    const result = await reviewDiff({ changeModel: changeModel(), client })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.fileReferences.ok).toBe(false)
      expect(result.data.fileReferences.missingChangedFiles).toEqual([
        "apps/web/ghost.ts",
      ])
    }
  })

  it("serves a read_pr_file request from the change model's hunks", async () => {
    const transport = createMockTransport({
      replies: [
        reply([toolUse("read_pr_file", { path: "apps/web/lib/auth.ts" })]),
        reply([toolUse("submit_diff_review", validReview())]),
      ],
    })
    await reviewDiff({
      changeModel: changeModel(),
      client: createLlmClient(transport),
    })
    // The second call carries the tool_result with the rendered diff as its
    // last (most recent) user message.
    const secondCall = transport.calls[1]
    const userMsg = secondCall?.messages
      .filter((m) => m.role === "user")
      .at(-1)
    const block = Array.isArray(userMsg?.content)
      ? userMsg.content[0]
      : undefined
    expect(block).toMatchObject({ type: "tool_result" })
    expect(JSON.stringify(block)).toContain("export function session()")
  })

  it("returns an error to the model when it reads an unknown file", async () => {
    const transport = createMockTransport({
      replies: [
        reply([toolUse("read_pr_file", { path: "no/such/file.ts" })]),
        reply([toolUse("submit_diff_review", validReview())]),
      ],
    })
    const result = await reviewDiff({
      changeModel: changeModel(),
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

  it("returns empty_change_model when the PR changed no files", async () => {
    const client = createLlmClient(createMockTransport())
    const result = await reviewDiff({
      changeModel: changeModel({ files: [] }),
      client,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("empty_change_model")
    }
  })

  it("maps an LLM transport failure to a typed llm_error", async () => {
    const client = createLlmClient(
      createMockTransport({ throws: new Error("network down") }),
    )
    const result = await reviewDiff({ changeModel: changeModel(), client })
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
    const result = await reviewDiff({ changeModel: changeModel(), client })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })

  it("fails with no_structured_output when the submission is empty", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse("submit_diff_review", {
              changedFiles: [],
              coreLogicExplanation: "Some logic.",
              riskAnalysis: [],
              testSuggestions: [],
              comprehensionQuestions: [],
            }),
          ]),
        ],
      }),
    )
    const result = await reviewDiff({ changeModel: changeModel(), client })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })

  it("makes no live API calls — the mock transport serves every reply", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_diff_review", validReview())])],
    })
    await reviewDiff({
      changeModel: changeModel(),
      client: createLlmClient(transport),
    })
    // One bounded call; both review tools were offered to the model.
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0]?.tools?.map((t) => t.name)).toEqual([
      "read_pr_file",
      "submit_diff_review",
    ])
  })

  it("forces the submission tool on the final turn", async () => {
    // The model keeps reading files; the call must still terminate.
    const transport = createMockTransport({
      replies: [
        reply([toolUse("read_pr_file", { path: "apps/web/lib/auth.ts" })]),
      ],
    })
    const result = await reviewDiff({
      changeModel: changeModel(),
      client: createLlmClient(transport),
    })
    // The mock never submits, so the call exhausts its turn budget.
    expect(result.ok).toBe(false)
    const lastCall = transport.calls.at(-1)
    expect(lastCall?.tool_choice).toEqual({
      type: "tool",
      name: "submit_diff_review",
    })
  })
})

describe("parseReviewContent", () => {
  it("parses a well-formed submission", () => {
    const parsed = parseReviewContent(validReview())
    expect(parsed?.changedFiles).toHaveLength(2)
    expect(parsed?.comprehensionQuestions[0]?.id).toBe("q1")
  })

  it("rejects a non-object input", () => {
    expect(parseReviewContent("nope")).toBeNull()
    expect(parseReviewContent(null)).toBeNull()
  })

  it("rejects a submission with no core-logic explanation", () => {
    expect(
      parseReviewContent({ ...validReview(), coreLogicExplanation: "" }),
    ).toBeNull()
  })

  it("rejects a submission with no changed files and no questions", () => {
    expect(
      parseReviewContent({
        changedFiles: [],
        coreLogicExplanation: "Some logic.",
        riskAnalysis: [],
        testSuggestions: [],
        comprehensionQuestions: [],
      }),
    ).toBeNull()
  })

  it("drops malformed list entries but keeps the valid ones", () => {
    const parsed = parseReviewContent({
      changedFiles: [
        { path: "a.ts" }, // missing explanation — dropped
        { path: "b.ts", explanation: "A real change." },
      ],
      coreLogicExplanation: "Core logic.",
      riskAnalysis: [{ title: "Risk" }], // missing detail — dropped
      testSuggestions: [],
      comprehensionQuestions: [{ id: "q1", prompt: "A question?" }],
    })
    expect(parsed?.changedFiles.map((f) => f.path)).toEqual(["b.ts"])
    expect(parsed?.riskAnalysis).toEqual([])
  })

  it("gives questions stable unique ids for the grading call", () => {
    const parsed = parseReviewContent({
      changedFiles: [{ path: "a.ts", explanation: "A change." }],
      coreLogicExplanation: "Core logic.",
      riskAnalysis: [],
      testSuggestions: [],
      comprehensionQuestions: [
        { prompt: "First, no id?" }, // missing id — generated
        { id: "dup", prompt: "Second?" },
        { id: "dup", prompt: "Third, duplicate id?" }, // de-duplicated
      ],
    })
    const ids = parsed?.comprehensionQuestions.map((q) => q.id) ?? []
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  it("defaults missing list fields to empty arrays", () => {
    const parsed = parseReviewContent({
      changedFiles: [{ path: "a.ts", explanation: "A change." }],
      coreLogicExplanation: "Core logic.",
    })
    expect(parsed?.riskAnalysis).toEqual([])
    expect(parsed?.testSuggestions).toEqual([])
    expect(parsed?.comprehensionQuestions).toEqual([])
  })
})
