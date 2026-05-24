// Unit tests for the M7 issue-fetch surface (Issue #132). Every network call
// is mocked — these tests never reach the real GitHub API (no live calls in
// CI; NFR Reproducible). They cover the client's issue-list / issue-timeline
// endpoints, the typed `fetchIssue` / `listIssues` shape, the normalization
// to `LearningUnitInput`, and the gracefully handled boundaries: an issue
// with no body, an issue with no linked PR, an entry that is actually a PR.
//
// Tests run with no `GITHUB_TOKEN` set — `createGitHubClient({ fetchImpl })`
// builds an unauthenticated client when no token is supplied (ADR 0009 §1).

import { beforeEach, describe, expect, it, vi } from "vitest"

import { createGitHubClient } from "./client"
import {
  fetchIssue,
  listIssues,
  normalizeIssueToLearningUnitInput,
} from "./issues"

/** Build a `Response`-like object good enough for the client's needs. */
function makeResponse(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  const status = init?.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init?.headers ?? {}),
    json: () => Promise.resolve(body),
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

/** A representative GitHub issue body, with two labels and a body. */
const issueWithBody = {
  number: 42,
  title: "Add a /health endpoint",
  body: "Returns 200 OK so the deploy probe stops yelling.",
  state: "open",
  html_url: "https://github.com/vercel/next.js/issues/42",
  labels: [{ name: "feature" }, { name: "good first issue" }],
}

/** An issue with no body at all — a gracefully handled boundary (FR-1). */
const issueWithoutBody = {
  number: 7,
  title: "Investigate flaky CI",
  body: null,
  state: "open",
  html_url: "https://github.com/vercel/next.js/issues/7",
  labels: [] as { name: string }[],
}

/** A row from `/issues` that is actually a pull request (the feed mixes them). */
const issueFeedPr = {
  number: 99,
  title: "PR: bump deps",
  body: "automated",
  state: "open",
  html_url: "https://github.com/vercel/next.js/pull/99",
  labels: [{ name: "deps" }],
  pull_request: { url: "https://api.github.com/repos/vercel/next.js/pulls/99" },
}

describe("client.listIssues", () => {
  beforeEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  it("returns the issues feed and flags it untruncated for a small repo", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse([issueWithBody, issueWithoutBody])),
    })
    const result = await client.listIssues(REPO)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.issues).toHaveLength(2)
      expect(result.data.truncated).toBe(false)
    }
  })

  it("paginates until a short page", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
      body: null,
      state: "open",
      html_url: `https://github.com/vercel/next.js/issues/${i + 1}`,
      labels: [],
    }))
    const fetchImpl = mockFetch(
      makeResponse(fullPage),
      makeResponse([
        {
          number: 101,
          title: "last",
          body: null,
          state: "open",
          html_url: "https://github.com/vercel/next.js/issues/101",
          labels: [],
        },
      ]),
    )
    const client = createGitHubClient({ fetchImpl })
    const result = await client.listIssues(REPO)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.issues).toHaveLength(101)
      expect(result.data.truncated).toBe(false)
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("caps a very large repo and flags it truncated (ADR 0009 §2)", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
      body: null,
      state: "open",
      html_url: `https://github.com/vercel/next.js/issues/${i + 1}`,
      labels: [],
    }))
    const client = createGitHubClient({ fetchImpl: mockFetch(makeResponse(fullPage)) })
    const result = await client.listIssues(REPO, { maxIssues: 5 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.issues).toHaveLength(5)
      expect(result.data.truncated).toBe(true)
    }
  })

  it("passes the `state` query parameter through", async () => {
    const fetchImpl = mockFetch(makeResponse([]))
    const client = createGitHubClient({ fetchImpl })
    await client.listIssues(REPO, { state: "closed" })
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!
    expect(String(url)).toContain("state=closed")
  })
})

describe("client.getIssueTimeline", () => {
  it("fetches the timeline endpoint and returns the event list", async () => {
    const events = [
      { event: "labeled" },
      {
        event: "cross-referenced",
        source: { issue: { number: 100, pull_request: {} } },
      },
    ]
    const fetchImpl = mockFetch(makeResponse(events))
    const client = createGitHubClient({ fetchImpl })
    const result = await client.getIssueTimeline(REPO, 42)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toHaveLength(2)
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!
    expect(String(url)).toContain("/repos/vercel/next.js/issues/42/timeline")
  })
})

