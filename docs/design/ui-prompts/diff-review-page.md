# Claude Design Prompt: Diff Review page

Issue: #115 · Epic: `diff-review` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Diff Review page. Full contract: the page spec
`docs/design/diff-review-page.md` — read that for the complete behaviour. This
page composes three sibling pieces, each with its own spec and prompt: the
**Risk Analysis Panel** (`risk-analysis-panel.md`), the **Understanding Check
UI** (`understanding-check.md`), and the **Score / Weak Area UI**
(`score-weak-area.md`).

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach the page spec `docs/design/diff-review-page.md` (and the
   three sibling specs) as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#116** reconciles it with
`apps/web` + `packages/ui` and wires the page to the real M8 diff-reviews
data-access layer, the review call, and the grading call — do not expect Claude
Design to produce final wiring; it produces the interface.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only —
no data fetching.

---

## Prompt — paste into Claude Design

Build a **Diff Review** page for a learning-coach web app, using Next.js (App
Router), React, TypeScript, Tailwind CSS, and shadcn/ui. It is a single page at
route `/reviews/[id]`. Light and dark mode. Use only mock sample data — do not
add data fetching, API calls, or a database; render from a typed in-file object
so it is trivial to swap for real server data later.

### Domain

The app coaches a job-seeking junior developer to genuinely understand projects
they built with heavy AI assistance. This page reviews one **pull request** on
the user's imported GitHub repository: an AI helped write the PR, the user
merged it, and now they need to understand it well enough to defend it in an
interview. Copy is plain, calm, encouraging, jargon-light. The review is itself
AI-generated — the page is honest about that with a small "AI-generated review"
label, never hidden, never a black box.

The page renders one **diff review** object with these fields:

- `repo` — `{ owner, name }`
- `pullRequest` — `{ number, title, url, linkedIssue }` where `linkedIssue` is
  `{ number, title, acceptanceCriteria: string[] }` or `null`
- `changedFiles` — array of `{ path, changeKind, additions, deletions, hunks,
  explanation }`; `changeKind` is "added" | "modified" | "removed" | "renamed";
  `hunks` is an array of `{ header, lines }` and each line is
  `{ kind: "context" | "addition" | "deletion", text }`
- `coreLogicExplanation` — string
- `risks` — array of risk findings (rendered by the Risk Analysis Panel)
- `testSuggestions` — array of `{ title, rationale, targetPath }`
- `questions` — array of comprehension questions (rendered by the Understanding
  Check UI)
- `answers` — array of stored answers, or `null` when not yet answered
- `grading` — a grading result object, or `null` when not yet graded
- `createdAt` / `updatedAt` — timestamps

Seed the mock data with **one realistic PR** — e.g. a PR titled "Add rate
limiting to the login endpoint" on a repo `mia-dev/portfolio-api`, with a linked
issue, **4–6 changed files** (each with a small but real-looking diff and a
plain-language explanation), a core-logic explanation, **3–4 risks**, **2–3 test
suggestions**, and **4–5 comprehension questions**. No "lorem ipsum" — write
plausible content.

### Page layout — route `/reviews/[id]`

A single readable column (comfortable max width). From top to bottom:

1. A **"← Back to reviews"** link.
2. A **review header**: the PR `title` as an `<h1>`; a muted line
   `{owner}/{name} · PR #{number}` with an **external link** "View on GitHub →"
   (`pullRequest.url`, opens a new tab, `rel="noopener noreferrer"`); a muted
   "Reviewed {createdAt}" line; and a small, honest **"AI-generated review"**
   badge/label (real text, calm styling).
3. An optional compact **in-page section nav** (anchor links: Files, Core logic,
   Risks, Tests, Understanding check).
4. **Linked-issue context** — when `linkedIssue` exists, a compact panel (a
   shadcn `Card`, or an `Accordion` collapsed on mobile / open on desktop)
   showing the issue number, title, and `acceptanceCriteria` as a bulleted list,
   framed "What this PR was supposed to do." When `linkedIssue` is `null`, omit
   this section entirely.
5. **Changed files** — heading "Changed files". For each entry in
   `changedFiles`: a `Card` (or collapsible block) showing the `path` in
   monospace, a `Badge` for `changeKind` ("Added"/"Modified"/"Removed"/
   "Renamed"), the `+{additions} −{deletions}` counts, the **diff** (the `hunks`
   rendered as a readable patch — monospace, addition lines tinted green with a
   leading `+`, deletion lines tinted red with a leading `−`, context lines
   neutral, each hunk `header` as a separator), and the plain-language
   `explanation` prose placed clearly next to that file's diff (above the hunks,
   or a side column on wide screens). A large diff may collapse behind a "Show
   diff" toggle, **but the explanation prose is always visible**.
