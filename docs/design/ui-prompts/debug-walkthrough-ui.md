# Claude Design Prompt: Debug Walkthrough UI

Issue: #146 · Epic: `debug-expansion-challenge` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Debug Walkthrough UI — the **answer-entry**
component of the M9 Debug and Expansion Challenge System. Full contract: the
page spec `docs/design/debug-walkthrough-ui.md` — read that for the complete
behaviour. The grading half of the loop is the **Completion Review UI**
(`docs/design/completion-review-ui.md`, task #147); this component does not
render grading.

The host route (inline on the Challenge Detail Page vs its own sub-route under
`apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/...`) is resolved
by **task #145's Challenge Detail Page Spec** — this prompt is written so the
component renders the same whether it lives inline or on a sub-route.

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach the page spec `docs/design/debug-walkthrough-ui.md` as
   context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#148** reconciles it with
`apps/web` + `packages/ui` and wires the component to the real M9 challenges
data-access layer (`packages/db/src/challenges/`, task #140), the generation
call (task #142), and the grading call (task #143). Do not expect Claude
Design to produce final wiring; it produces the interface.

**Stack to target:** Next.js App Router, React Server Components for any host
page shell + a Client Component island for this answer-entry form, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only —
no data fetching.

---

## Prompt — paste into Claude Design

Build a **Debug Walkthrough UI** for a learning-coach web app, using Next.js
(App Router), React, TypeScript, Tailwind CSS, and shadcn/ui. It is a
**component** — not a standalone route — that lets a user answer one
project-tied debug/extension challenge by writing a free-text explanation,
picking the files they would change from a restricted list, and optionally
attaching small illustrative code snippets. Light and dark mode. Use only
mock sample data — do not add data fetching, API calls, or a database; render
from typed in-file objects so it is trivial to swap for real server data
later. **Build for both possible hosts**: a single page wrapper that shows
the component inline (as a section on a parent "Challenge Detail" page) and a
single page wrapper that shows the component as the only content of its own
sub-route. The component itself is the same in both — only its heading level
differs.

### Domain

The app coaches a job-seeking junior developer to genuinely understand
projects they built with heavy AI assistance. This component is the
**answer-entry surface** for one **M9 challenge** on the user's imported
GitHub repository — concrete, project-tied tasks like *add a small field*,
*trace a failed API call*, *fix a schema mismatch*, *add a loading/error
state*, *add a unit test*, *explain a broken CI result*, or *extend one
module safely*.

The user **does not run any code** here. The user writes — in plain
English — **which files they would change and why**, against the project's
real M6 project map. Optionally they can attach small illustrative code
snippets keyed to specific files from the map. Submitting saves the answer
and triggers grading; the grading result is rendered by a **separate
sibling** component (the Completion Review UI), not by this one.

The grading is over the user's **explanation only**. Snippets are
illustrative context — they are **not scored** for style, naming, or
plausibility. This framing must reach the user inside this component, as
real plain-text helper copy (not a tooltip), so they don't waste effort
polishing snippets expecting them to move the score.

Copy is plain, calm, encouraging, jargon-light. There is no timer, no
pass/fail stamp on entry, no penalty.

### Typed shapes — these are the contracts the component renders and produces

These are the typed shapes from the M9 PRD (FR-3, FR-4) and the M9 challenges
schema / data-access layer (`packages/db/src/challenges/`, task #140). Render
from in-file mock instances of `Challenge` and `ChallengeAttempt | null`; do
not invent extra fields. Field names in the merged code are authoritative at
integration time, but the shape is fixed.

```ts
// ----- Challenge (FR-3) -----

/** One of the M9 challenge types (FR-2). */
type ChallengeType =
  | "add-small-field"
  | "trace-failed-call"
  | "fix-schema-mismatch"
  | "add-loading-error-state"
  | "add-unit-test"
  | "explain-broken-ci"
  | "extend-module-safely"

/** An M6-named file the challenge ties to. Strictly limited to paths
 *  the M6 project map explicitly names (R8). */
interface ProjectMapFileRef {
  path: string  // e.g. "apps/web/app/api/widgets/route.ts"
  role: string  // e.g. "API request handler"
}

/** A citation back into the M6 project map. */
interface MapReference {
  kind: "key-file" | "request-flow" | "state-flow" | "ai-call-flow" | "debug-path"
  path: string  // an M6-named path
  note: string  // a one-line plain-language note from the map
}

/** The active challenge being answered. */
interface Challenge {
  id: string
  snapshotRef: { owner: string; name: string; ref: string }
  type: ChallengeType
  taskDescription: string         // plain-language ask, references real files
  inScopeFiles: ProjectMapFileRef[]    // R8 — M6-named only
  outOfScopeFiles: ProjectMapFileRef[] // R8 — M6-named only; may be empty
  acceptanceCriteria: string[]    // what "done" looks like
  mapReferences: MapReference[]   // citations into the M6 map
  createdAt: Date
}

// ----- Attempt (FR-4) -----

/** An optional illustrative snippet — keyed to an M6-named path, never
 *  free-typed. NOT graded for style, naming, or plausibility (R3 / FR-7). */
interface ChallengeAttemptSnippet {
  path: string  // chosen from the restricted M6 list
  code: string  // plain text, illustrative only
}

/** What the form submits — the typed attempt shape (FR-4). */
interface ChallengeAttemptInput {
  explanation: string                       // PRIMARY input — graded
  filePaths: string[]                       // picked from M6 list; R8 / FR-4
  snippets: ChallengeAttemptSnippet[]       // optional; NOT graded
}

/** A stored attempt read back, used to pre-populate or render read-only. */
interface ChallengeAttempt {
  id: string
  challengeId: string
  explanation: string
  filePaths: string[]
  snippets: ChallengeAttemptSnippet[]
  submittedAt: Date
  // The grading result is rendered by the Completion Review UI — not here.
  grading: unknown | null
}

// ----- Component props -----

interface DebugWalkthroughProps {
  challenge: Challenge
  priorAttempt: ChallengeAttempt | null
  /** When true, render the submitted attempt read-only (no inputs). */
  locked: boolean
}

// ----- Submit path (server action — wired by integration task #148) -----
// submitChallengeAttempt(challengeId: string, input: ChallengeAttemptInput)
//   → Promise<ChallengeAttempt>
```

### Seed the mock data with a realistic challenge

Build mock data for **one realistic challenge** on a repo like
`mia-dev/portfolio-api`, e.g. a `"add-small-field"` challenge titled
"Add a `priority` field to the widget API" with:

- a 2–3 sentence `taskDescription` that names real-looking files in the user's
  repo;
- **3–5 `inScopeFiles`** with plausible paths and short role captions
  (e.g. `apps/web/app/api/widgets/route.ts` — "API request handler",
  `apps/web/components/widgets/widget-form.tsx` — "Widget form component",
  `packages/db/src/schema.ts` — "Drizzle schema");
- **2–4 `outOfScopeFiles`** that look plausibly adjacent but are not
  required (e.g. an unrelated auth file, a marketing page);
- **3–5 `acceptanceCriteria`** that read like an honest definition of done
  ("The new field is persisted in the database", "The form lets the user
  enter the new field", "The API serializes the new field", "An existing
  test covers the new field");
- **3–5 `mapReferences`** — small citations from the M6 map (one
  `key-file`, one `request-flow`, one `debug-path`).

Also provide a second toggleable mock for a `"trace-failed-call"` challenge
so the design covers a different challenge type, and a `priorAttempt` mock
(an explanation paragraph, 2 picked file paths, 1 snippet) so the "returning
user" states can be previewed.

No "lorem ipsum" — write plausible content for a portfolio app a junior dev
might have built.

### Component layout

A single readable column (or a 2-column scope-panel-plus-form on wide
screens). From top to bottom:

1. **Section header** — heading "Your walkthrough" (use `<h2>` in the
   "inline on the Detail Page" host wrapper; use `<h1>` in the "sub-route"
   host wrapper). One-line description: "Explain in your own words which
   files you would change and why. Only your explanation is graded; any
   snippets you attach are notes to yourself, not part of the score." Add
   a small honest note that grading is automated AI coaching feedback (real
   text, calm styling — not an icon-only signal).

2. **Challenge scope panel — visible while answering.** A compact, calm
   reference panel that **stays visible** while the user writes. On wide
   screens, render it as a **sticky** side panel (or a sticky card pinned
   above the explanation); on narrow screens, render it as a `Collapsible`
   block above the explanation that is **open by default**. The panel
   contains:
   - the challenge **type** as a calm `Badge` and a one-line summary
     derived from `taskDescription` (the full description can be in the
     panel or in a "What this challenge is" `Accordion` above it — your
     call; the goal is the user does **not** have to scroll back to know
     what they're answering);
   - **"In scope"** — `challenge.inScopeFiles` as a `<ul>` of monospace
     `<code>` path chips, each with its `role` as a small caption beneath
     the path;
   - **"Out of scope"** — `challenge.outOfScopeFiles` in the same style
     under a clearly separated "Out of scope" heading. If
     `outOfScopeFiles` is empty, show a quiet inline note ("No
     out-of-scope files were flagged for this challenge") rather than
     omitting the heading silently;
   - **"Done when…"** — `challenge.acceptanceCriteria` as a bulleted
     `<ul>`.
   The panel is read-only. It must stay visible while the user writes —
   it is the boundary the user is answering against (R8).

3. **Explanation field — the primary input.** A large free-text
   `Textarea` labelled "Explain which files you would change and why."
   This is the **headline input** — give it clearly more visual weight
   than the snippets section: bigger min-height, larger label, generous
   spacing. Helper text beneath it, in plain body text:
   > Plain English — write the way you'd answer in an interview.
   > **Only this explanation is graded.**
   No length limit; an optional soft character counter is fine.

4. **Files-you-would-change picker — restricted to M6 paths.** A
   separate labelled input ("Files you would change"). This is a
   **combobox / multi-select over a restricted list** — concretely, the
   union of `challenge.inScopeFiles[i].path`,
   `challenge.outOfScopeFiles[i].path`, and
   `challenge.mapReferences[i].path` (de-duplicated). **The input has no
   free-text fallback** — there is no plain text field the user could
   type an arbitrary path into. Picking semantics:
   - opening the picker shows the restricted list of M6-named paths in a
     `Popover` / listbox; each option renders the path in monospace with
     its M6 `role` as a small caption;
   - typing in the combobox **filters the visible options** by path
     substring — it does **not** allow a new path to be added;
   - selected paths render as a row of monospace `Badge` / chips beneath
     the combobox, each with a small "remove" button (`X`);
   - each chip carries a small text badge ("in scope" / "out of scope")
     so the user can see, with text not just color, whether their chosen
     path is in scope. Picking an out-of-scope path is **allowed** — it
     is a calm visible cue, not a hard block (the grader is the judge);
   - the chosen list is the `filePaths` field on submit.

5. **Optional snippets — illustrative, not graded.** A section beneath
   the explanation, labelled "Optional code snippets (notes to yourself)",
   **collapsed by default** (a `"+ Add a snippet"` button). At the top of
   the snippets section, render this as **prominent, persistent body
   text** (not a tooltip, not an icon-only hint):
   > **Snippets are illustrative — they are not scored for style, naming,
   > or plausibility. Only your explanation above is graded.**
   When expanded, each snippet row is a `<fieldset>` with:
   - a **path picker** for `snippet.path`, using the **same restricted
     M6-only combobox** as section 4 — no free-typed paths;
   - a `Textarea` for `snippet.code` — monospace font, **no syntax
     highlighting required** (keep it deliberately plain — that reinforces
     "not graded");
   - a "Remove snippet" button.
   Allow multiple snippets; zero is the expected default.

6. **Submit area** — a primary `Button` "Submit answer" and a short
   reassurance line ("Your answer is saved as soon as you submit. Grading
   takes a few seconds."). When the explanation is empty, show a gentle
   inline note "Your explanation is empty — you can submit anyway." (the
   submit button stays enabled — blank answers are allowed and graded
   honestly). Add a small "Reset draft" link that clears the form behind
   a confirm.

7. **Submitted (read-only) view.** When `priorAttempt` is non-null and
   `locked` is `true`, render the submitted explanation, picked file
   paths, and snippets as read-only content beneath the scope panel —
   no inputs, no submit button. The Completion Review UI renders below
   it in the host page; for the design, just show a placeholder
   "Completion Review UI renders here" block beneath the read-only view
   so the seam is visible.

8. **Pre-populated revision view.** When `priorAttempt` is non-null and
   `locked` is `false`, pre-populate the form with the prior attempt's
   explanation, file paths, and snippets so the user can revise and
   re-submit.

### Visible states — design all of these (toggleable in the preview)

- **Empty / fresh** — `priorAttempt = null`, form blank, snippets collapsed,
  scope panel populated from `Challenge`.
- **Filled (mid-draft)** — explanation typed, 2 file paths picked (one in
  scope, one out of scope so the badge is visible), snippets still
  collapsed.
- **Snippets open** — one snippet attached to an in-scope path, with the
  "not graded" framing visible above it.
- **Submitting** — every input disabled (`aria-disabled`), submit button
  shows "Submitting your answer…" with a spinner, the submit region carries
  `aria-busy="true"`; the typed answer stays visible; a short status line
  reads "Saving your answer and grading it — a few seconds."
- **Submit failed** — re-enable the form, the typed answer stays in place,
  and a calm inline message in the submit area reads:
  > Couldn't save your answer yet — this can happen if the AI grading
  > service is unavailable, or if the local database is temporarily
  > inaccessible. Your work is kept — try again.
  with a real "Try again" `Button`.
- **Submitted read-only (`locked = true`)** — the read-only view from
  section 7, with the Completion Review UI placeholder block beneath it.
- **Revisable pre-populated (`locked = false` with `priorAttempt`)** — the
  pre-populated form from section 8.

Provide a simple control bar (segmented control or a row of radio buttons)
to switch between these states in the canvas preview.

### Visual & accessibility requirements

- Clean, modern, content-first design. Generous spacing, readable
  typography, calm and trustworthy — a learning tool, not a marketing page.
- Fully responsive: comfortable on mobile and desktop. On wide screens, the
  scope panel sits beside the form; on narrow screens, it sits above the
  form (collapsible, **open by default**).
- Light and dark mode, using shadcn / Tailwind theme tokens (no hard-coded
  colors).
- Use **lucide-react** icons (`file`, `file-code`, `plus`, `x`, `info`,
  `corner-down-right` / `arrow-right`, `save`, `refresh-ccw`).
- Semantic HTML: exactly one top-level heading in the host wrapper
  (`<h1>` if sub-route host, `<h2>` if inline host — choose to match the
  preview). Ordered heading levels, none skipped. `<main>` / `<section>` /
  `<aside>` landmarks where they help.
- **The "not graded" framing for snippets and the "only the explanation is
  graded" helper text are real, persistent body text** — never tooltip-only,
  never icon-only. They are part of the layout.
- The file-path picker is a real combobox with `role="combobox"`,
  `aria-expanded`, `aria-controls`, an associated listbox of M6 candidates,
  arrow-key navigation, type-ahead filter (filtering visible options only —
  not adding new ones), Enter to select, Esc to close. Selected chips are
  in tab order; each chip's remove button has an accessible name
  ("Remove `<path>`").
- The "in scope" / "out of scope" badge on a picked chip conveys meaning by
  **text**, not color alone.
- The explanation `Textarea`, each snippet's `Textarea`, and the picker
  have programmatically associated labels.
- The submit-failure inline message is an `aria-live` region with real
  text; the "Try again" control is a real button.
- All text meets WCAG AA contrast in both themes.
- Interactive targets are comfortably sized for pointer and touch.

### Components to use

shadcn/ui: `Textarea`, `Label`, `Button`, `Badge`, `Card`
(`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`),
`Collapsible`, `Accordion`, `Popover`, `Command` (for the
combobox + listbox + filtering), `Separator`, `Alert`, `Skeleton` (for the
submitting state, if you want a placeholder strip — optional, the inputs
staying visible is the preferred pattern).
lucide-react for icons. Keep components small and composable so they
integrate cleanly into the existing shadcn/ui monorepo — reuse
`packages/ui` rather than duplicating primitives.

---

## Notes for the integrator (task #148)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) —
  **reuse it**; do not duplicate primitives. Add any missing shadcn
  components (e.g. `Command`, `Popover`) there.
- Replace the design's mock data with real props from the host. The host
  (Challenge Detail Page, task #145) loads `challenge` and `priorAttempt`
  via the M9 data-access layer (`packages/db/src/challenges/`, task
  #140) and passes them in.
- This is a **Client Component island**; the submit goes through a
  **server action** that calls the M9 attempts data-access layer (task
  #140), which persists the `ChallengeAttempt` row and (once task #148
  wires it) triggers the bounded grading call (task #143). **Not** an
  API route (ADR 0006).
- The **file-path picker's candidate list must come from the active
  challenge's M6-named set** — concretely, the union of
  `challenge.inScopeFiles[i].path`,
  `challenge.outOfScopeFiles[i].path`, and
  `challenge.mapReferences[i].path` — sourced from task #140's data-access
  layer's snapshot-scoped accessor. **Free-typed paths must remain
  impossible** by construction: the production picker must not have a
  fallback that accepts arbitrary text as a path. This is the R8 / FR-6
  edge of the integrity check at the UI.
- The same restriction applies to **snippet paths** — they share the
  picker; never accept a free-typed snippet path.
- The grading result is **not** rendered by this component. On successful
  submit, the host yields to the **Completion Review UI** (task #147 /
  `docs/design/completion-review-ui.md`) to render the `ChallengeGrading`
  shape (0–100 score + weak-area breakdown matching M8 per R4).
- On submit failure, do not lose the user's typed answer / picked paths /
  snippets; show the calm "Try again" inline message (FR-7's "graceful"
  NFR — the grader returns a low score with clear feedback rather than
  crashing, but a transport failure must also degrade gracefully here).
- The host-route question — inline on the Detail Page vs its own
  sub-route — is **resolved by task #145's Challenge Detail Page Spec**
  (`docs/design/challenge-detail-page.md`). At integration time, mount
  the component in whichever host that spec specifies.
- Verify the result against `docs/design/debug-walkthrough-ui.md` §14
  acceptance criteria; record integration notes in
  `docs/design/ui-integration-notes/`.
