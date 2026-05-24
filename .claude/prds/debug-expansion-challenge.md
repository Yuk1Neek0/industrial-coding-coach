---
name: debug-expansion-challenge
description: M9 — bounded Anthropic SDK calls generate project-tied debug/extension challenges from the M6 project map (add a field, trace a failed call, fix a schema mismatch, add a loading/error state, add a unit test, explain a broken CI result, extend one module safely); the user submits an answer, M9 grades it and records whether understanding was demonstrated; challenges and attempts persist to SQLite.
status: backlog
created: 2026-05-24T17:54:31Z
updated: 2026-05-24T19:08:14Z
---

# PRD: debug-expansion-challenge

## Executive Summary

Milestone 9. The Debug and Expansion Challenge System is the user-facing
"show me you understood" loop that closes the comprehension circuit for a
job-seeking junior dev. After M6 has produced a project map of their imported
repository and M8 has graded their understanding of AI-generated PRs against
that repository, M9 turns the spotlight on the user themselves: it issues
concrete, project-specific challenges — *add a small field*, *trace a failed
API call*, *fix a schema mismatch*, *add a loading/error state*, *add a unit
test*, *explain a broken CI result*, *extend one module safely* — and grades
the user's response against the project's actual structure.

Each challenge is generated from, and explicitly tied to, real files and
modules in the user's imported repository — never a generic exercise. The user
does not have to actually run the modified code through M9; they explain, in
the Debug Walkthrough UI, **what files they would change and why**, optionally
with a small code snippet, and M9 grades that explanation against the
challenge's expected scope and the project map.

Per **ADR 0005**, M9 is a set of **bounded Anthropic SDK calls** — generation,
grading, and feedback are prompt → structured-output calls on the shared
`llm-foundation` client, with tool use to read specific files. M9 is not an
autonomous agent and is not LangChain (LangChain remains confined to M6). M9
reads the M6 project map and the M11 imported-repo snapshot to ground
challenges in real structure. Challenges, attempts, and grades persist to the
existing SQLite database. The Challenge List Page, Challenge Detail Page,
Debug Walkthrough UI, and Completion Review UI are produced through the
Claude Design round-trip (ADR 0007), each preceded by a Page Spec under
`docs/design/`.

## Problem Statement

By the end of M8, a junior dev can review an AI-generated change to their
repository and prove they understood *what the AI did*. That still leaves the
career-blocking gap this product exists to close: in an interview, the
follow-up question after "walk me through your project" is "okay, what would
you change if I asked you to add X?" or "where would you start if this
endpoint returned 500?". A user who only ever read code the AI produced has
no honest answer — they cannot say which files they'd touch, which module
owns the behavior, or how to extend it without breaking something else.

Generic coding exercises don't fix this. Bootcamp katas test a stranger's
problem on a stranger's codebase; the user's own project remains the black
box. What's missing is a check tied to *their* repository: small, realistic,
defensible tasks whose correct answers are grounded in the file tree, module
graph, and flows that M6 already mapped — and a grader that can tell whether
the user's explanation actually fits the project, instead of rewarding
plausible but irrelevant prose.

M9 closes that loop. M6 says "here is your project as a system." M8 says
"here is what the AI changed in it, prove you understood the change." M9
says "now here is what *you* would change in it, prove you understand it well
enough to defend modifying it." This is the comprehension step a portfolio
project needs in order to be honestly defensible in an interview.

## User Stories

- **US-1 — As a junior dev**, I open my imported repository and see a list of
  project-tied debug/extension challenges generated from its real structure.
  *Acceptance:* the Challenge List Page shows at least one challenge per
  available challenge type that applies to my repo; each list entry names the
  target file(s)/module(s) from the M6 project map; generic challenges with
  no file reference are not shown.

