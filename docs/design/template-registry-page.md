# Page Spec: Template Registry

Issue: #47 · Epic: `template-registry` · PRD: `.claude/prds/template-registry.md` (FR-7)

This spec defines the Template Registry UI for Milestone 3. It is the input to
the Claude Design prompt (`docs/design/ui-prompts/template-registry-page.md`)
and to the integration task #48. It must be human-reviewed before the prompt is
run. (UI tool: Claude Design — see ADR 0007. The task file says "v0"; ADR 0007
superseded v0 with Claude Design — same page-spec → UI-draft hand-off gate.)

It deliberately mirrors the M2 Catalog page spec
(`docs/design/golden-path-catalog-page.md`) section-for-section so the registry
and the catalog read as one product. The **Template Fit Score** presentation
(§6a) is the one genuinely new UI element in M3 and is specified explicitly.

---

## 1. Page name

**Template Registry** — a two-route feature: a **list page** of all templates
the Golden Paths build on, and a **detail page** for one template. It is the M3
sibling of the M2 Golden Path Catalog: a Golden Path is a *route*, a template is
a *building block*. The two features share layout, components, and tone.

## 2. User goal

> "A Golden Path tells me my project builds on `create-next-app` or `ccpm` —
> but that's just a name. Show me the catalog of those building blocks, and let
> me read one in full: what it generates, why it's used, what it risks, what the
> alternatives were, and how well it fits a project like mine — without trusting
> a black box."

The user browses the list, scans which templates exist (optionally grouped by
category), opens the one a Golden Path referenced, and reads its full
explanation (what it generates, why used, fit, risks, alternatives, learning
notes, sources).

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She has
one or two AI-built portfolio projects she cannot confidently explain. She can
prompt an AI tool, run `pnpm`, and push to GitHub, but cannot justify a stack or
describe how a change flows through her code.

Design implications:
- **Plain language over jargon.** Section labels and copy must read clearly
  without insider terms. "What it generates", not "scaffold output".
- **Reasoning must be visible, not buried.** Why it's used, risks, alternatives,
  and sources are the point of the product — they exist so a template is never a
  black-box dependency. They get first-class space in the detail layout, not a
  collapsed footnote.
- **Fit must be legible.** The Template Fit Score (§6a) tells Mia, at a glance,
  how well a template suits a kind of project — and *why*. It must read as
  reasoned guidance, never an opaque number.
- **Learning value up front.** Mia's goal is interview readiness; the
  template's learning notes ("what you'll be able to explain") must be easy to
  find.
- **No accounts, no setup.** M3 has no authentication; the page is the same for
  everyone and works immediately.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components.

| Route | Purpose | File |
|---|---|---|
| `/templates` | List view — all 15 templates, browsable by category | `apps/web/app/templates/page.tsx` |
| `/templates/[slug]` | Detail view — one template | `apps/web/app/templates/[slug]/page.tsx` |

- `slug` is the stable identifier on each `templates` row (PRD FR-1) — e.g.
  `create-next-app`, `ccpm`. It is the URL key and the same slug a Golden Path's
  `templatesReferenced` array uses, so a catalog page can deep-link straight to
  a template.
- The detail route is a separate page (not an in-place expansion) so a template
  is linkable, shareable, and bookmarkable — and so the M2 catalog detail page
  can later link `templatesReferenced` chips directly to `/templates/[slug]`.
- A loading UI (`loading.tsx`) and a not-found UI (`not-found.tsx`) accompany
  the detail route. An error boundary (`error.tsx`) covers both routes.
- A "Templates" entry should be added to the app's primary navigation,
  alongside "Catalog" (out of scope to design here, but the page assumes it is
  reachable from a nav link).

## 5. Data source / contract

