// Typed error model for the GitHub API client (ADR 0009 §2, PRD FR-7).
//
// Every boundary failure — invalid URL, repo not found, auth failure, rate
// limit — is mapped onto one of these typed error kinds. The client returns a
// discriminated `GitHubResult<T>` so callers handle failure without try/catch
// guesswork, and surface a clear, actionable message (never a silent swallow).

/** The distinct, exhaustive failure modes the client recognizes. */
export type GitHubErrorKind =
  /** A repo URL/spec that could not be parsed into `owner/repo`. */
  | "invalid_url"
  /** The repository (or ref/path) does not exist or is not visible. */
  | "not_found"
  /** A 401/403 the token (or lack of one) cannot satisfy. */
  | "auth_failed"
  /** GitHub's API rate limit is exhausted (ADR 0009 §2). */
  | "rate_limited"
  /** Any other non-2xx HTTP response from GitHub. */
  | "http_error"
  /** The network call itself failed (DNS, offline, timeout, ...). */
  | "network_error"

/**
 * A typed GitHub client error. Carries a human-readable, actionable `message`
 * plus structured detail callers can branch on or render.
 */
export class GitHubError extends Error {
  /** Which boundary failure this is. */
  readonly kind: GitHubErrorKind
  /** HTTP status code, when the failure came from an HTTP response. */
  readonly status?: number
  /**
   * For `rate_limited`: the Unix epoch (seconds) the limit window resets, from
   * the `x-ratelimit-reset` header, when present.
   */
  readonly rateLimitResetAt?: number

  constructor(
    kind: GitHubErrorKind,
    message: string,
    options?: { status?: number; rateLimitResetAt?: number; cause?: unknown },
  ) {
    super(message, { cause: options?.cause })
    this.name = "GitHubError"
    this.kind = kind
    this.status = options?.status
    this.rateLimitResetAt = options?.rateLimitResetAt
  }
}

/** A successful client call. */
export interface GitHubOk<T> {
  ok: true
  data: T
}

/** A failed client call, carrying the typed error. */
export interface GitHubFail {
  ok: false
  error: GitHubError
}

/**
 * The discriminated result every client method returns. Callers narrow on
 * `result.ok` — there is no thrown control flow for expected boundary errors.
 */
export type GitHubResult<T> = GitHubOk<T> | GitHubFail

/** Wrap a value as a successful result. */
export function ok<T>(data: T): GitHubOk<T> {
  return { ok: true, data }
}

/** Wrap a {@link GitHubError} as a failed result. */
export function fail(error: GitHubError): GitHubFail {
  return { ok: false, error }
}

/**
 * Format a rate-limit reset epoch (seconds) as a short local time, for use in
 * the actionable error message ADR 0009 §2 requires.
 */
export function formatResetTime(resetEpochSeconds: number): string {
  return new Date(resetEpochSeconds * 1000).toLocaleTimeString()
}
