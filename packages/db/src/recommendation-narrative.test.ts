// Tests for recommendation narrative generation (FR-3).
//
// Every test injects the @workspace/ai mock transport, so the suite runs with
// no API key set and makes zero live Anthropic calls (the llm-foundation
// CI-safe test strategy).

import { createLlmClient, LlmError } from "@workspace/ai"
import type { LlmResponse } from "@workspace/ai"
import { createMockTransport } from "@workspace/ai/testing"
import { describe, expect, it } from "vitest"

import {
  generateRecommendationNarrative,
  type NarrativeInput,
} from "./recommendation-narrative"

const sampleInput: NarrativeInput = {
  intake: {
    goal: "Build a Next.js portfolio app and explain how it works",
    experienceLevel: "junior",
    knownStack: ["React", "TypeScript"],
    jobTarget: "frontend developer",
    timeBudget: "three weeks",
    complexityTolerance: "moderate",
    projectType: "A Next.js web application",
    aiToolPreference: "Claude Code",
    learningFocus: "the server/client component split",
  },
  goldenPath: {
    slug: "ai-native-nextjs-app",
    name: "AI-native Next.js App",
    summary: "Understand a modern Next.js and React web app.",
    fitCriteria: "Use when the project is a Next.js app.",
    learningOutcomes: ["Explain the App Router and the server/client split"],
    risks: ["AI-generated apps over-use 'use client'"],
  },
  templates: [
    {
      slug: "create-next-app",
      name: "create-next-app",
      summary: "The official Next.js scaffold.",
      whyUsed: "It scaffolds a correct, runnable Next.js app.",
    },
  ],
  rejectedAlternatives: [
    {
      slug: "agentic-ccpm-workflow",
      kind: "golden_path",
      reason: "Lower fit score (3) than the recommended AI-native Next.js App.",
    },
  ],
}

/** One content block of an LLM response. */
type LlmContentBlock = LlmResponse["content"][number]

/** A scripted `tool_use` content block carrying the model's narrative. */
function narrativeToolBlock(input: unknown): LlmContentBlock {
  return {
    type: "tool_use",
    id: "tu_test",
    name: "emit_recommendation_narrative",
    input,
  } as LlmContentBlock
}

const validNarrative = {
  whyItFits: "The AI-native Next.js path fits your frontend developer goal.",
  complexityRisks: "As a junior dev, watch the server/client boundary.",
  learningCheckpoints: [
    "Sketch the route tree from the app/ directory",
    "Trace one page's data from source to render",
  ],
  portfolioValue: "A defensible Next.js project for a frontend role.",
}

describe("recommendation narrative generation", () => {
  it("returns a typed narrative covering all four dimensions on success", async () => {
    const client = createLlmClient(
      createMockTransport({
        replies: [
          { stopReason: "tool_use", content: [narrativeToolBlock(validNarrative)] },
        ],
      }),
    )
    const result = await generateRecommendationNarrative(sampleInput, client)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.whyItFits).toBeTruthy()
      expect(result.data.complexityRisks).toBeTruthy()
      expect(result.data.learningCheckpoints.length).toBeGreaterThan(0)
      expect(result.data.portfolioValue).toBeTruthy()
    }
  })

  it("sends a cached system prompt, the forced narrative tool, and one bounded call", async () => {
    const transport = createMockTransport({
      replies: [
        { stopReason: "tool_use", content: [narrativeToolBlock(validNarrative)] },
      ],
    })
    await generateRecommendationNarrative(sampleInput, createLlmClient(transport))

    expect(transport.calls).toHaveLength(1)
    const call = transport.calls[0]
    // The system prompt is sent as an array → it carries a cache breakpoint.
    expect(Array.isArray(call?.system)).toBe(true)
    expect(call?.tools?.[0]?.name).toBe("emit_recommendation_narrative")
    expect(call?.tool_choice).toEqual({
      type: "tool",
      name: "emit_recommendation_narrative",
    })
  })

  it("includes the intake context and the recommended entries in the prompt", async () => {
    const transport = createMockTransport({
      replies: [
        { stopReason: "tool_use", content: [narrativeToolBlock(validNarrative)] },
      ],
    })
    await generateRecommendationNarrative(sampleInput, createLlmClient(transport))

    const userMessage = String(transport.calls[0]?.messages[0]?.content)
    expect(userMessage).toContain(sampleInput.intake.goal)
    expect(userMessage).toContain(sampleInput.intake.jobTarget)
    expect(userMessage).toContain("ai-native-nextjs-app")
    expect(userMessage).toContain("create-next-app")
    expect(userMessage).toContain("agentic-ccpm-workflow")
  })

  it("fails with a typed error when the model returns no tool call", async () => {
    const client = createLlmClient(
      createMockTransport({ replies: [{ text: "Here is some prose instead." }] }),
    )
    const result = await generateRecommendationNarrative(sampleInput, client)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(LlmError)
      expect(result.error.kind).toBe("api_error")
    }
  })

  it("fails when the narrative is missing a required field", async () => {
    const incomplete = {
      whyItFits: "ok",
      complexityRisks: "ok",
      learningCheckpoints: ["ok"],
      // portfolioValue intentionally absent
    }
    const client = createLlmClient(
      createMockTransport({
        replies: [
          { stopReason: "tool_use", content: [narrativeToolBlock(incomplete)] },
        ],
      }),
    )
    const result = await generateRecommendationNarrative(sampleInput, client)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("api_error")
    }
  })

  it("returns a typed failure when the transport throws", async () => {
    const client = createLlmClient(
      createMockTransport({ throws: new Error("network down") }),
    )
    const result = await generateRecommendationNarrative(sampleInput, client)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(LlmError)
    }
  })
})
