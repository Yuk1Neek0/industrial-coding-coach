---
issue: 45
stream: data-access
started: 2026-05-21T13:00:00Z
status: completed
---

## Scope
Typed template data-access layer + tests (incl. the `templatesReferenced`
resolver).

## Progress
- Created `packages/db/src/templates.ts` — typed data-access layer mirroring
  `catalog.ts`: `listTemplates`, `getTemplateBySlug`, `listTemplatesByCategory`,
  and `resolveTemplates` (expands a Golden Path's `templatesReferenced` slugs
  into full `Template` entries — preserves input order, de-dupes, drops
  unmatched slugs).
- Created `packages/db/src/templates.test.ts` — 11 vitest tests (in-memory DB +
  real migrations).
- Added `export * from "./templates"` to `packages/db/src/index.ts`.
- Verified: `pnpm test` (17 tests pass), `pnpm lint`, `pnpm typecheck`,
  `pnpm build` all PASS.

## Status
Completed. Committed on `epic/template-registry`. Pending human review.
