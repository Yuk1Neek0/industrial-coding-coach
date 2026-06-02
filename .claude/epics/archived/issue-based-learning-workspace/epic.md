---
name: issue-based-learning-workspace
status: completed
created: 2026-05-24T19:36:42Z
progress: 0%
prd: .claude/prds/issue-based-learning-workspace.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/130
---

# Epic: issue-based-learning-workspace

## Overview

Milestone 7. Build the Issue-Based Learning Workspace: given a GitHub Issue
(or a local CCPM task file) on the user's imported repository, a bounded
Anthropic SDK call (per ADR 0005) on the shipped `llm-foundation` client
produces a typed seven-part learning unit — restated goal, related files,
concepts, AI-agent execution notes, review checklist, understanding questions,
and a minimal debug/expand challenge stub — using tool use to read snapshot
files (M11) and M6 project-map entries. A second bounded grading call
(M8-shaped) scores the user's answers into a per-unit score and weak-area
breakdown. Units, answers, scores, and checklist state persist to the existing
SQLite database on a single `learning_units` table with JSON columns; the M11
GitHub client is extended with issue fetching; four UIs plus a per-repo issues
list are produced through the Claude Design round-trip.

## Architecture Decisions

- **LLM mechanism fixed by ADR 0005** — M7 is a **bounded Anthropic SDK call**
  (prompt → structured output, with tool use to read snapshot files and M6
  map entries) on the `llm-foundation` client. **Not an autonomous agent and
  not LangChain.** LangChain stays confined to M6; the `packages/ai` client
  is the only SDK path. No new ADR.
- **Two bounded calls, separated.** The generation call (the seven-part unit)
  and the grading call (answers → score + weak-area breakdown) are distinct
  bounded calls — same separation pattern as M8 — so the question shape is
  fixed before any answer is graded and the grading prompt/schema match the
  M8 understanding-check pattern.
- **Issue fetching extends the M11 GitHub client (ADR 0009).** Issue
  endpoints are added to the shipped `packages/db/src/github` client,
  reusing its authentication, rate-limit handling, and `GITHUB_TOKEN`
  mechanism — mirroring the M8 PR-fetch extension. No second GitHub access
  path; read-only.
- **Single normalized input shape (R1).** GitHub Issues and CCPM task files
  are normalized into one learning-unit input shape; the unit and its UI
  do not differentiate by source. `source: 'github-issue' | 'ccpm-task'` is
  metadata only.
- **Reuse the SQLite database (ADR 0006); one table, JSON columns (R2).**
  Add a single `learning_units` table via a Drizzle migration, keyed by
  repo + issue/task identifier. **User answers, the per-attempt score,
  weak-area breakdown, and review-checklist state all live as JSON columns
  on `learning_units`** — no companion tables — mirroring `project_maps`
  (M6) and `diff_reviews` (M8).
- **Minimal challenge stub only (R3).** The unit ships only
  `challenge_concept` and `challenge_type` stub fields; M9 will add its full
  challenge schema in its own migration. M7 pre-allocates nothing for M9.
- **No checklist gating (R4).** The review checklist surfaces progress only;
  it does **not** gate the understanding-question score —
  product.md's "comprehension over completion" wins over checkbox-theater
  enforcement.
- **Per-repo issues list as the entry point (R5).** The user reaches a
  learning unit via imported-repo page → "Issues" tab → issue row →
  learning-unit page. **No global cross-repo issues index in M7**; a global
  index, if ever needed, is a follow-up.
- **Strictly per-unit scoring (R6).** Scores and weak-area breakdowns live
  on the unit; M7 ships no aggregate "comprehension score for this repo"
  view — M10 owns any cross-unit rollup.
- **UI via Claude Design (ADR 0007).** Every new page in M7 — the Issue
  Learning Workspace page, the Review Checklist UI, the Understanding
  Questions UI, the Challenge Panel, and the per-repo Issues list — goes
  through the Claude Design round-trip: Page Spec under `docs/design/` →
  prompt under `docs/design/ui-prompts/` → Claude Design draft →
  Claude Code integration with notes under `docs/design/ui-integration-notes/`.
  Claude Design is the only UI-generation tool used in M7, per ADR 0007.
