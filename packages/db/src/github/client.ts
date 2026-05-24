// GitHub REST API client — token auth, repo metadata, file tree, file content,
// and rate-limit/error handling (ADR 0009, PRD FR-1/FR-4/FR-7, Issue #38).
//
// Read-only by design: the client issues only GET requests and never writes to
// a user's repository (ADR 0009 §1). Authentication is an OPTIONAL token read
// from `GITHUB_TOKEN`; with no token the client works against public repos at
// GitHub's unauthenticated rate limit.
//
// Rate limiting (ADR 0009 §2): a 403/429 with `x-ratelimit-remaining: 0` is
// detected and surfaced as a clear, actionable error naming the reset time and
// the GITHUB_TOKEN fix. There is NO blocking retry/backoff loop.

import {
  fail,
  formatResetTime,
  GitHubError,
  ok,
  type GitHubResult,
} from "./errors"

/** GitHub's public REST API base. */
const DEFAULT_BASE_URL = "https://api.github.com"

/** REST API version GitHub recommends pinning via the `X-GitHub-Api-Version` header. */
const API_VERSION = "2022-11-28"

/**
 * A reference (branch, tag, or commit SHA) `owner/repo` pair. The canonical
 * unit the client and the import module operate on.
 */
export interface RepoRef {
  owner: string
  repo: string
}

/** Repository metadata, the subset the import snapshot needs (ADR 0009 §3). */
export interface RepoMetadata {
  owner: string
  repo: string
  /** Repository description, or `null` when none is set. */
  description: string | null
  /** Default branch name reported by GitHub, e.g. `main`. */
  defaultBranch: string
  /** Primary language reported by GitHub, or `null`. */
  primaryLanguage: string | null
  /** Whether the repository is private. */
  isPrivate: boolean
  /** Canonical HTML URL of the repository. */
  htmlUrl: string
}

/** One entry of a repository's recursive file tree. */
export interface TreeEntry {
  /** Path relative to the repo root, e.g. `apps/web/package.json`. */
  path: string
  type: "blob" | "tree"
  /** Git object SHA. */
  sha: string
  /** Size in bytes; present for blobs only. */
  size?: number
}

/** A repository's file tree at a resolved commit. */
export interface RepoTree {
  /** The commit SHA the tree was taken at. */
  commitSha: string
  /** Tree entries in GitHub's returned order. */
  entries: TreeEntry[]
  /**
   * `true` when GitHub truncated the recursive tree (very large repos). The
   * import module can decide how to handle a partial tree; the client surfaces
   * the fact rather than hiding it.
   */
  truncated: boolean
}

/** A single file's decoded text content. */
export interface FileContent {
  /** Path relative to the repo root. */
  path: string
  /** Git blob SHA. */
  sha: string
  /** Size in bytes as reported by GitHub. */
  size: number
  /** The file's decoded UTF-8 text content. */
  content: string
}

/** GitHub's REST shape for `GET /repos/{owner}/{repo}/pulls/{number}`. */
export interface PullRequestApiResponse {
  number: number
  title: string
  /** PR description body — may be `null` when empty. */
  body: string | null
  state: string
  html_url: string
  /** Total additions across the PR, summed by GitHub. */
  additions: number
  /** Total deletions across the PR, summed by GitHub. */
  deletions: number
  /** Number of files the PR changes, reported by GitHub. */
  changed_files: number
  head: { ref: string; sha: string }
  base: { ref: string; sha: string }
}

/** GitHub's REST shape for one entry of `GET .../pulls/{number}/files`. */
export interface PullRequestFileApiResponse {
  filename: string
  /** `added` | `removed` | `modified` | `renamed` | `copied` | `changed` | `unchanged`. */
  status: string
  additions: number
  deletions: number
  changes: number
  /** Prior path for a rename; absent otherwise. */
  previous_filename?: string
  /**
   * The per-file unified diff hunk text. Absent for binary files and for very
   * large files GitHub omits the patch on.
   */
  patch?: string
}

/** GitHub's REST shape for one entry of `GET .../issues/{number}/timeline`. */
export interface TimelineEventApiResponse {
  event: string
  source?: {
    type?: string
    issue?: { number: number; pull_request?: unknown }
  }
}

/** A label entry on a GitHub issue. */
export interface IssueLabelApiResponse {
  name: string
}

