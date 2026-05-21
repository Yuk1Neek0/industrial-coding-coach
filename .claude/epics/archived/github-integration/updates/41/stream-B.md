---
issue: 41
stream: import-page-spec
started: 2026-05-21T12:14:30Z
status: completed
---

## Scope
Import page spec + Claude Design prompt (UI hand-off gate). Documentation only.

## Progress
- Wrote `docs/design/github-import-page.md` — a 14-section Page Spec mirroring
  the M2 Catalog spec: route `/import`, data contract (`importRepository`,
  `getImportedRepo`, typed `ImportResult` + five error kinds), in-progress /
  success / error states, accessibility notes, acceptance criteria.
- Wrote `docs/design/ui-prompts/github-import-page.md` — the Claude Design
  UI-generation prompt derived from the spec, plus integrator notes for #42.
- Terminology: uses "Claude Design" per ADR 0007 (task #41 / PRD say "v0" — the
  same page-spec → UI-draft hand-off gate).

## Status
Completed. Committed on `epic/github-integration`. Pending human review.
HAND-OFF GATE: the user generates the UI draft in Claude Design; task #42
integrates it.
