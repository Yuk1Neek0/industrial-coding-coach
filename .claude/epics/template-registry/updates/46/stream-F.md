---
issue: 46
stream: seed-and-entries
started: 2026-05-21T13:00:00Z
status: completed
---

## Scope
15 template entries + seed script + referential-integrity test.

## Progress
- Created `packages/db/src/template-seed-data.ts` — 15 hand-authored
  `NewTemplate` entries across 7 categories; every field populated; all 11
  `goldenPathSeed.templatesReferenced` slugs covered (4 new slugs added).
- Created `template-seed-data.test.ts` (entry-completeness checks) and
  `referential-integrity.test.ts` (FR-6: every `templatesReferenced` slug
  resolves to exactly one template).
- Extended `packages/db/src/seed.ts` to load the 15 templates alongside the
  Golden Paths.
- Verified: `pnpm lint`, `pnpm typecheck`, `pnpm build` all PASS; 39 db tests
  pass; `pnpm db:seed` seeds 5 Golden Paths + 15 templates.

## Status
Completed. Committed on `epic/template-registry`. Pending human review.