- **Worktree per epic (ADR 0008).** M7 runs on the
  `epic/issue-based-learning-workspace` branch off `main`; independent
  non-conflicting tasks within the epic may run as parallel sub-agents.

## Technical Approach

### Frontend Components

All five pages follow the Claude Design round-trip (ADR 0007): Page Spec
under `docs/design/` → prompt under `docs/design/ui-prompts/` → Claude Design
draft → Claude Code integration notes under `docs/design/ui-integration-notes/`.

- **Issue Learning Workspace page** —
  route `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx`.
  Reads a `learning_units` row plus the related M6 `project_maps` entry and
  the M11 snapshot data-access layer for the related-files list. The page
  composes the Review Checklist UI, the Understanding Questions UI, and the
  Challenge Panel.
  Page Spec: `docs/design/issue-learning-workspace.page-spec.md`.
- **Review Checklist UI** — checklist component reading
  `learning_units.review_checklist` and writing user state to the JSON
  `checklist_state` column. Shows completion as a progress indicator only —
  does not gate the score (R4).
  Page Spec: `docs/design/review-checklist.page-spec.md`.
- **Understanding Questions UI** — answer-entry form reading
  `learning_units.questions` and posting answers to the grading call; renders
  the Score / Weak Area block from `learning_units.score` and
  `learning_units.weak_areas` (same shape as M8's Score / Weak Area UI per
  the M8 pattern source).
  Page Spec: `docs/design/understanding-questions.page-spec.md`.
- **Challenge Panel** — read-only stub renderer reading
  `learning_units.challenge_concept` and `learning_units.challenge_type` and
  showing an explicit "deferred to M9" message. Does not run, grade, or
  claim to resolve a challenge (FR-7, R3).
  Page Spec: `docs/design/challenge-panel.page-spec.md`.
- **Per-repo Issues list page** —
  route `apps/web/app/repos/[owner]/[repo]/issues/page.tsx` (FR-11, R5).
  Reads the GitHub-issue list via the extended M11 GitHub client and shows
  per-row "learning unit: not started / in progress / scored" derived from
  `learning_units`.
  Page Spec: `docs/design/per-repo-issues-list.page-spec.md`.

### Backend Services

- **Issue fetching extension to the M11 GitHub client (ADR 0009).** Issue
  endpoints added to `packages/db/src/github` (or wherever M11/M8 placed
  the client) — number, title, body, labels, state, linked PRs — plus a
  typed `IssueRef` model and a CCPM-task local adapter that normalizes the
  two inputs into one shape (FR-1, R1). Mocked-response tests; no live
  GitHub calls in CI.
- **Generation call.** Bounded Anthropic SDK call on the `llm-foundation`
  client, producing the seven-part learning unit as a typed structured
  output. **Tool use** reads specific snapshot files via the M11
  data-access layer and reads M6 `project_maps` entries where present —
  bounded reads, not whole-snapshot stuffing (NFR "Bounded token use").
  Degrades gracefully when an issue has no body, when referenced files are
  missing from the snapshot, or when no M6 map exists — emits explicit
  "none found" / "project map unavailable" sections rather than failing.
  Tested with mocked/recorded SDK responses (FR-3, NFR Reproducible).
- **Grading call.** Bounded Anthropic SDK call shaped exactly like M8's
  grading call — answers → score + weak-area breakdown — so the two
  surfaces feel like one product (FR-5, NFR Fair grading). Score and weak
  areas persist to `learning_units` as JSON columns; M7 ships strictly
  per-unit scoring (R6). Mocked-response tests.
- **`learning_units` data-access layer.** Typed module under
  `packages/db/src/learning-units/` to create/read/update units, the user's
  answers, the score, the weak-area breakdown, and the checklist state —
  all on the single `learning_units` row (R2, FR-9). Includes the
  **file-reference integrity check (FR-4):** every related-files path
  resolves to a real path in the M11 snapshot, every concept ties to a
  related file or an M6 project-map node, and every checklist item is
  concrete to this issue — unresolved references **fail the unit** rather
  than silently rendering broken links.

