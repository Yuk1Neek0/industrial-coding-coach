# M5 — Stack Decision Explainer

**State:** ✅ Complete — epic #83 done & archived; all tasks #84–#89 merged to
`main` via PR #92 · **Date:** 2026-05-22

Goal: help a job-seeking junior dev understand *why* their AI-assisted project
uses its technology stack — a stack decision map, per-tool purpose, alternatives
and trade-offs, job-market relevance, key files to inspect, and debugging entry
points — all tied to the actual imported repo, never generic tutorial text.

## Scope decisions

- **LLM mechanism (ADR 0005):** a bounded Anthropic SDK call — prompt →
  structured output, with tool use to read snapshot files — on the
  `llm-foundation` (`@workspace/ai`) client. Not an autonomous agent: bounded by
  a fixed two-tool set, a 5-turn cap, and a forced submission on the final turn.
- **Storage (ADR 0006):** one new `stack_explanations` table joins the existing
  SQLite store — keyed by snapshot, list-valued fields as JSON columns.
- **Detection is deterministic and separate from the LLM call** — a pure,
  tested module parses package/config files into a known tool set the call
  reasons over, so detection is reproducible.
- **Backend package layout:** all M5 backend code lives in `packages/db/src/
  stack/` (detection, the explanation call, the data-access layer), beside the
  M11 GitHub client it reuses. `packages/db` gains `@workspace/ai` as a
  dependency for the explanation call.
- **UI via Claude Design (ADR 0007):** three page specs + prompts written
  before any generation; the Stack Decision Map and Alternatives Comparison are
  components inside the Stack Explanation page.

## Stage status

| Stage | Description | Status |
|---|---|---|
| 1 | CCPM Plan — PRD `stack-explainer.md` | Done — approved |
| 2 | CCPM Epic → Structure → Sync | Done — epic #83, tasks #84–#89 |
| 3 | Execution — backend + UI specs | Done — #84–#88 (see backlog) |
| 4 | UI integration | Done — #89, Claude Design hand-off integrated |

## Execution backlog

| Issue | Task | Status |
|---|---|---|
| #84 | `stack_explanations` schema + Drizzle migration | ✅ Done — `2074f9d` |
| #85 | Stack detection module + tests | ✅ Done — `3f69a3e` |
| #86 | Stack explanation via Anthropic SDK + mocked tests | ✅ Done — `a699bd1` |
| #87 | Stack-explanations data-access layer + integrity check | ✅ Done — `f9a31bb` |
| #88 | Stack Explainer page specs + Claude Design prompts | ✅ Done |
| #89 | Integrate the Stack Explainer UI | ✅ Done |

All six tasks are implemented on the `epic/stack-explainer` branch and land via
**PR #92** for human review + CI.

## Delivered (so far)

- `packages/db` — `stack_explanations` table + migration `0003`; the
  `src/stack/` backend:
  - **`detect.ts`** — `detectStack`, a pure deterministic module parsing
    `package.json`, lockfiles, and config/CI files into the major tools, with a
    registry of ~80 JS/TS-ecosystem packages. Skips an unparseable manifest
    gracefully. `detectStackForSnapshot` reads via the M11 data-access layer.
  - **`explain.ts`** — `explainStack`, the bounded Anthropic SDK call: reads
    snapshot files, runs detection, grounds optionally on M3 template facts,
    and makes a tool-use call (`read_snapshot_file` + `submit_stack_explanation`)
    on the `@workspace/ai` client. Returns a discriminated result, never thrown.
  - **`explanations.ts`** — the typed data-access layer (create / read / update
    / `saveStackExplanation` upsert) and the FR-4 file-reference integrity check.
- 45 Vitest tests across the three modules; the explanation call is tested on
  the `llm-foundation` mock transport — no API key, no live calls.
- Three Page Specs + Claude Design prompts under `docs/design/` — the Stack
  Explanation page, the Stack Decision Map, and the Alternatives Comparison.

## Acceptance Criteria (milestone plan)

- [x] User can explain the purpose of each major tool — `tools[].purpose`,
      grounded in real files by the explanation call.
- [x] User can explain what would change if an alternative were used —
      `tools[].alternatives[].tradeOff`.
- [x] Explanation is tied to the project, not generic tutorial text — the call
      reads real snapshot files via tool use; the integrity check enforces that
      cited paths resolve.
- [x] The three UIs are integrated into `apps/web` — task #89: `/stack` and
      `/stack/[owner]/[repo]`, wired to `explainStack` / `saveStackExplanation`
      / `getStackExplanationByRepo` via the `explainStackAction` Server Action.

## UI integration (#89)

The user generated the three UIs in Claude Design and returned the handoff
bundle; #89 recreated them in the App Router stack. New routes: `/stack` (the
imported-repo chooser) and `/stack/[owner]/[repo]` (the Stack Explanation
page). The explanation runs server-side via a Server Action — the page never
calls the Anthropic SDK. See `docs/design/ui-integration-notes/`.

## Definition of Done

Complete — **PR #92** passed CI, was reviewed, and merged to `main`; the epic
is closed and archived to `.claude/epics/archived/stack-explainer/`. Exercising
the full explained flow needs an imported repo (M11) and `ANTHROPIC_API_KEY`
set locally.
