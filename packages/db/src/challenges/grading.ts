// The bounded Anthropic SDK call that grades a user's submission to one
// project-tied M9 debug / expansion challenge
// (debug-expansion-challenge PRD FR-5 / FR-6 / FR-7, Issue #143).
//
// `gradeChallenge` turns a stored {@link Challenge} (#142's typed model, cached
// in #140's `challenges` table) plus a user {@link ChallengeAttempt} (#140's
// `challenge_attempts` row — free-text explanation, optional per-file
// snippets, file paths) into a structured {@link ChallengeGradingResult}
// matching M8's grading shape exactly (R4): a 0-100 numeric score, the M8
// `WeakArea` breakdown, per-criterion results, and a short feedback paragraph.
//
// Per ADR 0005 it is a *bounded* prompt → structured-output call on the shared
// `@workspace/ai` (llm-foundation) client — **not LangChain**, **not an
// autonomous agent**. It is a single forced-tool submission with no tool loop:
// the call always terminates in one turn.
//
// Behavior contracts:
//   - **Explanation-only grading** (R3 / FR-7). The grader judges the user's
//     free-text explanation against the challenge's acceptance criteria. Per-
//     file snippets and the user's listed file paths are passed through to the
//     model as illustrative context only; the system prompt forbids scoring
//     snippet content for style, naming, or plausibility. Widening this
//     boundary would require a new ADR; this call does not widen it.
//   - **Same grading shape as M8** (R4 / FR-5). The pass threshold, the
//     `WeakArea` schema, and the score range are reused from M8's grading
//     call (`../diff/grade.ts`). The M9-specific additions —
//     {@link ChallengeCriterionResult} per criterion and a short feedback
//     paragraph — sit on top of M8's shape, not in place of it.
//   - **Integrity check on every output** (R8 / FR-6). The grading output's
//     per-criterion paths and any path-shaped tokens in the feedback prose
//     are validated against the M6 project map by
//     {@link verifyChallengeIntegrity}. Rejection throws
//     {@link ChallengeGradingIntegrityError} — rejected outputs are not
//     silently swallowed and not persisted.
//   - **Per-attempt persistence** (US-6 / FR-9). The validated grading result
//     is written onto the attempt row via #140's
//     {@link gradeChallengeAttempt} data-access function. Multiple attempts
//     per challenge each carry their own grading; the latest attempt's
//     grading is the one surfaced as the challenge's current outcome.
//   - **Resilient to short / empty / off-topic submissions** (NFR Resilient).
//     The grader never throws on an empty or partial submission: the prompt
//     names every acceptance criterion and instructs the model to produce a
//     low score plus a complete weak-area / per-criterion breakdown when the
//     explanation does not show understanding.
//   - **Does NOT execute / build / lint / test user code** (FR-7). The grader
//     is text-only — it does not run the user's snippets, does not invoke a
//     build, and does not claim "this passes". Verdicts are about whether
//     the *explanation* satisfied the *criterion*, never about whether the
//     code "works".
//
// Style mirrors M8's `../diff/grade.ts` (Issue #113): a single forced-tool
// submission, a discriminated {@link GradeChallengeResult} for expected
// boundary failures (no challenge, no attempt, LLM transport failure, no
// structured output), and a thrown typed error for the integrity violation
// (integrity is a hard contract past which a candidate may not be persisted —
// mirrors the M9 generation call's {@link ChallengeIntegrityError}).

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient, type LlmClient, type LlmError } from "@workspace/ai"

import type { CatalogDb } from "../client"
import { getProjectMap } from "../mapper/project-maps"
import { createObservedLlmClient, recordEval } from "../observability/record"
import type {
  Challenge,
  ChallengeAcceptanceCriterion,
  ChallengeAttempt,
  ChallengeAttemptSnippet,
  ChallengeCriterionResult,
  ChallengeGradingResult,
  ProjectMap,
  WeakArea,
} from "../schema"
import {
  getChallengeById,
  gradeChallengeAttempt,
} from "./challenges"
import {
  verifyChallengeIntegrity,
  type CandidateGrading,
  type IntegrityCheckResult,
  type PerCriterionResult,
} from "./integrity-check"

