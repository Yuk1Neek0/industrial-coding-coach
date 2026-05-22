import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient } from "@workspace/ai"
import { createMockTransport, type MockReply } from "@workspace/ai/testing"
import { describe, expect, it } from "vitest"

import type { ComprehensionAnswer, ComprehensionQuestion } from "../schema"
import { gradeUnderstandingCheck, parseGradingContent } from "./grade"

/** A sample fixed comprehension-question set, as produced by the review (#112). */
function questions(): ComprehensionQuestion[] {
  return [
    { id: "q1", prompt: "Why is the session helper a separate module?" },
    { id: "q2", prompt: "What happens when the token is expired?" },
  ]
}

/** A complete set of answers to {@link questions}. */
function answers(): ComprehensionAnswer[] {
  return [
    {
      questionId: "q1",
      answer: "It isolates token handling so the page stays declarative.",
    },
    {
      questionId: "q2",
      answer: "readToken() returns null and the user is sent to sign-in.",
    },
  ]
}

/** A `tool_use` content block. */
function toolUse(
  name: string,
  input: Record<string, unknown>,
): Anthropic.ContentBlock {
  return { type: "tool_use", id: `tu_${name}`, name, input } as unknown as
    Anthropic.ContentBlock
}

/** A `tool_use` reply for the mock transport. */
function reply(content: Anthropic.ContentBlock[]): MockReply {
  return { content, stopReason: "tool_use" }
}

/** A well-formed `submit_grading` input. */
function validGrading(overrides?: {
  score?: number
  weakAreas?: { area: string; detail: string }[]
}): Record<string, unknown> {
  return {
    score: overrides?.score ?? 82,
    weakAreas: overrides?.weakAreas ?? [
      {
        area: "risk-analysis",
        detail: "The answer did not mention how the expiry gap is detected.",
      },
    ],
  }
}

