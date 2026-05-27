---
name: learning-memory-portfolio-export
status: backlog
created: 2026-05-27T13:32:28Z
updated: 2026-05-27T13:32:28Z
progress: 0%
prd: .claude/prds/learning-memory-portfolio-export.md
github: (will be set on sync)
---

# Epic: learning-memory-portfolio-export

## Overview

Milestone 10. Per-repo synthesis layer that turns the shipped M5–M9
outputs into durable learning memory plus the four job-market artifacts
the product PRD names — interview Q&A, résumé bullets, an architecture
explanation, and a learning memory tree (with weak areas surfaced as
"still to revisit") — exportable as a markdown bundle, a PDF, or viewable
as a hosted Portfolio Page at `/portfolio/[owner]/[repo]`.

The mechanism is **hybrid** (FR-2): two bounded Anthropic SDK calls on
the shipped `llm-foundation` client generate the narrative pieces (Q&A,
résumé bullets); deterministic composition from M5/M6/M7/M8/M9 rows
produces the structural pieces (architecture explanation, memory tree,
debug stories). One new `learning_memories` table caches the per-repo
result; regeneration is user-triggered.

## Architecture Decisions

- **LLM mechanism fixed by ADR 0005** — narrative artifacts are
  **bounded Anthropic SDK calls** (prompt → structured output, tool use
  to read M5/M6/M7/M8/M9 rows) on the `llm-foundation` client. Not
  LangChain (M6 only), not autonomous agents. No new ADR.
- **Two bounded calls, narrative only.** Interview Q&A and résumé
  bullets are distinct bounded calls — separate prompts, separate tools,
  separate mocked tests — so each artifact stays single-purpose and
  reproducible. Matches the per-artifact-call shape M7/M8/M9 already
  ship.
- **Structural artifacts are deterministic, not LLM-generated (FR-2).**
  Architecture explanation, learning memory tree, and debug stories are
  templated markdown renderers over the M5/M6/M7/M8/M9 data-access
  layers. No SDK call, no second LLM variant of data the user already
  understood through prior milestones — supports the product PRD's
  "comprehension over completion" stance and removes any chance of the
  synthesis layer hallucinating against the underlying data.
- **Reuse the SQLite database (ADR 0006); one table, JSON columns.**
  One new `learning_memories` table keyed by `snapshot_id` (unique),
  with JSON columns for `interview_qa`, `resume_bullets`,
  `architecture_explanation`, `learning_memory_tree`, `debug_stories`,
  and `generated_at`. Same one-table-per-milestone shape as M6/M7/M8/M9
  — no companion tables.
- **Lazy + cached per snapshot (FR-5).** First visit to the Portfolio
  Page generates the row; subsequent visits read from cache.
  "Regenerate memory" re-invokes the bounded calls and refreshes the
  row. A stale-data banner shows when `repo_snapshots.updated_at` is
  newer than `learning_memories.generated_at` (FR-11) — regeneration
  stays user-triggered.
- **Integrity check is shared, not duplicated.** Adapt M9's
  `packages/db/src/challenges/integrity-check.ts` into a reusable module
  consumed by both Q&A and résumé-bullet generation. SDK outputs that
  name a file outside the M6 project map or a stack technology outside
  M5 are rejected before persistence (FR-3, NFR-5).
- **Per-repo scoping (FR-1).** Everything is keyed to a single
  `repo_snapshots.id`. M10 ships no cross-repo aggregate view. Mirrors
  M7-R6 / M9-R7.
- **Read-only of M5–M9 (FR-10).** M10 reads M5–M9 via the existing DALs
  and writes nothing back to those tables.
- **GitHub access via M11 only (ADR 0009).** No new GitHub access path.
- **UI via Claude Design (ADR 0007).** The Portfolio Page goes through
  the Claude Design round-trip: Page Spec under `docs/design/` → prompt
  under `docs/design/ui-prompts/` → Claude Design draft → integration
  notes under `docs/design/ui-integration-notes/`. v0 is not used.
- **Parallel worktree per epic (ADR 0008).** M10 runs on its own
  `epic/learning-memory-portfolio-export` branch; in-epic non-conflicting
  tasks may run as background sub-agents. **Schema-collision discipline
  (M9 retrospective):** M10 is a schema-adding epic and *should not run
  parallel with any other schema-adding epic* until the "serialize the
  schema-adding task" decision is made.
- **PDF library choice.** A dedicated task evaluates and installs the
  PDF renderer. Default leaning: **`@react-pdf/renderer`** — pure-React,
  no headless browser, fits a local-first / no-extra-binary footprint
  better than puppeteer / playwright; final choice locked at task time
  per the official-installation rule and recorded in a setup note (or a
  small ADR if it touches another adopted-track decision).

