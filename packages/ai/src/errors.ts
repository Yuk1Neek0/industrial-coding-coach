// Typed error model for the @workspace/ai LLM client.
//
// Mirrors the packages/db/src/github error pattern: one error class with a
// `kind` discriminator, plus a discriminated `LlmResult<T>` so callers handle
// expected boundary failures without try/catch guesswork. Governed by ADR 0005.

import Anthropic from "@anthropic-ai/sdk"

/** The distinct, exhaustive failure modes the LLM client recognizes. */
export type LlmErrorKind =
  /** `ANTHROPIC_API_KEY` is not configured. */
  | "missing_api_key"
  /** The API rejected the key — 401/403. */
  | "auth_failed"
  /** The Anthropic API rate limit is exhausted — 429. */
  | "rate_limited"
  /** The request timed out. */
  | "timeout"
  /** Any other non-2xx response from the API. */
  | "api_error"
  /** The network call itself failed (DNS, offline, ...). */
  | "network_error"

/**
 * A typed LLM client error. Carries a human-readable, actionable `message`
 * plus a `kind` callers can branch on or render.
 */
export class LlmError extends Error {
  /** Which boundary failure this is. */
  readonly kind: LlmErrorKind
  /** HTTP status code, when the failure came from an API response. */
  readonly status?: number

  constructor(
    kind: LlmErrorKind,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, { cause: options?.cause })
    this.name = "LlmError"
    this.kind = kind
    this.status = options?.status
  }
}

/** A successful client call. */
export interface LlmOk<T> {
  ok: true
  data: T
}

/** A failed client call, carrying the typed error. */
export interface LlmFail {
  ok: false
  error: LlmError
}

/**
 * The discriminated result a bounded LLM call returns. Callers narrow on
 * `result.ok` — expected boundary failures are not thrown.
 */
export type LlmResult<T> = LlmOk<T> | LlmFail

/** Wrap a value as a successful result. */
export function ok<T>(data: T): LlmOk<T> {
  return { ok: true, data }
}

/** Wrap an {@link LlmError} as a failed result. */
export function fail(error: LlmError): LlmFail {
  return { ok: false, error }
}

/** Build the `missing_api_key` error with its actionable message. */
export function missingApiKeyError(): LlmError {
  return new LlmError(
    "missing_api_key",
    "ANTHROPIC_API_KEY is not set. Add it to your local .env file " +
      "(see .env.example). It is read server-side only.",
  )
}

/**
 * Map an unknown thrown value — typically an Anthropic SDK error — onto a typed
 * {@link LlmError}. An already-typed `LlmError` passes through unchanged.
 *
 * Specific SDK error types are checked before the generic `APIError` so each
 * maps to the most precise {@link LlmErrorKind}.
 */
export function mapAnthropicError(err: unknown): LlmError {
  if (err instanceof LlmError) {
    return err
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new LlmError("timeout", "The Anthropic API request timed out.", {
      cause: err,
    })
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new LlmError(
      "network_error",
      "Could not reach the Anthropic API. Check your network connection.",
      { cause: err },
    )
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LlmError(
      "rate_limited",
      "The Anthropic API rate limit is exhausted. Retry shortly.",
      { status: 429, cause: err },
    )
  }
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    return new LlmError(
      "auth_failed",
      "The Anthropic API rejected the API key. Check ANTHROPIC_API_KEY.",
      { status: err.status, cause: err },
    )
  }
  if (err instanceof Anthropic.APIError) {
    return new LlmError(
      "api_error",
      `The Anthropic API returned an error: ${err.message}`,
      { status: err.status, cause: err },
    )
  }
  return new LlmError(
    "network_error",
    "An unexpected error occurred calling the Anthropic API.",
    { cause: err },
  )
}
