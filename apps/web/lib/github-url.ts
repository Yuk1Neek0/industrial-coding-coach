// Client-safe GitHub repository URL parser for the /import page.
//
// The import page parses the user's URL into owner/repo BEFORE any network
// call (page spec §7) so an unparseable value becomes the `invalid-url` error
// state with no round-trip. This mirrors the server-side `parseRepoUrl` in
// `@workspace/db` but is dependency-free pure string logic, safe to run inside
// a Client Component. The server still validates on import — this is the UX
// pre-check.

/** An owner/repo pair parsed from a GitHub URL or shorthand. */
export interface ParsedRepo {
  owner: string
  repo: string
}

/** A GitHub path segment: word characters plus dot and dash. */
const SEGMENT = /^[\w.-]+$/

/**
 * Parse a GitHub repository URL or `owner/repo` shorthand into `owner`/`repo`,
 * or return `null` when the value is not a recognizable GitHub repo address.
 *
 * Accepts the forms a beginner would paste: a full `https://github.com/owner/repo`
 * browser URL (with or without the scheme, a `.git` suffix, or a trailing
 * slash/path), the `git@github.com:owner/repo.git` SSH form, and the bare
 * `owner/repo` shorthand.
 */
export function parseGitHubRepoUrl(input: string): ParsedRepo | null {
  const trimmed = input.trim()
  if (trimmed.length === 0) return null

  // git@github.com:owner/repo(.git)
  const scp = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(trimmed)
  if (scp) return { owner: scp[1]!, repo: scp[2]! }

  // owner/repo shorthand — no scheme, no host.
  if (!trimmed.includes("://") && !trimmed.includes("@")) {
    const short = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(trimmed)
    if (short) return { owner: short[1]!, repo: short[2]! }
  }

  // A full URL — tolerate a missing scheme by assuming https:// (page spec §7).
  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (host !== "github.com" && host !== "www.github.com") return null

  const segments = url.pathname.split("/").filter(Boolean)
  if (segments.length < 2) return null
  const owner = segments[0]!
  const repo = segments[1]!.replace(/\.git$/, "")
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) return null
  return { owner, repo }
}
