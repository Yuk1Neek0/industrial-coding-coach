# Claude Design Prompt: Project Map page

Issue: #107 · Epic: `project-logic-mapper` (M6) · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Project Map page. Full contract: the page spec
`docs/design/project-map-page.md` — read that for the complete behaviour,
including the `ProjectMap` typed shape and the seven-output mapping table. This
page **hosts** three component UIs specified separately:
`docs/design/architecture-flow-viewer.md`, `docs/design/file-map-explorer.md`,
and `docs/design/debug-path-ui.md` (each has its own prompt under
`docs/design/ui-prompts/`).

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach the page spec `docs/design/project-map-page.md` and the
   three component specs as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#108** reconciles it with
`apps/web` + `packages/ui`, wires the pages to the real LangGraph pipeline and
the project-maps data-access layer, and adds the real client-side Mermaid
renderer — do not expect Claude Design to produce final wiring; it produces the
interface.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only —
no data fetching, no API calls.

---

## Prompt — paste into Claude Design

Build a **Project Map** page for a learning-coach web app, using Next.js (App
Router), React, TypeScript, Tailwind CSS, and shadcn/ui. Light and dark mode.
Use only mock sample data — do not add any data fetching, API calls, or a
database; render from a typed in-file object so it is trivial to swap for real
server data later.

### Domain

This is the main page of a "Project Logic Mapper". The target user is **Mia, a
job-seeking junior developer** who built a project with heavy AI assistance,
can run it, but cannot explain how it works as a system or where to start
debugging it. The Project Map shows her how her *actual* project works — every
claim tied to a real file. Copy must be plain, concrete, and encouraging — never
a generic software-architecture lecture.

The page renders a generated **project map** with this shape (mock it fully —
no empty fields, no lorem ipsum):

```ts
interface ProjectMap {
  owner: string; repo: string; ref: string; generatedAt: string; // ISO
  architecture: {
    summary: string;                       // plain-language whole-system overview
    layers: { name: string; role: string; files: string[] }[];
  };
  keyFiles: {
    path: string; role: string; category: string;
    importance: 'critical' | 'important' | 'supporting';
  }[];
  flows: {
    requestDataFlow: Flow; stateFlow: Flow; aiCallFlow: Flow;
  };
  debugPath: { entryPoints: { symptom: string; file: string; guidance: string }[] };
  integrity: { checked: number; unresolved: string[] };
}
interface Flow {
  applicable: boolean; notApplicableReason?: string; summary: string;
  steps: { order: number; file: string; description: string }[];
  mermaid: string;                         // Mermaid diagram SOURCE text
}
```

Seed the mock data with a realistic example — an AI-built Next.js + Drizzle +
SQLite portfolio app — with: a 2–3 sentence `architecture.summary`; ~4 `layers`
each with real-looking paths; ~10 `keyFiles` across categories (entry point,
route, data, config, test) and all three importance levels; three fully written
`flows` (the `aiCallFlow` should be `applicable: true` for this example); and
~5 `debugPath.entryPoints`. Write a valid Mermaid `flowchart` string for each
flow whose node labels are real file paths.

### Routes

Two routes:

- **`/map`** — a thin **chooser**: a page header "Map a Project", a one-line
  subtitle, and a list of imported repositories (mock ~3), each a card/row
  linking to `/map/[owner]/[repo]`. Include the empty state (see States).
- **`/map/[owner]/[repo]`** — the Project Map page itself, described below.

### `/map/[owner]/[repo]` — the Project Map page

A readable, single-column content layout (comfortable max width). It has two
resting states — **not yet mapped** and **mapped** — plus an in-progress state
and error states (see States). When **mapped**, top to bottom:

1. **Page header** — `owner/repo` as an `<h1>`, the `ref` as a shadcn `Badge`,
   and a one-line description "How this project works as a running system —
   mapped against its actual files."
2. **Status line** — a quiet "Mapped <relative time>" line with a secondary
   **Re-map** button. When `integrity.unresolved` is non-empty, also show a
   quiet, non-blocking note "Some file references could not be verified (N of
   M)." — informational, not an error.
3. **Section navigation** — a sticky in-page table of contents: links
   "Overview · Key files · Flows · Debug path" that scroll to each section.
4. **Architecture overview** section — the `architecture.summary` as a lead
   paragraph, then `architecture.layers` as a list of layer cards: each card
   shows the layer `name` as a heading, its `role`, and its `files` as a list
   of monospace, linkable file paths.
5. **Key files** section — render the **File Map Explorer** component here (see
   its own spec `docs/design/file-map-explorer.md`): an importance-ranked,
   filterable list of `keyFiles`, each with path, an importance badge, a
   category chip, and its role.
6. **How this project works** section — render the **Architecture Flow Viewer**
   component here (see `docs/design/architecture-flow-viewer.md`): a tabbed
   viewer of the three `flows`, each with a summary, a **client-side rendered
   Mermaid diagram**, and an ordered step list of real file paths.