/** GitHub's REST shape for `GET /repos/{owner}/{repo}/issues/{number}`. */
export interface IssueApiResponse {
  number: number
  title: string
  body: string | null
  state: string
  html_url: string
  /**
   * Labels attached to the issue. GitHub returns `{ name, color, ... }` objects;
   * only `name` is consumed by the M7 issue-fetch surface (Issue #132). Older
   * responses sometimes return plain strings — both shapes are accepted.
   */
  labels?: (IssueLabelApiResponse | string)[]
  /** Present only when the issue is itself a pull request. */
  pull_request?: unknown
}

/** Options for {@link createGitHubClient}. */
export interface GitHubClientOptions {
  /**
   * GitHub token. Defaults to `process.env.GITHUB_TOKEN`. Optional: omit/empty
   * for public-repo, unauthenticated access (ADR 0009 §1).
   */
  token?: string
  /** Override the API base URL — used by tests. Defaults to api.github.com. */
  baseUrl?: string
  /**
   * `fetch` implementation. Defaults to the global `fetch` (Node 18+/22).
   * Injectable so tests mock the network without hitting GitHub.
   */
  fetchImpl?: typeof fetch
}

/** GitHub's REST shape for `GET /repos/{owner}/{repo}`. */
interface RepoApiResponse {
  description: string | null
  default_branch: string
  language: string | null
  private: boolean
  html_url: string
}

/** GitHub's REST shape for `GET /repos/{owner}/{repo}/git/trees/{sha}`. */
interface TreeApiResponse {
  sha: string
  truncated: boolean
  tree: {
    path: string
    type: "blob" | "tree" | "commit"
    sha: string
    size?: number
  }[]
}

/** GitHub's REST shape for `GET /repos/{owner}/{repo}/contents/{path}`. */
interface ContentsApiResponse {
  type: string
  path: string
  sha: string
  size: number
  content?: string
  encoding?: string
}

/**
 * Parse a GitHub repository URL or `owner/repo` shorthand into a {@link RepoRef}.
 *
 * Accepts: `https://github.com/owner/repo`, `.../owner/repo.git`,
 * `git@github.com:owner/repo.git`, and the bare `owner/repo` form. Returns a
 * typed `invalid_url` error result for anything else (PRD FR-7).
 */
export function parseRepoUrl(input: string): GitHubResult<RepoRef> {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return fail(new GitHubError("invalid_url", "Repository URL is empty."))
  }

  // owner/repo shorthand — letters/digits/._- in each segment, exactly one slash.
  const shorthand = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/
  const shorthandMatch = shorthand.exec(trimmed)
  if (shorthandMatch && !trimmed.includes("://") && !trimmed.includes("@")) {
    return ok({ owner: shorthandMatch[1]!, repo: shorthandMatch[2]! })
  }

  // git@github.com:owner/repo(.git)
  const scp = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/
  const scpMatch = scp.exec(trimmed)
  if (scpMatch) {
    return ok({ owner: scpMatch[1]!, repo: scpMatch[2]! })
  }

  // https://github.com/owner/repo(...) — tolerate trailing path/.git/slash.
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return fail(
      new GitHubError(
        "invalid_url",
        `"${input}" is not a valid GitHub repository URL or owner/repo.`,
      ),
    )
  }
  const host = url.hostname.toLowerCase()
  if (host !== "github.com" && host !== "www.github.com") {
    return fail(
      new GitHubError(
        "invalid_url",
        `"${input}" is not a github.com URL. Only GitHub repositories are supported.`,
      ),
    )
  }
  const segments = url.pathname.split("/").filter(Boolean)
  if (segments.length < 2) {
    return fail(
      new GitHubError(
        "invalid_url",
        `"${input}" does not contain an owner/repo path.`,
      ),
    )
  }
  const owner = segments[0]!
  const repo = segments[1]!.replace(/\.git$/, "")
  if (owner.length === 0 || repo.length === 0) {
    return fail(
      new GitHubError("invalid_url", `"${input}" has an empty owner or repo.`),
    )
  }
  return ok({ owner, repo })
}