### Infrastructure

- **One Drizzle migration** on the existing SQLite database (ADR 0006)
  adding the single `learning_units` table — repo identifier, issue/task
  identifier, source enum, the seven generated fields, plus JSON columns
  for `user_answers`, `score`, `weak_areas`, and `checklist_state` (R2),
  plus minimal `challenge_concept` and `challenge_type` stub columns (R3).
  No companion tables, no new database.
- **Test strategy parity with `llm-foundation`** — mocked/recorded SDK
  responses for both bounded calls; mocked GitHub-client responses for
  issue fetching. CI runs with no `ANTHROPIC_API_KEY` and no
  `GITHUB_TOKEN` and no live network access (NFR Reproducible).

## Implementation Strategy

Wave 1 (parallel): the schema migration (task 1), the issue-fetch extension
to the M11 GitHub client (task 2), and the five Page Specs + Claude Design
prompts (tasks 6, 7) all start immediately — they share no files. Wave 2:
the data-access layer + integrity check (task 5) lands once the schema is
in (blocked by task 1), and the generation call (task 3) lands once the
issue-fetch shape is in (blocked by task 2) — both Wave 2 tasks run in
parallel. Wave 3: the grading call (task 4) follows the generation call.
Wave 4: a single integration task (task 8) wires `apps/web` routes to the
generation call, the grading call, the data-access layer, and the
issue-fetch client. Mirrors the Wave 1..Wave 4 shape used by M6 / M8 and
ADR 0008.

## Task Breakdown Preview

1. **`learning_units` schema + Drizzle migration** (incl. JSON columns for
   user_answers / score / weak_areas / checklist_state, plus minimal
   `challenge_concept` / `challenge_type` stub fields). No in-epic
   dependencies; **[parallel]**.
2. **Issue fetching in the M11 GitHub client + CCPM-task local adapter +
   normalized input shape + tests** (mirrors the M8 PR-fetch extension; R1
   normalization). No in-epic dependencies; **[parallel]**.
3. **Generation call via Anthropic SDK + tool use + integrity check +
   mocked tests** — produces the seven-part learning unit grounded in
   snapshot files and M6 map; rejects unresolved file refs (FR-4).
   **[sequential — blocked by task 2]**.
4. **Understanding-check grading call + mocked tests** — M8-shape scoring;
   answers → score + weak-area breakdown, persisted as JSON columns.
   **[sequential — blocked by task 3]**.
5. **`learning_units` data-access layer + file-reference integrity check**
   — create/read/update units, answers, score, checklist state on the
   single row. **[sequential — blocked by task 1]**.
6. **Issue Learning Workspace + Review Checklist + Understanding Questions
   + Challenge Panel Page Specs + Claude Design prompts** — four UI pieces
   from FR-10, each ending at "Page Spec written + Claude Design prompt
   drafted". No in-epic dependencies; **[parallel]**.
7. **Per-repo Issues list Page Spec + Claude Design prompt** (FR-11, R5
   entry point) — ends at "Page Spec written + Claude Design prompt
   drafted". No in-epic dependencies; **[parallel]**.
8. **Integrate the M7 UI into `apps/web`** — wire all five pages to the
   generation call, the grading call, the data-access layer, and the
   issue-fetch client; persist user answers, scores, and checklist state.
   **[sequential — blocked by tasks 3, 4, 5, 6, 7]**.

## Dependencies

- **M11 `github-integration`** (shipped) — the GitHub client, repo
  identity, snapshot data-access layer, and ADR 0009 access path; extended
  here with **issue fetching**, mirroring how M8 extended it with PR
  fetching.
- **M6 `project-logic-mapper`** (shipped) — `project_maps` is read for
  related-file role annotations and concept grounding; M7 does not
  re-derive the map. When no M6 map exists for the snapshot, the unit
  degrades gracefully ("project map unavailable").
