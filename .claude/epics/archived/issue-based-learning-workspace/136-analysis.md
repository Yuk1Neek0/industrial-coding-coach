---
issue: 136
title: Four-UI Page Specs + Claude Design prompts (Issue Learning Workspace, Review Checklist, Understanding Questions, Challenge Panel)
analyzed: 2026-05-24T21:05:00Z
estimated_hours: 10
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #136

## Overview

Author four **Page Specs** under `docs/design/` and matching **Claude Design prompts** under `docs/design/ui-prompts/` for the M7 UI pieces: Issue Learning Workspace page, Review Checklist UI, Understanding Questions UI, and Challenge Panel stub renderer. Docs-only task — no `apps/web` edits, no code. Per ADR 0007, no UI is generated before a Page Spec + prompt exist.

Single-stream task. The four Page Specs share conventions (M4/M5/M6/M8 precedent), reference the same shipped typed shapes (`LearningUnit`, `Question[]`, `Score`, `WeakArea[]`), and need to read coherently as a set. Splitting into 4 parallel sub-streams would lose that coherence and force four agents to each re-derive the same shared context for marginal speedup; one agent writes all four sequentially in ~10h.

## Parallel Streams

### Stream A: All four Page Specs + four Claude Design prompts
**Scope**:
- `docs/design/issue-learning-workspace.page-spec.md` (top-level page composing the three sub-components; route `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx`).
- `docs/design/review-checklist.page-spec.md` (R4: surfaces progress only, does NOT gate the score).
- `docs/design/understanding-questions.page-spec.md` (mirrors M8's Score / Weak Area UI per the PRD).
- `docs/design/challenge-panel.page-spec.md` (FR-7 / R3: read-only M9-deferred stub).
- `docs/design/ui-prompts/issue-learning-workspace.prompt.md`
- `docs/design/ui-prompts/review-checklist.prompt.md`
- `docs/design/ui-prompts/understanding-questions.prompt.md`
- `docs/design/ui-prompts/challenge-panel.prompt.md`
**Files**: 8 new files under `docs/design/`
**Can Start**: immediately
**Estimated Hours**: 10
**Dependencies**: none (in-epic). Reads the typed shapes from #131 / #133 / #134 but those typed shapes don't have to be **implemented** to be **referenced** in the spec.

## Coordination Points

### Shared Files
- No existing files edited. All 8 are new and live in distinct paths.

### Sequential Requirements
- The Page Specs reference typed shapes from #133 (`LearningUnit`, `Question[]`) and #134 (`Score`, `WeakArea[]`). The specs **cite** these shapes; they don't import them. So this task doesn't have to wait on #133 / #134 to ship.
- Task #137 also writes Page Specs under `docs/design/` but for a different page (the per-repo Issues list). Different files; no overlap.

## Conflict Risk Assessment

Low. All files are new. No edits to CLAUDE.md, ADRs, PRDs, the epic file, or any code.

## Parallelization Strategy

None within this task. The agent writes all four Page Specs + four prompts on a single branch off `epic/issue-based-learning-workspace`.

## Expected Timeline

- With parallel execution: 10h wall time (same as serial)
- Without: 10h
- Efficiency gain: 0% (intentionally so — coherence > parallel)

## Notes for the implementing agent

- **Claude Design only (ADR 0007)** — v0 is superseded across the project. The Page Specs must explicitly cite Claude Design as the UI generator and reference ADR 0007. **Never write "v0" anywhere.**
- Follow the existing `docs/design/` Page Spec conventions from M4 / M5 / M6 / M8. Each spec should have: header (title, route, status), product context, data contract (typed shapes consumed/produced), interaction spec, accessibility notes, and a "What this page does not do" exclusions section.
- For the Understanding Questions UI, **mirror the shape of M8's Score / Weak Area UI** so M7 and M8 produce one comprehension-grading pattern in the product.
- For the Review Checklist UI, **R4 is normative**: the spec must make explicit that checklist completion is a progress indicator only and does NOT gate the score.
- For the Challenge Panel, **FR-7 + R3 are normative**: the stub renders `challenge_concept` + `challenge_type` and an explicit "deferred to M9" message; it does not run, grade, or claim to resolve a challenge.
- The Claude Design prompts (`docs/design/ui-prompts/*.prompt.md`) follow the convention from M6 (task 107) and M8 (task 115): paste the typed data contract in, explicit Claude Design instructions, shadcn/ui component notes.
