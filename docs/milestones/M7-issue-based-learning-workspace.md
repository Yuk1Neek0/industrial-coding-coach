# M7 — Issue-Based Learning Workspace

**State:** ✅ Complete — epic #130 done; all tasks #131–#138 merged to
`main` via PR #167 · **Date:** 2026-05-27

Goal: take a GitHub Issue (or a local CCPM task file) on the user's imported
repository and produce a typed seven-part learning unit — restated goal,
related files, concepts, AI-agent execution notes, review checklist,
understanding questions, and a minimal debug/expand challenge stub — then let
the user answer the questions and prove they understand the issue. M7 grades
the answers into a per-unit score and weak-area breakdown that match M8's
grading shape, persists the unit (plus answers, score, checklist state) to a
single `learning_units` row, and surfaces the whole loop through four
Claude-Design page specs plus a per-repo issues list.

## Scope decisions

- **LLM mechanism (ADR 0005):** two **bounded Anthropic SDK calls** — prompt
  → structured output, tool use to read snapshot files (M11) and M6
  project-map entries — on the shipped `llm-foundation` (`@workspace/ai`)
  client. Not autonomous agents, and not LangChain.
- **Two separate calls.** The generation call (the seven-part unit) and the
  grading call (answers → score + weak-area breakdown) are distinct so
  grading is reproducible: the question set is fixed at generation time,
  before any answer is graded. Same separation pattern as M8.
- **Single normalized input shape (R1).** GitHub Issues and CCPM task files
  are normalized into one learning-unit input shape; `source: 'github-issue'
  | 'ccpm-task'` is metadata only, and the unit + its UI do not differentiate
  by source.
- **Storage (ADR 0006):** one new `learning_units` table joins the existing
  SQLite store — keyed by snapshot + source + `issueRef` (unique). User
  answers, score, weak-area breakdown, and review-checklist state all live
  as JSON columns on the same row — no companion tables, mirroring
  `project_maps` (M6) and `diff_reviews` (M8).
- **Minimal challenge stub only (R3).** The unit ships only
  `challenge_concept` and `challenge_type` stub columns; M9 owns the full
  challenge schema and pre-allocates nothing for it here.
- **No checklist gating (R4).** The review checklist surfaces progress only
  — it does not gate the understanding-question score.
- **Strictly per-unit scoring (R6).** No aggregate "comprehension for this
  repo" view; M10 owns any cross-unit rollup.
- **Issue fetching extends the M11 GitHub client (ADR 0009).** Issue
  endpoints layered onto the shipped `packages/db/src/github` client,
  mirroring the M8 PR-fetch extension. No second access path; read-only.
- **Per-repo issues list as the entry point (R5).** Imported-repo page →
  "Issues" tab → issue row → learning-unit page. No global cross-repo
  index.
- **UI via Claude Design (ADR 0007):** five page specs + prompts written
  before any generation — Issue Learning Workspace page, Review Checklist
  UI, Understanding Questions UI, Challenge Panel stub, per-repo Issues
  list.

## Execution backlog

| Issue | Task | Closing PR |
|---|---|---|
| #131 | `learning_units` schema + Drizzle migration | #150 |
| #132 | Issue fetching in the M11 GitHub client + CCPM-task adapter + normalized input | #153 |
| #133 | Generation SDK call + tool use + integrity check + mocked tests | #162 |
| #134 | Understanding-check grading call + mocked tests | #164 |
| #135 | `learning_units` data-access layer + integrity check | #155 |
| #136 | Four UI Page Specs + Claude Design prompts | #154 |
| #137 | Per-repo Issues list Page Spec + Claude Design prompt | #152 |
| #138 | Wave 4 — integrate M7 UI into `apps/web` | #166 |

All eight tasks were executed in parallel waves in the
`epic/issue-based-learning-workspace` worktree and landed via **PR #167**
for human review + CI.

## Delivered

