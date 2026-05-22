import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getAnthropicApiKey, hasAnthropicApiKey } from "./config"
import { LlmError } from "./errors"

describe("Anthropic API key config accessor", () => {
  const original = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = original
    }
  })

  it("getAnthropicApiKey returns the key when set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-123"
    expect(getAnthropicApiKey()).toBe("sk-ant-test-123")
  })

  it("getAnthropicApiKey trims surrounding whitespace", () => {
    process.env.ANTHROPIC_API_KEY = "  sk-ant-test-123  "
    expect(getAnthropicApiKey()).toBe("sk-ant-test-123")
  })

  it("getAnthropicApiKey throws a typed missing_api_key error when unset", () => {
    let thrown: unknown
    try {
      getAnthropicApiKey()
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(LlmError)
    expect((thrown as LlmError).kind).toBe("missing_api_key")
  })

  it("getAnthropicApiKey throws when the key is blank", () => {
    process.env.ANTHROPIC_API_KEY = "   "
    expect(() => getAnthropicApiKey()).toThrow(LlmError)
  })

  it("hasAnthropicApiKey reflects whether a key is configured", () => {
    expect(hasAnthropicApiKey()).toBe(false)
    process.env.ANTHROPIC_API_KEY = "sk-ant-test"
    expect(hasAnthropicApiKey()).toBe(true)
  })
})
