# Claude Design Prompt: Debug Path UI

Issue: #107 · Epic: `project-logic-mapper` (M6) · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Debug Path UI component. Full contract: the page
spec `docs/design/debug-path-ui.md` — read that for the complete behaviour.
This is a **component** rendered inside the Project Map page
(`docs/design/project-map-page.md`, section 6).

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach `docs/design/debug-path-ui.md` and the host spec
   `docs/design/project-map-page.md` as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** and return it here.

The output is a **draft**. Integration task **#108** reconciles it with
`apps/web` + `packages/ui` and wires it into the real Project Map page — do not
expect Claude Design to produce final wiring; it produces the interface.

**Stack to target:** Next.js App Router, React, TypeScript, Tailwind CSS,
shadcn/ui. Light + dark mode. Build with mock/sample data only — no data
fetching.

---

## Prompt — paste into Claude Design

Build a **Debug Path UI** component for a learning-coach web app, using Next.js
(App Router), React, TypeScript, Tailwind CSS, and shadcn/ui. Light and dark
mode. It is an embedded component (no route of its own) — design it as a
self-contained component with a small demo wrapper. Use only mock sample data
passed as props — no data fetching, no API calls.

### Domain

This component gives a junior developer a **"when something breaks, look here"**
map for her AI-built project. When her project misbehaves she has no idea where
to start — she did not write the code path by path. The Debug Path UI lists
common failure **symptoms she would actually observe** ("the page shows an
error instead of loading", "the imported data looks empty", "the AI response
never comes back") and, for each, the real file to open first and what to check
there. Copy is plain, concrete, and reassuring — it turns "I can't debug my own
project" into "I know where to start."

The component receives this as props (mock it fully — no empty fields, no lorem
ipsum):

```ts
interface DebugPathUIProps {
  debugPath: { entryPoints: DebugEntryPoint[] };
}
interface DebugEntryPoint {
  symptom: string;     // a common failure, in observable plain language
  file: string;        // real file path to start investigating from
  guidance: string;    // what to look for / how to investigate at that file
}
```

Seed the mock data with ~5–6 `entryPoints` for an AI-built Next.js + Drizzle +
SQLite portfolio app: each `symptom` phrased as something the user would
actually see, each `file` a realistic path, each `guidance` a concrete,
plain-language "look for this" instruction.

### Layout

The component sits under a host-provided `<h2>` "Where to start debugging".
Top to bottom:

1. **Intro line** — one sentence: "If something breaks, here is where to start
   looking — matched to common problems and your real files."
2. **Debug entry-point list** — render `entryPoints` as a list of cards, one
   per `DebugEntryPoint`, in the given order (most common first). Each card
   shows:
   - the **`symptom`** as the card's heading — the observable failure;
   - a **"Start here:"** label followed by the **`file`** path in monospace,
     rendered as a link — the card's visual anchor;
   - the **`guidance`** text as the card's body — what to look for and how to
     investigate.

A single readable column on mobile; a comfortable list (or two-column grid) on
wide screens — the `guidance` text must stay fully readable and wrap, never
truncated to hide meaning.

### States — design all of these

- **Populated** — the ordered list of debug entry-point cards described above.
- **Empty — no debug starting points** — when `entryPoints` is empty, a single
  quiet line "No specific debug starting points were identified for this
  project." — no empty list. (This is a partial result, not an error; the rest
  of the project map is still useful.)

Provide a simple toggle so both can be previewed.

### Visual & accessibility requirements

- Clean, modern, content-first; scannable so the user can quickly find the
  symptom that matches their problem. Calm and reassuring — a debugging aid for
  someone who feels stuck, not a marketing page.
- Fully responsive; comfortable on mobile and desktop.
- Light and dark mode using shadcn/Tailwind theme tokens — no hard-coded
  colors.
- Use **lucide-react** icons (e.g. a small wrench/bug icon per card, decorative
  only; an arrow for the "Start here" file link).
- Semantic HTML: the component renders under the host's `<h2>`; each card's
  `symptom` is an `<h3>`, none skipped. The entry list is a `<ul>`/`<li>` list
  (or a list of `<article>`s). File paths are `<code>`.
- The "Start here" file links are real links with a visible focus ring; each
  link's accessible name includes the path.
- The "Start here" label and the symptom/guidance text are conveyed by visible
  text, not color or an icon alone.
- All text meets WCAG AA contrast in both themes; long `guidance` text wraps
  and stays fully readable — nothing hidden behind truncation or hover.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardContent`), `Badge`,
`Separator`. lucide-react for icons. Keep components small and composable so
they integrate cleanly into an existing shadcn/ui monorepo — reuse
`packages/ui` rather than duplicating primitives.

---

## Notes for the integrator (task #108)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives.
- This component renders the `debugPath` field of the real `ProjectMap`
  (`docs/design/project-map-page.md` §5) — it is **pure props**, no fetching.
  The `ProjectMap` shape is described from the PRD/epic; reconcile it with the
  real exported types from the M6 pipeline package.
- File-path links should point at a real file view where one exists; otherwise
  render plain monospace text — do not link nowhere.
- An unresolved `file` reference is surfaced by the host page's quiet integrity
  note (#106), not by this component — it still renders the entry.
- Verify against `docs/design/debug-path-ui.md` §14; record integration notes
  in `docs/design/ui-integration-notes/`.
