# M8 — Diff Review and Understanding Check

**State:** ✅ Complete — epic #109 done & archived; all tasks #110–#116 merged to
`main` via PR #118 · **Date:** 2026-05-22

Goal: take an AI-generated change — a pull request on the user's imported
repository — and help a job-seeking junior dev understand what changed, then
*prove* they understand it. M8 produces a per-changed-file explanation, a
core-logic explanation, a risk analysis, test suggestions, and comprehension
questions targeted at the actual diff; the user answers those questions and M8
grades them into a score and a weak-area breakdown.

## Scope decisions

- **LLM mechanism (ADR 0005):** two **bounded Anthropic SDK calls** — prompt →
  structured output, tool use to read PR files — on the `llm-foundation`
  (`@workspace/ai`) client. Not autonomous agents, and not LangChain (LangChain
  is confined to M6).
- **Two separate calls.** The review call and the grading call are distinct so
  grading is reproducible: the comprehension-question set is fixed at review
  time, before any answer is graded.
- **Storage (ADR 0006):** one new `diff_reviews` table joins the existing SQLite
  store — keyed by snapshot + PR number, list-valued fields as JSON columns. The
  `answers`, `score`, and `weakAreas` columns are nullable: a review is
  generated first, then graded once the user completes the understanding check.
- **PR fetching reuses the M11 GitHub client** — the change model is built from
  the PR's diff; downstream calls never hit the network in CI.
- **Package layout:** all M8 backend code lives in `packages/db/src/diff/`,
  beside the M11 GitHub client it reuses.
- **UI via Claude Design (ADR 0007):** four page specs + prompts written before
  any generation — Diff Review page, Risk Analysis Panel, Understanding Check
  UI, Score / Weak Area UI.

## Execution backlog

| Issue | Task | Status |
|---|---|---|
| #110 | `diff_reviews` schema + Drizzle migration | ✅ Done — `6ecd7aa` |
| #111 | PR fetching in the M11 GitHub client + change model + tests | ✅ Done — `e867636` |
| #112 | Diff review call via Anthropic SDK + mocked tests | ✅ Done — `67fde32` |
| #113 | Understanding-check grading call + mocked tests | ✅ Done — `1499f60` |
| #114 | diff-reviews data-access layer + integrity check | ✅ Done — `394d61a` |
| #115 | Diff Review page specs + Claude Design prompts | ✅ Done |
| #116 | Integrate the Diff Review UI | ✅ Done — `f2d2fea` |

All seven tasks were executed in parallel waves in the `epic/diff-review`
worktree and landed via **PR #118** for human review + CI.

## Delivered

- `packages/db` — `diff_reviews` table + migration `0006_public_selene`
  (regenerated from `0005` on epic merge — see retrospective); the `src/diff/`
  backend:
  - **`review.ts`** — `reviewDiff`, the bounded Anthropic SDK call: a fixed
    two-tool set (`read_pr_file` + forced `submit_diff_review`), a hard 6-turn
    cap with forced submission on the final turn. Consumes the
    `PullRequestChangeModel` from #111; produces typed `DiffReviewContent`.
  - **`grade.ts`** — `gradeUnderstandingCheck`, a separate single-turn bounded
    call (forced `submit_grading`, no tool loop): takes the fixed question set +
    the user's answers, returns a typed score and weak-area breakdown. Handles
    partial/empty answers gracefully.
  - **`reviews.ts`** — the typed data-access layer (create / read / update /
    `saveDiffReview`, `gradeDiffReview` for answer/score storage) and the FR-4
    file-reference integrity check.
- `apps/web` — routes `/reviews`, `/reviews/[owner]/[repo]`, and
  `/reviews/r/[id]`; the four UI pieces wired into the full select-PR → review →
  answer → grade loop. LLM/GitHub calls run only server-side in Server Actions.
- All calls tested on the `@workspace/ai` mock transport — no API key, no live
  calls in CI.

## Acceptance Criteria (milestone plan)

- [x] A bounded SDK call produces the structured review — changed-file and
      core-logic explanations, risk analysis, test suggestions, comprehension
      questions — every reference tied to the actual diff.
- [x] A separate bounded call grades the user's answers into a reproducible
      score + weak-area breakdown; partial/empty answers handled gracefully.
- [x] Reviews, answers, and scores persist via the data-access layer and read
      back; file references pass the integrity check.
- [x] The four UIs are integrated into `apps/web` and routed; the full
      answer-and-score loop works.
- [x] Verified green (lint/typecheck/build/test) with no API key set.

## Retrospective

**What went well**

- Splitting review and grading into two bounded calls kept grading reproducible
  — the question set is frozen before any answer is seen — and gave #113 a clean
  typed input contract (`ComprehensionQuestion[]`) from #112.
- The nullable answer/score columns mean a generated-but-ungraded review is a
  valid persisted state; a returning user with a graded review lands straight in
  the read-only graded view, no special-casing.
- Both calls reused the M5 `explainStack` bounded-call pattern and the
  `@workspace/ai` mock transport, so the test strategy needed no new invention —
  CI makes zero live API calls.

**What to watch — lessons**

- **Cross-epic migration collision — a third time.** M6 and M8 both added a
  Drizzle `0005` migration in parallel worktrees. M8 merged second, so on merge
  its migration was regenerated as `0006_public_selene` via `drizzle-kit
  generate` against the now-`project_maps`-inclusive `0005` snapshot, keeping
  the snapshot chain consistent. The `schema.ts` merge also interleaved both new
  table blocks and had to be rebuilt by hand. **Lesson, now overdue for action:**
  parallel epics that both touch `packages/db` schema/migrations should
  serialize the schema-adding task, or the migration step should be a documented
  merge-time chore with a checklist.
- **Spec-vs-schema drift.** The page specs' `DiffRisk` / `WeakArea` /
  `ComprehensionQuestion` shapes carried fields (severity, category, focusArea)
  the merged schema does not. #116 followed the "merged code is authoritative"
  rule and rendered the real shapes — the right call, but the specs and shipped
  types now disagree.
- **Routing constraint surfaced late.** The review-by-id route had to become
  `/reviews/r/[id]` rather than the spec's `/reviews/[id]` — Next.js forbids
  sibling `[id]`/`[owner]` dynamic segments. A small App-Router fact worth
  knowing before writing route-shaped page specs.

**Follow-ups**

- PR selection is a number-entry form: the M11 GitHub client has no
  `listPullRequests`, so the user types a PR number rather than picking from a
  list. A `listPullRequests` addition would let the UI offer a real picker.
- App-wide nav remains per-feature `chrome.tsx` files; the `/reviews` link was
  added to this feature's nav only — the unifying nav pass is still unscoped.
- M7 remains next per the milestone plan.
