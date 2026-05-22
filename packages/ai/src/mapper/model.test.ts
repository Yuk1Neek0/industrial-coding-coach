// Tests for the M6 mapping-pipeline chat-model seam (Issue #105).
//
// `messageContentToText` is the only piece exercisable offline — it normalizes
// a LangChain message's content shape and is pure. `createAnthropicMapperModel`
// itself is constructed lazily and would need an API key + live call to invoke,
// so it is covered through the pipeline's scripted-model tests, not here. CI
// makes no live calls.

import { describe, expect, it } from "vitest"

import { createAnthropicMapperModel, messageContentToText } from "./model"

describe("messageContentToText", () => {
  it("returns a string content unchanged", () => {
    expect(messageContentToText("plain reply")).toBe("plain reply")
  })

  it("concatenates the text blocks of an array content", () => {
    expect(
      messageContentToText([
        { type: "text", text: "first " },
        { type: "text", text: "second" },
      ]),
    ).toBe("first second")
  })

  it("drops non-text content blocks", () => {
    expect(
      messageContentToText([
        { type: "text", text: "keep" },
        { type: "tool_use", id: "t1", name: "x", input: {} },
      ]),
    ).toBe("keep")
  })

  it("returns an empty string for an unexpected content shape", () => {
    expect(messageContentToText(null)).toBe("")
    expect(messageContentToText(42)).toBe("")
  })
})

describe("createAnthropicMapperModel", () => {
  it("constructs without an API key (the model is built lazily)", () => {
    // Importing and constructing must not require ANTHROPIC_API_KEY — the real
    // ChatAnthropic instance is only created on the first `invoke`.
    expect(() =>
      createAnthropicMapperModel({ apiKey: "test-key-not-used" }),
    ).not.toThrow()
  })
})
