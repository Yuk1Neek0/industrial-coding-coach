# Claude Design Prompt: Stack Explanation page

Issue: #88 · Epic: `stack-explainer` (M5) · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Stack Explanation page. Full contract: the page
spec `docs/design/stack-explanation-page.md` — read it for the complete
behaviour. The page composes two further UIs with their own prompts:
`stack-decision-map.md` and `alternatives-comparison.md`.

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling.
2. Optionally attach the page spec `docs/design/stack-explanation-page.md`.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#89** reconciles it with
`apps/web` + `packages/ui` and wires it to the real M5 backend — Claude Design
produces the interface, not the wiring.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only —
no data fetching, no real API or SDK calls.

---

## Prompt — paste into Claude Design

Build a **Stack Explanation** experience for a local-first learning-coach web
app, using Next.js (App Router), React, TypeScript, Tailwind CSS, and
shadcn/ui. Light and dark mode. Use only mock sample data — no data fetching,
no API calls; the "explain" action is a mock that resolves to a sample
explanation or a sample error, so it is trivial to swap for a real server
action later.

### Domain

The product helps a job-seeking junior developer understand a project she
built with heavy AI assistance. She has already imported a GitHub repository.
This page explains **why that project uses the technology stack it does** —
tied to its actual files, never generic tutorial text. The target user is a
beginner; copy is plain, concrete, and encouraging, and errors teach rather
than blame.

A stack explanation has this shape (the mock success result):

- `tools` — array of `{ name, purpose, jobRelevance, alternatives }` where
  `alternatives` is an array of `{ name, tradeOff }`. `name` is a tool like
  "Next.js"; `purpose` is what it does in *this* project in plain language;
  `jobRelevance` is why it matters for the job market; each alternative's
  `tradeOff` is what would change in the project if it were used instead.
- `keyFiles` — array of `{ path, reason }`: files worth inspecting.
- `debugEntryPoints` — array of `{ location, guidance }`: where to start
  debugging.
- `updatedAt` — ISO timestamp of when the explanation was generated.

### Routes

Design **two routes**:

1. `/stack` — a **chooser**: a simple list of imported repositories, each a
   card or row showing `owner/repo` and a branch badge, linking to that repo's
   explanation page. Include its **empty state**: "No repositories imported
   yet. Import one to get a stack explanation." with an "Import a repository"
   button.

2. `/stack/[owner]/[repo]` — the **Stack Explanation page**. Single-column,
   comfortable max width. From top to bottom:
   - A **page header**: `owner/repo` as the title, the branch/ref as a shadcn
     `Badge`, and a one-line subtitle "Why this project uses the stack it does
     — explained against its actual files."
   - A **trigger / status region** directly below the header (see States).
   - When explained: the **Stack Decision Map**, the **Alternatives
     Comparison**, a **Key files to inspect** list, and a **Where to start
     debugging** list (described below).

### States — design all of these for `/stack/[owner]/[repo]`

Provide toggles or separate preview screens so every state can be viewed.

- **Not yet explained (resting state)** — the header, then a trigger region: a
  primary **"Explain this stack"** button and a sentence "We'll read your
  project's files and explain why it uses each tool." No result sections yet.

- **In progress** — after the button is pressed: a heading "Explaining the
  owner/repo stack…", an **indeterminate progress indicator** (shadcn
  `Progress` or a spinner), and a reassurance line "Reading your project's
  files and writing the explanation. This usually takes 10–30 seconds." The
  button shows a loading/disabled state.

- **Explained (success)** — the trigger region collapses to a quiet line
  "Explained <relative time>" with a secondary **"Re-explain"** button, then:
  - **Stack Decision Map** — under an `<h2>` "Stack decision map", a column of
    tool cards: each card has the tool name, its `purpose`, and a visually
    distinct **job-relevance** callout ("Why it matters for jobs"). (A separate
    prompt details this UI; here, render a clean first version.)
  - **Alternatives Comparison** — under an `<h2>` "Alternatives & trade-offs",
    grouped per tool: each tool that has alternatives shows each alternative's
    name paired with its trade-off, trade-off prominent.
  - **Key files to inspect** — under an `<h2>`, a list of `keyFiles`: each
    `path` in monospace and its `reason`.
  - **Where to start debugging** — under an `<h2>`, a list of
    `debugEntryPoints`: each `location` and its `guidance`.

- **Error — design each kind as a distinct state** in the status region, each
  with its own heading, a plain-language explanation, and a recovery action.
  No raw stack traces or status codes.
  - **Not imported** — "This repository isn't imported yet" → "Import this
    repository" button.
  - **AI not configured** — "AI explanation isn't configured": the explanation
    needs an `ANTHROPIC_API_KEY` in the project's `.env` file; never collect a
    key in the UI.
  - **Unrecognized stack** — "We couldn't recognize this project's stack": no
    major tools were detected; suggest re-importing.
  - **Explanation failed** — "The explanation couldn't be generated": the AI
    request failed; include a "Try again" button.
  - A generic **"Something went wrong"** fallback with a "Try again" button.

### Visual & accessibility requirements

- Clean, modern, content-first, calm and trustworthy — a learning tool, not a
  marketing page. Generous spacing, readable typography. The page is long;
  make it scannable with clear section headings.
- Fully responsive; light and dark mode using shadcn/Tailwind theme tokens (no
  hard-coded colors). Use **lucide-react** icons (e.g. layers, loader,
  check-circle, file-code, bug, alert-triangle).
- Semantic HTML: exactly one `<h1>` (the title); section headings descend in
  order (`<h2>`/`<h3>`), none skipped. `<main>`/`<nav>`/`<section>` landmarks.
  Key-files and debug lists are `<ul>`s; file paths are `<code>`.
- The status/result region is `aria-live="polite"`; the in-progress state sets
  `aria-busy="true"`.
- Full keyboard operability with a visible focus ring; meaning conveyed by
  text + icon, not color alone; WCAG AA contrast in both themes.

### Components to use

shadcn/ui: `Button`, `Badge`, `Card` (`CardHeader`, `CardTitle`,
`CardDescription`, `CardContent`), `Progress` (or spinner), `Alert` (error
states), `Separator`, `Skeleton` (route loading). lucide-react for icons.
Reuse `packages/ui` — do not duplicate primitives.

---

## Notes for the integrator (task #89)

- Reuse `@workspace/ui`; add any missing shadcn components there, not in
  `apps/web`.
- Replace the mock explain action with a **Server Action** wrapping
  `explainStack` (#86) + `saveStackExplanation` (#87); read a stored
  explanation in the Server Component via `getStackExplanationByRepo` (#87).
  The page never calls the Anthropic SDK directly.
- Map the design's error mockups onto the Server Action's `kind`s
  (`not-imported`, `missing-api-key`, `unrecognized-stack`, `llm-failure`,
  `unknown`).
- Keep expected failures as **in-page error states**; route `error.tsx` is for
  unexpected render-time failures only. Add a route `loading.tsx` for the
  initial persisted-explanation read.
- The Stack Decision Map and Alternatives Comparison have their own prompts /
  specs — integrate all three into one page.
- Wire file references to a real destination when one exists, otherwise render
  them as plain monospace text — do not link nowhere.
- Verify against `docs/design/stack-explanation-page.md` §14; record
  integration notes under `docs/design/ui-integration-notes/`.
