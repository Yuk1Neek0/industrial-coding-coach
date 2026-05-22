# Page Spec: Architecture Flow Viewer

Issue: #107 · Epic: `project-logic-mapper` (M6) · PRD: `.claude/prds/project-logic-mapper.md` (FR-5, FR-6, FR-7, US-3, US-4, US-5, US-6)

This spec defines the **Architecture Flow Viewer** UI — the flow-diagram
component of the Project Map page (`docs/design/project-map-page.md`, section
5). It is the input to the Claude Design prompt
(`docs/design/ui-prompts/architecture-flow-viewer.md`) and to integration task
#108, and must be human-reviewed before the prompt is run.

It is a **component**, not a standalone route — it renders inside
`/map/[owner]/[repo]`. Sections below mirror the standard page-spec format;
where a section does not apply to an embedded component it says so.

(UI tool: Claude Design — see ADR 0007.)

---

## 1. Name

**Architecture Flow Viewer** — a viewer for the three project flows: how a
request/data moves through the system, where state lives and changes, and where
the project calls AI/LLM services — each shown as an ordered step list **and** a
client-rendered Mermaid diagram.

## 2. User goal

> "Walk me through how my project actually runs. Where does a request enter and
> how does it reach the output? Where does my app keep its state? Where does it
> talk to an AI model? Show me the path through my real files — and draw it."

The user picks one of the three flows, reads its plain-language summary, scans
the ordered step list, and looks at the diagram to see the shape of the flow at
a glance. This is the section that lets Mia *trace* her project, not just
describe it.

## 3. Target user

**Mia, the job-seeking junior dev.** She thinks in concrete terms — "the file
that runs when the page loads", not "the request lifecycle". Each flow step
must name a real file and say what happens there in plain language. The diagram
is a glanceable summary; the step list is the authoritative, accessible
representation. A flow that doesn't apply to her project (an AI-call flow in a
non-AI app) must read as an honest, correct answer — never as something broken.

## 4. Route(s)

n/a — embedded component. It renders in section 5 of `/map/[owner]/[repo]`. No
route, no `loading.tsx`, no `error.tsx` of its own; the host page owns route,
loading, and host-level error concerns. **However**, this component owns the
**client-side Mermaid rendering** — a Client Component island — including the
per-diagram rendering state and the per-diagram render-failure fallback (§9,
§11). That is component-local state, not a route concern.

## 5. Data source / contract

The component is **pure presentation** — it receives already-loaded data as
props from the host page and fetches nothing. The Mermaid rendering happens in
the browser from source strings already present in the props.

```ts
interface ArchitectureFlowViewerProps {
  flows: {
    requestDataFlow: Flow;   // Output 3 — request/data flow
    stateFlow: Flow;         // Output 4 — state flow
    aiCallFlow: Flow;        // Output 5 — AI-call flow
  };
}

interface Flow {
  applicable: boolean;            // false => render the "not applicable" panel
  notApplicableReason?: string;   // shown when applicable === false
  summary: string;                // plain-language description of the flow
  steps: {
    order: number;
    file: string;                 // real snapshot path
    description: string;          // what happens at this step
  }[];
  // Output 6 — Mermaid diagram SOURCE for this flow (PRD FR-7).
  // A Mermaid string; this component renders it CLIENT-SIDE.
  mermaid: string;
}
```

The full `ProjectMap` shape and the seven-output mapping table are defined in
`docs/design/project-map-page.md` §5 — that page-spec is the canonical contract
and §5 of it carries the caveat that the typed shape is described from the
PRD/epic until tasks #102/#105 land. This component renders `flows` only.

### Pipeline outputs rendered here

This single component renders **four** of the seven pipeline outputs:

| # | Output | Field |
|---|---|---|
| 3 | Request/data flow | `flows.requestDataFlow` |
| 4 | State flow | `flows.stateFlow` |
| 5 | AI-call flow | `flows.aiCallFlow` |
| 6 | Mermaid diagram source | `flows.*.mermaid` — **rendered client-side here** |

## 6. Sections / layout

