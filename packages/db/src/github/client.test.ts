// Unit tests for the GitHub API client (Issue #38). All network calls are
// mocked — these tests never reach the real GitHub API. They cover URL
// parsing, auth-header behavior, response parsing, and every typed error /
// rate-limit path (ADR 0009 §2, PRD FR-7).

import { describe, expect, it, vi } from "vitest"

import { createGitHubClient, parseRepoUrl } from "./client"
import { GitHubError } from "./errors"

/** Build a `Response`-like object good enough for the client's needs. */
function makeResponse(
  body: unknown,
  init?: {
    status?: number
    headers?: Record<string, string>
    /** When true, `.json()` rejects — simulates a malformed body. */
    badJson?: boolean
  },
): Response {
  const status = init?.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init?.headers ?? {}),
    json: init?.badJson
      ? () => Promise.reject(new Error("invalid json"))
      : () => Promise.resolve(body),
  } as Response
}

/** A fetch mock that returns the given response(s) in call order. */
function mockFetch(...responses: Response[]): typeof fetch {
  const queue = [...responses]
  return vi.fn(() => {
    const next = queue.shift() ?? responses[responses.length - 1]!
    return Promise.resolve(next)
  }) as unknown as typeof fetch
}

const REPO = { owner: "vercel", repo: "next.js" }

const repoMetaBody = {
  description: "The React Framework",
  default_branch: "main",
  language: "TypeScript",
  private: false,
  html_url: "https://github.com/vercel/next.js",
}

describe("parseRepoUrl", () => {
  it("parses an https github URL", () => {
    const r = parseRepoUrl("https://github.com/vercel/next.js")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual(REPO)
  })

  it("parses an https URL with a .git suffix and trailing path", () => {
    const r = parseRepoUrl("https://github.com/vercel/next.js.git/tree/main")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual(REPO)
  })

  it("parses an owner/repo shorthand", () => {
    const r = parseRepoUrl("vercel/next.js")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual(REPO)
  })

  it("parses an SSH (scp) remote", () => {
    const r = parseRepoUrl("git@github.com:vercel/next.js.git")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual(REPO)
  })

  it("rejects an empty string with an invalid_url error", () => {
    const r = parseRepoUrl("   ")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("invalid_url")
  })

  it("rejects a non-github host", () => {
    const r = parseRepoUrl("https://gitlab.com/vercel/next.js")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("invalid_url")
  })

  it("rejects a github URL with no owner/repo path", () => {
    const r = parseRepoUrl("https://github.com/vercel")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("invalid_url")
  })

  it("rejects garbage that is neither a URL nor a shorthand", () => {
    const r = parseRepoUrl("not a url at all")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("invalid_url")
  })
})