describe("fetchIssue", () => {
  beforeEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  it("returns the typed model for an issue with a body and a linked PR", async () => {
    // Order: getIssue, getIssueTimeline.
    const timeline = [
      {
        event: "cross-referenced",
        source: { issue: { number: 100, pull_request: {} } },
      },
    ]
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(issueWithBody), makeResponse(timeline)),
    })
    const result = await fetchIssue(client, REPO, 42)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const issue = result.data
    expect(issue.number).toBe(42)
    expect(issue.title).toBe("Add a /health endpoint")
    expect(issue.body).toContain("200 OK")
    expect(issue.labels).toEqual(["feature", "good first issue"])
    expect(issue.state).toBe("open")
    expect(issue.linkedPrs).toEqual([100])
  })

  it("handles an issue with no body gracefully (body: null, no failure)", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(issueWithoutBody), makeResponse([])),
    })
    const result = await fetchIssue(client, REPO, 7)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.body).toBeNull()
      expect(result.data.labels).toEqual([])
    }
  })

  it("handles an issue with no linked PR gracefully (empty linkedPrs)", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(issueWithBody), makeResponse([])),
    })
    const result = await fetchIssue(client, REPO, 42)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.linkedPrs).toEqual([])
  })

  it("rejects an entry whose pull_request key is set as not_found", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(issueFeedPr)),
    })
    const result = await fetchIssue(client, REPO, 99)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("not_found")
  })

  it("surfaces a typed not_found when the issue does not exist", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse({}, { status: 404 })),
    })
    const result = await fetchIssue(client, REPO, 999)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("not_found")
  })

  it("degrades to empty linkedPrs when the timeline endpoint 404s", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse(issueWithBody),
        makeResponse({}, { status: 404 }),
      ),
    })
    const result = await fetchIssue(client, REPO, 42)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.linkedPrs).toEqual([])
  })

  it("accepts label entries as plain strings (older API shape)", async () => {
    const oldShape = { ...issueWithBody, labels: ["feature", "bug"] }
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(oldShape), makeResponse([])),
    })
    const result = await fetchIssue(client, REPO, 42)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.labels).toEqual(["feature", "bug"])
  })

  it("works against an unauthenticated client (no GITHUB_TOKEN set)", async () => {
    delete process.env.GITHUB_TOKEN
    const fetchImpl = mockFetch(
      makeResponse(issueWithBody),
      makeResponse([]),
    )
    const client = createGitHubClient({ fetchImpl })
    expect(client.authenticated).toBe(false)
    const result = await fetchIssue(client, REPO, 42)
    expect(result.ok).toBe(true)
  })
})

describe("listIssues", () => {
  it("returns typed issues with PR entries filtered out (FR-1)", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse([issueWithBody, issueFeedPr, issueWithoutBody]),
      ),
    })
    const result = await listIssues(client, REPO)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.issues).toHaveLength(2)
    expect(result.data.issues.map((i) => i.number)).toEqual([42, 7])
    expect(result.data.truncated).toBe(false)
  })

  it("propagates the truncated flag from the client", async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
      body: null,
      state: "open",
      html_url: `https://github.com/vercel/next.js/issues/${i + 1}`,
      labels: [],
    }))
    const client = createGitHubClient({ fetchImpl: mockFetch(makeResponse(page)) })
    const result = await listIssues(client, REPO, { maxIssues: 3 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.issues).toHaveLength(3)
      expect(result.data.truncated).toBe(true)
    }
  })

  it("fetches linked PRs per issue when includeLinkedPrs is set", async () => {
    // List → 1 issue + 1 PR (filtered out) → timeline for that 1 issue.
    const timeline = [
      {
        event: "cross-referenced",
        source: { issue: { number: 100, pull_request: {} } },
      },
    ]
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse([issueWithBody]),
        makeResponse(timeline),
      ),
    })
    const result = await listIssues(client, REPO, { includeLinkedPrs: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.issues[0]!.linkedPrs).toEqual([100])
    }
  })

  it("surfaces a typed not_found for a missing repo", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse({}, { status: 404 })),
    })
    const result = await listIssues(client, REPO)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("not_found")
  })

  it("surfaces a rate-limit error", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse({}, { status: 403, headers: { "x-ratelimit-remaining": "0" } }),
      ),
    })
    const result = await listIssues(client, REPO)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("rate_limited")
  })
})

describe("normalizeIssueToLearningUnitInput (R1)", () => {
  it("round-trips a GitHub issue through fetchIssue + normalize", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(issueWithBody), makeResponse([])),
    })
    const result = await fetchIssue(client, REPO, 42)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const input = normalizeIssueToLearningUnitInput(result.data)
    expect(input).toEqual({
      source: "github-issue",
      issueRef: "#42",
      title: "Add a /health endpoint",
      body: "Returns 200 OK so the deploy probe stops yelling.",
      labels: ["feature", "good first issue"],
      state: "open",
      linkedPrs: [],
    })
  })

  it("turns a null body into an empty string in the normalized shape", () => {
    const input = normalizeIssueToLearningUnitInput({
      repo: REPO,
      number: 7,
      title: "no body",
      body: null,
      labels: [],
      state: "open",
      htmlUrl: "https://github.com/vercel/next.js/issues/7",
      linkedPrs: [],
    })
    expect(input.body).toBe("")
    expect(input.source).toBe("github-issue")
  })

  it("carries linkedPrs verbatim from the IssueModel", () => {
    const input = normalizeIssueToLearningUnitInput({
      repo: REPO,
      number: 42,
      title: "x",
      body: "",
      labels: [],
      state: "closed",
      htmlUrl: "https://github.com/vercel/next.js/issues/42",
      linkedPrs: [100, 101],
    })
    expect(input.linkedPrs).toEqual([100, 101])
    expect(input.state).toBe("closed")
  })
})
