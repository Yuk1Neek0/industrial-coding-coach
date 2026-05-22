// Unit tests for PR fetching + the change model (Issue #111). Every network
// call is mocked — these tests never reach the real GitHub API (no live API
// calls in CI). They cover the client's PR endpoints, the unified-diff and
// acceptance-criteria parsers, and the end-to-end change model — including the
// two graceful boundaries: a very large PR and a PR with no linked issue.

import { describe, expect, it, vi } from "vitest"

import { createGitHubClient } from "./client"
import {
  buildPullRequestChangeModel,
  extractAcceptanceCriteria,
  parseUnifiedDiff,
} from "./pull-requests"

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

/** A representative PR metadata body. */
const prBody = {
  number: 42,
  title: "Add the diff review module",
  body: "Closes #41\n\nThis wires up the change model.",
  state: "open",
  html_url: "https://github.com/vercel/next.js/pull/42",
  additions: 120,
  deletions: 18,
  changed_files: 2,
  head: { ref: "feature/diff-review", sha: "headsha" },
  base: { ref: "main", sha: "basesha" },
}

/** A two-file changed-file list with real unified-diff patches. */
const prFilesBody = [
  {
    filename: "src/review.ts",
    status: "added",
    additions: 100,
    deletions: 0,
    changes: 100,
    patch:
      "@@ -0,0 +1,3 @@ export function review()\n" +
      "+const a = 1\n" +
      "+const b = 2\n" +
      "+return a + b",
  },
  {
    filename: "src/old.ts",
    status: "modified",
    additions: 20,
    deletions: 18,
    changes: 38,
    patch:
      "@@ -1,4 +1,4 @@\n" +
      " context line\n" +
      "-removed line\n" +
      "+added line\n" +
      " trailing context",
  },
]

/** A linked issue with an Acceptance Criteria checklist. */
const issueBody = {
  number: 41,
  title: "Build the change model",
  body:
    "## Description\n\nSome prose.\n\n" +
    "## Acceptance Criteria\n" +
    "- [ ] Fetches the PR diff\n" +
    "- [x] Parses hunks\n",
  state: "open",
  html_url: "https://github.com/vercel/next.js/issues/41",
}

describe("parseUnifiedDiff", () => {
  it("parses a hunk header with explicit line counts", () => {
    const hunks = parseUnifiedDiff(
      "@@ -1,4 +1,4 @@ section heading\n context\n-old\n+new\n more",
    )
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({
      oldStart: 1,
      oldLines: 4,
      newStart: 1,
      newLines: 4,
      header: "section heading",
    })
  })

  it("tags each line as add / del / context", () => {
    const [hunk] = parseUnifiedDiff(
      "@@ -1,2 +1,2 @@\n context\n-gone\n+here",
    )
    expect(hunk!.lines).toEqual([
      { kind: "context", content: "context" },
      { kind: "del", content: "gone" },
      { kind: "add", content: "here" },
    ])
  })

  it("defaults an omitted line count to 1", () => {
    const [hunk] = parseUnifiedDiff("@@ -5 +5 @@\n+only line")
    expect(hunk!.oldLines).toBe(1)
    expect(hunk!.newLines).toBe(1)
  })

  it("parses multiple hunks in one patch", () => {
    const hunks = parseUnifiedDiff(
      "@@ -1,1 +1,1 @@\n+a\n@@ -10,1 +10,1 @@\n+b",
    )
    expect(hunks).toHaveLength(2)
    expect(hunks[1]!.newStart).toBe(10)
  })

  it("ignores the `\\ No newline at end of file` marker", () => {
    const [hunk] = parseUnifiedDiff(
      "@@ -1,1 +1,1 @@\n-old\n+new\n\\ No newline at end of file",
    )
    expect(hunk!.lines).toEqual([
      { kind: "del", content: "old" },
      { kind: "add", content: "new" },
    ])
  })

  it("returns no hunks for an empty patch", () => {
    expect(parseUnifiedDiff("")).toEqual([])
  })
})