6. **Core-logic explanation** — heading "What this change does"; render
   `coreLogicExplanation` as readable prose, generous spacing.
7. **Risks** — heading "Risks to watch"; this is the **Risk Analysis Panel**
   (see its own prompt `risk-analysis-panel.md`) — render the `risks` list here.
8. **Suggested tests** — heading "Suggested tests"; render `testSuggestions` as
   a list, each with its `title`, one-line `rationale`, and `targetPath`
   (monospace chip). If empty, show a quiet inline note.
9. **Check your understanding** — heading "Check your understanding"; this is
   the **Understanding Check UI** (see its own prompt `understanding-check.md`)
   — the comprehension questions and answer-entry form.
10. **Your result** — heading "Your result"; this is the **Score / Weak Area
    UI** (see its own prompt `score-weak-area.md`) — shown **only when**
    `grading` is non-null.

The grounding sections (changed files, core logic, risks) and the understanding
loop (questions, result) must be plainly visible — not hidden behind closed
accordions by default. Only the linked-issue panel and large individual diffs
may collapse.

### The answer-and-score loop — design both states

This page must render correctly in two states; provide a toggle so both can be
previewed:

- **Before answering** — `answers` and `grading` are `null`: the Understanding
  Check form (section 9) is active and the "Your result" section (10) is absent.
- **After answering** — `answers` and `grading` are populated: the
  Understanding Check shows the submitted answers read-only, the "Your result"
  section shows the score and weak-area breakdown, and the header gains an
  "· answered {updatedAt}" line.

### States — design all of these

- **Loading** — a skeleton view (shadcn `Skeleton`): a header bar, a few
  changed-file placeholder blocks (path bar + diff block + prose lines), a
  core-logic prose block, a risk-list placeholder, and a question-list
  placeholder.
- **Not found** — an "unknown review" state: heading "Review not found", a short
  line, and a "Back to reviews" link.
- **Error — load failed** — a friendly error block: heading "Couldn't load this
  review", a short explanation, and a "Try again" button. No stack traces.

Provide simple toggles or separate preview screens so all of these states, and
the before/after-answering states, can be viewed.

### Visual & accessibility requirements

- Clean, modern, content-first design. Generous spacing, readable typography,
  calm and trustworthy — a learning tool, not a marketing page.
- Fully responsive: comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no hard-coded
  colors).
- Use **lucide-react** icons.
- Semantic HTML: exactly one `<h1>` per page, ordered heading levels with none
  skipped, `<main>` / `<nav>` / `<section>` landmarks. Changed files and other
  multi-item fields use `<ul>`; the comprehension questions use `<ol>`.
- **Diff lines must not rely on color alone** — pair the green/red tint with a
  leading `+` / `−` glyph (and an `sr-only` "added" / "removed").
- The "View on GitHub" link uses `rel="noopener noreferrer"` and an accessible
  external-link hint.
- "Show diff" toggles and the linked-issue accordion are real buttons with
  `aria-expanded`; collapsing a diff never hides the explanation prose.
- All text meets WCAG AA contrast in both themes; `changeKind` badges convey
  meaning by text, not color alone.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`),
`Badge`, `Accordion`, `Collapsible`, `Separator`, `Button`, `Skeleton`.
lucide-react for icons (arrow-left, external-link, file, file-diff, list-checks,
shield-alert, flask-conical / test-tube, help-circle). Keep components small and
composable so they integrate cleanly into an existing shadcn/ui monorepo — reuse
`packages/ui` rather than duplicating primitives.

---

## Notes for the integrator (task #116)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives. Add any missing shadcn components there.
- Replace the design's mock data object with a server-side call to the typed M8
  diff-reviews data-access layer: `getDiffReviewById(id)` on `/reviews/[id]`
  (React Server Component, no client fetch, no API route — ADR 0006).
- Map the design's loading/not-found/error mockups onto real App Router files:
  `loading.tsx`, `error.tsx`, and `not-found.tsx`; route `null` from
  `getDiffReviewById` through `notFound()`.
- The Risk Analysis Panel, Understanding Check UI, and Score / Weak Area UI are
  separate components — integrate them per their own page specs / prompts /
  integration notes; this page provides their slots and their data
  (`risks`, `questions`, `grading`).
- The Understanding Check is a Client Component island; its submit goes through
  a server action that calls the grading data-access layer — not an API route.
- The `DiffReview` field shapes are defined in `docs/design/diff-review-page.md`
  §5; reconcile the mock shapes with the merged `packages/db` types.
- Verify the result against `docs/design/diff-review-page.md` §14 acceptance
  criteria; record integration notes in `docs/design/ui-integration-notes/`.
