# Page Spec: Debug Path UI

Issue: #107 · Epic: `project-logic-mapper` (M6) · PRD: `.claude/prds/project-logic-mapper.md` (FR-5, FR-6, US-7, US-9)

This spec defines the **Debug Path UI** — the debug-path component of the
Project Map page (`docs/design/project-map-page.md`, section 6). It is the
input to the Claude Design prompt (`docs/design/ui-prompts/debug-path-ui.md`)
and to integration task #108, and must be human-reviewed before the prompt is
run.

It is a **component**, not a standalone route — it renders inside
`/map/[owner]/[repo]`. Sections below mirror the standard page-spec format;
where a section does not apply to an embedded component it says so.

(UI tool: Claude Design — see ADR 0007.)

---

## 1. Name

**Debug Path UI** — a "when something breaks, look here" map: common failure
symptoms paired with the real file to start from and what to look for — so the
user has a first move when the project misbehaves.

## 2. User goal

> "When my project breaks I just stare at it. Give me a starting point: if the
> page won't load, if the data is wrong, if the AI call fails — tell me which
> file to open first and what to check."

The user scans the list of common failure symptoms, finds the one resembling
their problem, and reads the entry point — a real file — plus the guidance on
what to investigate. This is the section that turns "I can't debug my own
project" into "I know where to start."

## 3. Target user

**Mia, the job-seeking junior dev.** When something breaks she has no mental
model of where to look — she did not write the code path-by-path. The Debug
Path UI must speak in **symptoms she would actually observe** ("the page shows
an error", "the imported data looks empty", "the AI response never comes
back"), not in internal failure modes. Each entry point is a real file she can
open. Being able to *name where to start debugging* is the M6 milestone
acceptance (PRD US-9).

## 4. Route(s)

n/a — embedded component. It renders in section 6 of `/map/[owner]/[repo]`. No
route, no `loading.tsx`, no `error.tsx` of its own; the host page owns route,
loading, and error concerns.

## 5. Data source / contract

The component is **pure presentation** — it receives the already-loaded debug
path as props from the host page and fetches nothing.

```ts
interface DebugPathUIProps {
  debugPath: {
    entryPoints: DebugEntryPoint[];   // Output 7 of the pipeline — the debug path
  };
}

interface DebugEntryPoint {
  symptom: string;     // a common failure, in observable plain language
  file: string;        // real snapshot path to start investigating from
  guidance: string;    // what to look for / how to investigate at that file
}
```

This component renders pipeline **Output 7** (the debug path) — the
`debugPath` field of `ProjectMap`. The full `ProjectMap` shape and the
seven-output mapping table are defined in `docs/design/project-map-page.md` §5
— that page-spec is the canonical contract, and its §5 carries the caveat that
the typed shape is described from the PRD/epic until tasks #102/#105 land.
Every `file` is a real snapshot path (PRD FR-6, US-7); the host page's
integrity check (#106) guarantees this — this component just renders.

## 6. Sections / layout

The component sits under a host-provided `<h2>` "Where to start debugging".
Top to bottom:

1. **Intro line** — one sentence framing the section: "If something breaks,
   here is where to start looking — matched to common problems and your real
   files."
2. **Debug entry-point list** — `entryPoints` rendered as a list of entries,
   one per `DebugEntryPoint`, in the order the pipeline gives them (most-likely
   / most-common first). Each entry is a card / row showing:
   - the **`symptom`** as the entry's heading — the observable failure, the
     thing the user recognizes ("The page shows an error instead of loading");
   - **"Start here:"** the **`file`** path in monospace, linkable to the file
     where a destination exists — visually the entry's anchor;
   - the **`guidance`** text — what to look for in that file and how to
     investigate, plain language, the main body of the entry.

A card layout with the symptom as the prominent heading and a clear "Start
here" file affordance reads best — the user scans symptoms, then drills into
the matching one. A single readable column on mobile; a comfortable list (or
two-column grid) on wide viewports — the `guidance` text must stay fully
readable (wraps, never truncated to hide meaning).

## 7. Input fields

None — the component is read-only. No forms, no inputs. (If the entry list is
long, an integrator may add a client-side symptom filter, but it is not
required by this spec — the MVP is a plain ordered list.)

## 8. Primary actions

- **File links** — each entry-point `file` links to the file where a
  destination exists; otherwise plain monospace text (the integrator decides —
  do not link nowhere).

No other actions; no destructive actions.

## 9. Loading state

n/a at the component level — the host page's route `loading.tsx` and
mapping-in-progress state cover loading. The component is only ever rendered
with a real `debugPath` object. The integrator must not invent a separate
skeleton here.

## 10. Empty state

- **`entryPoints` is empty** — the pipeline produced no debug entry points
  (degenerate; the rest of the map may still be useful). The component renders
  a single quiet line: "No specific debug starting points were identified for
  this project." It does not render an empty list. The map's other sections
  are unaffected — a missing debug path is a partial result, not a failure
  (PRD: degrades gracefully).

## 11. Error state

n/a — the component receives a valid `debugPath` (with a possibly empty
`entryPoints` array) or nothing; all error handling is the host page's
(`docs/design/project-map-page.md` §11). The component never throws on a
well-typed `debugPath`. An unresolved `file` reference is surfaced by the host
page's quiet integrity note, not by this component — it still renders the
entry.

## 12. Success state

The populated Debug Path UI *is* the success state: an ordered, scannable list
of common failure symptoms, each paired with a real starting-point file and
plain-language guidance on what to check. From it the user can name where to
start debugging a common failure — the M6 milestone acceptance (PRD US-9).

## 13. Accessibility notes

- The component renders under the host's `<h2>` "Where to start debugging";
  each entry's `symptom` heading is an `<h3>` — ordered, none skipped. The
  entry list is a `<ul>`/`<li>` list (or a list of `<article>`s).
- File paths are `<code>`; the "Start here" file links are real links with a
  visible focus ring; each link's accessible name includes the path.
- The "Start here" label and the symptom/guidance text are conveyed by visible
  text, not color or an icon alone; any decorative symptom icon has no semantic
  load.
- Long `guidance` text wraps and stays fully readable — nothing meaningful is
  hidden behind truncation or hover.
- WCAG 2.1 AA contrast in light and dark themes for the cards, headings, and
  links.
- Keyboard: every file link is reachable and operable; DOM order = visual
  order; the list is scannable heading-to-heading by assistive tech.

## 14. Acceptance criteria

- [ ] Renders the **debug path** (pipeline Output 7) — one entry per
      `DebugEntryPoint`, in the pipeline's order.
- [ ] Each entry shows the **`symptom`** as its heading, the **`file`** as a
      "Start here" real snapshot path, and the plain-language **`guidance`**.
- [ ] Every `file` is rendered as a real snapshot path (monospace), linkable to
      the file where a destination exists.
- [ ] An empty `entryPoints` array renders a single quiet "no debug starting
      points identified" line, not an empty list — the rest of the map is
      unaffected.
- [ ] The component is **pure props** over the `debugPath` field of
      `ProjectMap` (`docs/design/project-map-page.md` §5) — no fetching.
- [ ] Uses **only** `packages/ui` (shadcn/ui) components.
- [ ] Accessibility notes in §13 are satisfied — ordered headings, list
      semantics, real file links with focus rings, text-not-color, keyboard
      operability, AA contrast in both themes.
- [ ] Spec is human-reviewed before the Claude Design prompt is used.
