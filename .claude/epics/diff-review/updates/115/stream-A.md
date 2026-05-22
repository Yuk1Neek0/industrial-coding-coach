---
issue: 115
stream: page-specs
started: 2026-05-22T15:10:00Z
status: completed
completed: 2026-05-22T15:40:00Z
---

# Issue #115 — Diff Review page specs + Claude Design prompts

Stream A: author the four M8 Page Specs and their four Claude Design prompts —
the UI hand-off gate (ADR 0007) that unblocks integration task #116.

## Scope

DOCS ONLY — no application code. Files only under `docs/design/` and
`docs/design/ui-prompts/`.

## Deliverables — all complete

Page Specs (`docs/design/`):
- [x] `diff-review-page.md` — Diff Review page (top-level `/reviews/[id]` route)
- [x] `risk-analysis-panel.md` — Risk Analysis Panel (embedded component)
- [x] `understanding-check.md` — Understanding Check UI (embedded component)
- [x] `score-weak-area.md` — Score / Weak Area UI (embedded component)

Claude Design prompts (`docs/design/ui-prompts/`):
- [x] `diff-review-page.md`
- [x] `risk-analysis-panel.md`
- [x] `understanding-check.md`
- [x] `score-weak-area.md`

## Acceptance criteria (task 115.md)

- [x] Page Specs under `docs/design/` for all four M8 UI pieces.
- [x] A Claude Design prompt under `docs/design/ui-prompts/` for each.
- [x] Specs cover the answer-and-score loop — question display + answer entry
      (Understanding Check §6/§7) and the graded score / weak-area presentation
      (Score / Weak Area §6). Diff Review §5/§6f/§6g/§12 specifies the
      before/after-answering states end to end.
- [x] Specs reference the typed review and grading output shapes — `DiffReview`,
      `ChangedFileExplanation`, `DiffHunk`, `PullRequestRef`, `RiskFinding`,
      `TestSuggestion`, `ComprehensionQuestion`, `AnswerInput`, `AnswerRecord`,
      `GradingResult`, `QuestionGrade`, `WeakArea` — defined in the §5 contract
      section of each spec, derived from PRD FR-3/FR-4/FR-5. Each notes
      `packages/db` is authoritative at integration time.

## Notes

- Format mirrors the M4/M5 page specs (14-section structure) and prompts.
- Typed shapes are described from the PRD/epic — the M8 code (tasks
  #112/#113/#114) is not yet merged, so the specs define the contract
  integration (#116) must match.
- All four specs/prompts are unreviewed drafts — human review is the gate before
  any Claude Design generation (ADR 0007); each spec's §14 ends with the
  "human-reviewed before the prompt is used" criterion.
