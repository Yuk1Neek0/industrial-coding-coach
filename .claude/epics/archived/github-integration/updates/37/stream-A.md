---
issue: 37
stream: schema-and-adr
started: 2026-05-21T12:14:30Z
status: completed
---

## Scope
GitHub-access ADR + snapshot schema + Drizzle migration (foundational task of
the github-integration epic).

## Progress
- Wrote ADR 0009 (`docs/decisions/0009-github-access.md`) — settles
  authentication (optional `GITHUB_TOKEN` via `.env`, read-only scope),
  rate-limit handling (detect + surface, selective key-file fetching), and
  snapshot storage (confirms the catalog SQLite DB per ADR 0006). Added to the
  ADR index.
- Added `repo_snapshots` + `repo_files` tables to `packages/db/src/schema.ts` —
  keyed by owner/repo/ref (unique index); file tree as a JSON column; key-file
  contents as cascade-delete child rows. Exported `RepoSnapshot` /
  `NewRepoSnapshot` / `RepoFile` / `NewRepoFile` types.
- Generated migration `packages/db/drizzle/0001_milky_victor_mancha.sql`.
- Added `GITHUB_TOKEN` placeholder to `.env.example`.
- Verified: `pnpm lint`, `pnpm typecheck`, `pnpm build` all PASS; 11/11 db tests
  pass (4 new in `snapshot-schema.test.ts` cover migration apply, JSON
  round-trip, owner/repo/ref uniqueness, FK cascade).

## Status
Completed. Committed on `epic/github-integration`. Pending human review.
Unblocks #38 (GitHub API client) → #39 → #40.