/** Read the numeric `x-ratelimit-*` header, or `undefined` when absent/invalid. */
function rateLimitHeader(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name)
  if (raw === null) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Map a non-OK `Response` onto a typed {@link GitHubError}.
 *
 * Rate-limit detection (ADR 0009 §2): a 403/429 with `x-ratelimit-remaining: 0`
 * is classified `rate_limited` — distinct from an auth failure — and the
 * message names the reset time and the GITHUB_TOKEN fix. A 403/429 WITHOUT an
 * exhausted remaining count is treated as auth/permission failure.
 */
async function errorFromResponse(
  response: Response,
  context: string,
): Promise<GitHubError> {
  const { status, headers } = response
  const remaining = rateLimitHeader(headers, "x-ratelimit-remaining")
  const reset = rateLimitHeader(headers, "x-ratelimit-reset")

  if ((status === 403 || status === 429) && remaining === 0) {
    const resetClause =
      reset !== undefined
        ? ` It resets at ${formatResetTime(reset)}.`
        : ""
    return new GitHubError(
      "rate_limited",
      `GitHub API rate limit exceeded while ${context}.${resetClause} ` +
        `Set GITHUB_TOKEN in your .env for the higher authenticated limit ` +
        `(5,000 requests/hour).`,
      { status, rateLimitResetAt: reset },
    )
  }

  if (status === 401) {
    return new GitHubError(
      "auth_failed",
      `GitHub rejected the credentials while ${context}. ` +
        `Check that GITHUB_TOKEN in your .env is a valid, non-expired token.`,
      { status },
    )
  }

  if (status === 403) {
    return new GitHubError(
      "auth_failed",
      `Access to this resource was forbidden while ${context}. ` +
        `A private repository needs a GITHUB_TOKEN with read access to it.`,
      { status },
    )
  }

  if (status === 404) {
    return new GitHubError(
      "not_found",
      `GitHub returned 404 while ${context}. The repository, ref, or file ` +
        `was not found — or it is private and the token cannot see it.`,
      { status },
    )
  }

  return new GitHubError(
    "http_error",
    `GitHub returned an unexpected ${status} response while ${context}.`,
    { status },
  )
}

/**
 * A read-only GitHub REST API client. Create one with {@link createGitHubClient}.
 */
export interface GitHubClient {
  /** Whether a token was supplied (drives auth headers + rate-limit ceiling). */
  readonly authenticated: boolean
  /** Fetch repository metadata. */
  getRepoMetadata(ref: RepoRef): Promise<GitHubResult<RepoMetadata>>
  /**
   * Fetch the recursive file tree at a ref (branch/tag/commit SHA). Defaults to
   * the repository's default branch when `gitRef` is omitted.
   */
  getRepoTree(ref: RepoRef, gitRef?: string): Promise<GitHubResult<RepoTree>>
  /** Fetch and decode a single file's text content at a ref. */
  getFileContent(
    ref: RepoRef,
    filePath: string,
    gitRef?: string,
  ): Promise<GitHubResult<FileContent>>
  /** Fetch a pull request's metadata (title, body, head/base, totals). */
  getPullRequest(
    ref: RepoRef,
    prNumber: number,
  ): Promise<GitHubResult<PullRequestApiResponse>>
  /**
   * Fetch a pull request's changed-file list, paginated. Each entry carries the
   * per-file unified diff `patch` (absent for binary/oversize files).
   *
   * @param maxFiles - hard cap on files fetched, so a very large PR cannot run
   *   the client unbounded across pages (ADR 0009 §2 — stay under rate limits).
   */
  getPullRequestFiles(
    ref: RepoRef,
    prNumber: number,
    maxFiles?: number,
  ): Promise<GitHubResult<{ files: PullRequestFileApiResponse[]; truncated: boolean }>>
  /**
   * Fetch the issue number a pull request links to (the "Closes #N" / linked
   * issue), or `null` when the PR links no issue. Uses the issue timeline's
   * `cross-referenced` / `connected` events plus a body-keyword fallback.
   */
  getLinkedIssueNumber(
    ref: RepoRef,
    prNumber: number,
    prBody?: string | null,
  ): Promise<GitHubResult<number | null>>
  /** Fetch a single issue's metadata (title, body, state, labels). */
  getIssue(
    ref: RepoRef,
    issueNumber: number,
  ): Promise<GitHubResult<IssueApiResponse>>
  /**
   * List a repository's issues, paginated. GitHub's `/issues` endpoint mixes
   * issues and pull requests in one feed — pull requests carry a `pull_request`
   * key; the client returns the raw page entries and the caller filters them
   * (the M7 issue-fetch surface does, Issue #132).
   *
   * @param maxIssues - hard cap on issues fetched across pages so a very large
   *   repository cannot run the client unbounded (ADR 0009 §2).
   */
  listIssues(
    ref: RepoRef,
    options?: { state?: "open" | "closed" | "all"; maxIssues?: number },
  ): Promise<GitHubResult<{ issues: IssueApiResponse[]; truncated: boolean }>>
  /**
   * Fetch an issue's timeline events. The M7 issue-fetch surface reads
   * `cross-referenced` / `connected` events whose source is itself a PR to
   * discover the PRs linked to an issue (Issue #132), the dual of
   * `getLinkedIssueNumber`'s PR → issue walk.
   */
  getIssueTimeline(
    ref: RepoRef,
    issueNumber: number,
  ): Promise<GitHubResult<TimelineEventApiResponse[]>>
}