describe("auth header behavior", () => {
  it("sends a Bearer Authorization header when a token is given", async () => {
    const fetchImpl = mockFetch(makeResponse(repoMetaBody))
    const client = createGitHubClient({ token: "ghp_test", fetchImpl })
    expect(client.authenticated).toBe(true)

    await client.getRepoMetadata(REPO)

    const [, requestInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0]!
    const headers = (requestInit as RequestInit).headers as Record<
      string,
      string
    >
    expect(headers.Authorization).toBe("Bearer ghp_test")
    expect(headers.Accept).toBe("application/vnd.github+json")
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28")
  })

  it("omits the Authorization header when no token is given", async () => {
    const fetchImpl = mockFetch(makeResponse(repoMetaBody))
    const client = createGitHubClient({ token: "", fetchImpl })
    expect(client.authenticated).toBe(false)

    await client.getRepoMetadata(REPO)

    const [, requestInit] = (fetchImpl as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0]!
    const headers = (requestInit as RequestInit).headers as Record<
      string,
      string
    >
    expect(headers.Authorization).toBeUndefined()
  })

  it("treats a whitespace-only token as no token", async () => {
    const fetchImpl = mockFetch(makeResponse(repoMetaBody))
    const client = createGitHubClient({ token: "   ", fetchImpl })
    expect(client.authenticated).toBe(false)
  })

  it("reads GITHUB_TOKEN from the environment when no token is passed", async () => {
    vi.stubEnv("GITHUB_TOKEN", "env_token")
    try {
      const fetchImpl = mockFetch(makeResponse(repoMetaBody))
      const client = createGitHubClient({ fetchImpl })
      expect(client.authenticated).toBe(true)
      await client.getRepoMetadata(REPO)
      const [, requestInit] = (
        fetchImpl as unknown as ReturnType<typeof vi.fn>
      ).mock.calls[0]!
      const headers = (requestInit as RequestInit).headers as Record<
        string,
        string
      >
      expect(headers.Authorization).toBe("Bearer env_token")
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe("getRepoMetadata", () => {
  it("parses a successful metadata response", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(repoMetaBody)),
    })
    const r = await client.getRepoMetadata(REPO)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toEqual({
        owner: "vercel",
        repo: "next.js",
        description: "The React Framework",
        defaultBranch: "main",
        primaryLanguage: "TypeScript",
        isPrivate: false,
        htmlUrl: "https://github.com/vercel/next.js",
      })
    }
  })

  it("maps a 404 to a typed not_found error", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse({}, { status: 404 })),
    })
    const r = await client.getRepoMetadata(REPO)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(GitHubError)
      expect(r.error.kind).toBe("not_found")
      expect(r.error.status).toBe(404)
    }
  })

  it("maps a 401 to a typed auth_failed error", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse({}, { status: 401 })),
    })
    const r = await client.getRepoMetadata(REPO)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe("auth_failed")
      expect(r.error.message).toMatch(/GITHUB_TOKEN/)
    }
  })

  it("maps a 403 without exhausted rate limit to auth_failed", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse({}, { status: 403, headers: { "x-ratelimit-remaining": "12" } }),
      ),
    })
    const r = await client.getRepoMetadata(REPO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("auth_failed")
  })

  it("maps an unexpected 500 to a typed http_error", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse({}, { status: 500 })),
    })
    const r = await client.getRepoMetadata(REPO)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe("http_error")
      expect(r.error.status).toBe(500)
    }
  })

  it("maps a thrown fetch (offline) to a typed network_error", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.reject(new Error("getaddrinfo ENOTFOUND")),
    ) as unknown as typeof fetch
    const client = createGitHubClient({ fetchImpl })
    const r = await client.getRepoMetadata(REPO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("network_error")
  })

  it("maps an unparseable body to a typed http_error", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(null, { badJson: true })),
    })
    const r = await client.getRepoMetadata(REPO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("http_error")
  })
})

describe("rate-limit detection (ADR 0009 §2)", () => {
  it("detects a 403 with x-ratelimit-remaining: 0 as rate_limited", async () => {
    const reset = Math.floor(Date.now() / 1000) + 3600
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse(
          {},
          {
            status: 403,
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": String(reset),
            },
          },
        ),
      ),
    })
    const r = await client.getRepoMetadata(REPO)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe("rate_limited")
      expect(r.error.rateLimitResetAt).toBe(reset)
      // The message must be actionable: name the reset and the fix.
      expect(r.error.message).toMatch(/resets at/)
      expect(r.error.message).toMatch(/GITHUB_TOKEN/)
    }
  })

  it("detects a 429 with x-ratelimit-remaining: 0 as rate_limited", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse({}, { status: 429, headers: { "x-ratelimit-remaining": "0" } }),
      ),
    })
    const r = await client.getRepoMetadata(REPO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("rate_limited")
  })

  it("does not retry — fetch is called exactly once on a rate-limit hit", async () => {
    const fetchImpl = mockFetch(
      makeResponse({}, { status: 403, headers: { "x-ratelimit-remaining": "0" } }),
    )
    const client = createGitHubClient({ fetchImpl })
    await client.getRepoMetadata(REPO)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe("getRepoTree", () => {
  const treeBody = {
    sha: "commit-sha-abc",
    truncated: false,
    tree: [
      { path: "package.json", type: "blob", sha: "f1", size: 1200 },
      { path: "apps", type: "tree", sha: "t1" },
      { path: "vendor/sub", type: "commit", sha: "c1" },
    ],
  }

  it("parses a tree response and drops submodule (commit) entries", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(treeBody)),
    })
    const r = await client.getRepoTree(REPO, "main")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.commitSha).toBe("commit-sha-abc")
      expect(r.data.truncated).toBe(false)
      expect(r.data.entries).toHaveLength(2)
      expect(r.data.entries[0]).toEqual({
        path: "package.json",
        type: "blob",
        sha: "f1",
        size: 1200,
      })
      expect(r.data.entries[1]).toEqual({
        path: "apps",
        type: "tree",
        sha: "t1",
      })
    }
  })

  it("requests the recursive tree endpoint", async () => {
    const fetchImpl = mockFetch(makeResponse(treeBody))
    const client = createGitHubClient({ fetchImpl })
    await client.getRepoTree(REPO, "main")
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!
    expect(String(url)).toContain("/git/trees/main?recursive=1")
  })

  it("resolves the default branch when no ref is given", async () => {
    // First call: metadata (to learn default branch). Second: the tree.
    const fetchImpl = mockFetch(
      makeResponse(repoMetaBody),
      makeResponse(treeBody),
    )
    const client = createGitHubClient({ fetchImpl })
    const r = await client.getRepoTree(REPO)
    expect(r.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [treeUrl] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[1]!
    expect(String(treeUrl)).toContain("/git/trees/main")
  })

  it("surfaces a metadata not_found when default-branch resolution fails", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse({}, { status: 404 })),
    })
    const r = await client.getRepoTree(REPO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("not_found")
  })

  it("reports truncated trees", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse({ ...treeBody, truncated: true })),
    })
    const r = await client.getRepoTree(REPO, "main")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.truncated).toBe(true)
  })
})

