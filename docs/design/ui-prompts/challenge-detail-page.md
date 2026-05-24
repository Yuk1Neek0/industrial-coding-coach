# Claude Design Prompt: Challenge Detail page

Issue: #145 · Epic: `debug-expansion-challenge` (M9) · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the M9 Challenge Detail page. Full contract: the page
spec `docs/design/challenge-detail-page.md` — read that for the complete
behaviour, the typed shapes, and the resolved hosting decision (Debug
Walkthrough UI + Completion Review UI live inline on this page; no sub-routes).
This page composes two sibling pieces, each with its own spec and prompt:

- the **Debug Walkthrough UI** (`docs/design/debug-walkthrough-ui.md`, task #146)
  — the answer-entry form;
- the **Completion Review UI** (`docs/design/completion-review-ui.md`, task #147)
  — the graded most-recent-attempt outcome.

The fourth M9 UI piece, the **Challenge List Page** (`docs/design/challenge-list-page.md`,
task #144), is the index that links *to* this page; it is not composed here.

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach the page spec `docs/design/challenge-detail-page.md` (and
   the two sibling specs once they exist) as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#148** reconciles it with
`apps/web` + `packages/ui` and wires the page to the real M9 data-access layer
(`@workspace/db`, task #140), the generation call (task #142, for the "New
challenge" action), and the grading call (task #143, for the Walkthrough's
submit) — do not expect Claude Design to produce final wiring; it produces the
interface.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only —
no data fetching.

---

## Prompt — paste into Claude Design

Build a **Challenge Detail** page for a learning-coach web app, using Next.js
(App Router), React, TypeScript, Tailwind CSS, and shadcn/ui. It is a single
page at route `/repos/[owner]/[repo]/challenges/[challengeId]`. Light and dark
mode. Use only mock sample data — do not add data fetching, API calls, or a
database; render from a typed in-file object so it is trivial to swap for real
server data later.

### Domain

The app coaches a job-seeking junior developer to genuinely understand projects
they built with heavy AI assistance. After they import their repo, the app
generates a **project map** of it; from that map this milestone generates
**project-tied debug and expansion challenges** ("add a small field", "trace a
failed API call", "fix a schema mismatch", "add a loading/error state", "add a
unit test", "explain a broken CI result", "extend one module safely"). Each
challenge names real files from the user's repo — never a generic exercise.

This page is the **one place** the user sees a single challenge: it shows what
is being asked, which files are in scope vs out of scope, what "done" looks
like, lets the user write a short explanation of how they would solve it, and
shows the graded outcome — a **0–100 numeric score plus a weak-area
breakdown**. **Prior attempts on the same challenge are shown inline below the
most-recent attempt, collapsed by default**, so the user can self-review their
progression on a challenge without leaving the page.

Copy is plain, calm, encouraging, jargon-light. The page is honest that the
challenge and grading are AI-generated; it shows a small "AI-generated
challenge" label and a clear honest line stating that **the grader judges the
user's explanation only** — optional snippets are illustrative and are *not*
graded for style or plausibility.

### Typed shapes — render from these (paste into the mock data)

The page renders one **challenge** plus a **list of attempts** (with the
most-recent attempt's grading as the primary outcome). The typed shapes:

```ts
// One generated challenge — the M9 challenge contract
interface Challenge {
  id: string;
  repo: { owner: string; name: string; ref: string };
  type:
    | "add-small-field"
    | "trace-failed-api-call"
    | "fix-schema-mismatch"
    | "add-loading-or-error-state"
    | "add-unit-test"
    | "explain-broken-ci-result"
    | "extend-one-module-safely";
  taskDescription: string;
  inScope: FileOrModuleRef[];      // real paths from the project map
  outOfScope: FileOrModuleRef[];   // real paths from the project map
  acceptanceCriteria: string[];    // the criteria the grader uses
  sourceRefs: ProjectMapRef[];     // back-pointers into the project map
  createdAt: string;
  updatedAt: string;
}

interface FileOrModuleRef {
  kind: "file" | "module";
  path: string;                    // monospace when kind === "file"
  label: string;                   // display label
  note: string | null;             // optional one-line "why in/out of scope"
}

interface ProjectMapRef {
  section:
    | "architecture"
    | "key-files"
    | "request-flow"
    | "data-flow"
    | "state-flow"
    | "ai-call-flow"
    | "debug-path";
  anchor: string;
  label: string;
}

// One stored attempt + its grading
interface ChallengeAttempt {
  id: string;
  challengeId: string;
  explanation: string;             // the graded field
  snippets: { path: string; code: string }[];  // illustrative only — NOT graded
  filePaths: string[];             // file paths the user said they'd change
  submittedAt: string;
  grading: GradingResult;          // populated on every saved attempt
}

// The M8-shape grading output, reused in M9 (PRD R4 / FR-5)
interface GradingResult {
  score: number;                   // 0–100
  scoreLabel: string;              // calm band, e.g. "Solid grasp"
  summary: string;                 // one or two sentences
  criterionGrades: CriterionGrade[];
  weakAreas: WeakArea[];
  gradedAt: string;
}

interface CriterionGrade {
  criterion: string;               // the acceptance-criterion text, echoed
  verdict: "met" | "partial" | "missed";
  feedback: string;
}

interface WeakArea {
  area: string;                    // e.g. "Error handling in the API route"
  explanation: string;
  suggestion: string;
  relatedCriteria: string[];
  fileRefs: string[];              // real paths from the project map
}
```

Seed the mock data with **one realistic challenge** on a repo
`mia-dev/portfolio-api`, of type `add-loading-or-error-state` — e.g. *"Add a
loading state to the dashboard page while it fetches the user's recent
activity, and an error state for when the fetch fails."* The challenge should
have:

- A plain-language `taskDescription` (3–5 sentences) that references real
  files of `mia-dev/portfolio-api`.
- **3–4 `inScope` entries** (mix of files and modules), each with a real
  plausible path (`apps/web/app/dashboard/page.tsx`, `apps/web/lib/api/recent-activity.ts`, …)
  and a one-line `note`.
- **2–3 `outOfScope` entries**, each with a one-line `note` explaining why
  it should be left alone (e.g. `apps/web/lib/db/schema.ts` — "Schema is
  shared; loading-state work doesn't touch it.").
- **3–4 `acceptanceCriteria`** — plain-language outcomes the grader checks.
- **3 `sourceRefs`** pointing to plausible project-map sections.

And seed **three attempts**, most-recent first:

- **Attempt 1 (most recent)** — `submittedAt` today; a 4–6 sentence
  `explanation` that's mostly on-target; a `GradingResult` with `score: 82`,
  `scoreLabel: "Solid grasp"`, a calm `summary`, one or two `criterionGrades`
  with verdict "met" and one "partial", and **1–2 `weakAreas`** with file
  references.
- **Attempt 2** — `submittedAt` two days earlier; a shorter `explanation`
  that misses one of the criteria; `score: 64`, `scoreLabel: "Getting
  there"`, three `criterionGrades` (one "met", one "partial", one "missed"),
  **2 `weakAreas`**.
- **Attempt 3** — `submittedAt` four days earlier; a very short
  `explanation` that misses most criteria; `score: 38`, `scoreLabel: "Needs
  review"`, three `criterionGrades` (all "missed" or "partial"), **3
  `weakAreas`**.

Use plausible content — no "lorem ipsum".

### Page layout — route `/repos/[owner]/[repo]/challenges/[challengeId]`

A single readable column (comfortable max width). From top to bottom:

1. A **"← Back to challenges"** link (to `/repos/[owner]/[repo]/challenges`).
2. A **challenge header**: the **human-readable challenge type** as an `<h1>`
   (e.g. "Add a loading or error state" — *not* the raw enum value); a muted
   line `{owner}/{name} · ref {ref}` with an optional **external link** "View
   repository on GitHub →" (new tab, `rel="noopener noreferrer"`); a muted
   "Generated {createdAt}" line; and a small, honest **"AI-generated
   challenge"** badge/label (real text, calm styling).
3. To the right of the title (header bar), a **"New challenge of this type"**
   button — a clearly labelled `<button>` that, when clicked on a challenge
   with attempts, opens an `AlertDialog` ("Generate a new challenge of this
   type? Your current attempts will stay accessible by URL but won't appear
   on the new challenge.") before invoking the regeneration. On a challenge
   with no attempts, click invokes directly without a dialog. The button has
   a visible in-progress state (spinner, disabled) for the few seconds the
   generation call would take; failure shows a quiet inline error next to
   the button ("Couldn't generate a new challenge. Try again.").
4. A short **honest framing line** below the header: *"This challenge was
   generated from your project map. The grader judges your **explanation** —
   your snippet, if you add one, is illustrative and is not scored."*
5. An optional compact **in-page section nav** (anchor links: Task, Scope,
   Acceptance, Sources, Walkthrough, Result, Prior attempts).
6. **Task description** — heading "What you're being asked to do"; render
   `taskDescription` as readable prose, generous spacing.
7. **Scope** — heading "Scope". Render **two side-by-side panels** on wide
   screens, stacked on mobile:
   - **"In scope"** — a `<ul>` of `inScope` entries. Each entry: `label` as
     the entry title, `path` in monospace (when `kind === "file"`), a small
     `Badge` reading "file" or "module", and the optional `note` as a
     one-line caption underneath.
   - **"Out of scope"** — a `<ul>` of `outOfScope` entries, rendered the
     same way, on a visually distinct (calmer / dimmer) surface so the user
     can tell the sets apart at a glance. If `outOfScope` is empty, show a
     quiet inline note ("No explicit out-of-scope files for this
     challenge.") inside the panel — do not omit the panel.
   A short intro line above the panels frames the section: *"These are the
   files and modules this challenge expects you to touch — and the ones you
   should leave alone. All paths come from your project map."*
8. **Acceptance criteria** — heading "What 'done' looks like"; render
   `acceptanceCriteria` as a numbered `<ol>`. A short intro line: *"The
   grader checks your explanation against these criteria."*
9. **Project-map sources** — heading "Where this came from"; render
   `sourceRefs` as a `<ul>` of calm chips, each showing the human-readable
   `section` ("Architecture overview", "Key-file map", "Request flow",
   "Data flow", "State flow", "AI-call flow", "Debug path") and the
   `label`. Each chip looks like an internal link (it will eventually link
   to the corresponding section of the project-map page).
10. **Walk through your answer** — heading "Walk through your answer"; this
    is the **Debug Walkthrough UI** (see its own prompt
    `debug-walkthrough-ui.md` once it exists) — a Client-Component-shaped
    answer-entry form over the current challenge. It is **always visible**
    (both for first-time entry and for retry on a challenge with prior
    attempts). For this draft, render a placeholder form: a labelled
    `<textarea>` "Your explanation" (multiline, full-width, calm and
    inviting), an "Add a code snippet" affordance (collapsed sub-area
    suggesting a `path` selector populated from `inScope` file paths + a
    `<textarea>` for the snippet — **labelled "illustrative, not graded"**),
    a "Files I would change" multi-add text input (populated initial-empty),
    and a primary "Submit explanation" button. The submit's in-progress
    state is a spinner + disabled button + a calm "Grading your
    explanation…" status line. Do not implement the data flow — the
    integrator (task #148) wires the submit to a server action.
11. **Your most recent attempt** — heading "Your most recent attempt"; this
    is the **Completion Review UI** (see its own prompt
    `completion-review-ui.md` once it exists) — shown **only when** there is
    at least one attempt. Render the most-recent attempt's `grading` as the
    primary outcome:
    - the **`score`** as a clear 0–100 value with the **`scoreLabel`**
      shown clearly alongside it;
    - the **`summary`** as one or two sentences of plain-language feedback;
    - the **`criterionGrades`** as a list, each row showing the
      `criterion` text, the `verdict` as a calm badge ("met" / "partial" /
      "missed"), and the `feedback`;
    - the **`weakAreas`** as a list of blocks; each block: `area` as
      heading, `explanation` + `suggestion` as prose, `fileRefs` as
      monospace chips;
    - the attempt's `submittedAt` framed "Submitted {submittedAt}".
12. **Prior attempts (inline, collapsible — R5)** — heading "Prior
    attempts"; rendered **only when** `attempts.length > 1`. **This is the
    distinguishing M9 affordance — render it carefully.** A `<ul>` of the
    prior attempts (`attempts.slice(1)`), most-recent-first. Each entry is
    a shadcn `Collapsible` (or `AccordionItem`), **collapsed by default**:
    - **Trigger row** (visible when collapsed): a real `<button>` with
      `aria-expanded`. Inside the trigger: the attempt's `submittedAt`
      (e.g. "May 22, 2026 · 14:07") on the left; the `grading.score` as a
      compact 0–100 chip and the `grading.scoreLabel` ("Solid grasp" / etc.)
      in the middle; a chevron/expand affordance on the right.
    - **Expanded panel** (revealed on click): the attempt's `explanation`
      as readable prose; the optional `snippets` rendered as monospace
      blocks (each `path` as a chip + `code` in a `<pre>`), with a small
      label "snippet — illustrative, not graded"; the `filePaths` as a
      list of monospace chips; then a compact Completion-Review-style
      block: the `score` + `scoreLabel` + `summary`, and the `weakAreas`
      rendered the same way as in section 11 (consistent rendering — only
      the framing changes from "Your most recent attempt" to "Prior
      attempt"). The per-criterion breakdown (`criterionGrades`) may be
      collapsed within the expanded panel for older attempts to keep the
      page scannable; the score, label, summary, and weak-area breakdown
      are always visible inside the expanded panel.
    - Multiple prior attempts can be expanded at once. **All start
      collapsed on page load.** Expand/collapse is purely client-side.
13. An optional bottom line, before the back link: *"M9 grades your
    explanation against your project map. It does not run, build, or test
    your code."*

The grounding sections (Task, Scope, Acceptance, Sources) and the
answer-and-score loop (Walkthrough, most-recent Result) must be plainly
visible — not hidden behind closed accordions by default. Only the optional
in-page nav, the optional bottom reminder, and the **prior-attempt entries
in section 12** are collapsible by default — the prior-attempt entries are
explicitly collapsed per the page spec's R5 requirement.

### The answer-and-attempt-history states — design all of these

This page must render correctly in three states; provide a toggle so all
three can be previewed:

- **No attempts yet** — `attempts` is empty: the Walkthrough form
  (section 10) is active; sections 11 and 12 are absent.
- **One attempt** — the most-recent Completion Review (section 11) renders
  the only attempt; section 12 is absent.
- **Multiple attempts** — section 11 renders the most-recent attempt as
  primary; section 12 renders the inline collapsible prior-attempts panel
  with the remaining attempts, each collapsed by default.

### States — design all of these

- **Loading** — a skeleton view (shadcn `Skeleton`): a header bar, a
  task-description prose block, two scope-panel placeholders side by side
  (rows representing `inScope` / `outOfScope` entries), an
  acceptance-criteria list placeholder, a source-refs chip-row placeholder,
  a Walkthrough form placeholder (a textarea-sized block + submit-button-
  sized block), and a small Completion Review placeholder (a score-chip +
  a weak-area row).
- **Not found** — an "unknown challenge" state: heading "Challenge not
  found", a short line, and a "Back to challenges" link.
- **Error — load failed** — a friendly error block: heading "Couldn't load
  this challenge", a short explanation, and a "Try again" button. No stack
  traces.
- **"New challenge" action — in progress** — the button shows a spinner
  and is disabled; the rest of the page remains visible and read-only.
- **"New challenge" action — failed** — a quiet inline error sits next to
  the button: "Couldn't generate a new challenge. Try again." The current
  challenge stays fully visible.
- **Submit — in progress / failed** — these live inside the embedded
  Debug Walkthrough UI, not as page-level states; design the form to
  show a "Grading your explanation…" status when submitting and a quiet
  preserve-the-input error on failure.

Provide simple toggles or separate preview screens so all of these states,
and the three attempt-history states, can be viewed.

### Visual & accessibility requirements

- Clean, modern, content-first design. Generous spacing, readable
  typography, calm and trustworthy — a learning tool, not a marketing
  page. Match the visual language of the M8 Diff Review page
  (`/reviews/[id]`) so the two milestones read as one product.
- Fully responsive: comfortable on mobile and desktop. Scope panels stack
  on mobile, side-by-side on wide screens.
- Light and dark mode, using shadcn/Tailwind theme tokens (no hard-coded
  colors).
- Use **lucide-react** icons.
- Semantic HTML: exactly one `<h1>` per page (the challenge type),
  ordered heading levels with none skipped, `<main>` / `<nav>` /
  `<section>` landmarks. Multi-item fields use `<ul>`; the
  acceptance-criteria list uses `<ol>`.
- **Scope panels must not rely on color alone** — pair the visual
  distinction (calm vs dimmer surface) with clear "In scope" / "Out of
  scope" headings and per-entry text.
- **The "New challenge" action** is a real `<button>` with a clear
  accessible name. Its confirmation dialog is a real `AlertDialog` with
  focus trap and Esc-to-dismiss. Its in-progress state uses
  `aria-busy="true"` and an accessible "Generating new challenge…"
  status; the inline error is announced via an `aria-live="polite"`
  region next to the button.
- **Prior-attempts collapsibles (R5)** — each trigger is a real
  `<button>` with `aria-expanded` and an accessible name including the
  attempt's timestamp and score (e.g. "Prior attempt from May 22, 2026 ·
  score 64"). Multiple can be open at once. **All start collapsed on
  page load.** The expanded panel is reachable by keyboard; collapsing
  never removes content from the DOM in a way that loses focus position.
- The "View repository on GitHub" link uses `rel="noopener noreferrer"`
  and an accessible external-link hint.
- All text meets WCAG AA contrast in both themes; score chips and
  verdict badges convey meaning by text, not color alone.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`), `Badge`, `Button`, `AlertDialog`, `Collapsible`,
`Accordion`, `Separator`, `Skeleton`, `Textarea`, `Input`, `Label`.
lucide-react for icons (arrow-left, external-link, file, folder,
sparkles / refresh-cw for "New challenge", list-checks, target,
chevron-down, help-circle, alert-triangle for "out of scope" framing).
Keep components small and composable so they integrate cleanly into an
existing shadcn/ui monorepo — reuse `packages/ui` rather than duplicating
primitives.

---

## Notes for the integrator (task #148)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) —
  **reuse it**; do not duplicate primitives. Add any missing shadcn
  components there.
- Replace the design's mock data object with server-side calls to the typed
  M9 data-access layer (`@workspace/db`, task #140) on
  `/repos/[owner]/[repo]/challenges/[challengeId]`:
  - `getChallengeById(challengeId)` (React Server Component);
  - `getChallengeAttempts(challengeId)` (RSC) — returns the attempts in
    most-recent-first order; the most-recent is `attempts[0]`, the prior
    attempts are `attempts.slice(1)`.
  No client fetch, no API route (ADR 0006).
- Map the design's loading / not-found / error mockups onto real App
  Router files: `loading.tsx`, `error.tsx`, and `not-found.tsx`; route
  `null` from `getChallengeById` through `notFound()`.
- The Debug Walkthrough UI is a **Client Component island**; its submit
  goes through a **server action** that calls `submitAttempt`, which
  persists the attempt **and** invokes the M9 bounded grading call (task
  #143) — not an API route.
- The "New challenge" action's server action calls the M9 bounded
  generation call (task #142) via `regenerateChallenge`, producing a new
  `Challenge` row; on success, redirect to
  `/repos/[owner]/[repo]/challenges/[newChallengeId]`. The current
  challenge and its attempts stay accessible by URL (R2).
- The Debug Walkthrough UI (#146) and Completion Review UI (#147) are
  separate components — integrate them per their own page specs / prompts /
  integration notes; this page provides their slots and their data.
  **Neither is a sub-route** (Page Spec §4a).
- The `Challenge`, `ChallengeAttempt`, and `GradingResult` field shapes
  are defined in `docs/design/challenge-detail-page.md` §5; reconcile the
  mock shapes with the merged `packages/db` types. The `GradingResult`
  shape mirrors M8's (PRD R4 / FR-5) — see
  `docs/design/score-weak-area.md` §5 for the M8-shape definition; do not
  re-invent the grading shape.
- The prior-attempts collapsibles are fully client-side (no per-attempt
  fetch on expand); the full attempt data is already loaded by
  `getChallengeAttempts`.
- Apply the M9 file-reference integrity check (task #141) at the data-
  access layer: any `inScope` / `outOfScope` / `sourceRefs` / `weakAreas
  .fileRefs` path that fails to resolve against the M6 project map is
  flagged (the UI renders it as plain text with a quiet flag — never a
  crash; see Page Spec §11).
- Verify the result against `docs/design/challenge-detail-page.md` §14
  acceptance criteria; record integration notes in
  `docs/design/ui-integration-notes/`.
- **UI tool is Claude Design (ADR 0007). v0 is not used.**
