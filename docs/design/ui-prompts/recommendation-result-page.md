# Claude Design Prompt: Recommendation Result page

Issue: #81 · Epic: `recommendation-engine` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Recommendation Result page. Full contract: the page
spec `docs/design/recommendation-result-page.md` — read that for the complete
behaviour. (Task #81 says "v0"; ADR 0007 replaced v0 with Claude Design — same
page-spec → UI-draft hand-off gate.)

This prompt deliberately mirrors the existing
`docs/design/ui-prompts/template-registry-page.md` so the Recommendation Engine
reads as one product with the M2 Catalog and M3 Registry.

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach the page spec `docs/design/recommendation-result-page.md`
   as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#82** reconciles it with
`apps/web` + `packages/ui` and wires the page to the real M4 data-access layer —
do not expect Claude Design to produce final wiring; it produces the interface.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only —
no data fetching.

---

## Prompt — paste into Claude Design

Build a **Recommendation Result** page for a learning-coach web app, using
Next.js (App Router), React, TypeScript, Tailwind CSS, and shadcn/ui. It is one
route, `/recommend/[id]`. Light and dark mode. Use only mock sample data — no
data fetching, API calls, or database; render from a typed in-file object so it
is trivial to swap for real server data later.

This page is part of the same app as an existing "Golden Path Catalog" and
"Template Registry" — match those features' layout, spacing, card style, and
calm, content-first tone so the whole app reads as one product.

### Domain

The app coaches a **job-seeking junior developer** to genuinely understand a
portfolio project so she can defend it in interviews. This page is the **output
of its Recommendation Engine**: the user has filled in an intake form, and the
engine has produced a recommendation. The whole point is that the recommendation
is **reasoned, not a black box** — it cites real catalog entries, shows the
alternatives it rejected and why, and explains the trade-offs. Copy is plain,
encouraging, and jargon-free.

A recommendation is a hybrid result: a **deterministic scoring engine** decides
the recommended path and templates and the rejected alternatives; a separate
**AI call** writes the human-facing coaching narrative. The narrative is the
product's coaching voice — present it as AI-generated coaching notes, clearly
labelled, not as an oracle's verdict.

A recommendation record has these fields:

- `id` — number
- `intake` — the nine context fields the user submitted: `goal`,
  `experienceLevel`, `knownStack` (string array), `jobTarget`, `timeBudget`,
  `complexityTolerance`, `projectType`, `aiToolPreference`, `learningFocus`
- `recommendedGoldenPath` — `{ slug, name, summary }` (the recommended route)
- `recommendedTemplates` — array of `{ slug, name, summary }` (the building
  blocks, best fit first)
- `rejectedAlternatives` — array of `{ slug, name, kind, reason }` where `kind`
  is `"golden_path" | "template"` (paths/templates considered and not chosen)
- `narrative` — either an object with four fields, or `null`:
  - `whyItFits` — string, prose
  - `complexityRisks` — string, prose
  - `learningCheckpoints` — string array
  - `portfolioValue` — string, prose
- `createdAt`, `updatedAt` — dates

Seed the mock data with one fully populated, realistic example: a junior dev
aiming at a frontend role, recommended the "AI-native Next.js App" Golden Path
with templates like create-next-app and shadcn/ui monorepo, two or three
rejected alternatives with real reasons, and a complete narrative. No "lorem
ipsum".

### Page layout — single readable column, top to bottom

1. A **"← Get another recommendation"** link to `/recommend`.
2. A **result header**: an `<h1>` "Your recommended path", and a muted line
   "Generated {createdAt}" (plus "· edited {updatedAt}" when edited). An
   **"Edit"** button sits in this header (it opens edit mode — see below).
3. **Intake summary** — "What we based this on": the nine `intake` fields shown
   compactly as a definition list or labelled chips ("Goal", "Experience",
   "Known stack", "Job target", "Time budget", "Complexity", "Project type",
   "AI tool", "Learning focus"). This is reference context — secondary to the
   recommendation. It may be a collapsible `Accordion` (collapsed on mobile,
   open on desktop).
4. **Recommended Golden Path** — the headline answer. A prominent `Card`: the
   path `name` as the most visually weighted element on the page, its `summary`,
   and a primary link **"View this Golden Path →"** to `/catalog/[slug]`.
5. **Recommended templates** — "The building blocks for this path": each
   template as a compact card or rich chip showing `name` + one-line `summary`,
   each linking to `/templates/[slug]`.
6. **The trade-off explanation** — the heart of the page (see its own section
   below).

### The trade-off explanation — design this carefully

This is the most important part of the page. It has two parts.

**The coaching narrative** — the four `narrative` fields, each as its own
clearly headed section, generously spaced and readable, in this order:

1. **"Why this fits you"** — the `whyItFits` prose.
2. **"Complexity risks to watch"** — the `complexityRisks` prose, framed as
   honest, friendly caution — not discouragement.
3. **"Learning checkpoints"** — the `learningCheckpoints` array as a
   checklist-style bulleted list with check icons — concrete "you understand
   this when…" milestones.
4. **"Portfolio & interview value"** — the `portfolioValue` prose.

Above or beside these four, show a small, honest label that these are
**AI-generated coaching notes** built on a deterministic recommendation — not a
black box. It should be real text, calm and matter-of-fact.

**Rejected alternatives** — "Other paths we considered — and why we didn't pick
them": the `rejectedAlternatives` array as a list, one row per item, each
showing the alternative's `name`, a small `Badge` for its `kind` ("Golden Path"
or "Template"), its `reason`, and a link to its detail page
(`/catalog/[slug]` or `/templates/[slug]`). This section must be plainly
visible — it is *why the recommendation is trustworthy*, not a footnote. Do
**not** hide it in a collapsed accordion.

