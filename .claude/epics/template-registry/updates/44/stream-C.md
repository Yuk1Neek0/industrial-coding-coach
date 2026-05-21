---
issue: 44
stream: templates-schema
started: 2026-05-21T12:14:30Z
status: completed
---

## Scope
Template schema + Drizzle migration: a `templates` table in the existing catalog
SQLite DB (ADR 0006).

## Progress
- Added the `templates` table to `packages/db/src/schema.ts` — 15 fields per PRD
  FR-1; `risks`/`alternatives`/`sources`/`fit_factors` as JSON columns mirroring
  `golden_paths`; `slug` unique; `Template`/`NewTemplate` types exported; typed
  JSON interfaces (`TemplateRisk`, `TemplateAlternative`, `TemplateSource`,
  `TemplateFitFactor`).
- Generated migration `packages/db/drizzle/0001_gray_vulcan.sql` via the
  package's `db:generate`; meta journal + snapshot updated.
- Verified: `pnpm lint`, `pnpm typecheck`, `pnpm build` all PASS; fresh-DB
  migration check confirms `golden_paths` + `templates`, 15 columns, unique
  `templates_slug_unique` index.
- No ADR needed — a direct mirror of `golden_paths` under ADR 0006.

## Status
Completed. Committed on `epic/template-registry`. Pending human review.
Unblocks #45 (data-access layer) and #46 (seed) — both build on this schema and
the exported types.
