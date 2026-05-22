// Recommendation narrative generation for the M4 Recommendation Engine
// (recommendation-engine PRD FR-3) — the *explanation* half of the hybrid
// engine.
//
// `recommendation-scoring.ts` decides the recommendation; this module only
// explains it. It makes one bounded Anthropic SDK call on the @workspace/ai
// `llm-foundation` client (ADR 0005) — a prompt → structured-output call, not
// an autonomous agent — turning a scored result into the four coaching
// dimensions a junior dev needs to defend the choices in an interview: why it
// fits, complexity risks, learning checkpoints, and portfolio value.
//
// Server-side only: the call needs `ANTHROPIC_API_KEY`, read server-side.
// Structured output is elicited with a forced tool call; the system prompt is
// cached (prompt caching). Tests inject the @workspace/ai mock transport, so
// they run with no API key and make zero live calls.

import { createLlmClient, fail, LlmError, ok } from "@workspace/ai"
import type { LlmClient, LlmRequest, LlmResponse, LlmResult } from "@workspace/ai"

import type {
  GoldenPath,
  RecommendationIntake,
  RecommendationNarrative,
  RejectedRecommendation,
  Template,
} from "./schema"

// The Anthropic tool and content-block types, taken from the @workspace/ai
// public surface — so the recommendation engine has no second Anthropic SDK
// dependency of its own (recommendation-engine PRD: no second SDK path).
/** A tool definition, as accepted by the @workspace/ai client. */
type LlmTool = NonNullable<LlmRequest["tools"]>[number]
/** One content block of an LLM response. */
type LlmContentBlock = LlmResponse["content"][number]
/** A `tool_use` content block — the model's structured-output call. */
type LlmToolUseBlock = Extract<LlmContentBlock, { type: "tool_use" }>

/** The scored recommendation a narrative is generated for. */
export interface NarrativeInput {
  /** The user-context intake the recommendation was computed from. */
  intake: RecommendationIntake
  /** The recommended Golden Path. */
  goldenPath: Pick<
    GoldenPath,
    "slug" | "name" | "summary" | "fitCriteria" | "learningOutcomes" | "risks"
  >
  /** The recommended templates, resolved to catalog entries. */
  templates: Pick<Template, "slug" | "name" | "summary" | "whyUsed">[]
  /** The Golden Paths the scoring engine rejected, with reasons. */
  rejectedAlternatives: RejectedRecommendation[]
}

/** The tool the model calls to return a structured narrative. */
const NARRATIVE_TOOL_NAME = "emit_recommendation_narrative"

/**
 * The structured-output tool. Forcing this tool (`tool_choice`) makes the model
 * return the four narrative dimensions as typed fields rather than free prose.
 */
const narrativeTool: LlmTool = {
  name: NARRATIVE_TOOL_NAME,
  description:
    "Return the coaching narrative for the recommendation as structured " +
    "fields. Every field must reference the user's intake and the " +
    "recommended catalog entries by name — never generic advice.",
  input_schema: {
    type: "object",
    properties: {
      whyItFits: {
        type: "string",
        description:
          "Why the recommended Golden Path and templates fit this user's " +
          "goal, experience level, known stack, and job target.",
      },
      complexityRisks: {
        type: "string",
        description:
          "The complexity risks of this path for this user, given their " +
          "stated experience level and complexity tolerance.",
      },
      learningCheckpoints: {
        type: "array",
        items: { type: "string" },
        description:
          "Concrete checkpoints that prove the user genuinely understands " +
          "the project as they build it.",
      },
      portfolioValue: {
        type: "string",
        description:
          "The portfolio and interview value of completing this project, " +
          "tied to the user's job target.",
      },
    },
    required: [
      "whyItFits",
      "complexityRisks",
      "learningCheckpoints",
      "portfolioValue",
    ],
  },
}

