# Page Spec: Golden Path Catalog

Issue: #33 · Epic: `golden-path-catalog` · PRD: `.claude/prds/golden-path-catalog.md` (FR-4)

This spec defines the Catalog UI page for Milestone 2. It is the input to the
v0 prompt (`docs/design/v0-prompts/golden-path-catalog-page.md`) and to the
integration task #34. It must be human-reviewed before the v0 prompt is run.

---

## 1. Page name

**Golden Path Catalog** — a two-route feature: a **list page** of all Golden
Paths and a **detail page** for one Golden Path.

## 2. User goal

> "I have an AI-built project and no idea where to start understanding it. Show
> me the structured routes available, and let me read one in full so I can
> judge whether it fits my project — without trusting a black box."

The user browses the list, scans which paths exist, opens the one that looks
relevant, and reads its full reasoning (steps, fit criteria, learning outcomes,
rejected alternatives, sources, risks).

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She has
one or two AI-built portfolio projects she cannot confidently explain. She can
prompt an AI tool, run `pnpm`, and push to GitHub, but cannot justify a stack or
describe how a change flows through her code.

Design implications:
- **Plain language over jargon.** She is a beginner; section labels and copy
  must read clearly without insider terms.
- **Reasoning must be visible, not buried.** Fit criteria, rejected
  alternatives, sources, and risks are the point of the product — they exist so
  a route is never a black-box recommendation. They get first-class space in the
  detail layout, not a collapsed footnote.
- **Learning value up front.** Mia's goal is interview readiness; learning
  outcomes ("what you will be able to explain") must be easy to find.
- **No accounts, no setup.** M2 has no authentication; the page is the same for
  everyone and works immediately.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components.

| Route | Purpose | File |
|---|---|---|
| `/catalog` | List view — all 5 Golden Paths | `apps/web/app/catalog/page.tsx` |
| `/catalog/[slug]` | Detail view — one Golden Path | `apps/web/app/catalog/[slug]/page.tsx` |

- `slug` is the stable identifier on each `golden_paths` row (unique per task
  #30) — e.g. `ai-native-nextjs-app`. It is the URL key and matches what a later
  recommendation (M4) would cite.
- The detail route is a separate page (not an in-place expansion) so a path is
  linkable, shareable, and bookmarkable, and so each path has a real URL a
  recommendation can deep-link to.
- A loading UI (`loading.tsx`) and a not-found UI (`not-found.tsx`) accompany
  the detail route. An error boundary (`error.tsx`) covers both routes.
- A "Catalog" entry should be added to the app's primary navigation (out of
  scope to design here, but the page assumes it is reachable from a nav link).

## 5. Data source / contract

