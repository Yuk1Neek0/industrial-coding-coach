---
issue: 138
title: Integrate M7 UI into apps/web (Wave 4 final)
analyzed: 2026-05-25T00:55:00Z
estimated_hours: 18
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #138

## Overview

Wave 4 integration: wire all five M7 UI pieces into `apps/web` and connect them to the four backend pieces shipped in Waves 1–3 (#131 schema, #132 issue-fetch + normalized input, #133 generation, #134 grading, #135 DAL + integrity check, #136 four UI Page Specs, #137 per-repo Issues list Page Spec). Final task on the M7 critical path — on merge, M7 is feature-complete.

Single-stream task. The five pages are tightly coupled (they share routes, server actions, the `learning_units` DAL, the integrity check, and the typed shapes). Splitting into sub-streams would force inter-stream coordination overhead that exceeds the per-stream savings. One agent on one branch.

## Parallel Streams

### Stream A: full M7 UI integration
**Scope**:
- Per-repo Issues list page at `apps/web/app/repos/[owner]/[repo]/issues/page.tsx` reading the issue-fetch surface (#132) and per-row learning-unit status (#135 DAL).
- Issue Learning Workspace page at `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx` composing Review Checklist + Understanding Questions + Challenge Panel.
- Server actions / route handlers invoking `generateLearningUnit` (#133), `gradeLearningUnit` (#134), and the #135 DAL's `createLearningUnit` / `getLearningUnit` / `recordAnswers` / `recordScore` / `updateChecklistState`.
- Integration-boundary check: every page calls `verifyLearningUnitIntegrity` (#135) before rendering; unresolved file refs surface as explicit error state.
- Integration notes under `docs/design/ui-integration-notes/` (one per UI — five total) documenting any deviations from the Page Specs in `docs/design/`.
- End-to-end happy-path test (mocked SDK + mocked GitHub) covering: open a unit → see related files / concepts / agent notes → mark one checklist item → answer questions → receive score + weak-area → reload to see persisted state.
**Files**:
- `apps/web/app/repos/[owner]/[repo]/issues/page.tsx` (new)
- `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx` (new)
- `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/actions.ts` (new server actions)
- `apps/web/lib/learning-units.ts` (or sibling) — orchestration helper
- React components for Review Checklist / Understanding Questions / Challenge Panel (likely under `apps/web/components/learning-units/`)
- `docs/design/ui-integration-notes/{issue-learning-workspace,review-checklist,understanding-questions,challenge-panel,per-repo-issues-list}.md` (5 new files)
- End-to-end test under `apps/web/app/...test.ts` or `apps/web/lib/...test.ts`
**Can Start**: now (depends_on [133, 134, 135, 136, 137] all done).
**Estimated Hours**: 18.

## Coordination Points

- **No file conflicts** with other in-flight work: M9 #143 (still in flight) lives entirely in `packages/db/src/challenges/`. M9 #148 (integration, still blocked on #143) lives in `apps/web/app/repos/[owner]/[repo]/challenges/` — separate route tree from M7's `issues/` route tree. Safe to run in parallel with both.
- Reuses M11's imported-repo page as the entry point (the "Issues" tab links from there).

## Conflict Risk Assessment

Low. Routes are **additive** under `apps/web/app/repos/[owner]/[repo]/`. No edits to existing M6 / M8 routes (both shipped). No schema changes. No new dependencies.

## Notes for the implementing agent

- **Claude Design integration notes (ADR 0007)**: the round-trip is Page Spec → prompt → Claude Design draft → integration notes. The Page Specs (#136 + #137) and prompts (under `docs/design/ui-prompts/`) are already shipped. **This task ships the integration notes** under `docs/design/ui-integration-notes/` — one per UI documenting deviations from the spec.
- **Do not invoke Claude Design** (that's an external manual step done by a human). Build the React components / pages from the Page Specs as the design source.
- **R4 (no checklist gating)** is normative — the Workspace page must surface checklist completion as a progress indicator only; do NOT block scoring on it.
- **R5 (per-repo IA)** — wire only the per-repo Issues list. No global cross-repo issues route.
- **R6 (per-unit scoring)** — show the score on the unit. Do NOT add any aggregate / rollup view (M10 owns that).
- Mirror M8's integration task: `.claude/epics/archived/diff-review/116.md`. Read it + the shipped `apps/web` code from M8 first.
- Test posture: end-to-end happy-path test uses the mocked SDK + mocked GitHub from `llm-foundation` and #132. CI runs with no `ANTHROPIC_API_KEY` and no `GITHUB_TOKEN`.
- Routes are additive — coordinate paths against the shipped M6 / M8 routes but no conflict expected.
