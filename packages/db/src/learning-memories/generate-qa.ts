// The bounded Anthropic SDK call that generates the interview Q&A pack
// (learning-memory-portfolio-export PRD FR-2, Issue #180).
//
// `generateInterviewQA` turns an imported snapshot's M5/M6/M7/M8/M9 rows into
// a typed {@link InterviewQA[]} covering the five "ground areas" the M10 PRD
// names: stack (M5), architecture (M6), per-issue learning (M7), diff / risk
// reading (M8), and debug / expansion reasoning (M9). Each item carries a
// `groundArea`, an interview-style question phrased about *this* repo, an
// answer grounded in real rows, and the `sourceReferences` it cites.
//
// Per ADR 0005 it is a *bounded* prompt → structured-output call on the
// shared `@workspace/ai` (llm-foundation) client — **not LangChain**, **not
// an autonomous agent**. It is bounded three ways: a fixed six-tool set, a
// hard iteration cap (≤ 6 turns), and a forced structured-output submission
// on the final turn. The model may call five `read_*` tools to inspect the
// rows of each ground area, then returns the pack through
// `submit_interview_qa`.
//
// Behaviour contracts:
//   - **Ground-area skipping** (PRD FR-2, M10 PRD NFR-5). When a ground area
//     has no source rows (e.g. no `challenge_attempts` exist), the system
//     prompt instructs the model to *skip* that area rather than fabricate
//     one. The result is an `InterviewQA[]` with that area omitted — never a
//     soft-generic ("explain Next.js") question.
//   - **Integrity-rejection** (PRD NFR-5). Every generated item runs through
//     {@link checkArtifactIntegrity} (Issue #177) before being returned. A
//     `sourceReferences` entry that names a file outside the M6 key-file map
//     or a technology outside the M5 stack `tools` list **rejects** the pack
//     — the function throws {@link InterviewQAIntegrityError} carrying the
//     missing-references list. The candidate is **not** softened.
//   - **No persistence here.** This task generates + integrity-checks only;
//     the caller (task #184) persists through `upsertMemory`.
//
// Mirrors the M7 (`../learning-units/generate.ts`) + M8
// (`../diff/review.ts`) + M9 (`../challenges/generation.ts`) bounded-SDK-call
// shape so consumers learn one pattern across milestones.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient, type LlmClient, type LlmError } from "@workspace/ai"

import type { CatalogDb } from "../client"
import {
  getChallengeById,
  listChallengeAttempts,
  listChallengesBySnapshot,
} from "../challenges/challenges"
import { getDiffReview, listDiffReviews } from "../diff/reviews"
import { listLearningUnits } from "../learning-units/units"
import { getProjectMap } from "../mapper/project-maps"
import type {
  Challenge,
  ChallengeAttempt,
  DiffReview,
  InterviewQA,
  LearningUnit,
  ProjectMap,
  StackExplanation,
} from "../schema"
import { getStackExplanation } from "../stack/explanations"
import { type IntegrityResult } from "./integrity"

/**
 * Hard cap on prompt → response round-trips. The model needs turns to read
 * the five ground areas' rows and one to submit; the cap keeps a misbehaving
 * call bounded (ADR 0005) — the final turn forces the submission tool, so the
 * call always terminates.
 */
const MAX_ITERATIONS = 6

/** Output-token cap — the Q&A pack is larger than a chat reply. */
const GENERATE_MAX_TOKENS = 4096

/** The five ground areas the M10 PRD names — surfaced for the system prompt + parsing. */
const GROUND_AREAS = [
  "stack",
  "architecture",
  "issue-learning",
  "diff-review",
  "debug-expansion",
] as const

type GroundArea = (typeof GROUND_AREAS)[number]

const GROUND_AREA_SET = new Set<string>(GROUND_AREAS)

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

/** The distinct failure modes {@link generateInterviewQA} recognizes. */
export type GenerateInterviewQAErrorKind =
  /** The underlying LLM call failed — carries the mapped {@link LlmError}. */
  | "llm_error"
  /** The model never returned a usable structured pack. */
  | "no_structured_output"

/** A typed failure from {@link generateInterviewQA}. */
export class GenerateInterviewQAError extends Error {
  readonly kind: GenerateInterviewQAErrorKind
  /** The underlying LLM error, when `kind` is `llm_error`. */
  readonly cause?: LlmError

  constructor(
    kind: GenerateInterviewQAErrorKind,
    message: string,
    cause?: LlmError,
  ) {
    super(message)
    this.name = "GenerateInterviewQAError"
    this.kind = kind
    if (cause) this.cause = cause
  }
}