/** Output-token cap — the grading payload is small and structured. */
const GRADE_MAX_TOKENS = 2048

/** Bounds on the score the model may return — grading is 0–100 (R4 / FR-5). */
const MIN_SCORE = 0
const MAX_SCORE = 100

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

/** The distinct boundary-failure modes {@link gradeChallenge} recognizes. */
export type GradeChallengeErrorKind =
  /** The challenge id did not resolve to a row. */
  | "challenge_not_found"
  /** The snapshot the challenge is tied to has no M6 project map. */
  | "project_map_not_found"
  /** The underlying LLM call failed — carries the mapped {@link LlmError}. */
  | "llm_error"
  /** The model never returned a usable structured grading. */
  | "no_structured_output"

/** A typed boundary failure from {@link gradeChallenge}. */
export class GradeChallengeError extends Error {
  readonly kind: GradeChallengeErrorKind
  /** The underlying LLM error, when `kind` is `llm_error`. */
  readonly cause?: LlmError

  constructor(
    kind: GradeChallengeErrorKind,
    message: string,
    cause?: LlmError,
  ) {
    super(message)
    this.name = "GradeChallengeError"
    this.kind = kind
    if (cause) this.cause = cause
  }
}

/**
 * Thrown when a grading output fails the file-reference integrity check
 * (R8 / FR-6). This is a hard failure — the candidate is **not** persisted
 * onto the attempt, and the caller surfaces the failure rather than silently
 * swallowing a bad output (FR-6).
 *
 * Distinct from {@link GradeChallengeError} (returned in the discriminated
 * result) because integrity is a contract the grader owes its caller, not an
 * expected boundary failure: a grader that fabricated an unmapped file
 * reference is itself buggy. Mirrors the generation call's
 * {@link import("./generation").ChallengeIntegrityError}.
 */
export class ChallengeGradingIntegrityError extends Error {
  /** The result returned by {@link verifyChallengeIntegrity}. */
  readonly integrity: IntegrityCheckResult
  /** The challenge id whose grading failed integrity. */
  readonly challengeId: number
  /** The attempt id whose grading failed integrity. */
  readonly attemptId: number
  /** The grading candidate that failed — for diagnostics, never persisted. */
  readonly candidate: ChallengeGradingResult

  constructor(
    challengeId: number,
    attemptId: number,
    candidate: ChallengeGradingResult,
    integrity: IntegrityCheckResult,
  ) {
    const paths = integrity.unresolved.map((u) => u.path).join(", ")
    super(
      `Grading for challenge ${challengeId} attempt ${attemptId} referenced ` +
        `file path(s) not named by the M6 project map: ${paths}. ` +
        `R8 forbids adjacent-file inference; the grading is rejected.`,
    )
    this.name = "ChallengeGradingIntegrityError"
    this.challengeId = challengeId
    this.attemptId = attemptId
    this.candidate = candidate
    this.integrity = integrity
  }
}

// ---------------------------------------------------------------------------
// Input / Result
// ---------------------------------------------------------------------------

/** Input for {@link gradeChallenge}. */
export interface GradeChallengeInput {
  /**
   * The stored challenge the attempt is against. Provides the acceptance
   * criteria the grader judges the explanation against, the in-/out-of-scope
   * file sets the explanation is bounded by, and the snapshot id used to load
   * the M6 project map for integrity checking.
   */
  challenge: Challenge
  /**
   * The user's submission to grade. The grader scores
   * {@link ChallengeAttempt.explanation} only (R3 / FR-7) — snippets and
   * filePaths are passed to the model as illustrative context but the system
   * prompt forbids scoring them for style, naming, or plausibility.
   */
  attempt: ChallengeAttempt
  /**
   * LLM client to run the call on. Injectable so tests pass a client built on
   * the `@workspace/ai/testing` mock transport — CI runs with no API key and
   * makes no live calls. Omitted → a real client built from `ANTHROPIC_API_KEY`.
   */
  client?: LlmClient
  /** Catalog DB. Injectable for tests; omitted → the package-local default. */
  db?: CatalogDb
}

