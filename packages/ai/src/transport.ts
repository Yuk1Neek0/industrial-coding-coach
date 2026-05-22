import type Anthropic from "@anthropic-ai/sdk"

/**
 * The minimal surface of the Anthropic SDK the client wrapper depends on.
 *
 * Defining this seam lets tests inject a mock transport and run with no API
 * key and zero live calls — the CI-safe test strategy (see issue #74). The
 * real implementation is {@link import("./anthropic-transport").createAnthropicTransport}.
 */
export interface LlmTransport {
  createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message>
}
