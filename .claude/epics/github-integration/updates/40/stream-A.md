---
issue: 40
stream: data-access
started: 2026-05-21T13:30:00Z
status: completed
---

## Scope
Typed data-access layer over imported repo snapshots (PRD FR-5) — the interface
the Import UI (#42) and the M5 analysis milestone read through.

## Progress
- Created `packages/db/src/github/repos.ts` — `importRepository` (thin wrapper
  adapting the page-spec `{ owner, repo, ref? }` input onto #39's import
  module), `listImportedRepos`, `getImportedRepo`, `getImportedRepoById`,
  `getRepoTree`, `listRepoFiles`, `getRepoFile`. Injectable `CatalogDb`; mirrors
  `catalog.ts` style; `null` for a clean miss.
- Created `repos.test.ts` — 27 tests (in-memory DB + real migrations, mocked
  client; every function + miss/empty cases + end-to-end import-then-read).
- `index.ts` now exports the data-access layer; `importRepository` is
  re-exported from `./repos` (the page-spec shape).
- Verified: `pnpm lint`, `pnpm typecheck`, `pnpm build` all PASS; 101 db tests
  pass.

## Status
Completed. Committed on `epic/github-integration`. Pending human review.
The github-integration backend chain (#37 → #38 → #39 → #40) is complete.
#42 (integrate the Import UI) remains — needs #41's Claude Design output.