/** The successful payload of a grading call. */
export interface GradeChallengeData {
  /** The persisted attempt row with `grading` filled in. */
  attempt: ChallengeAttempt
  /** The validated grading result that was written onto the attempt. */
  grading: ChallengeGradingResult
}

/**
 * The discriminated result of {@link gradeChallenge} — never thrown for
 * boundary failures. Integrity failures throw
 * {@link ChallengeGradingIntegrityError}.
 */
export type GradeChallengeResult =
  | { ok: true; data: GradeChallengeData }
  | { ok: false; error: GradeChallengeError }

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

/** Tool the model is forced to call exactly once to return the grading. */
const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_grading",
  description:
    "Submit the final, structured grading for the user's explanation of the " +
    "challenge. Call this exactly once. The score is an integer 0-100 " +
    "reflecting how well the explanation proves the user could defend the " +
    "change in an interview; weakAreas name the specific gaps the " +
    "explanation revealed; criterionResults answer each acceptance criterion " +
    "in turn; feedback is a short paragraph the UI shows the user.",
  input_schema: {
    type: "object",
    properties: {
      score: {
        type: "integer",
        description:
          "An integer 0-100. 0 when the explanation is absent or shows no " +
          "understanding; 100 when it covers every acceptance criterion " +
          "specifically and is interview-ready. An empty or off-topic " +
          "explanation must score low — never claim 'this passes'.",
        minimum: MIN_SCORE,
        maximum: MAX_SCORE,
      },
      weakAreas: {
        type: "array",
        description:
          "The areas of understanding the explanation was weak on - one " +
          "entry per distinct gap. Empty only when the explanation had no " +
          "weak areas.",
        items: {
          type: "object",
          properties: {
            area: {
              type: "string",
              description:
                "A short label for the weak area, e.g. migration-step or the " +
                "id of the acceptance criterion that exposed the gap.",
            },
            detail: {
              type: "string",
              description:
                "Why this area was judged weak, in plain language, " +
                "referencing what the explanation was missing.",
            },
          },
          required: ["area", "detail"],
        },
      },
      criterionResults: {
        type: "array",
        description:
          "One entry per acceptance criterion the challenge defines, in the " +
          "same order. Each result names the criterion by id, says whether " +
          "the explanation satisfied it, and gives a short reason.",
        items: {
          type: "object",
          properties: {
            criterionId: {
              type: "string",
              description:
                "The acceptance-criterion id this result responds to.",
            },
            passed: {
              type: "boolean",
              description:
                "True iff the explanation satisfied this criterion. Never " +
                "claim a code change 'passes' — only that the EXPLANATION " +
                "covered the criterion.",
            },
            detail: {
              type: "string",
              description:
                "Plain-language note on why this criterion did or did not " +
                "pass, citing what the explanation said or omitted.",
            },
          },
          required: ["criterionId", "passed", "detail"],
        },
      },
      feedback: {
        type: "string",
        description:
          "A short plain-language feedback paragraph the UI shows the user. " +
          "Any file path you mention here MUST be a path the M6 project map " +
          "explicitly names — no adjacent-file inference.",
      },
    },
    required: ["score", "weakAreas", "criterionResults", "feedback"],
  },
}