- `packages/db` — `learning_units` table + migration
  `0007_low_quasimodo.sql`; the M11 GitHub client extended with issue
  fetching + CCPM-task adapter (`src/github/issues.ts`,
  `src/github/ccpm-task-adapter.ts`); the `src/learning-units/` backend:
  - **`generate.ts`** — `generateLearningUnit`, the bounded Anthropic SDK
    call: a fixed tool set (`read_snapshot_file` + `read_project_map_entry`
    + forced `submit_learning_unit`), bounded turn cap, degrades gracefully
    when an issue has no body / referenced files are missing / no M6 map
    exists (explicit "none found" / "project map unavailable" sections
    instead of failure).
  - **`grade.ts`** — `gradeUnderstandingCheck`, a separate single-turn
    bounded call (forced `submit_grading`, no tool loop): takes the fixed
    question set + the user's answers, returns a typed score and weak-area
    breakdown shaped exactly like M8's grading.
  - **`integrity.ts`** — file-reference integrity check (FR-4): every
    related-files path resolves to a real snapshot path; every concept
    ties to a related file or an M6 project-map node; every checklist item
    is concrete to this issue. Unresolved references fail the unit rather
    than silently rendering broken links.
  - **`units.ts`** — the typed data-access layer: create/read/update units,
    answers, score, weak-areas, and checklist state on the single
    `learning_units` row.
- `apps/web` — routes `/repos/[owner]/[repo]/issues` (per-repo issues list)
  and `/repos/[owner]/[repo]/issues/[issueRef]` (learning workspace);
  Review Checklist, Understanding Questions, and Challenge Panel components
  wired into the full fetch → generate → answer → grade loop in Server
  Actions. LLM and GitHub calls run server-side only.
- All calls tested on the `@workspace/ai` mock transport and mocked
  GitHub-client responses — no API key, no live calls in CI.

## Acceptance Criteria (epic)

- [x] Drizzle migration `learning_units` exists, applies cleanly, and
      stores user answers / score / weak-area breakdown / checklist state
      as JSON columns on a single row (R2).
- [x] Given a sample GitHub Issue (or CCPM task) on an imported repo, the
      generation call produces a typed seven-part learning unit grounded
      in real snapshot paths and, where present, M6 project-map nodes.
- [x] The integrity check rejects unresolved file references in tests
      (FR-4) — unit fails rather than silently rendering broken links.
- [x] The grading call scores answers into a per-unit score + weak-area
      breakdown matching the M8 grading shape; strictly per-unit (R6).
- [x] Issue fetching is added to the existing M11 GitHub client (one
      access path, ADR 0009); the CCPM-task adapter normalizes to the same
      input shape (R1); the PR-fetching shipped in M8 is intact.
- [x] The five UI pieces are integrated into `apps/web` via Claude Design
      — Page Specs under `docs/design/`, prompts under
      `docs/design/ui-prompts/`, integration notes under
      `docs/design/ui-integration-notes/`.
- [x] Verified green (lint/typecheck/build/test) with no `ANTHROPIC_API_KEY`
      set and no live GitHub calls.

## Retrospective

**What went well**

- The two-call shape transferred cleanly from M8. The grading SDK call
  reused M8's `WeakArea` type and pass-threshold convention without
  modification, so the two surfaces feel like one product — no second
  comprehension-grading pattern to maintain.
- The "normalize GitHub Issues and CCPM tasks into one shape" architecture
  decision held up: the CCPM-task adapter is a few hundred lines, sits
  next to the GitHub issue fetcher, and both paths feed the same
  generation call. The UI never branches on `source`.
- All eight tasks ran in the planned 4-wave shape on
  `epic/issue-based-learning-workspace`; the per-task PRs (`#150` →
  `#166`) merged cleanly into the epic branch via in-epic PRs before the
  single epic-PR `#167` to `main`.

**What to watch — lessons**

- **No cross-epic migration collision *within* M7's own merge.** Unlike
  M6+M8, this epic's `0007_low_quasimodo.sql` landed on `main` cleanly.
  The collision came one step later — see M9's retrospective — where M7
  and M9 had both reserved migration slot `0007` in parallel worktrees,
  forcing M9 to regenerate as `0008` at merge time.
- **Page-spec ↔ shipped-shape drift watch.** Same risk M8 called out
  (severity/category fields the schema doesn't have): keep an eye on the
  Page Specs vs. the shipped `LearningUnit` / `UnderstandingQuestion`
  types as M10 lands rollups on top.

**Follow-ups**

- M9 ships the full challenge schema. The `challenge_concept` /
  `challenge_type` stub columns on `learning_units` are intentionally
  unused after M9 lands its own `challenges` table — leave them as
  scaffolding for now; revisit during the first cross-unit cleanup pass.
- App-wide nav still per-feature: the "Issues" entry was added to this
  feature's `chrome.tsx` only. The unifying nav pass remains unscoped.
- M9 was already next per the milestone plan and shipped alongside M7;
  M10 is now the next milestone.