describe("gradeUnderstandingCheck", () => {
  it("produces a structured grading from the user's answers", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [reply([toolUse("submit_grading", validGrading())])],
      }),
    )
    const result = await gradeUnderstandingCheck({
      questions: questions(),
      answers: answers(),
      client,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.grading.score).toBe(82)
      expect(result.data.grading.weakAreas).toHaveLength(1)
      expect(result.data.grading.weakAreas[0]?.area).toBe("risk-analysis")
    }
  })

  it("carries the user's answers through verbatim for persistence", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [reply([toolUse("submit_grading", validGrading())])],
      }),
    )
    const userAnswers = answers()
    const result = await gradeUnderstandingCheck({
      questions: questions(),
      answers: userAnswers,
      client,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      // The grading is ready to hand straight to gradeDiffReview (#114).
      expect(result.data.grading.answers).toEqual(userAnswers)
    }
  })

  it("grades an empty answer set rather than failing", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse("submit_grading", {
              score: 0,
              weakAreas: [
                { area: "q1", detail: "Not answered." },
                { area: "q2", detail: "Not answered." },
              ],
            }),
          ]),
        ],
      }),
    )
    const result = await gradeUnderstandingCheck({
      questions: questions(),
      answers: [],
      client,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.grading.score).toBe(0)
      expect(result.data.grading.answers).toEqual([])
    }
  })

  it("grades a partial answer set rather than failing", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_grading", validGrading({ score: 45 }))])],
    })
    const result = await gradeUnderstandingCheck({
      questions: questions(),
      answers: [answers()[0] as ComprehensionAnswer],
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.grading.score).toBe(45)
    }
    // The prompt names every question, including the unanswered one.
    const prompt = transport.calls[0]?.messages[0]?.content
    expect(typeof prompt === "string" && prompt).toContain("(no answer given)")
    expect(typeof prompt === "string" && prompt).toContain("answered 1 of 2")
  })

  it("lists every question in the prompt even when answers are blank", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_grading", validGrading({ score: 0 }))])],
    })
    await gradeUnderstandingCheck({
      questions: questions(),
      answers: [],
      client: createLlmClient(transport),
    })
    const prompt = transport.calls[0]?.messages[0]?.content
    expect(typeof prompt).toBe("string")
    expect(prompt).toContain("session helper a separate module")
    expect(prompt).toContain("token is expired")
    expect(prompt).toContain("answered none")
  })

  it("returns no_questions when the review had no questions to grade", async () => {
    const client = createLlmClient(createMockTransport())
    const result = await gradeUnderstandingCheck({
      questions: [],
      answers: [],
      client,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_questions")
    }
  })

  it("maps an LLM transport failure to a typed llm_error", async () => {
    const client = createLlmClient(
      createMockTransport({ throws: new Error("network down") }),
    )
    const result = await gradeUnderstandingCheck({
      questions: questions(),
      answers: answers(),
      client,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("llm_error")
      expect(result.error.cause).toBeDefined()
    }
  })

  it("fails with no_structured_output when the model only returns text", async () => {
    const client = createLlmClient(
      createMockTransport({ replies: [{ text: "The answers look fine." }] }),
    )
    const result = await gradeUnderstandingCheck({
      questions: questions(),
      answers: answers(),
      client,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })

  it("fails with no_structured_output when the grade has no score", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([toolUse("submit_grading", { weakAreas: [] })]),
        ],
      }),
    )
    const result = await gradeUnderstandingCheck({
      questions: questions(),
      answers: answers(),
      client,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })

  it("forces the submit_grading tool and makes one bounded call", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_grading", validGrading())])],
    })
    await gradeUnderstandingCheck({
      questions: questions(),
      answers: answers(),
      client: createLlmClient(transport),
    })
    // A single bounded call — no tool loop — with the submission tool forced.
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0]?.tools?.map((t) => t.name)).toEqual([
      "submit_grading",
    ])
    expect(transport.calls[0]?.tool_choice).toEqual({
      type: "tool",
      name: "submit_grading",
    })
  })

  it("makes no live API calls — the mock transport serves the reply", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_grading", validGrading())])],
    })
    const result = await gradeUnderstandingCheck({
      questions: questions(),
      answers: answers(),
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(true)
    expect(transport.calls).toHaveLength(1)
  })
})

describe("parseGradingContent", () => {
  it("parses a well-formed submission", () => {
    const parsed = parseGradingContent(validGrading())
    expect(parsed?.score).toBe(82)
    expect(parsed?.weakAreas).toHaveLength(1)
  })

  it("rejects a non-object input", () => {
    expect(parseGradingContent("nope")).toBeNull()
    expect(parseGradingContent(null)).toBeNull()
  })

  it("rejects a submission with no numeric score", () => {
    expect(parseGradingContent({ weakAreas: [] })).toBeNull()
    expect(
      parseGradingContent({ score: "high", weakAreas: [] }),
    ).toBeNull()
  })

  it("clamps an out-of-range score into 0–100", () => {
    expect(parseGradingContent({ score: 150, weakAreas: [] })?.score).toBe(100)
    expect(parseGradingContent({ score: -20, weakAreas: [] })?.score).toBe(0)
  })

  it("rounds a fractional score to an integer", () => {
    expect(parseGradingContent({ score: 73.6, weakAreas: [] })?.score).toBe(74)
  })

  it("drops malformed weak-area entries but keeps the valid ones", () => {
    const parsed = parseGradingContent({
      score: 60,
      weakAreas: [
        { area: "good", detail: "A real gap." },
        { area: "missing-detail" }, // no detail — dropped
        "nope", // not an object — dropped
      ],
    })
    expect(parsed?.weakAreas).toEqual([
      { area: "good", detail: "A real gap." },
    ])
  })

  it("defaults a missing weakAreas field to an empty array", () => {
    expect(parseGradingContent({ score: 90 })?.weakAreas).toEqual([])
  })
})