const SYSTEM_PROMPT =
  "You are a coding coach grading a job-seeking junior developer's " +
  "explanation of how they would tackle a project-tied debug or expansion " +
  "challenge in their own repository. The user built the project with heavy " +
  "AI assistance and must defend it in interviews.\n\n" +
  "You are given a FIXED challenge (task description, in-scope and " +
  "out-of-scope file sets, acceptance criteria) and the user's submission. " +
  "The submission has THREE parts: a free-text explanation (the GRADED " +
  "artifact), optional per-file code snippets, and a list of file paths the " +
  "user said they would change. Judge whether the explanation proves the " +
  "user understands the change and could defend it in an interview.\n\n" +
  "Hard rules:\n" +
  "- Grade the user's EXPLANATION ONLY against the acceptance criteria. Do " +
  "  NOT score the snippets for style, naming, plausibility, or whether the " +
  "  code 'works' — snippets are illustrative context. Do NOT score the " +
  "  file-path list for completeness; it is illustrative.\n" +
  "- Do NOT execute, build, lint, or test any code. You cannot run the " +
  "  user's snippets and you cannot claim 'this passes'. Verdicts are about " +
  "  whether the EXPLANATION satisfied the CRITERION.\n" +
  "- An empty, vague, generic, AI-sounding, or off-topic explanation must " +
  "  score low and produce a full weak-area / per-criterion breakdown — " +
  "  never crash, never refuse to grade.\n" +
  "- Every file path you mention in feedback prose MUST be a path the M6 " +
  "  project map explicitly names (either in the in-scope or out-of-scope " +
  "  set). Adjacent-file inference (test files, .d.ts files, index.ts " +
  "  barrels, sibling types) is FORBIDDEN.\n" +
  "- Return one entry in criterionResults per acceptance criterion, in the " +
  "  same order, using the criterion's id verbatim.\n\n" +
  "Call submit_grading exactly once."

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Clamp a score to the 0–100 integer range grading is defined over. */
function clampScore(value: number): number {
  if (!Number.isFinite(value)) return MIN_SCORE
  const rounded = Math.round(value)
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, rounded))
}

/**
 * Build the user prompt: the challenge (task description, in/out-of-scope
 * sets, every acceptance criterion) followed by the user's submission
 * (explanation as the graded artifact; snippets and file-paths labelled
 * "illustrative — DO NOT GRADE"). The acceptance criteria drive the order so
 * a partial or off-topic explanation is graded as a set of misses rather
 * than silently shrinking the criterion set.
 */
function buildGradingPrompt(input: GradeChallengeInput): string {
  const { challenge, attempt } = input

  const inScopeLines = challenge.inScopeFiles.length
    ? challenge.inScopeFiles.map((p) => `- ${p}`).join("\n")
    : "(none)"
  const outOfScopeLines = challenge.outOfScopeFiles.length
    ? challenge.outOfScopeFiles.map((p) => `- ${p}`).join("\n")
    : "(none)"
  const criteriaLines = challenge.acceptanceCriteria.length
    ? challenge.acceptanceCriteria
        .map(
          (c: ChallengeAcceptanceCriterion, i: number) =>
            `${i + 1}. (id: ${c.id}) ${c.detail}`,
        )
        .join("\n")
    : "(none)"

  const explanation = str(attempt.explanation)
  const snippetsBlock =
    attempt.snippets.length === 0
      ? "(none)"
      : attempt.snippets
          .map(
            (s: ChallengeAttemptSnippet) =>
              `### Snippet for ${s.path}\n\`\`\`\n${s.code}\n\`\`\``,
          )
          .join("\n\n")
  const filePathsLine =
    attempt.filePaths.length === 0
      ? "(none)"
      : attempt.filePaths.map((p) => `- ${p}`).join("\n")

  const coverageNote =
    explanation === null
      ? "\n\nThe user submitted no explanation. Score low and list every " +
        "acceptance criterion as a weak area / failed criterion."
      : ""

  return (
    `Grade the user's submission below. There ${
      challenge.acceptanceCriteria.length === 1
        ? "is 1 acceptance criterion"
        : `are ${challenge.acceptanceCriteria.length} acceptance criteria`
    }.\n\n` +
    `## Challenge type\n${challenge.type}\n\n` +
    `## Task description\n${challenge.taskDescription}\n\n` +
    `## In-scope files (the only paths grading may name)\n${inScopeLines}\n\n` +
    `## Out-of-scope files (also M6-named)\n${outOfScopeLines}\n\n` +
    `## Acceptance criteria (judge the explanation against each)\n${criteriaLines}\n\n` +
    `## User's explanation (THE GRADED ARTIFACT)\n` +
    `${explanation ?? "(no explanation given)"}\n\n` +
    `## User's snippets (illustrative — DO NOT GRADE for style/naming/plausibility)\n${snippetsBlock}\n\n` +
    `## User's listed file paths (illustrative — DO NOT GRADE)\n${filePathsLine}` +
    `${coverageNote}\n\n` +
    `Judge the EXPLANATION against the CRITERIA, then call submit_grading ` +
    `exactly once.`
  )
}

