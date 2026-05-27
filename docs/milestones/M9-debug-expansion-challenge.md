# M9 — Debug and Expansion Challenge System

**State:** ✅ Complete — epic #139 done; all tasks #140–#148 merged to
`main` via PR #169 · **Date:** 2026-05-27

Goal: given an imported repository with an existing M6 project map and an
M11 snapshot, produce and grade project-tied debug / expansion challenges
strictly scoped to files the M6 map names. Two bounded Anthropic SDK calls
do the work: a generation call emits a typed challenge (type, plain-language
task, in/out-of-scope file sets, acceptance criteria, source references)
that is lazy per challenge type and cached per snapshot; a grading call
scores the user's **explanation only** (snippet content is illustrative) into
a 0–100 score plus weak-area breakdown that matches M8's grading shape. A
file-reference integrity check rejects any output that names a file outside
the M6 map. Four UIs — Challenge List, Challenge Detail (with prior attempts
inline collapsibly), Debug Walkthrough, Completion Review — are produced
through the Claude Design round-trip.

## Scope decisions

- **LLM mechanism (ADR 0005):** two **bounded Anthropic SDK calls**
  (generation + grading) on the shipped `llm-foundation` (`@workspace/ai`)
  client. Each is prompt → structured output with tool use to read specific
  snapshot files. Not LangChain (M6 only), not an autonomous agent.
- **Lazy generation, cached per snapshot (R2).** A challenge type is
  generated on first open of that category and cached in `challenges`
  (unique key: `snapshot_id` + `type`). Subsequent opens read from the
  cache; the "new challenge" action overwrites the same row.
- **Two separate calls.** Generation (what the challenge is) and grading
  (how the user did) stay distinct so the challenge shape is fixed before
  any answer is graded, and grading is reproducible against mocked /
  recorded SDK responses. Same separation pattern as M8 and M7.
- **Grading shape shared with M8 (R4).** The 0–100 score, pass threshold,
  and `WeakArea` schema are reused from M8 so the product has one
  comprehension-grading pattern across M8, M7, and M9.
- **Grade explanation only (R3).** The grader does not score snippet
  content for style/naming/plausibility — only the user's free-text
  explanation against the acceptance criteria.
- **Strict project-map grounding (R3 + R8 + FR-6).** Generation and
  grading may only name files the M6 project map explicitly lists. An
  integrity-check module — used by both pipelines — rejects any in-scope,
  out-of-scope, or grading-point reference outside that set.
- **Storage (ADR 0006):** two new tables on the existing SQLite store.
  `challenges` keyed by `(snapshot_id, type)` unique for the lazy-per-type
  cache; `challenge_attempts` keyed by `challenge_id` for multiple
  submissions per challenge (US-6). Structured / list-valued fields are
  JSON text columns (in/out-of-scope sets, acceptance criteria, snippets,
  file paths, grading result).
- **GitHub access via M11 only (ADR 0009).** No new GitHub access path.
  The "explain a broken CI result" challenge type is gated on a real
  failing CI run being available in the snapshot (R6); until M11 surfaces
  those, the type is expected to be absent (skipped, not synthesized).
- **UI via Claude Design (ADR 0007):** four page specs + prompts written
  before any generation. The Challenge Detail Page renders the most-recent
  attempt as primary and prior attempts inline collapsibly (R5). v0 is
  not used.

## Execution backlog

| Issue | Task | Closing PR |
|---|---|---|
| #140 | `challenges` + `challenge_attempts` schema + DAL | #160 |
| #141 | File-reference integrity check module + tests | #159 |
| #142 | Generation SDK call (lazy-per-type, cached) + mocked tests | #163 |
| #143 | Grading SDK call (0–100, M8-shape, explanation-only) + mocked tests | #165 |
| #144 | Challenge List Page Spec + Claude Design prompt | #157 |
| #145 | Challenge Detail Page Spec (inline prior attempts) + prompt | #156 |
| #146 | Debug Walkthrough UI Page Spec + Claude Design prompt | #161 |
| #147 | Completion Review UI Page Spec + Claude Design prompt | #158 |
| #148 | Wave 4 — integrate M9 UI into `apps/web` | #168 |

All nine tasks were executed in parallel waves in the
`epic/debug-expansion-challenge` worktree and landed via **PR #169** for
human review + CI.

## Delivered

- `packages/db` — `challenges` + `challenge_attempts` tables + migration
  `0008_wealthy_starbolt.sql` (regenerated from `0007` at epic-merge time —
  see retrospective); the `src/challenges/` backend:
  - **`generate.ts`** — `generateChallenge`, the lazy-per-type bounded
    Anthropic SDK call: tool set for reading snapshot files + M6 map
    entries + a forced `submit_challenge` final tool; cache lookup against
    `(snapshot_id, type)` before any SDK call; "new challenge" path
    overwrites; broken-CI type guarded on a real failing CI signal (R6).
  - **`grade.ts`** — `gradeAttempt`, the bounded single-turn grading call:
    forced `submit_grading`, takes the user's explanation + acceptance
    criteria, emits the M8-shape `{ score, weakAreas, perCriterion,
    feedback }`. Integrity-checked.
  - **`integrity-check.ts`** — the shared file-reference integrity check
    used by both generation and grading. Rejects any reference outside
    the M6 project-map file set.
  - **`attempts.ts`** — the data-access layer: create/read challenges
    (with cache lookup), create/read attempts, retrieve a challenge's
    latest outcome server-side.
