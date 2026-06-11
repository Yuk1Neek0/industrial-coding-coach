# Page Spec: Snapshot File Viewer

Issue: #266 · Epic: `repo-hub-file-viewer` (M17) · PRD: `.claude/prds/repo-hub-file-viewer.md` (US-2, US-3; FR-2, FR-4)

This spec defines the **Snapshot File Viewer** for Milestone 17 — the read-only
page that renders an imported snapshot's file tree and, for captured key files,
their contents. It closes the M11 retrospective's deferred "snapshot-view
route" and is the deep-link target the wiring tasks consume: **#269** (import
success forward action) and **#270** (M5 "Key files to inspect" + M6 Project
Map file references). The implementation task is **#268**.

> **Built directly from this spec — no Claude Design draft (epic AD-2).** Per
> the M12/M13 precedent, this page is implemented straight from the Page Spec;
> the ADR 0007 Claude Design step is deliberately skipped (recorded in the epic
> as the ADR-0007 deviation note). v0 is **not** used.

> **The URL contract is the load-bearing part of this spec (epic AD-3).** Two
> wiring tasks build links against §4 before the page ships polish. Changing
> the route or the query-param name after #269/#270 land means breaking deep
> links — any later change must update this spec *and* both wiring call sites.

> **No network, no API key, no mutation (ADR 0009, local-first).** The page
> reads only the local SQLite snapshot the M11 import produced
> (`repo_snapshots.fileTree` + `repo_files`). Opening the URL with
> `GITHUB_TOKEN` unset must succeed. Nothing on this page writes anything.

> **Honest "not captured" state (epic AD-4).** The snapshot stores the *full*
> tree but contents only for selected **key files**. Most files in a real repo
> are therefore browsable as tree entries but have no stored content. The
> viewer says so plainly — it never pretends to have a file, and it names
> exactly what *is* captured (§6c-ii).

The page shares layout, tokens, and tone with the repos feature pages (M7
issues, M9 challenges) via `apps/web/app/repos/repos.css` and the shared
`AppNav`, so the whole app reads as one product.

---

## 1. Page name

**Snapshot File Viewer** — a read-only, per-repo page at
`/repos/[owner]/[repo]/files` with two panes over one local snapshot: a
**tree pane** (the full file tree captured at import, grouped by top-level
directory) and a **file pane** (the selected file — captured contents, an
honest not-captured state, or a graceful unknown-path state). A query param
(`?path=`) selects the file, so every file in the snapshot has a stable,
shareable URL.

## 2. User goal

> "I imported my repo. Show me what the snapshot actually holds — the whole
> file tree, and the real contents of the key files the coach reads — so I can
> ground the coach's explanations in my actual code. When the Stack Explainer
> or the Project Map names a file, let me click through and land on it."

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, 0–1 years, one or two AI-built portfolio projects she cannot
confidently defend. The coach keeps citing files (`package.json`,
`next.config.mjs`, `src/app/page.tsx`); until M17 those citations were dead
monospace text.

Design implications:

- **Seeing is trust.** The viewer is the proof that the import did what it
  said: here is the tree, here are the captured contents. It makes the
  local-first model tangible.
- **Honesty over completeness.** Mia must never wonder "is the viewer broken
  or is the file just not here?" — the not-captured state explains *why* the
  content is absent and what the import does capture (§6c-ii).
- **Reading, not editing.** A calm, plain monospace reading surface — no
  syntax highlighting, no editor affordances, nothing that suggests the file
  can change here (PRD Out of Scope).
- **Deep links must not strand her.** A stale link from an older analysis to a
  path that no longer exists in the tree lands on a calm in-page state with a
  way back — never a 500, never a dead end (§6c-iii).

## 4. Route + URL contract

Next.js App Router (`apps/web`), React Server Components only — the tree uses
native `<details>/<summary>` disclosure and selection is plain links, so the
page is expected to ship with **zero client components**.

| Route | Purpose | File |
|---|---|---|
| `/repos/[owner]/[repo]/files` | Snapshot file viewer for one imported repo | `apps/web/app/repos/[owner]/[repo]/files/page.tsx` |

A route-level **`loading.tsx`**, **`error.tsx`**, and **`not-found.tsx`**
accompany the page, following the sibling repos routes
(`/repos/[owner]/[repo]/issues`, `/repos/[owner]/[repo]/challenges`).

