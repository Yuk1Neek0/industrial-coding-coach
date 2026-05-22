import type Anthropic from "@anthropic-ai/sdk"

import { createAnthropicTransport } from "./anthropic-transport"
import { fail, mapAnthropicError, ok, type LlmResult } from "./errors"
import { DEFAULT_MAX_TOKENS, DEFAULT_MODEL } from "./model"
import type { LlmTransport } from "./transport"

/**
 * Server-side LLM client wrapper for the @workspace/ai package.
 *
 * A thin, reviewable wrapper around a single bounded
 * prompt → structured-output call on the Anthropic SDK — not an abstraction
 * layer and not an autonomous agent (ADR 0005). It supports prompt caching,
 * tool use, and structured outputs; it never throws for an expected boundary
 * failure, returning a discriminated {@link LlmResult} instead.
 */

/** A bounded LLM request. */
export interface LlmRequest {
  /** Optional system prompt. */
  system?: string
  /**
   * Cache the system prompt as an ephemeral breakpoint, to cut input cost on
   * repeated calls that share the same system prompt (prompt caching).
   */
  cacheSystem?: boolean
  /** The conversation messages. */
  messages: Anthropic.MessageParam[]
  /** Model id; defaults to {@link DEFAULT_MODEL}. */
  model?: string
  /** Max output tokens; defaults to {@link DEFAULT_MAX_TOKENS}. */
  maxTokens?: number
  /** Tools the model may call — enables tool use and structured outputs. */
  tools?: Anthropic.Tool[]
  /** Constrain tool choice — e.g. force a tool to elicit structured output. */
  toolChoice?: Anthropic.MessageCreateParams["tool_choice"]
}

/** The successful payload of a bounded LLM call. */
export interface LlmResponse {
  /** The response content blocks (text and/or tool-use blocks). */
  content: Anthropic.ContentBlock[]
  /** Why the model stopped. */
  stopReason: Anthropic.Message["stop_reason"]
  /** Token usage for the call. */
  usage: Anthropic.Message["usage"]
}

/** The LLM client surface M4 / M5 build their bounded calls on. */
export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResult<LlmResponse>>
}

/** Build the `system` param, applying prompt caching when requested. */
function buildSystem(
  request: LlmRequest,
): Anthropic.MessageCreateParams["system"] | undefined {
  if (!request.system) {
    return undefined
  }
  if (!request.cacheSystem) {
    return request.system
  }
  return [
    {
      type: "text",
      text: request.system,
      cache_control: { type: "ephemeral" },
    },
  ]
}

/**
 * Create an {@link LlmClient}.
 *
 * @param transport - injected for tests; when omitted, the real Anthropic
 *   transport is created lazily on the first `complete()` call, so importing
 *   this module never requires an API key.
 */
export function createLlmClient(transport?: LlmTransport): LlmClient {
  let resolved: LlmTransport | undefined = transport
  const getTransport = (): LlmTransport =>
    (resolved ??= createAnthropicTransport())

  return {
    async complete(request) {
      try {
        const system = buildSystem(request)
        const message = await getTransport().createMessage({
          model: request.model ?? DEFAULT_MODEL,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: request.messages,
          ...(system !== undefined ? { system } : {}),
          ...(request.tools ? { tools: request.tools } : {}),
          ...(request.toolChoice ? { tool_choice: request.toolChoice } : {}),
        })
        return ok({
          content: message.content,
          stopReason: message.stop_reason,
          usage: message.usage,
        })
      } catch (err) {
        return fail(mapAnthropicError(err))
      }
    },
  }
}
