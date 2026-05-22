import { describe, expect, it } from "vitest"

import { createLlmClient } from "./client"
import { LlmError } from "./errors"
import { createMockTransport, mockMessage } from "./testing"

const emptyParams = { model: "m", max_tokens: 16, messages: [] }

describe("mock transport harness", () => {
  it("mockMessage builds a text message from the text shorthand", () => {
    const block = mockMessage({ text: "hello" }).content[0]
    expect(block?.type).toBe("text")
    if (block?.type === "text") {
      expect(block.text).toBe("hello")
    }
  })

  it("serves scripted replies in order, repeating the last", async () => {
    const transport = createMockTransport({
      replies: [{ text: "one" }, { text: "two" }],
    })
    const texts: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const block = (await transport.createMessage(emptyParams)).content[0]
      texts.push(block?.type === "text" ? block.text : "")
    }
    expect(texts).toEqual(["one", "two", "two"])
  })

  it("records every call for assertions", async () => {
    const transport = createMockTransport()
    await transport.createMessage({ ...emptyParams, model: "x" })
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0]?.model).toBe("x")
  })

  it("rejects with the configured value to exercise error mapping", async () => {
    const transport = createMockTransport({ throws: new Error("nope") })
    await expect(transport.createMessage(emptyParams)).rejects.toThrow("nope")
  })

  it("smoke test: createLlmClient runs end-to-end against the mock with no API key", async () => {
    const original = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      const client = createLlmClient(
        createMockTransport({ replies: [{ text: "coached!" }] }),
      )
      const result = await client.complete({
        messages: [{ role: "user", content: "hi" }],
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        const block = result.data.content[0]
        expect(block?.type).toBe("text")
        if (block?.type === "text") {
          expect(block.text).toBe("coached!")
        }
      }
    } finally {
      if (original !== undefined) {
        process.env.ANTHROPIC_API_KEY = original
      }
    }
  })

  it("smoke test: a thrown reply surfaces as a typed LlmError failure", async () => {
    const client = createLlmClient(
      createMockTransport({ throws: new Error("boom") }),
    )
    const result = await client.complete({
      messages: [{ role: "user", content: "hi" }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(LlmError)
    }
  })
})
