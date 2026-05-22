# Page Spec: File Map Explorer

Issue: #107 · Epic: `project-logic-mapper` (M6) · PRD: `.claude/prds/project-logic-mapper.md` (FR-5, FR-6, US-2)

This spec defines the **File Map Explorer** UI — the key-file map component of
the Project Map page (`docs/design/project-map-page.md`, section 4). It is the
input to the Claude Design prompt
(`docs/design/ui-prompts/file-map-explorer.md`) and to integration task #108,
and must be human-reviewed before the prompt is run.

It is a **component**, not a standalone route — it renders inside
`/map/[owner]/[repo]`. Sections below mirror the standard page-spec format;
where a section does not apply to an embedded component it says so.

(UI tool: Claude Design — see ADR 0007.)

---

## 1. Name

**File Map Explorer** — a browsable map of a project's key files: which files
matter, what each one does in *this* project, and how important it is — so the
user knows where the project's logic actually lives.

## 2. User goal

> "My repo has dozens of files and I don't know which ones matter. Tell me the
> handful that actually carry the project — what each one does — so I know
> where to look and what to talk about."

The user scans the key-file list to learn which files are the project's load-
bearing ones, filters by category (entry point, route, data, config, test) or
searches a path, and reads any single file's role to be able to explain it.

## 3. Target user

**Mia, the job-seeking junior dev.** She is overwhelmed by a repo full of AI-
generated files and cannot tell signal from noise. The File Map Explorer must
surface the *few files that matter* and rank them, each described in plain
language ("this is where the page the user sees is defined"). Every path must
be a real file in her snapshot so she can open it and confirm.

## 4. Route(s)

n/a — embedded component. It renders in section 4 of `/map/[owner]/[repo]`. No
route, no `loading.tsx`, no `error.tsx` of its own; the host page owns route,
loading, and error concerns. The category filter and path search are
component-local client state (a small Client Component island over the
host-loaded data).

## 5. Data source / contract

The component is **pure presentation** — it receives the already-loaded
key-file list as props from the host page and fetches nothing. Filtering and
searching are client-side over those props.

```ts
interface FileMapExplorerProps {
  keyFiles: KeyFile[];   // Output 2 of the pipeline — the key-file map
}

interface KeyFile {
  path: string;          // real snapshot path, e.g. "apps/web/app/import/page.tsx"
  role: string;          // what this file does in THIS project, plain language
  category: string;      // e.g. "entry point", "config", "route", "data", "test"
  importance: 'critical' | 'important' | 'supporting';
}
```

