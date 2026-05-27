// Shared scaffolding for the two M10 bounded SDK calls
// (`generate-qa.ts` Issue #180, `generate-bullets.ts` Issue #181).
//
// Both calls run the same bounded tool-use pattern on `@workspace/ai`:
//
//   - The model reads the snapshot's M5 stack explanation, M6 project map,
//     M7 learning units, and (Q&A only) M8 diff reviews, and the
//     M9 challenge attempts via fixed read-only tools.
//   - It then submits a typed structured output through a forced final
//     tool on the last allowed turn.
//
// Everything in here is cross-call: tool definitions, tool-result
// renderers, the source-bundle shape, and the small parsing helpers that
// both modules use. Anything per-call (system prompt, the submit tool,
// post-SDK validation, error classes) lives in the individual module.
//
// Why a leading underscore in the filename: it signals "internal to the
// learning-memories module" — neither `generate-qa.ts` nor
// `generate-bullets.ts` re-exports anything from here, and the package
// barrel (`index.ts`) does not surface it. Consumers import the public
// generators, not this scaffolding.

import type Anthropic from "@anthropic-ai/sdk"

import type { CatalogDb } from "../client"
import {
  getChallengeById,
  listChallengeAttempts,
  listChallengesBySnapshot,
} from "../challenges/challenges"
import { listLearningUnits } from "../learning-units/units"
import { getProjectMap } from "../mapper/project-maps"
import type {
  Challenge,
  ChallengeAttempt,
  LearningUnit,
  ProjectMap,
  StackExplanation,
} from "../schema"
import { getStackExplanation } from "../stack/explanations"

// ---------------------------------------------------------------------------
// Tiny parsing helpers
// ---------------------------------------------------------------------------

/** A non-empty trimmed string, or `null`. */
export function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

/** A `string[]` of non-empty trimmed strings — anything else dropped. */
export function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    const s = str(raw)
    return s ? [s] : []
  })
}

// ---------------------------------------------------------------------------
// Tool-use block helpers
// ---------------------------------------------------------------------------

/** A tool-use content block, narrowed from a response's content. */
export type ToolUseBlock = Extract<Anthropic.ContentBlock, { type: "tool_use" }>

/** Collect the tool-use blocks from a response's content. */
export function toolUseBlocks(
  content: Anthropic.ContentBlock[],
): ToolUseBlock[] {
  return content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  )
}

// ---------------------------------------------------------------------------
// Shared tool definitions
// ---------------------------------------------------------------------------

/** Tool the model calls to read the M5 stack explanation for the snapshot. */
export const READ_STACK_EXPLANATION_TOOL: Anthropic.Tool = {
  name: "read_stack_explanation",
  description:
    "Read the M5 `stack_explanations` row for this snapshot: the named " +
    "tools (with their project-specific purpose, alternatives, and " +
    "job-relevance), the key files M5 surfaced, and the debug entry " +
    "points. The technologies you may cite are exactly the tool names " +
    "listed here. Returns 'not available' when no stack explanation has " +
    "been generated.",
  input_schema: {
    type: "object",
    properties: {},
  },
}

/** Tool the model calls to read the M6 project map for the snapshot. */
export const READ_PROJECT_MAP_ENTRY_TOOL: Anthropic.Tool = {
  name: "read_project_map_entry",
  description:
    "Read the M6 `project_maps` row for this snapshot: the architecture " +
    "overview, the key-file map (the ONLY file paths you may cite), " +
    "request/data flow, state flow, AI-call flow, and the debug path. " +
    "Returns 'not available' when no project map exists.",
  input_schema: {
    type: "object",
    properties: {},
  },
}