describe("extractAcceptanceCriteria", () => {
  it("extracts the checklist under an Acceptance Criteria heading", () => {
    const criteria = extractAcceptanceCriteria(issueBody.body)
    expect(criteria).toEqual([
      { text: "Fetches the PR diff", checked: false },
      { text: "Parses hunks", checked: true },
    ])
  })

  it("also recognizes a Definition of Done heading", () => {
    const criteria = extractAcceptanceCriteria(
      "## Definition of Done\n- [x] Code shipped\n",
    )
    expect(criteria).toEqual([{ text: "Code shipped", checked: true }])
  })

  it("falls back to every checklist item when no AC heading exists", () => {
    const criteria = extractAcceptanceCriteria(
      "Some intro\n- [ ] First task\n- [ ] Second task\n",
    )
    expect(criteria).toHaveLength(2)
    expect(criteria[0]!.text).toBe("First task")
  })

  it("returns an empty array for a null body", () => {
    expect(extractAcceptanceCriteria(null)).toEqual([])
  })

  it("returns an empty array for a body with no checklist", () => {
    expect(extractAcceptanceCriteria("Just prose, no list.")).toEqual([])
  })
})

describe("client PR endpoints", () => {
  it("getPullRequest fetches the pulls endpoint", async () => {
    const fetchImpl = mockFetch(makeResponse(prBody))
    const client = createGitHubClient({ fetchImpl })
    const r = await client.getPullRequest(REPO, 42)
    expect(r.ok).toBe(true)
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!
    expect(String(url)).toContain("/repos/vercel/next.js/pulls/42")
  })

  it("getPullRequest maps a 404 to a typed not_found error", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse({}, { status: 404 })),
    })
    const r = await client.getPullRequest(REPO, 999)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("not_found")
  })

  it("getPullRequestFiles returns the changed-file list", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(prFilesBody)),
    })
    const r = await client.getPullRequestFiles(REPO, 42)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.files).toHaveLength(2)
      expect(r.data.truncated).toBe(false)
    }
  })

  it("getPullRequestFiles paginates until a short page", async () => {
    // Page 1: a full 100-entry page. Page 2: a short page that ends it.
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      filename: `f${i}.ts`,
      status: "modified",
      additions: 1,
      deletions: 0,
      changes: 1,
    }))
    const fetchImpl = mockFetch(
      makeResponse(fullPage),
      makeResponse([{ filename: "last.ts", status: "added", additions: 1, deletions: 0, changes: 1 }]),
    )
    const client = createGitHubClient({ fetchImpl })
    const r = await client.getPullRequestFiles(REPO, 42)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.files).toHaveLength(101)
      expect(r.data.truncated).toBe(false)
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("getPullRequestFiles caps a very large PR and flags it truncated", async () => {
    const bigPage = Array.from({ length: 100 }, (_, i) => ({
      filename: `f${i}.ts`,
      status: "modified",
      additions: 1,
      deletions: 0,
      changes: 1,
    }))
    // Every page is full; the cap (5) stops the walk on the first page.
    const client = createGitHubClient({ fetchImpl: mockFetch(makeResponse(bigPage)) })
    const r = await client.getPullRequestFiles(REPO, 42, 5)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.files).toHaveLength(5)
      expect(r.data.truncated).toBe(true)
    }
  })

  it("getLinkedIssueNumber reads a connected event from the timeline", async () => {
    const timeline = [
      { event: "labeled" },
      { event: "connected", source: { issue: { number: 41 } } },
    ]
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(timeline)),
    })
    const r = await client.getLinkedIssueNumber(REPO, 42, prBody.body)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toBe(41)
  })

  it("getLinkedIssueNumber skips a cross-reference to another PR", async () => {
    // A cross-referenced source that is itself a PR is NOT a linked issue;
    // the body keyword fallback ("Closes #41") then supplies the answer.
    const timeline = [
      {
        event: "cross-referenced",
        source: { issue: { number: 99, pull_request: {} } },
      },
    ]
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse(timeline)),
    })
    const r = await client.getLinkedIssueNumber(REPO, 42, "Closes #41")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toBe(41)
  })

  it("getLinkedIssueNumber falls back to a body keyword", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse([])),
    })
    const r = await client.getLinkedIssueNumber(REPO, 42, "Fixes #7")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toBe(7)
  })

  it("getLinkedIssueNumber returns null when nothing links an issue", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse([])),
    })
    const r = await client.getLinkedIssueNumber(REPO, 42, "No link here.")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toBeNull()
  })

  it("getIssue fetches the issues endpoint", async () => {
    const fetchImpl = mockFetch(makeResponse(issueBody))
    const client = createGitHubClient({ fetchImpl })
    const r = await client.getIssue(REPO, 41)
    expect(r.ok).toBe(true)
    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]!
    expect(String(url)).toContain("/repos/vercel/next.js/issues/41")
  })
})