- **US-2 — As a junior dev**, I open a challenge and see clearly what is
  being asked, where in my repo it lives, and what "done" looks like.
  *Acceptance:* the Challenge Detail Page states the challenge type, a
  plain-language task description that references real files/modules from my
  repo, the expected scope ("touch these files, not those"), and the
  acceptance criteria the grader will use.

- **US-3 — As a junior dev**, I write my answer — a short explanation of
  which files I'd change and why, optionally with a small code snippet — in
  the Debug Walkthrough UI without leaving the web app.
  *Acceptance:* I can submit a free-text explanation plus optional code
  snippets keyed to specific files; my submission is saved server-side and
  is retrievable.

- **US-4 — As a junior dev**, I submit my answer and get a graded review
  that tells me whether I demonstrated understanding, where I got it right,
  and where I got it wrong.
  *Acceptance:* the Completion Review UI shows a pass/fail-style outcome
  plus a weak-area breakdown; each grading point references a real file or
  module from my repo; the grade and feedback are saved.

- **US-5 — As a junior dev**, I get a "trace a failed API call" or "explain
  a broken CI result" challenge whose failing example comes from my project,
  not a stock fixture.
  *Acceptance:* trace challenges reference a real request/data-flow path
  from the M6 project map; broken-CI challenges reference real CI / test
  configuration files in my repo, or are omitted if my repo has none.

- **US-6 — As a junior dev**, I can retry a challenge after seeing the
  feedback, and my history is preserved so I can see I improved.
  *Acceptance:* I can submit a second attempt on the same challenge; both
  attempts and both grades are persisted; my latest outcome is the one
  shown as the challenge's current status.

- **US-7 — As a developer**, generated challenges, user submissions, and
  grades persist and are retrievable.
  *Acceptance:* a `challenges` and `challenge_attempts` schema (added via
  Drizzle migration to the existing SQLite database) stores challenges
  keyed by repository snapshot and attempts keyed by challenge; a
  data-access layer and tests cover both.

