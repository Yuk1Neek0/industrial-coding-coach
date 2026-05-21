---
issue: 38
stream: github-api-client
started: 2026-05-21T13:10:00Z
status: completed
---

## Scope
GitHub API client + token auth + rate-limit/error handling.

## Progress
- Created `packages/db/src/github/` — `errors.ts` (typed `GitHubError` +
  `GitHubResult<T>` discriminated result), `client.ts` (`createGitHubClient`,
  `parseRepoUrl`, `getRepoMetadata` / `getRepoTree` / `getFileContent`),
  `index.ts` (barrel), `client.test.ts` (33 tests, network mocked).
- Read-only (GET only); optional `GITHUB_TOKEN`; rate-limit detection per
  ADR 0009 §2 (403/429 + `x-ratelimit-remaining: 0` → typed `rate_limited`,
  no retry loop).
- Modified `packages/db/src/index.ts` (export the `github` barrel),
  `packages/db/package.json` (`./github` subpath export), `turbo.json`
  (`GITHUB_TOKEN` in `globalEnv`, mirroring `DB_FILE_NAME`).
- Verified: `pnpm --filter @workspace/db test` — 45 pass (33 new);
  `pnpm lint`, `pnpm typecheck`, `pnpm build` all PASS.

## Status
Completed. Committed on `epic/github-integration`. Pending human review.
Unblocks #39 (repo import module + key-file selection).