- **`llm-foundation`** (shipped) — the shared Anthropic SDK client and
  the mocked/recorded test strategy used by both bounded calls.
- **M8 `diff-review`** (shipped) — pattern source for the
  understanding-check grading and Score / Weak Area UI; M7 reuses the
  shape but is its own bounded call.
- Governed by **ADR 0005** (LLM mechanism), **ADR 0006** (storage),
  **ADR 0007** (UI tool), **ADR 0008** (parallel execution model), and
  **ADR 0009** (GitHub access).
- **Cross-epic / cross-package coordination:** `packages/db/src/schema.ts`
  and the Drizzle migrations sequence; `packages/db/src/github` (extended,
  not replaced); `apps/web` routing under `app/repos/[owner]/[repo]/`
  (additive). No conflicts expected with M6 / M8 (both shipped).
- **Human approval of this epic** before any task starts (CLAUDE.md hard
  rule: human review is the final approval authority).

## Success Criteria (Technical)

- Drizzle migration `learning_units` exists, applies cleanly to the existing
  SQLite database, and stores user answers / score / weak-area breakdown /
  checklist state as JSON columns on a single row (R2).
- Given a sample GitHub Issue (or CCPM task) on an imported repo, the
  generation call produces a typed seven-part learning unit grounded in real
  snapshot paths and, where present, M6 project-map nodes.
- The integrity check rejects unresolved file references in tests (FR-4) —
  unit fails rather than silently rendering broken links.
- The grading call scores the user's answers into a per-unit score and
  weak-area breakdown that match the M8 grading shape; scoring is strictly
  per-unit (R6).
- Issue fetching is added to the existing M11 GitHub client (one access
  path, ADR 0009), the CCPM-task adapter normalizes to the same input
  shape (R1), and the PR-fetching shipped in M8 is left intact.
- The five UI pieces (Issue Learning Workspace page, Review Checklist UI,
  Understanding Questions UI, Challenge Panel stub, per-repo Issues list)
  are integrated into `apps/web` via Claude Design — Page Specs under
  `docs/design/`, prompts under `docs/design/ui-prompts/`, integration
  notes under `docs/design/ui-integration-notes/` (ADR 0007).
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` pass with
  **no `ANTHROPIC_API_KEY` set and no live GitHub calls** in CI.

## Estimated Effort

Medium — 8 tasks; 4 waves.

- **Wave 1 (parallel, 3 tasks):** schema migration (1), issue-fetch
  extension + normalized input shape + tests (2), four-piece Page-Spec
  hand-off gate (6), per-repo Issues list Page-Spec hand-off gate (7).
- **Wave 2 (sequential pairs):** generation call (3, blocked by 2),
  data-access layer + integrity check (5, blocked by 1).
- **Wave 3 (sequential):** grading call (4, blocked by 3).
- **Wave 4 (sequential):** `apps/web` integration (8, blocked by 3, 4, 5,
  6, 7).

Critical path: task 2 (issue fetch) → task 3 (generation call) →
task 4 (grading call) → task 8 (integration). Runs as a single worktree
epic; expected calendar shape comparable to M8's seven-task epic (the
LangChain install on M6's critical path has no analogue here since both
bounded SDK calls reuse the shipped `llm-foundation` client).

## Tasks Created
- [ ] 131.md - learning_units schema + Drizzle migration (parallel: true)
- [ ] 132.md - Issue fetching + CCPM-task adapter + normalized input (parallel: true)
- [ ] 133.md - Generation SDK call + integrity check + mocked tests (parallel: false)
- [ ] 134.md - Understanding-check grading call + mocked tests (parallel: false)
- [ ] 135.md - learning_units data-access layer + integrity check (parallel: false)
- [ ] 136.md - Four-UI Page Specs + Claude Design prompts (parallel: true)
- [ ] 137.md - Per-repo Issues list Page Spec + prompt (parallel: true)
- [ ] 138.md - Integrate M7 UI into apps/web (parallel: false)

Total tasks: 8
Parallel tasks: 4
Sequential tasks: 4
Estimated total effort: 87 hours
