---
issue: 111
stream: pr-fetch
started: 2026-05-22T15:10:00Z
status: completed
---

# Issue #111 — PR fetching + change model

## Scope

Extend the shipped M11 GitHub client (`packages/db/src/github`) with
pull-request fetching and a typed change model the M11 review call (#112)
reasons over.

## Plan

1. New module `packages/db/src/github/pull-requests.ts`:
   - Reuse `createGitHubClient`'s auth + access path (ADR 0009) — no new client.
   - Fetch PR metadata, the unified diff/patch, the changed-file list, and the
     linked issue where one exists.
   - Parse the unified diff into a typed change model: changed files, hunks,
     additions/deletions, linked-issue acceptance criteria.
   - Gracefully handle a very large PR (cap files/patch) and a PR with no
     linked issue.
2. Tests `pull-requests.test.ts` with mocked GitHub responses (no live calls).
3. Export the new surface from `index.ts`.

## Progress

- Studied existing client, errors, key-files, ADR 0009, and test patterns.
- Extended `client.ts` (the ADR 0009 access path) with four PR endpoints:
  `getPullRequest`, `getPullRequestFiles` (paginated + capped),
  `getLinkedIssueNumber` (timeline + body-keyword fallback), `getIssue`.
  Reuses the existing `getJson` + auth headers — no second access path.
- Added `pull-requests.ts`: the typed `PullRequestChangeModel`, pure
  `parseUnifiedDiff` (hunks) and `extractAcceptanceCriteria` parsers, and
  `buildPullRequestChangeModel` orchestrating the fetch.
- Added `pull-requests.test.ts` — 28 tests, all mocked, no live calls.
- Exported the new surface from `index.ts`.

## Cross-scope edits

- `index.ts` barrel: added the PR exports (was unmodified by other agents).
- `import.test.ts` / `repos.test.ts`: their hand-rolled `GitHubClient` fakes
  needed the four new methods to satisfy the widened interface — added as
  reject-stubs (the import path never calls PR endpoints).

## Verification

- `pnpm --filter @workspace/db typecheck` — pass
- `pnpm typecheck` (full repo) — pass
- `pnpm --filter @workspace/db lint` — pass
- `pnpm --filter @workspace/db test` — 237 passed (19 files)

## Status

Completed. The `PullRequestChangeModel` is the exported input contract for
the downstream review call (Issue #112).