/**
 * Thrown when a generated Q&A pack fails the file + stack reference integrity
 * check (PRD NFR-5). This is a hard failure — the candidate is **not**
 * returned to the caller (so callers cannot accidentally persist a softened
 * result), and the caller surfaces the failure rather than silently
 * swallowing a bad output.
 *
 * Distinct from {@link GenerateInterviewQAError} (returned via `throw` rather
 * than discriminated result) because, like M9's integrity error, this is the
 * generator owing the caller a contract: a Q&A pack that cited an off-map
 * file or off-stack technology is itself buggy.
 */
export class InterviewQAIntegrityError extends Error {
  /** The integrity-check result — `ok: false` with the `missing` list. */
  readonly integrity: Extract<IntegrityResult, { ok: false }>
  /** The (rejected) candidate the model produced — for diagnostics only. */
  readonly candidate: InterviewQA[]

  constructor(
    candidate: InterviewQA[],
    integrity: Extract<IntegrityResult, { ok: false }>,
  ) {
    super(
      `Generated interview Q&A pack rejected: ${integrity.missing.length} ` +
        `reference(s) do not resolve to the M6 project map or the M5 ` +
        `stack explanation (${integrity.missing.join(", ")}). ` +
        `PRD NFR-5 forbids softening — the candidate is rejected.`,
    )
    this.name = "InterviewQAIntegrityError"
    this.integrity = integrity
    this.candidate = candidate
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options for {@link generateInterviewQA}. */
export interface GenerateInterviewQAOptions {
  /**
   * LLM client to run the call on. Injectable so tests pass a client built on
   * the `@workspace/ai/testing` mock transport — CI runs with no API key and
   * makes no live calls. Omitted → a real client built from
   * `ANTHROPIC_API_KEY`.
   */
  client?: LlmClient
  /** Catalog DB. Injectable for tests; omitted → the package-local default. */
  db?: CatalogDb
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** Tool the model calls to read the M5 stack explanation for the snapshot. */
const READ_STACK_EXPLANATION_TOOL: Anthropic.Tool = {
  name: "read_stack_explanation",
  description:
    "Read the M5 `stack_explanations` row for this snapshot: the named " +
    "tools (with their project-specific purpose, alternatives, and " +
    "job-relevance), the key files M5 surfaced, and the debug entry " +
    "points. The technologies you may cite in `sourceReferences` are " +
    "exactly the tool names listed here. Returns 'not available' when " +
    "no stack explanation has been generated.",
  input_schema: {
    type: "object",
    properties: {},
  },
}

/** Tool the model calls to read the M6 project map for the snapshot. */
const READ_PROJECT_MAP_ENTRY_TOOL: Anthropic.Tool = {
  name: "read_project_map_entry",
  description:
    "Read the M6 `project_maps` row for this snapshot: the architecture " +
    "overview, the key-file map (the ONLY file paths you may cite in " +
    "`sourceReferences`), request/data flow, state flow, AI-call flow, and " +
    "the debug path. Returns 'not available' when no project map exists.",
  input_schema: {
    type: "object",
    properties: {},
  },
}

/** Tool the model calls to list / read M7 learning units. */
const READ_LEARNING_UNIT_TOOL: Anthropic.Tool = {
  name: "read_learning_unit",
  description:
    "Read M7 `learning_units` for this snapshot. With no arguments, " +
    "returns a compact list of every unit's `source`, `issueRef`, and " +
    "restated goal. With `issueRef`, returns the full unit: restated " +
    "goal, related files, concepts, agent execution notes, review " +
    "checklist, understanding questions, and any user score / weak " +
    "areas. Returns 'no learning units' when none have been generated.",
  input_schema: {
    type: "object",
    properties: {
      issueRef: {
        type: "string",
        description:
          "Optional issue / task identifier (e.g. '#42' or " +
          "'epic/foo/003') from a prior `read_learning_unit` listing call. " +
          "Omit to list every unit.",
      },
    },
  },
}

/** Tool the model calls to list / read M8 diff reviews. */
const READ_DIFF_REVIEW_TOOL: Anthropic.Tool = {
  name: "read_diff_review",
  description:
    "Read M8 `diff_reviews` for this snapshot. With no arguments, returns " +
    "a compact list of every review's `prNumber` + a one-line title. " +
    "With `pullNumber`, returns the full review: changed-file " +
    "explanations, core-logic explanation, risk analysis, test " +
    "suggestions, comprehension questions, and any user score / weak " +
    "areas. Returns 'no diff reviews' when none have been generated.",
  input_schema: {
    type: "object",
    properties: {
      pullNumber: {
        type: "integer",
        description:
          "Optional pull-request number from a prior `read_diff_review` " +
          "listing call. Omit to list every review.",
      },
    },
  },
}

/** Tool the model calls to list / read M9 challenge attempts. */
const READ_CHALLENGE_ATTEMPT_TOOL: Anthropic.Tool = {
  name: "read_challenge_attempt",
  description:
    "Read M9 `challenges` + `challenge_attempts` for this snapshot. With " +
    "no arguments, returns a compact list of every challenge's id, type, " +
    "and one-line task description (only challenges that have been " +
    "attempted at least once are listed). With `challengeId`, returns " +
    "the full challenge plus its attempts: task description, in/out-of-" +
    "scope files, acceptance criteria, source references, and each " +
    "attempt's explanation excerpt + grading result. Returns 'no " +
    "challenge attempts' when none exist.",
  input_schema: {
    type: "object",
    properties: {
      challengeId: {
        type: "integer",
        description:
          "Optional challenge id from a prior `read_challenge_attempt` " +
          "listing call. Omit to list every attempted challenge.",
      },
    },
  },
}

/** Tool the model calls exactly once to return the structured Q&A pack. */
const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_interview_qa",
  description:
    "Submit the final, structured interview Q&A pack. Call this exactly " +
    "once when the pack is complete. Every entry in `sourceReferences` " +
    "MUST be either a file path the M6 project map explicitly names " +
    "OR a technology name the M5 stack explanation's `tools` list names " +
    "— matching is case-sensitive. Generic-tutorial questions (e.g. " +
    "'explain Next.js' with no project-specific anchor) are forbidden; " +
    "every question must reference THIS repo. If a ground area has no " +
    "source rows, skip it entirely — do not fabricate a question for it.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description:
          "The interview Q&A items. At least one item per ground area " +
          "that has source rows; areas without source rows are omitted.",
        items: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description:
                "Interview-style question phrased about THIS repo — never " +
                "a generic tutorial question.",
            },
            answer: {
              type: "string",
              description:
                "The defendable answer grounded in real rows from prior " +
                "milestones — cites specific files / technologies.",
            },
            groundArea: {
              type: "string",
              enum: [
                "stack",
                "architecture",
                "issue-learning",
                "diff-review",
                "debug-expansion",
              ],
              description:
                "Which of the five ground areas the M10 PRD names this " +
                "Q&A covers.",
            },
            sourceReferences: {
              type: "array",
              description:
                "File paths (from the M6 project map) or stack " +
                "technology names (from the M5 stack explanation) the " +
                "answer cites. Matching is case-sensitive.",
              items: { type: "string" },
            },
          },
          required: ["question", "answer", "groundArea", "sourceReferences"],
        },
      },
    },
    required: ["items"],
  },
}

