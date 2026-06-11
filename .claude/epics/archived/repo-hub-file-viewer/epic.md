---
name: repo-hub-file-viewer
status: completed
created: 2026-06-11T18:25:12Z
updated: 2026-06-11T19:36:02Z
progress: 100%
prd: .claude/prds/repo-hub-file-viewer.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/264
---

# Epic: repo-hub-file-viewer

## Overview

M17. Two read-only pages over the existing M11 snapshot DAL — a **Repos Hub**
at `/repos` (replacing M16's redirect) and a **Snapshot File Viewer** under
`/repos/[owner]/[repo]` — plus wiring from the three known dead-ends (import
success forward action, M5 key-file references, M6 map file references) into
the viewer. No schema changes, no new dependencies, no network surface.

## Architecture Decisions

- **AD-1 — Zero data-layer work expected.** `listImportedRepos`,
  `getImportedRepo`, `getRepoTree`, `listRepoFiles`, `getRepoFile`
  (`packages/db/src/github/repos.ts`) already cover both pages. Small
  read-only DAL additions are allowed only if a real gap appears; no
  migrations (ADR 0011: this is not a schema-touching epic).
- **AD-2 — Page Spec first, implement directly from spec.** Both pages get a
  Page Spec under `docs/design/` (UI rule); implementation follows the spec
  directly without a separate Claude Design draft, per M12/M13 precedent
  (recorded here as the ADR-0007 deviation note).
- **AD-3 — Viewer addresses files by query param** (`?path=`), single route
  `/repos/[owner]/[repo]/files`: avoids catch-all-segment encoding issues,
  keeps one page component, and makes deep links trivial for the wiring
  tasks. The Page Spec (#266) owns the final call; if it overrides to a
  segment scheme, the wiring tasks follow the spec.
- **AD-4 — Honest "not captured" state.** The snapshot stores the full tree
  but contents only for selected key files; the viewer must render
  non-captured entries with metadata + an explicit "content not captured at
  import" state, never pretending to have the file.
- **AD-5 — Wire only same-snapshot references.** M5/M6 links are built from
  paths stored in their result rows and target the snapshot those analyses
  ran against; paths missing from the tree degrade to plain text.

## Technical Approach

### Frontend Components

- `apps/web/app/repos/page.tsx` — replace redirect with the hub (Server
  Component over `listImportedRepos`; rows link to per-repo areas; empty
  state → `/import`; shared `AppNav active="repos"`).
- `apps/web/app/repos/[owner]/[repo]/files/page.tsx` (+ `_components/`) —
  tree pane + file pane; captured files render contents in a plain `<pre>`;
  `?path=` selects; not-found handling for unknown paths; `loading.tsx` /
  `error.tsx` / `not-found.tsx` per the repos feature conventions.
- Wiring edits: `apps/web/app/import/_components/import-flow.tsx`
  (SuccessView forward action), `apps/web/app/stack/[owner]/[repo]/
  _components/stack-explainer-flow.tsx` (Key files to inspect),
  `apps/web/app/map/[owner]/[repo]/_components/map-flow.tsx` (file
  references).

### Backend Services

- None expected (AD-1). Reads via the existing data-access layer only.

### Infrastructure

- None. Two Page Specs added under `docs/design/`.

## Implementation Strategy

Three waves on one epic branch (`epic/repo-hub-file-viewer`):
Wave 1 — the two Page Specs (#265, #266) in parallel.
Wave 2 — the two page implementations (#267, #268) in parallel, each from
its spec.
Wave 3 — the two wiring tasks (#269, #270) in parallel once the viewer URL
contract is merged.
Central verification in the main checkout; CI on the epic PR is the gate.

## Task Breakdown Preview

- [x] #265 — Page Spec: Repos Hub (parallel)
- [x] #266 — Page Spec: Snapshot File Viewer (parallel)
- [x] #267 — Implement /repos hub page (after #265)
- [x] #268 — Implement snapshot file viewer route (after #266)
- [x] #269 — Wire import success forward action (after #268)
- [x] #270 — Wire M5/M6 file references into the viewer (after #268)

## Dependencies

- Internal: M11 DAL + import flow, M16 shared `AppNav`, M5 stack flow, M6
  map flow, repos feature CSS conventions (`repos.css`).
- External: none; no new packages.

## Success Criteria (Technical)

- `/repos` lists imported snapshots; redirect gone; per-repo area links work.
- Viewer renders tree + captured contents at a stable deep-linkable URL;
  non-captured and unknown paths handled honestly.
- Import success, M5 key files, M6 file references click through.
- No new deps; no schema changes; lint/typecheck/build + web/db tests green;
  CI green on the epic PR.

## Estimated Effort

~13 hours across 6 tasks (S–M each); 2+2+2 parallel waves.
Critical path: 002 → 004 → 005/006.
