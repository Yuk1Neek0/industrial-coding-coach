import type Anthropic from "@anthropic-ai/sdk"

import type { LlmTransport } from "./transport"

/**
 * CI-safe test harness for `@workspace/ai`.
 *
 * {@link createMockTransport} returns a real {@link LlmTransport} that serves
 * scripted replies instead of calling the Anthropic API — so LLM-backed code
 * (M4 / M5) is unit-tested with no API key set and zero live calls. Import it
 * from `@workspace/ai/testing`.
 */

/** A scripted reply for the mock transport. */
export interface MockReply {
  /** Shorthand for a single text content block. */
  text?: string
  /** Explicit content blocks — use this for tool-use replies. */
  content?: Anthropic.ContentBlock[]
  /** Stop reason; defaults to `"end_turn"`. */
  stopReason?: Anthropic.Message["stop_reason"]
}

/** A mock {@link LlmTransport} that also records the calls made through it. */
export interface MockTransport extends LlmTransport {
  /** Params of every `createMessage` call, oldest first — for assertions. */
  readonly calls: ReadonlyArray<Anthropic.MessageCreateParamsNonStreaming>
}

/** Build a complete Anthropic `Message` from a scripted {@link MockReply}. */
export function mockMessage(reply: MockReply = {}): Anthropic.Message {
  const content: Anthropic.ContentBlock[] = reply.content ?? [
    { type: "text", text: reply.text ?? "", citations: null },
  ]
  return {
    id: "msg_mock",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content,
    stop_reason: reply.stopReason ?? "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as Anthropic.Message
}

/**
 * Create a mock {@link LlmTransport} for CI-safe tests.
 *
 * @param options.replies - scripted replies consumed in order; once exhausted
 *   the last reply repeats. Defaults to a single empty text reply.
 * @param options.throws - when set, every call rejects with this value —
 *   use it to exercise `mapAnthropicError` and the failure path.
 */
export function createMockTransport(options?: {
  replies?: MockReply[]
  throws?: unknown
}): MockTransport {
  const replies = options?.replies ?? [{}]
  const thrown = options?.throws
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = []
  let index = 0

  return {
    calls,
    createMessage(params) {
      calls.push(params)
      if (thrown !== undefined) {
        return Promise.reject(thrown)
      }
      const reply = replies[Math.min(index, replies.length - 1)] ?? {}
      index += 1
      return Promise.resolve(mockMessage(reply))
    },
  }
}
