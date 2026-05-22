/**
 * Default model selection for bounded LLM calls. Governed by ADR 0005.
 *
 * Sonnet is the cost-aware default for the foundation's bounded
 * prompt → structured-output calls (M4 / M5 / M8). A caller that needs more
 * capability overrides it per request via `LlmRequest.model`.
 */
export const DEFAULT_MODEL = "claude-sonnet-4-6"

/** Default cap on output tokens for a bounded call. */
export const DEFAULT_MAX_TOKENS = 2048