const SYSTEM_PROMPT =
  "You are a coding coach helping a job-seeking junior developer prepare " +
  "to defend a project they built with heavy AI assistance. Your job is " +
  "to produce an interview Q&A pack covering FIVE ground areas:\n" +
  "  1. stack          — choices and trade-offs from the M5 stack explanation;\n" +
  "  2. architecture   — layers, flows, and key files from the M6 project map;\n" +
  "  3. issue-learning — per-issue learning units from M7;\n" +
  "  4. diff-review    — pull-request review / risk reading from M8;\n" +
  "  5. debug-expansion — debug / expansion challenge reasoning from M9.\n\n" +
  "You are given five `read_*` tools to inspect this snapshot's M5/M6/M7/" +
  "M8/M9 rows, and `submit_interview_qa` to return the pack.\n\n" +
  "Hard rules:\n" +
  "- Questions must be phrased about THIS repo, not generic. 'Why does " +
  "  THIS project use Next.js Server Actions for the /portfolio handler' " +
  "  is acceptable; 'Explain Next.js' is REJECTED.\n" +
  "- Every `sourceReferences` entry MUST be either a file path the M6 " +
  "  project map's key-file list names, or a technology name the M5 stack " +
  "  explanation's tools list names. Matching is case-sensitive. " +
  "  Adjacent-file inference and case-mangled tool names (e.g. 'next.js' " +
  "  for 'Next.js') are FORBIDDEN — they will fail integrity.\n" +
  "- **Skip a ground area entirely** when its source rows are empty. " +
  "  If `read_challenge_attempt` returns 'no challenge attempts', do NOT " +
  "  produce a 'debug-expansion' Q&A — emit zero items for that area " +
  "  rather than fabricating one. Same rule for any other empty area.\n" +
  "- Aim for at least one strong Q&A per ground area that DOES have " +
  "  source rows. Two or three per area is fine.\n" +
  "- Read what you need to ground each answer in real code, then call " +
  "  `submit_interview_qa` exactly once."

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

/** A `string[]` of non-empty trimmed strings — anything else dropped. */
function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    const s = str(raw)
    return s ? [s] : []
  })
}

