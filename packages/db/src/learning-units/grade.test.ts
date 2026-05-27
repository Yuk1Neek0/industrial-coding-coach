// Tests for the M7 bounded learning-unit grading call (Issue #134).
//
// Exercised with mocked Anthropic SDK responses via `@workspace/ai/testing`.
// No live API calls; no live GitHub calls; no database — the call is pure
// prompt → structured output. Mirrors `../diff/grade.test.ts` (the M8 grading
// call's test, which this call's shape was modelled on).

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient } from "@workspace/ai"
import { createMockTransport, type MockReply } from "@workspace/ai/testing"
import { describe, expect, it } from "vitest"

import type {
  UnderstandingAnswer,
  UnderstandingQuestion,
} from "../schema"
import { gradeLearningUnit, parseGradingContent } from "./grade"

/** A sample fixed understanding-question set, as produced by generation (#133). */
function questions(): UnderstandingQuestion[] {
  return [
    { id: "q1", prompt: "Why does the route handler live under app/api/health/?" },
    { id: "q2", prompt: "What does Response.json do in this codebase?" },
  ]
}

/** A complete set of answers to {@link questions}. */
function answers(): UnderstandingAnswer[] {
  return [
    {
      questionId: "q1",
      answer:
        "Next.js App Router treats files named route.ts inside app/ as " +
        "route handlers; the path becomes the URL.",
    },
    {
      questionId: "q2",
      answer:
        "It builds a JSON Response with the correct content-type header in " +
        "one call.",
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
  overall?: number
  perQuestion?: { questionId: string; score: number }[]
  weakAreas?: { area: string; detail: string }[]
}): Record<string, unknown> {
  return {
    overall: overrides?.overall ?? 84,
    perQuestion:
      overrides?.perQuestion ?? [
        { questionId: "q1", score: 90 },
        { questionId: "q2", score: 78 },
      ],
    weakAreas:
      overrides?.weakAreas ?? [
        {
          area: "Response.json semantics",
          detail:
            "The answer did not mention the implicit content-type header.",
        },
      ],
  }
}

describe("gradeLearningUnit — all-correct fixture", () => {
  it("produces a structured grading with the overall and per-question scores", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_grading",
              validGrading({
                overall: 100,
                perQuestion: [
                  { questionId: "q1", score: 100 },
                  { questionId: "q2", score: 100 },
                ],
                weakAreas: [],
              }),
            ),
          ]),
        ],
      }),
    )
    const result = await gradeLearningUnit({
      questions: questions(),
      answers: answers(),
      client,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.score.overall).toBe(100)
      expect(result.data.score.perQuestion).toEqual([
        { questionId: "q1", score: 100 },
        { questionId: "q2", score: 100 },
      ])
      expect(result.data.weakAreas).toEqual([])
    }
  })

  it("carries the user's answers through verbatim for persistence", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [reply([toolUse("submit_grading", validGrading())])],
      }),
    )
    const userAnswers = answers()
    const result = await gradeLearningUnit({
      questions: questions(),
      answers: userAnswers,
      client,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      // The answers are ready to hand straight to recordAnswers (#135).
      expect(result.data.answers).toEqual(userAnswers)
    }
  })
})

describe("gradeLearningUnit — all-incorrect fixture", () => {
  it("produces a low overall score and a weak-area entry per question", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_grading",
              validGrading({
                overall: 10,
                perQuestion: [
                  { questionId: "q1", score: 5 },
                  { questionId: "q2", score: 15 },
                ],
                weakAreas: [
                  {
                    area: "q1",
                    detail: "The answer described the wrong framework concept.",
                  },
                  {
                    area: "q2",
                    detail: "Generic restatement; no Response.json detail.",
                  },
                ],
              }),
            ),
          ]),
        ],
      }),
    )
    const result = await gradeLearningUnit({
      questions: questions(),
      // Answered but wrong — the answers are non-empty, so the call still
      // runs through the SDK; the model returns a low grade.
      answers: [
        { questionId: "q1", answer: "I think it has to do with Express." },
        { questionId: "q2", answer: "It returns JSON." },
      ],
      client,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.score.overall).toBe(10)
      expect(result.data.score.perQuestion).toHaveLength(2)
      expect(result.data.weakAreas).toHaveLength(2)
    }
  })
})

