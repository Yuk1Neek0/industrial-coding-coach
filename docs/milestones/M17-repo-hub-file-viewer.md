# M17 — Repo Hub & Snapshot File Viewer

**State:** ✅ Complete — epic #264 done; merged to `main` via **PR #271**
(`5ceb4a9`) · **Date:** 2026-06-11

Goal: make the imported snapshots *visible* — a **Repos Hub** at `/repos`
listing what's been imported (replacing M16's redirect placeholder) and a
read-only **Snapshot File Viewer** rendering the stored file tree and
captured key-file contents — then wire the three known dead-ends into them:
the M11 import-success forward action, M5's "Key files to inspect", and M6's
Project Map file references. No schema changes, no new dependencies, zero
new network surface.

## Scope decisions

- **Spec-first UI** (AD-2). Both pages got Page Specs under `docs/design/`
  (`repos-hub-page.page-spec.md`, `snapshot-file-viewer.page-spec.md`);
  implementation followed the specs directly without a Claude Design draft
  (M12/M13 precedent).
- **`?path=` deep-link contract** (AD-3). One route
  `/repos/[owner]/[repo]/files`, file selected by query param
  (`encodeURIComponent`, repo-relative, no `?ref=`); the wiring tasks and
  the hub all emit the same builder shape.
- **Honest file states** (AD-4). The snapshot stores the full tree but
  contents only for selected key files (≤512 KiB; oversize files are
  *skipped*, never truncated — so the viewer has no truncation UI). Three
  states: captured → full contents in a plain `<pre>`; in-tree-not-captured
  → metadata + "content not captured at import" + outbound GitHub link;
  unknown path → graceful in-page state (GitHub tree-truncation is not
  persisted on the snapshot, so the copy never blames the link).
- **No data-layer expansion** (AD-1, ADR 0011). The M11 DAL already covered
  both pages; the only addition is the read-only grouped-count helper
  `countRepoFilesBySnapshot` (tested, no migration).
- **AD-5 — link only real references.** M6 debug locations are "a path or a
  named area"; the `isRepoPath` heuristic links path-like values and leaves
  named areas as text. Unknown paths are safe to link because the viewer's
  not-found state is graceful by spec.

## Stage status

| Stage | Description | Status |
|---|---|---|
| 1 | CCPM Plan — PRD `repo-hub-file-viewer.md` | Done — approved |
| 2 | CCPM Epic → Structure → Sync | Done — epic #264, tasks #265–#270 |
| 3 | Execution (3 waves of parallel sub-agents) | Done — see backlog |

## Execution backlog

| Wave | Issue | Task |
|---|---|---|
| 1 | #265 | Page Spec: Repos Hub |
| 1 | #266 | Page Spec: Snapshot File Viewer (URL contract + file states) |
| 2 | #267 | `/repos` hub over `listImportedRepos` + count helper |
| 2 | #268 | Viewer route: tree pane + file pane, three states, zero client JS |
| 3 | #269 | Import success forward action + per-key-file deep links |
| 3 | #270 | M5/M6 file references linked (full render-point inventory) |

All 6 task issues + epic #264 are closed; the epic is archived to
`.claude/epics/archived/repo-hub-file-viewer/`. Merged via **PR #271**.

## Delivered

- `apps/web/app/repos/page.tsx` (+ `loading`/`error`) — the hub: snapshot
  rows (ref badge, imported time, file/key-file counts, language, GitHub
  link) and nine per-repo area links; empty state → `/import`.
- `apps/web/app/repos/[owner]/[repo]/files/` — viewer: `page.tsx`,
  `_lib/data.ts` (one snapshot read; captured contents reused from
  `listRepoFiles` rows), `_lib/view.ts` (pure URL/selection/grouping
  helpers), `_components/tree-pane.tsx` + `file-pane.tsx` (server-rendered,
  native `<details>` groups, 500/group + 5,000/pane caps),
  `loading`/`error`/`not-found`.
- `packages/db/src/github/repos.ts` — `countRepoFilesBySnapshot` grouped
  count (+ tests; db suite 841 → 843).
- `apps/web/app/import/_components/import-flow.tsx` — "Browse the snapshot"
  primary action + key-file deep links.
- `apps/web/app/stack/.../stack-explainer-flow.tsx`,
  `apps/web/app/map/_components/{file-map-explorer,architecture-flow-viewer,
  debug-path-ui}.tsx` — file references link into the viewer.
- Two Page Specs under `docs/design/`.

## Acceptance Criteria (PRD)

- [x] `/repos` lists imported snapshots with per-repo area links; redirect
      gone; empty state per spec.
- [x] Viewer renders tree + captured contents at a stable deep-linkable URL;
      not-captured and unknown paths handled honestly; zero network.
- [x] Import success, M5 key files, and M6 file references click through.
- [x] Page Specs exist for both pages before implementation.
- [x] No new dependencies; no schema changes; `pnpm lint` / `typecheck` /
      `build` pass; db tests 843/843, web tests 45/45; CI green on PR #271.

## Retrospective

**What went well**

- **The spec wave paid for itself.** #266 surfaced two DAL facts before any
  UI code existed (contents never truncated; tree-truncation flag not
  persisted) and turned them into an "honesty contract" the implementation
  just followed — zero rework.
- **Three-wave parallelism with a fixed contract.** Fixing the `?path=` URL
  contract in the spec let the two wiring tasks run in parallel against it
  without waiting to inspect the final implementation.
- **Both-append CSS conflict was anticipated and trivial.** #268 was
  instructed to keep its `repos.css` block at the end of the file; the
  predicted cherry-pick conflict took one manual keep-both resolution.
- **Agents exercised good scope judgment.** #270 found the real M6 render
  points lived in three section components (not the file named in the task),
  expanded touch scope with justification, and reported a full
  linked-vs-left-as-text inventory; map.css had pre-staged the anchor hover
  rules since #108.

**What to watch — lessons**

- **Task files should name the components that *render*, not just the page
  flow component** — #270's touch-list said `map-flow.tsx`, but the render
  points were in its children (second occurrence of the M16 "enumerate
  consumers" lesson, now at component granularity).
- **`listImportedRepos` rows don't carry counts** — the hub spec had to
  invent the count-helper derivation; if more list pages appear, consider a
  summary view in the DAL rather than per-page helpers.
- **Mid-wave verification is cheap insurance**: running typecheck + the new
  DAL test right after #267 merged cleared its flagged risks while #268 was
  still running.

**Follow-ups**

- Apply the same linking pattern to M5 debug locations ("path or area" —
  needs the `isRepoPath` heuristic) and to M7 issue-workspace / M9 challenge
  file references.
- `?ref=` per-ref viewing (the hub is per-snapshot, area pages resolve
  latest-by-owner/repo) — deliberate M17 exclusion.
- Mermaid diagram node labels (M6) render inside SVG and stay unlinked.
- Persist `treeTruncated` (and `ImportResult.skipped`) on `repo_snapshots`
  if the unknown-path copy should ever get more specific.
