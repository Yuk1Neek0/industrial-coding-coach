# v0 Prompt: Golden Path Catalog page

Issue: #33 · Epic: `golden-path-catalog`

This is the v0.app prompt for the Catalog UI page. It is derived from the page
spec `docs/design/golden-path-catalog-page.md` (read that for the full
contract). Paste the block below into v0.app to generate the UI.

The generated output is a **draft**: it feeds integration task **#34**, where
Claude Code reconciles v0's components with the existing `apps/web` +
`packages/ui` (shadcn/ui) setup and wires the pages to the real data-access
layer. Do not expect v0 to produce final wiring — it produces the interface.

**Stack the output must target** (state this to v0): Next.js App Router, React
Server Components, TypeScript, Tailwind CSS, and shadcn/ui components. Light +
dark mode. Build with mock/sample data only — no data fetching.

---

## Prompt — paste into v0.app

Build a **Golden Path Catalog** for a learning-coach web app, using Next.js
(App Router), React, TypeScript, Tailwind CSS, and shadcn/ui. It has two views:
a **list page** and a **detail page**. Light and dark mode. Use only mock
sample data — do not add any data fetching, API calls, or a database; render
from a typed in-file array so it is trivial to swap for real server data later.

### Domain

A "Golden Path" is a curated, reviewed route for understanding an AI-built
software project. The target user is a job-seeking junior developer who has an
AI-generated project she cannot yet explain. Copy should be plain, encouraging,
and jargon-free. The whole point of the product is that a route is **reasoned,
not a black box** — so the reasoning fields (fit criteria, alternatives
considered, risks, sources) must be clearly visible, never hidden.

Each Golden Path has these fields:

- `slug` — string, URL key (e.g. `ai-native-nextjs-app`)
- `name` — string, the path's title
- `summary` — string, one or two sentences
- `targetProjectType` — string, the kind of project it suits
- `fitCriteria` — string, when to use this path
- `steps` — array of `{ title, detail }`, the ordered understanding journey
- `templatesReferenced` — string array, templates the path builds on
- `qualityGates` — string array, checks that confirm understanding
- `learningOutcomes` — string array, what the user will be able to explain
- `rejectedAlternatives` — array of `{ name, reason }`, routes weighed and not chosen
- `sources` — array of `{ label, url? }`, references
- `risks` — string array, caveats

Seed the mock data with these **five** real Golden Paths (write a short,
plausible `summary`, `fitCriteria`, ~5–6 `steps`, and a few entries for every
other field for each — fully populated, no empty fields, no "lorem ipsum"):

1. **AI-native Next.js App** — understanding a modern AI-assisted Next.js + React web app.
2. **Agentic CCPM Workflow** — understanding a project run with an agentic, issue-driven dev workflow.
3. **Repo Understanding & Review Coach** — understanding an existing repository through structured code review.
4. **Contract-first Fullstack App** — understanding a fullstack app built around a shared API contract / schema.
5. **LLM Observability & Eval App** — understanding an app instrumented for LLM tracing and evaluation.

### List page — route `/catalog`

- A **page header**: title "Golden Path Catalog" and a one-line subtitle
  "Curated routes for understanding an AI-assisted project. Pick the one that
  matches yours."
