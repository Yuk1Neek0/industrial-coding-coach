---
issue: 39
stream: import-module
started: 2026-05-21T13:20:00Z
status: completed
---

## Scope
Repo import module + key-file selection.

## Progress
- Created `packages/db/src/github/key-files.ts` — `classifyKeyFile` /
  `selectKeyFiles`: filters a recursive tree to key-file blobs
  (package-manifest, lockfile, build-config, readme, ci-workflow); skips files
  over 512 KiB.
- Created `packages/db/src/github/import.ts` — `importRepository()`: fetches
  metadata + tree via the #38 client, selects key files, fetches only their
  content, writes `repo_snapshots` + `repo_files` in one transaction.
  Re-import updates the existing row (US-3); a `rate_limited` hit mid-import
  aborts cleanly (ADR 0009 §2); other per-file failures are recorded in
  `ImportResult.skipped`, non-fatal.
- Added `key-files.test.ts` (17 tests) + `import.test.ts` (21 tests, mocked
  client + in-memory DB); exported the public surface from `index.ts`.
- Verified: `pnpm lint`, `pnpm typecheck`, `pnpm build` all PASS; 78 db tests
  pass.

## Status
Completed. Committed on `epic/github-integration`. Pending human review.
Unblocks #40 (typed data-access layer).
