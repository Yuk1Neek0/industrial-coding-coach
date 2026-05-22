// The chat-model seam for the M6 Project Logic Mapper pipeline
// (project-logic-mapper epic, Issue #105).
//
// The LangGraph mapping pipeline's agentic nodes reason over retrieved code by
// calling a chat model. This module is the seam between the pipeline and that
// model: a minimal {@link MapperModel} interface the pipeline depends on, plus
// the real implementation backed by LangChain's Anthropic integration
// (`@langchain/anthropic`'s `ChatAnthropic`).
//
// The seam exists for the same reason as `@workspace/ai`'s `LlmTransport`: it
// lets the pipeline's tests inject a scripted model and run with NO API key and
// zero live calls — the CI contract for the `@workspace/ai` package (#74). The
// real `ChatAnthropic` model is created lazily, so importing the pipeline never
// requires an `ANTHROPIC_API_KEY`. LangChain stays confined to the M6 package
// per ADR 0005.

import { ChatAnthropic } from "@langchain/anthropic"
import { HumanMessage, SystemMessage } from "@langchain/core/messages"

import { DEFAULT_MAX_TOKENS, DEFAULT_MODEL } from "../model"

/** A single bounded prompt for a mapping-pipeline node. */
export interface MapperModelRequest {
  /** The system prompt — the node's role and output contract. */
  system: string
  /** The user prompt — the task plus the retrieved code grounding it. */
  prompt: string
  /** Output-token cap for this call. Defaults to {@link DEFAULT_MAX_TOKENS}. */
  maxTokens?: number
}

/**
 * The chat-model seam the LangGraph mapping pipeline depends on.
 *
 * One method: run a bounded prompt and return the model's text. Each agentic
 * pipeline node asks for a JSON document and parses it — there is no tool-use
 * round-trip, which keeps both the seam and its mock trivially small.
 *
 * The real implementation is {@link createAnthropicMapperModel}; tests pass a
 * scripted fake (see `createScriptedMapperModel` in `./testing` usage).
 */
export interface MapperModel {
  /** Run one bounded prompt; resolves to the model's plain-text reply. */
  invoke(request: MapperModelRequest): Promise<string>
}

/** Options for {@link createAnthropicMapperModel}. */
export interface AnthropicMapperModelOptions {
  /** Model id; defaults to {@link DEFAULT_MODEL}. */
  model?: string
  /** API key; defaults to `process.env.ANTHROPIC_API_KEY`. */
  apiKey?: string
  /** Default output-token cap; defaults to {@link DEFAULT_MAX_TOKENS}. */
  maxTokens?: number
}

/**
 * Reduce a LangChain message's content to a single plain-text string.
 *
 * `ChatAnthropic` returns `AIMessage.content` either as a string or as an array
 * of typed content blocks; the pipeline only needs the text, so non-text blocks
 * are dropped and text blocks are concatenated.
 */
export function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block)
    } else if (
      typeof block === "object" &&
      block !== null &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      parts.push((block as { text: string }).text)
    }
  }
  return parts.join("")
}

/**
 * Create the real {@link MapperModel}, backed by LangChain's `ChatAnthropic`
 * (the Anthropic integration the pipeline reaches Claude through — Issue #105
 * acceptance criterion).
 *
 * The `ChatAnthropic` instance is created lazily on the first `invoke`, so a
 * caller that only ever injects a fake (every test) never constructs it and
 * never needs an API key.
 */
export function createAnthropicMapperModel(
  options?: AnthropicMapperModelOptions,
): MapperModel {
  const defaultMaxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS
  /** Lazily built `ChatAnthropic`, keyed by output-token cap (rarely varies). */
  const byMaxTokens = new Map<number, ChatAnthropic>()

  const getChat = (maxTokens: number): ChatAnthropic => {
    const existing = byMaxTokens.get(maxTokens)
    if (existing) return existing
    const chat = new ChatAnthropic({
      model: options?.model ?? DEFAULT_MODEL,
      maxTokens,
      ...(options?.apiKey ? { apiKey: options.apiKey } : {}),
    })
    byMaxTokens.set(maxTokens, chat)
    return chat
  }

  return {
    async invoke(request) {
      const maxTokens = request.maxTokens ?? defaultMaxTokens
      const message = await getChat(maxTokens).invoke([
        new SystemMessage(request.system),
        new HumanMessage(request.prompt),
      ])
      return messageContentToText(message.content)
    },
  }
}