The component sits under a host-provided `<h2>` "How this project works". It
presents the **three flows**. Use a `Tabs` control (shadcn `Tabs`) with one tab
per flow — labelled **Request / data flow**, **State flow**, **AI-call flow** —
so the user reads one flow at a time without an overwhelming wall of three
diagrams. (An accessible stacked-sections layout is an acceptable alternative;
tabs are preferred for scannability.)

Each flow panel, top to bottom:

1. **Flow title + one-line purpose** — e.g. "Request / data flow — how a
   request travels from the entry point to the core output."
2. **Flow summary** — the `summary` text, plain language: the main content
   describing what this flow is in *this* project.
3. **Diagram** — the `mermaid` source rendered **client-side** as an SVG (see
   §9). The diagram is glanceable; nodes correspond to real files/modules
   (PRD FR-6). Provide a "view source" affordance (a `Collapsible` / details)
   showing the raw Mermaid text — useful for the user and for debugging.
4. **Ordered step list** — the `steps` rendered as a numbered `<ol>`, each item
   showing the step `file` (monospace, linkable to the file) and its
   `description`. This is the authoritative representation: it conveys the same
   path as the diagram, in text, accessibly.

The step list and the diagram describe the **same** flow — the diagram is the
picture, the list is the words. They must not contradict each other (both come
from the same `Flow` object).

### Not-applicable panel

When a flow has `applicable: false` (most commonly the AI-call flow of a
non-AI project — PRD US-5: "explicitly reported as not applicable"), that
flow's panel renders an explicit, calm **"Not applicable for this project"**
state: the heading, the `notApplicableReason` text (e.g. "This project does not
call any AI or LLM services."), and no diagram and no empty step list. The tab
stays present and selectable — the answer "there is no AI-call flow" is itself
useful information, not a hidden tab.

## 7. Input fields

None — the component is read-only. The only interactive controls are the flow
tabs (§6), the per-diagram "view source" collapsible, and file links — no
forms, no text inputs.

## 8. Primary actions

- **Switch flow tab** — selects which of the three flows is shown.
- **View Mermaid source** — a per-flow collapsible revealing the raw `mermaid`
  string.
- **File links** — each step's `file` links to the file where a destination
  exists; otherwise plain monospace text.

No destructive actions.

## 9. Loading state

n/a at the host-route level — the host page's `loading.tsx` and in-progress
state cover loading the `ProjectMap`. **But this component owns one real
loading state: client-side Mermaid rendering.**

- The component is a **Client Component island** (`'use client'`) because the
  `mermaid` library renders in the browser; the host page is otherwise Server
  Components.
- When a flow tab is shown, its diagram is rendered from the `mermaid` source
  by the `mermaid` library. While that render is in flight, the diagram area
  shows a `Skeleton` shaped like a diagram. Rendering is typically fast; the
  skeleton prevents layout shift.
- The ordered step list (§6.4) renders immediately and does **not** wait on
  Mermaid — if diagram rendering is slow or fails, the flow is still fully
  readable as text.
- Diagrams may be rendered lazily per tab (render on first view) to keep the
  initial paint light; this is an integrator choice, not required by the spec.

## 10. Empty state

- If a flow's `steps` array is empty but `applicable` is `true` (the pipeline
  found the flow applies but could not trace a clear path — e.g. no clear entry
  point, PRD US-4: "or explicitly reported as none found"), the panel renders
  the `summary` plus a single quiet line: "No clear ordered path was found for
  this flow." It does not render an empty diagram or an empty `<ol>`.
- If a flow is `applicable: false`, see the not-applicable panel (§6) — that is
  the deliberate "this flow does not exist here" state, distinct from "applies
  but nothing found".
- The component is never rendered with all three flows missing — the host page
  shows its own error before reaching this; a degenerate all-empty `flows`
  object renders three honest empty/not-applicable panels.

## 11. Error state

- **Host-level errors** (pipeline failure, no API key, not imported) are the
  host page's concern (`docs/design/project-map-page.md` §11) — this component
  is only rendered with a valid `flows` object.
