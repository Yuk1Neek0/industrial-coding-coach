// The bounded Anthropic SDK call that grades the user's understanding check
// (diff-review PRD FR-6, Issue #113).
//
// `gradeDiffReview` (the call) turns a *fixed* comprehension-question set — the
// one the review call (#112) produced — and the user's answers into a typed
// numeric score (0–100) and a weak-area breakdown the M8 Diff Review Coach
// persists via {@link import("./reviews").gradeDiffReview} (the data-access
// function from #114).
//
// It is a SEPARATE bounded call from the review call so grading is
// reproducible: the question set is fixed before any answer is graded, and the
// grading call never reasons over the diff again — it only judges answers
// against the questions. Per ADR 0005 it is a *bounded* prompt →
// structured-output call on the `@workspace/ai` (llm-foundation) client: a
// single tool the model is forced to call exactly once. There is no tool loop —
// the call always terminates in one turn.
//
// The call runs server-side only and never throws for an expected boundary
// failure — it returns a discriminated {@link GradeDiffResult}, mirroring
// `reviewDiff` (#112), the M5 `explainStack`, and the `@workspace/ai` error
// patterns. To avoid a name clash with the persistence function of the same
// name, the call is exported as `gradeUnderstandingCheck`.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient, type LlmClient, type LlmError } from "@workspace/ai"

import type {
  ComprehensionAnswer,
  ComprehensionQuestion,
  WeakArea,
} from "../schema"
import type { DiffReviewGrading } from "./reviews"

/** Output-token cap — the grading payload is small and structured. */
const GRADE_MAX_TOKENS = 2048

/** Bounds on the score the model may return — grading is 0–100. */
const MIN_SCORE = 0
const MAX_SCORE = 100

// --- Error model -----------------------------------------------------------

/** The distinct failure modes the grading call recognizes. */
export type GradeDiffErrorKind =
  /** The review carried no comprehension questions — there is nothing to grade. */
  | "no_questions"
  /** The underlying LLM call failed — carries the mapped {@link LlmError}. */
  | "llm_error"
  /** The model never returned a usable structured grading. */
  | "no_structured_output"

/** A typed failure from the diff-review grading call. */
export class GradeDiffError extends Error {
  readonly kind: GradeDiffErrorKind
  /** The underlying LLM error, when `kind` is `llm_error`. */
  readonly cause?: LlmError

  constructor(kind: GradeDiffErrorKind, message: string, cause?: LlmError) {
    super(message)
    this.name = "GradeDiffError"
    this.kind = kind
    if (cause) this.cause = cause
  }
}

/** The successful payload of a grading call. */
export interface GradeDiffData {
  /**
   * The structured grading, ready to persist via the `gradeDiffReview`
   * data-access function (#114) — its `answers`, `score`, and `weakAreas`
   * match {@link DiffReviewGrading} exactly.
   */
  grading: DiffReviewGrading
}

/** The discriminated result of the grading call — never thrown. */
export type GradeDiffResult =
  | { ok: true; data: GradeDiffData }
  | { ok: false; error: GradeDiffError }

/** Input for {@link gradeUnderstandingCheck}. */
export interface GradeDiffInput {
  /**
   * The *fixed* comprehension-question set from the review (#112) — the input
   * contract grading judges against. The question set is fixed before any
   * answer is graded, so grading is reproducible.
   */
  questions: ComprehensionQuestion[]
  /**
   * The user's answers to the comprehension questions, keyed by `questionId`.
   * May be partial or empty — an unanswered question is graded as a miss, and
   * an empty answer set produces the lowest score, never a failure.
   */
  answers: ComprehensionAnswer[]
  /**
   * LLM client to run the call on. Injectable so tests pass a client built on
   * the `@workspace/ai/testing` mock transport — CI runs with no API key and
   * makes no live calls. Omitted → a real client built from `ANTHROPIC_API_KEY`.
   */
  client?: LlmClient
}

// --- Tool definition -------------------------------------------------------

