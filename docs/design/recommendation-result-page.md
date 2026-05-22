# Page Spec: Recommendation Result

Issue: #81 · Epic: `recommendation-engine` · PRD: `.claude/prds/recommendation-engine.md` (FR-3, FR-4, FR-7, FR-8)

This spec defines the **Recommendation Result** UI for Milestone 4. It is the
input to the Claude Design prompt
(`docs/design/ui-prompts/recommendation-result-page.md`) and to the integration
task #82. It must be human-reviewed before the prompt is run. (UI tool: Claude
Design — see ADR 0007. The task file says "v0"; ADR 0007 superseded v0 with
Claude Design — same page-spec → UI-draft hand-off gate.)

It is the output of the M4 Recommendation Engine. Its sibling is the
**Recommendation Intake** page (`docs/design/recommendation-intake-page.md`); it
shares layout, components, and tone with the M2 Catalog and M3 Registry so the
whole app reads as one product. The **trade-off explanation** (§6, the narrative
and rejected-alternatives sections) and the **review-and-edit** affordance (§6e)
are the genuinely new elements in M4 and are specified explicitly.

---

## 1. Page name

**Recommendation Result** — a single-route page (`/recommend/[id]`) showing one
stored recommendation: the recommended Golden Path and templates, the rejected
alternatives, the coaching narrative, and the intake it was computed from. A
human can review and edit it (FR-7).

## 2. User goal

> "I answered the questions — now show me what to build, *and* convince me. Tell
> me which Golden Path and templates, which alternatives you ruled out and why,
> why this fits me, what's risky, what I should learn, and what it's worth on my
> CV. And let me adjust it if I disagree."

The user reads a tailored recommendation, understands the trade-offs well enough
to defend them, follows links into the Catalog and Registry, and optionally
edits the recommendation.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience.

Design implications:
- **Recommendation, then reasoning.** The headline answer (the recommended path)
  comes first; the *why* — narrative, trade-offs, rejected alternatives — is the
  body of the page and must be prominent, never collapsed away.
- **Not a black box.** The recommendation cites real catalog entries by name and
  links to them. The rejected alternatives are shown with reasons. This is the
  point of the product: a defensible choice, not an oracle's verdict.
- **Coaching tone.** The narrative is interview-prep coaching — plain, concrete,
  encouraging. It is generated prose; it is presented as guidance, clearly the
  product's voice.
- **Editable.** Mia can disagree. The page lets her review and adjust the
  recommendation (FR-7) — reinforcing that she is in control, not a passive
  recipient.
- **No accounts.** M4 has no authentication; a recommendation is reachable by
  its URL.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the page; a small
Client Component island for the edit mode (§6e).

| Route | Purpose | File |
|---|---|---|
| `/recommend/[id]` | One stored recommendation | `apps/web/app/recommend/[id]/page.tsx` |

- `id` is the integer primary key of the `recommendations` row, created by the
  Intake page's submit. It is the URL key.
- A loading UI (`loading.tsx`) and a not-found UI (`not-found.tsx`) accompany
  the route; an error boundary (`error.tsx`) covers it.
- The page is linkable and bookmarkable — a recommendation can be revisited.

## 5. Data source / contract

