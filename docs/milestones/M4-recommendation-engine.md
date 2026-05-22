# M4 — Recommendation Engine

**State:** ✅ Complete — epic #76 done & archived; all tasks #77–#82 merged to
`main` via PR #93 · **Date:** 2026-05-22

Goal: turn a job-seeking junior dev's context into a recommended Golden Path and
template set — with rejected alternatives and a coaching narrative they can use
to defend the choices in an interview.

## Scope decisions

- **Hybrid engine (ADR 0005):** a deterministic, unit-tested scoring layer ranks
  the M2 catalog and M3 registry against the intake and *decides* the
  recommendation; a bounded Anthropic SDK call on the `llm-foundation`
  (`@workspace/ai`) client *only* writes the human-facing narrative — it never
  changes the ranking.
- **Storage (ADR 0006):** one new `recommendations` table joins the existing
  SQLite store — intake, scored result, and narrative; list-valued fields as
  JSON columns. The `narrative` column is nullable: a failed bounded LLM call
  still yields a saved recommendation.
- **Backend package layout:** the engine lives in `packages/db/src/`
  (`recommendation-scoring.ts`, `recommendation-narrative.ts`,
  `recommendations.ts`) beside the M2/M3 data-access it reuses. `packages/db`
  gains `@workspace/ai` as a dependency for the narrative call.
- **UI via Claude Design (ADR 0007):** two page specs + prompts written before
  any generation; the intake form and the result view, integrated into
  `apps/web`.

## Stage status

| Stage | Description | Status |
|---|---|---|
| 1 | CCPM Plan — PRD `recommendation-engine.md` | Done — approved |
| 2 | CCPM Epic → Structure → Sync | Done — epic #76, tasks #77–#82 |
| 3 | Execution — backend + UI specs | Done — #77–#81 |
| 4 | UI integration | Done — #82, Claude Design hand-off integrated |

## Execution backlog

| Issue | Task | Status |
|---|---|---|
| #77 | `recommendations` schema + migration + intake type model | ✅ Done — `a1c89ab` |
| #78 | Deterministic scoring module + tests | ✅ Done — `13351c3` |
| #79 | Recommendation narrative via Anthropic SDK + mocked tests | ✅ Done — `e1b4668` |
| #80 | Recommendations data-access layer + referential-integrity test | ✅ Done — `651b73d` |
| #81 | Intake + Result page specs + Claude Design prompts | ✅ Done — `0b9da10` |
| #82 | Integrate the Recommendation Intake + Result UI | ✅ Done — `7b3a638` |

All six tasks landed via **PR #93** for human review + CI.

## Delivered

- `packages/db` — `recommendations` table + migration `0004_lean_thanos`
  (renumbered from `0003` at merge time, to sit after the parallel
  M5 `stack-explainer` epic's migration); the recommendation engine:
  - **`recommendation-scoring.ts`** — `scoreRecommendation`, a pure
    deterministic function ranking Golden Paths and templates against an intake
    via weighted token-overlap signals. Identical input yields an identical
    ranking; ties break by slug.
  - **`recommendation-narrative.ts`** — `generateRecommendationNarrative`, the
    bounded Anthropic SDK call: a forced structured-output tool call on the
    `@workspace/ai` client, with prompt caching. Returns a discriminated result,
    never thrown; the scoring decision is passed in and never changed.
  - **`recommendations.ts`** — the typed data-access layer (create / read /
    update) supporting human review and edit (FR-7).
- 26 Vitest tests across the three modules; the narrative call is tested on the
  `llm-foundation` mock transport — no API key, no live calls. The
  referential-integrity test proves every cited slug resolves to a real catalog
  entry.
- Two Page Specs + Claude Design prompts under `docs/design/` — the
  Recommendation Intake page and the Recommendation Result page.

## Acceptance Criteria (milestone plan)

- [x] Recommendation cites catalog entries — `recommendedGoldenPathSlug` /
      `recommendedTemplateSlugs` by slug; scoring only ever cites real entries,
      proven by the referential-integrity test.
- [x] Recommendation includes trade-offs — `rejectedAlternatives` with reasons,
      plus the four-part narrative (why it fits, complexity risks, learning
      checkpoints, portfolio value).
- [x] Recommendation is reviewable and editable by a human — the data-access
      `update` and the result page's in-place edit mode (FR-7).
- [x] The Intake and Result pages are integrated into `apps/web` — task #82:
      `/recommend` and `/recommend/[id]`, wired to the engine via Server Actions.

## UI integration (#82)

The user generated the two UIs in Claude Design and returned the handoff
bundle; #82 recreated them in the App Router stack. New routes: `/recommend`
(the nine-field intake form) and `/recommend/[id]` (the result view, with edit
mode and a generate-coaching-notes action for the nullable-narrative state).
Scoring, the narrative call, and persistence run server-side via Server Actions
— the page never calls the Anthropic SDK. See `docs/design/ui-integration-notes/`.

## Definition of Done

Complete — **PR #93** passed CI, was reviewed, and merged to `main`; the epic
is closed and archived to `.claude/epics/archived/recommendation-engine/`.
Exercising a generated narrative needs `ANTHROPIC_API_KEY` set locally; without
it the deterministic recommendation is still produced and saved.
