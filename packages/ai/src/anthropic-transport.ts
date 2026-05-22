import Anthropic from "@anthropic-ai/sdk"

import { getAnthropicApiKey } from "./config"
import type { LlmTransport } from "./transport"

/**
 * The real {@link LlmTransport}, backed by the official Anthropic SDK.
 *
 * Server-side only — it reads the API key via {@link getAnthropicApiKey},
 * which throws a typed `missing_api_key` error when the key is absent.
 */
export function createAnthropicTransport(): LlmTransport {
  const client = new Anthropic({ apiKey: getAnthropicApiKey() })
  return {
    createMessage: (params) => client.messages.create(params),
  }
}
