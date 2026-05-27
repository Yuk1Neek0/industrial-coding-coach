// The bounded Anthropic SDK call that grades the user's understanding check on
// a learning unit (issue-based-learning-workspace PRD FR-5, Issue #134).
//
// `gradeLearningUnit` turns a *fixed* understanding-question set — the one the
// generation call (#133) produced — and the user's answers into a typed numeric
// score and a weak-area breakdown the M7 Issue-Based Learning Workspace
// persists via {@link import("./units").recordScore} (the data-access function
// from #135).
//
// It is a SEPARATE bounded call from the generation call (#133) so grading is
// reproducible: the question set is fixed before any answer is graded, and the
// grading call never reasons over the issue or snapshot again — it only judges
// answers against the questions. Same separation pattern M8's grading call
// (#113) uses for its review.
//
// Per ADR 0005 it is a *bounded* prompt → structured-output call on the
// `@workspace/ai` (llm-foundation) client: a single tool the model is forced
// to call exactly once. There is no tool loop — the call always terminates in
// one turn.
//
// Per R6 scoring is strictly per-unit: this call produces one score and one
// weak-area breakdown for the given questions / answers and nothing else.
// M10 owns any cross-unit rollup.
//
// The structured output shape — an integer overall score 0–100, a per-question
// score breakdown, and an array of weak areas — matches the M7 schema's
// `UnderstandingScore` and `LearningWeakArea` types so the result is
// interchangeable with the M8 `diff_reviews` grading shape for the shared
// Score / Weak Area UI (NFR Fair grading).
//
// Graceful degradation per NFR Resilient:
//   - empty answers → score 0 with one "no answer provided" weak-area entry
//     per question; never throws;
//   - partial answers → unanswered questions count as misses and surface in
//     the weak-area breakdown without failing the call;
//   - empty question set → returns a typed `no_questions` failure; there is
//     nothing to grade.
//
// The call runs server-side only and never throws for an expected boundary
// failure — it returns a discriminated {@link GradeLearningUnitResult},
// mirroring the M8 grading call and the `@workspace/ai` error patterns.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient, type LlmClient, type LlmError } from "@workspace/ai"

import type {
  LearningWeakArea,
  UnderstandingAnswer,
  UnderstandingQuestion,
  UnderstandingScore,
} from "../schema"

/** Output-token cap — the grading payload is small and structured. */
const GRADE_MAX_TOKENS = 2048

/** Bounds on the score the model may return — grading is 0–100. */
const MIN_SCORE = 0
const MAX_SCORE = 100

// --- Error model -----------------------------------------------------------

/** The distinct failure modes the grading call recognizes. */
export type GradeLearningUnitErrorKind =
  /** The unit carried no understanding questions — there is nothing to grade. */
  | "no_questions"
  /** The underlying LLM call failed — carries the mapped {@link LlmError}. */
  | "llm_error"
  /** The model never returned a usable structured grading. */
  | "no_structured_output"

/** A typed failure from the learning-unit grading call. */
export class GradeLearningUnitError extends Error {
  readonly kind: GradeLearningUnitErrorKind
  /** The underlying LLM error, when `kind` is `llm_error`. */
  readonly cause?: LlmError

  constructor(
    kind: GradeLearningUnitErrorKind,
    message: string,
    cause?: LlmError,
  ) {
    super(message)
    this.name = "GradeLearningUnitError"
    this.kind = kind
    if (cause) this.cause = cause
  }
}

/** The successful payload of a grading call. */
export interface GradeLearningUnitData {
  /**
   * The structured per-attempt score — overall plus per-question — ready to
   * persist via the {@link import("./units").recordScore} data-access function
   * (#135). Shape matches the M7 schema's `UnderstandingScore` and is
   * interchangeable with the M8 `diff_reviews` `score` column for the shared
   * Score / Weak Area UI (NFR Fair grading).
   */
  score: UnderstandingScore
  /**
   * The weak-area breakdown — one entry per distinct gap the answers revealed.
   * Shape matches `LearningWeakArea`, which is shape-identical to the M8
   * `WeakArea` so the same UI component can render both.
   */
  weakAreas: LearningWeakArea[]
  /**
   * The user's answers carried through verbatim. The integration layer (#138)
   * persists these via {@link import("./units").recordAnswers}; carrying them
   * through here keeps the grading result a complete record of the attempt.
   */
  answers: UnderstandingAnswer[]
}

/** The discriminated result of the grading call — never thrown. */
export type GradeLearningUnitResult =
  | { ok: true; data: GradeLearningUnitData }
  | { ok: false; error: GradeLearningUnitError }