/** The coaching role and bounds for the narrative call. */
const SYSTEM_PROMPT =
  "You are an interview-preparation coach for a job-seeking junior " +
  "developer. You are given a recommendation that a deterministic scoring " +
  "engine has ALREADY decided: a Golden Path, a template set, and the " +
  "alternatives it rejected. Your job is only to explain that decision — " +
  "never to change it or propose a different path. Write specific, " +
  "plain-language coaching that cites the user's intake and the recommended " +
  `catalog entries by name. Return your answer by calling the ` +
  `${NARRATIVE_TOOL_NAME} tool.`

/** Render the scored recommendation as the user message for the call. */
function buildUserMessage(input: NarrativeInput): string {
  const { intake, goldenPath, templates, rejectedAlternatives } = input
  return [
    "## User intake",
    `- Goal: ${intake.goal}`,
    `- Experience level: ${intake.experienceLevel}`,
    `- Known stack: ${intake.knownStack.join(", ")}`,
    `- Job target: ${intake.jobTarget}`,
    `- Time budget: ${intake.timeBudget}`,
    `- Complexity tolerance: ${intake.complexityTolerance}`,
    `- Project type: ${intake.projectType}`,
    `- AI-tool preference: ${intake.aiToolPreference}`,
    `- Learning focus: ${intake.learningFocus}`,
    "",
    "## Recommended Golden Path",
    `- ${goldenPath.name} (${goldenPath.slug})`,
    `- Summary: ${goldenPath.summary}`,
    `- Fit criteria: ${goldenPath.fitCriteria}`,
    `- Learning outcomes: ${goldenPath.learningOutcomes.join("; ")}`,
    `- Known risks: ${goldenPath.risks.join("; ")}`,
    "",
    "## Recommended templates",
    ...templates.map((t) => `- ${t.name} (${t.slug}): ${t.whyUsed}`),
    "",
    "## Rejected alternatives",
    ...rejectedAlternatives.map((r) => `- ${r.slug} (${r.kind}): ${r.reason}`),
    "",
    `Call ${NARRATIVE_TOOL_NAME} with the coaching narrative for this user.`,
  ].join("\n")
}

/** Narrow the model's tool input onto a {@link RecommendationNarrative}. */
function isRecommendationNarrative(
  value: unknown,
): value is RecommendationNarrative {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.whyItFits === "string" &&
    typeof candidate.complexityRisks === "string" &&
    Array.isArray(candidate.learningCheckpoints) &&
    candidate.learningCheckpoints.every((item) => typeof item === "string") &&
    typeof candidate.portfolioValue === "string"
  )
}

/**
 * Generate the coaching narrative for a scored recommendation (FR-3).
 *
 * Makes one bounded LLM call; the scoring decision is passed in and never
 * changed here. Returns a discriminated {@link LlmResult}: expected boundary
 * failures (no API key, rate limit, a malformed reply) are returned, not
 * thrown.
 *
 * @param client - injected for tests; defaults to the real @workspace/ai
 *   client, created lazily so importing this module needs no API key.
 */
export async function generateRecommendationNarrative(
  input: NarrativeInput,
  client: LlmClient = createLlmClient(),
): Promise<LlmResult<RecommendationNarrative>> {
  const result = await client.complete({
    system: SYSTEM_PROMPT,
    cacheSystem: true,
    messages: [{ role: "user", content: buildUserMessage(input) }],
    tools: [narrativeTool],
    toolChoice: { type: "tool", name: NARRATIVE_TOOL_NAME },
  })

  if (!result.ok) {
    return result
  }

  const toolUse = result.data.content.find(
    (block): block is LlmToolUseBlock =>
      block.type === "tool_use" && block.name === NARRATIVE_TOOL_NAME,
  )
  if (!toolUse) {
    return fail(
      new LlmError(
        "api_error",
        "The model returned no recommendation-narrative tool call.",
      ),
    )
  }
  if (!isRecommendationNarrative(toolUse.input)) {
    return fail(
      new LlmError(
        "api_error",
        "The recommendation narrative was missing required fields.",
      ),
    )
  }
  return ok(toolUse.input)
}
