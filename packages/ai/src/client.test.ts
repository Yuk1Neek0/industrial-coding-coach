import type Anthropic from "@anthropic-ai/sdk"
import { afterEach, describe, expect, it } from "vitest"

import { createLlmClient } from "./client"
import { LlmError } from "./errors"
import type { LlmTransport } from "./transport"

/** Build a minimal Anthropic `Message` for transport stubs. */
function makeMessage(text: string): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  } as unknown as Anthropic.Message
}

describe("LLM client wrapper", () => {
  it("returns ok with content, stop reason, and usage on success", async () => {
    const client = createLlmClient({
      createMessage: async () => makeMessage("hi there"),
    })
    const result = await client.complete({
      messages: [{ role: "user", content: "hi" }],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.content).toHaveLength(1)
      expect(result.data.stopReason).toBe("end_turn")
      expect(result.data.usage.output_tokens).toBe(5)
    }
  })

  it("defaults model and max_tokens", async () => {
    let captured: Anthropic.MessageCreateParamsNonStreaming | undefined
    const transport: LlmTransport = {
      createMessage: async (params) => {
        captured = params
        return makeMessage("ok")
      },
    }
    await createLlmClient(transport).complete({
      messages: [{ role: "user", content: "hi" }],
    })
    expect(captured?.model).toBe("claude-sonnet-4-6")
    expect(captured?.max_tokens).toBe(2048)
  })

  it("passes through model and max-token overrides", async () => {
    let captured: Anthropic.MessageCreateParamsNonStreaming | undefined
    const client = createLlmClient({
      createMessage: async (params) => {
        captured = params
        return makeMessage("ok")
      },
    })
    await client.complete({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-opus-4-7",
      maxTokens: 512,
    })
    expect(captured?.model).toBe("claude-opus-4-7")
    expect(captured?.max_tokens).toBe(512)
  })

  it("marks the system prompt as an ephemeral cache breakpoint when cacheSystem is set", async () => {
    let captured: Anthropic.MessageCreateParamsNonStreaming | undefined
    const client = createLlmClient({
      createMessage: async (params) => {
        captured = params
        return makeMessage("ok")
      },
    })
    await client.complete({
      messages: [{ role: "user", content: "hi" }],
      system: "You are a coach.",
      cacheSystem: true,
    })
    expect(Array.isArray(captured?.system)).toBe(true)
  })

  it("sends the system prompt as a plain string when caching is off", async () => {
    let captured: Anthropic.MessageCreateParamsNonStreaming | undefined
    const client = createLlmClient({
      createMessage: async (params) => {
        captured = params
        return makeMessage("ok")
      },
    })
    await client.complete({
      messages: [{ role: "user", content: "hi" }],
      system: "You are a coach.",
    })
    expect(captured?.system).toBe("You are a coach.")
  })

  it("maps a thrown SDK error to a typed LlmError failure", async () => {
    const client = createLlmClient({
      createMessage: async () => {
        throw new Error("boom")
      },
    })
    const result = await client.complete({
      messages: [{ role: "user", content: "hi" }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(LlmError)
      expect(result.error.kind).toBe("network_error")
    }
  })

  it("returns a missing_api_key failure when no transport and no key", async () => {
    const original = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      const result = await createLlmClient().complete({
        messages: [{ role: "user", content: "hi" }],
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.kind).toBe("missing_api_key")
      }
    } finally {
      if (original !== undefined) {
        process.env.ANTHROPIC_API_KEY = original
      }
    }
  })

  afterEach(() => {
    // no shared state — guards against future additions
  })
})