- **Mermaid render failure is this component's concern.** If the `mermaid`
  library throws on a malformed `mermaid` string, the diagram area must **not**
  crash the page or the component. It renders a calm inline fallback: a small
  message "This diagram couldn't be drawn." and the raw `mermaid` source shown
  as preformatted text — and the **ordered step list still renders normally**,
  so the flow is never lost. No raw stack trace. The render is wrapped so one
  bad diagram cannot take down the other tabs.

## 12. Success state

The populated viewer *is* the success state: three flow tabs, each with a
plain-language summary, a client-rendered Mermaid diagram whose nodes are real
files/modules, and an authoritative ordered step list of real snapshot paths. A
flow that legitimately does not apply shows its not-applicable panel — that is
also a success, not a failure. The diagrams are legible in light and dark
themes.

## 13. Accessibility notes

- The component renders under the host's `<h2>` "How this project works"; each
  flow's title is an `<h3>` — ordered, none skipped.
- **Tabs are accessible.** The flow tabs use the shadcn `Tabs` primitive
  (proper `role="tab"` / `role="tabpanel"`, arrow-key navigation, one tab stop
  into the tablist). Each tab has a clear text label.
- **The diagram has a text alternative — this is critical.** A Mermaid SVG is
  not a screen-reader-friendly representation of a flow. The ordered step list
  (§6.4) is the accessible equivalent and is always present. The rendered
  diagram SVG has an accessible name (e.g. `aria-label` "Request/data flow
  diagram") and, where the renderer allows, a `<title>`/`<desc>`; if a
  meaningful description cannot be attached, the diagram is marked decorative
  (`aria-hidden`) and the step list carries all the information. The
  information is never diagram-only.
- The step list is an `<ol>` (order is meaningful); file paths are `<code>`;
  file links are real links with a visible focus ring.
- The "view Mermaid source" control is a real disclosure (button) with proper
  expanded/collapsed state; the revealed source is preformatted text.
- The not-applicable panel and the "no path found" line are conveyed by visible
  text, not color or an icon alone.
- WCAG 2.1 AA contrast in light and dark themes for the panels, the step list,
  and the rendered diagram (Mermaid theme tokens chosen for both themes).
- Keyboard: tabs, the source disclosure, and every file link are reachable and
  operable; DOM order = visual order. Diagram rendering must not steal focus.

## 14. Acceptance criteria

- [ ] Renders the three flows — **request/data flow**, **state flow**, and
      **AI-call flow** — as one-flow-at-a-time tabbed panels (or accessible
      stacked sections).
- [ ] Each applicable flow panel shows a plain-language **summary**, a
      **client-rendered Mermaid diagram**, and an **ordered step list** of real
      snapshot paths.
- [ ] **Mermaid diagram source is rendered client-side** by the `mermaid`
      library in a Client Component island — the component never receives or
      ships a pre-rendered image.
- [ ] The ordered step list renders independently of the diagram — if Mermaid
      rendering is slow or fails, the flow is still fully readable as text.
- [ ] A flow with `applicable: false` renders an explicit **"Not applicable for
      this project"** panel with its reason, with the tab still selectable — no
      empty diagram, no empty list.
- [ ] A flow that applies but has no traced path renders the summary plus a
      single quiet "no clear ordered path was found" line.
- [ ] A **Mermaid render failure** renders a calm inline fallback (message +
      raw source) and never crashes the component or hides the step list. No
      raw stack trace.
- [ ] A per-flow "view Mermaid source" disclosure reveals the raw source text.
- [ ] The component is **pure props** over the `flows` field of `ProjectMap`
      (`docs/design/project-map-page.md` §5) — no fetching.
- [ ] Uses **only** `packages/ui` (shadcn/ui) components plus the `mermaid`
      rendering library.
- [ ] Accessibility notes in §13 are satisfied — accessible tabs, the ordered
      step list as the text alternative to every diagram, ordered headings,
      keyboard operability, AA contrast in both themes.
- [ ] Spec is human-reviewed before the Claude Design prompt is used.
