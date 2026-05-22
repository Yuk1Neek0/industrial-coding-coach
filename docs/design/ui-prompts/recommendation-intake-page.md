# Claude Design Prompt: Recommendation Intake page

Issue: #81 · Epic: `recommendation-engine` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Recommendation Intake page. Full contract: the page
spec `docs/design/recommendation-intake-page.md` — read that for the complete
behaviour. (Task #81 says "v0"; ADR 0007 replaced v0 with Claude Design — same
page-spec → UI-draft hand-off gate.)

This prompt deliberately mirrors the existing
`docs/design/ui-prompts/template-registry-page.md` so the Recommendation Engine
reads as one product with the M2 Catalog and M3 Registry.

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach the page spec `docs/design/recommendation-intake-page.md`
   as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#82** reconciles it with
`apps/web` + `packages/ui` and wires the form's submit to the real M4 engine —
do not expect Claude Design to produce final wiring; it produces the interface.

**Stack to target:** Next.js App Router, React, TypeScript, Tailwind CSS,
shadcn/ui. Light + dark mode. Build with no data fetching — the form is
self-contained.

---

## Prompt — paste into Claude Design

Build a **Recommendation Intake** form page for a learning-coach web app, using
Next.js (App Router), React, TypeScript, Tailwind CSS, and shadcn/ui. It is one
route, `/recommend`. Light and dark mode. No data fetching, no API calls, no
database — it is a self-contained form; render preset options from typed in-file
arrays.

This page is part of the same app as an existing "Golden Path Catalog" and
"Template Registry" — match those features' layout, spacing, card style, and
calm, content-first tone so the whole app reads as one product.

### Domain

The app coaches a **job-seeking junior developer** to genuinely understand a
portfolio project — the stack, the architecture, the trade-offs — so she can
defend it in interviews. This page is the entry point of its **Recommendation
Engine**: the user describes her context, and the engine recommends a "Golden
Path" (a curated route for building and understanding a kind of project) plus a
set of templates, with the trade-offs.

The target user is early-career and may not know much jargon. Copy must be
plain, warm, and encouraging. The form should feel like a few thoughtful
questions, never an interrogation.

### The form — nine fields, three groups

A single page (not a multi-step wizard) with a **page header** — title "Get a
recommendation" and a subtitle "Tell us about your goal and your skills. We'll
recommend a Golden Path and a set of templates — with the trade-offs, so you can
defend the choices." — followed by the form.

Group the nine fields into **three labelled fieldsets**, each a `<fieldset>`
with a `<legend>`, so the form reads as three short steps:

**Group 1 — "About you"**

- **Experience level** — a single-choice control (shadcn `RadioGroup` or
  `Select`). Options: "Just starting out", "Built a few small projects",
  "Junior professional", "Career-changer with other experience".
- **Known stack** — a **multi-value tag input**: the user adds several
  technologies as removable chips (type a value, press Enter to add; remove with
  a labelled ✕ on each chip or Backspace). Offer quick-add suggestion chips:
  JavaScript, TypeScript, React, Next.js, Node, Python, HTML/CSS, Tailwind, SQL,
  Git. Free-text entry of any other technology is allowed. This field may be
  left empty — helper text: "Leave blank if you're brand new."
- **Job target** — a `Select` with a free-text option. Options: "Frontend
  developer", "Full-stack developer", "Backend developer", "AI / LLM engineer",
  "Not sure yet".

**Group 2 — "Your project"**

- **Goal** — a `Textarea`. Helper: "What do you want to build or achieve?"
  Placeholder: "Build a portfolio web app I can explain in interviews."
- **Project type** — a `Select` with a free-text option. Options: "A web app",
  "A full-stack app with an API", "An AI / LLM-powered app", "A developer tool /
  workflow", "Not sure yet".
- **Learning focus** — a `Textarea`. Helper: "What do you most want to be able
  to explain afterwards?" Placeholder: "How routing and the server/client split
  work."

**Group 3 — "Your constraints"**

- **Time budget** — a single-choice control. Options: "A weekend", "A few
  weeks", "A couple of months", "Open-ended".
- **Complexity tolerance** — a single-choice control. Options: "Low — keep it
  simple", "Moderate", "High — I want a challenge".
- **AI-tool preference** — a `Select`. Options: "Claude Code", "Cursor",
  "GitHub Copilot", "ChatGPT / other chat", "No preference".