- **US-8 — As a job-seeking junior dev**, completing the M9 loop on my repo
  lets me defend modifying it.
  *Acceptance:* after passing at least one challenge per available type, I
  can state, for my project, *what files I'd change to add a small field*,
  *where I'd start if a request failed*, and *which module to extend safely*
  — the M9 milestone acceptance ("user explains what files to change and
  why"; "system records whether the user demonstrates understanding").

## Functional Requirements

- **FR-1 — Project-tied challenge generation.** A bounded Anthropic SDK
  call, built on the `llm-foundation` client, generates challenges from the
  M6 project map and the M11 snapshot. Each challenge has a type (from the
  M9 challenge-type set), a plain-language task description, target
  files/modules resolved to real snapshot paths, an explicit "in-scope vs
  out-of-scope" boundary, and acceptance criteria for the grader. The call
  uses tool use to read specific files where needed. **Generation is lazy,
  per challenge type, on first open of that category** — generated
  challenges are cached per snapshot in `challenges` so subsequent opens
  do not re-call the SDK. The user can request a regenerated challenge of
  the same type via an explicit "new challenge" action.
- **FR-2 — Challenge-type coverage.** The system supports the M9 challenge
  types: *add a small field*, *trace a failed API call*, *fix a schema
  mismatch*, *add a loading/error state*, *add a unit test*, *explain a
  broken CI result*, *extend one module safely*. **The "explain a broken
  CI result" type is gated on the snapshot exposing a real failing CI run
  or log** — if none is available, the type is omitted, not synthesized
  from a CI config file. Surfacing real CI runs may be deferred (M11
  follow-up); until then this type is expected to be absent on most repos.
  Where any other type does not apply to a given repository, it is
  skipped, not faked.
- **FR-3 — Challenge model.** A typed model of a challenge captures: type,
  task description, in-scope file/module set, out-of-scope file/module set,
  acceptance criteria, source references into the M6 project map, and an
  identifier keyed to the imported-repo snapshot. **Both the in-scope and
  out-of-scope sets are strictly limited to files / modules that the M6
  project map explicitly names** — the generator may not infer adjacent
  files (test files, type files, index files). The integrity check
  (FR-6) rejects any reference outside the M6 map.
- **FR-4 — Submission model.** A typed model of a user attempt captures:
  the user's free-text explanation, optional per-file code snippets, the
  file paths the user said they would change, and a timestamp.
- **FR-5 — Grading call.** A second bounded Anthropic SDK call grades a
  user's submission against the challenge's acceptance criteria and against
  the M6 project map. Output is structured: **a 0–100 numeric score plus a
  weak-area breakdown, mirroring M8's grading shape**, with per-criterion
  results and a short feedback paragraph. The pass threshold and
  weak-area schema match M8's so the two milestones produce one
  comprehension-grading pattern across the product. Grading is
  reproducible and tested with mocked/recorded SDK responses.
- **FR-6 — Project-tied grading output.** Every grading point that names a
  file or module references a real path in the snapshot, validated by an
  integrity check; the grader does not invent files or fabricate code
  references the user never made.
- **FR-7 — No execution; explanation-only grading.** M9 does **not** run,
  build, lint, or test the user's code; it does not autograde arbitrary
  code. **Grading is over the user's explanation only** — which files
  they say they'd change and why, judged against the challenge's expected
  scope and the M6 project map. Optional snippets are illustrative
  context for the user; the grader does not score snippet content for
  style, naming, or plausibility. This boundary is normative — widening
  it requires a new ADR.
- **FR-8 — Persistence.** New tables — `challenges` and
  `challenge_attempts` — added via Drizzle migrations to the existing
  SQLite database (ADR 0006), keyed by snapshot (`owner/repo` + ref) and
  challenge id respectively; list-valued / structured fields stored as JSON
  columns. No new database.
- **FR-9 — Data-access layer.** A typed module to create and read
  challenges, to create and read attempts, and to retrieve a challenge's
  latest outcome server-side from the Next.js app, with tests.
- **FR-10 — UI via Claude Design.** A Challenge List Page, a Challenge
  Detail Page, a Debug Walkthrough UI, and a Completion Review UI — each
  preceded by a Page Spec under `docs/design/` and a prompt under
  `docs/design/ui-prompts/` before any Claude Design generation (ADR 0007).
  **Every new page in M9 goes through the Claude Design round-trip**;
  v0 is **not** used. The Challenge Detail Page shows the most-recent
  attempt as the primary outcome and renders prior attempts inline
  (collapsible) so the user can self-review their progression on a
  challenge.
- **FR-11 — Integration with the imported repo.** M9 consumes the M11
  snapshot (file tree, key files) and the M6 project map (architecture
  overview, key-file map, request/data flow, debug path) through their
  existing data-access layers. No second snapshot- or map-access path.

## Non-Functional Requirements

- **Project-grounded, never generic.** Generic exercises that don't
  reference the user's repo are a failure mode, not an acceptable fallback.
  An integrity check validates that every file/module reference on both the
  challenge and the grading output resolves to a real snapshot path.
- **Comprehension over completion.** Progress on M9 is whether the user
  demonstrated understanding (graded outcome), not whether they clicked
  through challenges.
- **Reproducible.** Generation and grading calls are tested with
  mocked/recorded SDK responses per the `llm-foundation` test strategy. CI
  makes no live API calls.
- **Bounded, not agentic.** Per ADR 0005, M9 uses the Anthropic SDK
  directly (bounded prompt → structured output, with tool use). It is not
  an autonomous agent and not LangChain. LangChain remains confined to M6.
- **Non-duplicative.** Reuses the M11 snapshot data-access layer, the M6
  project-map data-access layer, and the `llm-foundation` client. No new
  GitHub access path, no new map-access path, no new SDK wrapper.
- **Resilient.** Repositories where a challenge type does not apply produce
  a shorter challenge list, not a failure. The grader degrades gracefully
  on very short or off-topic submissions (returns a low score with clear
  feedback, never crashes).
- **Honest about scope.** The grader judges *the user's explanation*
  against the project map and challenge acceptance criteria. It does not
  claim the user's code "works"; it does not execute code.
- **Local-first and web-only.** All interaction happens in `apps/web`; no
  external IDE, editor, or extension is required.

## Success Criteria

- Given a sample imported repository with an M6 project map already
  generated, M9 produces at least one challenge per applicable challenge
  type, each tied to a real file/module path from the snapshot.
- The generated challenges render in the Challenge List Page; opening one
  loads a Challenge Detail Page that names the in-scope files/modules from
  the user's repo.
- A user can submit an answer in the Debug Walkthrough UI and receive, in
  the Completion Review UI, a graded outcome with a weak-area breakdown —
  every file/module reference in that grading resolves to a real snapshot
  path.
- The `challenges` and `challenge_attempts` tables, their Drizzle
  migrations, the data-access layer, and tests land.
- The four UI pieces are integrated into `apps/web` and wired to the
  challenge generator and grader.
- An integrity check rejects challenges and grading outputs that reference
  files not in the snapshot.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` all pass — with
  no API key set.
- A user can pass at least one challenge per applicable type on a sample
  repo and, from those passes, state which files they would change and why
  — the M9 milestone acceptance ("challenge is tied to actual project
  structure"; "user explains what files to change and why"; "system records
  whether the user demonstrates understanding").

## Constraints & Assumptions

- The LLM mechanism is fixed by **ADR 0005**: M9 is bounded Anthropic SDK
  calls (generation, grading, feedback) on the `llm-foundation` client —
  not an autonomous agent and not LangChain. LangChain remains confined to
  M6.
- Storage is governed by **ADR 0006**: M9 adds new tables to the existing
  SQLite database via Drizzle migrations; no new database.
- UI is governed by **ADR 0007** (Claude Design): page specs under
  `docs/design/` precede every UI piece.
- GitHub access is governed by **ADR 0009**: M9 reuses the M11 GitHub
  client through the existing snapshot data-access layer; it does not open
  a second GitHub path.
- All product work follows the M0 CCPM workflow: PRD → epic → issue → PR →
  CI → review.
- The web app (`apps/web`) is the only user surface; no IDE plugin.
- **Assumption:** at least one repository has been imported via M11 and has
  a generated M6 project map. M9 does not import repos and does not
  generate maps.
- **Assumption:** the `llm-foundation` shared client (Anthropic SDK, prompt
  caching, tool use, structured outputs) is already available, as used by
  M4/M5/M8.
- **Assumption:** the user is a job-seeking junior dev per `product.md` —
  early-career, English-reading, comfortable answering in plain language.

## Out of Scope

- **Not a code generator.** M9 does not write code for the user, propose
  full patches, or generate scaffolds. Its job is to issue a project-tied
  challenge, grade the user's explanation, and record whether understanding
  was demonstrated.
- **Not arbitrary-code autograding.** M9 does not execute, build, lint, or
  test the user's submitted code. It does not claim "this passes." Grading
  is over the user's *explanation* of what they would change, judged
  against the challenge acceptance criteria and the M6 project map.
- **Not an IDE / out-of-band editor integration.** M9 lives entirely in
  `apps/web`. There is no IDE plugin, no desktop editor hook, no CLI
  runner.
- **Not repository import** (owned by M11).
- **Not project mapping** (owned by M6); M9 reads the map, does not
  regenerate it.
- **Not diff review of AI-generated PRs** (owned by M8).
- **Not the long-term learning memory, portfolio export, or interview Q&A
  artifacts** — those are M10. M9 records attempts and outcomes per
  challenge; durable cross-project memory and exportable artifacts are
  M10's job.
- **Not LLM observability / tracing** — that is M13.
- **No LangChain / LangGraph in M9.** ADR 0005 confines those to M6.
- **No multi-provider model swap.** Anthropic only, via `llm-foundation`.
- **No automatic challenge difficulty progression / spaced repetition** in
  this milestone — challenges are generated from the repo's structure;
  scheduling / progression is closer to M10's learning-memory scope and is
  not in M9.
- **No synthesized "broken CI" challenges.** If the snapshot does not
  expose a real failing CI run or log, the broken-CI type is omitted, not
  fabricated from a CI config file.
- **No M9-side M10 surface.** M9 stores per-attempt outcomes and stops;
  any cross-attempt / cross-repo rollup or exportable artifact is M10's
  PRD to decide and own.

## Dependencies

- **M6 `project-logic-mapper`** — the project-map data-access layer and the
  outputs (architecture overview, key-file map, request/data flow, state
  flow, AI-call flow, debug path) used to ground challenge generation and
  grading (shipped).
- **M11 `github-integration`** — the imported-repo snapshot schema,
  key-file selection, and snapshot data-access layer (shipped).
- **`llm-foundation`** — the shared Anthropic SDK client used for the
  bounded generation and grading calls (shipped).
- **Existing SQLite database (ADR 0006)** — M9 adds tables, not a database.
- Governed by **ADR 0005** (LLM mechanism), **ADR 0006** (storage),
  **ADR 0007** (UI tool), and **ADR 0009** (GitHub access).
- The existing `apps/web` Next.js app.
- **Human review** — approval of this PRD is required before the M9 epic
  is parsed.

## Resolved Decisions (2026-05-24)

The PRD review pass with the human reviewer resolved every previously open
question. Decisions are normative; the FR / NFR / Constraints / Out of
Scope sections above have been updated to reflect them.

- **R1 — Challenge volume per repo (was Q1).** At least one challenge per
  applicable type per repo. Types that do not apply to the repo are
  skipped (FR-2); this is not a curated-by-user subset.
  *Captured in FR-1, FR-2, Success Criteria.*

- **R2 — Generation trigger (was Q2).** Generation is **lazy, per
  challenge type, on first open of that category**, cached per snapshot
  in `challenges`. A "new challenge" action lets the user request a
  regenerated challenge of the same type.
  *Captured in FR-1.*

- **R3 — Snippet handling (was Q3).** Grading is over the user's
  **explanation only**; optional snippets are illustrative context for
  the user and are **not graded** for style, naming, or plausibility.
  Widening this boundary requires a new ADR.
  *Captured in FR-7.*

- **R4 — Outcome shape (was Q4).** Outcome is a **0–100 numeric score
  plus a weak-area breakdown, matching M8's grading shape**. The pass
  threshold and weak-area schema are shared with M8.
  *Captured in FR-5.*

- **R5 — Attempt history surfacing (was Q5).** The Challenge Detail Page
  shows the most-recent attempt as primary and prior attempts inline
  (collapsible) for self-review.
  *Captured in FR-10.*

- **R6 — Broken-CI challenge (was Q6).** The "explain a broken CI
  result" type is gated on the snapshot exposing a real failing CI run
  or log. **It is not synthesized from a CI config file.** Until M11
  surfaces real CI runs, this type is expected to be absent on most
  repos.
  *Captured in FR-2, Out of Scope.*

- **R7 — Relationship to M10 (was Q7).** M9 ships per-attempt
  persistence and stops. **The M10 integration (whether M10 reads M9's
  tables directly or M9 emits a rollup) is deferred to M10's PRD.** M9
  does not pre-allocate that surface.
  *Captured in Out of Scope.*

- **R8 — In/out-of-scope file source (was Q8).** Both in-scope and
  out-of-scope file sets are **strictly limited to M6 project-map-named
  files**. The generator may not infer adjacent files; the integrity
  check rejects any reference outside the M6 map.
  *Captured in FR-3, FR-6.*

