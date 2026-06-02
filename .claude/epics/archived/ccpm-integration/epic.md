---
name: ccpm-integration
status: completed
created: 2026-06-02T13:09:15Z
updated: 2026-06-02T16:01:16Z
progress: 100%
prd: .claude/prds/ccpm-integration.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/196
---

# Epic: ccpm-integration

## Overview

Turn a repo's CCPM artifacts into a local **delivery traceability map**
(PRD → Epic → Task → Issue → PR) with a beginner-first teaching layer, and
degrade gracefully (with an educational explainer) for the common case of a
repo that uses no spec-driven workflow.

The work is heavily **reuse-first**. M7 already shipped a CCPM *task* adapter
(`packages/db/src/github/ccpm-task-adapter.ts`) with a tested frontmatter
parser, and M11 shipped the snapshot pipeline, the read-only GitHub client, and
issue/PR fetching (`issues.ts`, `pull-requests.ts`). M12 generalizes the parser
to PRDs and epics, closes a latent snapshot-coverage gap, builds a deterministic
graph + teaching layer over the result, and surfaces it on one new page.

## Architecture Decisions

- **AD-1 — Reuse and generalize the existing parser, don't replace it.**
  `parseCcpmTaskFile` + `CcpmTaskFrontmatter` already parse `.claude/epics/<e>/<N>.md`.
  M12 adds pure parsers for **PRDs** (`.claude/prds/*.md` — `name/description/status/created`)
  and **epics** (`.claude/epics/<e>/epic.md` — `name/status/progress/prd/github`),
  and a map-oriented task read that **includes** `archived/`. M7's task adapter
  is left untouched (it intentionally excludes `archived/` and `epic.md` for the
  learning workspace); M12's parsing lives alongside it in a new `ccpm/` module.

- **AD-2 — Close the snapshot-coverage gap (FR-8) by extending key-file
  selection.** Today `import.ts` → `selectKeyFiles` does **not** capture
  `.claude/**`, so `repo_files` never holds CCPM artifact *contents* — meaning
  M7's `listCcpmTasks` returns empty on a real import. M12 adds CCPM artifact
  categories (`ccpm-prd`, `ccpm-epic`, `ccpm-task`) to `classifyKeyFile` so the
  existing import + persistence pipeline captures `.claude/prds/**` and
  `.claude/epics/**` (incl. `archived/`) with no new fetch infrastructure. CCPM
  files are small markdown — within the existing size/rate budget. This also
  makes M7's CCPM-task path functional on real repos (bonus, not scope creep).

- **AD-3 — Deterministic graph + deterministic teaching layer; no LLM in MVP.**
  Detection, parsing, graph construction, and the per-artifact explanations are
  pure and unit-tested. Explanations are templated but **parameterized by the
  real artifacts** (epic decomposed into N tasks, M parallel, K closed), which
  satisfies US-2's "references the actual artifact" without an SDK call,
  integrity-check surface, or new model dependency. (The PRD permits LLM phrasing
  but does not require it; we defer it.)

- **AD-4 — Live issue/PR linking at import time, persisted locally (ADR 0009).**
  For each task carrying a `github:` issue ref, resolve issue state + the closing
  PR using M11's `fetchIssue` / pull-request model, at import. Persist the result
  so the map view makes **zero** network calls. Reuse M11's `GitHubResult`
  boundary model; a link failure degrades to a per-node "couldn't link status"
  annotation — the map still renders from local files.

- **AD-5 — One new page, consistent with the existing per-analysis surfaces.**
  The app already has `/map/[owner]`, `/stack/[owner]`, `/reviews/[owner]`,
  `/portfolio/[owner]`. M12 adds **`/delivery/[owner]`** — a Server Component
  shell + Client island reading a Server Action over the new data-access layer.
  Requires a Page Spec under `docs/design/` before any UI (CLAUDE.md v0/Claude
  Design rule).

