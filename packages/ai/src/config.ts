import { missingApiKeyError } from "./errors"

/**
 * Configuration accessor for the Anthropic API key.
 *
 * This is the single place the key is read from the environment. It is
 * **server-side only** — never import this module into a client component.
 * Governed by ADR 0005 (LLM integration).
 */

/** The environment variable holding the Anthropic API key. */
export const ANTHROPIC_API_KEY_ENV = "ANTHROPIC_API_KEY" as const

/**
 * Reads and returns the Anthropic API key from the environment.
 *
 * @throws {import("./errors").LlmError} kind `missing_api_key` when
 *   `ANTHROPIC_API_KEY` is unset or blank.
 */
export function getAnthropicApiKey(): string {
  const key = process.env[ANTHROPIC_API_KEY_ENV]?.trim()
  if (!key) {
    throw missingApiKeyError()
  }
  return key
}

/**
 * Returns whether an Anthropic API key is configured, without throwing.
 *
 * Use this to surface a clean "LLM features unavailable" state instead of
 * letting a missing key crash a request.
 */
export function hasAnthropicApiKey(): boolean {
  return Boolean(process.env[ANTHROPIC_API_KEY_ENV]?.trim())
}
