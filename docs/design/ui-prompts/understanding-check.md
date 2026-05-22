# Claude Design Prompt: Understanding Check UI

Issue: #115 · Epic: `diff-review` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Understanding Check UI. Full contract: the page
spec `docs/design/understanding-check.md` — read that for the complete
behaviour. This component is **embedded** in the Diff Review page
(`docs/design/diff-review-page.md` §6f) — it is the **question-display and
answer-entry half of the answer-and-score loop**; its sibling, the Score / Weak
Area UI (`score-weak-area.md`), is the graded-result half.

## How to use this (Claude Design)

1. In Claude Design, **create a project** (or continue the Diff Review project)
   and **link this repository** so it uses the real `packages/ui` (shadcn/ui)
   components and styling.
2. Optionally attach the page spec `docs/design/understanding-check.md` as
   context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft component**. Integration task **#116** reconciles it
with `apps/web` + `packages/ui`, embeds it in the Diff Review page, and wires
its submit to a server action that runs the bounded M8 grading call.

**Stack to target:** Next.js App Router, React, TypeScript, Tailwind CSS,
shadcn/ui. This is an interactive **Client Component**. Light + dark mode. Build
with mock/sample data only — no data fetching; mock the submit.

---

## Prompt — paste into Claude Design

Build an **Understanding Check** component for a learning-coach web app, using
React, TypeScript, Tailwind CSS, and shadcn/ui. It is **not a page** — it is an
interactive section component embedded inside a "Diff Review" page. It holds
form state, so it is a Client Component. Light and dark mode. Use only mock
sample data — no data fetching; mock the submit with a delay.

### Domain

The app coaches a job-seeking junior developer to genuinely understand pull
requests they built with AI assistance. After reading the review of a PR, the
user must **prove** they understood it — this component shows comprehension
questions about that exact change, collects the user's answers, and submits them
for grading. The tone is a supportive **check, not an exam** — no timer, no
pass/fail stigma, encouraging copy. Answers are written in the user's own words,
interview-style. The questions and the grading are AI-generated — the component
says so plainly.

The component takes a `questions` array; each **comprehension question** has:

