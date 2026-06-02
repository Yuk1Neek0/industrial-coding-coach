---
issue: 145
title: Challenge Detail Page Spec + Claude Design prompt (inline collapsible prior-attempts panel)
analyzed: 2026-05-24T22:15:00Z
estimated_hours: 6
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #145

## Overview

Page Spec + Claude Design prompt for the M9 Challenge Detail Page. Docs-only. The distinguishing constraint is R5: **most-recent attempt rendered as primary, prior attempts inline collapsible** — make this explicit in the spec and the prompt so the Claude Design draft renders it out of the box.

## Parallel Streams

### Stream A: Page Spec + prompt
**Files**: `docs/design/challenge-detail-page.md`, `docs/design/ui-prompts/challenge-detail-page.md`.
**Can Start**: now.
**Estimated Hours**: 6.

## Coordination Points

- This spec resolves whether the Debug Walkthrough UI (#146) and Completion Review UI (#147) sit inline on the Detail Page or on a sub-route — the resolution affects how #146 and #147 reference their host. Capture the decision in this spec so #146 / #147 specs can reference it.

## Notes for the implementing agent

- **Claude Design only (ADR 0007)** — never "v0".
- R5 normative: most-recent attempt is primary; prior attempts inline (collapsible). Not on a separate page.
- "New challenge" action wires to #142's regeneration path (R2).
- In-scope and out-of-scope file/module sets shown (R8 / FR-3).
- Pick host layout (inline vs sub-route) for the Walkthrough + Review UIs; #146 and #147 will follow.
- Follow `docs/design/` Page Spec conventions from M4/M5/M6/M8.