// ---------------------------------------------------------------------------
// Tool result renderers
// ---------------------------------------------------------------------------

/**
 * Render the M5 stack explanation as a tool-result payload. When `null`, the
 * tool returns the "not available" sentinel that instructs the model to skip
 * the stack ground area.
 */
function renderStackExplanation(stack: StackExplanation | null): string {
  if (!stack) {
    return (
      "not available — no M5 stack explanation exists for this snapshot. " +
      "Skip the 'stack' ground area rather than fabricating one."
    )
  }
  const tools = stack.tools.length
    ? stack.tools
        .map((t) => {
          const alts = t.alternatives
            .map((a) => `${a.name} (${a.tradeOff})`)
            .join("; ")
          return (
            `- ${t.name}: ${t.purpose}\n` +
            `  alternatives: ${alts || "(none)"}\n` +
            `  jobRelevance: ${t.jobRelevance}`
          )
        })
        .join("\n")
    : "(empty)"
  const keyFiles = stack.keyFiles.length
    ? stack.keyFiles.map((f) => `- ${f.path}: ${f.reason}`).join("\n")
    : "(empty)"
  const debug = stack.debugEntryPoints.length
    ? stack.debugEntryPoints
        .map((e) => `- ${e.location}: ${e.guidance}`)
        .join("\n")
    : "(empty)"
  return (
    `M5 stack explanation (tool names below are the AUTHORITATIVE stack set ` +
    `you may cite — case-sensitive):\n\n` +
    `## Tools\n${tools}\n\n` +
    `## Key files\n${keyFiles}\n\n` +
    `## Debug entry points\n${debug}`
  )
}

/** Render the M6 project map as a tool-result payload. */
function renderProjectMap(map: ProjectMap | null): string {
  if (!map) {
    return (
      "not available — no M6 project map exists for this snapshot. Skip " +
      "the 'architecture' ground area rather than fabricating one."
    )
  }
  const keyFiles = map.keyFileMap.length
    ? map.keyFileMap.map((f) => `- ${f.path}: ${f.role}`).join("\n")
    : "(empty)"
  const arch = map.architectureOverview.length
    ? map.architectureOverview.map((s) => `- ${s.title}: ${s.detail}`).join("\n")
    : "(empty)"
  const reqFlow = map.requestDataFlow.length
    ? map.requestDataFlow
        .map(
          (s) =>
            `  ${s.order}. ${s.description}` + (s.path ? ` (${s.path})` : ""),
        )
        .join("\n")
    : "(empty)"
  const stateFlow = map.stateFlow.length
    ? map.stateFlow
        .map(
          (s) =>
            `  ${s.order}. ${s.description}` + (s.path ? ` (${s.path})` : ""),
        )
        .join("\n")
    : "(empty)"
  const aiFlow = map.aiCallFlow.length
    ? map.aiCallFlow
        .map(
          (s) =>
            `  ${s.order}. ${s.description}` + (s.path ? ` (${s.path})` : ""),
        )
        .join("\n")
    : "(empty)"
  const debug = map.debugPath.length
    ? map.debugPath.map((s) => `- ${s.location}: ${s.guidance}`).join("\n")
    : "(empty)"
  return (
    `M6 project map (key-file paths below are the AUTHORITATIVE file set ` +
    `you may cite — case-sensitive):\n\n` +
    `## Key files\n${keyFiles}\n\n` +
    `## Architecture overview\n${arch}\n\n` +
    `## Request / data flow\n${reqFlow}\n\n` +
    `## State flow\n${stateFlow}\n\n` +
    `## AI-call flow\n${aiFlow}\n\n` +
    `## Debug path\n${debug}`
  )
}

/** Render one M7 unit as a tool-result payload. */
function renderLearningUnit(unit: LearningUnit): string {
  const relatedFiles = unit.relatedFiles
    .map((f) => `- ${f.path}: ${f.reason}`)
    .join("\n")
  const concepts = unit.concepts
    .map((c) => `- ${c.name}: ${c.explanation}`)
    .join("\n")
  const checklist = unit.reviewChecklist
    .map((c) => `- [${c.id}] ${c.description}`)
    .join("\n")
  const questions = unit.questions
    .map((q) => `- [${q.id}] ${q.prompt}`)
    .join("\n")
  const score = unit.score ? `${unit.score.overall}/100` : "(ungraded)"
  const weakAreas = unit.weakAreas?.length
    ? unit.weakAreas.map((w) => `- ${w.area}: ${w.detail}`).join("\n")
    : "(none)"
  return (
    `Learning unit (${unit.source} ${unit.issueRef}):\n` +
    `## Restated goal\n${unit.restatedGoal}\n\n` +
    `## Related files\n${relatedFiles || "(none)"}\n\n` +
    `## Concepts\n${concepts || "(none)"}\n\n` +
    `## Review checklist\n${checklist || "(none)"}\n\n` +
    `## Understanding questions\n${questions || "(none)"}\n\n` +
    `## Score\n${score}\n\n` +
    `## Weak areas\n${weakAreas}`
  )
}