/** Tool the model is forced to call exactly once to return the grading. */
const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_grading",
  description:
    "Submit the final, structured grade for the user's understanding check. " +
    "Call this exactly once. The score is an integer 0–100 reflecting how " +
    "well the answers prove the user understands and could defend the " +
    "change in an interview; weak areas name the specific gaps the answers " +
    "revealed.",
  input_schema: {
    type: "object",
    properties: {
      score: {
        type: "integer",
        description:
          "An integer 0–100. 0 when the answers are absent or show no " +
          "understanding; 100 when every answer is correct, specific, and " +
          "interview-ready. Unanswered questions count against the score.",
        minimum: MIN_SCORE,
        maximum: MAX_SCORE,
      },
      weakAreas: {
        type: "array",
        description:
          "The areas of understanding the answers were weak on — one entry " +
          "per distinct gap. Empty only when the answers had no weak areas.",
        items: {
          type: "object",
          properties: {
            area: {
              type: "string",
              description:
                "A short label for the weak area, e.g. risk-analysis or " +
                "the id of the question that exposed the gap.",
            },
            detail: {
              type: "string",
              description:
                "Why this area was judged weak, in plain language, " +
                "referencing what the user's answer was missing.",
            },
          },
          required: ["area", "detail"],
        },
      },
    },
    required: ["score", "weakAreas"],
  },
}

const SYSTEM_PROMPT =
  "You are a coding coach grading a job-seeking junior developer's " +
  "understanding check for a pull request they built with heavy AI " +
  "assistance. You are given a FIXED set of comprehension questions and the " +
  "user's free-text answers. Judge how well the answers prove the user " +
  "genuinely understands the change and could explain and defend it in an " +
  "interview.\n\n" +
  "Grade only the answers against the questions — do not invent new " +
  "questions and do not reason about code you were not shown. Be fair but " +
  "honest: a vague, generic, or AI-sounding answer that does not show real " +
  "understanding is weak. An unanswered or empty answer shows no " +
  "understanding of that question and must count against the score.\n\n" +
  "Return an integer score 0–100 and a weak-area breakdown naming the " +
  "specific gaps the answers revealed. If the user answered nothing, the " +
  "score is 0 and every question is a weak area. Call submit_grading " +
  "exactly once."

// --- Helpers ---------------------------------------------------------------

/** A tool-use content block, narrowed from a response's content. */
type ToolUseBlock = Extract<Anthropic.ContentBlock, { type: "tool_use" }>

/** Collect the tool-use blocks from a response's content. */
function toolUseBlocks(content: Anthropic.ContentBlock[]): ToolUseBlock[] {
  return content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  )
}

/** A non-empty trimmed string, or `null`. */
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

/**
 * Build the user prompt: each fixed question paired with the user's answer.
 *
 * The questions drive the order — every question is listed even when the user
 * left it blank, so a partial or empty answer set is graded as a set of misses
 * rather than silently shrinking the question set.
 */
function buildGradingPrompt(input: GradeDiffInput): string {
  const answerByQuestion = new Map(
    input.answers.map((answer) => [answer.questionId, answer.answer]),
  )

  const blocks = input.questions.map((question, index) => {
    const raw = answerByQuestion.get(question.id)
    const answer = str(raw)
    return (
      `### Question ${index + 1} (id: ${question.id})\n` +
      `${question.prompt}\n\n` +
      `User's answer: ${answer ?? "(no answer given)"}`
    )
  })

  const answeredCount = input.questions.filter((question) =>
    str(answerByQuestion.get(question.id)),
  ).length

  const coverageNote =
    answeredCount === 0
      ? "\n\nThe user answered none of the questions. Score 0 and list " +
        "every question as a weak area."
      : answeredCount < input.questions.length
        ? `\n\nThe user answered ${answeredCount} of ` +
          `${input.questions.length} questions. Treat each unanswered ` +
          "question as a clear miss."
        : ""

  return (
    `Grade the user's understanding check below. There ${
      input.questions.length === 1 ? "is 1 question" : `are ${input.questions.length} questions`
    }.\n\n` +
    `${blocks.join("\n\n")}` +
    `${coverageNote}\n\n` +
    `Judge the answers, then call submit_grading exactly once.`
  )
}

