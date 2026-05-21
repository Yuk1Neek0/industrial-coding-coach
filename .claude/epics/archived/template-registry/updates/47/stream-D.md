---
issue: 47
stream: registry-page-spec
started: 2026-05-21T12:14:30Z
status: completed
---

## Scope
Template Registry page spec + Claude Design prompt (UI hand-off gate).
Documentation only.

## Progress
- Created `docs/design/template-registry-page.md` — 14-section Page Spec
  mirroring the M2 Catalog spec: routes `/templates` and `/templates/[slug]`,
  data contract, list view (15 templates browsable by category) + detail view.
  §6a specifies the new Template Fit Score as a qualitative three-part card —
  deliberately no invented numeric score (M4 owns scoring).
- Created `docs/design/ui-prompts/template-registry-page.md` — the Claude
  Design UI-generation prompt derived from the spec.
- Terminology: "Claude Design" per ADR 0007 (task #47 / PRD say "v0").

## Status
Completed. Committed on `epic/template-registry`. Pending human review.
HAND-OFF GATE: the user generates the UI draft in Claude Design; task #48
integrates it.