/** Default page size for the PR files endpoint (GitHub's max is 100). */
const PR_FILES_PAGE_SIZE = 100

/** Default page size for the issues list endpoint (GitHub's max is 100). */
const ISSUES_PAGE_SIZE = 100

/**
 * Default cap on the number of changed files fetched for one PR. A PR larger
 * than this is fetched up to the cap and flagged `truncated`, so the change
 * model stays bounded for a very large PR (ADR 0009 §2).
 */
export const DEFAULT_MAX_PR_FILES = 300

/**
 * Default cap on the number of issues fetched for one repository. A repo with
 * more issues than this is fetched up to the cap and flagged `truncated`, so
 * the issues list stays bounded against the rate limit (ADR 0009 §2).
 */
export const DEFAULT_MAX_ISSUES = 300

/**
 * GitHub keywords that, followed by `#N` (or `owner/repo#N`), link a PR to an
 * issue it will close. Matched case-insensitively in a PR body as a fallback
 * when the timeline carries no connected/cross-referenced event.
 */
const ISSUE_LINK_KEYWORDS =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b[\s:]+(?:[\w.-]+\/[\w.-]+)?#(\d+)/i

/**
 * Create a read-only GitHub REST API client (ADR 0009, Issue #38).
 *
 * @param options - token, base URL, and `fetch` overrides. With no token the
 *   client reads `process.env.GITHUB_TOKEN`; an empty/absent token yields an
 *   unauthenticated client (public repos, lower rate limit).
 */