/** Render the M7 learning-unit list (compact). */
function renderLearningUnitList(units: LearningUnit[]): string {
  if (units.length === 0) {
    return (
      "no learning units — no M7 `learning_units` rows exist for this " +
      "snapshot. Skip the 'issue-learning' ground area rather than " +
      "fabricating one."
    )
  }
  return (
    `${units.length} learning unit(s):\n` +
    units
      .map((u) => `- ${u.source} ${u.issueRef}: ${u.restatedGoal.slice(0, 80)}`)
      .join("\n") +
    `\n\nCall read_learning_unit again with issueRef to fetch the full unit.`
  )
}

/** Render one M8 diff review as a tool-result payload. */
function renderDiffReview(review: DiffReview): string {
  const changedFiles = review.changedFiles
    .map((c) => `- ${c.path}: ${c.explanation}`)
    .join("\n")
  const risks = review.riskAnalysis
    .map((r) => `- ${r.title}: ${r.detail}`)
    .join("\n")
  const tests = review.testSuggestions
    .map((t) => `- ${t.description} — ${t.rationale}`)
    .join("\n")
  const questions = review.comprehensionQuestions
    .map((q) => `- [${q.id}] ${q.prompt}`)
    .join("\n")
  const score = review.score !== null ? `${review.score}/100` : "(ungraded)"
  const weakAreas = review.weakAreas?.length
    ? review.weakAreas.map((w) => `- ${w.area}: ${w.detail}`).join("\n")
    : "(none)"
  return (
    `Diff review (PR #${review.prNumber}):\n` +
    `## Changed files\n${changedFiles || "(none)"}\n\n` +
    `## Core logic\n${review.coreLogicExplanation}\n\n` +
    `## Risk analysis\n${risks || "(none)"}\n\n` +
    `## Test suggestions\n${tests || "(none)"}\n\n` +
    `## Comprehension questions\n${questions || "(none)"}\n\n` +
    `## Score\n${score}\n\n` +
    `## Weak areas\n${weakAreas}`
  )
}

/** Render the M8 diff-review list (compact). */
function renderDiffReviewList(reviews: DiffReview[]): string {
  if (reviews.length === 0) {
    return (
      "no diff reviews — no M8 `diff_reviews` rows exist for this snapshot. " +
      "Skip the 'diff-review' ground area rather than fabricating one."
    )
  }
  return (
    `${reviews.length} diff review(s):\n` +
    reviews
      .map(
        (r) =>
          `- PR #${r.prNumber}: ${r.coreLogicExplanation.slice(0, 80)}`,
      )
      .join("\n") +
    `\n\nCall read_diff_review again with pullNumber to fetch the full review.`
  )
}

/** Render one M9 challenge + its attempts as a tool-result payload. */
function renderChallengeWithAttempts(
  challenge: Challenge,
  attempts: ChallengeAttempt[],
): string {
  const inScope = challenge.inScopeFiles.map((p) => `- ${p}`).join("\n")
  const outScope = challenge.outOfScopeFiles.map((p) => `- ${p}`).join("\n")
  const criteria = challenge.acceptanceCriteria
    .map((c) => `- [${c.id}] ${c.detail}`)
    .join("\n")
  const sourceRefs = challenge.sourceReferences
    .map((r) => `- ${r.section} / ${r.path}: ${r.note}`)
    .join("\n")
  const attemptsBlock = attempts.length
    ? attempts
        .map((a, i) => {
          const grading = a.grading
            ? `score ${a.grading.score}/100; weak: ${
                a.grading.weakAreas.map((w) => w.area).join(", ") || "(none)"
              }`
            : "(ungraded)"
          return (
            `### Attempt ${i + 1}\n` +
            `${a.explanation.slice(0, 400)}\n\n` +
            `Grading: ${grading}`
          )
        })
        .join("\n\n")
    : "(no attempts on this challenge)"
  return (
    `Challenge id=${challenge.id} (${challenge.type}):\n` +
    `## Task\n${challenge.taskDescription}\n\n` +
    `## In-scope files\n${inScope || "(none)"}\n\n` +
    `## Out-of-scope files\n${outScope || "(none)"}\n\n` +
    `## Acceptance criteria\n${criteria || "(none)"}\n\n` +
    `## Source references\n${sourceRefs || "(none)"}\n\n` +
    `## Attempts\n${attemptsBlock}`
  )
}