Every field has a visible `<label>` and a one-line helper text beneath it
explaining, in plain words, *why* the question is asked. Keep the form
comfortably spaced and easy to scan; the three groups should be visually
distinct (e.g. each in a `Card`, or separated headed sections).

### Submit area

Below the form: a primary **"Get my recommendation"** button and a short muted
reassurance line: "This takes a few seconds while we write your coaching notes."

### States — design all of these

- **Default** — the form as above, every field at its placeholder / unselected
  default. (This is also the "first visit" state — no special empty screen.)
- **Submitting / loading** — when the user submits, the engine runs a quick
  scoring step **and a few-second AI call** to write the coaching notes. Show
  this: disable the whole form and the submit button; the button shows a spinner
  and the label "Writing your recommendation…"; a status line reads "Scoring
  Golden Paths and writing your coaching notes — a few seconds." Keep the form
  fields visible (just inert) so the user keeps context — do not replace them
  with a skeleton.
- **Validation error** — if a required field is empty on submit, block
  submission and show an inline, field-level message beneath that field (e.g.
  "Tell us your goal so we can match it"). Known stack is the only field that
  may be empty; the other eight are required. Messages are real text, never
  color-only. Focus moves to the first invalid field.
- **Engine error** — a friendly full-page error block (heading "Couldn't build
  your recommendation", a short explanation, a "Try again" button). No stack
  traces. Provide a way to preview this state.

Provide simple toggles or separate preview screens so all of these states can be
viewed. (On a successful submit, the real app navigates to a separate result
page — you do not need to build that here; a successful submit can just show the
loading state.)

### Visual & accessibility requirements

- Clean, modern, content-first design. Generous spacing, readable typography,
  calm and trustworthy — this is a learning tool, not a marketing page. Match
  the existing Catalog and Registry pages.
- Fully responsive: comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no hard-coded
  colors).
- Use **lucide-react** icons.
- Semantic HTML: exactly one `<h1>` (the page title), a `<main>` landmark, and
  the three field groups as `<fieldset>`s with `<legend>`s.
- Every field has a programmatically associated `<label>`; helper text is linked
  to its input via `aria-describedby`.
- The **known-stack tag input** is fully keyboard-operable: type + Enter adds a
  chip, each chip has a labelled remove control with an accessible name ("Remove
  React"), Backspace removes the last chip.
- Invalid fields set `aria-invalid` and link their error message via
  `aria-describedby`; focus moves to the first invalid field on a failed submit.
- The submit region carries `aria-busy="true"` while submitting; the disabled
  state is not conveyed by color alone.
- Full keyboard operability in logical (DOM = visual) order, with a visible
  focus ring throughout.
- All text meets WCAG AA contrast in both themes; required-field and error
  indication use text, not color alone.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`),
`Input`, `Textarea`, `Select`, `RadioGroup`, `Badge` (for the known-stack
chips), `Button`, `Label`, `Separator`. lucide-react for icons (e.g. sparkles /
wand for the submit, plus, x, info, user, folder, sliders). Keep components
small and composable so they integrate cleanly into an existing shadcn/ui
monorepo — reuse `packages/ui` rather than duplicating primitives.

---

## Notes for the integrator (task #82)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives. Add any missing shadcn components there.
- The form is a Client Component. Its submit calls a **server action** that
  builds a `RecommendationIntake` (the nine fields) and runs the M4 engine, all
  in `@workspace/db` server-side: `scoreRecommendation(...)` →
  `generateRecommendationNarrative(...)` → `createRecommendation(...)` — then
  `redirect("/recommend/" + id)`.
- The narrative call (`generateRecommendationNarrative`) may fail independently;
  the `narrative` column is nullable. A failed narrative still produces a saved
  recommendation and the user still lands on `/recommend/[id]` — do **not** block
  the flow on it. Only a scoring/persist failure is a page error.
- Keep the form's preset option arrays as typed in-file constants; they are UX
  convenience — the engine scores free text, so a custom value is valid.
- Map the design's loading/validation/error mockups onto real behaviour: a
  `useFormStatus`/pending state for loading, field-level validation before the
  action runs, and a route `error.tsx` for an engine failure.
- Verify the result against `docs/design/recommendation-intake-page.md` §14
  acceptance criteria; record integration notes in
  `docs/design/ui-integration-notes/`.