The page is a **thin server-side view** over the typed catalog data-access
layer (`@workspace/db`, task #31). No client-side fetching, no API route — Server
Components call the data layer directly. There is no separate server process;
the catalog is a local SQLite file (ADR 0006).

Two functions:

```ts
// List page — /catalog
listGoldenPaths(): Promise<GoldenPath[]>

// Detail page — /catalog/[slug]
getGoldenPathBySlug(slug: string): Promise<GoldenPath | null>
```

`getGoldenPathBySlug` returns `null` when no row matches — the detail page
treats `null` as not-found (see §11).

### Golden Path record shape

Each `GoldenPath` carries:

| Field | Type | Used by |
|---|---|---|
| `slug` | `string` | URL key; list links; detail lookup |
| `name` | `string` | List card title; detail H1 |
| `summary` | `string` | List card body; detail intro line |
| `targetProjectType` | `string` | List card tag; detail "Who it's for" |
| `fitCriteria` | `string` | Detail — "Does this fit my project?" |
| `steps` | `{ title: string; detail: string }[]` | Detail — the understanding journey |
| `templatesReferenced` | `string[]` | Detail — "Templates this builds on" |
| `qualityGates` | `string[]` | Detail — "Quality gates" |
| `learningOutcomes` | `string[]` | Detail — "What you'll be able to explain" |
| `rejectedAlternatives` | `{ name: string; reason: string }[]` | Detail — "Alternatives considered" |
| `sources` | `{ label: string; url?: string }[]` | Detail — "Sources" |
| `risks` | `string[]` | Detail — "Risks & caveats" |

The five seeded entries (PRD FR-2): AI-native Next.js App, Agentic CCPM
Workflow, Repo Understanding & Review Coach, Contract-first Fullstack App, LLM
Observability & Eval App.

## 6. Page sections

### List page — `/catalog`

1. **Page header** — page title "Golden Path Catalog" and a one-line
   description: "Curated routes for understanding an AI-assisted project. Pick
   the one that matches yours."
2. **Filter / search bar** — a text input plus optional project-type filter
   (see §7). For 5 entries this is light-touch but proves the pattern and keeps
   the layout honest as the catalog grows.
3. **Path list** — a responsive grid of cards, one per Golden Path. Each card
   shows: `name` (title), `summary` (body, clamped to ~2–3 lines),
   `targetProjectType` (a badge), and a step count (e.g. "6 steps", derived from
   `steps.length`). The whole card is a link to `/catalog/[slug]`.
4. **Result count** — small text, e.g. "5 paths" / "2 of 5 paths" when a filter
   is active.

### Detail page — `/catalog/[slug]`

1. **Back link** — "← Back to catalog" to `/catalog`.
2. **Detail header** — `name` (H1), `summary` (lead paragraph), and a
   `targetProjectType` badge.
3. **Who it's for / Does this fit?** — `targetProjectType` and the
   `fitCriteria` string, framed as "Use this path if your project looks like
   this." This is the first content section because it answers Mia's first
   question.
4. **The understanding journey** — an ordered list of `steps`; each step shows
   `title` and `detail`. Visually numbered.
5. **What you'll be able to explain** — `learningOutcomes` as a checklist-style
   bulleted list. Mia's interview-readiness payoff.
6. **Quality gates** — `qualityGates` as a bulleted list — the checks that
   confirm understanding along the way.
7. **Templates this builds on** — `templatesReferenced` rendered as tags/chips.
   Plain text in M2; the Template Registry (M3) makes these linkable later.
8. **Alternatives considered** — `rejectedAlternatives` as a list of
   `name` + `reason` pairs, framed "other routes we weighed and why we did not
   pick them." Reinforces "this is reasoned, not a black box."
9. **Risks & caveats** — `risks` as a bulleted list.
10. **Sources** — `sources` as a list; render `label` as a link when `url` is
    present, plain text otherwise.

Sections 3–10 may be grouped into shadcn `Card`s, or rendered as headed
sections within one column. Reasoning sections (3, 8, 9, 10) must remain
visually prominent — not hidden behind closed accordions by default.

## 7. Input fields

On the **list page** only:

| Field | Type | Behaviour |
|---|---|---|
| **Search** | text input | Free-text filter over `name` + `summary` (case-insensitive substring). Placeholder: "Search Golden Paths". |
| **Project type** | select / segmented control (optional) | Filter by `targetProjectType`; options derived from the distinct values across loaded paths, plus an "All" default. |

Filtering happens **client-side** over the already-loaded list (only 5 entries,
no extra fetch). The detail page has no input fields in M2.

## 8. Primary actions

- **Open a Golden Path** — click a card on `/catalog` → navigate to
  `/catalog/[slug]`. This is the main action.
- **Return to the catalog** — "Back to catalog" link on the detail page.
- **Filter the list** — type in search / pick a project type on `/catalog`.
- **Open a source** — click a `sources` entry that has a `url` (opens in a new
  tab, with `rel="noopener noreferrer"`).

No create/edit/delete — the catalog is seeded data in M2 (PRD: no authoring UI).

## 9. Loading state

- **List page** — while `listGoldenPaths()` resolves, render a skeleton grid
  (~5 card placeholders) via `app/catalog/loading.tsx`. Header and filter bar
  may render immediately; the filter is inert until data arrives.
- **Detail page** — while `getGoldenPathBySlug()` resolves, render a skeleton
  detail layout (header bar + section blocks) via
  `app/catalog/[slug]/loading.tsx`.
- Use shadcn `Skeleton`. Loading should be brief — the data source is a local
  SQLite file — but the state must exist so the page never flashes empty.

## 10. Empty state

- **No Golden Paths at all** (`listGoldenPaths()` returns `[]`, e.g. an unseeded
  DB) — show a centered empty state: a short heading "No Golden Paths yet" and
  the explanation "The catalog has not been seeded. Run the catalog seed to
  load the Golden Paths." No card grid, no spinner.
- **No filter matches** (search/type filter excludes all 5) — keep the filter
  bar visible and show an inline message: "No Golden Paths match your search."
  plus a "Clear filters" action that resets the inputs. This is distinct from
  the unseeded-catalog state above.

## 11. Error state

- **List page** — if `listGoldenPaths()` throws, the route `error.tsx`
  boundary renders a friendly error: heading "Couldn't load the catalog", a
  short explanation, and a "Try again" button (the boundary's `reset()`). No
  raw stack trace or DB error shown to the user.
- **Detail page — not found** — if `getGoldenPathBySlug(slug)` returns `null`
  (bad or stale slug), call Next.js `notFound()` and render
  `app/catalog/[slug]/not-found.tsx`: heading "Golden Path not found", a line
  explaining the path does not exist, and a "Back to catalog" link.
- **Detail page — load failure** — if `getGoldenPathBySlug` throws, the same
  `error.tsx` boundary handles it with a "Try again" action.
- Not-found (expected: unknown slug) and error (unexpected: data layer failed)
  are deliberately separate states with different copy.

## 12. Success state

- **List page** — the responsive card grid renders all matching Golden Paths;
  the result count is accurate; each card navigates to its detail page.
- **Detail page** — every section in §6 is populated from the record. Because
  the seed guarantees no empty explanation fields (PRD FR-2), each section has
  real content; the layout assumes this and does not need per-section empty
  handling. If a list-valued field is unexpectedly empty, hide that section
  rather than showing an empty heading.
- Success is implicit (content shown) — there is no toast or confirmation
  banner; this is a read-only browsing page.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` per page (the page/path name); section
  headings descend in order (`<h2>`, `<h3>`) with no skipped levels. Use
  `<main>`, `<nav>`, and `<section>` landmarks. The understanding-journey steps
  use an ordered list (`<ol>`); all other multi-item fields use `<ul>`.
- **Cards as links.** Each list card is a single focusable link wrapping the
  card content (one tab stop per card, not several). The accessible name is the
  Golden Path `name`. Visible focus ring on every card and link.
- **Keyboard.** Full keyboard operability: Tab reaches the search input, the
  project-type filter, every card link, the back link, and source links;
  Enter/Space activate. Logical DOM order = visual order.
- **Forms.** The search input has an associated `<label>` (visible or
  `sr-only`); the project-type control is a labelled, keyboard-operable
  select/segmented control with a clear selected state.
- **Loading state.** Skeletons are decorative and `aria-hidden`; the loading
  region carries `aria-busy="true"` so assistive tech announces the page is
  loading rather than empty.
- **States announced.** Empty, no-match, and error messages are real text
  content in the document (announced on navigation), not color-only signals.
- **Color & contrast.** Meets WCAG 2.1 AA contrast in light and dark themes
  (the app uses `next-themes`). Badges and `targetProjectType` tags rely on
  text, not color alone, to convey meaning.
- **Links out.** `sources` links that open a new tab use
  `rel="noopener noreferrer"` and an accessible hint that they open externally.
- **Targets.** Interactive targets (cards, links, controls) are comfortably
  sized for pointer and touch.

## 14. Acceptance criteria

- [ ] `/catalog` lists **all 5** Golden Paths, each as a card showing `name`,
      `summary`, `targetProjectType`, and step count.
- [ ] Each card links to `/catalog/[slug]` using the path's real `slug`.
- [ ] `/catalog/[slug]` renders the full detail: header, who-it's-for /
      `fitCriteria`, `steps`, `learningOutcomes`, `qualityGates`,
      `templatesReferenced`, `rejectedAlternatives`, `risks`, `sources` — every
      field from §5 has a home in the layout.
- [ ] Pages read from the typed data-access layer (`listGoldenPaths`,
      `getGoldenPathBySlug`) server-side — no client fetch, no API route.
- [ ] Search filters the list by `name`/`summary`; the optional project-type
      filter narrows by `targetProjectType`; the result count updates.
- [ ] **Loading** state shows skeletons for both routes.
- [ ] **Empty** state distinguishes an unseeded catalog from a no-match filter.
- [ ] **Error** state: list/detail load failure shows a friendly error with
      "Try again"; an unknown slug shows a "not found" page with a back link.
- [ ] **Success** state renders every populated section with real seed content.
- [ ] Accessibility notes in §13 are satisfied (headings, landmarks, single
      focusable card link, keyboard operability, labelled inputs, AA contrast).
- [ ] Page spec is human-reviewed before the v0 prompt is used (Definition of
      Done, task #33).
