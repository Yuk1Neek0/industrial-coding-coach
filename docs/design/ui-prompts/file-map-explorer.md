# Claude Design Prompt: File Map Explorer

Issue: #107 · Epic: `project-logic-mapper` (M6) · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the File Map Explorer component. Full contract: the
page spec `docs/design/file-map-explorer.md` — read that for the complete
behaviour. This is a **component** rendered inside the Project Map page
(`docs/design/project-map-page.md`, section 4).

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach `docs/design/file-map-explorer.md` and the host spec
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

Build a **File Map Explorer** component for a learning-coach web app, using
Next.js (App Router), React, TypeScript, Tailwind CSS, and shadcn/ui. Light and
dark mode. It is an embedded component (no route of its own) — design it as a
self-contained component with a small demo wrapper. Use only mock sample data
passed as props — no data fetching, no API calls.

### Domain

This component shows a junior developer the **key files** of her AI-built
project — the handful that actually carry the logic — so she knows where to
look in a repo full of AI-generated files she can't tell apart. Each file is
described in plain language ("this is where the page the user sees is
defined"), tagged with how important it is and what kind of file it is. Every
path is a real file in her project.

The component receives this as props (mock it fully — no empty fields, no lorem
ipsum):

```ts
interface FileMapExplorerProps {
  keyFiles: KeyFile[];
}
interface KeyFile {
  path: string;        // real file path, e.g. "apps/web/app/import/page.tsx"
  role: string;        // what this file does in THIS project, plain language
  category: string;    // e.g. "entry point", "config", "route", "data", "test"
  importance: 'critical' | 'important' | 'supporting';
}
```

Seed the mock data with ~10–12 `keyFiles` for an AI-built Next.js + Drizzle +
SQLite portfolio app: realistic paths, a plain-language `role` for each, a mix
of categories (entry point, route, data, config, test) and all three importance
levels.

### Layout

The component sits under a host-provided `<h2>` "Key files". Top to bottom:

1. **Intro line** — one sentence: "The files that carry this project's logic —
   start here to understand the codebase." Optionally a "N key files" count.
2. **Filter bar** — a search text input (shadcn `Input`, with a search icon,
   placeholder "Search file paths") and a **category filter** (shadcn `Select`
   or a segmented control, default "All categories"). Both filter client-side:
   search matches `path` case-insensitively; the category filter matches
   `category`. Show a "3 of 12 files" count line when a filter is active.
3. **Key-file list** — render `keyFiles` as a list of rows or cards, **ranked
   by importance** so `critical` files come first, then `important`, then
   `supporting` (you may group under those headings, or sort within one list).
   Each entry shows: the **`path`** in monospace (rendered as a link); an
   **importance** `Badge` reading `critical` / `important` / `supporting`; a
   **category** `Badge` chip; and the **`role`** text as the main body.

A single readable column on mobile; a comfortable list (or two-column grid) on
wide screens — clarity over density, the `role` text must stay fully readable
and wrap, never truncated to hide meaning.

### States — design all of these

- **Populated** — the importance-ranked, filterable list described above.
- **Filtered** — with a search/category filter applied, the matching subset
  plus the "N of M files" count.
- **No filter matches** — when the filter excludes every file, keep the filter
  bar visible and show an inline message "No files match your search." with a
  **Clear filters** button that resets both inputs. Make this visibly distinct
  from the empty state below.
- **Empty — no key files** — when `keyFiles` is empty, a single quiet line "No
  key files were identified for this project." — no empty list, no filter bar
  results grid.

Provide simple toggles or variants so all of these can be previewed.

### Visual & accessibility requirements

- Clean, modern, content-first; scannable. Calm and trustworthy — a learning
  tool, not a marketing page.
- Fully responsive; comfortable on mobile and desktop.
- Light and dark mode using shadcn/Tailwind theme tokens — no hard-coded
  colors.
- Use **lucide-react** icons (search, file, etc.).
- Semantic HTML: the component renders under the host's `<h2>`; if importance
  groups are headings they are `<h3>`, none skipped. The key-file list is a
  `<ul>`/`<li>` list (or a list of `<article>`s). File paths are `<code>`.
- The search input has an associated `<label>` (visible or `sr-only`); the
  category filter is a labelled, keyboard-operable control.
- Importance and category are conveyed by the **text** in the badge, not color
  alone.
- The filtered-count line and the "no matches" message are real text content.
- All text meets WCAG AA contrast in both themes; long `role` text wraps and
  stays fully readable — nothing hidden behind truncation or hover.

### Components to use

shadcn/ui: `Card`, `Badge`, `Input`, `Select` (or a segmented control),
`Button`, `Separator`. lucide-react for icons. Keep components small and
composable so they integrate cleanly into an existing shadcn/ui monorepo —
reuse `packages/ui` rather than duplicating primitives.

---

## Notes for the integrator (task #108)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives.
- This component renders the `keyFiles` field of the real `ProjectMap`
  (`docs/design/project-map-page.md` §5) — it is **pure props**, no fetching.
  The `ProjectMap` shape is described from the PRD/epic; reconcile it with the
  real exported types from the M6 pipeline package / `@workspace/db`.
- Keep the search/category filter client-side (a small Client Component island
  over the host-loaded data); the host Project Map page stays Server
  Components.
- File-path links should point at a real file view where one exists; otherwise
  render plain monospace text — do not link nowhere.
- Verify against `docs/design/file-map-explorer.md` §14; record integration
  notes in `docs/design/ui-integration-notes/`.
