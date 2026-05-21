# Claude Design Prompt: Template Registry page

Issue: #47 · Epic: `template-registry` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Template Registry page. Full contract: the page
spec `docs/design/template-registry-page.md` — read that for the complete
behaviour. (Task #47 says "v0"; ADR 0007 replaced v0 with Claude Design — same
page-spec → UI-draft hand-off gate.)

This prompt deliberately mirrors `docs/design/ui-prompts/golden-path-catalog-page.md`
so the registry and the M2 Catalog read as one product.

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach the page spec `docs/design/template-registry-page.md`
   as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#48** reconciles it with
`apps/web` + `packages/ui` and wires the pages to the real data-access layer —
do not expect Claude Design to produce final wiring; it produces the interface.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only —
no data fetching.

---

## Prompt — paste into Claude Design

Build a **Template Registry** for a learning-coach web app, using Next.js
(App Router), React, TypeScript, Tailwind CSS, and shadcn/ui. It has two views:
a **list page** and a **detail page**. Light and dark mode. Use only mock
sample data — do not add any data fetching, API calls, or a database; render
from a typed in-file array so it is trivial to swap for real server data later.

This page is the sibling of an existing "Golden Path Catalog" in the same app —
match that feature's layout, spacing, card style, and calm, content-first tone
so the two read as one product.

### Domain

A **template** is a reusable, real-world building block that software projects
start from — a project scaffold (`create-next-app`), an agentic workflow toolkit
(`ccpm`), a CI config, a security tool, a document template, an API contract, or
an observability starter. A "Golden Path" (a curated route for understanding an
AI-built project) references templates by slug; this registry is where those
slugs become real, explained entries.

The target user is a job-seeking junior developer who has an AI-generated
project she cannot yet explain. Copy should be plain, encouraging, and
jargon-free. The whole point of the product is that a building block is
**reasoned, not a black box** — so the reasoning fields (why it's used, fit,
alternatives, risks, sources) must be clearly visible, never hidden.

Each template has these fields:

- `slug` — string, URL key (e.g. `create-next-app`)
- `name` — string, the template's title
- `category` — string, one of: Project Scaffold, Agentic Workflow, CI,
  Security, Doc/Spec Template, Contract, Observability
- `summary` — string, one or two sentences
- `whatItGenerates` — string, what you get when you use this template
- `whyUsed` — string, the reasoning for choosing this building block
- `fitCriteria` — string, a plain-language "use this template when…" summary
- `fitFactors` — array of `{ label, weight, note }`, where `weight` is
  `"strong" | "moderate" | "weak"` — the structured fit breakdown
- `risks` — string array, caveats
- `alternatives` — array of `{ name, reason }`, building blocks weighed and not chosen
- `learningNotes` — string array, what the user will be able to explain
- `sources` — array of `{ label, url? }`, references

Seed the mock data with these **fifteen** real templates (write a short,
plausible `summary`, `whatItGenerates`, `whyUsed`, `fitCriteria`, 2–4
`fitFactors`, and a few entries for every other field for each — fully
populated, no empty fields, no "lorem ipsum"):

- **Project Scaffold:** shadcn/ui monorepo, create-next-app, T3 stack
- **Agentic Workflow:** claude-code-templates, CCPM, GitHub Spec Kit, BMAD
- **CI:** GitHub Actions Node CI
- **Security:** CodeQL, Gitleaks, Dependabot
- **Doc/Spec Template:** ADR template, PRD template
- **Contract:** OpenAPI contract-first template
- **Observability:** Langfuse integration starter

### List page — route `/templates`

- A **page header**: title "Template Registry" and a one-line subtitle "The
  building blocks behind the Golden Paths. Browse the templates a project is
  built on and see how each one fits."
- A **filter bar** directly below the header: a search text input (shadcn
  `Input`, placeholder "Search templates", with a search icon), a category
  filter (shadcn `Select` or a segmented control, with an "All categories"
  default), and a **view toggle** (segmented control) for "Grouped by category"
  vs "Flat grid". Filtering is client-side over the loaded list — search matches
  `name` + `summary` case-insensitively; the category filter matches `category`.
- A **result count** line, e.g. "15 templates" (updates to "4 of 15 templates"
  when a filter is applied).
- The **template list** as a responsive card grid (1 column on mobile, 2–3 on
  wider screens). Default view is **grouped by category**: each category is a
  `<section>` with a heading and a small count (e.g. "Project Scaffold · 3"),
  with its template cards below; the "Flat grid" toggle drops the headings and
  shows one grid. Use shadcn `Card`. Each card shows: the `name` as the card
  title, a shadcn `Badge` with `category`, the `summary` as the body (clamp to
  ~2–3 lines), and a compact **fit indicator** — a small badge group reading
  e.g. "Fit: 3 factors · 2 strong" (factor count + strongest weight). The
  **entire card is one clickable link** to `/templates/[slug]` — one focus stop
  per card, with a visible focus ring and a subtle hover state.

### Detail page — route `/templates/[slug]`

A single-column, readable content layout (comfortable max width). From top to
bottom:

1. A **"← Back to registry"** link to `/templates`.
2. A **header**: the `name` as an `<h1>`, the `summary` as a lead paragraph,
   and a `Badge` with `category`.
3. **"What it generates"** — the `whatItGenerates` text, framed "what you get
   when you use this template." Put this first; it answers the most concrete
   question.
4. **"Why it's used"** — the `whyUsed` text.
5. **"Template Fit"** — the **Template Fit Score** component (see its own
   section below). This is the most important new element on the page.
6. **"What you'll be able to explain"** — `learningNotes` as a checklist-style
   bulleted list (check icons).
7. **"Alternatives considered"** — `alternatives` as a list of `name` +
   `reason` pairs, framed "other building blocks we weighed and why we picked
   this one."
