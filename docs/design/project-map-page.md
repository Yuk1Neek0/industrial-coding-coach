# Page Spec: Project Map

Issue: #107 · Epic: `project-logic-mapper` (M6) · PRD: `.claude/prds/project-logic-mapper.md` (FR-4…FR-10, US-1…US-9)

This spec defines the **Project Map page** — the main UI of Milestone 6, the
Project Logic Mapper. It is the input to the Claude Design prompt
(`docs/design/ui-prompts/project-map-page.md`) and to the integration task
#108. It must be human-reviewed before the prompt is run.

The Project Map page is the **host page**. It composes three component UIs
specified separately, each rendered inside it:
- the **Architecture Flow Viewer** (`docs/design/architecture-flow-viewer.md`),
- the **File Map Explorer** (`docs/design/file-map-explorer.md`), and
- the **Debug Path UI** (`docs/design/debug-path-ui.md`).

(UI tool: Claude Design — see ADR 0007. The PRD and task #107 mention the
page-spec → UI-draft hand-off gate; the tool is Claude Design.)

---

## 1. Page name

**Project Map** — a per-repository page where the user picks an imported repo,
triggers a logic-mapping run, waits while the LangGraph pipeline produces the
map, and reads how the project works as a running system.

## 2. User goal

> "I built this project with a lot of AI help. I can run it, but I can't trace
> a request from the entry point to the output, I don't know where state lives
> or where the AI calls happen, and if it breaks I don't know where to look.
> Show me how my project actually works as a system — tied to my real files —
> so I can explain it in an interview and safely change it."

The user opens the page for one of their imported repositories, triggers the
mapping, waits while it is generated, and lands on a readable map: a
plain-language architecture overview, the key files and what each does, the
request/data, state, and AI-call flows as diagrams, and a debug path naming
where to start when something breaks.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years' experience, one or
two AI-built portfolio projects she cannot confidently explain.