/**
 * Render the M9 challenge list (compact). Only challenges with at least one
 * attempt are listed — the 'debug-expansion' ground area is grounded in the
 * user's *attempts*, not in the merely-generated challenges. The PRD's
 * skip-when-empty rule fires when zero attempts exist for the snapshot.
 */
function renderChallengeAttemptList(
  challenges: { challenge: Challenge; attempts: ChallengeAttempt[] }[],
): string {
  const withAttempts = challenges.filter((c) => c.attempts.length > 0)
  if (withAttempts.length === 0) {
    return (
      "no challenge attempts — no `challenge_attempts` rows exist for this " +
      "snapshot. Skip the 'debug-expansion' ground area rather than " +
      "fabricating one."
    )
  }
  return (
    `${withAttempts.length} attempted challenge(s):\n` +
    withAttempts
      .map(
        ({ challenge, attempts }) =>
          `- id=${challenge.id} (${challenge.type}, ${attempts.length} ` +
          `attempt${attempts.length === 1 ? "" : "s"}): ` +
          `${challenge.taskDescription.slice(0, 80)}`,
      )
      .join("\n") +
    `\n\nCall read_challenge_attempt again with challengeId to fetch the ` +
    `full challenge + attempts.`
  )
}

// ---------------------------------------------------------------------------
// Submission parsing
// ---------------------------------------------------------------------------

/**
 * Validate and coerce a `submit_interview_qa` tool input into an
 * `InterviewQA[]`. Returns `null` when the input is not a usable submission
 * (so the caller fails with `no_structured_output`). Individually malformed
 * items are dropped rather than failing the whole call.
 *
 * `groundArea` values that are not one of the five M10-named areas drop the
 * item — a soft-typed area is a hallucination just like an off-map file.
 */
export function parseInterviewQAItems(input: unknown): InterviewQA[] | null {
  if (typeof input !== "object" || input === null) return null
  const record = input as Record<string, unknown>
  if (!Array.isArray(record.items)) return null

  const items: InterviewQA[] = record.items.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return []
    const r = raw as Record<string, unknown>
    const question = str(r.question)
    const answer = str(r.answer)
    const groundArea = str(r.groundArea)
    if (!question || !answer || !groundArea) return []
    if (!GROUND_AREA_SET.has(groundArea)) return []
    return [
      {
        question,
        answer,
        groundArea: groundArea as GroundArea,
        sourceReferences: strArray(r.sourceReferences),
      },
    ]
  })

  if (items.length === 0) return null
  return items
}

// ---------------------------------------------------------------------------
// Source bundle — read the five ground-area rows once, up front
// ---------------------------------------------------------------------------

interface SourceBundle {
  stack: StackExplanation | null
  projectMap: ProjectMap | null
  learningUnits: LearningUnit[]
  diffReviews: DiffReview[]
  /** Every snapshot challenge paired with its attempts (newest-first by id). */
  challengesWithAttempts: { challenge: Challenge; attempts: ChallengeAttempt[] }[]
}

async function loadSourceBundle(
  snapshotId: number,
  db?: CatalogDb,
): Promise<SourceBundle> {
  const [stack, projectMap, learningUnits, diffReviews, allChallenges] =
    await Promise.all([
      getStackExplanation(snapshotId, db),
      getProjectMap(snapshotId, db),
      listLearningUnits(snapshotId, db),
      listDiffReviews(snapshotId, db),
      listChallengesBySnapshot(snapshotId, db),
    ])
  const challengesWithAttempts = await Promise.all(
    allChallenges.map(async (challenge) => ({
      challenge,
      attempts: await listChallengeAttempts(challenge.id, db),
    })),
  )
  return {
    stack,
    projectMap,
    learningUnits,
    diffReviews,
    challengesWithAttempts,
  }
}