This component renders pipeline **Output 2** (the key-file map) — the
`keyFiles` field of `ProjectMap`. The full `ProjectMap` shape and the
seven-output mapping table are defined in `docs/design/project-map-page.md` §5
— that page-spec is the canonical contract, and its §5 carries the caveat that
the typed shape is described from the PRD/epic until tasks #102/#105 land.
Every `path` is a real snapshot path (PRD FR-6, US-2); the host page's
integrity check (#106) is what guarantees this — this component just renders.

## 6. Sections / layout

The component sits under a host-provided `<h2>` "Key files". Top to bottom:

1. **Intro line** — one sentence: "The files that carry this project's logic —
   start here to understand the codebase." Optionally a count ("N key files").
2. **Filter bar** — a path search input (shadcn `Input`, with a search icon,
   placeholder "Search file paths") and a **category filter** (shadcn `Select`
   or a segmented control, default "All categories"). Both filter client-side
   over `keyFiles`: search matches `path` case-insensitively; the category
   filter matches `category`. A filtered-count line ("3 of 12 files") appears
   when a filter is active.
3. **Key-file list** — `keyFiles` rendered as a list of rows/cards, grouped or
   sorted so the **most important files come first** (sort by `importance`:
   `critical` → `important` → `supporting`; optionally group under those
   headings). Each entry shows:
   - the **`path`** in monospace, linkable to the file where a destination
     exists;
   - an **importance** indicator — a `Badge` reading `critical` / `important` /
     `supporting` (text label, not color alone);
   - a **category** chip (`Badge`) — `entry point`, `route`, `config`, `data`,
     `test`, etc.;
   - the **`role`** text — what this file does in this project, plain language,
     the main content of the entry.

Layout: a single readable column on mobile; a comfortable list (or two-column
grid) on wide viewports — clarity over density, the `role` text must stay
fully readable (wraps, never truncated to hide meaning).

## 7. Input fields

| Field | Type | Behaviour |
|---|---|---|
| **Path search** | text input (`Input`) | Filters the list to `keyFiles` whose `path` contains the query, case-insensitive. Empty = no path filter. |
| **Category filter** | `Select` / segmented control | Filters to a single `category`; "All categories" default shows everything. |

Filtering is client-side and immediate; it never refetches. The component is a
small Client Component island; the host page shell is a Server Component.

## 8. Primary actions

- **Search by path** / **filter by category** — narrow the list (§7).
- **Clear filters** — when a filter excludes everything, a "Clear filters"
  button resets both inputs (see §10).
- **File links** — each `path` links to the file where a destination exists;
  otherwise plain monospace text (the integrator decides — do not link
  nowhere).

No destructive actions — the component never modifies the snapshot or the map.

## 9. Loading state

n/a at the component level — the host page's route `loading.tsx` and
mapping-in-progress state cover loading. The component is only ever rendered
with a real `keyFiles` array. The integrator must not invent a separate
skeleton here.

## 10. Empty state

- **`keyFiles` is empty** — a degenerate map where the pipeline identified no
  key files. The component renders a single quiet line: "No key files were
  identified for this project." It does not render an empty list or an empty
  filter bar's results grid. In practice the host page shows the
  `empty-snapshot` error before reaching this, so this is a defensive
  fallback.
- **No filter matches** — when the path search / category filter excludes every
  file, keep the filter bar visible and show an inline message "No files match
  your search." with a **Clear filters** button that resets the inputs. This is
  visibly different from the "no key files identified" state.

## 11. Error state

n/a — the component receives a valid `KeyFile[]` (possibly empty) or nothing;
all error handling is the host page's (`docs/design/project-map-page.md` §11).
The component never throws on a well-typed `KeyFile[]`. Unresolved file
references (a `path` not found in the snapshot) are surfaced by the host page's
quiet integrity note, not by this component — it still renders the row.

## 12. Success state

The populated explorer *is* the success state: a scannable, importance-ranked
list of the project's key files, each with its role, category, and importance,
every path a real snapshot path. With a filter applied it shows the matching
subset and a filtered count; clearing the filter restores the full list.

## 13. Accessibility notes

- The component renders under the host's `<h2>` "Key files"; if importance
  groups are shown as headings they are `<h3>` — ordered, none skipped. The
  key-file list is a `<ul>`/`<li>` list (or a list of `<article>`s).
- File paths are `<code>`; file links are real links with a visible focus
  ring; each link's accessible name includes the path.
- The path search input has an associated `<label>` (visible or `sr-only`);
  the category filter is a labelled, keyboard-operable control.
- The filtered-count line and the "no matches" message are real text content,
  updated so assistive tech can observe the change (a polite live region for
  the count is acceptable).
- Importance and category are conveyed by **text** in the badge, not color
  alone; the badges meet WCAG 2.1 AA contrast in light and dark themes.
- Long `role` text wraps and stays fully readable — nothing meaningful is
  hidden behind truncation or hover.
- Keyboard: the search input, the category control, the "Clear filters"
  button, and every file link are reachable and operable; DOM order = visual
  order.

## 14. Acceptance criteria

- [ ] Renders the **key-file map** (pipeline Output 2) — one entry per
      `KeyFile`, with the `path`, an **importance** badge, a **category** chip,
      and the plain-language **`role`**.
- [ ] The list is **ranked by importance** (`critical` → `important` →
      `supporting`) so the load-bearing files come first.
- [ ] A **path search** and a **category filter** narrow the list client-side;
      a filtered-count line appears when a filter is active.
- [ ] When a filter matches nothing, the filter bar stays visible with a "no
      files match" message and a **Clear filters** action — visibly distinct
      from the "no key files identified" empty state.
- [ ] An empty `keyFiles` array renders a single quiet "no key files
      identified" line, not an empty list.
- [ ] Every `path` is rendered as a real snapshot path (monospace), linkable to
      the file where a destination exists.
- [ ] The component is **pure props** over the `keyFiles` field of `ProjectMap`
      (`docs/design/project-map-page.md` §5) — no fetching.
- [ ] Uses **only** `packages/ui` (shadcn/ui) components.
- [ ] Accessibility notes in §13 are satisfied — list semantics, labelled
      filter controls, text-not-color badges, keyboard operability, AA
      contrast.
- [ ] Spec is human-reviewed before the Claude Design prompt is used.