describe("gradeLearningUnit — mixed fixture", () => {
  it("grades a partial answer set and backfills missing weak areas", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_grading",
            validGrading({
              overall: 45,
              perQuestion: [{ questionId: "q1", score: 90 }],
              weakAreas: [],
            }),
          ),
        ]),
      ],
    })
    const result = await gradeLearningUnit({
      questions: questions(),
      // Only the first question is answered.
      answers: [answers()[0] as UnderstandingAnswer],
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.score.overall).toBe(45)
      // The unanswered question is backfilled with a zero per-question score.
      expect(result.data.score.perQuestion).toEqual([
        { questionId: "q1", score: 90 },
        { questionId: "q2", score: 0 },
      ])
      // The unanswered question is backfilled as a weak area.
      const q2Weak = result.data.weakAreas.find((w) => w.area === "q2")
      expect(q2Weak).toBeDefined()
      expect(q2Weak?.detail).toBe("no answer provided")
    }
    // The prompt names every question, including the unanswered one.
    const prompt = transport.calls[0]?.messages[0]?.content
    expect(typeof prompt === "string" && prompt).toContain("(no answer given)")
    expect(typeof prompt === "string" && prompt).toContain("answered 1 of 2")
  })

  it("does not duplicate a weak-area entry the model already produced", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse(
              "submit_grading",
              validGrading({
                overall: 50,
                perQuestion: [{ questionId: "q1", score: 100 }],
                weakAreas: [
                  { area: "q2", detail: "User did not answer." },
                ],
              }),
            ),
          ]),
        ],
      }),
    )
    const result = await gradeLearningUnit({
      questions: questions(),
      answers: [answers()[0] as UnderstandingAnswer],
      client,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      // The model's q2 entry is kept verbatim — we do NOT add a second q2 entry.
      const q2Entries = result.data.weakAreas.filter((w) => w.area === "q2")
      expect(q2Entries).toHaveLength(1)
      expect(q2Entries[0]?.detail).toBe("User did not answer.")
    }
  })
})

describe("gradeLearningUnit — empty answers fixture", () => {
  it("grades empty answers locally without any SDK call (NFR Resilient)", async () => {
    const transport = createMockTransport()
    const result = await gradeLearningUnit({
      questions: questions(),
      answers: [],
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.score.overall).toBe(0)
      expect(result.data.score.perQuestion).toEqual([
        { questionId: "q1", score: 0 },
        { questionId: "q2", score: 0 },
      ])
      expect(result.data.weakAreas).toEqual([
        { area: "q1", detail: "no answer provided" },
        { area: "q2", detail: "no answer provided" },
      ])
      expect(result.data.answers).toEqual([])
    }
    // Empty answers are fully determined — no tokens are spent.
    expect(transport.calls).toHaveLength(0)
  })

  it("treats a blank-string answer set as empty (NFR Resilient)", async () => {
    const transport = createMockTransport()
    const result = await gradeLearningUnit({
      questions: questions(),
      answers: [
        { questionId: "q1", answer: "   " },
        { questionId: "q2", answer: "" },
      ],
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.score.overall).toBe(0)
    }
    expect(transport.calls).toHaveLength(0)
  })
})

