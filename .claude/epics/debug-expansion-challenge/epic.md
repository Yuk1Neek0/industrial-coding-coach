---
name: debug-expansion-challenge
status: backlog
created: 2026-05-24T19:37:17Z
progress: 0%
prd: .claude/prds/debug-expansion-challenge.md
github: (will be set on sync)
---

# Epic: debug-expansion-challenge

## Overview

Milestone 9. Build the Debug and Expansion Challenge System: given an imported
repository with an existing M6 project map and an M11 snapshot, two bounded
Anthropic SDK calls on the shipped `llm-foundation` client (per ADR 0005)
produce and grade project-tied challenges. The generation call (lazy per
challenge type, cached per snapshot in the new `challenges` table) emits a
typed challenge — type, plain-language task description, in/out-of-scope file
sets strictly limited to M6-named files, acceptance criteria — using tool use
to read specific snapshot files. The grading call scores the user's
**explanation only** (snippet content is illustrative, not scored) into a
0–100 numeric score plus a weak-area breakdown that matches M8's grading
shape. A file-reference integrity check rejects any generation or grading
output referencing files outside the M6 project map. Challenges and attempts
persist to the existing SQLite database via a Drizzle migration adding
`challenges` and `challenge_attempts` (JSON columns for structured fields).
Four UI pieces — Challenge List Page, Challenge Detail Page (which renders
prior attempts inline collapsibly), Debug Walkthrough UI, Completion Review
UI — are produced through the Claude Design round-trip (ADR 0007), each
preceded by a Page Spec under `docs/design/`.

## Architecture Decisions

- **LLM mechanism fixed by ADR 0005** — M9 is two bounded Anthropic SDK calls
  (generation + grading) on the shared `llm-foundation` client, each
  prompt → structured output with tool use to read specific snapshot files.
  M9 is **not** LangChain (LangChain remains confined to M6) and **not** an
  autonomous agent. No new ADR.
- **Reuse the SQLite database (ADR 0006)** — add two new tables,
  `challenges` (keyed by snapshot `owner/repo` + ref + challenge type) and
  `challenge_attempts` (keyed by challenge id), via a Drizzle migration.
  Structured / list-valued fields (in-scope set, out-of-scope set,
  acceptance criteria, weak-area breakdown, file paths) are stored as JSON
  columns on those rows. No new database.
- **UI via Claude Design (ADR 0007)** — every new page in M9 goes through
  the Claude Design round-trip: Page Spec under `docs/design/` → prompt
  under `docs/design/ui-prompts/` → Claude Design draft → integration
  notes under `docs/design/ui-integration-notes/`. The Challenge Detail
  Page renders the most-recent attempt as primary and prior attempts
  inline (collapsible) for self-review (R5). v0 is **not** used.
- **Parallel worktree per epic (ADR 0008)** — M9 runs on its own
  `epic/debug-expansion-challenge` branch / worktree; in-epic
  non-conflicting tasks may run as background sub-agents, dependency-chained
  tasks stay sequential.
- **GitHub access via M11 only (ADR 0009)** — M9 reads the M11 snapshot
  through the shipped snapshot data-access layer. **No new GitHub access
  path.** The "explain a broken CI result" challenge type is gated on the
  snapshot exposing a real failing CI run / log; until M11 surfaces those,
  the type is expected to be absent.
- **Two bounded calls, separated.** Generation (what the challenge is) and
  grading (how the user did) are distinct bounded calls. This keeps the
  challenge shape fixed before any answer is graded, keeps grading
  reproducible with mocked / recorded SDK responses, and matches M8's
  two-call separation.
- **Grading shape shared with M8 (R4).** The 0–100 score, the pass
  threshold, and the weak-area schema are reused from M8 so the product
  has one comprehension-grading pattern across M8 and M9.
- **Strict project-map grounding (R3 + R8 + FR-6).** Generation and grading
  may only name files that the M6 project map explicitly lists. An
  integrity check rejects any generated challenge or grading output that
  references a file outside that set. The grader does not score snippet
  content for style / naming / plausibility — only the user's explanation.

