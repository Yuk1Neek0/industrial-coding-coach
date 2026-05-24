# Page Spec: Per-repo Issues List

Issue: #137 · Epic: `issue-based-learning-workspace` · PRD: `.claude/prds/issue-based-learning-workspace.md` (FR-11, R5)

This spec defines the **Per-repo Issues List** page for Milestone 7. It is the
input to the Claude Design prompt
(`docs/design/ui-prompts/per-repo-issues-list.prompt.md`) and to the integration
task #138. It must be human-reviewed before the prompt is run.
(UI tool: **Claude Design** — see **ADR 0007**.)

The Per-repo Issues List is the **entry point into the M7 learning workspace**
(FR-11). It is reached from the M11 imported-repo page ("Issues" tab); each
row navigates to the **Issue Learning Workspace** page
(`docs/design/issue-learning-workspace.page-spec.md`, task #136), which composes
the Review Checklist UI, the Understanding Questions UI, and the Challenge
Panel. This page shares layout, components, and tone with the M2 Catalog,
M3 Registry, M4 Recommendation, M6 Project Map, and M8 Diff Review pages so
the whole app reads as one product.

> **R5 — Per-repo only.** This page lists issues for **one imported repo**.
> **No global cross-repo issues index exists in M7.** A global index, if ever
> needed, is a follow-up — this spec does not propose it, even as a future hook.

---

## 1. Page name

**Per-repo Issues List** — a single-route page (`/repos/[owner]/[repo]/issues`)
showing every fetched GitHub Issue (plus any imported CCPM tasks) on one
imported repository, with each row's **learning-unit status** so the user
can see at a glance which issues they have started, are in progress on, or
have already scored.

## 2. User goal

> "I have an imported repo. I want to see every issue on it — its number, its
> title, its labels, whether it is open or closed, whether it links to a PR —
> and I want to know which ones I have already learned from. Then I want to
> click into one and work through the learning unit."

The user lands on this page from the M11 imported-repo page, scans the list of
issues for the repo, sees their per-issue learning-unit status, picks one, and
navigates to its Issue Learning Workspace to read the unit and answer its
understanding questions.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She has
one or two AI-built portfolio projects she cannot confidently explain. She can
prompt an AI tool, run `pnpm`, and push to GitHub, but cannot justify a stack
or describe how a change flows through her code.

Design implications:

- **An index of *her* repo, not a global feed.** Mia thinks per-project. The
  page is scoped to one `owner/repo` from the URL; there is no cross-repo
  blend. The header always names the repo so she never wonders which project
  she is looking at (R5).
- **Learning status is the value-add.** A plain GitHub issues list she already
  has on github.com. What makes this page worth visiting is the per-row
  **learning-unit status** — "not started" / "in progress" / "scored" — so she
  can pick the issue that will teach her something next.
- **Honest about source.** A row may come from a real GitHub Issue or from a
  CCPM task file in her imported snapshot (R1). The row treats them as one
  shape, with a small source label so she is not misled.
- **No accounts, no setup.** M7 has no authentication; the page is the same
  for everyone and reads from the local snapshot the M11 import produced.
- **Resilient.** An imported repo with no fetched issues and no CCPM tasks
  must show a clear empty state — never a blank screen (NFR Resilient).

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the page shell.
A small Client Component island handles the in-page filter/search if any (see
§7) over the already-loaded list.

| Route | Purpose | File |
|---|---|---|
| `/repos/[owner]/[repo]/issues` | Per-repo issues list | `apps/web/app/repos/[owner]/[repo]/issues/page.tsx` |

- `[owner]/[repo]` is the imported repo's GitHub identity, matching the M11
  imported-repo route segments. The same `owner/repo` row is what M11's
  imported-repo page reads from `repo_snapshots`.
- A loading UI (`loading.tsx`) and a not-found UI (`not-found.tsx`) accompany
  the route; an error boundary (`error.tsx`) covers it.
- The page is linkable and bookmarkable — a returning user can deep-link to
  their repo's issues list.
- **No global `/issues` route exists** — per R5, this page only lives under
  `/repos/[owner]/[repo]/`. The integration task (#138) must not introduce a
  cross-repo index.

## 5. Data source / contract

The page is a **thin server-side view** over two typed data-access layers — no
client-side fetching of GitHub, no API route. Server Components call the data
layer directly (ADR 0006). All GitHub reads go through the **extended M11
GitHub client** — the single GitHub access path per **ADR 0009**.

```ts
// M7 (task #132) — list issues for one imported repo via the extended M11
// GitHub client. Returns the normalized learning-unit input shape so this
// page treats GitHub Issues and CCPM tasks uniformly (R1, FR-1).
listIssues(repoIdentity: { owner: string; repo: string }): Promise<LearningUnitInput[]>

// M7 (task #135) — read the learning-unit rows that already exist for this
// repo so each issue's row can show its learning-unit status (FR-8, R2).
listLearningUnitsForRepo(repoIdentity: { owner: string; repo: string }): Promise<LearningUnitSummary[]>
```

Both calls are server-side; the page composes them in the Server Component for
the route. There is no live GitHub call from the browser; there is no separate
network step in this page beyond what the data-access layer makes (the layer
itself reads the local snapshot for CCPM tasks and the M11 GitHub client for
issues — task #132 is responsible for the live-vs-snapshot policy, this page
does not).

### `LearningUnitInput` — the normalized issue-list row shape (task #132)

This is the **single contract** the page renders, defined and exported by
task #132 from `packages/db/src/github/`. GitHub Issues and CCPM tasks are
folded into one shape (R1, FR-1); `source` is metadata only — the UI treats
both kinds of row identically. The exact TypeScript lives in `packages/db`;
if field names differ from the merged code at integration time, the merged
code is authoritative — but the *shape* below is fixed by FR-1 / R1 and must
not change without updating this spec.

| Field | Type | Used by |
|---|---|---|
| `source` | `'github-issue' \| 'ccpm-task'` | §6b row — small source label (R1) |
| `issueRef` | `string` | §6b row — stable identifier (e.g. `"#42"` or `"epic/foo/003"`); URL key into `/issues/[issueRef]` |
| `title` | `string` | §6b row — primary text |
| `body` | `string \| null` | not rendered on this list page; passed into the learning-unit page |
| `labels` | `IssueLabel[]` | §6b row — colored label chips |
| `state` | `'open' \| 'closed'` | §6b row — state badge |
| `linkedPrs` | `LinkedPrRef[]` | §6b row — linked-PR indicator |

**`IssueLabel`** — one GitHub label:

| Field | Type | Use |
|---|---|---|
| `name` | `string` | label text |
| `color` | `string \| null` | hex color from GitHub (label tint); may be null |
| `description` | `string \| null` | optional tooltip text |

**`LinkedPrRef`** — one PR linked to the issue, surfaced by the M11 GitHub
client (task #132). May be empty (most CCPM tasks have no `linkedPrs`):

| Field | Type | Use |
|---|---|---|
| `number` | `number` | PR number, e.g. `123` |
| `title` | `string` | PR title for accessible naming |
| `url` | `string` | external link to the PR on GitHub |
| `state` | `'open' \| 'closed' \| 'merged'` | small state hint on the chip |

### `LearningUnitSummary` — the per-row learning-status shape (task #135)

The Issue Learning Workspace page (task #136) reads the **full** `learning_units`
row; this list page only needs a compact summary per row, derived from the
single `learning_units` table introduced by task #131 (FR-8, R2). The
data-access layer (task #135) is responsible for computing the status from
the row's columns; this page only renders what it returns.

| Field | Type | Use |
|---|---|---|
| `issueRef` | `string` | join key against `LearningUnitInput.issueRef` |
| `status` | `'not started' \| 'in progress' \| 'scored'` | §6b row — learning-unit status badge |
| `lastUpdatedAt` | `Date \| null` | §6b row — small "Updated {date}" hint when present |

Status is derived strictly from `learning_units` columns (R6 — strictly
per-unit; no aggregate rollup):

- `'not started'` — no row exists in `learning_units` for `(repo, issueRef)`,
  **or** a row exists but the user has not answered any question
  (`user_answers` is null/empty) and has not ticked any checklist item
  (`checklist_state` is null/empty).
- `'in progress'` — a row exists and the user has either answered at least
  one question or ticked at least one checklist item, but `score` is null
  (the grading call has not yet produced a result).
- `'scored'` — a row exists and `score` is non-null (the grading call has
  run and persisted a per-unit score per R6).

The merged data-access layer is authoritative on the exact predicates; this
spec fixes the three-state vocabulary and the join key. The data-access layer
returns one `LearningUnitSummary` per `issueRef` it has; the page joins
client-locally — an `issueRef` with no summary entry is rendered as
`'not started'`.

> **Why this status is the page's value-add.** A junior dev already has a
> GitHub issues view on github.com. What github.com cannot tell her is which
> issues she has *learned* from in this product. The status badge is the
> single most important per-row element on this page — it tells her where to
> go next.

## 6. Page sections

Top to bottom, single readable column (comfortable max width):

1. **Back link** — "← Back to repo" to `/repos/[owner]/[repo]` (the M11
   imported-repo page) — the entry point per R5.
2. **Page header** — a small muted line `{owner}/{repo}` (with a "View on
   GitHub →" external link, `rel="noopener noreferrer"`, new tab — read-only
   per ADR 0009), an `<h1>` "Issues", and a one-line subtitle: "Pick an issue
   to open its learning unit." A result-count line on the right, e.g. "12
   issues" (or "3 of 12 issues" when a filter is active — see §7).
3. **Filter / search bar** — see §7. Optional but present; light-touch since
   issue lists are typically short, but the layout supports growth.
4. **Issues list** — the rows. See §6a.
5. **Empty states** — when there are no issues, the rows are replaced by the
   empty-state block. See §10.

### 6a. Issues list

The body of the page. Render the joined list (`LearningUnitInput` ×
`LearningUnitSummary`) as a `<ul>` of rows — one row per `issueRef`. Each row
is a **single focusable link** wrapping the row content (one tab stop per
row), navigating to the Issue Learning Workspace at
`/repos/[owner]/[repo]/issues/[issueRef]` (see §8). A row may be a shadcn
`Card` styled as a row, or a `<li>` with a hover/focus ring; final visual
choice is the integrator's.

Each row shows, left to right:

- **State badge** — `Open` or `Closed`, calm coloring, meaning carried by
  the text (small shadcn `Badge`; AA contrast in both themes).
- **Issue number** — monospace `#{number}` (for `source: 'github-issue'`)
  or the CCPM task identifier (for `source: 'ccpm-task'`, e.g. the task's
  ref from the CCPM frontmatter). Use `issueRef` as the display string.
- **Title** — primary text. Long titles truncate with ellipsis on narrow
  screens but the full text is the accessible name of the row link.
- **Labels** — `labels` rendered as small chips. Use shadcn `Badge` for each;
  honor `label.color` as a quiet tint when present, but the label *text* must
  carry meaning (color is supplementary only — see §13). On narrow screens
  the chips wrap; if there are many, render the first 3–4 and a "+N more"
  chip (no interactivity required on this list page — the full label set
  shows on the learning-unit page).
- **Linked-PR indicator** — when `linkedPrs.length > 0`, a small chip
  "PR #{n}" (or "PRs: #a, #b" for multiple) with a quiet state hint
  (`open` / `closed` / `merged`). The chip *itself* is decorative on this
  row — it does **not** open an external link (the whole row is the link
  target); the learning-unit page is where PR details are surfaced. Show
  nothing when `linkedPrs` is empty.
- **Source label** — a small muted tag: `GitHub` for `source: 'github-issue'`,
  `CCPM` for `source: 'ccpm-task'`. Quiet — the row's content is the same
  shape either way (R1).
- **Learning-unit status badge** — the page's value-add. A clearly placed
  badge showing one of `Not started` / `In progress` / `Scored`. Calm
  coloring; meaning carried by the **text** not the color (see §13). A small
  "Updated {date}" line beside the badge when `lastUpdatedAt` is present.

The status badge must be **prominent** — it is the per-row affordance that
differentiates this page from a generic GitHub issues view. It is the right
edge of the row on wide screens and stacks under the title on narrow screens.

Rows are ordered by:

1. `state` — `open` first, then `closed`.
2. Within each state, `issueRef` in stable descending order (newest issues
   first for `source: 'github-issue'`; CCPM tasks interleave by their
   `issueRef`, mirroring how the M11 client returns them).

The data-access layer (task #132) is authoritative on the canonical order
returned; this page renders that order and may add a §7 filter on top. No
secondary sort UI in M7.

## 7. Input fields

The page has light-touch filter inputs over the **already-loaded** list
(client-side over the server-fetched array — no extra request, no live
GitHub call):

| Field | Type | Behaviour |
|---|---|---|
| **Search** | text input | Free-text filter over `title` + `issueRef` (case-insensitive substring). Placeholder: "Search issues". |
| **State** | segmented control / select | `All` (default) / `Open` / `Closed`; filters by `state`. |
| **Status** | segmented control / select | `Any status` (default) / `Not started` / `In progress` / `Scored`; filters by the learning-unit status. |

Filtering is **client-side** over the already-loaded list (issue lists are
typically short; no extra fetch). The result-count line in §6 updates to
"M of N issues" when a filter is active.

A "Clear filters" affordance appears next to the bar when at least one filter
is non-default. No persistence of filter state across page loads in M7.

## 8. Primary actions

- **Open a learning unit** — click a row → navigate to
  `/repos/[owner]/[repo]/issues/[issueRef]` (the Issue Learning Workspace,
  task #136). The main forward action and the only navigation off this page
  besides the back link.
- **Return to the imported repo** — the "← Back to repo" link in the header
  navigates to `/repos/[owner]/[repo]` (the M11 imported-repo page).
- **View the repo on GitHub** — small external link in the header
  (`rel="noopener noreferrer"`, new tab). Read-only per ADR 0009.
- **Filter the list** — type in search / pick a state / pick a status (§7).

No create/edit/delete of issues — GitHub access is **read-only per ADR 0009**;
this page never opens, edits, or comments on a GitHub Issue, and never opens
a PR. The chip indicators in §6a are not external links.

## 9. Loading state

While `listIssues` and `listLearningUnitsForRepo` resolve, render a skeleton
issues list via `app/repos/[owner]/[repo]/issues/loading.tsx`: a header bar
(repo title + page heading), a filter-bar placeholder, and ~6 row-shaped
placeholders (each a state-badge block + a title line + a label-chip strip
+ a status-badge block). Use shadcn `Skeleton`.

GitHub fetches go through the M11 client, which may take a beat against the
live API (or be instantaneous against the snapshot, depending on task #132's
final policy); the loading state must exist so the page never flashes empty.

## 10. Empty state

The empty cases are **distinct** and must read differently:

- **No issues fetched and no CCPM tasks present** (`listIssues` returns `[]`
  for this repo) — the explicit M7 empty case (NFR Resilient). Render a
  centered empty state in place of the rows:
  - Heading: **"No issues to learn from yet."**
  - Body: "We didn't find any GitHub Issues on this repo, and no CCPM task
    files are present in the imported snapshot."
  - A short, calm explanation that **this is normal for a new repo** — a
    project with no issues yet is not a failure.
  - A small **"What to do next"** block with two concrete next steps,
    plain-language and non-pushy:
    1. "Open an Issue on GitHub for your repo, then re-import to refresh."
       (links the user back to the M11 imported-repo page with a "Re-import"
       hint, but does not open GitHub for them — read-only per ADR 0009).
    2. "If your repo uses CCPM, run `ccpm structure` to create task files
       under `.claude/epics/`, then re-import."
  - **No spinner**, no skeleton — this is a steady terminal state, not a
    loading state.

  > **Why this state is first-class.** Per NFR Resilient, a brand-new repo
  > with no issues must produce a clear, calm screen rather than an empty
  > list. A blank rows area would look broken. The empty state is itself
  > the page's success in that case.

- **No filter matches** (search/filter excludes every row) — keep the filter
  bar visible and show an inline message: **"No issues match your filters."**
  with a "Clear filters" action that resets §7's inputs. Distinct from the
  no-issues-at-all state above; the result-count line reads "0 of N issues".

If `linkedPrs` is empty on a row, the row simply omits the PR chip — that is
not an empty state, just a quiet absence.

## 11. Error state

- **Repo not found / not imported** — if the `[owner]/[repo]` segments do not
  match an `ImportedRepo` row in the local snapshot, call Next.js `notFound()`
  and render `app/repos/[owner]/[repo]/issues/not-found.tsx`: heading
  **"Repo not imported"**, a line explaining that this owner/repo has not
  been imported yet, and a link to the M11 import page (`/import`). A user
  who deep-links here for a repo they haven't imported gets a calm,
  actionable result, not a crash.
- **Load failure (data layer threw)** — the route `error.tsx` boundary
  renders a friendly error: heading **"Couldn't load issues for this repo"**,
  a short explanation, and a "Try again" button (`reset()`). No raw stack
  trace, no DB error.
- **GitHub rate-limit exhaustion** — handled by the M11 GitHub client per
  ADR 0009; the client surfaces a typed rate-limit error. The page renders
  it as an inline notice above the (possibly stale or empty) rows:
  **"GitHub rate limit hit, resets at {hh:mm}."** with a one-line hint to
  set `GITHUB_TOKEN` for the higher authenticated limit. The notice does
  **not** suppress any rows the layer was able to return; if the layer
  returned nothing, the empty-state block in §10 may also render below the
  notice. The page must not hang while waiting on a rate-limit reset.
- **GitHub authentication failure** — if the configured `GITHUB_TOKEN` is
  invalid for the repo (e.g. private repo, wrong scope), the layer surfaces
  a typed auth error; the page renders a similar inline notice:
  **"Couldn't access this repo on GitHub."** with a plain-language hint
  (token may be missing or lack read access). No raw 401/403 status codes.

Not-found (expected — unknown/unimported repo) and load-error (unexpected —
data layer failed) and rate-limit/auth (expected — GitHub-side) are
deliberately separate states with different copy.

## 12. Success state

- The page renders the header, the filter bar, and a row for every joined
  `(LearningUnitInput, LearningUnitSummary?)` entry — every field of §5
  has a home in the row.
- Every row's **learning-unit status badge** is correct against the
  `learning_units` row for that `issueRef` (or `Not started` when no row
  exists). The status badge is plainly visible — never hidden behind a
  toggle, never color-only.
- Every row navigates to `/repos/[owner]/[repo]/issues/[issueRef]` on click /
  Enter — the entry point into the learning unit (FR-11).
- The empty-issues case (§10) and the no-filter-match case (§10) render
  correctly and distinctly.
- Success is otherwise implicit (content shown) — this is a read-only
  browsing page; no toast or confirmation banner.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` ("Issues"); the repo name sits
  outside the heading as a muted contextual line. Section headings descend
  in order with no skipped levels. Use `<main>`, `<nav>` (back link), and a
  `<section>` for the list. The issues list is a `<ul>`; each row is a
  `<li>`.
- **Rows as links.** Each row is a single focusable link wrapping the row
  content (one tab stop per row, not several). The accessible name of the
  link combines the state, issue number, title, and learning-unit status
  (e.g. "Open issue #42 — Add rate limiting to the login endpoint — In
  progress") so a screen-reader user hears the row's full meaning in one
  pass. Visible focus ring on every row.
- **Badges and chips not color-only.** The state badge ("Open" / "Closed"),
  the learning-unit status badge ("Not started" / "In progress" / "Scored"),
  and the label chips all carry their meaning in **text**; color is
  supplementary only and AA-contrast in both themes (the app uses
  `next-themes`). A `label.color` tint never becomes the only carrier of
  meaning.
- **Filter inputs labelled.** Search has an associated `<label>` (visible or
  `sr-only`); the State and Status segmented controls / selects are labelled
  ("Filter by state", "Filter by learning-unit status"), keyboard-operable,
  and have a clear selected state.
- **Loading state.** Skeletons are decorative and `aria-hidden`; the loading
  region carries `aria-busy="true"` so assistive tech announces the page is
  loading rather than empty.
- **States announced.** Empty, no-filter-match, rate-limit, and auth-error
  messages are real text content in the document (announced on navigation
  or after re-render), not color-only signals.
- **Keyboard.** Full keyboard operability in logical order: back link → repo
  GitHub link → filter inputs → every row link; Enter/Space activate.
  Logical DOM order = visual order.
- **External link.** The "View on GitHub" link in the header uses
  `rel="noopener noreferrer"` and an accessible hint that it opens
  externally.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes.
- **Targets.** Each row, the filter inputs, and the back link are
  comfortably sized for pointer and touch.

## 14. Acceptance criteria

- [ ] `/repos/[owner]/[repo]/issues` renders the per-repo issues list read
      from the **extended M11 GitHub client** (task #132, ADR 0009) and the
      **`learning_units` data-access layer** (task #135) server-side — no
      client fetch, no API route, no second GitHub access path.
- [ ] The **page is per-repo only**; **no global cross-repo issues index**
      exists in M7 (R5). The page is reached off the M11 imported-repo page
      and has no sibling `/issues` route.
- [ ] Each row shows the **issue number + title**, **labels**, **state**
      (open / closed), and **linked-PR indicator** when one or more PRs are
      linked.
- [ ] Each row shows a **learning-unit status badge** with one of three
      values: `Not started` / `In progress` / `Scored` — derived from the
      `learning_units` row for that `issueRef`, with `Not started` as the
      default when no row exists. The badge is plainly visible, not
      color-only.
- [ ] Each row is a single focusable link navigating to
      `/repos/[owner]/[repo]/issues/[issueRef]` (the Issue Learning
      Workspace, task #136).
- [ ] The page treats GitHub Issues and CCPM tasks **uniformly** via the
      normalized `LearningUnitInput` shape (R1); `source` is a quiet
      metadata label, not a structural distinction.
- [ ] **Empty state** — when no issues are fetched **and** no CCPM tasks
      are present, the page renders the dedicated "No issues to learn from
      yet" block with concrete next-step hints (§10). Distinct from the
      no-filter-match state.
- [ ] **Filter** — search and state/status filters operate client-side over
      the loaded list and update the result count; "Clear filters" resets
      them.
- [ ] **Loading** state shows a skeleton issues list (header + filter bar
      + ~6 row placeholders).
- [ ] **Error states** — unknown/unimported repo shows a "Repo not
      imported" not-found page with a link to `/import`; a load failure
      shows a friendly "Try again" error; a GitHub rate-limit or
      authentication failure shows an inline, plain-language notice
      surfaced by the M11 client (ADR 0009). No raw stack traces or status
      codes.
- [ ] GitHub access is **read-only** (ADR 0009) — no chip or row opens an
      external write surface; the only external link is the header "View on
      GitHub" (`rel="noopener noreferrer"`).
- [ ] The page reads as one product with the M2 Catalog, M3 Registry, M4
      Recommendation, M6 Project Map, and M8 Diff Review pages — shared
      layout, spacing, and calm, content-first tone.
- [ ] Accessibility notes in §13 are satisfied (one `<h1>`, ordered
      headings, landmarks, single focusable row link with a complete
      accessible name, badges/chips not color-only, labelled filter inputs,
      AA contrast).
- [ ] **No v0 mentions.** Spec cites **ADR 0007** (Claude Design) and
      **ADR 0009** (GitHub access) and references **FR-11** and **R5**.
- [ ] Page spec is human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #137).

## 15. What this page does *not* do

A short list of intentional exclusions — to keep the page bounded and to
prevent integration drift in task #138:

- **No global cross-repo issues index (R5).** This page only lists issues
  for the one `owner/repo` in its URL. The integration task must not
  introduce a sibling `/issues` route or any cross-repo list view. If a
  global index is ever needed, it is a follow-up — out of scope for M7.
- **No write surface (ADR 0009).** The page never opens, edits, comments
  on, or closes a GitHub Issue, and never opens a PR. GitHub access is
  strictly read-only.
- **No learning-unit content on the row.** The row carries an *identity*
  and a *status* — not the restated goal, related files, concepts, or
  questions. Those live on the Issue Learning Workspace page (task #136,
  `docs/design/issue-learning-workspace.page-spec.md`) and the three
  sub-component panels (the Review Checklist UI, the Understanding
  Questions UI, and the Challenge Panel — also task #136).
- **No aggregate scoring or per-repo rollup (R6).** The page surfaces the
  three per-unit status values; it does **not** compute or render any
  cross-issue "comprehension score for this repo" view. Any cross-unit
  rollup is M10's milestone, not M7's — this page must not pre-allocate
  scaffolding for it.
- **No issue creation, no triage, no labels editing.** The list is a
  read-only browse-and-navigate surface (ADR 0009).
- **No sort UI in M7.** The data-access layer (task #132) is authoritative
  on canonical row order; this page renders that order and provides only
  the §7 filters on top.
- **No live GitHub calls from the browser.** All GitHub reads route through
  the extended M11 client server-side (ADR 0009); the page itself does no
  client-side fetching.