/** Tool the model calls to list / read M7 learning units. */
export const READ_LEARNING_UNIT_TOOL: Anthropic.Tool = {
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

/** Tool the model calls to list / read M9 challenge attempts. */
export const READ_CHALLENGE_ATTEMPT_TOOL: Anthropic.Tool = {
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

// ---------------------------------------------------------------------------
// Tool result renderers
// ---------------------------------------------------------------------------

/**
 * Render the M5 stack explanation as a tool-result payload. When `null`, the
 * tool returns the "not available" sentinel that instructs the model to skip
 * any stack-grounded output. The first line marks the tool list as the
 * AUTHORITATIVE stack set so the system prompt's case-sensitivity contract is
 * surfaced wherever the result is read.
 */
export function renderStackExplanation(stack: StackExplanation | null): string {
  if (!stack) {
    return (
      "not available — no M5 stack explanation exists for this snapshot. " +
      "Do not cite stack technologies."
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
export function renderProjectMap(map: ProjectMap | null): string {
  if (!map) {
    return (
      "not available — no M6 project map exists for this snapshot. Do not " +
      "cite file paths."
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
export function renderLearningUnit(unit: LearningUnit): string {
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

/**
 * Render the M7 learning-unit list (compact). When `emptySkipArea` is set, the
 * sentinel tells the model which output category to skip — Q&A uses the
 * 'issue-learning' ground area, bullets simply omit per-issue bullets.
 */
export function renderLearningUnitList(
  units: LearningUnit[],
  emptySentinel: string,
): string {
  if (units.length === 0) {
    return emptySentinel
  }
  return (
    `${units.length} learning unit(s):\n` +
    units
      .map((u) => `- ${u.source} ${u.issueRef}: ${u.restatedGoal.slice(0, 80)}`)
      .join("\n") +
    `\n\nCall read_learning_unit again with issueRef to fetch the full unit.`
  )
}

/** Render one M9 challenge + its attempts as a tool-result payload. */
export function renderChallengeWithAttempts(
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
 * attempt are listed. The empty-set sentinel is supplied by the caller so the
 * Q&A and résumé-bullet paths can speak in their own vocabulary.
 */
export function renderChallengeAttemptList(
  challenges: { challenge: Challenge; attempts: ChallengeAttempt[] }[],
  emptySentinel: string,
): string {
  const withAttempts = challenges.filter((c) => c.attempts.length > 0)
  if (withAttempts.length === 0) {
    return emptySentinel
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
// Source bundle — read the shared rows once, up front
// ---------------------------------------------------------------------------

/**
 * The subset of the M5/M6/M7/M9 rows the résumé-bullet generator reads. The
 * Q&A generator extends this with M8 diff reviews via a separate
 * load.
 */
export interface SharedSourceBundle {
  stack: StackExplanation | null
  projectMap: ProjectMap | null
  learningUnits: LearningUnit[]
  /** Every snapshot challenge paired with its attempts (newest-first by id). */
  challengesWithAttempts: { challenge: Challenge; attempts: ChallengeAttempt[] }[]
}

/** Load the bundle of M5/M6/M7/M9 rows the bullets generator needs. */
export async function loadSharedSourceBundle(
  snapshotId: number,
  db?: CatalogDb,
): Promise<SharedSourceBundle> {
  const [stack, projectMap, learningUnits, allChallenges] = await Promise.all([
    getStackExplanation(snapshotId, db),
    getProjectMap(snapshotId, db),
    listLearningUnits(snapshotId, db),
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
    challengesWithAttempts,
  }
}

// ---------------------------------------------------------------------------
// Tool result dispatch — shared 4-tool subset
// ---------------------------------------------------------------------------

/**
 * Resolve a tool-use block against the shared four read tools. Returns a
 * `ToolResultBlockParam` ready to push back into the conversation, or `null`
 * when the tool name is not one of the shared reads (the caller can then
 * handle its own additional tools, e.g. M8 diff reviews for the Q&A path).
 *
 * `learningUnitEmptySentinel` and `challengeAttemptEmptySentinel` are the
 * skip-area sentinels the caller wants surfaced when the corresponding rows
 * are missing; each module supplies its own copy so the system prompt's
 * vocabulary is preserved.
 */
export async function resolveSharedToolCall(
  block: ToolUseBlock,
  snapshotId: number,
  bundle: SharedSourceBundle,
  sentinels: {
    learningUnitEmpty: string
    challengeAttemptEmpty: string
  },
  db?: CatalogDb,
): Promise<Anthropic.ToolResultBlockParam | null> {
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
        content: renderLearningUnitList(
          bundle.learningUnits,
          sentinels.learningUnitEmpty,
        ),
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
        content: renderChallengeAttemptList(
          bundle.challengesWithAttempts,
          sentinels.challengeAttemptEmpty,
        ),
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

  // Not a shared tool — the caller handles its own additional tools.
  return null
}