- `apps/web` — routes `/repos/[owner]/[repo]/challenges` (list) and
  `/repos/[owner]/[repo]/challenges/[challengeId]` (detail + walkthrough +
  completion review); the four UI pieces wired into the full open →
  generate-or-fetch-cached → submit → grade → review loop in Server
  Actions. LLM calls run server-side only.
- All calls tested on the `@workspace/ai` mock transport — no API key, no
  live calls in CI.

## Acceptance Criteria (epic)

- [x] Given a sample imported repo with a M6 project map and M11 snapshot,
      the generation call produces **at least one challenge per applicable
      type** (R1), each tied to a real M6-mapped file path, with the
      broken-CI type skipped unless a real failing CI run is available
      (R6).
- [x] A user can submit an explanation (plus optional snippets) in the
      Debug Walkthrough UI and receive a **0–100 score plus M8-shape
      weak-area breakdown** (R3 + R4) in the Completion Review UI — every
      file/module reference resolves to a real snapshot path.
- [x] The integrity check rejects challenges and grading outputs that
      reference any file outside the M6 project map (R8 + FR-6); covered
      by tests on both generation and grading paths.
- [x] `challenges` + `challenge_attempts` (with JSON columns), the
      Drizzle migration, and the typed data-access layer
      (create/read/latest-outcome) land with tests.
- [x] The four UI pieces — including prior attempts inline collapsibly
      (R5) — are integrated into `apps/web` via Claude Design.
- [x] Generation is lazy per type and cached per snapshot (R2); "new
      challenge" re-invokes generation for the same type.
- [x] Verified green (lint/typecheck/build/test) with no API key set; no
      live API or GitHub calls in CI.
- [x] M9 ships per-attempt persistence and stops; the M10 surface
      (cross-attempt / cross-repo rollups) is not pre-allocated (R7).

## Retrospective

**What went well**

- Re-using M8's grading shape was the biggest force-multiplier of the
  milestone. `WeakArea`, the pass threshold, the per-criterion result
  block, and the `grade.ts` call structure all carried over — meaning M8,
  M7, and M9 ship one comprehension-grading pattern across three
  surfaces, not three.
- The lazy-per-type-cached-per-snapshot architecture mapped cleanly to a
  single unique constraint `(snapshot_id, type)` on `challenges`. No
  cache-invalidation logic; the "new challenge" action is just an upsert.
- All nine tasks ran the planned 4-wave shape on
  `epic/debug-expansion-challenge`; per-task PRs (`#156` → `#168`) merged
  into the epic branch via in-epic PRs before the single epic PR `#169`
  to `main`.

**What to watch — lessons**

- **Cross-epic migration collision — a fourth time, and the worst one
  yet.** M7 and M9 ran in parallel worktrees, and *both* reserved
  migration slot `0007`: M7's `0007_low_quasimodo.sql` (`learning_units`)
  landed on `main` first; M9's `0007_slippery_warbird.sql`
  (`challenges` + `challenge_attempts`) had to be regenerated at the
  epic-PR merge boundary. Resolution (commit `e821b0a`): merge
  `origin/main` into `epic/debug-expansion-challenge`, interleave both new
  table blocks in `packages/db/src/schema.ts` by hand, accept main's
  `0007` snapshot + journal, delete M9's `0007_slippery_warbird.sql`, and
  run `drizzle-kit generate` against the merged schema — drizzle emitted
  the M9 tables as `0008_wealthy_starbolt.sql` with a correct snapshot
  chain. Build + 669 tests passed; CI confirmed it on the merge commit.
  **M8 called this lesson "now overdue for action" after the third
  collision (M6+M8). It is now genuinely urgent — see follow-ups.**
- **Stub columns left in `learning_units`.** M7 pre-allocated
  `challenge_concept` / `challenge_type` stub columns on `learning_units`
  pointing at M9; now that M9's full schema is in `challenges`, the M7
  stubs are dead weight. Leave them for one cycle (M10 may have data
  cleanup work that bundles this) rather than tacking on a one-off
  migration.

**Follow-ups**

- **Schema-collision discipline (overdue from M8).** Pick one and ship it
  before the next parallel-schema epic:
  1. Serialize the schema-adding task across parallel epics — only one
     epic touches `packages/db/src/schema.ts` + Drizzle migrations at a
     time; other epics rebase once the schema lands on `main`.
  2. Or formalize the merge-time chore: a documented "regenerate as
     `N+1` via `drizzle-kit generate` against `main`'s latest snapshot"
     checklist baked into the epic-merge playbook.
- **Drop the dead M7 stub columns on `learning_units`** in a future
  data-cleanup pass.
- **`listPullRequests` / `listChallenges`-style picker work** still
  unscoped — same shape as M8's "PR selection is a number-entry form"
  follow-up. The Challenge List page reads M9's own DAL so this isn't
  blocking M9, but the global Issues / PRs picker remains a recurring
  miss.
- M10 is now the next milestone per `updated_ai_native_milestone_plan.md`.
