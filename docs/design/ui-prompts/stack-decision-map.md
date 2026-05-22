# Claude Design Prompt: Stack Decision Map

Issue: #88 · Epic: `stack-explainer` (M5) · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Stack Decision Map component. Full contract: the
spec `docs/design/stack-decision-map.md`. This component renders inside the
Stack Explanation page (`docs/design/stack-explanation-page.md`, section 3).

## How to use this (Claude Design)

1. In Claude Design, in the **same project** as the Stack Explanation page,
   with this repository linked so it uses the real `packages/ui` components.
2. Optionally attach `docs/design/stack-decision-map.md`.
3. Paste the prompt below; iterate on the canvas.
4. Export via **"Handoff to Claude Code"** and return it here.

The output is a **draft**. Integration task **#89** wires it into the page.

**Stack to target:** Next.js App Router, React, TypeScript, Tailwind CSS,
shadcn/ui. Light + dark mode. Mock/sample data only.

---

## Prompt — paste into Claude Design

Build a **Stack Decision Map** component for a learning-coach web app, using
React, TypeScript, Tailwind CSS, and shadcn/ui. It is a presentational
component — it receives data as props and renders it; no data fetching, no API
calls. Light and dark mode.

### Domain

The component is the centerpiece of a page that explains why a junior
developer's project uses its technology stack. The Decision Map shows the
stack **one tool at a time**: for each tool, what it does in *this* project and
why it matters for the job market. The target user is a beginner preparing for
interviews — each tool's purpose should read as something she could say out
loud to an interviewer.

The component receives a `tools` array. Each tool is:

- `name` — string, e.g. "Next.js", "Drizzle ORM", "Vitest".
- `purpose` — string, what the tool does in this specific project, in plain
  language (e.g. "Renders every page and route under `apps/web/app/`").
- `jobRelevance` — string, why this tool matters for someone job-hunting.
- `alternatives` — array of `{ name, tradeOff }` — **do not render the
  trade-offs here**; they belong to a separate Alternatives Comparison UI. You
  may show a small "See alternatives →" link when the array is non-empty.

### The component

A single section, under a heading "Stack decision map" (assume the host page
supplies the `<h2>`; render an `<h3>` per tool). Render a **list of tool
cards**, one per tool, in the order given.

Each tool card:
1. The **tool name** as the card heading (`<h3>`). Optionally a small category
   chip beside it (e.g. "framework", "database") — design it but treat
   category as optional; if absent, just show the name.
2. The **purpose** text as the card's main body.
3. A visually distinct **job-relevance callout** — a tinted box or a clearly
   labelled "Why it matters for jobs" line — set apart from the purpose so it
   reads as an interview-oriented note, not more description.
4. When the tool has alternatives, a quiet **"See alternatives →"** link at the
   bottom of the card (it will scroll to that tool in the Alternatives
   Comparison; in the mock it can be a placeholder anchor).

Layout: a single readable column of full-width cards on mobile; on wide
viewports a two-column grid is acceptable but keep each card comfortably
readable — favor clarity over density. Long `purpose` text wraps fully; never
truncate meaning.

### States

- **Populated** — the normal state: the column/grid of tool cards. Provide a
  sample of 5–7 tools spanning different kinds (a framework, a UI library, a
  database/ORM, a testing tool, a build tool) so the design is exercised.
- **Empty** — if `tools` is empty, render a single quiet line "No major tools
  were identified for this project." — not an empty grid. Design this state.

No loading or error states — the host page owns those.

### Visual & accessibility requirements

- Clean, calm, content-first; generous spacing; readable typography. Cards are
  scannable — a reader can glance the stack shape and drill into one tool.
- Responsive; light and dark mode via shadcn/Tailwind theme tokens (no
  hard-coded colors). lucide-react icons where helpful (e.g. a small icon per
  category, a briefcase for job relevance, arrow-right for the link).
- Each tool name is an `<h3>` — ordered, none skipped. The map is a `<ul>`/`<li>`
  list or a list of `<article>` elements.
- The job-relevance callout conveys itself by a visible label + text, not color
  alone; a category chip has a text label.
- Keyboard: the "See alternatives" control is a real link/button with a visible
  focus ring; DOM order = visual order.
- WCAG AA contrast in both themes.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`, `CardFooter`), `Badge` (category chip), `Separator`.
lucide-react for icons. Reuse `packages/ui` — do not duplicate primitives.

---

## Notes for the integrator (task #89)

- This is a pure presentational component — props in, no fetching. It receives
  the `tools` array from the Stack Explanation page (the `StackTool[]` from the
  persisted `stack_explanations` row).
- It must **not** render `alternatives` trade-offs — those are the Alternatives
  Comparison's job. Wire "See alternatives" to scroll to the matching anchored
  tool heading in that component.
- `category` is optional in the real data (the explanation's `StackTool` has
  no category field; the deterministic detection does — the integrator decides
  whether to thread it through). Render gracefully with or without it.
- Verify against `docs/design/stack-decision-map.md` §14; record integration
  notes under `docs/design/ui-integration-notes/`.
