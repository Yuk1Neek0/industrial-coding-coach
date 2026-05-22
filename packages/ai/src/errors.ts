/**
 * Typed errors for the `@workspace/ai` package.
 *
 * This module starts with the configuration error needed by the config
 * accessor. The LLM client wrapper task (issue #73) extends it with the
 * rate-limit, API-failure, and timeout errors mapped from the Anthropic SDK.
 *
 * Governed by ADR 0005.
 */

/** Base class for all `@workspace/ai` errors. */
export class AiError extends Error {
  constructor(message: string) {
    super(message)
    // Use the concrete subclass name so `error.name` is meaningful.
    this.name = new.target.name
  }
}

/**
 * Thrown when `ANTHROPIC_API_KEY` is not configured.
 *
 * The message is actionable: it points at `.env` / `.env.example` so a missing
 * key surfaces as a clear setup step rather than an opaque SDK failure.
 */
export class MissingApiKeyError extends AiError {
  constructor() {
    super(
      "ANTHROPIC_API_KEY is not set. Add it to your local .env file " +
        "(see .env.example). It is read server-side only.",
    )
  }
}