## Technical Approach

### Frontend Components

All four pages follow the Claude Design round-trip: Page Spec under
`docs/design/` → prompt under `docs/design/ui-prompts/` → Claude Design
draft → integration notes under `docs/design/ui-integration-notes/`.
v0 is not used.

- **Challenge List Page** — route `apps/web/app/repos/[owner]/[repo]/challenges/page.tsx`.
  Reads challenges for the current snapshot via the M9 data-access layer
  (lazy generation per challenge type per R2, plus the user's latest
  outcome per challenge). Each list entry names target file(s)/module(s)
  from the M6 project map; types that do not apply to the repo are
  omitted. Page Spec: `docs/design/challenge-list-page.md`.
- **Challenge Detail Page** — route
  `apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/page.tsx`.
  Shows the challenge type, plain-language task description, in-scope and
  out-of-scope file/module sets (R8), acceptance criteria, and a "new
  challenge" action to regenerate (R2). **Renders the most-recent
  attempt as primary and prior attempts inline collapsibly** (R5).
  Page Spec: `docs/design/challenge-detail-page.md`.
- **Debug Walkthrough UI** — embedded in the Detail Page (or its own
  sub-route, decided at Page Spec time). Free-text explanation field plus
  optional per-file code snippets keyed to specific paths from the M6 map.
  Submissions persist server-side. Page Spec:
  `docs/design/debug-walkthrough-ui.md`.
- **Completion Review UI** — renders the grading-call output: 0–100 score,
  per-criterion result, weak-area breakdown (M8-shape per R4), short
  feedback paragraph. Every file/module reference resolves to a real
  snapshot path. Page Spec: `docs/design/completion-review-ui.md`.

### Backend Services

- **`challenges` + `challenge_attempts` schema + Drizzle migration.** Added
  to the existing SQLite database (ADR 0006). `challenges` is keyed by
  snapshot (`owner/repo` + ref) and challenge type / id, with JSON columns
  for the in-scope set, out-of-scope set, acceptance criteria, and source
  references into the M6 map. `challenge_attempts` is keyed by challenge
  id, with columns for the user's free-text explanation, optional per-file
  snippets (JSON), file paths the user said they would change (JSON),
  timestamp, and the grading result (score + weak-area breakdown as JSON).
- **Generation call** — a bounded Anthropic SDK call on the shared
  `llm-foundation` client, with tool use to read specific snapshot files.
  **Lazy, per challenge type, on first open of that category** (R2);
  generated challenges are cached per snapshot in `challenges` so
  subsequent opens do not re-call the SDK. The "new challenge" action
  re-invokes generation for the same type. The call produces **at least
  one challenge per applicable type** (R1); types that don't apply (e.g.
  the broken-CI type without a real failing CI run, per R6) are skipped,
  not synthesized. Tested with mocked / recorded SDK responses, matching
  the `llm-foundation` test strategy — no live API calls in CI.
- **Grading call** — a second bounded Anthropic SDK call scoring the
  user's **explanation only** (R3) against the challenge's acceptance
  criteria and the M6 project map. Output structure: **0–100 score plus a
  weak-area breakdown that mirrors M8's grading shape** (R4), per-criterion
  results, and a short feedback paragraph. Pass threshold and weak-area
  schema are shared with M8. Reproducible; tested with mocked / recorded
  SDK responses. Does not execute, build, lint, or test user code.
- **File-reference integrity check** — applied to every generated
  challenge and every grading output. Rejects any in-scope, out-of-scope,
  or grading-point file reference that is not in the M6 project map
  (R8 + FR-6). Same module is used by both the generation pipeline and
  the grading pipeline.