- A **filter bar** directly below the header: a search text input (shadcn
  `Input`, placeholder "Search Golden Paths", with a search icon) and a
  project-type filter (shadcn `Select` or a segmented control, with an "All
  types" default). Filtering is client-side over the loaded list — search
  matches `name` + `summary` case-insensitively; the type filter matches
  `targetProjectType`.
- A **result count** line, e.g. "5 paths" (updates to "2 of 5 paths" when a
  filter is applied).
- A **responsive card grid** (1 column on mobile, 2–3 on wider screens) of
  Golden Path cards. Use shadcn `Card`. Each card shows: the `name` as the card
  title, the `summary` as the body (clamp to ~2–3 lines), a shadcn `Badge` with
  `targetProjectType`, and a small "N steps" count (from `steps.length`) with a
  list/steps icon. The **entire card is one clickable link** to
  `/catalog/[slug]` — one focus stop per card, with a visible focus ring and a
  subtle hover state.

### Detail page — route `/catalog/[slug]`

A single-column, readable content layout (comfortable max width). From top to
bottom:

1. A **"← Back to catalog"** link to `/catalog`.
2. A **header**: the `name` as an `<h1>`, the `summary` as a lead paragraph,
   and a `Badge` with `targetProjectType`.
3. **"Does this fit your project?"** — show `targetProjectType` and the
   `fitCriteria` text, framed as "Use this path if your project looks like
   this." Put this first; it answers the user's first question.
4. **"The understanding journey"** — the `steps` as a numbered ordered list;
   each step shows its `title` (emphasized) and `detail` text. Consider a
   vertical numbered/stepper style.
5. **"What you'll be able to explain"** — `learningOutcomes` as a checklist-style
   bulleted list (check icons).
6. **"Quality gates"** — `qualityGates` as a bulleted list.
7. **"Templates this builds on"** — `templatesReferenced` rendered as `Badge`
   chips (plain text, not links).
8. **"Alternatives considered"** — `rejectedAlternatives` as a list of
   `name` + `reason` pairs, framed "routes we weighed and why we didn't pick
   them."
9. **"Risks & caveats"** — `risks` as a bulleted list.
10. **"Sources"** — `sources` as a list; render `label` as a link when `url`
    exists (opens in a new tab, `rel="noopener noreferrer"`), plain text
    otherwise.

Group sections 3–10 in shadcn `Card`s (or as clearly headed `<section>`s in one
column). The reasoning sections — "Does this fit", "Alternatives considered",
"Risks & caveats", "Sources" — must be plainly visible; do **not** hide them in
collapsed accordions.

### States — design all of these

- **Loading** — for both routes, a skeleton view using shadcn `Skeleton`: the
  list shows ~5 card-shaped placeholders in the grid; the detail shows a header
  bar plus several stacked section blocks.
- **Empty — catalog not seeded** — when there are zero Golden Paths, a centered
  empty state: heading "No Golden Paths yet" and text "The catalog has not been
  seeded yet." No grid, no spinner.
- **Empty — no filter matches** — when search/filter excludes everything, keep
  the filter bar visible and show an inline message "No Golden Paths match your
  search." with a "Clear filters" button that resets the inputs. Make this
  visibly different from the not-seeded state.
- **Error — load failed** — a friendly error block: heading "Couldn't load the
  catalog", a short explanation, and a "Try again" button. No stack traces.
- **Not found — unknown path** — a detail-page "not found" state: heading
  "Golden Path not found", a short line, and a "Back to catalog" link.

Provide simple toggles or separate preview screens so all of these states can
be viewed.

### Visual & accessibility requirements

- Clean, modern, content-first design. Generous spacing, readable typography,
  calm and trustworthy — this is a learning tool, not a marketing page.
- Fully responsive: comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no hard-coded
  colors).
- Use **lucide-react** icons.
- Semantic HTML: exactly one `<h1>` per page, ordered heading levels with none
  skipped, `<main>` / `<nav>` / `<section>` landmarks. The steps use an `<ol>`;
  other multi-item fields use `<ul>`.
- Each list card is a single focusable link (not multiple tab stops) with a
  visible focus ring; its accessible name is the path `name`.
- The search input has an associated label (visible or `sr-only`); the
  project-type control is labelled and keyboard-operable.
- All text meets WCAG AA contrast in both themes; badges and tags convey
  meaning by text, not color alone.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`),
`Badge`, `Input`, `Select` (or a segmented control), `Skeleton`, `Button`,
`Separator`. lucide-react for icons (search, steps/list, check, arrow-left,
external-link). Keep components small and composable so they integrate cleanly
into an existing shadcn/ui monorepo.

---

## Notes for the integrator (task #34)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives. Add any missing shadcn components there.
- Replace v0's mock data array with calls to the typed data-access layer:
  `listGoldenPaths()` on `/catalog` and `getGoldenPathBySlug(slug)` on
  `/catalog/[slug]` — server-side (React Server Components), no client fetch.
- Map v0's loading/empty/error mockups onto real App Router files:
  `loading.tsx`, `error.tsx`, and a detail `not-found.tsx`; route `null` from
  `getGoldenPathBySlug` through `notFound()`.
- Keep the search/project-type filter client-side (it is a small Client
  Component island over server-loaded data).
- Verify the result against `docs/design/golden-path-catalog-page.md` §14
  acceptance criteria; record integration notes in
  `docs/design/v0-integration-notes/`.