The page is a **thin server-side view** over the typed M4 data-access layer
(`@workspace/db`, task #80) plus the M2/M3 catalog layers (tasks #44/#45). No
client-side fetching, no API route — Server Components call the data layer
directly (ADR 0006).

```ts
// M4 — the stored recommendation
getRecommendationById(id: number): Promise<Recommendation | null>
updateRecommendation(id: number, edit: RecommendationEdit): Promise<Recommendation | null>

// M2 / M3 — resolve cited slugs to full catalog entries
getGoldenPathBySlug(slug: string): Promise<GoldenPath | null>
resolveTemplates(slugs: string[]): Promise<Template[]>
```

`getRecommendationById` returns `null` when no row matches — the page treats
`null` as not-found (§11).

### Recommendation record shape

A `Recommendation` carries (FR-1, FR-3, FR-5):

| Field | Type | Used by |
|---|---|---|
| `id` | `number` | URL key |
| `intake` | `RecommendationIntake` (the nine fields) | §6a — intake summary |
| `recommendedGoldenPathSlug` | `string` | §6b — resolved via `getGoldenPathBySlug` |
| `recommendedTemplateSlugs` | `string[]` | §6c — resolved via `resolveTemplates` |
| `rejectedAlternatives` | `{ slug: string; kind: "golden_path" \| "template"; reason: string }[]` | §6d — rejected-alternatives section |
| `narrative` | `RecommendationNarrative \| null` | §6 — the four narrative sections; **may be null** |
| `createdAt` / `updatedAt` | `Date` | §6 header — "generated on" line |

`RecommendationNarrative` (FR-3) has exactly four fields:

| Field | Type | Section |
|---|---|---|
| `whyItFits` | `string` | §6 — "Why this fits you" |
| `complexityRisks` | `string` | §6 — "Complexity risks to watch" |
| `learningCheckpoints` | `string[]` | §6 — "Learning checkpoints" |
| `portfolioValue` | `string` | §6 — "Portfolio & interview value" |

> **The narrative is nullable.** The deterministic recommendation always exists;
> the coaching narrative is a bounded LLM call that can fail (no API key, rate
> limit, network). When `narrative` is `null`, the page renders the full
> recommendation and trade-offs and shows a narrative-unavailable state with a
> "Generate coaching notes" action (§11) — it is not a page error.

The cited slugs are guaranteed to resolve to real catalog entries (the M4
referential-integrity test, task #80). If a resolve unexpectedly returns `null`,
the page renders that item by slug rather than crashing.

## 6. Page sections

Top to bottom, single readable column (comfortable max width):

1. **Back link** — "← Get another recommendation" to `/recommend`.
2. **Result header** — title "Your recommended path", and a muted line "Generated
   {createdAt}" (and "· edited {updatedAt}" when the row has been edited). An
   **Edit** button sits here, opening edit mode (§6e).

### 6a. Intake summary

The `intake` context the recommendation was computed from, rendered compactly —
a definition-list / chip layout of the nine fields ("Goal", "Experience", "Known
stack", "Job target", "Time budget", "Complexity", "Project type", "AI tool",
"Learning focus"). Framed "What we based this on." It may be a collapsible
`Accordion` (collapsed by default on mobile, open on desktop) — but it is
**reference context**, secondary to the recommendation itself.

### 6b. Recommended Golden Path

The headline answer. Resolve `recommendedGoldenPathSlug` via
`getGoldenPathBySlug` and render a prominent card: the path `name` (as the most
visually weighted element on the page), its `summary`, and a primary link
**"View this Golden Path →"** to `/catalog/[slug]`. This is the recommendation.

### 6c. Recommended templates

Resolve `recommendedTemplateSlugs` via `resolveTemplates`. Render each template
as a compact card or rich chip — `name` + one-line `summary` — each linking to
`/templates/[slug]`. Framed "The building blocks for this path." Order is the
order returned by the engine (best fit first). If the list is empty, omit the
section.

### 6d. The trade-off explanation — the new M4 element

This is the heart of M4: the recommendation is **reasoned, not an oracle's
verdict**. It has two parts.

**The coaching narrative** — the four `narrative` fields, each its own clearly
headed section, in this order:

1. **Why this fits you** — `narrative.whyItFits`. Prose tying the recommendation
   to the user's intake.
2. **Complexity risks to watch** — `narrative.complexityRisks`. Prose; framed as
   honest caution, not discouragement.
3. **Learning checkpoints** — `narrative.learningCheckpoints` as a
   checklist-style bulleted list (check icons) — concrete "you understand this
   when…" milestones.
4. **Portfolio & interview value** — `narrative.portfolioValue`. Prose tying the
   project to the user's `jobTarget`.

These four are coaching content — give them generous space and readable
typography. They carry a small, honest label that they are AI-generated coaching
notes built on a deterministic recommendation (on-thesis with ADR 0005: visible,
inspectable, not a black box). When `narrative` is `null`, this block is
replaced by the narrative-unavailable state (§11).

**Rejected alternatives** — the `rejectedAlternatives` array, rendered as a list,
one row per alternative: the alternative's **name** (resolve `slug` via
`getGoldenPathBySlug` / `getTemplateBySlug` per its `kind`; fall back to the
`slug` if unresolved), a small badge for `kind` ("Golden Path" / "Template"),
and its `reason`. Framed "Other paths we considered — and why we didn't pick
them." Each resolved alternative links to its catalog/registry detail page so
the user can judge for themselves. This section must be plainly visible — it is
*why the answer is trustworthy*, not a footnote.

### 6e. Review & edit (FR-7)

The recommendation is **human-editable**. The **Edit** button (§6, header) opens
an **edit mode** — an in-place Client Component over the same layout:

- The recommended Golden Path becomes a **select** over all Golden Paths
  (by name).
- The recommended templates become an **editable multi-select** of template
  slugs.
- The four narrative prose/list fields become **editable text areas** (and an
  editable list for `learningCheckpoints`).
- The `intake` is **not** editable — it is the immutable input the
  recommendation was computed from (a new intake means a new recommendation).
- **Save** calls `updateRecommendation(id, edit)` with a `RecommendationEdit`
  ({ `recommendedGoldenPathSlug?`, `recommendedTemplateSlugs?`,
  `rejectedAlternatives?`, `narrative?` }); the page re-renders with the saved
  values and `updatedAt` advances. **Cancel** discards changes and returns to
  the read view.

Edit mode is a focused, low-ceremony affordance — it lets a user correct or
tune a recommendation, not author one from scratch.

Sections 6a–6d may be grouped into shadcn `Card`s or rendered as headed
`<section>`s in one column. The reasoning sections (6d) must remain visually
prominent — never hidden behind closed accordions by default (the intake summary
6a is the one section that may be collapsed).

## 7. Input fields

The read view has **no input fields**. In **edit mode** (§6e): a Golden Path
`Select`, a template multi-select, four narrative text areas, and an editable
checkpoint list — all labelled, all keyboard-operable, with Save and Cancel.

## 8. Primary actions

- **View the recommended Golden Path** — link to `/catalog/[slug]`. The main
  forward action.
- **View a recommended template** — link to `/templates/[slug]`.
- **View a rejected alternative** — link to its catalog/registry detail page.
- **Edit the recommendation** — open edit mode, change fields, Save (FR-7).
- **Generate coaching notes** — when `narrative` is `null`, an action to run the
  bounded narrative call and persist it (§11).
- **Get another recommendation** — the back link to `/recommend`.

## 9. Loading state

While `getRecommendationById` (and the catalog resolves) run, render a skeleton
result layout via `app/recommend/[id]/loading.tsx`: a header bar, a prominent
recommended-path placeholder, a row of template placeholders, and stacked
section blocks for the narrative. Use shadcn `Skeleton`. The data source is a
local SQLite file, so loading is brief — but the state must exist so the page
never flashes empty.

## 10. Empty state

A recommendation always has a deterministic result (a recommended path, at least
one rejected alternative — guaranteed by the engine), so there is **no
"empty recommendation" state**. The one partial state is a **null narrative**,
handled as §11, not as an empty state. There is no list on this page to be
empty.

## 11. Error state

- **Not found** — if `getRecommendationById(id)` returns `null`, or `id` is not
  a valid integer, call Next.js `notFound()` and render
  `app/recommend/[id]/not-found.tsx`: heading "Recommendation not found", a line
  explaining it does not exist, and a "Get a recommendation" link to
  `/recommend`.
- **Load failure** — if the data layer throws, the route `error.tsx` boundary
  renders a friendly error: heading "Couldn't load this recommendation", a short
  explanation, and a "Try again" button (`reset()`). No raw stack trace.
- **Narrative unavailable (not an error)** — when `narrative` is `null`, the §6d
  narrative block is replaced by an inline panel: heading "Coaching notes aren't
  ready yet", a short explanation ("The recommendation below is ready; the
  written coaching notes couldn't be generated — this can happen if the AI
  service is unavailable."), and a **"Generate coaching notes"** button that runs
  the bounded narrative call and, on success, persists it via
  `updateRecommendation` and re-renders. If that call also fails, show the same
  panel with a quiet "try again" — never a stack trace, never a blocking error.
  The recommended path, templates, and rejected alternatives stay fully visible
  throughout.
- Not-found (expected: unknown id) and load-error (unexpected: data layer
  failed) are deliberately separate states with different copy.

## 12. Success state

- The page renders the recommended Golden Path prominently, the recommended
  templates, the four narrative sections, and the rejected alternatives — every
  field of §5 has a home in the layout.
- When a narrative is present, all four narrative sections show real content;
  when it is null, §11's narrative-unavailable panel shows instead and the rest
  of the page is unaffected.
- After an **edit** is saved, the page shows the updated values and the header's
  "edited {updatedAt}" line; a brief, non-blocking confirmation (a toast or an
  inline note) acknowledges the save.
- Success is otherwise implicit (content shown) — this is a read-first page.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (the page title); section headings
  descend in order (`<h2>`, `<h3>`) with no skipped levels. Use `<main>`,
  `<nav>`, and `<section>` landmarks. Multi-item fields
  (`recommendedTemplateSlugs`, `learningCheckpoints`, `rejectedAlternatives`,
  the intake chips) use `<ul>`.
- **Reading order.** DOM order = visual order: header → intake summary →
  recommended path → templates → narrative → rejected alternatives. Logical for
  a screen reader top to bottom.
- **Links.** Catalog/registry links have accessible names that include the
  target name ("View Golden Path: AI-native Next.js App"). Visible focus ring on
  every link and control.
- **Edit mode.** Every edit control has an associated `<label>`; entering and
  leaving edit mode moves focus predictably (into the first field on open, back
  to the Edit button on cancel). Save/Cancel are real buttons. The mode change
  is announced (e.g. an `aria-live` note "Editing recommendation").
- **Narrative provenance.** The "AI-generated coaching notes" label is real
  text, announced — not a color-only or icon-only signal.
- **States announced.** The not-found, error, and narrative-unavailable messages
  are real text content in the document, announced on navigation — not
  color-only signals. The narrative-unavailable panel is an `aria-live` region
  if it appears after an action.
- **Loading state.** Skeletons are decorative and `aria-hidden`; the loading
  region carries `aria-busy="true"`.
- **Keyboard.** Full keyboard operability in logical order: every link, the Edit
  button, all edit-mode controls, Save/Cancel, and the "Generate coaching notes"
  action are reachable; Enter/Space activate.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes (the app
  uses `next-themes`). The `kind` badges on rejected alternatives convey meaning
  by text, not color alone.
- **Targets.** Interactive targets are comfortably sized for pointer and touch.

## 14. Acceptance criteria

- [ ] `/recommend/[id]` renders one stored recommendation read from the typed
      data-access layer server-side — no client fetch, no API route.
- [ ] The **recommended Golden Path** is shown prominently with its name and
      summary and links to `/catalog/[slug]`.
- [ ] The **recommended templates** are listed, each linking to
      `/templates/[slug]`.
- [ ] The **coaching narrative** renders all four dimensions — why it fits,
      complexity risks, learning checkpoints, portfolio value — each in its own
      clearly headed section, labelled as AI-generated coaching notes.
- [ ] The **rejected alternatives** are shown, each with its name, a `kind`
      badge, a reason, and a link to its detail page — plainly visible, not a
      footnote.
- [ ] The **intake summary** shows the nine fields the recommendation was based
      on.
- [ ] A **null narrative** renders the narrative-unavailable panel with a
      "Generate coaching notes" action — the recommendation and trade-offs stay
      fully visible; it is **not** treated as a page error.
- [ ] **Review & edit** (FR-7): an Edit mode lets a human change the recommended
      path, templates, and narrative fields and Save via `updateRecommendation`;
      the intake is not editable; `updatedAt` advances and the page reflects the
      edit.
- [ ] **Loading** state shows a skeleton result layout.
- [ ] **Error** state: an unknown/invalid `id` shows a "not found" page with a
      link back to `/recommend`; a load failure shows a friendly "Try again"
      error.
- [ ] The page reads as one product with the M2 Catalog and M3 Registry —
      shared layout, spacing, and calm, content-first tone.
- [ ] Accessibility notes in §13 are satisfied (one `<h1>`, ordered headings,
      landmarks, accessible links, focus management in edit mode, announced
      states, AA contrast).
- [ ] Page spec is human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #81).