/** Build the initial user prompt: a brief inventory of available source rows. */
function buildInitialPrompt(bundle: SourceBundle): string {
  const stackBlock = bundle.stack
    ? `Available (${bundle.stack.tools.length} tool(s) explained).`
    : "Not available — skip 'stack'."
  const mapBlock = bundle.projectMap
    ? `Available (${bundle.projectMap.keyFileMap.length} key file(s) mapped).`
    : "Not available — skip 'architecture'."
  const unitsBlock =
    bundle.learningUnits.length > 0
      ? `${bundle.learningUnits.length} unit(s) available.`
      : "Not available — skip 'issue-learning'."
  const reviewsBlock =
    bundle.diffReviews.length > 0
      ? `${bundle.diffReviews.length} review(s) available.`
      : "Not available — skip 'diff-review'."
  const attemptCount = bundle.challengesWithAttempts.reduce(
    (sum, c) => sum + c.attempts.length,
    0,
  )
  const challengesBlock =
    attemptCount > 0
      ? `${attemptCount} challenge attempt(s) available across ` +
        `${
          bundle.challengesWithAttempts.filter((c) => c.attempts.length > 0)
            .length
        } challenge(s).`
      : "Not available — skip 'debug-expansion'."
  return (
    "Generate the interview Q&A pack for this imported snapshot covering " +
    "the five M10 ground areas. Inventory of source rows:\n\n" +
    `- stack            (M5): ${stackBlock}\n` +
    `- architecture     (M6): ${mapBlock}\n` +
    `- issue-learning   (M7): ${unitsBlock}\n` +
    `- diff-review      (M8): ${reviewsBlock}\n` +
    `- debug-expansion  (M9): ${challengesBlock}\n\n` +
    "Read what you need via the five `read_*` tools, then call " +
    "`submit_interview_qa` exactly once. Skip any ground area whose source " +
    "rows are unavailable — DO NOT fabricate a question for an empty area."
  )
}

// ---------------------------------------------------------------------------
// Tool result dispatch
// ---------------------------------------------------------------------------

async function resolveToolCall(
  block: ToolUseBlock,
  snapshotId: number,
  bundle: SourceBundle,
  db?: CatalogDb,
): Promise<Anthropic.ToolResultBlockParam> {
  const input = (block.input ?? {}) as Record<string, unknown>

  if (block.name === READ_STACK_EXPLANATION_TOOL.name) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: renderStackExplanation(bundle.stack),
    }
  }

  if (block.name === READ_PROJECT_MAP_ENTRY_TOOL.name) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: renderProjectMap(bundle.projectMap),
    }
  }

  if (block.name === READ_LEARNING_UNIT_TOOL.name) {
    const issueRef = str(input.issueRef)
    if (!issueRef) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: renderLearningUnitList(bundle.learningUnits),
      }
    }
    const unit = bundle.learningUnits.find((u) => u.issueRef === issueRef)
    if (!unit) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        is_error: true,
        content:
          `No learning unit with issueRef "${issueRef}". Call ` +
          `read_learning_unit with no arguments to list the available ` +
          `unit refs.`,
      }
    }
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: renderLearningUnit(unit),
    }
  }

  if (block.name === READ_DIFF_REVIEW_TOOL.name) {
    const pullNumber =
      typeof input.pullNumber === "number" && Number.isInteger(input.pullNumber)
        ? input.pullNumber
        : null
    if (pullNumber === null) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: renderDiffReviewList(bundle.diffReviews),
      }
    }
    const review =
      bundle.diffReviews.find((r) => r.prNumber === pullNumber) ??
      (await getDiffReview(snapshotId, pullNumber, db))
    if (!review) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        is_error: true,
        content:
          `No diff review for PR #${pullNumber}. Call read_diff_review ` +
          `with no arguments to list the available PR numbers.`,
      }
    }
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: renderDiffReview(review),
    }
  }

  if (block.name === READ_CHALLENGE_ATTEMPT_TOOL.name) {
    const challengeId =
      typeof input.challengeId === "number" &&
      Number.isInteger(input.challengeId)
        ? input.challengeId
        : null
    if (challengeId === null) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: renderChallengeAttemptList(bundle.challengesWithAttempts),
      }
    }
    let row = bundle.challengesWithAttempts.find(
      (c) => c.challenge.id === challengeId,
    )
    if (!row) {
      // Fall back to a fresh DB lookup in case the caller passed a stale id.
      const challenge = await getChallengeById(challengeId, db)
      if (challenge && challenge.snapshotId === snapshotId) {
        const attempts = await listChallengeAttempts(challenge.id, db)
        row = { challenge, attempts }
      }
    }
    if (!row) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        is_error: true,
        content:
          `No challenge with id ${challengeId} on this snapshot. Call ` +
          `read_challenge_attempt with no arguments to list the available ` +
          `challenge ids (only those with at least one attempt are listed).`,
      }
    }
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: renderChallengeWithAttempts(row.challenge, row.attempts),
    }
  }

  // Unknown tool — surface a structured error so the model can correct.
  return {
    type: "tool_result",
    tool_use_id: block.id,
    is_error: true,
    content: `Unknown tool "${block.name}".`,
  }
}

// ---------------------------------------------------------------------------
// The bounded call
// ---------------------------------------------------------------------------