/** Input for {@link gradeLearningUnit}. */
export interface GradeLearningUnitInput {
  /**
   * The *fixed* understanding-question set from the unit (#133) — the input
   * contract grading judges against. The question set is fixed before any
   * answer is graded, so grading is reproducible.
   */
  questions: UnderstandingQuestion[]
  /**
   * The user's answers to the understanding questions, keyed by `questionId`.
   * May be partial or empty — an unanswered question is graded as a miss with
   * an explicit "no answer provided" weak-area entry, and an empty answer set
   * produces the lowest score, never a failure (NFR Resilient).
   */
  answers: UnderstandingAnswer[]
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
    "Submit the final, structured grade for the user's understanding check " +
    "on this learning unit. Call this exactly once. The overall score is an " +
    "integer 0–100 reflecting how well the answers prove the user " +
    "understands and could defend the issue in an interview; per-question " +
    "scores break that down by question; weak areas name the specific gaps " +
    "the answers revealed.",
  input_schema: {
    type: "object",
    properties: {
      overall: {
        type: "integer",
        description:
          "An integer 0–100. 0 when the answers are absent or show no " +
          "understanding; 100 when every answer is correct, specific, and " +
          "interview-ready. Unanswered questions count against the score.",
        minimum: MIN_SCORE,
        maximum: MAX_SCORE,
      },
      perQuestion: {
        type: "array",
        description:
          "Per-question score breakdown. One entry per question, identified " +
          "by its questionId. Each per-question score is an integer 0–100.",
        items: {
          type: "object",
          properties: {
            questionId: {
              type: "string",
              description:
                "The id of the question this per-question score is for — " +
                "must match a question in the fixed input set.",
            },
            score: {
              type: "integer",
              description:
                "An integer 0–100 for this question alone. 0 when the " +
                "question was not answered or the answer showed no " +
                "understanding.",
              minimum: MIN_SCORE,
              maximum: MAX_SCORE,
            },
          },
          required: ["questionId", "score"],
        },
      },
      weakAreas: {
        type: "array",
        description:
          "The areas of understanding the answers were weak on — one entry " +
          "per distinct gap. Empty only when the answers had no weak areas. " +
          "An unanswered question must surface here as a weak area.",
        items: {
          type: "object",
          properties: {
            area: {
              type: "string",
              description:
                "A short label for the weak area, e.g. data-flow or the id " +
                "of the question that exposed the gap.",
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
    required: ["overall", "perQuestion", "weakAreas"],
  },
}

const SYSTEM_PROMPT =
  "You are a coding coach grading a job-seeking junior developer's " +
  "understanding check for a GitHub issue (or CCPM task) they are learning " +
  "to defend. You are given a FIXED set of understanding questions and the " +
  "user's free-text answers. Judge how well the answers prove the user " +
  "genuinely understands the issue and could explain and defend the work in " +
  "an interview.\n\n" +
  "Grade only the answers against the questions — do not invent new " +
  "questions and do not reason about code you were not shown. Be fair but " +
  "honest: a vague, generic, or AI-sounding answer that does not show real " +
  "understanding is weak. An unanswered or empty answer shows no " +
  "understanding of that question and must count against both its " +
  "per-question score and the overall score, AND surface as a weak area.\n\n" +
  "Return an integer overall score 0–100, a per-question score breakdown " +
  "covering every question in the input set, and a weak-area breakdown " +
  "naming the specific gaps the answers revealed. If the user answered " +
  "nothing, the overall score is 0, every per-question score is 0, and " +
  "every question is a weak area. Call submit_grading exactly once."

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
function buildGradingPrompt(input: GradeLearningUnitInput): string {
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
      ? "\n\nThe user answered none of the questions. Set overall to 0, every " +
        "per-question score to 0, and list every question as a weak area."
      : answeredCount < input.questions.length
        ? `\n\nThe user answered ${answeredCount} of ` +
          `${input.questions.length} questions. Treat each unanswered ` +
          "question as a clear miss with a per-question score of 0 and a " +
          "weak-area entry."
        : ""

  return (
    `Grade the user's understanding check below. There ${
      input.questions.length === 1
        ? "is 1 question"
        : `are ${input.questions.length} questions`
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
 * Validate and coerce a `submit_grading` tool input into an
 * {@link UnderstandingScore} plus a {@link LearningWeakArea} list. Returns
 * `null` when the input is not a usable grading object (so the caller fails
 * with `no_structured_output`). A non-numeric or out-of-range score is coerced
 * rather than rejected, and malformed per-question / weak-area entries are
 * dropped — grading must always yield a number.
 *
 * Exported so tests can exercise the parse boundary directly, mirroring
 * `parseGradingContent` in the M8 diff-review grading call.
 */
export function parseGradingContent(
  input: unknown,
): { score: UnderstandingScore; weakAreas: LearningWeakArea[] } | null {
  if (typeof input !== "object" || input === null) return null
  const record = input as Record<string, unknown>

  if (typeof record.overall !== "number") return null
  const overall = clampScore(record.overall)

  const perQuestion = Array.isArray(record.perQuestion)
    ? record.perQuestion.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return []
        const p = raw as Record<string, unknown>
        const questionId = str(p.questionId)
        if (!questionId) return []
        if (typeof p.score !== "number") return []
        return [{ questionId, score: clampScore(p.score) }]
      })
    : []

  const weakAreas: LearningWeakArea[] = Array.isArray(record.weakAreas)
    ? record.weakAreas.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return []
        const w = raw as Record<string, unknown>
        const area = str(w.area)
        const detail = str(w.detail)
        return area && detail ? [{ area, detail }] : []
      })
    : []

  return { score: { overall, perQuestion }, weakAreas }
}

// --- The bounded call ------------------------------------------------------

/**
 * Grade a user's answers to a learning unit's understanding questions
 * (PRD FR-5, Issue #134).
 *
 * Makes a single bounded tool-use call on the `@workspace/ai` client: the
 * model is given the FIXED question set and the user's answers, and is forced
 * to return the grade through `submit_grading`. There is no tool loop — the
 * call always terminates in one turn with structured output or a typed
 * failure.
 *
 * The returned {@link GradeLearningUnitData.score} and
 * {@link GradeLearningUnitData.weakAreas} are ready to hand straight to the
 * {@link import("./units").recordScore} data-access function (#135) to
 * persist. The user's answers are carried through verbatim on
 * {@link GradeLearningUnitData.answers} for the integration layer to persist
 * via {@link import("./units").recordAnswers}.
 *
 * Partial or empty answer sets are graded, never rejected — an empty set
 * yields a zero score and one "no answer provided" weak-area entry per
 * question (NFR Resilient). The call only fails when the unit had no
 * questions to grade, when the LLM transport fails, or when the model returns
 * no usable structured grade.
 *
 * **R6:** strictly per-unit — no aggregate rollup, no cross-unit averaging.
 * M10 owns any cross-unit rollup.
 */
export async function gradeLearningUnit(
  input: GradeLearningUnitInput,
): Promise<GradeLearningUnitResult> {
  const { questions, answers } = input

  if (questions.length === 0) {
    return {
      ok: false,
      error: new GradeLearningUnitError(
        "no_questions",
        "The learning unit has no understanding questions to grade.",
      ),
    }
  }

  // Empty / blank answer sets are graded locally without an SDK call — the
  // outcome is fully determined (score 0; one "no answer provided" weak area
  // per question), so spending tokens on it would be wasteful and would break
  // the NFR Reproducible promise that a zero-answer attempt always grades the
  // same way (NFR Resilient).
  const answeredQuestionIds = new Set(
    answers
      .filter((answer) => str(answer.answer))
      .map((answer) => answer.questionId),
  )
  if (answeredQuestionIds.size === 0) {
    return {
      ok: true,
      data: {
        score: {
          overall: 0,
          perQuestion: questions.map((question) => ({
            questionId: question.id,
            score: 0,
          })),
        },
        weakAreas: questions.map((question) => ({
          area: question.id,
          detail: "no answer provided",
        })),
        answers,
      },
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
      error: new GradeLearningUnitError(
        "llm_error",
        `The learning-unit grading call failed: ${result.error.message}`,
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
      error: new GradeLearningUnitError(
        "no_structured_output",
        "The model ended its turn without submitting a grade.",
      ),
    }
  }

  const parsed = parseGradingContent(submission.input)
  if (!parsed) {
    return {
      ok: false,
      error: new GradeLearningUnitError(
        "no_structured_output",
        "The model's submitted grade was empty or malformed.",
      ),
    }
  }

  // Fill any per-question gaps with an explicit zero so the score's
  // `perQuestion` covers every question in the input set — the persistence
  // shape promises one entry per question and downstream UI relies on it.
  // Per-question entries that name a questionId not in the input set are
  // dropped: grading is keyed to the FIXED input contract.
  const perQuestionById = new Map(
    parsed.score.perQuestion.map((entry) => [entry.questionId, entry.score]),
  )
  const completePerQuestion = questions.map((question) => {
    const modelScore = perQuestionById.get(question.id)
    return {
      questionId: question.id,
      score: typeof modelScore === "number" ? modelScore : 0,
    }
  })

  // Surface any unanswered questions in the weak-area breakdown without
  // duplicating an entry the model already produced for the same question id.
  // The model is *asked* to do this, but we backfill so a partial answer set
  // is never silently let off the hook (NFR Fair grading).
  const weakAreaKeys = new Set(parsed.weakAreas.map((w) => w.area))
  const backfilledWeakAreas: LearningWeakArea[] = [...parsed.weakAreas]
  for (const question of questions) {
    if (answeredQuestionIds.has(question.id)) continue
    if (weakAreaKeys.has(question.id)) continue
    backfilledWeakAreas.push({
      area: question.id,
      detail: "no answer provided",
    })
  }

  return {
    ok: true,
    data: {
      score: {
        overall: parsed.score.overall,
        perQuestion: completePerQuestion,
      },
      weakAreas: backfilledWeakAreas,
      answers,
    },
  }
}
