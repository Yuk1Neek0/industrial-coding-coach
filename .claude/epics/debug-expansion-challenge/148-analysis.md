---
issue: 148
title: Integrate M9 UI into apps/web (Wave 4 final)
analyzed: 2026-05-25T01:15:00Z
estimated_hours: 18
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #148

## Overview

Wave 4 integration: wire the four M9 UI pieces into `apps/web` and connect them to the backend Waves 1–3. On merge, M9 is feature-complete. Mirrors M7 #138's shape exactly but in the M9 route tree.

Single-stream task. The four UIs are tightly coupled (Detail Page hosts Walkthrough + Review inline per #145; list/detail share server actions; all share the M9 DAL and integrity check). Splitting adds coordination overhead exceeding parallel savings.

## Parallel Streams

### Stream A: full M9 UI integration
**Scope**:
- Challenge List Page at `apps/web/app/repos/[owner]/[repo]/challenges/page.tsx` — reads challenges via #140 DAL; per-row content names target file(s)/module(s) from M6 map (US-1); types not applicable are omitted (R1 / R6); latest 0–100 outcome per row (R5).
- Challenge Detail Page at `apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/page.tsx` — renders type / description / in-scope / out-of-scope / acceptance criteria (R8). Hosts Debug Walkthrough UI + Completion Review UI **inline** per #145's hosting decision. **Inline collapsible prior-attempts panel** (R5) shows most-recent attempt as primary; prior attempts collapsed below with timestamps.
- "New challenge" action wires to #142's regeneration path (R2).
- Server actions: invoke `generateChallenge` (#142), `gradeChallenge` (#143); persist via #140 DAL; on each generation / grading, call `verifyChallengeIntegrity` (#141).
- Integration notes under `docs/design/ui-integration-notes/` — four files documenting deviations from the Page Specs.
- End-to-end happy-path test (mocked SDK + mocked GitHub) covering: list challenges → open challenge → submit explanation → receive 0–100 score + weak-area → see attempt in history → retry.
**Files**:
- `apps/web/app/repos/[owner]/[repo]/challenges/page.tsx` (new)
- `apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/page.tsx` (new)
- `apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/actions.ts` (new server actions)
- React components for List Entry / Detail / Debug Walkthrough / Completion Review (likely under `apps/web/components/challenges/`)
- `docs/design/ui-integration-notes/{challenge-list-page,challenge-detail-page,debug-walkthrough-ui,completion-review-ui}.md` (4 new)
- End-to-end test under `apps/web/...test.ts`
**Can Start**: now (depends_on all M9 prior tasks satisfied).
**Estimated Hours**: 18.

## Coordination Points

- **No conflict with M7 #138** (in flight): M7 lives in `apps/web/app/repos/[owner]/[repo]/issues/` and `apps/web/components/learning-units/`; M9 lives in `.../challenges/` and `apps/web/components/challenges/`. Different file trees. Both PRs can be open simultaneously.
- Reuses M11's imported-repo page as the entry point (a "Challenges" tab alongside the "Issues" tab from M7).

## Conflict Risk Assessment

Low. Routes are additive under `apps/web/app/repos/[owner]/[repo]/`. No edits to shipped M6 / M8 routes. No schema changes (#140 owns those). No new dependencies.

## Notes for the implementing agent

- **Claude Design integration notes (ADR 0007)**: the round-trip is Page Spec → prompt → Claude Design draft → integration notes. Specs and prompts are shipped. **This task ships the integration notes** documenting deviations; **do NOT invoke Claude Design (manual external step).**
- **R5 (inline collapsible prior-attempts panel)** is the distinguishing constraint — must be inline on the Detail Page, not a separate page.
- **R3 + FR-7 (explanation-only grading)** — surface inline in the Walkthrough UI so the user is not misled into thinking snippet quality affects the score.
- **R8 (in/out-of-scope strictly map-named)** — the snippet file-path picker is restricted; no free-typed paths.
- **R6 (broken-CI gated)** is handled server-side in #142; the UI just doesn't show the type when it's omitted.
- **R7 (M10 deferred)** — do NOT add any aggregate / rollup view. M10 owns that.
- Mirror M7 #138's integration approach (still in flight at PR #166-ish; if shipped, read it; otherwise mirror M8 `.claude/epics/archived/diff-review/116.md`).
- Test posture: end-to-end happy-path test uses mocked SDK + mocked GitHub. CI runs with no `ANTHROPIC_API_KEY` and no `GITHUB_TOKEN`.