/**
 * Produce a typed interview Q&A pack for an imported snapshot covering the
 * five M10 ground areas (PRD FR-2, Issue #180).
 *
 * Makes a bounded tool-use call on the `@workspace/ai` client: the model may
 * read the M5/M6/M7/M8/M9 rows through five `read_*` tools, and returns the
 * pack through `submit_interview_qa`. On the final allowed turn the
 * submission tool is forced, so the call always terminates with structured
 * output or a typed boundary failure.
 *
 * The returned pack is verified against the M6 project map + M5 stack
 * explanation via {@link checkArtifactIntegrity}. A `sourceReferences` entry
 * that names an off-map file or off-stack technology throws
 * {@link InterviewQAIntegrityError} — the candidate is NOT softened and
 * NOT returned (PRD NFR-5).
 *
 * Persistence is the caller's job (task #184 wires this through
 * `upsertMemory`); this function only generates + integrity-checks.
 *
 * @throws {@link InterviewQAIntegrityError} when integrity fails — never on
 *         boundary failures (those return via the discriminated result).
 */
export async function generateInterviewQA(
  snapshotId: number,
  options?: GenerateInterviewQAOptions,
): Promise<InterviewQA[]> {
  const db = options?.db
  const bundle = await loadSourceBundle(snapshotId, db)

  const client = options?.client ?? createLlmClient()
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildInitialPrompt(bundle) },
  ]

  let parsed: InterviewQA[] | null = null
  for (let turn = 0; turn < MAX_ITERATIONS; turn += 1) {
    const lastTurn = turn === MAX_ITERATIONS - 1
    const result = await client.complete({
      system: SYSTEM_PROMPT,
      cacheSystem: true,
      messages,
      maxTokens: GENERATE_MAX_TOKENS,
      tools: [
        READ_STACK_EXPLANATION_TOOL,
        READ_PROJECT_MAP_ENTRY_TOOL,
        READ_LEARNING_UNIT_TOOL,
        READ_DIFF_REVIEW_TOOL,
        READ_CHALLENGE_ATTEMPT_TOOL,
        SUBMIT_TOOL,
      ],
      // On the final turn force the submission tool so the bounded call
      // always terminates with structured output rather than another read.
      toolChoice: lastTurn
        ? { type: "tool", name: SUBMIT_TOOL.name }
        : { type: "auto" },
    })

    if (!result.ok) {
      throw new GenerateInterviewQAError(
        "llm_error",
        `The interview Q&A generation call failed: ${result.error.message}`,
        result.error,
      )
    }

    const calls = toolUseBlocks(result.data.content)
    const submission = calls.find((c) => c.name === SUBMIT_TOOL.name)
    if (submission) {
      const items = parseInterviewQAItems(submission.input)
      if (!items) {
        throw new GenerateInterviewQAError(
          "no_structured_output",
          "The model's submitted interview Q&A pack was empty or malformed.",
        )
      }
      parsed = items
      break
    }

    const reads = calls.filter((c) => c.name !== SUBMIT_TOOL.name)
    if (reads.length === 0) {
      throw new GenerateInterviewQAError(
        "no_structured_output",
        "The model ended its turn without submitting an interview Q&A pack.",
      )
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of reads) {
      toolResults.push(await resolveToolCall(block, snapshotId, bundle, db))
    }
    messages.push({ role: "assistant", content: result.data.content })
    messages.push({ role: "user", content: toolResults })
  }

  if (!parsed) {
    throw new GenerateInterviewQAError(
      "no_structured_output",
      "The interview Q&A generation call did not converge within its turn " +
        "budget.",
    )
  }

  // Integrity check (PRD NFR-5). Reject the pack — do NOT soften — when a
  // `sourceReferences` entry resolves to neither an M6-mapped file nor an
  // M5-named technology.
  //
  // The PRD shape for `InterviewQA.sourceReferences` is a single bucket of
  // either file paths or technology names (see schema.ts line 1140–1144).
  // The shipped {@link checkArtifactIntegrity} treats every entry as a file
  // path (it has no way to know which is which for QA items), so we run the
  // two helper checks ourselves and accept each entry if it matches EITHER
  // set. Case-sensitive, mirroring M9 (and Issue #177's `Set.has` rule).
  const allowedFiles = new Set(
    bundle.projectMap?.keyFileMap.map((f) => f.path) ?? [],
  )
  const allowedTechs = new Set(bundle.stack?.tools.map((t) => t.name) ?? [])
  const missing: string[] = []
  const seen = new Set<string>()
  for (const item of parsed) {
    for (const ref of item.sourceReferences) {
      if (allowedFiles.has(ref) || allowedTechs.has(ref)) continue
      if (seen.has(ref)) continue
      seen.add(ref)
      missing.push(ref)
    }
  }
  if (missing.length > 0) {
    const failure: Extract<IntegrityResult, { ok: false }> = {
      ok: false,
      missing,
    }
    throw new InterviewQAIntegrityError(parsed, failure)
  }

  return parsed
}
