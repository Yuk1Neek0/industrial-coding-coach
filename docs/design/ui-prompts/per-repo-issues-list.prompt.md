# Claude Design Prompt: Per-repo Issues List page

Issue: #137 · Epic: `issue-based-learning-workspace` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the **Per-repo Issues List** page. Full contract: the
page spec `docs/design/per-repo-issues-list.page-spec.md` — read that for the
complete behaviour, the data contract, and the acceptance criteria. This page
is the **entry point** into the M7 learning workspace (FR-11): the user lands
here from the M11 imported-repo page, scans issues for the one repo, and
clicks a row to open its **Issue Learning Workspace** (separate page, separate
spec — `docs/design/issue-learning-workspace.page-spec.md`, task #136).

> **R5 reminder for the designer.** This page is **per-repo only**. **No
> global cross-repo issues index exists in M7.** Do not propose one, even as
> a future hook or a navigation breadcrumb. Every state, filter, and link on
> this page is scoped to the one `owner/repo` in the URL.

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach the page spec `docs/design/per-repo-issues-list.page-spec.md`
   as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#138** reconciles it with
`apps/web` + `packages/ui` and wires the page to the real **extended M11
GitHub client** (task #132, ADR 0009) and the real **`learning_units`
data-access layer** (task #135) — do not expect Claude Design to produce
final wiring; it produces the interface.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only —
no data fetching, no GitHub API, no database.

---

## Prompt — paste into Claude Design

Build a **Per-repo Issues List** page for a learning-coach web app, using
Next.js (App Router), React, TypeScript, Tailwind CSS, and shadcn/ui. It is a
single page at route `/repos/[owner]/[repo]/issues`. Light and dark mode. Use
only mock sample data — do not add data fetching, API calls, or a database;
render from a typed in-file array so it is trivial to swap for real server
data later.

### Domain

The app coaches a job-seeking junior developer to genuinely understand
projects they built with heavy AI assistance. This page lists every GitHub
Issue (plus any CCPM task files) on **one** imported GitHub repository, with
each row's **learning-unit status** so the user can see at a glance which
issues she has not started, is in progress on, or has already scored. Clicking
a row opens that issue's learning unit (a separate page; do not design it
here).

Copy is plain, calm, encouraging, jargon-light. The page treats GitHub Issues
and CCPM tasks **as one shape** — the row layout does not differ by source;
a small muted "GitHub" or "CCPM" tag on the row is the only visible
distinction.

**This page is per-repo only.** It exists at `/repos/[owner]/[repo]/issues`
and nowhere else. Do **not** design a global cross-repo issues index, a
"My issues" page, or any navigation that suggests one — that view does not
exist in this product.

The page reads from a typed, normalized issue-list shape (defined below) and
a small per-row learning-unit summary shape. Both come pre-loaded as
in-file mocks — no fetching in the design.

### Data shapes — paste these as the typed mock contract

```ts
// One row in the list. GitHub Issues and CCPM tasks are normalized to this
// shape (the unit and its UI do not differentiate by source).
type LearningUnitInput = {
  source: 'github-issue' | 'ccpm-task'
  issueRef: string          // stable identifier, e.g. "#42" or "epic/foo/003"
  title: string
  body: string | null       // not rendered on this list page
  labels: IssueLabel[]
  state: 'open' | 'closed'
  linkedPrs: LinkedPrRef[]  // may be empty
}

type IssueLabel = {
  name: string
  color: string | null       // hex from GitHub; may be null
  description: string | null // optional tooltip text
}

type LinkedPrRef = {
  number: number
  title: string
  url: string                // external link to the PR on GitHub
  state: 'open' | 'closed' | 'merged'
}

// One learning-unit summary per issueRef the user has touched. Join to
// LearningUnitInput by issueRef. An issueRef with no summary entry is
// rendered as 'not started'.
type LearningUnitSummary = {
  issueRef: string
  status: 'not started' | 'in progress' | 'scored'
  lastUpdatedAt: Date | null
}
```

The page renders a joined list of `(LearningUnitInput, LearningUnitSummary?)`
rows. Two arrays of mock data, joined client-locally for the design.

### Seed the mock data

Seed the design with **one realistic imported repo**, e.g.
`mia-dev/portfolio-api` (a small Next.js + TypeScript portfolio API project).
Generate **~12 issues**, plausibly named — no "lorem ipsum". Mix the rows so
every state is visible at a glance:

- ~8 `source: 'github-issue'`, ~4 `source: 'ccpm-task'`.
- ~7 `state: 'open'`, ~5 `state: 'closed'`.
- A variety of `labels` — `bug`, `enhancement`, `documentation`,
  `good first issue`, `dependencies`, `infra` — with their typical GitHub
  colors. Some rows have 1–2 labels, a couple have 5+ to exercise wrapping
  / "+N more".
- A few rows have one `linkedPrs` entry (state `open` / `merged`); one row
  has two linked PRs; most rows have `linkedPrs: []`.
- Learning-unit status distribution: ~4 `not started` (no summary entry),
  ~4 `in progress`, ~3 `scored`, ~1 `not started` (summary entry exists but
  the user has not answered or ticked anything yet — same display).
- A `lastUpdatedAt` populated on `in progress` and `scored` rows (within
  the last few days / weeks).

Plausible titles (don't copy verbatim — vary them):
- "Add rate limiting to the login endpoint"
- "Fix TypeScript build error in `app/api/users/route.ts`"
- "Document the seed-data script in the README"
- "Migrate from `pg` to `drizzle-orm` for the users table"
- "Investigate flaky integration test on macOS CI"
- "Add a `health` route for the deployment platform"
- a couple of CCPM-task rows with `issueRef` like `"epic/auth/003"` and
  short, task-like titles.

### Page layout — route `/repos/[owner]/[repo]/issues`

A single readable column (comfortable max width). From top to bottom:

1. A **"← Back to repo"** link to `/repos/[owner]/[repo]` (the imported-repo
   page; do not design it here, just the link).
2. A **page header**:
   - A small muted line `{owner}/{repo}` with a **"View on GitHub →"**
     external link (`rel="noopener noreferrer"`, opens a new tab).
   - An `<h1>` reading "Issues".
   - A one-line subtitle: "Pick an issue to open its learning unit."
   - A result-count line on the right, e.g. "12 issues" — updates to
     "M of N issues" when a filter is active.
3. A **filter bar** directly below the header, three controls:
   - **Search** — shadcn `Input` with a search icon, placeholder
     "Search issues", filters by `title` + `issueRef` case-insensitively.
   - **State** — shadcn `Select` or a small segmented control: `All` /
     `Open` / `Closed`. Default `All`.
   - **Status** — shadcn `Select` or a segmented control: `Any status` /
     `Not started` / `In progress` / `Scored`. Default `Any status`. (This
     is the page's **value-add filter** — the one a generic GitHub issues
     view cannot offer; make it visually first-class within the bar.)
   - A "Clear filters" button appears beside the bar when at least one
     control is non-default.
4. The **issues list** — a `<ul>` of rows (see below).
5. The **empty states** — render in place of the rows (see below).

### A row — the most important visual element

Each row is a **single focusable link** wrapping the row content (one tab
stop per row, not several), navigating to
`/repos/[owner]/[repo]/issues/[issueRef]` (the learning-unit page — do not
design that here, just link to it). Use a shadcn `Card` styled as a row,
or a `<li>` with a hover/focus ring; visible focus ring on every row.

Each row shows, **left to right** on wide screens, stacking on narrow
screens:

- **State badge** — `Open` or `Closed`. A small shadcn `Badge`; calm
  coloring; meaning carried by the **text**, not the color alone (AA
  contrast in both themes).
- **Issue number** — monospace `{issueRef}` (e.g. `#42` or
  `epic/auth/003`).
- **Title** — primary text, weight slightly heavier than the rest. Long
  titles ellipsize on narrow screens but the full text is the row link's
  accessible name.
- **Label chips** — `labels` as small `Badge`s; honor `label.color` as a
  quiet tint (border or background; don't let it overpower the row), but
  the **label text** must carry meaning. On narrow screens, show the first
  3–4 chips and a "+N more" chip; no interactivity required on the chip.
- **Linked-PR indicator** — when `linkedPrs.length > 0`, a small chip
  reading "PR #{n}" (or "PRs: #a, #b" for multiple), with a quiet `state`
  hint (`open` / `closed` / `merged`). The chip is **decorative** on this
  row — the whole row is the link target; do not nest an external link
  inside the row. Omit the chip when `linkedPrs` is empty.
- **Source tag** — a small muted "GitHub" or "CCPM" tag. Quiet — the row
  shape is the same either way.
- **Learning-unit status badge** — `Not started` / `In progress` /
  `Scored`. This is the **most visually prominent per-row affordance** —
  it is the right-edge anchor of the row on wide screens, and stacks
  directly under the title on narrow screens. Calm coloring; meaning by
  text, not color. A small "Updated {date}" line beside the badge when
  `lastUpdatedAt` is present.

Order rows: `open` first then `closed`; within each, take the order the mock
array provides (the real data-access layer will be authoritative at
integration time).

The status badge is the reason this page exists. Style it so a user scanning
the list can answer "which one should I learn next?" in one glance — without
relying on color alone.

### States — design all of these

Provide simple toggles or separate preview screens so all of these states can
be viewed.

- **Loading** — a skeleton view using shadcn `Skeleton`: a header bar, a
  filter-bar placeholder, and **~6 row-shaped placeholders** (each a
  state-badge block + an issue-number block + a title line + a label-chip
  strip + a status-badge block on the right). Skeletons are `aria-hidden`;
  the loading region carries `aria-busy="true"`.
- **Empty — no issues fetched, no CCPM tasks present** — the **explicit M7
  empty case** (the page must handle this; it is the most important empty
  state). Render in place of the rows, centered:
  - Heading: **"No issues to learn from yet."**
  - Body: "We didn't find any GitHub Issues on this repo, and no CCPM task
    files are present in the imported snapshot."
  - A calm explanation that this is normal for a new repo.
  - A small **"What to do next"** block with two concrete, plain-language
    next-step hints: (1) "Open an Issue on GitHub for your repo, then
    re-import to refresh." (2) "If your repo uses CCPM, run
    `ccpm structure` to create task files under `.claude/epics/`, then
    re-import." Do **not** add a "Create issue" button — this product is
    read-only against GitHub.
  - No spinner, no skeleton.
- **Empty — no filter matches** — when the search / state / status filters
  exclude every row: keep the filter bar visible and show an inline
  message: **"No issues match your filters."** with a "Clear filters"
  action that resets the inputs. The result-count line reads
  "0 of N issues". Visually distinct from the no-issues-at-all state.
- **Error — repo not imported** — render a not-found-style page: heading
  **"Repo not imported"**, a short line ("This owner/repo hasn't been
  imported yet."), and a link to `/import` (the M11 import page).
- **Error — load failed** — a friendly error block: heading **"Couldn't
  load issues for this repo"**, a short explanation, and a "Try again"
  button. No stack traces, no DB errors.
- **GitHub rate-limit notice** — an inline notice that may render **above**
  the rows or the empty-state block:
  **"GitHub rate limit hit, resets at HH:MM."** with a small hint:
  "Set `GITHUB_TOKEN` for the higher authenticated limit." Calm coloring;
  the rest of the page still renders. The notice does not block the page.
- **GitHub auth failure** — a similar inline notice: **"Couldn't access
  this repo on GitHub."** with a plain-language hint ("Your token may be
  missing or lack read access for this repo."). No raw 401/403.

### Visual & accessibility requirements

- Clean, modern, content-first design. Generous spacing, readable
  typography, calm and trustworthy — a learning tool, not a marketing
  page. Match the existing app's M2 / M4 / M6 / M8 pages.
- Fully responsive: rows are comfortable to read on mobile (status badge
  stacks under the title) and on desktop (status badge anchors the right
  edge).
- Light and dark mode, using shadcn / Tailwind theme tokens (no
  hard-coded colors).
- Use **lucide-react** icons.
- Semantic HTML: exactly one `<h1>` per page ("Issues"); ordered heading
  levels with none skipped; `<main>` / `<nav>` / `<section>` landmarks.
  The issues list is a `<ul>` of `<li>`s. Each row is a single focusable
  link wrapping the row content (one tab stop per row), with an accessible
  name that combines state, issue number, title, and learning-unit status
  (e.g. "Open issue #42 — Add rate limiting to the login endpoint — In
  progress"). Visible focus ring throughout.
- **Badges and chips must not rely on color alone** — state, learning-unit
  status, and label text all carry meaning in text. `label.color` is a
  supportive tint only, AA-contrast in both themes.
- The "View on GitHub" link in the header uses `rel="noopener noreferrer"`
  and an accessible external-link hint.
- The search input has an associated `<label>` (visible or `sr-only`); the
  State and Status controls are labelled ("Filter by state", "Filter by
  learning-unit status"), keyboard-operable, with a clear selected state.
- All text meets WCAG AA contrast in both themes.

### Components to use (shadcn/ui)

Favor these shadcn/ui primitives — they already live in `packages/ui`
(`@workspace/ui`) and the integration step (#138) will reuse them rather
than duplicate them:

- `Card` (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`) — or
  a plain `<li>` styled as a row with a hover/focus state. Whichever reads
  cleanest as a list of rows.
- `Badge` — for the state badge, the learning-unit status badge, the label
  chips, the source tag, and the linked-PR chip.
- `Input` — the search field.
- `Select` (or a segmented control built from `Button` + `Toggle`) — the
  State and Status filters.
- `Button` — the "Clear filters" action and the "Try again" / "Back" links.
- `Skeleton` — the loading state.
- `Separator` — optional, between rows or sections.

**lucide-react** icons (suggested set): `search`, `external-link`,
`arrow-left`, `git-pull-request`, `circle` / `circle-dot` (state hint),
`circle-check` (scored), `clock` (in progress), `inbox` (empty state),
`alert-triangle` (rate-limit / auth notices).

Keep components small and composable so they integrate cleanly into an
existing shadcn/ui monorepo — **reuse `packages/ui` rather than duplicating
primitives**.

---

## Notes for the integrator (task #138)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) —
  **reuse it**; do not duplicate primitives. Add any missing shadcn
  components there (e.g. a segmented control).
- Replace the design's mock arrays with server-side calls to the typed
  data-access layers:
  - `listIssues({ owner, repo })` from the **extended M11 GitHub client**
    (`packages/db/src/github/`, task #132) — returns `LearningUnitInput[]`.
  - `listLearningUnitsForRepo({ owner, repo })` from the
    **`learning_units` data-access layer** (`packages/db/src/learning-units/`,
    task #135) — returns `LearningUnitSummary[]`.
  Compose them in the Server Component for the route. No client fetching;
  no API route (ADR 0006).
- Map the design's loading / empty / error mockups onto real App Router
  files:
  - `apps/web/app/repos/[owner]/[repo]/issues/loading.tsx`
  - `apps/web/app/repos/[owner]/[repo]/issues/error.tsx`
  - `apps/web/app/repos/[owner]/[repo]/issues/not-found.tsx` (for the
    unknown-repo case)
- Wire each row's link to
  `/repos/[owner]/[repo]/issues/[issueRef]` — the **Issue Learning
  Workspace** page (task #136, separate spec + prompt).
- The rate-limit and authentication notices map to the typed errors the
  extended M11 GitHub client surfaces (ADR 0009). Surface them as inline
  notices in the page; do **not** route them to the route's `error.tsx`.
- Filtering is **client-side** over the server-loaded array — a small
  Client Component island wrapping the rows.
- GitHub access is **read-only** (ADR 0009). The integrator must not add
  any "Create issue" / "Comment" / "Close" affordance to this page, nor
  open a write-capable surface from a row.
- **Per R5: do not introduce a global cross-repo issues index.** This
  page must remain under `/repos/[owner]/[repo]/issues` only.
- Verify the result against `docs/design/per-repo-issues-list.page-spec.md`
  §14 acceptance criteria; record integration notes in
  `docs/design/ui-integration-notes/`.