7. **Where to start debugging** section — render the **Debug Path UI** component
   here (see `docs/design/debug-path-ui.md`): a list of `debugPath.entryPoints`,
   each with a symptom heading, a "Start here" file, and guidance.

File paths throughout are monospace and rendered as links (they would link to a
file view).

### Client-side Mermaid rendering

The three flow diagrams come from the pipeline as **Mermaid source text** (the
`mermaid` field), not images. They must be rendered **client-side** in the
browser — design the flow section as a Client Component island that takes
Mermaid strings and renders SVG diagrams. For this design draft, use the
`mermaid` npm library (or a clearly-marked placeholder diagram component) — do
not paste pre-rendered images. Each diagram must also have its ordered step
list rendered as text, so the flow is readable even without the diagram.

### States — design all of these

- **Not yet mapped** (resting state of `/map/[owner]/[repo]`) — the header plus
  a "Map this project" primary button and a sentence describing what it
  produces (an architecture overview, a key-file map, flow diagrams, a debug
  path). Sections 4–7 are absent.
- **Mapping in progress** — after "Map this project" is pressed: a heading
  "Mapping the <owner>/<repo> project…", an indeterminate shadcn `Progress`
  indicator, and a reassurance line "Reading your project's files, tracing how
  they connect, and drawing the diagrams. This usually takes 30–90 seconds."
  The button is disabled and shows a loading state.
- **Mapped** — the full page described above.
- **Route loading** — a `loading.tsx`-style skeleton: header bar + section
  frames using shadcn `Skeleton`.
- **Empty — `/map` with no imported repos** — a centered empty state: "No
  repositories imported yet. Import one to get a project map." with an "Import
  a repository" action.
- **Error states** — in the status region, design these as distinct blocks,
  each with a heading, a plain-language explanation, and a recovery action:
  "This repository isn't imported yet" (action: Import this repository); "AI
  mapping isn't configured" (explain an `ANTHROPIC_API_KEY` must be set in
  `.env`); "We couldn't find any code to map"; "The map couldn't be generated"
  (action: Try again); and a generic "Something went wrong" (action: Try
  again). No stack traces, no status codes.

Provide simple toggles or separate preview screens so all of these states can
be viewed.

### Visual & accessibility requirements

- Clean, modern, content-first design. Generous spacing, readable typography,
  calm and trustworthy — a learning tool, not a marketing page. The page is
  long; make it scannable and navigable with the section nav.
- Fully responsive; comfortable on mobile and desktop.
- Light and dark mode using shadcn/Tailwind theme tokens — no hard-coded
  colors. Mermaid diagrams must be legible in both themes.
- Use **lucide-react** icons.
- Semantic HTML: exactly one `<h1>` per page, ordered heading levels with none
  skipped, `<main>` / `<nav>` / `<section>` landmarks. The section nav is a
  `<nav>`; layer-file lists and reference lists are `<ul>`s; flow step lists
  are `<ol>`s; file paths are `<code>`.
- The status region (status line / in-progress / error) is an `aria-live`
  region; the in-progress state sets `aria-busy="true"`.
- Every Mermaid diagram has a text alternative — its ordered step list — so the
  flow is never diagram-only.
- All text meets WCAG AA contrast in both themes; badges and error states
  convey meaning by text + icon, not color alone.

### Components to use

shadcn/ui: `Card`, `Badge`, `Button`, `Progress`, `Skeleton`, `Separator`,
`Tabs` (for the flow viewer), `Select` and `Input` (for the file-map filter),
`Collapsible` (for "view Mermaid source"). lucide-react for icons. The `mermaid`
library for client-side diagram rendering. Keep components small and composable
so they integrate cleanly into an existing shadcn/ui monorepo — reuse
`packages/ui` rather than duplicating primitives.

---

## Notes for the integrator (task #108)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives. Add any missing shadcn components there.
- Replace the design's mock `ProjectMap` object with the real typed backend:
  `getProjectMapByRepo(owner, repo, ref?)` (Server Component read) and
  `generateProjectMapAction({ owner, repo, ref? })` (Server Action running the
  LangGraph pipeline #105 and persisting via the data-access layer #106).
- The `ProjectMap` shape in `docs/design/project-map-page.md` §5 is described
  from the PRD/epic — **reconcile it with the real exported types** from
  `@workspace/db` / the M6 pipeline package and update the specs if they
  diverge.
- Map the loading/empty/error mockups onto real App Router files: `loading.tsx`
  and `error.tsx`; route `not-imported` / failures through the typed error
  `kind` discriminator (`docs/design/project-map-page.md` §5).
- Implement the real client-side Mermaid renderer (the `mermaid` library) as a
  Client Component; keep the rest of the page as Server Components.
- Run the file-reference integrity check (#106); surface
  `integrity.unresolved` as the quiet verification note, never a blocking
  error.
- Verify the result against `docs/design/project-map-page.md` §14 acceptance
  criteria; record integration notes in `docs/design/ui-integration-notes/`.