## Technical Approach

### Frontend Components

The Portfolio Page is the only new user-facing surface. It follows the
Claude Design round-trip (ADR 0007): Page Spec under `docs/design/`,
prompt under `docs/design/ui-prompts/`, Claude Design draft, integration
notes under `docs/design/ui-integration-notes/`. v0 is not used.

- **Portfolio Page** — route
  `apps/web/app/portfolio/[owner]/[repo]/page.tsx`. Reads the
  `learning_memories` row plus the related `repo_snapshots`, `stack_explanations`,
  `project_maps`, `learning_units`, `diff_reviews`, and `challenges`
  rows the renderer needs. Composes (in order on the page, with anchor
  navigation): Architecture Explanation → Learning Memory Tree
  (weak-areas surfaced) → Interview Q&A → Résumé Bullets → Debug
  Stories. Renders a "Regenerate memory" action (re-invokes the two
  bounded calls and refreshes the row), an "Export bundle" action (FR-6
  ZIP / folder of per-type `.md` files + combined `portfolio.md`), and
  an "Export PDF" action (FR-7). Shows a stale-data banner when the
  underlying snapshot is newer than `learning_memories.generated_at`
  (FR-11).
  Page Spec: `docs/design/portfolio-page.page-spec.md`.

### Backend Services

All M10 backend code lives in `packages/db/src/learning-memories/`,
beside the M7 / M8 / M9 backends it reads.