### 4a. The deep-link contract (epic AD-3) — fixed by this spec

**One route, file addressed by query param.** This is the contract #268
implements and #269/#270 link against:

```
/repos/[owner]/[repo]/files                 → default state (no file selected, §6c-iv)
/repos/[owner]/[repo]/files?path=<path>     → the file at <path> selected
```

- **`path` is the repo-relative path** of a tree entry, forward-slash
  separated, exactly as stored in `repo_snapshots.fileTree[].path` and
  `repo_files.path` — e.g. `apps/web/package.json`. No leading `/`, no
  leading `./`.
- **Link builders encode the whole value** with `encodeURIComponent(path)`
  (or `URLSearchParams`), so `#`, `?`, `&`, spaces, and non-ASCII path
  segments survive. Encoded or literal `/` inside the query value are both
  acceptable and equivalent — Next.js hands the page a decoded
  `searchParams.path` either way.
- **Matching is exact and case-sensitive** against the snapshot's stored
  paths. The page applies only light normalization before lookup: trim
  whitespace, strip a leading `/` or `./`. It never fuzzy-matches,
  case-folds, or guesses.
- **The lookup runs against the full stored tree**, not the rendered subset —
  a deep link to an entry beyond the tree pane's render cap (§6b) still
  resolves and displays.
- Repeated or array-valued `path` params: only the first value is used.
- An empty or whitespace-only `path` is treated as no selection (default
  state), not an error.

**Why query param, not a catch-all segment (AD-3).** A
`[...path]` segment scheme forces per-segment encoding/decoding, fights with
paths containing characters Next treats specially, and multiplies the route
surface. One page + one query param keeps deep-link construction a one-liner
for #269/#270 and the not-found semantics unambiguous (the *route* is found;
the *selection* may not be). This spec keeps the epic's AD-3 default — no
override.

**Ref handling.** `[owner]`/`[repo]` are the snapshot identity; the page reads
the **current snapshot** for that repo — the most recently imported row across
any ref, exactly what `getImportedRepo(owner, repo)` returns with `ref`
omitted — matching the M6/M7/M10/M12/M13 per-repo page convention. A `?ref=`
disambiguator is deliberately **not** part of the M17 contract (§15); the
wiring tasks must not emit one. The header's ref badge (§6a) shows which ref
the displayed snapshot was imported at.

**Consumers of this contract:**

| Consumer | Link |
|---|---|
| #269 — import success forward action (`apps/web/app/import/_components/import-flow.tsx`) | `/repos/{owner}/{repo}/files` (and optionally `?path=` per captured file) |
| #270 — M5 "Key files to inspect" (`stack-explainer-flow.tsx`) | `/repos/{owner}/{repo}/files?path=<file>` |
| #270 — M6 Project Map file references (`map-flow.tsx`) | `/repos/{owner}/{repo}/files?path=<file>` |
| #265/#267 — Repos Hub row "Files" area link | `/repos/{owner}/{repo}/files` |

Per epic AD-5, #270 links only same-snapshot references and degrades paths
missing from the tree to plain text at the source; this page's in-page
unknown-path state (§6c-iii) backstops any link that goes stale anyway.

## 5. Data source / contract

The page is a **thin server-side view** over the existing M11 typed
data-access layer (`packages/db/src/github/repos.ts`) — no client fetching, no
API route, **no new DAL functions and no schema changes expected** (epic AD-1,
ADR 0011). Server Components call the data layer directly (ADR 0006). All
reads are local SQLite; `importRepository` is the only network path in that
module and this page never calls it.

```ts
// Snapshot identity + the full tree. fileTree rides on the snapshot row —
// getRepoTree(owner, repo) is a convenience over the same row, so the page
// makes ONE snapshot read, not two. null → repo not imported (§11).
getImportedRepo(owner: string, repo: string, ref?: string): Promise<RepoSnapshot | null>
getRepoTree(owner: string, repo: string, ref?: string): Promise<RepoTreeEntry[] | null>

// The captured key files for the snapshot, ordered by path. Drives the
// captured-path set + category badges in the tree pane and the default
// state's quick links. NOTE: rows include full `content`; #268 may either
// reuse these rows for the selected file or call getRepoFile — this spec
// fixes behavior, not the query plan.
listRepoFiles(owner: string, repo: string, ref?: string): Promise<RepoFile[]>

// The selected file's stored content (captured key files only).
// null → no repo_files row for that path.
getRepoFile(owner: string, repo: string, filePath: string, ref?: string): Promise<RepoFile | null>
```