- **AD-6 — Single new module namespace.** All backend code lands under
  `packages/db/src/ccpm/` (parser, graph, teaching, linking, data-access) to keep
  the surface cohesive and mirror the `learning-units/`, `learning-memories/`,
  `challenges/` module shape.

## Technical Approach

### Frontend Components

- **`apps/web/app/delivery/[owner]/`** — Server Component page resolving the
  delivery map for an imported repo via a Server Action; renders either the
  traceability map + teaching panels, or the graceful-degradation explainer.
- **`apps/web/app/delivery/_components/`** — Client island(s): the map/tree view
  (PRD → epic → task → issue/PR), per-node teaching popovers, and the
  "no spec-driven workflow detected" educational state linking to the M2 Golden
  Path. Built from a Page Spec via Claude Design (ADR 0007), beginner-first copy,
  no raw HTTP codes.

### Backend Services (`packages/db/src/ccpm/`)

- **`parse.ts`** — pure parsers for PRD / epic / task frontmatter + body,
  generalizing the M7 frontmatter approach; tolerant of missing fields and the
  `archived/` subtree.
- **`graph.ts`** — pure builder: parsed artifacts → typed `CcpmTraceabilityMap`
  (PRD/epic/task nodes + issue/PR leaves) **or** a `NoCcpmWorkflow` detection
  state; deterministic ordering; resolves epic→PRD (`prd:`) and task→issue
  (`github:`) edges; unsynced tasks marked, not dropped.
- **`teaching.ts`** — pure, parameterized per-artifact + flow explanations.
- **`linking.ts`** — import-time resolution of issue state + closing PR per task
  ref, reusing `issues.ts` / `pull-requests.ts`; persisted locally.
- **`index.ts`** — typed data-access (`getDeliveryMap(owner, repo, ref?)`) the
  Server Action consumes; never reads the live filesystem (snapshot-only).

### Infrastructure

- **`packages/db/src/schema.ts`** — new table(s) for persisted CCPM artifacts +
  issue/PR link annotations (or a JSON column keyed to the snapshot), plus a
  Drizzle migration. M12 runs **solo** (no parallel epic touching `packages/db`),
  so the M11/M3 migration-collision lesson is avoided — but regenerate cleanly
  against current `main` head.
- **`key-files.ts` / `import.ts`** — extended per AD-2 to capture `.claude/**`
  CCPM artifacts into `repo_files`.

## Implementation Strategy

Three waves, maximizing the parallelism CLAUDE.md/ADR-0008 allow (independent,
non-conflicting tasks as background sub-agents within the epic):

- **Wave 1 (parallel):** schema+migration, generalized parser, snapshot coverage.
  These touch different files (`schema.ts`+migration / new `ccpm/parse.ts` /
  `key-files.ts`+`import.ts`) and can run concurrently.
- **Wave 2:** graph+detection+degradation (after parser); issue/PR linking
  (after schema + coverage + parser) — these two can run in parallel; teaching
  layer (after graph).
- **Wave 3:** data-access layer (after all backend); Page Spec + Claude Design
  prompt (after graph shape is known, can overlap Wave 2); integrate the UI page
  (after data-access + Page Spec).

Each task: bounded, AI self-review, local verification (`pnpm lint/build/typecheck`
+ package Vitest), PR, CI, human review.

## Task Breakdown Preview

1. **CCPM artifact storage: schema + Drizzle migration** — persist parsed
   artifacts + issue/PR link annotations. *(parallel; no deps)*
2. **Generalized CCPM parser** (`ccpm/parse.ts`) — PRD + epic + task parsers
   incl. `archived/`, pure + Vitest. *(parallel; no deps)*
3. **Snapshot coverage for `.claude/**`** — add `ccpm-*` categories to
   `classifyKeyFile`; verify import captures PRDs/epics/tasks. *(parallel; no deps)*
4. **Traceability graph + detection + degradation** (`ccpm/graph.ts`) — typed
   map or `NoCcpmWorkflow` state; deterministic edges. *(deps: 2)*