describe("gradeLearningUnit — error cases", () => {
  it("returns no_questions when the unit had no questions to grade", async () => {
    const client = createLlmClient(createMockTransport())
    const result = await gradeLearningUnit({
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
    const result = await gradeLearningUnit({
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
    const result = await gradeLearningUnit({
      questions: questions(),
      answers: answers(),
      client,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })

  it("fails with no_structured_output when the grade has no overall score", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          reply([
            toolUse("submit_grading", { perQuestion: [], weakAreas: [] }),
          ]),
        ],
      }),
    )
    const result = await gradeLearningUnit({
      questions: questions(),
      answers: answers(),
      client,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no_structured_output")
    }
  })
})

describe("gradeLearningUnit — bounded SDK call shape", () => {
  it("forces the submit_grading tool and makes one bounded call", async () => {
    const transport = createMockTransport({
      replies: [reply([toolUse("submit_grading", validGrading())])],
    })
    await gradeLearningUnit({
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
    const result = await gradeLearningUnit({
      questions: questions(),
      answers: answers(),
      client: createLlmClient(transport),
    })
    expect(result.ok).toBe(true)
    expect(transport.calls).toHaveLength(1)
  })

  it("lists every question in the prompt even when answers are blank for some", async () => {
    const transport = createMockTransport({
      replies: [
        reply([
          toolUse(
            "submit_grading",
            validGrading({ overall: 50, perQuestion: [], weakAreas: [] }),
          ),
        ]),
      ],
    })
    await gradeLearningUnit({
      questions: questions(),
      // Only q1 has an answer — q2 should still appear in the prompt.
      answers: [answers()[0] as UnderstandingAnswer],
      client: createLlmClient(transport),
    })
    const prompt = transport.calls[0]?.messages[0]?.content
    expect(typeof prompt).toBe("string")
    expect(prompt).toContain("route handler live under app/api/health")
    expect(prompt).toContain("Response.json")
    expect(prompt).toContain("(no answer given)")
  })
})

describe("parseGradingContent", () => {
  it("parses a well-formed submission", () => {
    const parsed = parseGradingContent(validGrading())
    expect(parsed?.score.overall).toBe(84)
    expect(parsed?.score.perQuestion).toHaveLength(2)
    expect(parsed?.weakAreas).toHaveLength(1)
  })

  it("rejects a non-object input", () => {
    expect(parseGradingContent("nope")).toBeNull()
    expect(parseGradingContent(null)).toBeNull()
  })

  it("rejects a submission with no numeric overall score", () => {
    expect(
      parseGradingContent({ perQuestion: [], weakAreas: [] }),
    ).toBeNull()
    expect(
      parseGradingContent({
        overall: "high",
        perQuestion: [],
        weakAreas: [],
      }),
    ).toBeNull()
  })

  it("clamps an out-of-range overall score into 0–100", () => {
    expect(
      parseGradingContent({ overall: 150, perQuestion: [], weakAreas: [] })
        ?.score.overall,
    ).toBe(100)
    expect(
      parseGradingContent({ overall: -20, perQuestion: [], weakAreas: [] })
        ?.score.overall,
    ).toBe(0)
  })

  it("rounds a fractional overall score to an integer", () => {
    expect(
      parseGradingContent({ overall: 73.6, perQuestion: [], weakAreas: [] })
        ?.score.overall,
    ).toBe(74)
  })

  it("drops malformed per-question entries but keeps the valid ones", () => {
    const parsed = parseGradingContent({
      overall: 60,
      perQuestion: [
        { questionId: "q1", score: 70 },
        { questionId: "q2" }, // no score — dropped
        { score: 40 }, // no questionId — dropped
        "nope", // not an object — dropped
      ],
      weakAreas: [],
    })
    expect(parsed?.score.perQuestion).toEqual([
      { questionId: "q1", score: 70 },
    ])
  })

  it("clamps a per-question score into 0–100", () => {
    const parsed = parseGradingContent({
      overall: 50,
      perQuestion: [
        { questionId: "q1", score: 200 },
        { questionId: "q2", score: -5 },
      ],
      weakAreas: [],
    })
    expect(parsed?.score.perQuestion).toEqual([
      { questionId: "q1", score: 100 },
      { questionId: "q2", score: 0 },
    ])
  })

  it("drops malformed weak-area entries but keeps the valid ones", () => {
    const parsed = parseGradingContent({
      overall: 60,
      perQuestion: [],
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

  it("defaults a missing perQuestion field to an empty array", () => {
    expect(
      parseGradingContent({ overall: 90, weakAreas: [] })?.score.perQuestion,
    ).toEqual([])
  })

  it("defaults a missing weakAreas field to an empty array", () => {
    expect(
      parseGradingContent({ overall: 90, perQuestion: [] })?.weakAreas,
    ).toEqual([])
  })
})