### `RepoTreeEntry` — one tree entry (`repo_snapshots.fileTree`, `packages/db/src/schema.ts`)

| Field | Type | Used by |
|---|---|---|
| `path` | `string` | repo-relative path — the §4a join key, tree row text |
| `type` | `'blob' \| 'tree'` | `blob` = file (selectable), `tree` = directory (grouping only) |
| `size` | `number?` | bytes; **present for blobs only** — shown in tree rows and the not-captured pane |
| `sha` | `string` | git object SHA — short form shown in the file pane metadata |

The tree is stored in repo order (GitHub's recursive-tree order). Submodule
(`commit`) entries were filtered out at import; the snapshot models only files
and directories.

### `RepoFile` — one captured key file (`repo_files`)

| Field | Type | Used by |
|---|---|---|
| `path` | `string` | join key against the tree; file pane heading |
| `sha` | `string` | git blob SHA — short form in the metadata line |
| `size` | `number` | bytes as reported by GitHub — metadata line |
| `content` | `string` | the file's full text — the `<pre>` body (§6c-i) |
| `category` | `string` (a `KeyFileCategory`) | category badge in the tree and file pane |

### What gets captured — the honesty contract (epic AD-4)

Key-file selection (`packages/db/src/github/key-files.ts`,
`selectKeyFiles`/`classifyKeyFile`) captures content for **exactly** these
categories — this list is what the not-captured state (§6c-ii) names:

| `KeyFileCategory` | What it matches | Plain-language label |
|---|---|---|
| `package-manifest` | `package.json` anywhere | Package manifest |
| `lockfile` | `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `npm-shrinkwrap.json`, `bun.lock`/`bun.lockb` | Lockfile |
| `build-config` | `turbo.json`, `tsconfig*.json`, `pnpm-workspace.yaml`, `vercel.json`, Dockerfiles, and `*.config.*` for next/vite/vitest/tailwind/eslint/prisma/drizzle/… | Build / framework config |
| `readme` | READMEs at the repo root or a package root (≤ 3 path segments, outside docs/examples/tests-style noise dirs) | README |
| `ci-workflow` | any YAML directly under `.github/workflows/` | CI workflow |
| `ccpm-prd` / `ccpm-epic` / `ccpm-task` | `.claude/prds/*.md`, `.claude/epics/[archived/]*/epic.md`, `.claude/epics/[archived/]*/N.md` | CCPM artifact |

Three honesty facts the copy in §6c depends on:

1. **Capture is all-or-nothing — stored contents are never truncated.** A
   selected key file larger than `MAX_KEY_FILE_BYTES` (**512 KiB**) is
   *skipped entirely* at selection (never fetched, never stored partially), so
   any `repo_files.content` the viewer renders is the complete file. The
   viewer needs no "content truncated" UI for captured files.
2. **"Captured" is defined by row presence, nothing else.** The viewer treats
   a path as captured **iff a `repo_files` row exists for it** in this
   snapshot. A file that matched a category but was skipped (oversize, or it
   vanished between the tree and contents calls — `ImportResult.skipped` is
   not persisted) simply has no row and gets the §6c-ii state like any other
   non-captured file.
3. **The tree itself may be incomplete — and the viewer can't know.** GitHub
   truncates the recursive tree for very large repos; the import surfaces
   `treeTruncated` at import time but **does not persist it** on
   `repo_snapshots`. The unknown-path copy (§6c-iii) therefore says "not in
   this snapshot's tree", lists tree truncation as one possible reason, and
   never accuses the link or the user of being wrong.

## 6. Page sections

For an imported repo, top to bottom: header (§6a), then the two panes — tree
(§6b) and file (§6c) — side by side on wide viewports (tree pane a fixed-width
left column, file pane flexible), stacked tree-above-file on narrow viewports.
DOM order is header → tree → file in both layouts. The page sits in the
repos-feature chrome: `.screen` wrapper, shared `AppNav` with
`active="repos"`, `.page` container. The two-pane body may use a wider
container than `.container-narrow` (880px is tight for code); any new layout
classes are added to `repos.css` following its conventions (m17-prefixed
keyframes if any).

### 6a. Page header

- **Back link** — "← All repos" to `/repos` (the M17 hub, #265/#267).
- **Eyebrow** — `Snapshot files · M17` in the `.page-eyebrow` convention.
- **`{owner}/{repo}`** as the `<h1>` (`.page-title`), with:
  - the imported **`ref`** as a monospace badge (`.badge.badge-mono`), plus
    the short `commitSha` (first 7 chars) as a quieter second badge — together
    they say exactly what was snapshotted;
  - a **"View on GitHub →"** external link to `snapshot.htmlUrl`
    (`rel="noopener noreferrer"`, new tab) — read-only per ADR 0009.
- **Meta line** — imported time ("Imported {date}", from
  `snapshot.importedAt`) and the counts: "{N} files · {M} directories · {K}
  captured key files" (blob count, tree count, `repoFiles.length`).
- A one-line honesty note (real text, not icon-only): "Read-only local
  snapshot — contents are stored for key files only; nothing here touches the
  network."

### 6b. Tree pane — the full snapshot tree

Renders **every** entry of `snapshot.fileTree` (up to the §caps below),
grouped by **top-level directory** — simple grouping, no tree library, no
virtualization, no client JS:

- **Root-level files first** — blobs whose path has no `/` render as a plain
  list at the top of the pane (always visible, not collapsible). This is where
  `package.json`, the root README, and lockfiles live — the files Mia most
  needs to find.
- **One `<details>` group per top-level directory**, labelled by a
  `<summary>` showing the directory name + its entry count (e.g.
  `apps/ · 142 files`). Nested paths inside a group render as a flat,
  indented, path-sorted list of their **full remaining path** (e.g.
  `web/package.json` inside the `apps/` group) — no recursive nesting in M17.
  `tree`-type entries inside a group are not separately listed; directories
  exist in the UI as the groups themselves and as path prefixes.
- **Default open/closed:** all groups collapsed, except the group containing
  the selected `?path` (open, so the selected file is visible on load). With
  no selection, all groups start collapsed; the root-level file list still
  gives the page visible content.
- **Every blob entry is a link** to
  `/repos/[owner]/[repo]/files?path=<encoded path>` (§4a) — one tab stop per
  entry. The selected entry is visually marked and carries
  `aria-current="true"`.
- **Captured key files are visually distinguished**: monospace path in the
  normal foreground, a small category badge (`.badge-soft`, text from the §5
  plain-language labels — e.g. "manifest", "lockfile", "config", "README",
  "CI", "CCPM"). The badge is the affordance that says "this one has
  contents".
- **Non-captured entries are shown but muted** (`--fg-muted`/`--fg-subtle`
  foreground, no badge) — still links (their §6c-ii state is informative),
  but visually secondary so the captured files pop.
- Each blob row shows its `size` (human-readable, e.g. "4.2 KB") in quiet
  monospace; entries without a size show nothing.

**Caps for huge trees** (trees can be thousands of entries; GitHub's recursive
tree can reach ~100k):

- **Per-group cap: 500 entries.** A group with more shows its first 500 (tree
  order) and a muted terminal line: "… {N} more entries not shown."
- **Whole-pane cap: 5,000 rendered entries** (root list + all groups
  combined, counted before collapsing). Beyond it, remaining groups render as
  summary-only rows ("{dir}/ · {count} files — not listed") and a banner above
  the pane states: "Large tree: listing {5,000} of {N} entries."
- Both caps affect **rendering only** — deep links resolve against the full
  stored tree (§4a), so a `?path` pointing at an unlisted entry still opens in
  the file pane.

### 6c. File pane — one of four states

The pane renders exactly one of the following, decided server-side:

#### 6c-i. Captured key file (`?path` matches a tree blob **and** a `repo_files` row)

- **Heading** — the full repo-relative path (monospace, `<h2>`), with the
  category badge.
- **Metadata line** — size ("4,213 bytes · 4.2 KB" — exact + human form),
  short blob `sha`, and the snapshot's imported date. Because capture is
  all-or-nothing (§5), the pane may state plainly: "Complete file as captured
  at import." No truncation UI exists for captured files.
- **Contents** — the full `content` in a single plain `<pre>` block:
  monospace (`--font-mono`), preserved whitespace, **no syntax highlighting,
  no line numbers, no new dependencies**. Long lines scroll horizontally
  within the block (`overflow-x: auto`) rather than wrapping by default; the
  block scrolls vertically with the page (no inner max-height required). The
  scrollable block is keyboard-focusable (§13).
- Read-only: no copy-to-clipboard button required in M17 (native selection
  works), no edit affordances ever.

#### 6c-ii. In the tree but not captured (`?path` matches a tree blob, no `repo_files` row) — epic AD-4

The honest common case. A calm panel — **not** styled as an error:

- **Heading** — the full repo-relative path (monospace, `<h2>`).
- **Metadata** from the tree entry: size (when present), short `sha`, type
  ("file").
- **Status line** — "**Content not captured at import.**"
- **Explanation** (real text, naming the §5 categories): "The import stores
  the full file tree, but file *contents* only for key files: package
  manifests (`package.json`), lockfiles, build and framework config, READMEs
  (root and package-level), CI workflows, and CCPM artifacts under
  `.claude/`. Files over 512 KiB are skipped even when they match. This file
  isn't one of those, so the snapshot has its tree entry but not its text."
- A quiet pointer to the source: "You can read it on GitHub" linking to
  `{htmlUrl}/blob/{ref}/{path}` (`rel="noopener noreferrer"`, new tab,
  read-only per ADR 0009). No re-import nudge — re-importing would not
  capture it (selection is by category, not user choice), and the copy must
  not imply otherwise.

#### 6c-iii. Path not in the tree (`?path` set, no tree entry matches)

A graceful **in-page** state — HTTP 200, **not** a route-level `notFound()`,
never a 500. The header and tree pane render normally; the file pane shows:

- **Heading** — "Not in this snapshot's tree", with the requested path echoed
  in monospace below it.
- **Explanation** — plain, non-accusatory: "This snapshot (imported {date} at
  {short sha}) has no entry at this path. The file may have been added,
  moved, or renamed since the import; the link may come from an older
  analysis; or — for very large repositories — GitHub may have truncated the
  tree at import time." (§5 honesty fact 3.)
- **Actions** — "Browse the tree" (link to the base
  `/repos/[owner]/[repo]/files` URL, clearing the selection) and "Re-import
  to refresh" (link to `/import`).

A `?path` that matches a **`tree` (directory) entry** is a near-miss variant
of this state: same pane, heading "That's a directory", one line — "`{path}/`
is a directory in this snapshot. Pick a file inside it from the tree." — with
the matching group rendered open in the tree pane.

#### 6c-iv. Default state (no `?path`) — snapshot summary

- **Heading** — "Pick a file" (`<h2>`), one line: "Select any file from the
  tree. Files with a badge were captured at import and open with their full
  contents."
- **Snapshot summary card** — `description` (when present),
  `primaryLanguage` (when present), default branch, the counts from §6a, and
  the imported date.
- **Captured key files quick list** — the `repoFiles` rows (already loaded)
  as a compact list of links (path + category badge), ordered by path, capped
  at the first 30 with a "… {N} more — find them by badge in the tree" line.
  This is the fastest route into 6c-i and the natural landing experience for
  #269's success-page link.

## 7. Input fields

**None.** No search, no filter, no sort in M17 (§15). The only interactive
elements are links and the native `<details>` disclosures.

## 8. Primary actions

- **Select a file** — click a tree entry / quick-list entry → same route with
  `?path=` (§4a). The only forward action; plain `<Link>` navigation.
- **Expand / collapse a directory group** — native `<details>` toggle;
  no JS, no persistence of open state across navigations beyond the
  selected-group rule (§6b).
- **Back to the hub** — "← All repos" → `/repos`.
- **View on GitHub** — header external link (and the §6c-ii per-file external
  link). Read-only per ADR 0009.
- **Not-found-state actions** — "Browse the tree" (clears selection),
  "Re-import to refresh" → `/import` (§6c-iii).

No mutations, no Server Actions, no write surface of any kind.

## 9. Loading state

`app/repos/[owner]/[repo]/files/loading.tsx` renders a skeleton via the
repos-feature `.skel` convention: header bar (title + badge silhouettes), a
tree-pane column of ~10 row placeholders, and a file-pane block placeholder.
Reads are local SQLite so the state is brief, but it must exist so the page
never flashes empty. Skeletons are `aria-hidden`; the region carries
`aria-busy="true"` (§13).

## 10. Empty states

Calm resting states, never errors:

- **No captured key files** (`listRepoFiles` returns `[]` but the snapshot
  exists) — the tree renders normally (all entries muted, no badges); the
  default pane replaces the quick list with: "No key files were captured for
  this snapshot — the tree below is still fully browsable." The §6c-ii state
  still works for every entry.
- **Empty tree** (`fileTree` is `[]`) — the tree pane shows an `.empty-state`
  block: "This snapshot's tree is empty." with a "Re-import to refresh" link
  to `/import`. The header still renders.
- A collapsed group is not an empty state; a group with zero blobs simply
  doesn't render.

## 11. Error states

- **Repo not imported** — `getImportedRepo(owner, repo)` returns `null`:
  call `notFound()` and render
  `app/repos/[owner]/[repo]/files/not-found.tsx`, matching the sibling
  issues/challenges not-found pages: repos chrome, heading "Repo not
  imported", a line explaining a snapshot is needed first, and an "Import
  this repository" button to `/import`. This is the **only** `notFound()` on
  this route.
- **Unknown `?path`** — **not** an error and **not** `notFound()`: the
  in-page §6c-iii state. A stale deep link must land on a useful page, not a
  404 that hides the (perfectly valid) repo.
- **Load failure** (data layer throws — unexpected) —
  `app/repos/[owner]/[repo]/files/error.tsx` renders the repos-feature error
  card: "Couldn't load this snapshot", a short explanation, a "Try again"
  button (`reset()`). No raw stack traces, no DB errors.

`not-found` (expected: unimported repo), `unknown path` (expected: in-page),
and `load failure` (unexpected: boundary) are deliberately three distinct
states with distinct copy.

## 12. Success state

- The header shows the snapshot identity (owner/repo, ref + short SHA,
  imported time, counts) and the tree pane lists the full tree (within §6b
  caps), captured files badged and prominent, non-captured entries muted.
- Each of the four file-pane states (§6c-i–iv) renders per its definition;
  every `?path` value — captured, not captured, directory, unknown, absent —
  produces a coherent 200 page.
- A captured key file's complete contents are readable at a stable URL — the
  PRD's "readable in the browser at a stable URL" success criterion — and
  that URL round-trips: copying the address bar reproduces the exact view.
- Success is implicit (content shown); no toasts, no confirmation banners.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (`{owner}/{repo}`); the file pane
  heading is `<h2>`; tree-group summaries are not headings. Content in
  `<main>`; the tree pane is a `<nav aria-label="Snapshot file tree">` (it is
  navigation within the snapshot); the file pane a `<section>`. The root file
  list and each group's entry list are real `<ul>/<li>` markup.
- **Disclosures.** Native `<details>/<summary>` gives keyboard and
  screen-reader semantics for free; summaries include the entry count as real
  text ("apps — 142 files").
- **Tree links.** One tab stop per entry; the accessible name combines path +
  captured state (e.g. "apps/web/package.json — captured, package manifest" /
  "src/index.ts — content not captured"), so capture status is announced, not
  color-only. The selected entry carries `aria-current="true"` and a visible
  marker beyond color.
- **Muted ≠ invisible.** Non-captured entries' muted foreground keeps WCAG
  2.1 AA contrast in both themes (`next-themes`); the captured distinction is
  carried by the badge **text**, never opacity alone.
- **The `<pre>` block.** Horizontally scrollable code is keyboard-reachable:
  `tabindex="0"`, `role="region"`, `aria-label` naming the file path. No
  content conveyed by color (there is no highlighting).
- **External links** (`View on GitHub`, §6c-ii) use
  `rel="noopener noreferrer"` and an accessible hint that they open
  externally.
- **States announced.** The not-captured line, the unknown-path heading, and
  the cap banners are real document text, announced on navigation — never
  icon- or color-only.
- **Keyboard.** Full operability in logical order: back link → header links →
  tree (summaries + entries) → file pane actions. Enter/Space activate;
  visible focus ring (`--ring`).
- **Loading.** Skeletons `aria-hidden`; loading region `aria-busy="true"`.

## 14. Acceptance criteria

- [ ] `/repos/[owner]/[repo]/files` renders server-side from the existing M11
      DAL (`getImportedRepo`/`getRepoTree`, `listRepoFiles`, `getRepoFile`) —
      no client fetch, no API route, no new DAL functions, no schema changes
      (epic AD-1, ADR 0006, ADR 0011), and **zero network calls** at view
      time (ADR 0009): viewing works with `GITHUB_TOKEN` unset.
- [ ] **URL contract (§4a, epic AD-3):** `?path=<repo-relative path>` selects
      a file; values are built with `encodeURIComponent`; matching is exact +
      case-sensitive after trimming and stripping a leading `/`/`./`; lookup
      runs against the **full** stored tree, not the rendered subset; empty
      `path` = no selection. The contract is consumed as-is by #269/#270.
- [ ] **Captured file (§6c-i):** full `content` in a plain monospace `<pre>`
      — no syntax highlighting, no line numbers, **no new dependencies**;
      metadata shows exact + human-readable size and short SHA; copy reflects
      that captured contents are complete (512 KiB oversize files are skipped
      at import, never truncated).
- [ ] **Not captured (§6c-ii, epic AD-4):** tree metadata + the explicit
      "Content not captured at import." state, naming the captured
      categories (manifests, lockfiles, build/framework config, root and
      package READMEs, CI workflows, CCPM artifacts; 512 KiB cap) — never an
      error style, never a re-import promise it can't keep.
- [ ] **Unknown path (§6c-iii):** an in-page state (HTTP 200) with the
      requested path echoed, honest possible reasons (file moved since
      import, stale link, possible tree truncation at import), and "Browse
      the tree" + "Re-import" actions. **No 500, no route-level
      `notFound()`** for a bad `?path`. Directory paths get the "that's a
      directory" variant.
- [ ] **Default state (§6c-iv):** snapshot summary + "pick a file" prompt +
      captured-key-file quick links (first 30).
- [ ] **Tree pane (§6b):** root-level files listed first; one native
      `<details>` group per top-level directory with entry counts; selected
      file's group open on load; per-group cap **500** entries and whole-pane
      cap **5,000** with honest "… N more" / "Large tree" copy; **no tree
      library, no virtualization, no client JS**. Captured entries badged and
      prominent; non-captured entries muted but clickable; blob sizes shown.
- [ ] **Header (§6a):** `{owner}/{repo}` `<h1>`, ref badge + short commit
      SHA, imported time, file/directory/captured counts, "← All repos" back
      link to `/repos`, "View on GitHub" external link, read-only honesty
      note.
- [ ] **Chrome & conventions:** shared `AppNav` with `active="repos"`
      (`apps/web/app/_components/app-nav.tsx`), repos-feature styling
      (`repos.css` `.screen`/`.page`/badge/skeleton conventions; additions
      follow its token style), and route-level `loading.tsx` / `error.tsx` /
      `not-found.tsx` matching the sibling issues/challenges routes; unknown
      owner/repo → the "Repo not imported" not-found page with an Import
      link.
- [ ] **Empty states (§10):** zero captured files and an empty tree are calm,
      distinct resting states.
- [ ] **Read-only:** no Server Actions, no mutations; external GitHub links
      are `rel="noopener noreferrer"` (ADR 0009).
- [ ] Accessibility notes in §13 satisfied (one `<h1>`, nav/section
      landmarks, list markup, native disclosures, announced capture state,
      `aria-current` selection, focusable `<pre>` region, AA contrast for
      muted entries, keyboard order).
- [ ] **AD-2 noted:** built directly from this spec — no Claude Design draft
      (M12/M13 precedent); v0 not used.

## 15. What this page does *not* do

Intentional exclusions, to bound #268 and prevent drift:

- **No editing, no writing** — to disk, the DB, or GitHub (PRD Out of Scope).
- **No syntax highlighting, line numbers, code search, blame, or diffs** —
  no new dependencies; the M8 diff view owns diffs.
- **No `?ref=` selection in M17.** The page reads the current (most recently
  imported) snapshot per the established per-repo convention; multi-ref
  disambiguation is a future follow-up and the wiring tasks must not emit a
  ref param. The ref badge keeps the page honest about which snapshot is
  shown.
- **No recursive nested tree UI, no tree library, no virtualization** — one
  level of top-level-directory grouping with flat lists inside (§6b).
- **No live GitHub browsing or fetch-on-demand for non-captured files** —
  the not-captured state links *out* to GitHub; it never fetches content
  itself (ADR 0009, local-first).
- **No search/filter/sort inputs** — links and native disclosures only.
- **No capture-policy changes** — which files get content is M11's key-file
  selection, unchanged by this epic (PRD Out of Scope).
- **No M7 issue / M9 challenge file-reference wiring** — M17 wires import
  success + M5 + M6 only (#269/#270); other surfaces are a future content
  pass.
