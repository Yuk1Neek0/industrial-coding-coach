---
name: repo-hub-file-viewer
description: A real /repos hub listing imported snapshots and a read-only snapshot file viewer, wired into the import success page and the M5/M6 file references
status: completed
created: 2026-06-11T18:25:12Z
---

# PRD: repo-hub-file-viewer

## Executive Summary

M17. The product analyzes imported repo snapshots everywhere, but the user can
never *see* them: there is no page listing what's been imported (M16 left
`/repos` as a redirect to the import form), no way to view a snapshot's file
tree or a captured file's contents (the M11 retrospective explicitly deferred
the "snapshot-view route, which would re-enable the Import success page's
forward action"), and every file reference on the M5 Stack Explainer and M6
Project Map renders as dead monospace text (named in both retrospectives).
M17 ships the two missing read-only pages — a **Repos Hub** and a **Snapshot
File Viewer** — and wires the three existing dead-ends into them.

## Problem Statement

1. **Imported repos are invisible.** After importing, the only proof a
   snapshot exists is that other features can use it. There is no list of
   imported repos, no entry point to a repo's per-area pages (issues,
   challenges, stack, map, reviews, portfolio, delivery, observability) —
   the nav's Repos entry currently redirects to the import form.
2. **Snapshot contents are invisible.** `repo_snapshots` stores the full file
   tree (JSON) and `repo_files` stores the captured key files' contents, with
   a complete DAL already in place (`listImportedRepos`, `getRepoTree`,
   `listRepoFiles`, `getRepoFile`) — but no route renders any of it. The M11
   import success page ends in a dead-end ("Import another repository" only).
3. **File references don't link.** M5's "Key files to inspect" and M6's
   Project Map file references are plain monospace text — the user reading
   "look at `src/app/page.tsx`" cannot click through to the file (M5 and M6
   retrospectives, repeated in M16's follow-ups).

## User Stories

**US-1 — See what I've imported.**
As a learner, I want `/repos` to list my imported repositories so I can jump
into any repo's coaching areas from one place.
*Acceptance criteria:*
- `/repos` renders a list of imported snapshots (owner/repo, ref, imported
  time, file count) from the local DB — replacing the M16 redirect.
- Each repo row links to its per-repo areas (at minimum: Files, Issues,
  Challenges, Stack, Map, Reviews, Portfolio, Delivery, Observability).
- Empty state points to `/import` with a clear call to action.
- The page has a Page Spec under `docs/design/` before implementation.

**US-2 — Browse a snapshot.**
As a learner, I want to browse an imported repo's file tree and read captured
key files so I can ground the coach's explanations in the actual code.
*Acceptance criteria:*
- A snapshot file viewer route under `/repos/[owner]/[repo]` renders the
  stored file tree and, for captured key files, the file contents (read-only,
  plain monospace — no syntax-highlighting dependency).
- Files in the tree that were not captured as key files show an honest
  "content not captured at import" state (with their tree metadata).
- Deep-linkable: a URL can address a specific file path so other features
  can link to it.
- Everything reads the local snapshot only — zero network calls.
- The page has a Page Spec under `docs/design/` before implementation.

**US-3 — Follow the coach's file references.**
As a learner, when the Stack Explainer or Project Map names a file, I want to
click it and land on that file in the viewer.
*Acceptance criteria:*
- Import success view gains a forward action into the imported repo (hub
  and/or viewer) — the M11 dead-end is closed.
- M5 Stack Explainer "Key files to inspect" entries link to the viewer at
  the referenced path.
- M6 Project Map file references link to the viewer at the referenced path.
- References to paths that don't exist in the snapshot tree degrade
  gracefully (no link or a clearly-handled not-found state — no broken 500s).

## Functional Requirements

- FR-1: `/repos` hub page over `listImportedRepos` (Server Component; reuse
  existing `.repo-list`-style conventions where sensible).
- FR-2: Snapshot file viewer route with tree + file panes over
  `getRepoTree`/`listRepoFiles`/`getRepoFile`; file addressed via URL (query
  param or segment — fixed by the Page Spec); captured files render contents,
  non-captured files render metadata + "not captured" state; unknown paths →
  not-found handling.
- FR-3: Wiring — import success forward action; M5 key-file links; M6 file
  reference links. Link only when the target snapshot is the same one the
  page's analysis used.
- FR-4: Both new pages adopt the shared `AppNav` (`active="repos"`); the hub
  replaces `apps/web/app/repos/page.tsx`'s redirect.

## Non-Functional Requirements

- Local-first: both pages read SQLite only; no GitHub calls.
- No new dependencies (no syntax highlighter, no tree library — plain
  components).
- Follows the UI rule: Page Spec under `docs/design/` per page before
  implementation (Claude Design draft optional per M12/M13 precedent).
- All quality gates pass: lint, typecheck, build, web + db tests, CI.

## Success Criteria

- `/repos` shows imported repos and links through to per-repo areas; the
  redirect is gone.
- A captured key file's contents are readable in the browser at a stable URL.
- Import success, M5 key files, and M6 file references click through to the
  viewer.
- Zero new network surfaces; zero new dependencies; CI green on the epic PR.

## Constraints & Assumptions

- CCPM epic `repo-hub-file-viewer`, branch `epic/repo-hub-file-viewer`,
  `Issue #N:` commits, parallel sub-agents per ADR 0008, central verification
  in the main checkout (Windows cold-worktree gotcha), CI as the merge gate.
- Only one schema-touching epic at a time per ADR 0011 — this epic touches
  **no schema** and **no DAL changes are expected** (the four needed functions
  exist; small read-only DAL additions are allowed if a real gap appears, but
  no migrations).
- Assumption: `repo_snapshots.fileTree` holds the full tree with per-entry
  metadata (path, type, size) sufficient for tree rendering; `repo_files`
  holds only key-file contents — the "not captured" state is therefore the
  honest common case.
- Assumption: M5/M6 store the file paths they reference in their result rows,
  so links can be built without re-running analysis.

## Out of Scope

- Editing files, writing anything back to disk or GitHub.
- Syntax highlighting, code search, blame, diffs (the M8 diff view already
  covers diffs).
- Capturing *more* files at import time (key-file selection is M11's logic —
  unchanged).
- Live GitHub browsing or refresh-from-GitHub (separate milestone candidate).
- Linking M7 issue workspace / M9 challenge file references (same pattern,
  future content pass — M17 wires M5/M6 + import success only).

## Dependencies

- Internal: M11 DAL (`packages/db/src/github/repos.ts` — `listImportedRepos`,
  `getImportedRepo`, `getRepoTree`, `listRepoFiles`, `getRepoFile`), M16
  shared `AppNav`, M5 stack flow, M6 map flow, M11 import flow components.
- External: none. No new packages.
