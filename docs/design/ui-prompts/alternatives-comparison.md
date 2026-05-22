# Claude Design Prompt: Alternatives Comparison

Issue: #88 · Epic: `stack-explainer` (M5) · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Alternatives Comparison component. Full contract:
the spec `docs/design/alternatives-comparison.md`. This component renders
inside the Stack Explanation page
(`docs/design/stack-explanation-page.md`, section 4).

## How to use this (Claude Design)

1. In Claude Design, in the **same project** as the Stack Explanation page,
   with this repository linked so it uses the real `packages/ui` components.
2. Optionally attach `docs/design/alternatives-comparison.md`.
3. Paste the prompt below; iterate on the canvas.
4. Export via **"Handoff to Claude Code"** and return it here.

The output is a **draft**. Integration task **#89** wires it into the page.

**Stack to target:** Next.js App Router, React, TypeScript, Tailwind CSS,
shadcn/ui. Light + dark mode. Mock/sample data only.

---

## Prompt — paste into Claude Design

Build an **Alternatives Comparison** component for a learning-coach web app,
using React, TypeScript, Tailwind CSS, and shadcn/ui. It is a presentational
component — props in, no data fetching, no API calls. Light and dark mode.

### Domain

This component is part of a page that explains why a junior developer's project
uses its technology stack. While the rest of the page explains the tools the
project *does* use, this component shows the **roads not taken**: for each
major tool, the alternatives to it and what would actually change in the
project if one were used instead. The target user is a beginner preparing for
interviews — she needs to answer "why not X?" with a concrete, project-relative
answer, not a memorized blog opinion.

The component receives a `tools` array. Each tool is:

- `name` — string, e.g. "Drizzle ORM".
- `alternatives` — array of `{ name, tradeOff }`. `name` is an alternative tool
  (e.g. "Prisma"); `tradeOff` is what would change *in this project* if that
  alternative were used instead (e.g. "Prisma would add a generated client and
  a separate schema file, and a migration step at build time").
- (Tools also carry `purpose` / `jobRelevance` — rendered elsewhere, ignore
  them here.)

A tool whose `alternatives` array is empty contributes nothing — **omit it**.

### The component

A single section, under a heading "Alternatives & trade-offs" (assume the host
page supplies the `<h2>`; render an `<h3>` per tool). Grouped **per tool**:

For each tool that has at least one alternative:
1. A **tool-group heading** (`<h3>`) with the tool `name`. Give each heading a
   stable `id` (e.g. `alt-drizzle-orm`) — the Stack Decision Map links here.
2. The tool's **alternatives**: each alternative pairs its `name` with its
   `tradeOff`. The trade-off is the real insight — make it the prominent
   content. Render either as a two-column read ("Alternative" / "What would
   change in this project") or as stacked cards — whichever is cleanest — but
   the name↔trade-off pairing must be unambiguous.

Layout: a readable single column; tool groups stacked with clear separation
(a `Separator` or spacing between groups). On wide viewports, alternatives
within one group may sit in a 2-up grid. There is **no** giant comparison table
spanning all tools — the comparison is per tool, each decision self-contained.
Long `tradeOff` text wraps fully; never truncate it or hide it behind hover.

### States

- **Populated** — the normal state: per-tool groups of alternatives. Provide a
  sample of 3–4 tools, each with 1–2 alternatives, with concrete
  project-relative trade-offs, so the design is well exercised.
- **Empty** — if no tool has any alternatives, render a single quiet line "No
  alternatives were recorded for this stack." — not an empty frame. Design this
  state.

No loading or error states — the host page owns those.

### Visual & accessibility requirements

- Clean, calm, content-first; generous spacing; readable typography. Each tool
  group reads as a self-contained decision.
- Responsive; light and dark mode via shadcn/Tailwind theme tokens (no
  hard-coded colors). lucide-react icons where helpful (e.g. git-branch /
  shuffle for an alternative, arrow-left-right for the trade-off).
- Each tool-group heading is an `<h3>` with an `id` anchor — ordered, none
  skipped. Alternatives are a list (`<ul>`/`<li>`) or, if tabular, a real
  `<table>` with `<th scope>` — the name↔trade-off relationship is structural,
  not just visual proximity.
- Keyboard and screen-reader order = visual order; any anchor link receives a
  visible focus ring.
- WCAG AA contrast in both themes; any column tint is decorative only.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardContent`), `Badge`
(alternative name), `Table` (if a tabular layout is chosen), `Separator`.
lucide-react for icons. Reuse `packages/ui` — do not duplicate primitives.

---

## Notes for the integrator (task #89)

- Pure presentational component — props in, no fetching. It receives the same
  `tools` array (`StackTool[]`) as the Stack Decision Map, from the persisted
  `stack_explanations` row.
- Filter out tools with no alternatives before rendering; if the filtered list
  is empty, render the empty-state line (or let the host page omit section 4 —
  coordinate with the Stack Explanation page integration).
- Give each tool-group `<h3>` an `id` that the Stack Decision Map's "See
  alternatives" links target — keep the id scheme consistent across both
  components.
- Verify against `docs/design/alternatives-comparison.md` §14; record
  integration notes under `docs/design/ui-integration-notes/`.