- **Data-access layer** — a typed module to create/read challenges,
  create/read attempts, and retrieve a challenge's latest outcome
  server-side from `apps/web`. Reuses the M6 project-map data-access layer
  and the M11 snapshot data-access layer; no new map-access path, no new
  snapshot-access path, no new GitHub access path (R7 — M10 integration
  is deferred to M10's own PRD).

### Infrastructure

- **One Drizzle migration on the existing SQLite database** adding
  `challenges` and `challenge_attempts`. No new database, no new external
  services, no new dependencies beyond what `llm-foundation` already
  provides. Test-strategy parity with `llm-foundation`: mocked / recorded
  SDK responses, no live API calls in CI, no GitHub calls in CI.

## Implementation Strategy

The schema migration, the page specs, and the integrity check can all start
immediately and independently (Wave 1). The generation call follows the
schema and the integrity check; the grading call follows the generation
call (it depends on the challenge shape and the acceptance-criteria
contract) — these are the critical path (Wave 2 / 3). UI integration is
last, wiring all four pieces into `apps/web` against the generation call,
the grading call, and the data-access layer (Wave 4).

## Task Breakdown Preview

1. **`challenges` + `challenge_attempts` schema + Drizzle migration + data-access layer + tests.** JSON columns for in/out-of-scope sets, acceptance criteria, snippets, file paths, and grading result. Create/read challenges and attempts; retrieve latest outcome. No in-epic dependencies; `[parallel]` from the start.
2. **File-reference integrity check module + tests** — rejects any challenge / grading-output file reference outside the M6 project map (R8 + FR-6). Used by both generation and grading. No in-epic dependencies; `[parallel]` from the start.
3. **Generation SDK call (lazy-per-type, cached) + mocked tests** — bounded Anthropic SDK call on `llm-foundation` with tool use; emits at-least-one challenge per applicable type (R1); "new challenge" action re-invokes; broken-CI type gated on real failing CI run (R6); cached per snapshot per R2. `[sequential — blocked by tasks 1, 2]`.
4. **Grading SDK call (0–100 + weak-area, M8-shape) + mocked tests** — bounded Anthropic SDK call grading the user's **explanation only** (R3); outputs 0–100 score + weak-area breakdown matching M8 (R4); integrity-checked. `[sequential — blocked by task 3]`.
5. **Challenge List Page — Page Spec + Claude Design prompt** under `docs/design/` and `docs/design/ui-prompts/`. `[parallel]` from the start.
6. **Challenge Detail Page — Page Spec + Claude Design prompt** (must specify the inline-collapsible prior-attempts panel per R5). `[parallel]` from the start.
7. **Debug Walkthrough UI — Page Spec + Claude Design prompt** (free-text explanation plus optional per-file snippets keyed to M6-map paths). `[parallel]` from the start.
8. **Completion Review UI — Page Spec + Claude Design prompt** (renders the 0–100 score + weak-area breakdown + per-criterion results + short feedback paragraph). `[parallel]` from the start.
9. **Integrate the M9 UI into `apps/web` and wire to generation, grading, data-access** — all four pieces, end-to-end on a sample repo. `[sequential — blocked by tasks 1, 2, 3, 4, 5, 6, 7, 8]`.

Parallelization: tasks 1, 2, 5, 6, 7, 8 start immediately; task 3 follows
1 + 2; task 4 follows 3; task 9 is last. Total: 9 tasks. (The broken-CI
type's runtime gating is implemented inside task 3, not as a separate
task, because the gating logic is a few lines on top of the type-selection
step.)

## Dependencies

- **M6 `project-logic-mapper`** — the project-map data-access layer and its
  outputs (architecture overview, key-file map, request/data flow,
  state flow, AI-call flow, debug path) are the only allowed source of
  in-scope / out-of-scope files for generation and grading (R8) (shipped).
- **M11 `github-integration`** — the imported-repo snapshot schema,
  key-file selection, and snapshot data-access layer (shipped). No new
  GitHub access path (ADR 0009).
- **`llm-foundation`** — the shared Anthropic SDK client (with prompt
  caching, tool use, structured outputs) for both the generation and
  grading calls (shipped). No new SDK wrapper.
- **M8 `diff-review`** — the grading shape (pass threshold, weak-area
  schema, 0–100 score) is reused so M8 and M9 produce one
  comprehension-grading pattern across the product (shipped).
- **Existing SQLite database (ADR 0006)** — M9 adds tables, not a database.
- Governed by **ADR 0005** (LLM mechanism), **ADR 0006** (storage),
  **ADR 0007** (UI via Claude Design), **ADR 0008** (parallel execution),
  **ADR 0009** (GitHub access).
- **Human review** — approval of this epic is required before any task
  begins (CLAUDE.md hard rule).

## Success Criteria (Technical)

- Given a sample imported repo with an existing M6 project map and an M11
  snapshot, the generation call produces **at least one challenge per
  applicable type**, each tied to a real file/module path from the
  snapshot, with the broken-CI type omitted unless a real failing CI run
  is available (R1 + R6).
- A user can submit an explanation (plus optional snippets) in the Debug
  Walkthrough UI and receive, in the Completion Review UI, a **0–100
  score plus weak-area breakdown matching M8's shape** (R3 + R4) — every
  file/module reference in that grading output resolves to a real
  snapshot path.
- The integrity check rejects challenges and grading outputs that
  reference any file outside the M6 project map (R8 + FR-6); covered by
  unit tests on both the generation and grading paths.
- The `challenges` and `challenge_attempts` tables (with JSON columns),
  the Drizzle migration, and the typed data-access layer (create/read
  challenges, create/read attempts, latest-outcome retrieval) land with
  tests.
- The four UI pieces — Challenge List Page, Challenge Detail Page (prior
  attempts inline collapsible per R5), Debug Walkthrough UI, Completion
  Review UI — are integrated into `apps/web` and wired to the
  generation call, the grading call, and the data-access layer; each is
  preceded by a Page Spec under `docs/design/` and a Claude Design
  prompt under `docs/design/ui-prompts/`. v0 is not used.
- Generation is **lazy per challenge type and cached per snapshot** (R2);
  a "new challenge" action re-invokes generation for the same type.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` all pass with
  **no API key set** (mocked / recorded SDK responses; no live API or
  GitHub calls in CI).
- M9 ships per-attempt persistence and stops; the M10 surface
  (cross-attempt / cross-repo rollups, exportable artifacts) is **not**
  pre-allocated here (R7).

## Estimated Effort

- **Size:** Medium — 9 tasks.
- **Critical path:** task 1 (schema + data-access) and task 2 (integrity
  check) → task 3 (generation call) → task 4 (grading call) → task 9
  (UI integration).
- **Parallelizable:** 6 of 9 tasks start immediately (1, 2, 5, 6, 7, 8);
  3 follows 1 + 2; 4 follows 3; 9 is last.
- **Expected calendar duration:** roughly four waves, consistent with the
  M6 / M8 wave pattern (Wave 1: schema, integrity check, page specs;
  Wave 2: generation call; Wave 3: grading call; Wave 4: integration).
- **Runs as a parallel worktree epic** under ADR 0008 on
  `epic/debug-expansion-challenge`.

## Tasks Created
- [ ] 001.md - challenges + challenge_attempts schema + data-access layer (parallel: true)
- [ ] 002.md - File-reference integrity check + tests (parallel: true)
- [ ] 003.md - Generation SDK call + mocked tests (parallel: false)
- [ ] 004.md - Grading SDK call + mocked tests (parallel: false)
- [ ] 005.md - Challenge List Page Spec + Claude Design prompt (parallel: true)
- [ ] 006.md - Challenge Detail Page Spec + Claude Design prompt (parallel: true)
- [ ] 007.md - Debug Walkthrough UI Page Spec + Claude Design prompt (parallel: true)
- [ ] 008.md - Completion Review UI Page Spec + Claude Design prompt (parallel: true)
- [ ] 009.md - Integrate M9 UI into apps/web (parallel: false)

Total tasks: 9
Parallel tasks: 6
Sequential tasks: 3
Estimated total effort: 85 hours