- `id` — string
- `prompt` — the question text (about this PR's diff)
- `kind` — "free_text" | "multiple_choice"
- `choices` — string array for `multiple_choice`, or `null` for `free_text`
- `fileRefs` — array of changed-file paths the question is about (may be empty)
- `focusArea` — the topic/skill the question probes (e.g. "Error handling")

It also takes `priorAnswers` (array of `{ questionId, response }` or `null`) and
a `graded` boolean — when `graded` is true the component shows the submitted
answers read-only instead of an editable form.

Seed the mock data with **4–5 realistic comprehension questions** for a
plausible PR (e.g. "Add rate limiting to the login endpoint") — a mix of
`free_text` (most) and one `multiple_choice` with 3–4 `choices`; each with a
`focusArea` and most with one or two `fileRefs` like `src/auth/rate-limit.ts`.
No "lorem ipsum".

### Component layout

A single headed section:

1. A **section header**: heading "Check your understanding" and a one-line
   description "Answer in your own words — these questions are about the change
   you just reviewed. Your answers are graded into a score and a list of areas
   to focus on." Add a short, honest note that the questions and grading are
   AI-generated coaching feedback.
2. A light **progress indicator** — "Answered 2 of 5" (count of non-empty
   answers). No timer.
3. A **question list** — render `questions` as an ordered list. Each **question
   block** shows:
   - the question number and the `prompt` text;
   - a small `focusArea` tag (e.g. "Error handling");
   - when `fileRefs` is non-empty, the file path(s) as monospace chips, each
     styled as an in-page anchor (they will scroll to that file's diff in the
     parent page);
   - the **answer input**: for `kind: "free_text"` a shadcn `Textarea`
     (placeholder "Explain in your own words…"); for `kind: "multiple_choice"`
     a radio group with one option per `choices` entry.
4. A **submit area** — a primary **"Submit answers"** button and a short
   reassurance line ("Grading takes a few seconds while your answers are
   reviewed."). Blank answers are allowed (submission is never blocked); when
   some answers are blank, show a gentle inline note ("2 questions are still
   blank") — informational, not a block.

### The answer-and-score loop — design these states

Provide a toggle to preview each:

- **Active form** — `graded` is false: the editable question list and submit
  button as above.
- **Grading in progress** — after submit, the bounded grading call takes a few
  seconds: disable every answer input and the submit button, show the button
  with a spinner and the label "Grading your answers…", show a status line
  ("Reviewing your answers and scoring them — a few seconds."), and keep the
  questions and the user's typed answers visible (do not blank them).
- **Graded (read-only)** — `graded` is true: render each question with the
  user's submitted answer shown read-only beneath it (no inputs, no submit
  button). (In the real app the Score / Weak Area UI renders below this — you
  can show a simple placeholder for it.)
- **Grading failed** — a calm inline message in the submit area: heading
  "Couldn't grade your answers yet", a short line ("This can happen if the AI
  grading service is unavailable. Your answers are kept — try again."), and a
  **"Try again"** button. The form is re-enabled and the typed answers are
  preserved. No stack traces, not a blocking page error.

### Visual & accessibility requirements

- Clean, calm, content-first — supportive, low-pressure, encouraging. Not an
  exam.
- Fully responsive; comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no hard-coded
  colors).
- Use **lucide-react** icons.
- Semantic HTML: the section has one heading (an `<h2>` within the page); the
  question list is an `<ol>`. No skipped heading levels.
- Every answer input has its question `prompt` as a programmatically associated
  label; `multiple_choice` options are a labelled radio group in a `<fieldset>`
  with the prompt as `<legend>`.
- File-reference chips are keyboard-operable in-page anchors with accessible
  names including the path; visible focus ring.
- The submit region carries `aria-busy` while grading runs; the grading-failed
  message is an `aria-live` region with real text; "Try again" is a real
  button.
- Disabled states are not conveyed by color alone; the `focusArea` tag and
  progress counter convey meaning by text, not color alone.
- All text meets WCAG AA contrast in both themes.

### Components to use

shadcn/ui: `Card`, `Textarea`, `RadioGroup` (with `RadioGroupItem`), `Label`,
`Badge`, `Button`, `Alert` (for the grading-failed message). lucide-react for
icons (help-circle, file, send / check, loader, alert-circle). Keep the
component small and composable so it integrates cleanly into an existing
shadcn/ui monorepo — reuse `packages/ui` rather than duplicating primitives.

---

## Notes for the integrator (task #116)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives.
- This is a **Client Component embedded in the Diff Review page**
  (`apps/web/app/reviews/[id]/page.tsx` §6f) — suggested home
  `apps/web/components/reviews/understanding-check.tsx`. It receives
  `reviewId`, `questions`, `priorAnswers`, and `graded` as props; it does **no**
  data fetching.
- Replace the mocked submit with a **server action** that builds an
  `AnswerInput[]` (`{ questionId, response }` per question) and calls the M8
  grading data-access layer — which runs the bounded grading call (task #113)
  and persists answers + score (task #114). **No API route** (ADR 0006).
- On a successful submit, transition to the graded read-only view and let the
  Score / Weak Area UI (`docs/design/score-weak-area.md`, its own prompt) render
  the returned `GradingResult` below.
- The `ComprehensionQuestion` / `AnswerInput` / `AnswerRecord` shapes are
  defined in `docs/design/understanding-check.md` §5; reconcile the mock shapes
  with the merged `packages/db` types.
- Wire each `fileRefs` chip as an in-page anchor to the matching changed-file
  entry in the Diff Review §6b changed-files section.
- Handle a grading-call failure as a non-fatal inline "Try again" that preserves
  the typed answers — CI runs with no API key, so this path is real.
- Verify the result against `docs/design/understanding-check.md` §14 acceptance
  criteria; record integration notes in `docs/design/ui-integration-notes/`.