The page is a **thin server-side view** over the typed template data-access
layer (`@workspace/db`, task #45). No client-side fetching, no API route —
Server Components call the data layer directly. There is no separate server
process; the registry is a table in the same local SQLite file as the catalog
(ADR 0006).

Two functions:

```ts
// List page — /templates
listTemplates(): Promise<Template[]>

// Detail page — /templates/[slug]
getTemplateBySlug(slug: string): Promise<Template | null>
```

`getTemplateBySlug` returns `null` when no row matches — the detail page treats
`null` as not-found (see §11). Category grouping on the list page is derived
client-side from the `category` field of the loaded list (no separate
`listByCategory` call is needed for the UI; that data-layer function exists for
server use, PRD FR-5).

### Template record shape

Each `Template` carries (PRD FR-1):

| Field | Type | Used by |
|---|---|---|
| `slug` | `string` | URL key; list links; detail lookup |
| `name` | `string` | List card title; detail H1 |
| `category` | `string` | List grouping/filter; detail badge (see §5a) |
| `summary` | `string` | List card body; detail intro line |
| `whatItGenerates` | `string` | Detail — "What it generates" |
| `whyUsed` | `string` | Detail — "Why it's used" |
| `fitCriteria` | `string` | Detail — Fit Score section: the plain-language "use it when" |
| `fitFactors` | `{ label: string; weight: "strong" \| "moderate" \| "weak"; note: string }[]` | Detail — Fit Score section: the scored breakdown (see §6a) |
| `risks` | `string[]` | Detail — "Risks & caveats" |
| `alternatives` | `{ name: string; reason: string }[]` | Detail — "Alternatives considered" |
| `learningNotes` | `string[]` | Detail — "What you'll be able to explain" |
| `sources` | `{ label: string; url?: string }[]` | Detail — "Sources" |

The 15 seeded entries (PRD FR-2, task #46): shadcn/ui monorepo, create-next-app,
T3 stack, claude-code-templates, CCPM, GitHub Spec Kit, BMAD, GitHub Actions
Node CI, CodeQL, Gitleaks, Dependabot, ADR template, PRD template, OpenAPI
contract-first template, Langfuse integration starter.

> **Note on `fitFactors`.** The PRD stores `fit_factors` as a JSON column and
> leaves the runtime scoring algorithm to M4. For M3's UI, `fitFactors` is the
> *structured* fit data the page renders. The exact field shape above is the
> shape the page spec assumes; if task #44/#45 lands a slightly different shape,
> the integrator (#48) maps it — the UI contract is "a list of named factors,
> each with a coarse weight and a one-line note." No numeric 0–100 score is
> invented or stored in M3 (see §6a).

### 5a. Template categories

Each template belongs to exactly one **category** (PRD FR-3), used for list
grouping/filtering and shown as a badge on the detail header. The category set:

| Category | Example templates |
|---|---|
| Project Scaffold | shadcn/ui monorepo, create-next-app, T3 stack |
| Agentic Workflow | claude-code-templates, CCPM, GitHub Spec Kit, BMAD |
| CI | GitHub Actions Node CI |
| Security | CodeQL, Gitleaks, Dependabot |
| Doc/Spec Template | ADR template, PRD template |
| Contract | OpenAPI contract-first template |
| Observability | Langfuse integration starter |

The list page derives its category set from the distinct `category` values of
the loaded templates — it does not hard-code the list above.

## 6. Page sections

### List page — `/templates`

1. **Page header** — page title "Template Registry" and a one-line description:
   "The building blocks behind the Golden Paths. Browse the templates a project
   is built on and see how each one fits."
2. **Filter / search bar** — a text input plus a category filter (see §7).
3. **View toggle** — a control to switch between **Grouped by category**
   (default) and a **flat grid**. Grouped is the default because browsing by
   category is a PRD acceptance criterion (US-1).
4. **Template list** — a responsive grid of cards, one per template. In grouped
   view, cards are organized under category section headings, each with a small
   per-category count. Each card shows: `name` (title), `category` (a badge),
   `summary` (body, clamped to ~2–3 lines), and a compact **fit indicator** —
   the count of `fitFactors` plus the strongest factor weight, rendered as a
   small badge group (e.g. "Fit: 3 factors · 2 strong"). The whole card is a
   link to `/templates/[slug]`.
5. **Result count** — small text, e.g. "15 templates" / "4 of 15 templates"
   when a filter is active.

### Detail page — `/templates/[slug]`

1. **Back link** — "← Back to registry" to `/templates`.
2. **Detail header** — `name` (H1), `summary` (lead paragraph), and a
   `category` badge.
3. **What it generates** — the `whatItGenerates` string, framed "what you get
   when you use this template." First content section: it answers Mia's most
   concrete question.
4. **Why it's used** — the `whyUsed` string — the reasoning for choosing this
   building block.
5. **Template Fit Score** — `fitCriteria` plus the `fitFactors` breakdown,
   rendered as the **Template Fit Score** component (specified in §6a). This is
   the one genuinely new UI element in M3.
6. **What you'll be able to explain** — `learningNotes` as a checklist-style
   bulleted list. Mia's interview-readiness payoff.
7. **Alternatives considered** — `alternatives` as a list of `name` + `reason`
   pairs, framed "other building blocks we weighed and why we picked this one."
   Reinforces "this is reasoned, not a black box."
8. **Risks & caveats** — `risks` as a bulleted list.
9. **Sources** — `sources` as a list; render `label` as a link when `url` is
   present, plain text otherwise.

Sections 3–9 may be grouped into shadcn `Card`s, or rendered as headed sections
within one column. Reasoning sections (4, 5, 7, 8, 9) must remain visually
prominent — not hidden behind closed accordions by default.

### 6a. Template Fit Score — the new UI element

The Fit Score is the M3-specific element. It exists so a template's suitability
reads as **reasoned guidance, not an opaque number**. M3 stores structured fit
data only (PRD FR-4); the runtime scoring algorithm is M4. Therefore the Fit
Score UI presents *qualitative, structured* fit — it must **not** invent or
display a numeric 0–100 score in M3.

The component has three parts, top to bottom, inside one `Card`:

1. **Fit headline** — a `CardHeader` reading "Template Fit" with a one-line
   subtitle: "How well this template suits a project, and why." A short
   explanatory line directly below clarifies the M3 scope: "Fit is shown as
   reasoned factors, not a single score — a recommendation engine (later)
   weighs these against your project."

2. **Fit criteria callout** — the `fitCriteria` string in a visually distinct
   block (a bordered/tinted panel, lucide `Target` icon), framed "Use this
   template when your project looks like this." This is the plain-language
   summary a beginner reads first.

3. **Fit factors breakdown** — the `fitFactors` array rendered as a list, one
   row per factor. Each row shows:
   - the factor `label` (e.g. "Modern React stack", "Team already on GitHub");
   - a **weight indicator** for `weight` — a labelled `Badge` whose text is
     "Strong fit" / "Moderate fit" / "Weak fit". The weight is conveyed by the
     **text label first**; color is a secondary cue only (accessibility — §13).
     Optionally a 3-segment meter (3/2/1 segments filled for strong/moderate/
     weak) sits beside the badge as a redundant visual, never the sole signal;
   - the one-line `note` explaining *why* that factor has that weight.

   The factors are ordered strong → moderate → weak so the strongest reasons
   read first. If `fitFactors` is empty (should not happen — the seed populates
   it), the section shows the `fitCriteria` callout alone and omits the
   breakdown rather than showing an empty list.

The Fit Score component is **read-only** and **static** in M3 — it presents
seeded data, has no inputs, and computes nothing client-side. A compact form of
it (factor count + strongest weight) also appears on the list card (§6, item 4)
so fit is visible before opening a template.

## 7. Input fields

On the **list page** only:

| Field | Type | Behaviour |
|---|---|---|
| **Search** | text input | Free-text filter over `name` + `summary` (case-insensitive substring). Placeholder: "Search templates". |
| **Category** | select / segmented control | Filter by `category`; options derived from the distinct values across loaded templates, plus an "All categories" default. |
| **View** | toggle / segmented control | "Grouped by category" (default) vs "Flat grid". Affects layout only, not which templates show. |

Filtering and grouping happen **client-side** over the already-loaded list (only
15 entries, no extra fetch). The detail page has no input fields in M3 — the Fit
Score is read-only (§6a).

## 8. Primary actions

- **Open a template** — click a card on `/templates` → navigate to
  `/templates/[slug]`. This is the main action.
- **Return to the registry** — "Back to registry" link on the detail page.
- **Filter / group the list** — type in search, pick a category, or switch the
  view toggle on `/templates`.
- **Open a source** — click a `sources` entry that has a `url` (opens in a new
  tab, with `rel="noopener noreferrer"`).

No create/edit/delete — the registry is seeded data in M3 (PRD: no authoring UI).

## 9. Loading state

- **List page** — while `listTemplates()` resolves, render a skeleton grid
  (~6–8 card placeholders) via `app/templates/loading.tsx`. Header and filter
  bar may render immediately; the filter is inert until data arrives.
- **Detail page** — while `getTemplateBySlug()` resolves, render a skeleton
  detail layout (header bar + section blocks, including a skeleton Fit Score
  card) via `app/templates/[slug]/loading.tsx`.
- Use shadcn `Skeleton`. Loading should be brief — the data source is a local
  SQLite file — but the state must exist so the page never flashes empty.

## 10. Empty state

- **No templates at all** (`listTemplates()` returns `[]`, e.g. an unseeded DB)
  — show a centered empty state: a short heading "No templates yet" and the
  explanation "The registry has not been seeded. Run the template seed to load
  the templates." No card grid, no spinner.
- **No filter matches** (search/category filter excludes all 15) — keep the
  filter bar visible and show an inline message: "No templates match your
  search." plus a "Clear filters" action that resets the inputs. This is
  distinct from the unseeded-registry state above.

## 11. Error state

- **List page** — if `listTemplates()` throws, the route `error.tsx` boundary
  renders a friendly error: heading "Couldn't load the registry", a short
  explanation, and a "Try again" button (the boundary's `reset()`). No raw
  stack trace or DB error shown to the user.
- **Detail page — not found** — if `getTemplateBySlug(slug)` returns `null`
  (bad or stale slug), call Next.js `notFound()` and render
  `app/templates/[slug]/not-found.tsx`: heading "Template not found", a line
  explaining the template does not exist, and a "Back to registry" link.
- **Detail page — load failure** — if `getTemplateBySlug` throws, the same
  `error.tsx` boundary handles it with a "Try again" action.
- Not-found (expected: unknown slug) and error (unexpected: data layer failed)
  are deliberately separate states with different copy.

## 12. Success state

- **List page** — the responsive card grid renders all matching templates
  (grouped by category by default); the result count is accurate; each card
  shows its compact fit indicator and navigates to its detail page.
- **Detail page** — every section in §6 is populated from the record, including
  a fully rendered Template Fit Score (§6a). Because the seed guarantees no
  empty explanation fields (PRD FR-2), each section has real content; the layout
  assumes this and does not need per-section empty handling. If a list-valued
  field is unexpectedly empty, hide that section rather than showing an empty
  heading.
- Success is implicit (content shown) — there is no toast or confirmation
  banner; this is a read-only browsing page.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` per page (the page/template name);
  section headings descend in order (`<h2>`, `<h3>`) with no skipped levels. Use
  `<main>`, `<nav>`, and `<section>` landmarks. Category groups on the list page
  are `<section>`s with a heading; multi-item fields (`risks`, `learningNotes`,
  `alternatives`, `sources`, `fitFactors`) use `<ul>`.
- **Cards as links.** Each list card is a single focusable link wrapping the
  card content (one tab stop per card, not several). The accessible name is the
  template `name`. Visible focus ring on every card and link.
- **Fit Score is not color-only.** The fit-factor weight is conveyed by a **text
  label** ("Strong fit" / "Moderate fit" / "Weak fit") first; any color or meter
  segments are redundant secondary cues. A meter, if used, has an accessible
  text equivalent. The list-card fit indicator is likewise text ("2 strong"),
  not a bare colored dot.
- **Keyboard.** Full keyboard operability: Tab reaches the search input, the
  category filter, the view toggle, every card link, the back link, and source
  links; Enter/Space activate. Logical DOM order = visual order.
- **Forms.** The search input has an associated `<label>` (visible or
  `sr-only`); the category filter and view toggle are labelled,
  keyboard-operable controls with a clear selected state.
- **Loading state.** Skeletons are decorative and `aria-hidden`; the loading
  region carries `aria-busy="true"` so assistive tech announces the page is
  loading rather than empty.
- **States announced.** Empty, no-match, and error messages are real text
  content in the document (announced on navigation), not color-only signals.
- **Color & contrast.** Meets WCAG 2.1 AA contrast in light and dark themes
  (the app uses `next-themes`). Category badges and fit-weight badges rely on
  text, not color alone, to convey meaning.
- **Links out.** `sources` links that open a new tab use
  `rel="noopener noreferrer"` and an accessible hint that they open externally.
- **Targets.** Interactive targets (cards, links, controls) are comfortably
  sized for pointer and touch.

## 14. Acceptance criteria

- [ ] `/templates` lists **all 15** templates, each as a card showing `name`,
      `category`, `summary`, and a compact fit indicator.
- [ ] The list page supports **browsing by category** — a grouped-by-category
      view (default) with per-category headings and counts.
- [ ] Each card links to `/templates/[slug]` using the template's real `slug`.
- [ ] `/templates/[slug]` renders the full detail: header, `whatItGenerates`,
      `whyUsed`, the **Template Fit Score** (`fitCriteria` + `fitFactors`),
      `learningNotes`, `alternatives`, `risks`, `sources` — every field from §5
      has a home in the layout.
- [ ] The **Template Fit Score** (§6a) presents fit as a plain-language
      criteria callout plus a structured factor breakdown with text-labelled
      weights — **no invented numeric 0–100 score**.
- [ ] Pages read from the typed data-access layer (`listTemplates`,
      `getTemplateBySlug`) server-side — no client fetch, no API route.
- [ ] Search filters the list by `name`/`summary`; the category filter narrows
      by `category`; the result count updates.
- [ ] **Loading** state shows skeletons for both routes (incl. a Fit Score
      skeleton).
- [ ] **Empty** state distinguishes an unseeded registry from a no-match
      filter.
- [ ] **Error** state: list/detail load failure shows a friendly error with
      "Try again"; an unknown slug shows a "not found" page with a back link.
- [ ] **Success** state renders every populated section with real seed content.
- [ ] The spec deliberately mirrors the M2 Catalog page spec
      (`docs/design/golden-path-catalog-page.md`) so the registry and catalog
      feel like one product.
- [ ] Accessibility notes in §13 are satisfied (headings, landmarks, single
      focusable card link, keyboard operability, labelled inputs, non-color-only
      fit weights, AA contrast).
- [ ] Page spec is human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #47).