describe("getFileContent", () => {
  it("decodes a base64 file content response", async () => {
    const text = '{ "name": "next" }'
    const body = {
      type: "file",
      path: "package.json",
      sha: "f1",
      size: text.length,
      // GitHub line-wraps base64; embed a newline to prove it is stripped.
      content: Buffer.from(text, "utf-8").toString("base64") + "\n",
      encoding: "base64",
    }
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(body)),
    })
    const r = await client.getFileContent(REPO, "package.json", "main")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.content).toBe(text)
      expect(r.data.path).toBe("package.json")
      expect(r.data.sha).toBe("f1")
    }
  })

  it("passes the ref as a query parameter", async () => {
    const body = {
      type: "file",
      path: "README.md",
      sha: "f2",
      size: 2,
      content: Buffer.from("hi", "utf-8").toString("base64"),
      encoding: "base64",
    }
    const fetchImpl = mockFetch(makeResponse(body))
    const client = createGitHubClient({ fetchImpl })
    await client.getFileContent(REPO, "README.md", "release-1.0")
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!
    expect(String(url)).toContain("/contents/README.md")
    expect(String(url)).toContain("ref=release-1.0")
  })

  it("returns not_found when the path is a directory", async () => {
    // The contents API returns an array for directories; here a dir-typed obj.
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse({ type: "dir", path: "apps", sha: "t1", size: 0 }),
      ),
    })
    const r = await client.getFileContent(REPO, "apps", "main")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("not_found")
  })

  it("returns http_error when GitHub omits content (file too large)", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse({ type: "file", path: "big.bin", sha: "f3", size: 9e9 }),
      ),
    })
    const r = await client.getFileContent(REPO, "big.bin", "main")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("http_error")
  })

  it("maps a 404 on a missing file to not_found", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse({}, { status: 404 })),
    })
    const r = await client.getFileContent(REPO, "nope.txt", "main")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("not_found")
  })
})

describe("createGitHubClient configuration", () => {
  it("throws when no fetch implementation is available", () => {
    const original = globalThis.fetch
    // @ts-expect-error — deliberately remove fetch to exercise the guard.
    delete globalThis.fetch
    try {
      expect(() => createGitHubClient()).toThrow(/fetch/)
    } finally {
      globalThis.fetch = original
    }
  })

  it("targets a custom base URL when provided", async () => {
    const fetchImpl = mockFetch(makeResponse(repoMetaBody))
    const client = createGitHubClient({
      baseUrl: "https://ghe.example.com/api/v3",
      fetchImpl,
    })
    await client.getRepoMetadata(REPO)
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!
    expect(String(url)).toContain("https://ghe.example.com/api/v3/repos/")
  })
})
