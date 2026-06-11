# Page Spec: Repos Hub

Issue: #265 · Epic: `repo-hub-file-viewer` (M17) · PRD:
`.claude/prds/repo-hub-file-viewer.md` (US-1; FR-1, FR-4)

This spec defines the **Repos Hub** for Milestone 17 — the real `/repos` index
that replaces M16's redirect-to-import placeholder. The implementation task
**#267** builds **directly from this spec** — there is no Claude Design draft
for this page (epic **AD-2**, following the M12/M13 precedent; the ADR 0007
deviation is recorded in the epic). v0 is **not** used.

The page shares layout, components, and tone with the shipped surfaces
(Catalog, Registry, Recommendation, Stack, Project Map, Issue Learning
Workspace, Diff Review, Challenge, Portfolio, Delivery, Observability) so the
whole app reads as one product.

> **Replaces a redirect, not a page.** `apps/web/app/repos/page.tsx` currently
> contains only `redirect("/import")` — the scoped follow-up the M16 epic named.
> This page deletes that redirect and gives the nav's "Repos" entry a real
> destination. Nothing else about the `/repos/[owner]/[repo]/*` sub-routes
> changes.

> **Local-first, read-only (ADR 0009).** The hub reads the local SQLite catalog
> only — `listImportedRepos` over `repo_snapshots` plus a key-file count over
> `repo_files`. No GitHub call, no `GITHUB_TOKEN`, no `ANTHROPIC_API_KEY`, no
> network at view time. There are no Server Actions and no mutations on this
> page.

---

## 1. Page name

**Repos Hub** — a single-route Server Component page at `/repos` listing every
imported repository snapshot, newest import first. Each row shows the
snapshot's identity (`owner/repo`, ref, imported time, file count, key-file
count) and links into the repo's nine coaching areas — Files, Issues,
Challenges, Stack, Map, Reviews, Portfolio, Delivery, Observability — so the
learner can jump into any repo's coaching from one place (US-1). It is also the
landing point for the import-success forward action wired by task #269.

## 2. User goal

> "I've imported one or more repositories. Show me what I've imported — and let
> me jump straight into any repo's files, issues, challenges, stack
> explanation, map, reviews, portfolio, delivery map, or observability page —
> without remembering nine different URLs."

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, 0–1 years, one or two AI-built portfolio projects she cannot
confidently defend. She has imported a repo (maybe two) and worked through some
coaching areas; today the only proof an import exists is that other features
can use it.

Design implications:

- **The hub is an index, not a dashboard.** One calm row per snapshot with its
  identity and its doors. No scores, no rollups, no charts — those live on the
  per-area pages.
- **Per-repo thinking.** Mia thinks in projects. Rows are grouped visually by
  identity (`owner/repo` is the row's primary text); the nine area links are
  the row's whole purpose.
- **The empty state is the first-run experience.** A new user lands here from
  the nav before importing anything; "No repositories imported yet" with a
  clear "Import a repository" action must read as the start of the journey,
  never as an error.
- **No accounts, no setup.** The page is the same for everyone and reads only
  the local snapshot catalog.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Component for the whole page —
no Client Component islands are needed (no inputs, no interactivity beyond
links).

| Route | Purpose | File |
|---|---|---|
| `/repos` | The Repos Hub — index of imported snapshots | `apps/web/app/repos/page.tsx` (replaces the M16 redirect) |

- The page reads local SQLite per request — declare
  `export const dynamic = "force-dynamic"`, matching the sibling repos pages
  and the M8 reviews chooser.
- A route-level **`loading.tsx`** and **`error.tsx`** are added at
  `apps/web/app/repos/` (see §9, §11), following the conventions of the
  existing `repos/[owner]/[repo]/issues/` pair. There is **no `not-found.tsx`**
  — the route has no dynamic segment, and an empty catalog is the §10 empty
  state, not a 404.
- The existing `apps/web/app/repos/layout.tsx` (IBM Plex Sans/Mono via
  `next/font` CSS variables, `repos.css` import) already wraps this route —
  the page adds **no** layout or font work.
- **No `/repos/[owner]/[repo]` index route exists** and this epic does not add
  one — rows link only to the nine area routes in §6b, never to the bare
  `owner/repo` segment.

## 5. Data source / contract

The page is a **thin server-side view** over the M11 typed data-access layer
(`packages/db/src/github/repos.ts`) — no client-side fetching, no API route;
Server Components call the data layer directly (ADR 0006).

```ts
// M11 (Issue #40) — the hub's single list read. Returns every imported
// snapshot, ordered by importedAt descending (newest import first); [] when
// nothing has been imported. Local SQLite only — never the network.
listImportedRepos(db?: CatalogDb): Promise<RepoSnapshot[]>
```

### `RepoSnapshot` — the row shape (schema `repo_snapshots`)

The exact TypeScript lives in `packages/db/src/schema.ts`
(`RepoSnapshot = typeof repoSnapshots.$inferSelect`); the merged code is
authoritative on field names, but the fields this page uses are fixed below.
One row per `owner/repo` + `ref` (re-importing the same repo/ref updates the
row in place, so the hub never shows duplicate rows for one ref).

| Field | Type | Used by |
|---|---|---|
| `id` | `number` | React key; join key for the key-file count |
| `owner` | `string` | row identity; area-link hrefs |
| `repo` | `string` | row identity; area-link hrefs |
| `ref` | `string` | §6a ref badge (e.g. `main`) |
| `importedAt` | `Date` | §6a "imported 3 hours ago" (`relTime`) |
| `fileTree` | `RepoTreeEntry[]` | §6a file count — **derived**, see below |
| `description` | `string \| null` | §6a optional quiet one-liner |
| `primaryLanguage` | `string \| null` | §6a optional quiet meta chip |
| `htmlUrl` | `string` | §6a optional "View on GitHub" external link |
| `commitSha`, `defaultBranch`, `isPrivate`, `createdAt`, `updatedAt` | — | not rendered on this page |

### Derived counts — the only computation on this page

- **File count** — `fileTree.filter((e) => e.type === "blob").length`: the
  number of *files* in the snapshot's tree (directories — `type: "tree"` —
  are not counted). Rendered as "{n} files".
