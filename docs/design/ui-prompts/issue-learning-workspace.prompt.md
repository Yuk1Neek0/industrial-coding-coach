# Claude Design Prompt: Issue Learning Workspace page

Issue: #136 · Epic: `issue-based-learning-workspace` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Issue Learning Workspace page. Full contract:
the page spec `docs/design/issue-learning-workspace.page-spec.md` — read
that for the complete behaviour. This page composes three sibling pieces,
each with its own spec and prompt: the **Review Checklist UI**
(`review-checklist.prompt.md`), the **Understanding Questions UI**
(`understanding-questions.prompt.md`), and the **Challenge Panel**
(`challenge-panel.prompt.md`).

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so
   it uses the real `packages/ui` (shadcn/ui) components and styling
   patterns.
2. Optionally attach the page spec
   `docs/design/issue-learning-workspace.page-spec.md` (and the three
   sibling specs) as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline
   comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` /
   standalone HTML) and return it here.

The output is a **draft**. Integration task **#138** reconciles it with
`apps/web` + `packages/ui` and wires the page to the real M7
`learning_units` data-access layer, the M6 `project_maps` data-access
layer, the M11 snapshot data-access layer, the generation call, and the
grading call — do not expect Claude Design to produce final wiring; it
produces the interface.

**Stack to target:** Next.js App Router, React Server Components,
TypeScript, Tailwind CSS, shadcn/ui. Light + dark mode. Build with
mock/sample data only — no data fetching.

---

## Prompt — paste into Claude Design

Build an **Issue Learning Workspace** page for a learning-coach web app,
using Next.js (App Router), React, TypeScript, Tailwind CSS, and
shadcn/ui. It is a single page at route
`/repos/[owner]/[repo]/issues/[issueRef]`. Light and dark mode. Use only
mock sample data — do not add data fetching, API calls, or a database;
render from a typed in-file object so it is trivial to swap for real
server data later.

### Domain

The app coaches a job-seeking junior developer to genuinely understand
projects they built with heavy AI assistance. This page is the
**learning unit** for one GitHub Issue (or local CCPM task) on the
user's imported repository: an AI is about to write the code that
closes this issue, and the user needs to understand the issue well
enough to inspect that diff and defend the change in an interview.
Copy is plain, calm, encouraging, jargon-light. The unit is itself
AI-generated — the page is honest about that with a small "AI-generated
learning unit" label, never hidden, never a black box.

The page renders one **learning unit** object with these fields:

- `repo` — `{ owner, name }`
- `issueRef` — string (e.g. `"123"` or `"ccpm-130"`)
- `source` — `"github-issue" | "ccpm-task"` (drives a **source badge**
  — "GitHub issue" / "CCPM task")
- `issueNumber` — string (e.g. `"#123"` for GitHub, `"ccpm/130"` for
  CCPM)
- `issueTitle` — string
- `issueUrl` — string or `null` (null for CCPM tasks — degrade
  gracefully)
- `restatedGoal` — string (the issue restated in this repo's context)
- `relatedFiles` — array of `{ path, role, note }` where `role` may be
  `null` (M6 role annotation when present; e.g. "API route", "Schema")
- `concepts` — array of `{ name, explanation, tieToFile, tieToMapNode }`
  where at least one of `tieToFile` / `tieToMapNode` is non-null
- `aiAgentNotes` — string (how an AI agent would plausibly approach
  this issue, grounded in `relatedFiles`)
- `reviewChecklist` — array of checklist items (rendered by the
  Review Checklist UI — see its own prompt)
- `checklistState` — the user's per-item toggle state (rendered by
  the Review Checklist UI)
- `questions` — array of understanding questions (rendered by the
  Understanding Questions UI — see its own prompt)
- `userAnswers` — array of stored answers, or `null` when not yet
  answered
- `score` — a `{ value, label, summary, questionGrades, gradedAt }`
  object, or `null` when not yet graded
- `weakAreas` — array of weak-area objects, or `null` when not yet
  graded
- `challengeConcept` — string (the Challenge Panel stub — see its own
  prompt)
- `challengeType` — string (the Challenge Panel stub)
- `createdAt` / `updatedAt` — timestamps

Seed the mock data with **one realistic issue** — e.g. an issue titled
"Add per-user daily quota on top of the per-IP rate limit" on a repo
`mia-dev/portfolio-api`, with **4–5 related files** (each with an M6
role annotation like "API route" / "Rate-limit middleware" / "Auth
schema" and a one-line `note`), **3–4 concepts** (each tied to a
related file or a map node), an `aiAgentNotes` paragraph, **4–5
checklist items**, **4–5 questions** (the Understanding Questions
sample data), and stub `challengeConcept` + `challengeType` (e.g.
"Trace a failed login call from the API route through the rate-limit
middleware and find where the 429 is emitted" / "debug"). No "lorem
ipsum" — write plausible content.

### Page layout — route `/repos/[owner]/[repo]/issues/[issueRef]`

A single readable column (comfortable max width). From top to bottom:

1. A **"← Back to issues"** link.
2. A **unit header**: the `issueTitle` as an `<h1>`; a muted line
   `{owner}/{name} · {issueNumber}`; a **source badge** showing
   `source` ("GitHub issue" or "CCPM task" — calm coloring, meaning
   in the text); an **external link** "View on GitHub →" (`issueUrl`,
   new tab, `rel="noopener noreferrer"`) **only when `issueUrl` is
   non-null** (CCPM tasks have no GitHub URL — omit the link); a
   muted "Generated {createdAt}" line; and a small, honest
   **"AI-generated learning unit"** label (real text, calm styling).
3. An optional compact **in-page section nav** (anchor links: Goal,
   Files, Concepts, AI-agent notes, Review checklist, Understanding
   questions, Challenge).
4. **What this issue is asking for** — heading "What this issue is
   asking for"; render `restatedGoal` as readable prose, generous
   spacing.
5. **Related files** — heading "Related files". For each entry in
   `relatedFiles`: a row showing the `path` in monospace
   (prominent), a `Badge` for `role` **when non-null** (e.g. "API
   route"), and the one-line `note`. If `relatedFiles` is empty,
   show a quiet inline note ("No related files identified for this
   issue").
6. **Concepts to understand** — heading "Concepts to understand". For
   each entry in `concepts`: the `name` as a sub-heading, the
   `explanation` prose, and a visible **tie** — a monospace file
   chip styled as an in-page anchor (when `tieToFile` is non-null,
   it scrolls to that file's row in section 5) and/or a small
   "Project map →" out-link (when `tieToMapNode` is non-null).
7. **How an AI agent would approach this** — heading "How an AI agent
   would approach this"; render `aiAgentNotes` as readable prose,
   generous spacing.
8. **Review checklist** — heading "Review checklist"; this is the
   **Review Checklist UI** (see its own prompt `review-checklist.prompt.md`)
   — the checkable list and progress indicator. **R4 normative:
   completion is a progress indicator only and does NOT gate the
   understanding-question score.**
9. **Check your understanding** — heading "Check your understanding";
   this is the **Understanding Questions UI** (see its own prompt
   `understanding-questions.prompt.md`) — the answer-entry form and,
   once graded, the **Score / Weak Area block** (which **mirrors
   M8's Score / Weak Area UI** shape: score 0–100 + label + summary
   + per-question breakdown + weak-area breakdown).
10. **Challenge** — heading "Challenge"; this is the **Challenge
    Panel** (see its own prompt `challenge-panel.prompt.md`) —
    read-only, **renders `challengeConcept` + `challengeType` and an
    explicit "Deferred to Milestone 9" message; no buttons, no
    inputs, no run/grade affordances** (FR-7, R3 normative).

The grounding sections (related files, concepts, AI-agent notes) and
the understanding loop (questions, result) must be plainly visible —
not hidden behind closed accordions by default. The Challenge panel
is **visually subdued** — the least prominent section on the page
(it is a stub, not a feature).

### The answer-and-score loop — design both states

This page must render correctly in two states; provide a toggle so
both can be previewed:

- **Before answering** — `userAnswers`, `score`, and `weakAreas` are
  `null`: the Understanding Questions form (section 9) is active and
  the Score / Weak Area block is absent.
- **After answering** — `userAnswers`, `score`, `weakAreas` are
  populated: the Understanding Questions shows the submitted answers
  read-only, the Score / Weak Area block shows the score and
  weak-area breakdown (**M8-shape**), and the header gains an
  "· answered {updatedAt}" line.

The **checklist state is independent** of the answer state — R4
normative — so the checklist may be empty, half-ticked, or fully
ticked in either of the two states above; ticking does not unlock or
gate anything.

### States — design all of these

- **Loading** — a skeleton view (shadcn `Skeleton`): a header bar, a
  restated-goal prose block, a related-files placeholder list
  (path bar + role badge + note line), a concepts placeholder, an
  AI-agent-notes prose block, a checklist placeholder, a question-list
  placeholder, and a subdued challenge-panel placeholder.
- **Not found** — an "unknown unit" state: heading "Learning unit not
  found", a short line, and a "Back to issues" link.
- **Error — load failed** — a friendly error block: heading "Couldn't
  load this learning unit", a short explanation, and a "Try again"
  button. No stack traces.
- **CCPM-task source** — same layout but the source badge reads "CCPM
  task" and the "View on GitHub" link is omitted from the header
  (graceful degradation — `issueUrl` is `null`).

Provide simple toggles or separate preview screens so all of these
states can be viewed.

### Visual & accessibility requirements

- Clean, modern, content-first design. Generous spacing, readable
  typography, calm and trustworthy — a learning tool, not a marketing
  page.
- Fully responsive: comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no
  hard-coded colors).
- Use **lucide-react** icons.
- Semantic HTML: exactly one `<h1>` per page, ordered heading levels
  with none skipped, `<main>` / `<nav>` / `<section>` landmarks.
  Related files, concepts, checklist items, and weak areas use
  `<ul>`; the questions use `<ol>`.
- **The source badge** ("GitHub issue" / "CCPM task") conveys meaning
  by text, not color alone.
- **Role badges** ("API route", "Schema", etc.) convey meaning by
  text; color is supportive only.
- The "View on GitHub" link uses `rel="noopener noreferrer"` and an
  accessible external-link hint.
- All text meets WCAG AA contrast in both themes.
- The Challenge Panel must be **read-only** — no focusable controls
  inside it (R3, FR-7).

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`), `Badge`, `Accordion`, `Separator`, `Button`,
`Skeleton`, `Alert` (for the Challenge Panel's deferral notice).
lucide-react for icons (arrow-left, external-link, github,
file-code, lightbulb, list-checks, help-circle, sparkles). Keep
components small and composable so they integrate cleanly into an
existing shadcn/ui monorepo — reuse `packages/ui` rather than
duplicating primitives.

---

## Notes for the integrator (task #138)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`)
  — **reuse it**; do not duplicate primitives. Add any missing
  shadcn components there.
- Replace the design's mock data object with server-side calls:
  `getLearningUnitByRef(repo, issueRef)` from the M7 data-access
  layer (task #135) on
  `/repos/[owner]/[repo]/issues/[issueRef]` (React Server Component,
  no client fetch, no API route — ADR 0006), plus
  `getProjectMapForRepo(repo)` (M6, shipped) for role annotations
  and `getSnapshotFilePaths(repo)` (M11, shipped) for the
  related-file resolution check.
- Map the design's loading/not-found/error mockups onto real App
  Router files: `loading.tsx`, `error.tsx`, and `not-found.tsx`;
  route `null` from `getLearningUnitByRef` through `notFound()`.
- The Review Checklist UI, Understanding Questions UI, and Challenge
  Panel are separate components — integrate them per their own page
  specs / prompts / integration notes; this page provides their
  slots and their data (`reviewChecklist`+`checklistState`,
  `questions`+`userAnswers`+`score`+`weakAreas`, `challengeConcept`+
  `challengeType`).
- The Review Checklist and Understanding Questions are Client
  Component islands; their submits go through server actions that
  call the data-access layer — not API routes (ADR 0006).
- The Challenge Panel is a **Server Component** with **no
  interactive state** — do not add a "Coming soon!" button or any
  M9 placeholder (FR-7, R3 — *normative*: the panel must not
  silently fake M9 functionality).
- The `LearningUnit` field shapes are defined in
  `docs/design/issue-learning-workspace.page-spec.md` §5;
  reconcile the mock shapes with the merged `packages/db` types
  from tasks #131 / #133 / #134 / #135.
- The `source` badge maps to the normalized input shape from task
  #132 (R1) — "GitHub issue" for `github-issue`, "CCPM task" for
  `ccpm-task`. Do not differentiate behaviour by source; the
  badge is **metadata only** (R1).
- Verify the result against
  `docs/design/issue-learning-workspace.page-spec.md` §15
  acceptance criteria; record integration notes in
  `docs/design/ui-integration-notes/` as part of task #138 (this
  task — #136 — produces the Page Specs and prompts only;
  integration notes land with #138).
