# Claude Design Prompt: Architecture Flow Viewer

Issue: #107 · Epic: `project-logic-mapper` (M6) · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Architecture Flow Viewer component. Full contract:
the page spec `docs/design/architecture-flow-viewer.md` — read that for the
complete behaviour. This is a **component** rendered inside the Project Map
page (`docs/design/project-map-page.md`, section 5); it owns the **client-side
Mermaid rendering** for the whole feature.

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach `docs/design/architecture-flow-viewer.md` and the host
   spec `docs/design/project-map-page.md` as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** and return it here.

The output is a **draft**. Integration task **#108** reconciles it with
`apps/web` + `packages/ui` and wires it into the real Project Map page with the
real client-side Mermaid renderer — do not expect Claude Design to produce
final wiring; it produces the interface.

**Stack to target:** Next.js App Router, React, TypeScript, Tailwind CSS,
shadcn/ui. Light + dark mode. Build with mock/sample data only — no data
fetching. This component is a **Client Component** (it renders Mermaid in the
browser).

---

## Prompt — paste into Claude Design

Build an **Architecture Flow Viewer** component for a learning-coach web app,
using Next.js (App Router), React, TypeScript, Tailwind CSS, and shadcn/ui.
Light and dark mode. It is an embedded component (no route of its own) — design
it as a self-contained component with a small demo wrapper. Use only mock
sample data passed as props — no data fetching, no API calls.

### Domain

This component shows a junior developer how her AI-built project actually runs,
as three **flows**: how a request or data moves from the entry point to the
output, where the app's state lives and changes, and where the project calls
AI/LLM services. Each flow is shown two ways — a **diagram** (the picture) and
an **ordered step list** (the words) — both describing the same path through
her real files. Copy is plain and concrete; the target user, Mia, thinks "the
file that runs when the page loads", not "the request lifecycle".

The component receives this as props (mock it fully — no empty fields, no lorem
ipsum):

```ts
interface ArchitectureFlowViewerProps {
  flows: { requestDataFlow: Flow; stateFlow: Flow; aiCallFlow: Flow };
}
interface Flow {
  applicable: boolean;
  notApplicableReason?: string;
  summary: string;
  steps: { order: number; file: string; description: string }[];
  mermaid: string;   // Mermaid diagram SOURCE text — rendered client-side here
}
```

Seed the mock data for an AI-built Next.js + Drizzle + SQLite app: a
`requestDataFlow` and a `stateFlow` that are `applicable: true` with ~5 steps
each and a valid Mermaid `flowchart` string whose node labels are real file
paths; and an `aiCallFlow` that is `applicable: true` for the main demo (also
provide a toggle/variant where `aiCallFlow.applicable` is `false` with a
`notApplicableReason` "This project does not call any AI or LLM services." — so
the not-applicable panel can be previewed).

### Layout

The component sits under a host-provided `<h2>` "How this project works". Use a
shadcn **`Tabs`** control with three tabs — **Request / data flow**, **State
flow**, **AI-call flow** — so the user reads one flow at a time. Each flow
panel, top to bottom:

1. **Flow title + one-line purpose** — e.g. "Request / data flow — how a
   request travels from the entry point to the core output."
2. **Flow summary** — the `summary` text, plain language.
3. **Diagram** — the `mermaid` source rendered **client-side** as an SVG
   diagram. Below or beside it, a shadcn `Collapsible` "View diagram source"
   revealing the raw Mermaid text as preformatted code.
4. **Ordered step list** — the `steps` as a numbered `<ol>`; each item shows
   the step `file` (monospace, linkable) and its `description`.

### Client-side Mermaid rendering — central to this component

The diagrams come as **Mermaid source text**, not images. Render them
**client-side** in the browser using the `mermaid` npm library. Design the
component as a Client Component (`'use client'`). Requirements:

- While a diagram is rendering, show a shadcn `Skeleton` shaped like a diagram
  in the diagram area — no layout shift.
- The ordered step list renders **immediately** and independently of the
  diagram — if the diagram is slow or fails, the flow is still fully readable.
- If the `mermaid` library throws on a malformed source string, show a calm
  inline fallback in the diagram area: a small message "This diagram couldn't
  be drawn." plus the raw Mermaid source as preformatted text — and **keep the
  step list rendering normally**. One bad diagram must never crash the
  component or the other tabs. No stack traces.
- Diagrams must be legible in both light and dark themes — use Mermaid theme
  options that adapt.

### States — design all of these

- **Applicable flow** — summary + client-rendered diagram + ordered step list,
  as above.
- **Not-applicable flow** — when `applicable` is `false` (most often the
  AI-call flow of a non-AI project): the tab stays present and selectable, and
  its panel shows a calm "Not applicable for this project" heading and the
  `notApplicableReason` text — no diagram, no empty step list.
- **Applies but no path found** — when `applicable` is `true` but `steps` is
  empty: show the `summary` plus a single quiet line "No clear ordered path was
  found for this flow." — no empty diagram, no empty list.
- **Diagram rendering** — the diagram-shaped skeleton described above.
- **Diagram render failure** — the calm inline fallback described above.

Provide simple toggles or variants so all of these can be previewed.

### Visual & accessibility requirements

- Clean, modern, content-first; the diagram and the step list should sit
  comfortably together. Calm and trustworthy.
- Fully responsive; the diagram scrolls/scales gracefully on mobile.
- Light and dark mode using shadcn/Tailwind theme tokens — no hard-coded
  colors.
- Use **lucide-react** icons.
- Semantic HTML: the component renders under the host's `<h2>`; each flow title
  is an `<h3>`, none skipped. Use the shadcn `Tabs` primitive so tabs are fully
  accessible (`role="tab"`/`role="tabpanel"`, arrow-key navigation, one tab
  stop into the tablist).
- **Every diagram has a text alternative** — the ordered step list — so the
  flow is never diagram-only. Give the rendered diagram an `aria-label` (e.g.
  "Request/data flow diagram"); if a meaningful description cannot be attached
  to the SVG, mark the SVG decorative (`aria-hidden`) and rely on the step list.
- Flow steps use an `<ol>` (order is meaningful); file paths are `<code>`; file
  links are real links with a visible focus ring.
- All text and the rendered diagram meet WCAG AA contrast in both themes;
  not-applicable and "no path found" states are conveyed by text, not color.

### Components to use

shadcn/ui: `Tabs`, `Card`, `Collapsible`, `Skeleton`, `Badge`, `Separator`.
lucide-react for icons. The `mermaid` library for client-side diagram
rendering. Keep components small and composable so they integrate cleanly into
an existing shadcn/ui monorepo — reuse `packages/ui` rather than duplicating
primitives.

---

## Notes for the integrator (task #108)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives.
- This component renders the `flows` field of the real `ProjectMap`
  (`docs/design/project-map-page.md` §5) — it is **pure props**, no fetching.
  The `ProjectMap` shape is described from the PRD/epic; reconcile it with the
  real exported types from the M6 pipeline package.
- Keep this as the Client Component island of the Project Map page; the host
  page stays Server Components. Implement the real `mermaid` renderer here.
- Verify against `docs/design/architecture-flow-viewer.md` §14; record
  integration notes in `docs/design/ui-integration-notes/`.