/**
 * Validate and coerce a `submit_grading` tool input into a
 * {@link ChallengeGradingResult}. Returns `null` when the input is not a
 * usable grading object (so the caller fails with `no_structured_output`).
 * A non-numeric or out-of-range score is coerced rather than rejected, and
 * malformed entries inside the per-criterion / weak-area lists are dropped —
 * grading must always yield a number.
 *
 * Exported so tests can exercise the parse boundary directly, mirroring
 * `parseGradingContent` in `../diff/grade.ts` (#113).
 */
export function parseGradingContent(
  input: unknown,
): ChallengeGradingResult | null {
  if (typeof input !== "object" || input === null) return null
  const record = input as Record<string, unknown>

  if (typeof record.score !== "number") return null
  const score = clampScore(record.score)

  const weakAreas: WeakArea[] = Array.isArray(record.weakAreas)
    ? record.weakAreas.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return []
        const w = raw as Record<string, unknown>
        const area = str(w.area)
        const detail = str(w.detail)
        return area && detail ? [{ area, detail }] : []
      })
    : []

  const criterionResults: ChallengeCriterionResult[] = Array.isArray(
    record.criterionResults,
  )
    ? record.criterionResults.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return []
        const c = raw as Record<string, unknown>
        const criterionId = str(c.criterionId)
        const detail = str(c.detail)
        if (!criterionId || typeof c.passed !== "boolean" || !detail) {
          return []
        }
        return [{ criterionId, passed: c.passed, detail }]
      })
    : []

  const feedback = str(record.feedback) ?? ""

  return { score, weakAreas, criterionResults, feedback }
}

/**
 * Build the {@link CandidateGrading} the integrity check (#141) expects from
 * a parsed grading result. The shape is the integrity module's narrow input
 * contract; the grading result has no per-criterion `paths` field of its own
 * (the schema's {@link ChallengeCriterionResult} carries `criterionId` /
 * `passed` / `detail` only), so the only path-bearing surface is the
 * `feedback` prose. Path-shaped tokens in `detail` strings are not extracted
 * — the per-criterion `detail` is judged against the criterion itself and
 * the M6 boundary is enforced via the feedback paragraph that the UI shows.
 */
function toIntegrityCandidate(
  grading: ChallengeGradingResult,
): CandidateGrading {
  const perCriterion: PerCriterionResult[] = grading.criterionResults.map(
    (c) => ({
      criterionId: c.criterionId,
      verdict: c.passed ? "passed" : "missed",
    }),
  )
  return {
    kind: "grading",
    perCriterion,
    feedback: grading.feedback,
  }
}

// ---------------------------------------------------------------------------
// The bounded call
// ---------------------------------------------------------------------------

/**
 * Grade a user's submission to one M9 challenge
 * (PRD FR-5 / FR-6 / FR-7, Issue #143).
 *
 * Makes a single bounded tool-use call on the `@workspace/ai` client: the
 * model is given the FIXED challenge plus the user's submission, and is
 * forced to return the grading through `submit_grading`. There is no tool
 * loop — the call always terminates in one turn with structured output or a
 * typed boundary failure.
 *
 * The function:
 *   1. Resolves the challenge row (re-reading by id so a stale in-memory
 *      challenge object cannot silently mismatch the persisted contract).
 *   2. Loads the M6 project map for the snapshot the challenge is tied to,
 *      used by the integrity check (R8 / FR-6).
 *   3. Runs the bounded SDK call (ADR 0005).
 *   4. Parses the submission into a {@link ChallengeGradingResult}.
 *   5. Verifies the grading against the M6 map via
 *      {@link verifyChallengeIntegrity}. On failure: throws
 *      {@link ChallengeGradingIntegrityError}, persists nothing.
 *   6. Persists via {@link gradeChallengeAttempt} and returns the updated
 *      attempt row.
 *
 * Partial / empty / off-topic submissions are graded, never rejected (NFR
 * Resilient). The call only returns a boundary failure when the challenge id
 * does not resolve, the snapshot has no M6 project map, the LLM transport
 * fails, or the model returns no usable structured grading.
 */