Group sections 4–6 in shadcn `Card`s or clearly headed `<section>`s. The
narrative and rejected-alternatives sections must be plainly visible — only the
intake summary (item 3) may be collapsed by default.

### Review & edit mode — design this

The recommendation is **human-editable**. The "Edit" button in the header opens
an in-place **edit mode** over the same layout:

- The recommended Golden Path becomes a `Select` over all Golden Paths (by
  name).
- The recommended templates become an editable multi-select of templates.
- The four narrative fields become editable: three `Textarea`s for the prose
  fields, and an editable list (add / edit / remove rows) for
  `learningCheckpoints`.
- The `intake` summary is **not** editable — it is the fixed input the
  recommendation was based on.
- A **"Save"** primary button and a **"Cancel"** button. Save returns to the
  read view showing the edited values; Cancel discards changes.

Edit mode is a focused, low-ceremony affordance for correcting or tuning a
recommendation — not a full authoring tool.

### States — design all of these

- **Default (narrative present)** — the full page as above, with all four
  narrative sections populated.
- **Narrative unavailable** — when `narrative` is `null`: render the page
  exactly as above **except** replace the four narrative sections with one
  inline panel — heading "Coaching notes aren't ready yet", a short explanation
  ("The recommendation below is ready; the written coaching notes couldn't be
  generated — this can happen if the AI service is unavailable."), and a
  **"Generate coaching notes"** button. The recommended path, templates, and
  rejected alternatives stay fully visible. This is **not** an error state — it
  is a calm, recoverable partial state.
- **Edit mode** — as described above.
- **Loading** — a skeleton result layout (shadcn `Skeleton`): a header bar, a
  prominent recommended-path placeholder, a row of template placeholders, and
  stacked section blocks for the narrative.
- **Not found** — a "recommendation not found" state: heading "Recommendation
  not found", a short line, and a "Get a recommendation" link to `/recommend`.
- **Error** — a friendly load-error block: heading "Couldn't load this
  recommendation", a short explanation, and a "Try again" button. No stack
  traces.

Provide simple toggles or separate preview screens so all of these states can be
viewed.

### Visual & accessibility requirements

- Clean, modern, content-first design. Generous spacing, readable typography,
  calm and trustworthy. Match the existing Catalog and Registry pages.
- Fully responsive: comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no hard-coded
  colors).
- Use **lucide-react** icons.
- Semantic HTML: exactly one `<h1>` (the page title), ordered heading levels
  with none skipped, `<main>` / `<nav>` / `<section>` landmarks. Multi-item
  fields (templates, learning checkpoints, rejected alternatives, intake chips)
  use `<ul>`.
- Links to the catalog/registry have accessible names that include the target
  name ("View Golden Path: AI-native Next.js App"); visible focus ring on every
  link and control.
- Edit mode: every control has an associated `<label>`; opening edit mode moves
  focus into the first field, cancelling returns focus to the Edit button; the
  mode change is announced via an `aria-live` note.
- The "AI-generated coaching notes" label and the not-found / error /
  narrative-unavailable messages are real, announced text — never color-only or
  icon-only.
- Full keyboard operability in logical (DOM = visual) order; Enter/Space
  activate.
- All text meets WCAG AA contrast in both themes; the `kind` badges convey
  meaning by text, not color alone.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`),
`Badge`, `Button`, `Separator`, `Accordion` (for the intake summary),
`Select`, `Textarea`, `Input`, `Label`, `Skeleton`. lucide-react for icons
(arrow-left, arrow-right, check, sparkles/bot for the AI-notes label,
external-link, pencil for edit, alert-circle). Keep components small and
composable so they integrate cleanly into an existing shadcn/ui monorepo —
reuse `packages/ui` rather than duplicating primitives.

---

## Notes for the integrator (task #82)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives. Add any missing shadcn components there.
- Replace the design's mock object with real server-side reads (React Server
  Components, no client fetch, no API route):
  - `getRecommendationById(id)` from `@workspace/db` — `null` → `notFound()`.
  - Resolve cited slugs to full entries: `getGoldenPathBySlug(slug)` for the
    recommended path and golden-path alternatives, `resolveTemplates(slugs)` for
    the recommended templates, `getTemplateBySlug(slug)` for template
    alternatives.
- The stored `rejectedAlternatives` carry `{ slug, kind, reason }` — the `name`
  is not stored; resolve it from the catalog by `slug`/`kind`. Fall back to the
  raw `slug` if a resolve unexpectedly returns `null`.
- The `narrative` column is genuinely nullable. Render the
  narrative-unavailable panel when it is `null`; the "Generate coaching notes"
  action runs `generateRecommendationNarrative(...)` and persists the result via
  `updateRecommendation(id, { narrative })`.
- Edit mode (FR-7): "Save" calls `updateRecommendation(id, edit)` with a
  `RecommendationEdit` ({ `recommendedGoldenPathSlug?`,
  `recommendedTemplateSlugs?`, `rejectedAlternatives?`, `narrative?` }) — a
  server action; `intake` is never editable. Keep edit mode a small Client
  Component island over the server-rendered read view.
- Map the design's loading/not-found/error mockups onto real App Router files:
  `loading.tsx`, `error.tsx`, and `not-found.tsx`.
- Verify the result against `docs/design/recommendation-result-page.md` §14
  acceptance criteria; record integration notes in
  `docs/design/ui-integration-notes/`.
