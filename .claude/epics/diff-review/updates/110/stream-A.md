---
issue: 110
stream: schema
started: 2026-05-22T15:10:00Z
status: completed
---

# Issue #110 — diff_reviews schema + Drizzle migration

## Stream A: schema

### Plan
- Add a `diff_reviews` table to `packages/db/src/schema.ts`, keyed by repo
  identity (`repo_snapshots` FK) and PR number.
- Columns cover the six review outputs (changed-file explanation, core-logic
  explanation, risk analysis, test suggestions, comprehension questions) plus
  user answers and the score / weak-area breakdown. Structured/list fields are
  JSON columns. Answers and score are nullable until the check is completed.
- Export `DiffReview` / `NewDiffReview` types, consistent with existing tables.
- Generate the migration via `pnpm --filter @workspace/db db:generate`.
- Add a migration + schema test mirroring `snapshot-schema.test.ts`.

### Files in scope
- `packages/db/src/schema.ts` (additive)
- `packages/db/drizzle/` (generated migration)
- `packages/db/src/diff-reviews-schema.test.ts` (new test)

### Progress
- `diff_reviews` table added to `packages/db/src/schema.ts` (additive; no
  existing tables reordered/reformatted). Keyed by `snapshotId` (FK to
  `repo_snapshots`, cascade delete) + `prNumber`, unique together.
- Columns cover all six review outputs (`changedFiles`, `coreLogicExplanation`,
  `riskAnalysis`, `testSuggestions`, `comprehensionQuestions`), plus nullable
  `answers`, `score`, and `weakAreas`. Structured/list fields are JSON columns.
- Exported `DiffReview` / `NewDiffReview` types.
- Migration generated: `packages/db/drizzle/0005_sleepy_peter_parker.sql`
  (via `pnpm --filter @workspace/db db:generate`).
- Added `packages/db/src/diff-reviews-schema.test.ts` (5 tests, all pass).

### Verification
- `pnpm --filter @workspace/db test` — 209/209 pass (incl. 5 new).
- `pnpm --filter @workspace/db typecheck` — `schema.ts` and the new test are
  type-clean. There ARE typecheck errors, but they are entirely pre-existing
  WIP from a parallel stream (issue #111): `packages/db/src/github/client.ts`,
  `github/index.ts`, and the new `github/pull-requests.ts`. Confirmed by
  stashing those files — no errors remain in my scope. Not touched (out of
  scope for this stream).

### Out-of-scope files observed (NOT modified by this stream)
- `packages/db/src/github/client.ts` (modified — parallel stream #111 WIP)
- `packages/db/src/github/index.ts` (modified — parallel stream #111 WIP)
- `packages/db/src/github/pull-requests.ts` (new — parallel stream #111 WIP)
- `docs/design/diff-review-page.md` (new — parallel stream WIP)
These were already present in the shared worktree; left untouched.
</content>
</invoke>