export function createGitHubClient(
  options: GitHubClientOptions = {},
): GitHubClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
  const doFetch = options.fetchImpl ?? globalThis.fetch
  if (typeof doFetch !== "function") {
    throw new Error(
      "No fetch implementation available. Pass `fetchImpl` or run on Node 18+.",
    )
  }

  const rawToken = options.token ?? process.env.GITHUB_TOKEN
  const token = rawToken && rawToken.trim().length > 0 ? rawToken.trim() : undefined

  /** Headers every request carries; the Authorization header is token-gated. */
  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "industrial-coding-coach",
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    return headers
  }

  /**
   * Issue a GET and return the parsed JSON, or a typed failure. Network errors
   * and non-2xx responses are both mapped onto {@link GitHubError}; this never
   * throws for an expected boundary error.
   */
  async function getJson<T>(
    pathAndQuery: string,
    context: string,
  ): Promise<GitHubResult<T>> {
    let response: Response
    try {
      response = await doFetch(`${baseUrl}${pathAndQuery}`, {
        method: "GET",
        headers: buildHeaders(),
      })
    } catch (cause) {
      return fail(
        new GitHubError(
          "network_error",
          `Could not reach GitHub while ${context}. Check your network ` +
            `connection.`,
          { cause },
        ),
      )
    }

    if (!response.ok) {
      return fail(await errorFromResponse(response, context))
    }

    try {
      return ok((await response.json()) as T)
    } catch (cause) {
      return fail(
        new GitHubError(
          "http_error",
          `GitHub returned a response that could not be parsed while ` +
            `${context}.`,
          { status: response.status, cause },
        ),
      )
    }
  }

  return {
    authenticated: token !== undefined,

    async getRepoMetadata(ref) {
      const result = await getJson<RepoApiResponse>(
        `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`,
        `fetching metadata for ${ref.owner}/${ref.repo}`,
      )
      if (!result.ok) return result
      const raw = result.data
      return ok({
        owner: ref.owner,
        repo: ref.repo,
        description: raw.description,
        defaultBranch: raw.default_branch,
        primaryLanguage: raw.language,
        isPrivate: raw.private,
        htmlUrl: raw.html_url,
      })
    },

    async getRepoTree(ref, gitRef) {
      // Resolve the default branch when no ref was given.
      let treeRef = gitRef
      if (treeRef === undefined || treeRef.trim().length === 0) {
        const meta = await this.getRepoMetadata(ref)
        if (!meta.ok) return meta
        treeRef = meta.data.defaultBranch
      }

      const result = await getJson<TreeApiResponse>(
        `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(
          ref.repo,
        )}/git/trees/${encodeURIComponent(treeRef)}?recursive=1`,
        `fetching the file tree of ${ref.owner}/${ref.repo}@${treeRef}`,
      )
      if (!result.ok) return result
      const raw = result.data
      const entries: TreeEntry[] = raw.tree
        // The recursive tree can include `commit` entries (submodules); the
        // snapshot models only files and directories.
        .filter((e): e is TreeEntry & { type: "blob" | "tree" } =>
          e.type === "blob" || e.type === "tree",
        )
        .map((e) => ({
          path: e.path,
          type: e.type,
          sha: e.sha,
          ...(e.size !== undefined ? { size: e.size } : {}),
        }))
      return ok({
        commitSha: raw.sha,
        entries,
        truncated: raw.truncated,
      })
    },

    async getFileContent(ref, filePath, gitRef) {
      const cleanPath = filePath.replace(/^\/+/, "")
      const query =
        gitRef && gitRef.trim().length > 0
          ? `?ref=${encodeURIComponent(gitRef)}`
          : ""
      const result = await getJson<ContentsApiResponse>(
        `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(
          ref.repo,
        )}/contents/${cleanPath
          .split("/")
          .map((seg) => encodeURIComponent(seg))
          .join("/")}${query}`,
        `fetching ${cleanPath} from ${ref.owner}/${ref.repo}`,
      )
      if (!result.ok) return result
      const raw = result.data

      if (raw.type !== "file") {
        return fail(
          new GitHubError(
            "not_found",
            `"${cleanPath}" in ${ref.owner}/${ref.repo} is a ${raw.type}, ` +
              `not a file.`,
          ),
        )
      }
      if (raw.content === undefined) {
        return fail(
          new GitHubError(
            "http_error",
            `GitHub returned no content for "${cleanPath}" in ` +
              `${ref.owner}/${ref.repo} — the file may exceed the contents ` +
              `API size limit.`,
          ),
        )
      }

      // GitHub's contents API returns base64; the payload is line-wrapped.
      let decoded: string
      try {
        const base64 = raw.content.replace(/\s/g, "")
        decoded =
          raw.encoding === "base64" || raw.encoding === undefined
            ? Buffer.from(base64, "base64").toString("utf-8")
            : raw.content
      } catch (cause) {
        return fail(
          new GitHubError(
            "http_error",
            `Could not decode the content of "${cleanPath}" in ` +
              `${ref.owner}/${ref.repo}.`,
            { cause },
          ),
        )
      }

      return ok({
        path: raw.path,
        sha: raw.sha,
        size: raw.size,
        content: decoded,
      })
    },

    async getPullRequest(ref, prNumber) {
      return getJson<PullRequestApiResponse>(
        `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(
          ref.repo,
        )}/pulls/${encodeURIComponent(String(prNumber))}`,
        `fetching pull request #${prNumber} of ${ref.owner}/${ref.repo}`,
      )
    },

    async getPullRequestFiles(ref, prNumber, maxFiles = DEFAULT_MAX_PR_FILES) {
      const cap = Math.max(0, maxFiles)
      const collected: PullRequestFileApiResponse[] = []
      let page = 1
      // Walk pages until we hit the cap, a short (final) page, or an empty page.
      // The cap bounds the request count for a very large PR (ADR 0009 §2).
      for (;;) {
        const result = await getJson<PullRequestFileApiResponse[]>(
          `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(
            ref.repo,
          )}/pulls/${encodeURIComponent(
            String(prNumber),
          )}/files?per_page=${PR_FILES_PAGE_SIZE}&page=${page}`,
          `fetching changed files of pull request #${prNumber} of ` +
            `${ref.owner}/${ref.repo}`,
        )
        if (!result.ok) return result
        const pageFiles = result.data
        collected.push(...pageFiles)
        const lastPage = pageFiles.length < PR_FILES_PAGE_SIZE
        if (collected.length >= cap) {
          // More files exist than the cap allows, OR the cap landed exactly on
          // a page boundary with a further page still to come.
          const truncated = collected.length > cap || !lastPage
          return ok({ files: collected.slice(0, cap), truncated })
        }
        if (lastPage) return ok({ files: collected, truncated: false })
        page += 1
      }
    },

    async getLinkedIssueNumber(ref, prNumber, prBody) {
      // 1. Authoritative source: the PR-issue timeline. A "connected" or
      //    "cross-referenced" event to a plain issue (not a PR) is a link.
      const timeline = await getJson<TimelineEventApiResponse[]>(
        `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(
          ref.repo,
        )}/issues/${encodeURIComponent(
          String(prNumber),
        )}/timeline?per_page=${PR_FILES_PAGE_SIZE}`,
        `fetching the timeline of pull request #${prNumber} of ` +
          `${ref.owner}/${ref.repo}`,
      )
      if (timeline.ok) {
        for (const event of timeline.data) {
          if (
            event.event !== "connected" &&
            event.event !== "cross-referenced"
          ) {
            continue
          }
          const issue = event.source?.issue
          // Only a plain issue counts — skip cross-references to other PRs.
          if (issue && issue.pull_request === undefined) {
            return ok(issue.number)
          }
        }
      } else if (timeline.error.kind !== "not_found") {
        // A not_found here just means no timeline; any other error is real.
        return timeline
      }

      // 2. Fallback: a "Closes #N" keyword in the PR body. Resolve the PR body
      //    ourselves when the caller did not pass one.
      let body = prBody ?? null
      if (body === undefined || body === null) {
        const pr = await this.getPullRequest(ref, prNumber)
        if (!pr.ok) return pr
        body = pr.data.body
      }
      if (body) {
        const match = ISSUE_LINK_KEYWORDS.exec(body)
        if (match) return ok(Number(match[1]))
      }

      // No linked issue — a valid, gracefully handled state (Issue #111).
      return ok(null)
    },

    async getIssue(ref, issueNumber) {
      return getJson<IssueApiResponse>(
        `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(
          ref.repo,
        )}/issues/${encodeURIComponent(String(issueNumber))}`,
        `fetching issue #${issueNumber} of ${ref.owner}/${ref.repo}`,
      )
    },

    async getIssueTimeline(ref, issueNumber) {
      return getJson<TimelineEventApiResponse[]>(
        `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(
          ref.repo,
        )}/issues/${encodeURIComponent(
          String(issueNumber),
        )}/timeline?per_page=${PR_FILES_PAGE_SIZE}`,
        `fetching the timeline of issue #${issueNumber} of ` +
          `${ref.owner}/${ref.repo}`,
      )
    },

    async listIssues(ref, options = {}) {
      const state = options.state ?? "all"
      const cap = Math.max(0, options.maxIssues ?? DEFAULT_MAX_ISSUES)
      const collected: IssueApiResponse[] = []
      let page = 1
      // Walk pages until we hit the cap, a short (final) page, or an empty
      // page — same bounded-pagination shape as `getPullRequestFiles`.
      for (;;) {
        const result = await getJson<IssueApiResponse[]>(
          `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(
            ref.repo,
          )}/issues?state=${encodeURIComponent(
            state,
          )}&per_page=${ISSUES_PAGE_SIZE}&page=${page}`,
          `listing issues of ${ref.owner}/${ref.repo}`,
        )
        if (!result.ok) return result
        const pageIssues = result.data
        collected.push(...pageIssues)
        const lastPage = pageIssues.length < ISSUES_PAGE_SIZE
        if (collected.length >= cap) {
          const truncated = collected.length > cap || !lastPage
          return ok({ issues: collected.slice(0, cap), truncated })
        }
        if (lastPage) return ok({ issues: collected, truncated: false })
        page += 1
      }
    },
  }
}