8. **"Risks & caveats"** — `risks` as a bulleted list.
9. **"Sources"** — `sources` as a list; render `label` as a link when `url`
   exists (opens in a new tab, `rel="noopener noreferrer"`), plain text
   otherwise.

Group sections 3–9 in shadcn `Card`s (or as clearly headed `<section>`s in one
column). The reasoning sections — "Why it's used", "Template Fit",
"Alternatives considered", "Risks & caveats", "Sources" — must be plainly
visible; do **not** hide them in collapsed accordions.

### Template Fit Score — the new element, design it carefully

The **Template Fit** section is the one genuinely new UI element. It exists so a
template's suitability reads as **reasoned guidance, not an opaque number**.
Important: **do not invent or display a numeric 0–100 score or a star rating** —
fit is presented qualitatively. Build it as one shadcn `Card` with three parts:

1. **Fit headline** — a `CardHeader` titled "Template Fit" with a subtitle "How
   well this template suits a project, and why." Directly below, a short muted
   line: "Fit is shown as reasoned factors, not a single score — a
   recommendation engine (later) weighs these against your project."
2. **Fit criteria callout** — the `fitCriteria` string in a visually distinct
   bordered/tinted panel with a lucide `Target` icon, framed "Use this template
   when your project looks like this."
3. **Fit factors breakdown** — the `fitFactors` array as a list, one row per
   factor, ordered strong → moderate → weak. Each row shows: the factor `label`
   (emphasized); a **weight badge** whose text reads "Strong fit" / "Moderate
   fit" / "Weak fit" (the text is the primary signal — color is only a secondary
   cue); optionally a small 3-segment meter beside the badge (3/2/1 segments
   filled) as a redundant visual; and the one-line `note` explaining why that
   factor has that weight.

The Fit Score is **read-only and static** — it shows seeded data, has no inputs,
and computes nothing. Pick weight badge colors from the shadcn/Tailwind theme
tokens (e.g. a positive tone for strong, neutral for moderate, muted for weak) —
never hard-coded hex, and never color as the only differentiator.

### States — design all of these

- **Loading** — for both routes, a skeleton view using shadcn `Skeleton`: the
  list shows ~6–8 card-shaped placeholders in the grid; the detail shows a
  header bar plus several stacked section blocks, including a skeleton Fit Score
  card.
- **Empty — registry not seeded** — when there are zero templates, a centered
  empty state: heading "No templates yet" and text "The registry has not been
  seeded yet." No grid, no spinner.
- **Empty — no filter matches** — when search/filter excludes everything, keep
  the filter bar visible and show an inline message "No templates match your
  search." with a "Clear filters" button that resets the inputs. Make this
  visibly different from the not-seeded state.
- **Error — load failed** — a friendly error block: heading "Couldn't load the
  registry", a short explanation, and a "Try again" button. No stack traces.
- **Not found — unknown template** — a detail-page "not found" state: heading
  "Template not found", a short line, and a "Back to registry" link.

Provide simple toggles or separate preview screens so all of these states can
be viewed.

### Visual & accessibility requirements

- Clean, modern, content-first design. Generous spacing, readable typography,
  calm and trustworthy — this is a learning tool, not a marketing page. Match
  the existing Golden Path Catalog pages.
- Fully responsive: comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no hard-coded
  colors).
- Use **lucide-react** icons.
- Semantic HTML: exactly one `<h1>` per page, ordered heading levels with none
  skipped, `<main>` / `<nav>` / `<section>` landmarks. Category groups on the
  list page are `<section>`s with headings; multi-item fields use `<ul>`.
- Each list card is a single focusable link (not multiple tab stops) with a
  visible focus ring; its accessible name is the template `name`.
- The search input has an associated label (visible or `sr-only`); the category
  filter and view toggle are labelled and keyboard-operable.
- The fit-factor weight is conveyed by its **text label** first; any color or
  meter is a redundant secondary cue. The list-card fit indicator is text
  ("2 strong"), not a bare colored dot.
- All text meets WCAG AA contrast in both themes; badges and tags convey
  meaning by text, not color alone.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`),
`Badge`, `Input`, `Select` (or a segmented control), `Tabs` or a toggle group
for the view switch, `Skeleton`, `Button`, `Separator`. lucide-react for icons
(search, layout/grid, target, check, arrow-left, external-link, shield/box for
categories). Keep components small and composable so they integrate cleanly
into an existing shadcn/ui monorepo — reuse `packages/ui` rather than
duplicating primitives.

---

## Notes for the integrator (task #48)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives. Add any missing shadcn components there.
- Replace the design's mock data array with calls to the typed data-access
  layer: `listTemplates()` on `/templates` and `getTemplateBySlug(slug)` on
  `/templates/[slug]` — server-side (React Server Components), no client fetch.
- Confirm the real `Template` type from `packages/db` (task #44/#45) against the
  spec's §5 shape — especially the `fitFactors` field. If the stored shape
  differs, map it to the UI contract (a list of named factors, each with a
  coarse weight and a one-line note). Do **not** introduce a numeric score.
- Map the design's loading/empty/error mockups onto real App Router files:
  `loading.tsx`, `error.tsx`, and a detail `not-found.tsx`; route `null` from
  `getTemplateBySlug` through `notFound()`.
- Keep the search/category filter and the view toggle client-side (a small
  Client Component island over server-loaded data).
- Verify the result against `docs/design/template-registry-page.md` §14
  acceptance criteria; record integration notes in
  `docs/design/ui-integration-notes/`.
- The M2 catalog detail page renders `templatesReferenced` as plain chips; a
  separate, explicitly scoped task may later link those chips to
  `/templates/[slug]` — not part of #48 unless scoped in.
