---
name: diff-review
status: completed
created: 2026-05-22T14:03:40Z
updated: 2026-05-22T19:37:21Z
progress: 100%
prd: .claude/prds/diff-review.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/109
---

# Epic: diff-review

## Overview

Milestone 8. Build the Diff Review and Understanding Check: given a pull
request on the user's imported repository, M8 fetches the PR through the M11
GitHub client, a bounded Anthropic SDK call (per ADR 0005) on the
`llm-foundation` client produces a changed-file explanation, core-logic
explanation, risk analysis, test suggestions, and comprehension questions; the
user answers the questions and a bounded grading call scores them into a score
and weak-area breakdown. Reviews, answers, and scores persist to the existing
SQLite database, and four UIs are produced through the Claude Design
round-trip.

## Architecture Decisions

- **LLM mechanism fixed by ADR 0005** — a bounded Anthropic SDK call (prompt →
  structured output, with tool use to read PR files). Not an autonomous agent,
  not LangChain (LangChain is confined to M6). No new ADR.
- **PR fetching extends the M11 GitHub client.** PR endpoints are added to the
  shipped `packages/db/src/github` client, reusing its authentication and
  access path (ADR 0009) — no second GitHub access path.
- **Two bounded calls, separated.** The review call (explanations, risks, tests,
  questions) and the grading call (answers → score + weak areas) are distinct
  bounded calls, so grading is reproducible and the question shape is fixed
  before any answer is graded.
- **Reuse the SQLite database (ADR 0006)** — add a `diff_reviews` table (with
  the user's answers and score) via a Drizzle migration, keyed by repo and PR
  number. No new database.
- **Reuse the `llm-foundation` client** — no second SDK path.
- **UI via Claude Design (ADR 0007)** — page spec → `ui-prompts/` prompt →
  Claude Design → integration.

## Technical Approach

### Frontend Components

- **Diff Review page** — the full per-PR review.
- **Risk Analysis Panel** — the risk analysis tied to changed files/hunks.
- **Understanding Check UI** — the comprehension questions and answer entry.
- **Score / Weak Area UI** — the graded score and weak-area breakdown.

All follow the Claude Design round-trip: Page Spec under `docs/design/` → prompt
under `docs/design/ui-prompts/` → Claude Design draft → Claude Code integration.

### Backend Services

- PR fetching added to the M11 GitHub client, plus a typed change model
  (changed files, hunks, additions/deletions, linked issue acceptance
  criteria); with mocked-response tests.
- `diff_reviews` schema + Drizzle migration, incl. answers and score columns.
- Review call — a bounded Anthropic SDK call on the `llm-foundation` client,
  with tool use to read PR files, producing the structured review; tested with
  mocked SDK responses.
- Grading call — a bounded Anthropic SDK call scoring the user's answers into a
  score and a weak-area breakdown; tested with mocked SDK responses.
- diff-reviews data-access layer — create/read/update reviews and store
  answers/scores, plus a file-reference integrity check against the PR's
  changed-file set.

### Infrastructure

- One Drizzle migration on the existing SQLite database. No new infrastructure.

## Implementation Strategy

The schema, the GitHub PR-fetch work, and the page specs can all start
immediately and independently. The review call follows the PR-fetch/change
model. The grading call follows the review call (it depends on the question
shape). The data-access layer follows the schema. UI integration is last,
wiring the four pages to the review call, the grading call, and the
data-access layer.

## Task Breakdown Preview

1. **`diff_reviews` schema + Drizzle migration** (incl. answers + score
   columns). No dependencies; parallel from the start.
2. **PR fetching in the M11 GitHub client + change model + tests** — PR
   endpoints, typed change model (files, hunks, linked issue). No in-epic
   dependencies; parallel from the start.
3. **Diff review call via Anthropic SDK + mocked tests** — changed-file +
   core-logic explanation, risk analysis, test suggestions, comprehension
   questions. Depends on 2.
4. **Understanding-check grading call + mocked tests** — scores answers into a
   score + weak-area breakdown. Depends on 3.
5. **diff-reviews data-access layer + file-reference integrity check** — reviews
   plus answers/scores. Depends on 1.
6. **Diff Review page specs + Claude Design prompts** (UI hand-off gate) — four
   pieces. No dependencies; parallel from the start.
7. **Integrate the Diff Review UI** (four pieces). Depends on 3, 4, 5, 6.

Parallelization: tasks 1, 2, and 6 start immediately; task 3 follows task 2;
task 4 follows task 3; task 5 follows task 1; task 7 is last.

## Dependencies

- **M11 `github-integration`** — the GitHub client, repository identity, and
  ADR 0009 access path; extended here with PR fetching (shipped).
- **`llm-foundation`** — the shared Anthropic SDK client for the review and
  grading calls (shipped).
- Governed by **ADR 0005** (LLM mechanism), **ADR 0006** (storage), **ADR 0007**
  (UI tool), **ADR 0009** (GitHub access).
- **Cross-epic coordination:** shares `packages/db/src/schema.ts` and the
  migrations sequence with the parallel `project-logic-mapper` epic — each adds
  distinct tables; migration numbers resolved at merge time. Both touch
  `apps/web` routing additively.

## Success Criteria (Technical)

- Given a sample PR on an imported repo, M8 produces all six outputs grounded
  in the real diff.
- The user can answer the comprehension questions and receive a score and a
  weak-area breakdown.
- `diff_reviews` table (with answers and score), migration, data-access layer,
  and integrity check land with tests.
- The four UI pieces integrated into `apps/web` and wired to the reviewer.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` pass with no API key.

## Estimated Effort

Medium — 7 tasks. Critical path: task 2 (PR fetch) → task 3 (review call) →
task 4 (grading call) → task 7 (integration). Runs as a parallel worktree epic
alongside `project-logic-mapper`.

## Tasks Created
- [ ] #110 - diff_reviews schema + Drizzle migration (parallel: true)
- [ ] #111 - PR fetching in the M11 GitHub client + change model + tests (parallel: true)
- [ ] #112 - Diff review call via Anthropic SDK + mocked tests (parallel: true)
- [ ] #113 - Understanding-check grading call + mocked tests (parallel: true)
- [ ] #114 - diff-reviews data-access layer + file-reference integrity check (parallel: true)
- [ ] #115 - Diff Review page specs + Claude Design prompts (parallel: true)
- [ ] #116 - Integrate the Diff Review UI (parallel: false)

Total tasks: 7
Parallel tasks: 6 (deps gate start order: 003 after 002; 004 after 003; 005 after 001)
Sequential tasks: 1 (007 last)
Estimated total effort: 78 hours