/** Clamp a score to the 0–100 integer range grading is defined over. */
function clampScore(value: number): number {
  if (!Number.isFinite(value)) return MIN_SCORE
  const rounded = Math.round(value)
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, rounded))
}

/**
 * Validate and coerce a `submit_grading` tool input into a {@link WeakArea}
 * list plus a clamped numeric score. Returns `null` when the input is not a
 * usable grading object (so the caller fails with `no_structured_output`).
 * A non-numeric or out-of-range score is coerced rather than rejected, and
 * malformed weak-area entries are dropped — grading must always yield a number.
 *
 * Exported so tests can exercise the parse boundary directly, mirroring
 * `parseReviewContent` (#112).
 */
export function parseGradingContent(
  input: unknown,
): { score: number; weakAreas: WeakArea[] } | null {
  if (typeof input !== "object" || input === null) return null
  const record = input as Record<string, unknown>

  if (typeof record.score !== "number") return null
  const score = clampScore(record.score)

  const weakAreas = Array.isArray(record.weakAreas)
    ? record.weakAreas.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return []
        const w = raw as Record<string, unknown>
        const area = str(w.area)
        const detail = str(w.detail)
        return area && detail ? [{ area, detail }] : []
      })
    : []

  return { score, weakAreas }
}

// --- The bounded call ------------------------------------------------------

/**
 * Grade a user's answers to a diff review's comprehension questions
 * (PRD FR-6, Issue #113).
 *
 * Makes a single bounded tool-use call on the `@workspace/ai` client: the
 * model is given the FIXED question set and the user's answers, and is forced
 * to return the grade through `submit_grading`. There is no tool loop — the
 * call always terminates in one turn with structured output or a typed
 * failure.
 *
 * The returned {@link GradeDiffData.grading} carries the user's answers
 * verbatim alongside the score and weak areas, so it can be passed straight to
 * the `gradeDiffReview` data-access function (#114) to persist.
 *
 * Partial or empty answer sets are graded, never rejected — an empty set
 * yields a low score and a full weak-area breakdown. The call only fails when
 * the review had no questions to grade, when the LLM transport fails, or when
 * the model returns no usable structured grade.
 */
export async function gradeUnderstandingCheck(
  input: GradeDiffInput,
): Promise<GradeDiffResult> {
  const { questions, answers } = input

  if (questions.length === 0) {
    return {
      ok: false,
      error: new GradeDiffError(
        "no_questions",
        "The diff review has no comprehension questions to grade.",
      ),
    }
  }

  const client = input.client ?? createLlmClient()
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildGradingPrompt(input) },
  ]

  const result = await client.complete({
    system: SYSTEM_PROMPT,
    cacheSystem: true,
    messages,
    maxTokens: GRADE_MAX_TOKENS,
    tools: [SUBMIT_TOOL],
    // The grading call is a single forced submission — it never loops.
    toolChoice: { type: "tool", name: SUBMIT_TOOL.name },
  })

  if (!result.ok) {
    return {
      ok: false,
      error: new GradeDiffError(
        "llm_error",
        `The diff-review grading call failed: ${result.error.message}`,
        result.error,
      ),
    }
  }

  const submission = toolUseBlocks(result.data.content).find(
    (block) => block.name === SUBMIT_TOOL.name,
  )
  if (!submission) {
    return {
      ok: false,
      error: new GradeDiffError(
        "no_structured_output",
        "The model ended its turn without submitting a grade.",
      ),
    }
  }

  const parsed = parseGradingContent(submission.input)
  if (!parsed) {
    return {
      ok: false,
      error: new GradeDiffError(
        "no_structured_output",
        "The model's submitted grade was empty or malformed.",
      ),
    }
  }

  return {
    ok: true,
    data: {
      // The user's answers are carried through verbatim so the grading is a
      // complete record ready for the `gradeDiffReview` persistence call.
      grading: {
        answers,
        score: parsed.score,
        weakAreas: parsed.weakAreas,
      },
    },
  }
}