- **`learning_memories` schema + Drizzle migration.** One new table
  added to the existing SQLite database (ADR 0006). Keyed by
  `snapshot_id` (unique). JSON columns for `interview_qa`,
  `resume_bullets`, `architecture_explanation`, `learning_memory_tree`,
  `debug_stories`, plus `generated_at`. Numbered cleanly as `0009` (next
  after M9's `0008_wealthy_starbolt.sql`).
- **Reusable integrity check** — adapts M9's
  `packages/db/src/challenges/integrity-check.ts` into a shared module
  under `packages/db/src/learning-memories/integrity.ts`. Checks every
  file reference against the M6 `project_maps` file set and every
  stack-technology claim against the M5 `stack_explanations` row.
  Imported by both the Q&A SDK call and the résumé-bullet SDK call.
  Generation outputs that fail the check are rejected before persistence
  (FR-3, NFR-5).
- **Interview Q&A generation call.** Bounded Anthropic SDK call on the
  shared `llm-foundation` client with tool use to read specific
  `stack_explanations` / `project_maps` / `learning_units` / `diff_reviews`
  / `challenge_attempts` rows. Forced final tool `submit_interview_qa`;
  short turn cap. Produces a typed `InterviewQA[]` covering the five
  ground areas listed in the PRD (stack, architecture, per-issue
  learning, diff/risk, debug/expansion). Integrity-checked before
  persistence. Tested with mocked / recorded SDK responses on the
  `@workspace/ai` mock transport.
- **Résumé-bullet generation call.** Second bounded Anthropic SDK call
  with the same tool-use pattern. Forced final tool
  `submit_resume_bullets`. Produces a typed `ResumeBullet[]` where each
  bullet is ≤ 160 chars (US-2). Integrity-checked: every named
  technology resolves to a real M5 row; the bullet's claim must be
  grounded in a real M6 / M7 / M9 row. Tested with mocked / recorded
  SDK responses.
- **Deterministic composition module.** Pure-TS renderers in
  `packages/db/src/learning-memories/compose.ts`:
  - `composeArchitectureExplanation(snapshotId)` → reads
    `stack_explanations` + `project_maps`, emits ~1–2 pages of markdown
    grounded in the named files.
  - `composeLearningMemoryTree(snapshotId)` → reads `learning_units`
    (including their `weak_areas`) + `diff_reviews.weak_areas` +
    `challenge_attempts.grading.weakAreas`, emits a typed tree with each
    leaf citing the row that taught it; weak areas surface as "still to
    revisit" (FR-4).
  - `composeDebugStories(snapshotId)` → reads `challenge_attempts` +
    associated `challenges` rows, emits a per-attempt narrative.
  Pure functions; no SDK call; identical output for identical inputs
  (NFR-2). Tested with seeded fixtures.
- **Data-access layer + cache.** Typed module under
  `packages/db/src/learning-memories/memories.ts`: `getMemory`,
  `generateMemory` (runs the two bounded calls + deterministic
  composers, integrity-checks, upserts the row), `isMemoryStale`. All
  reads / writes go through the existing `repo_snapshots` /
  `learning_units` / `diff_reviews` / `challenges` DALs (no new
  GitHub / snapshot access — FR-10, ADR 0009).
- **Markdown bundle exporter.** Pure-TS renderer that produces, from a
  `learning_memories` row, the per-type `.md` files plus
  `portfolio.md`. Filename includes `owner-repo-snapshot.id` (US-6).
  Returned by a Server Action as a ZIP for browser download.
- **PDF exporter.** Renders the combined bundle via the chosen library
  (default leaning: `@react-pdf/renderer`). Lives behind a single
  `renderPortfolioPdf(memoryRow): Buffer` function so the library is
  swappable. Runs server-side only.

### Infrastructure

- **One Drizzle migration on the existing SQLite database (ADR 0006)**
  adding `learning_memories`. Numbered cleanly as `0009` after M9's
  `0008_wealthy_starbolt.sql`. No new database, no new external
  services.
- **Test strategy parity with `llm-foundation`.** Both bounded calls
  test on the `@workspace/ai` mock transport. The deterministic
  composers test on seeded SQLite fixtures. `pnpm test` runs with no
  `ANTHROPIC_API_KEY` and no live GitHub access (NFR-2).
- **One new dependency** — the chosen PDF renderer. Installed per the
  official-installation rule with the reason recorded in a setup note
  (or a small ADR if it touches the trial-track decision tree).

## Implementation Strategy

Four waves mirroring the M6 / M7 / M8 / M9 shape:

**Wave 1 (parallel, 3 tasks):**
- Task 1 — `learning_memories` schema + DAL.
- Task 2 — Reusable integrity check (adapted from M9).
- Task 3 — Portfolio Page Page Spec + Claude Design prompt.

**Wave 2 (parallel within wave, 3 tasks, after Wave 1):**
- Task 4 — Deterministic composition module (architecture, memory tree,
  debug stories). Depends on Task 1 only.
- Task 5 — Interview Q&A bounded SDK call. Depends on Tasks 1 + 2.
- Task 6 — Résumé-bullet bounded SDK call. Depends on Tasks 1 + 2.

**Wave 3 (sequential pair):**
- Task 7 — Markdown bundle exporter (per-type `.md` + combined
  `portfolio.md`). Depends on Tasks 4, 5, 6.
- Task 8 — PDF exporter — install + integrate the chosen renderer.
  Depends on Task 7.

**Wave 4 (single integration task):**
- Task 9 — Integrate the Portfolio Page route + Server Actions into
  `apps/web`; wire to `getMemory`, `generateMemory`, markdown export,
  and PDF export. Depends on Tasks 3, 4, 5, 6, 7, 8.

Critical path: Task 1 (or Task 2) → Tasks 5/6 → Task 7 → Task 8 →
Task 9.

## Task Breakdown Preview

1. **`learning_memories` schema + Drizzle migration + DAL + tests.**
   Single table, JSON columns; create / read / upsert by `snapshot_id`;
   `isMemoryStale` helper. `[parallel]` — no in-epic dependencies.
2. **Reusable file-reference + stack-reference integrity check.**
   Adapted from M9's `challenges/integrity-check.ts`. Pure function,
   imports M5 / M6 DALs; tests on seeded fixtures. `[parallel]` — no
   in-epic dependencies.
3. **Portfolio Page — Page Spec + Claude Design prompt.** Under
   `docs/design/portfolio-page.page-spec.md` and
   `docs/design/ui-prompts/portfolio-page.md`. `[parallel]` — no
   in-epic dependencies.
4. **Deterministic composition module + tests.** The three composers
   (`composeArchitectureExplanation`, `composeLearningMemoryTree`,
   `composeDebugStories`); seeded-fixture tests; identical output across
   runs. `[sequential — blocked by 1]`.
5. **Interview Q&A bounded SDK call + integrity check + mocked tests.**
   Tool use over M5/M6/M7/M8/M9 rows; forced `submit_interview_qa`;
   integrity-checked. `[sequential — blocked by 1, 2]`.
6. **Résumé-bullet bounded SDK call + integrity check + mocked tests.**
   Tool use over M5/M6/M7/M9 rows; forced `submit_resume_bullets`;
   ≤160-char bullets; integrity-checked. `[sequential — blocked by 1,
   2]`.
7. **Markdown bundle exporter + tests.** Per-type `.md` files +
   combined `portfolio.md`; filenames include `owner-repo-snapshot.id`;
   ZIP packaging. `[sequential — blocked by 4, 5, 6]`.
8. **PDF exporter — install renderer + render bundle + tests.** Library
   selection locked at task time (default lean: `@react-pdf/renderer`);
   setup note / ADR recording the reason; `renderPortfolioPdf` swappable
   behind one function. `[sequential — blocked by 7]`.
9. **Integrate M10 UI into `apps/web`** — `/portfolio/[owner]/[repo]`
   route + Server Actions for regenerate / export-markdown / export-PDF;
   stale-data banner; full end-to-end loop on a seeded sample repo.
   `[sequential — blocked by 3, 4, 5, 6, 7, 8]`.

Total: **9 tasks**, within the CCPM "≤ 10 tasks" guideline.

## Dependencies

- **M5 `stack-explainer`** — `stack_explanations` rows feed the résumé
  bullets and the architecture explanation. (Shipped.)
- **M6 `project-logic-mapper`** — `project_maps` is the authoritative
  file set for the integrity check and the primary input to the
  architecture-explanation composer. (Shipped.)
- **M7 `issue-based-learning-workspace`** — `learning_units` feed the
  learning memory tree leaves; `weak_areas` feeds the "still to
  revisit" entries. (Shipped.)
- **M8 `diff-review`** — `diff_reviews` weak-area history feeds the
  memory tree; the M8 `WeakArea` shape is reused throughout M10.
  (Shipped.)
- **M9 `debug-expansion-challenge`** — `challenges` / `challenge_attempts`
  feed the debug stories composer; the M9 integrity-check module is the
  adaptation source for M10's reusable integrity check. (Shipped.)
- **M11 `github-integration`** — snapshot identity (`owner/repo/ref`)
  is the routing key for `/portfolio/[owner]/[repo]`. No new GitHub
  access path. (Shipped.)
- **`llm-foundation`** — shared Anthropic SDK client and mock transport
  for the two bounded calls. (Shipped.)
- Governed by **ADR 0005** (LLM mechanism), **ADR 0006** (storage),
  **ADR 0007** (UI via Claude Design), **ADR 0008** (parallel execution),
  **ADR 0009** (GitHub access).
- **New PDF-renderer dependency** — task-time selection per
  official-installation rule.
- **Human approval of this epic** before any task starts (CLAUDE.md
  hard rule).
- **Cross-epic / cross-package coordination.** M10 is a schema-adding
  epic; per the M9 retrospective, it should not run parallel with
  another schema-adding epic. The decision between "serialize
  schema-adding tasks across parallel epics" and "formalize the
  regenerate-at-merge chore" remains open — flagged here for the human
  reviewer to decide before any parallel M10/M-other work starts.

## Success Criteria (Technical)

- Drizzle migration `learning_memories` exists as `0009`, applies
  cleanly on top of M9's `0008_wealthy_starbolt.sql`, and stores all
  five JSON columns plus `generated_at`.
- Given a sample imported repo with rows in `stack_explanations`,
  `project_maps`, `learning_units`, `diff_reviews`, and `challenges`,
  the Portfolio Page at `/portfolio/[owner]/[repo]` renders all four
  artifacts and supports regenerate / export-markdown / export-PDF
  end-to-end.
- The two bounded SDK calls produce typed `InterviewQA[]` and
  `ResumeBullet[]` outputs that pass the integrity check (FR-3);
  failing-fixture tests confirm the rejection path.
- The three deterministic composers produce identical output across two
  runs on identical seeded inputs (NFR-2).
- Weak-area entries from M7 / M8 / M9 grading appear in the learning
  memory tree marked "still to revisit" (FR-4) — covered by a
  weak-area-present fixture.
- Markdown bundle exporter produces the per-type `.md` files plus a
  coherent combined `portfolio.md` with filenames containing
  `owner-repo-snapshot.id`; PDF exporter produces a renderable
  `portfolio.pdf` from the same data.
- The stale-data banner (FR-11) appears when the underlying snapshot's
  `updated_at` is newer than `learning_memories.generated_at`.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` all
  pass with **no `ANTHROPIC_API_KEY` set and no live GitHub calls** in
  CI.

## Estimated Effort

- **Size:** Medium — 9 tasks, 4 waves.
- **Critical path:** Task 1 (schema + DAL) → Task 5 / 6 (the two
  bounded SDK calls) → Task 7 (markdown bundle) → Task 8 (PDF) → Task 9
  (integration).
- **Parallelizable:** Tasks 1, 2, 3 in Wave 1; Tasks 4, 5, 6 in Wave 2;
  Tasks 7 → 8 sequential in Wave 3; Task 9 in Wave 4.
- **Expected calendar shape:** comparable to the M7 / M9 nine-task
  epics. The two new bounded SDK calls reuse the shipped
  `llm-foundation` client and the M7 / M9 generation-call shape, so the
  novel work is concentrated in the deterministic composition module,
  the markdown / PDF export, and the PDF-library install.
- **Runs as a parallel worktree epic under ADR 0008 on
  `epic/learning-memory-portfolio-export`** — sub-agents inside the
  epic; but not in parallel with another schema-adding epic per the M9
  retrospective.