5. **Live issue/PR linking at import** (`ccpm/linking.ts`) — resolve issue state
   + closing PR per task, persist locally; reuse `issues.ts`/`pull-requests.ts`.
   *(deps: 1, 2, 3)*
6. **Teaching layer** (`ccpm/teaching.ts`) — deterministic per-artifact + flow
   explanations parameterized by the map. *(deps: 4)*
7. **Typed data-access layer** (`ccpm/index.ts`) — `getDeliveryMap(...)`
   composing map + teaching + links + degradation. *(deps: 1, 4, 5, 6)*
8. **Delivery page: Page Spec + Claude Design prompt** under `docs/design/`.
   *(deps: 4 for map shape; can overlap Wave 2)*
9. **Integrate the Delivery page** into `apps/web` (`/delivery/[owner]`) —
   Server Component + Server Action + Client island. *(deps: 7, 8)*

Target: **9 tasks** (≤10), one UI round-trip, the rest deterministic backend.

## Dependencies

- **M11** — snapshot pipeline (`import.ts`, `repos.ts`, `schema.ts`), read-only
  GitHub client + `GitHubResult`, `issues.ts`, `pull-requests.ts`.
- **M7** — `ccpm-task-adapter.ts` (parser to generalize, not duplicate).
- **M2** — "Agentic CCPM Workflow" Golden Path the degradation state links to.
- **CCPM conventions schema** — authoritative parse target.
- External: none new (no new model/tool; reuses Drizzle, the GitHub client).

## Success Criteria (Technical)

- A CCPM repo imports to a map where **100% of epics resolve to their PRD** and
  **100% of synced tasks resolve to their issue**; unsynced tasks shown as
  "not synced". (graph unit tests + integration)
- Importing **this repo** yields a complete map across active + `archived/`
  epics with no crash on real shapes (missing `github:`, PRD-without-epic) — an
  explicit test fixture.
- A non-CCPM snapshot returns the `NoCcpmWorkflow` state (no error/empty crash)
  — automated test.
- Map view triggers **zero** network calls (linking resolved at import) —
  asserted by test.
- Every artifact node carries a parameterized beginner-first explanation —
  reviewed against acceptance criteria.
- New `ccpm/` modules ship with passing Vitest; CI green (lint/build/typecheck/test).

## Estimated Effort

Medium. ~9 bounded tasks: 1 migration, ~5 deterministic backend modules
(2 reusing existing M7/M11 code), 1 data-access layer, 1 Page Spec, 1 UI
integration. No new external tooling. Critical path: 2 → 4 → 6/7 → 9; Wave-1
parallelism (1, 2, 3) and Wave-2/3 overlap (5 ∥ 4; 8 ∥ 6) compress wall-clock.

## Tasks Created
- [x] #197 - CCPM artifact storage — schema + Drizzle migration (parallel: true)
- [x] #198 - Generalized CCPM parser (PRD + epic + task) (parallel: true)
- [x] #199 - Snapshot coverage for .claude CCPM artifacts (parallel: true)
- [x] #200 - Traceability graph + detection + degradation (parallel: true, deps: 2)
- [x] #201 - Live issue/PR linking at import (local-first) (parallel: true, deps: 1,2,3)
- [x] #202 - Teaching layer (deterministic, parameterized) (parallel: true, deps: 4)
- [x] #203 - Typed data-access layer (getDeliveryMap) (parallel: true, deps: 1,4,5,6)
- [x] #204 - Delivery page — Page Spec + Claude Design prompt (parallel: true, deps: 4)
- [x] #205 - Integrate the Delivery page into apps/web (parallel: false, deps: 7,8)

Total tasks: 9
Parallel tasks: 8 (001–008 — gated by their deps, but conflict-free)
Sequential tasks: 1 (009 — final UI integration)
Estimated total effort: 39 hours

Dependency waves:
- Wave 1 (no deps): 001, 002, 003
- Wave 2: 004 (←2), 005 (←1,2,3), 006 (←4)
- Wave 3: 007 (←1,4,5,6), 008 (←4), 009 (←7,8)