describe("buildPullRequestChangeModel", () => {
  it("builds the full model: PR, files, hunks, and the linked issue", async () => {
    // Order: getPullRequest, getPullRequestFiles, getLinkedIssueNumber
    // (timeline), getIssue.
    const timeline = [{ event: "connected", source: { issue: { number: 41 } } }]
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse(prBody),
        makeResponse(prFilesBody),
        makeResponse(timeline),
        makeResponse(issueBody),
      ),
    })
    const r = await buildPullRequestChangeModel(client, REPO, 42)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const model = r.data
    expect(model.number).toBe(42)
    expect(model.title).toBe("Add the diff review module")
    expect(model.head).toEqual({ ref: "feature/diff-review", sha: "headsha" })
    expect(model.base).toEqual({ ref: "main", sha: "basesha" })
    expect(model.additions).toBe(120)
    expect(model.deletions).toBe(18)
    expect(model.changedFileCount).toBe(2)
    expect(model.truncated).toBe(false)

    // Files + parsed hunks.
    expect(model.files).toHaveLength(2)
    const added = model.files[0]!
    expect(added.path).toBe("src/review.ts")
    expect(added.status).toBe("added")
    expect(added.patchOmitted).toBe(false)
    expect(added.hunks).toHaveLength(1)
    expect(added.hunks[0]!.lines.filter((l) => l.kind === "add")).toHaveLength(3)

    // Linked issue + acceptance criteria.
    expect(model.linkedIssue).not.toBeNull()
    expect(model.linkedIssue!.number).toBe(41)
    expect(model.linkedIssue!.acceptanceCriteria).toEqual([
      { text: "Fetches the PR diff", checked: false },
      { text: "Parses hunks", checked: true },
    ])
  })

  it("handles a PR with no linked issue gracefully (linkedIssue: null)", async () => {
    const prNoLink = { ...prBody, body: "A PR that links nothing." }
    // getPullRequest, getPullRequestFiles, getLinkedIssueNumber (empty
    // timeline) — no getIssue call follows because there is no link.
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse(prNoLink),
        makeResponse(prFilesBody),
        makeResponse([]),
      ),
    })
    const r = await buildPullRequestChangeModel(client, REPO, 42)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.linkedIssue).toBeNull()
      expect(r.data.files).toHaveLength(2)
    }
  })

  it("bounds a very large PR: caps files and flags truncated", async () => {
    const bigPage = Array.from({ length: 100 }, (_, i) => ({
      filename: `f${i}.ts`,
      status: "modified",
      additions: 1,
      deletions: 0,
      changes: 1,
      patch: "@@ -1,1 +1,1 @@\n+x",
    }))
    // getPullRequest, then getPullRequestFiles (one full page, capped at 10),
    // then getLinkedIssueNumber.
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse({ ...prBody, body: "no link" }),
        makeResponse(bigPage),
        makeResponse([]),
      ),
    })
    const r = await buildPullRequestChangeModel(client, REPO, 42, {
      maxFiles: 10,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.files).toHaveLength(10)
      expect(r.data.truncated).toBe(true)
    }
  })

  it("omits hunks for a file with no patch (binary file)", async () => {
    const binaryFiles = [
      {
        filename: "logo.png",
        status: "added",
        additions: 0,
        deletions: 0,
        changes: 0,
        // No `patch` field — GitHub omits it for binary files.
      },
    ]
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse({ ...prBody, body: "no link" }),
        makeResponse(binaryFiles),
        makeResponse([]),
      ),
    })
    const r = await buildPullRequestChangeModel(client, REPO, 42)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.files[0]!.patchOmitted).toBe(true)
      expect(r.data.files[0]!.hunks).toEqual([])
    }
  })

  it("surfaces a typed not_found when the PR does not exist", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(makeResponse({}, { status: 404 })),
    })
    const r = await buildPullRequestChangeModel(client, REPO, 999)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("not_found")
  })

  it("degrades to no linked issue when the linked issue 404s", async () => {
    const timeline = [{ event: "connected", source: { issue: { number: 41 } } }]
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse(prBody),
        makeResponse(prFilesBody),
        makeResponse(timeline),
        makeResponse({}, { status: 404 }),
      ),
    })
    const r = await buildPullRequestChangeModel(client, REPO, 42)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.linkedIssue).toBeNull()
  })

  it("surfaces a rate-limit error from the PR fetch", async () => {
    const client = createGitHubClient({
      fetchImpl: mockFetch(
        makeResponse({}, { status: 403, headers: { "x-ratelimit-remaining": "0" } }),
      ),
    })
    const r = await buildPullRequestChangeModel(client, REPO, 42)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe("rate_limited")
  })
})