Design implications:
- **Plain language, no lecturing.** The map is about *her* project, not a
  software-architecture tutorial. Copy is concrete ("a request enters at
  `apps/web/app/import/page.tsx`"), never generic ("requests enter at the
  controller layer").
- **The mapping takes a while.** It is a multi-step LangGraph pipeline (ingest,
  retrieve, reason, diagram); the in-progress state is first-class — Mia must
  never wonder whether the page froze, and it should feel like real work.
- **Trust through grounding.** Every file/module reference points at a real
  snapshot path; Mia should be able to click from a reference to the file and
  see it is real. Mermaid diagram nodes correspond to real files/modules.
- **The page is long; make it navigable.** Architecture overview, key-file map,
  three flow diagrams, and a debug path is a lot — it is sectioned, has a
  section nav / table of contents, and is scannable section by section.
- **Errors teach.** A missing API key, an un-mappable snapshot, or a pipeline
  failure is explained in beginner terms with a next step — never a raw stack
  trace.
- **Graceful degradation reads as honesty, not failure.** A non-AI project
  showing "no AI calls found" or a project with no clear entry point showing a
  partial flow must read as a correct, trustworthy result.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the shell with a
small Client Component island for the trigger interaction and the client-side
Mermaid rendering.

| Route | Purpose | File |
|---|---|---|
| `/map` | Pick an imported repository to map | `apps/web/app/map/page.tsx` |
| `/map/[owner]/[repo]` | The Project Map page for one repo | `apps/web/app/map/[owner]/[repo]/page.tsx` |

- `/map` is a thin **chooser**: a list of imported repositories (from the M11
  data-access layer), each linking to its map page. It is the entry point
  reachable from primary navigation ("Map a Project").
- `/map/[owner]/[repo]` is the page this spec is mainly about. It has two
  resting states — *not yet mapped* (shows the trigger) and *mapped* (shows the
  result) — plus an in-progress state and error states.
- A route-level `loading.tsx` covers the initial server read of the persisted
  map. The *mapping run* in progress is separate in-page state (§9).
- `error.tsx` covers unexpected render-time failures only; expected failures
  (no API key, not imported, pipeline failure) are in-page error states (§11).

## 5. Data source / contract

The page is a **thin view** over the M6 backend. The shell is a Server
Component that reads any persisted map; the trigger is a small Client Component
island calling a Server Action. The page never calls the LangGraph pipeline or
the Anthropic API directly — the Server Action does (PRD: server-side only).

```ts
// Server Component read — does this repo already have a map?
getProjectMapByRepo(owner: string, repo: string, ref?: string)
  : Promise<ProjectMap | null>;

// Server Action — runs the LangGraph mapping pipeline and persists the result.
generateProjectMapAction(input: { owner: string; repo: string; ref?: string })
  : Promise<ProjectMapActionResult>;
```

`generateProjectMapAction` runs the LangGraph pipeline (#105), persists the
result via the project-maps data-access layer (#106), and runs the
file-reference integrity check (#106). On success it returns the `ProjectMap`;
on a typed failure it returns a renderable error. Expected failures are
returned, never thrown.

### The `ProjectMap` typed shape — the integration contract

The LangGraph pipeline (#105) emits **one typed structure** covering all seven
PRD FR-5 outputs; the `project_maps` table (#102) persists it; the data-access
layer (#106) reads it back. The exact TypeScript type is **not yet defined in
code** at the time of this spec (tasks #102/#105/#106 are not yet implemented).
The shape below is derived from the PRD (FR-5, FR-6, FR-7) and the epic so that
this spec, the three component specs, and integration task #108 are
unambiguous. **Task #108 must reconcile this shape against the real exported
types from `@workspace/db` / the M6 pipeline package and update the specs if
they diverge.**

```ts
interface ProjectMap {
  // Identity — keyed to a repo_snapshots row (owner/repo + ref).
  owner: string;
  repo: string;
  ref: string;
  generatedAt: string;            // ISO timestamp — "Mapped <time>"

  // Output 1 — architecture overview (PRD FR-5).
  architecture: {
    summary: string;              // plain-language overview of the whole system
    layers: {                     // major layers/modules detected from the file tree
      name: string;               // e.g. "Web app", "Data access", "AI pipeline"
      role: string;               // what this layer does in THIS project
      files: string[];            // real snapshot paths that make up the layer
    }[];
  };

  // Output 2 — key-file map (PRD FR-5). Rendered by the File Map Explorer.
  keyFiles: {
    path: string;                 // real snapshot path
    role: string;                 // what this file does, plain language
    category: string;             // e.g. "entry point", "config", "route", "data", "test"
    importance: 'critical' | 'important' | 'supporting';
  }[];

  // Outputs 3-5 — the three flows. Each is an ordered path of real files/modules.
  // Rendered by the Architecture Flow Viewer.
  flows: {
    requestDataFlow: Flow;        // Output 3 — request/data flow
    stateFlow: Flow;              // Output 4 — state flow
    aiCallFlow: Flow;             // Output 5 — AI-call flow
  };

  // Output 7 — debug path (PRD FR-5). Rendered by the Debug Path UI.
  debugPath: {
    entryPoints: {
      symptom: string;            // a common failure, plain language
      file: string;               // real snapshot path to start from
      guidance: string;           // what to look for / how to investigate
    }[];
  };

  // Integrity (#106) — every cited path checked against the snapshot file set.
  integrity: {
    checked: number;              // count of file references checked
    unresolved: string[];         // any cited paths NOT found in the snapshot
  };
}

// A single flow — Outputs 3, 4, 5. Output 6 (Mermaid source) lives here per flow.
interface Flow {
  applicable: boolean;            // false => "not applicable" (e.g. non-AI project)
  notApplicableReason?: string;   // shown when applicable === false
  summary: string;                // plain-language description of the flow
  steps: {                        // ordered path of real files/modules
    order: number;
    file: string;                 // real snapshot path
    description: string;          // what happens at this step
  }[];
  // Output 6 — Mermaid diagram SOURCE for this flow (PRD FR-7).
  // A Mermaid string; rendered CLIENT-SIDE in the UI (see §9, §12).
  mermaid: string;
}
```

### How the seven pipeline outputs map onto the four pages

| # | Pipeline output | Field | Rendered by |
|---|---|---|---|
| 1 | Architecture overview | `architecture` | **Project Map page** — section 3 (this page) |
| 2 | Key-file map | `keyFiles` | **File Map Explorer** component (section 4) |
| 3 | Request/data flow | `flows.requestDataFlow` | **Architecture Flow Viewer** component (section 5) |
| 4 | State flow | `flows.stateFlow` | **Architecture Flow Viewer** component (section 5) |
| 5 | AI-call flow | `flows.aiCallFlow` | **Architecture Flow Viewer** component (section 5) |
| 6 | Mermaid diagram source | `flows.*.mermaid` | **Architecture Flow Viewer** — rendered client-side; the Project Map page may also show a small architecture diagram |
| 7 | Debug path | `debugPath` | **Debug Path UI** component (section 6) |

Output 6 (Mermaid source) is **diagram source text**, not an image. It is
rendered **client-side** by a Mermaid renderer in a Client Component island
(see §9). The pipeline emits source so it stays portable, diffable, and
re-themeable; rendering is the UI's job.

### Error shape

The Server Action result is discriminated; a failure carries a `kind`:

| `kind` | Meaning |
|---|---|
| `not-imported` | No snapshot — the repo was never imported (link to `/import`) |
| `missing-api-key` | `ANTHROPIC_API_KEY` is not configured |
| `empty-snapshot` | The snapshot has no mappable source (e.g. no recognizable code files) |
| `pipeline-failure` | The LangGraph mapping pipeline failed (rate limit, network, model, or node error) |
| `unknown` | Any other failure |

## 6. Page sections

`/map/[owner]/[repo]`, top to bottom:

1. **Page header** — `owner/repo` as the title, the imported `ref` as a
   `Badge`, and a one-line description: "How this project works as a running
   system — mapped against its actual files."
2. **Trigger / status region** — when no map exists, a "Map this project" call
   to action with a one-line description of what will happen. When one exists,
   a quiet "Mapped <relative time>" line with a secondary "Re-map" action.
   While the pipeline runs, the in-progress state (§9). On failure, the error
   state (§11).
3. **Architecture overview** — once mapped, the `architecture.summary` as a
   plain-language lead, then the `architecture.layers` as a readable list of
   layer cards (each: `name`, `role`, and its `files` as monospace, linkable
   paths). This is the orientation section — read this first to get the shape
   of the whole project.
4. **File Map Explorer** — the key-file map (its own spec:
   `docs/design/file-map-explorer.md`), rendered with `keyFiles`.
5. **Architecture Flow Viewer** — the request/data, state, and AI-call flows
   with their Mermaid diagrams (its own spec:
   `docs/design/architecture-flow-viewer.md`), rendered with `flows`.
6. **Debug Path UI** — the debug entry points and walkthrough (its own spec:
   `docs/design/debug-path-ui.md`), rendered with `debugPath`.
7. **Section navigation** — a sticky, in-page table of contents / section nav
   (Overview · Key files · Flows · Debug path) so the long page is navigable;
   it scrolls to the matching `<section>`.

Sections 3–7 appear only in the mapped state. The `/map` chooser route is a
simple list of imported repos with an empty state (§10).

### Integrity note — within section 2

When `integrity.unresolved` is non-empty, the status region shows a quiet,
non-blocking note: "Some file references could not be verified against the
snapshot (N of M)." It never blocks the map from rendering — a partial map is
still useful (PRD: degrades gracefully).

## 7. Input fields

There is no free-text input. The only interactive control on
`/map/[owner]/[repo]` is the **Map this project** / **Re-map** trigger button
(§8) and the section-nav links (§6). The `/map` chooser has no inputs — it is a
list of links.

## 8. Primary actions

- **Map this project** — primary button, shown when no map exists. Calls
  `generateProjectMapAction`. Disabled while a run is in progress.
- **Re-map** — secondary action, shown in the mapped state; re-runs the
  pipeline and replaces the stored map (the backend updates in place).
- **Try again** — shown in the error state; re-runs the trigger.
- **Import a repository** — shown in the `not-imported` error and the `/map`
  empty state; links to `/import`.
- **Section-nav links** — jump to a section of the page (§6).
- File/module references throughout sections 3–6 are **links** to the file
  where a destination exists; otherwise plain monospace text (the integrator
  decides — do not link nowhere).

No destructive actions — the page never deletes a snapshot or a map.

## 9. Loading state

Two distinct kinds:
- **Route load** — `loading.tsx` for `/map/[owner]/[repo]`, a skeleton of the
  header and section frames, while the persisted map is read.
- **Mapping in progress** — after the trigger is pressed, the status region
  (section 2) shows a first-class in-progress state: a heading "Mapping the
  <owner>/<repo> project…", an indeterminate `Progress` indicator, and a
  reassurance line "Reading your project's files, tracing how they connect, and
  drawing the diagrams. This is a multi-step analysis and usually takes 30–90
  seconds." The trigger button shows a loading state and is disabled. The
  region is `aria-live` with `aria-busy="true"`. Optionally the in-progress
  state may show coarse pipeline phases (Reading files · Tracing flows ·
  Drawing diagrams) as plain text — but it must not promise streamed per-node
  progress; the MVP treats the run as one server round-trip.

### Mermaid rendering note

Mermaid diagrams (output 6) are rendered **client-side**: the page passes the
Mermaid source strings to a Client Component that runs the `mermaid` library in
the browser. While a diagram is rendering, that component shows its own small
placeholder (a `Skeleton` shaped like a diagram). This is in-component state,
detailed in `docs/design/architecture-flow-viewer.md` §9 — the Project Map
page's `loading.tsx` does not cover it.

## 10. Empty state

- **`/map` with no imported repositories** — a friendly empty state: "No
  repositories imported yet. Import one to get a project map." with an "Import
  a repository" action to `/import`.
- **`/map/[owner]/[repo]` not yet mapped** — this is a *resting* state, not an
  error: the header plus the "Map this project" trigger and a sentence on what
  it produces (a plain-language architecture overview, a key-file map, flow
  diagrams, and a debug path). Sections 3–7 are absent until a map exists.

## 11. Error state

Expected failures are **in-page error states** in the status region (section
2), each with a heading, a plain-language explanation, and a recovery action:

- **`not-imported`** — heading "This repository isn't imported yet".
  Explanation: a project map needs an imported snapshot. Action: "Import this
  repository" → `/import`.
- **`missing-api-key`** — heading "AI mapping isn't configured". Explanation:
  the map is generated by an AI pipeline and needs an `ANTHROPIC_API_KEY` set
  in the project's `.env` file (read server-side only); point to
  `.env.example`. No key is ever collected in the UI.
- **`empty-snapshot`** — heading "We couldn't find any code to map".
  Explanation: the snapshot has no recognizable source files; the repo may not
  be a code project, or its files weren't imported. Suggest re-importing.
- **`pipeline-failure`** — heading "The map couldn't be generated". Explanation:
  the mapping pipeline failed (it may be a rate limit or a temporary network
  problem); a "Try again" action.
- **`unknown`** — heading "Something went wrong". A short friendly catch-all
  and a "Try again" action. No raw stack trace, status code, or payload shown.

Every error state renders as text in the `aria-live` region (announced; text +
icon, not color alone). A failed re-map keeps the previously stored map visible
below the error rather than blanking the page.

## 12. Success state

After a successful mapping run (or on load when one is already stored), the
page renders the mapped state: the "Mapped <time>" line, the section nav, then
the Architecture overview, the File Map Explorer, the Architecture Flow Viewer,
and the Debug Path UI. The result is persistent — it stays until the user
re-maps.

A **partial map** still renders fully — this is correct behaviour, not a
failure (PRD: degrades gracefully):
- A flow with `applicable: false` (e.g. the AI-call flow of a non-AI project)
  renders an explicit "Not applicable" panel with its `notApplicableReason`.
- A flow whose `steps` are sparse (no clear entry point) still renders what was
  found, framed honestly.
- `integrity.unresolved` references surface as the quiet verification note
  (§6) — never as a blocking error.

The Mermaid diagrams render client-side once the page is interactive.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (the `owner/repo` title); section
  headings descend in order (`<h2>` for sections 2–6, `<h3>` within) with no
  skipped levels. `<main>`, `<nav>` (including the section nav), and
  `<section>` landmarks. Layer-file lists and reference lists are `<ul>`s; file
  paths are `<code>`.
- **Status region is a live region.** Section 2 is `aria-live="polite"`; the
  in-progress state sets `aria-busy="true"`. Trigger → in-progress → success /
  error transitions are announced without a focus jump.
- **Section nav.** The in-page table of contents is a `<nav>` with an
  accessible name ("On this page"); each link moves focus to the target
  section heading.
- **Mermaid diagrams have a text alternative.** A rendered Mermaid diagram is
  not the only representation of a flow — each flow's ordered `steps` are also
  rendered as an ordered list, so the information is available without parsing
  an SVG. The diagram has an accessible name; see
  `docs/design/architecture-flow-viewer.md` §13.
- **States announced.** In-progress, success, the verification note, and every
  error message are real text content — never color-only or icon-only.
- **Keyboard.** Full keyboard operability with a visible focus ring: Tab
  reaches the trigger, the re-map / try-again actions, the section-nav links,
  and every file link; Enter/Space activate. DOM order = visual order.
- **Color & contrast.** WCAG 2.1 AA in light and dark themes (`next-themes`).
  The `ref` badge, importance/category badges, and error states convey meaning
  by text + icon, not color. Mermaid diagrams must be legible in both themes.
- **Long content.** The section headings and the section nav let assistive-tech
  and keyboard users jump section to section; the page is navigable, not one
  long blob.

## 14. Acceptance criteria

- [ ] `/map` lists imported repositories with a link to each one's map page,
      and shows the empty state (with an Import action) when none are imported.
- [ ] `/map/[owner]/[repo]` renders a header (`owner/repo` + `ref` badge) and,
      when not yet mapped, a "Map this project" trigger.
- [ ] Triggering shows a first-class **in-progress state** (heading, progress
      indicator, reassurance line) with the button disabled while it runs.
- [ ] A successful run renders the **Architecture overview**, the **File Map
      Explorer**, the **Architecture Flow Viewer**, and the **Debug Path UI**,
      plus a sticky **section nav**.
- [ ] All seven pipeline outputs are represented: architecture overview
      (section 3), key-file map (File Map Explorer), request/data + state +
      AI-call flows and their Mermaid diagrams (Architecture Flow Viewer), and
      the debug path (Debug Path UI).
- [ ] **Mermaid diagram source** from the `ProjectMap` is rendered
      **client-side**; the page never ships pre-rendered diagram images.
- [ ] An already-mapped repo renders its stored map on load, with a "Mapped
      <time>" line and a **Re-map** action.
- [ ] A **partial map** renders without error: a `not applicable` flow shows an
      explicit panel; sparse flows render what was found; unresolved file
      references show a quiet verification note, never a blocking error.
- [ ] **Error** state covers `not-imported`, `missing-api-key`,
      `empty-snapshot`, `pipeline-failure`, and a generic fallback — each with
      a distinct heading, plain-language explanation, and recovery action. No
      raw stack traces or status codes.
- [ ] The page reads from the typed backend (`getProjectMapByRepo`,
      `generateProjectMapAction`) — it renders states and never calls the
      pipeline or the model itself.
- [ ] The page renders against the `ProjectMap` shape in §5; task #108
      reconciles it with the real exported types.
- [ ] The page uses **only** `packages/ui` (shadcn/ui) components.
- [ ] Accessibility notes in §13 are satisfied.
- [ ] Page spec is human-reviewed before the Claude Design prompt is used.