- **Key-file count** — the number of `repo_files` rows whose `snapshotId`
  matches the row's `id`: how many files had their *contents* captured at
  import. Rendered as "{n} key files captured". The M11 DAL has no count
  read; per epic **AD-1** the implementation adds a **small read-only count
  helper** (e.g. one grouped `count(*) … GROUP BY snapshot_id` over
  `repo_files`, returning a `Map<number, number>` — exact name/shape is the
  implementation's call, **no migration**). Calling `listRepoFiles` per row
  merely to `.length` it loads every captured file's full contents and is
  not acceptable as the shipped approach. A snapshot with no `repo_files`
  rows renders "0 key files captured" — a quiet fact, not an error.

> **Why both counts.** The pair teaches the snapshot model at a glance: the
> tree knows about *every* file, but only the key files' contents were
> captured — which is exactly the "content not captured at import" honesty the
> File Viewer (#266, epic AD-4) renders per file.

Ordering is fixed by the DAL: `importedAt` descending (most recently imported
or refreshed first). The page renders that order and adds no sort UI.

## 6. Page sections

Top to bottom, single readable column (`.page` > `.container-narrow`):

1. **App nav** — the shared `AppNav` (`apps/web/app/_components/app-nav.tsx`,
   re-exported by `apps/web/app/repos/_components/chrome.tsx`) with
   `active="repos"` (FR-4). The nav's "Repos" entry now lands here instead of
   redirecting.
2. **Page header** — `.page-eyebrow` ("Repo hub · M17", with the `.dot`), an
   `<h1 class="page-title">` **"Repos"**, and a `.page-subtitle`: "Every
   repository you've imported — jump into its files, issues, challenges, and
   coaching areas from here." On the header's action side, the **persistent
   import affordance**: an "Import a repository" link (`.btn`) to `/import`,
   present whether or not the list is empty — importing (and re-importing to
   refresh) always stays one click away.
3. **Count line** — a small muted line, e.g. "3 imported snapshots" (singular
   "1 imported snapshot"). Omitted in the empty state.
4. **Repo list** — one row per `RepoSnapshot`, §6a.
5. **Empty state** — replaces the count line and list when `listImportedRepos`
   returns `[]`, §10.

### 6a. Repo row

The list is a `<ul>` (one `<li>` per snapshot). Because each row carries nine
area links, the row is **not** a single row-as-link (unlike the M8 reviews
chooser) — it is a card-style row with an identity block and a links strip.
Reuse the established imported-repo row look: the `.repo-list` / `.repo-row`
conventions the Stack, Map, and Reviews choosers already render
(`stack.css` / `map.css` / `reviews.css` §"repo list") — for this page the
equivalent rules are **added to `repos.css`** (small additive CSS only; same
tokens, radii, and hover treatment; no new design system, §"Styling" below).

Each row shows:

- **Identity line** — `{owner}/{repo}` as the row's primary text (strong, not
  a heading — see §13), with the imported **`ref` as a badge** (the chrome's
  `Badge` with `soft` + `mono`, e.g. `main`).
- **Meta line** — small muted facts, in order:
  - "imported {relTime(importedAt)}" (the chrome's `relTime` helper, mono
    treatment — e.g. "imported 3 hours ago"),
  - "{fileCount} files",
  - "{keyFileCount} key files captured",
  - optionally, `primaryLanguage` as a quiet chip when present.
- **Description** *(optional)* — `description`, one line, truncated with
  ellipsis, muted; omitted when `null`. A quiet "View on GitHub" external link
  (`htmlUrl`, `rel="noopener noreferrer"`, new tab) may sit beside it —
  read-only per ADR 0009.
- **Area links strip** — the row's purpose: nine links, §6b. On wide screens
  the strip sits on the row's lower edge as a wrapping chip row; on narrow
  screens it wraps to multiple lines. Every link is always shown — the hub
  does not predict which areas have content (each area page owns its own
  empty state).

### 6b. Per-repo area links — the exact hrefs

The nine links per row, in this order, with these exact hrefs (`{owner}` /
`{repo}` are the row's values):

| Label | Href | Target |
|---|---|---|
| Files | `/repos/{owner}/{repo}/files` | Snapshot File Viewer — **new in this epic** (spec #266, implementation #268; deep links via `?path=` per epic AD-3) |
| Issues | `/repos/{owner}/{repo}/issues` | Per-repo Issues List (M7) |
| Challenges | `/repos/{owner}/{repo}/challenges` | Challenge list (M9) |
| Stack | `/stack/{owner}/{repo}` | Stack Decision Explainer (M5) |
| Map | `/map/{owner}/{repo}` | Project Logic Map (M6) |
| Reviews | `/reviews/{owner}/{repo}` | Diff Review PR picker (M8) |
| Portfolio | `/portfolio/{owner}/{repo}` | Portfolio page (M10) |
| Delivery | `/delivery/{owner}/{repo}` | Delivery traceability map (M12) |
| Observability | `/observability/{owner}/{repo}` | Observability page (M13) |

- All routes except **Files** are verified to exist as `page.tsx` routes under
  `apps/web/app/` today. **Files** ships in this same epic (#268); within the
  epic branch the hub may merge before the viewer — an acceptable transient,
  closed before the epic PR merges to `main`.
- The hub links to the **bare area route** (no `?path=`, no sub-segment) —
  deep-linking into a specific file is the wiring tasks' job (#269/#270), not
  the hub's.
- **Ref nuance, said plainly:** rows are per-*snapshot* (`owner/repo/ref`
  unique), but every area page resolves its own snapshot by `owner/repo`
  (most recent import wins — the `getImportedRepo` convention). Two rows for
  the same `owner/repo` at different refs therefore link to the same area
  URLs. The hub does not invent per-ref routing (§15); the ref badge keeps
  the row honest about *what was imported*.

## 7. Input fields

**None.** No search, no filter, no sort. Imported-repo lists are short (a
junior dev's portfolio, not an org's fleet); the M8/M5/M6 choosers set the
precedent of a plain list. If the list ever needs filtering, that is a
follow-up — this spec does not pre-allocate a filter bar.

## 8. Primary actions

- **Enter an area** — click any of a row's nine area links (§6b). The page's
  main forward action.
- **Import a repository** — the persistent header affordance → `/import`;
  also the empty-state CTA (§10). Re-importing an existing repo/ref updates
  its snapshot in place (M11 US-3) — the hub itself never mutates.
- **View on GitHub** *(optional, per row)* — external link to `htmlUrl`,
  `rel="noopener noreferrer"`, new tab. Read-only per ADR 0009.

No delete, no rename, no re-import-in-place button, no mutation of any kind —
there are no Server Actions on this page.

## 9. Loading state

While `listImportedRepos` (and the key-file count read) resolve, render a
skeleton via `apps/web/app/repos/loading.tsx`, mirroring the sibling
`repos/[owner]/[repo]/issues/loading.tsx` convention: the `AppNav`
(`active="repos"`), a header-shaped `.skel` block pair (eyebrow + title), and
~4 row-shaped `.skel` placeholders at the rows' approximate height. The
wrapper carries `aria-busy="true"`; skeletons are decorative
(`aria-hidden="true"`). The source is local SQLite, so loading is brief — but
the state must exist so the page never flashes empty. There is no network or
LLM in-progress state — nothing async beyond the local reads happens at view.

## 10. Empty state

When `listImportedRepos` returns `[]` (nothing imported yet) — the first-run
case, rendered in place of the count line and list using the existing
`.empty-state` block (`role="status"`):

- Heading: **"No repositories imported yet"** (`.empty-title`).
- Body (`.empty-body`): "Import a GitHub repository to start coaching on it —
  its files, issues, stack, and more all start from here."
- CTA: **"Import a repository"** as `.btn .btn-primary` → `/import` — the
  same destination as the header affordance, promoted to the page's primary
  action.
- Calm and steady: **no spinner, no skeleton** — this is a terminal resting
  state, not a failure. It is the page's success for a new user.

A snapshot with `0` key files captured or an empty `fileTree` is **not** an
empty state — the row renders with its zero counts (quiet facts).

## 11. Error state

- **Load failure (unexpected)** — the data layer throws.
  `apps/web/app/repos/error.tsx` (`"use client"`, receives `reset`) renders
  the repos feature's `.status-card` error convention (as in
  `repos/[owner]/[repo]/issues/error.tsx`): the `AppNav` (`active="repos"`),
  heading **"Couldn't load imported repositories"**, a short plain-language
  body ("This is usually temporary — try reloading."), and a **"Try again"**
  button calling `reset()`. No raw stack trace, no DB error text.
- **No not-found state** — the route has no dynamic segment; an unknown URL
  under `/repos/...` is the sub-routes' concern, not this page's.
- **No partial-failure states** — there is no network leg to rate-limit or
  auth-fail (ADR 0009 import-time-only); the only failure mode is the local
  read throwing, covered above.

## 12. Success state

- One row per imported snapshot, newest import first, each showing
  `owner/repo`, the ref badge, the imported time, the file count, and the
  key-file count — every §5 field in use has a home in the row.
- Each row's nine area links navigate to the §6b hrefs.
- The header's "Import a repository" affordance is present in both populated
  and empty states.
- The empty state (§10) renders for a fresh install.
- Success is implicit — the list *is* the answer; no toast, no confirmation
  banner.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` ("Repos"). Content sits inside
  `<main>`; the `AppNav` is the `<nav aria-label="Primary">`. The repo list
  is a real `<ul>` (with an `aria-label` such as "Imported repositories");
  each row is a `<li>`. Row identity is strong text, **not** a heading — a
  heading per row would bloat the outline for no navigation gain (matching
  the issues-list precedent).
- **Area links are individually named.** Nine visible "Files / Issues / …"
  labels repeat on every row, so each link's **accessible name includes the
  repo** — e.g. `aria-label="Issues — vercel/next.js"` (or an `sr-only`
  suffix). A screen-reader user tabbing or pulling a links list hears which
  repo each link belongs to. The strip itself is a nested `<ul>` of links
  with an `aria-label` ("Coaching areas for {owner}/{repo}").
- **Badges & counts not color-only.** The ref badge and all counts carry
  their meaning as **text** ("main", "214 files", "12 key files captured");
  color/tint is supplementary, AA contrast in both themes (`next-themes`
  dark variant per `repos.css`).
- **External link.** "View on GitHub", when rendered, uses
  `rel="noopener noreferrer"` and an accessible hint that it opens
  externally.
- **Keyboard.** Full keyboard operability in logical order: nav → header
  import affordance → each row's links left-to-right, top-to-bottom; visible
  focus ring (the `.repo-row`-convention `:focus-visible` treatment); DOM
  order = visual order.
- **Loading.** Skeletons `aria-hidden="true"`; the loading wrapper carries
  `aria-busy="true"`.
- **Empty state announced.** The §10 block is real text with
  `role="status"`, announced on navigation — never a color-only or
  image-only signal.

## 14. Styling

- **Reuse the repos feature's existing conventions — no new design system.**
  The page renders inside `.screen` and uses the tokens, type scale, and
  components already in `apps/web/app/repos/repos.css`: `.page` /
  `.container-narrow`, `.page-eyebrow` / `.page-title` / `.page-subtitle`,
  `.badge` (via the chrome `Badge`), `.btn` / `.btn-primary`, `.empty-state`,
  `.skel`, `.status-card`. IBM Plex Sans/Mono arrive via the existing
  `repos/layout.tsx` font variables — no font work.
- **Small additive CSS only.** The row treatment ports the established
  `.repo-list` / `.repo-row` pattern (stack/map/reviews CSS) into `repos.css`
  plus a rule or two for the area-links strip — same tokens, no new palette,
  no new keyframes beyond what exists.
- **Shared chrome.** `AppNav`, `Badge`, `relTime`, and the stroke icons come
  from `apps/web/app/repos/_components/chrome.tsx` / the shared
  `app-nav.tsx` — no new icon dependency (inline stroke SVGs per the
  feature's convention). Note `relTime` takes an ISO string — the page passes
  `importedAt.toISOString()`.
- **Build-from-spec (epic AD-2).** No Claude Design draft and no
  `ui-prompts/` entry for this page — implementation (#267) works directly
  from this spec, per the M12/M13 precedent recorded in the epic.

## 15. What this page does *not* do

Intentional exclusions, to keep the page bounded and prevent drift in #267:

- **No snapshot management.** No delete, no rename, no refresh button — the
  only mutation path remains the `/import` flow (re-import updates in
  place). The hub is strictly read-only.
- **No per-ref area routing.** Area links address `owner/repo`; each area
  page resolves its own snapshot (most recent import) per the existing
  convention. The hub does not add `?ref=` or per-ref routes.
- **No `/repos/[owner]/[repo]` index route.** None exists; rows link only to
  the nine §6b areas. If a per-repo overview page is ever wanted, it is a
  separate scoped feature.
- **No content prediction.** The hub does not query per-area tables to badge
  rows with "3 challenges" / "2 reviews" — each area page owns its own
  content and empty state. (The two snapshot counts in §5 are the row's only
  numbers.)
- **No filter/search/sort UI** (§7).
- **No network surface.** No GitHub call, no token, no LLM — local SQLite
  only (ADR 0009).
- **No rewiring of other pages.** Existing surfaces that link to `/import`
  (e.g. sibling back-links) are untouched by this page; only the epic's
  wiring tasks (#269, #270) edit other surfaces.

## 16. Acceptance criteria

- [ ] `/repos` renders the hub server-side from `listImportedRepos`
      (`packages/db/src/github/repos.ts`) — no client fetch, no API route
      (ADR 0006); the M16 `redirect("/import")` is gone (FR-1, FR-4).
- [ ] Viewing requires **no `GITHUB_TOKEN`, no `ANTHROPIC_API_KEY`, and no
      network** — local SQLite reads only (ADR 0009).
- [ ] Each row shows **`owner/repo`**, the **`ref` badge**, **imported time**
      (relative, via `relTime`), the **file count** (blob entries of
      `fileTree`), and the **key-file count** (`repo_files` rows for the
      snapshot) — with the key-file count read via a small read-only count
      (epic AD-1; **no migration**), not by loading captured contents.
- [ ] Each row links to its nine areas with the **exact §6b hrefs** — Files
      (`/repos/{owner}/{repo}/files`), Issues, Challenges, Stack, Map,
      Reviews, Portfolio, Delivery, Observability — and to nothing else (no
      bare `/repos/{owner}/{repo}` link).
- [ ] Rows render newest import first (the DAL's `importedAt` descending
      order); no sort or filter UI.
- [ ] The **empty state** (§10) renders when nothing is imported: "No
      repositories imported yet" + "Import a repository" CTA → `/import`;
      calm, `role="status"`, not an error.
- [ ] The **persistent import affordance** (header link to `/import`) is
      present in both populated and empty states.
- [ ] `apps/web/app/repos/loading.tsx` renders the §9 skeleton
      (`aria-busy`, `aria-hidden` skeletons); `apps/web/app/repos/error.tsx`
      renders the §11 `.status-card` failure with "Try again" (`reset()`);
      no raw stack traces. No `not-found.tsx` for this route.
- [ ] Uses the shared `AppNav` with `active="repos"` (FR-4) and the repos
      feature's existing styling (`repos.css` tokens + IBM Plex via
      `repos/layout.tsx`); only small additive CSS (the `.repo-list`-style
      row + links strip); **no new design system, no new dependencies**.
- [ ] **Read-only** — no Server Actions, no mutations; the only external
      link is the optional per-row "View on GitHub"
      (`rel="noopener noreferrer"`).
- [ ] Accessibility notes in §13 are satisfied (one `<h1>`, `<ul>` list
      semantics, per-link accessible names that include the repo, text-not-
      color badges/counts, keyboard operability, AA contrast, announced
      loading/empty states).
- [ ] **Built directly from this spec** (epic AD-2, M12/M13 precedent) — no
      Claude Design draft, no v0; the spec is reviewed alongside the epic PR
      (#265 Definition of Done).
