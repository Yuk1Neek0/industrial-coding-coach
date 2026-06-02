---
issue: 147
title: Completion Review UI Page Spec + Claude Design prompt
analyzed: 2026-05-24T22:15:00Z
estimated_hours: 5
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #147

## Overview

Page Spec + Claude Design prompt for the Completion Review UI — renders the grading-call output (0–100 score + weak-area breakdown matching M8, per-criterion result, short feedback paragraph). Docs-only. Per ADR 0007.

## Parallel Streams

### Stream A: Page Spec + prompt
**Files**: `docs/design/completion-review-ui.md`, `docs/design/ui-prompts/completion-review-ui.md`.
**Can Start**: now.
**Estimated Hours**: 5.

## Coordination Points

- Host route resolved by #145 (Detail Page spec).
- Visual shape **shares M8's Score / Weak Area UI** (R4). Reference M8's spec; do not redefine.

## Notes for the implementing agent

- **Claude Design only (ADR 0007)** — never "v0".
- R4 normative: 0–100 score + weak-area breakdown that mirrors M8's grading shape. Pass threshold and weak-area schema are **shared with M8**, not redefined. Cite M8's spec by path.
- FR-7 normative: the page does **not** claim "this passes" — scoring is over the user's explanation only, not executed code.
- Every file/module reference shown in the review resolves to a real M6 project-map path (R8 / FR-6). The page renders only outputs that have passed the integrity check (#141).
- "Retry this challenge" affordance (US-6) returns to the Walkthrough UI for a new attempt.
- Follow `docs/design/` Page Spec conventions from M4/M5/M6/M8.