export async function gradeChallenge(
  input: GradeChallengeInput,
): Promise<GradeChallengeResult> {
  const { db } = input

  // 1. Resolve the challenge row by id so the persisted contract is the one
  //    we ground the grader in (and so the snapshotId we look up the project
  //    map by is the persisted one).
  const challenge = await getChallengeById(input.challenge.id, db)
  if (!challenge) {
    return {
      ok: false,
      error: new GradeChallengeError(
        "challenge_not_found",
        `No challenge row for id ${input.challenge.id}. ` +
          `The challenge may have been regenerated or deleted.`,
      ),
    }
  }

  // 2. Load the M6 project map for the integrity check. The map is the
  //    authoritative M6-named file set (R8 / FR-6).
  const projectMap: ProjectMap | null = await getProjectMap(
    challenge.snapshotId,
    db,
  )
  if (!projectMap) {
    return {
      ok: false,
      error: new GradeChallengeError(
        "project_map_not_found",
        `Snapshot ${challenge.snapshotId} has no M6 project map. ` +
          `Generate the project map before grading.`,
      ),
    }
  }

  // 3. Bounded SDK call — forced single submission, no tool loop.
  //    Observability (M13): record a trace + integrity eval when a db is
  //    available. Best-effort and non-blocking — when `db` is omitted the call
  //    runs exactly as before (no wrapping, no trace).
  const baseClient = input.client ?? createLlmClient()
  const observed = db
    ? createObservedLlmClient(baseClient, {
        traceName: "m9.grade-challenge",
        snapshotId: challenge.snapshotId,
        db,
      })
    : null
  const client = observed ?? baseClient
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: buildGradingPrompt({ ...input, challenge }),
    },
  ]

  const result = await client.complete({
    system: SYSTEM_PROMPT,
    cacheSystem: true,
    messages,
    maxTokens: GRADE_MAX_TOKENS,
    tools: [SUBMIT_TOOL],
    toolChoice: { type: "tool", name: SUBMIT_TOOL.name },
  })

  if (!result.ok) {
    return {
      ok: false,
      error: new GradeChallengeError(
        "llm_error",
        `The challenge grading call failed: ${result.error.message}`,
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
      error: new GradeChallengeError(
        "no_structured_output",
        "The model ended its turn without submitting a grading.",
      ),
    }
  }

  // 4. Parse.
  const parsed = parseGradingContent(submission.input)
  if (!parsed) {
    return {
      ok: false,
      error: new GradeChallengeError(
        "no_structured_output",
        "The model's submitted grading was empty or malformed.",
      ),
    }
  }

  // 5. Integrity check (R8 / FR-6). Throws on rejection — rejected outputs
  //    are NOT silently swallowed (FR-6) and NOT persisted.
  const integrity = verifyChallengeIntegrity(
    toIntegrityCandidate(parsed),
    projectMap,
  )
  if (!integrity.ok) {
    if (observed) {
      recordEval(
        observed,
        {
          check: "challenge-grading-integrity",
          passed: false,
          reason: `unresolved file references: ${integrity.unresolved
            .map((u) => u.path)
            .join(", ")}`,
        },
        db,
      )
    }
    throw new ChallengeGradingIntegrityError(
      challenge.id,
      input.attempt.id,
      parsed,
      integrity,
    )
  }
  if (observed) {
    recordEval(
      observed,
      { check: "challenge-grading-integrity", passed: true },
      db,
    )
  }

  // 6. Persist onto the attempt row via #140's DAL.
  const updated = await gradeChallengeAttempt(input.attempt.id, parsed, db)
  if (!updated) {
    // The attempt row vanished between submission and grading — treat as a
    // boundary failure so the caller can surface the issue cleanly rather
    // than crash on a null deref.
    return {
      ok: false,
      error: new GradeChallengeError(
        "challenge_not_found",
        `No attempt row for id ${input.attempt.id}. ` +
          `The attempt may have been deleted before grading completed.`,
      ),
    }
  }

  return { ok: true, data: { attempt: updated, grading: parsed } }
}
