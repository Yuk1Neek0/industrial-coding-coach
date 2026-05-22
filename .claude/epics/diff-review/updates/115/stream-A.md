---
issue: 115
stream: page-specs
started: 2026-05-22T15:10:00Z
status: in_progress
---

# Issue #115 — Diff Review page specs + Claude Design prompts

Stream A: author the four M8 Page Specs and their four Claude Design prompts —
the UI hand-off gate (ADR 0007) that unblocks integration task #116.

## Scope

DOCS ONLY — no application code. Files only under `docs/design/` and
`docs/design/ui-prompts/`.

## Deliverables

Page Specs (`docs/design/`):
- [ ] `diff-review-page.md` — Diff Review page
- [ ] `risk-analysis-panel.md` — Risk Analysis Panel
- [ ] `understanding-check.md` — Understanding Check UI
- [ ] `score-weak-area.md` — Score / Weak Area UI

Claude Design prompts (`docs/design/ui-prompts/`):
- [ ] `diff-review-page.md`
- [ ] `risk-analysis-panel.md`
- [ ] `understanding-check.md`
- [ ] `score-weak-area.md`

## Notes

- Format mirrors the M4/M5 page specs (14-section structure) and prompts.
- Typed shapes (`DiffReview`, `ChangedFileExplanation`, `RiskFinding`,
  `ComprehensionQuestion`, `GradingResult`, `WeakArea`) are described from the
  PRD/epic — the M8 code (tasks #112/#113/#114) is not yet merged, so the specs
  define the contract integration (#116) must match.
