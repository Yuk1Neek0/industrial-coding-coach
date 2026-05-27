# Claude Design Prompt: Understanding Questions UI

Issue: #136 · Epic: `issue-based-learning-workspace` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Understanding Questions UI. Full contract: the
page spec `docs/design/understanding-questions.page-spec.md` — read that
for the complete behaviour. This component is **embedded** in the Issue
Learning Workspace page
(`docs/design/issue-learning-workspace.page-spec.md` §6f, §6g) — it owns
the **full answer-and-score loop** for M7 (questions + answer entry +
graded score + weak-area breakdown). **Its shape mirrors M8's Score / Weak
Area UI** (`docs/design/score-weak-area.md`) per the PRD's NFR Fair
grading — read that spec too.

## How to use this (Claude Design)

1. In Claude Design, **create a project** (or continue the Issue Learning
   Workspace project) and **link this repository** so it uses the real
   `packages/ui` (shadcn/ui) components and styling.
2. Optionally attach the page spec
   `docs/design/understanding-questions.page-spec.md` (and M8's
   `docs/design/understanding-check.md` and
   `docs/design/score-weak-area.md` as the **shape mirror** references)
   as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline
   comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` /
   standalone HTML) and return it here.

The output is a **draft component**. Integration task **#138** reconciles
it with `apps/web` + `packages/ui`, embeds it in the Issue Learning
Workspace page, and wires its submit to a server action that runs the
bounded M7 grading call.

**Stack to target:** Next.js App Router, React, TypeScript, Tailwind CSS,
shadcn/ui. The form half is an interactive **Client Component**; the
result half can be a Server Component. Light + dark mode. Build with
mock/sample data only — no data fetching; mock the submit with a delay.

---

## Prompt — paste into Claude Design

Build an **Understanding Questions** component for a learning-coach web
app, using React, TypeScript, Tailwind CSS, and shadcn/ui. It is **not a
page** — it is a section component embedded inside an "Issue Learning
Workspace" page that owns the **full answer-and-score loop**: it
displays comprehension questions about a GitHub issue (or CCPM task)
on the user's repo, collects the user's answers, submits them for
grading, and then renders the **score + weak-area breakdown** result
below. The tone is a supportive **check, not an exam** — no timer, no
pass/fail stigma, encouraging copy. Answers are written in the user's
own words, interview-style. The questions and the grading are
AI-generated — the component says so plainly.

**Mirror M8's Score / Weak Area UI shape.** The graded result section
must use the **same shape** as the diff-review milestone's Score /
Weak Area UI: a 0–100 score with a calm band label and a one-or-two
sentence summary; a per-question breakdown with verdict badges,
points, and feedback prose; and a **weak-area breakdown** with named
topics, explanations, suggested next steps, related-question anchors,
and file-reference anchors. This is so M7 and M8 produce one
comprehension-grading pattern in the product (PRD NFR Fair grading).

The component takes a `questions` array; each **understanding
question** has:

- `id` — string
- `prompt` — the question text (about this issue's restated goal and
  related files)
- `kind` — "free_text" | "multiple_choice"
- `choices` — string array for `multiple_choice`, or `null` for
  `free_text`
- `fileRefs` — array of related-file paths the question is about (may
  be empty)
- `conceptRefs` — array of concept names the question probes (may be
  empty)
- `focusArea` — the topic/skill the question probes (e.g. "Database
  transactions") — also the weak-area key

It also takes `priorAnswers` (array of `{ questionId, response,
answeredAt }` or `null`), and the **stored grading**:

- `score` — `{ value, label, summary, questionGrades, gradedAt }` or
  `null` when not yet graded
- `weakAreas` — array of `{ area, explanation, suggestion,
  relatedQuestionIds, fileRefs, conceptRefs }` or `null` when not yet
  graded

`score.questionGrades` is an array of `{ questionId, questionPrompt,
verdict, pointsAwarded, pointsPossible, feedback, focusArea }`;
`verdict` is `"correct" | "partial" | "incorrect" | "unanswered"`.

It also takes `relatedFilePaths` and `conceptNames` (the parent
unit's lists) so file chips and concept tags can be in-page anchors;
unresolved references render as plain text.

Seed the mock data with **4–5 realistic comprehension questions** for
a plausible issue (e.g. "Add per-user daily quota on top of the
per-IP rate limit") — a mix of `free_text` (most) and one
`multiple_choice` with 3–4 `choices`; each with a `focusArea` and
most with one or two `fileRefs` like `src/auth/rate-limit.ts`. And
seed a corresponding mock graded result with a `score.value` around
**72/100**, label "Getting there", a `summary`, **4–5
`questionGrades`** (a mix of verdicts — at least one "partial" and
one "incorrect"), and **2–3 `weakAreas`** with concrete
explanations, suggestions, related question ids, and file paths. No
"lorem ipsum".

### Component layout

A single headed section "Check your understanding", followed by a
"Your result" sub-section that appears only after grading:

1. A **section header**: heading "Check your understanding" and a
   one-line description "Answer in your own words — these questions
   are about *this* issue in your repo. Your answers are graded into
   a score and a list of areas to focus on." Add a short, honest
   note that the questions and grading are AI-generated coaching
   feedback.
2. A light **progress indicator** — "Answered 2 of 5" (count of
   non-empty answers). No timer.
3. A **question list** — render `questions` as an `<ol>`. Each
   **question block** shows:
   - the question number and the `prompt` text;
   - a small `focusArea` tag (e.g. "Database transactions");
   - when `fileRefs` is non-empty, the file path(s) as monospace
     chips styled as in-page anchors (they will scroll to that
     file's row in the parent page's related-files section);
   - when `conceptRefs` is non-empty, small tags linking to the
     matching concepts in the parent;
   - the **answer input**: for `kind: "free_text"` a shadcn
     `Textarea` (placeholder "Explain in your own words…"); for
     `kind: "multiple_choice"` a labelled radio group in a
     `<fieldset>` / `<legend>` per `choices`.
4. A **submit area** — a primary **"Submit answers"** button and a
   short reassurance line ("Grading takes a few seconds while your
   answers are reviewed."). Blank answers are allowed (submission is
   never blocked); when some answers are blank, show a gentle inline
   note ("2 questions are still blank") — informational, not a block.

After grading, **directly below** the section, a "Your result"
sub-section renders **mirroring M8's `score-weak-area.md` layout**:

5. **Your result** header — heading "Your result", a muted "Graded
   {gradedAt}" line, and a short honest note that the grade is
   AI-generated coaching feedback.
6. **Score summary** — prominent but **calm**: the `score.value` as a
   clear **0–100** value (optionally with a quiet progress ring or
   bar conveying magnitude — not a pass/fail color block), the
   `score.label` band beside it ("Solid grasp" / "Getting there" /
   "Needs review" — **same vocabulary as M8**), and the
   `score.summary` prose. A small derived line like "3 of 5
   questions answered well" (from `questionGrades`) is fine.
7. **Per-question feedback** — heading "Per-question feedback";
   render `questionGrades` as a `<ul>`, one row per question (a
   `Card` or `Collapsible`, feedback prose visible by default).
   Each row shows: the `questionPrompt` echoed; a **verdict badge**
   ("Correct" / "Partial" / "Incorrect" / "Not answered") — calm
   coloring, meaning in the text; the
   `pointsAwarded` / `pointsPossible` ("2 / 3 points"); the
   `feedback` prose; and a small `focusArea` tag.
8. **Areas to focus on** — heading "Areas to focus on"; render
   `weakAreas` as a `<ul>`, one **weak-area block** each: the
   `area` name as the block heading; the `explanation` prose; the
   `suggestion` prose framed "What to do next" — the concrete next
   step; the `relatedQuestionIds` as small links/anchors ("From
   question 2, 4"); and, when `fileRefs` / `conceptRefs` are
   non-empty, the file path(s) and concept name(s) as in-page
   anchor chips/tags. **This is the most actionable content — give
   it generous space; plainly visible, never collapsed by default.**

### The answer-and-score loop — design all of these states

Provide a toggle to preview each:

- **Active form** — `score`/`weakAreas` are `null`: the editable
  question list and submit button as in steps 1–4 above. The "Your
  result" sub-section is absent.
- **Grading in progress** — after submit, the bounded grading call
  takes a few seconds: disable every answer input and the submit
  button, show the button with a spinner and the label "Grading
  your answers…", show a status line ("Reviewing your answers and
  scoring them — a few seconds."), and keep the questions and the
  user's typed answers visible (do not blank them).
- **Graded (read-only) + result populated** —
  `score`/`weakAreas`/`priorAnswers` are populated: the question
  list re-renders with the user's submitted answer shown read-only
  beneath each question (no inputs, no submit button); the "Your
  result" sub-section renders below with the score summary,
  per-question feedback, and weak-area breakdown.
- **Empty `weakAreas` (positive outcome)** — when `weakAreas` is
  empty: the "Areas to focus on" section shows a calm encouraging
  message instead: heading "No specific weak areas — nice work" and
  a short line ("Your answers covered this issue well. Re-read the
  per-question feedback above for any small refinements."). The
  score summary and per-question feedback still render fully. **This
  is a positive outcome, not an empty/error state.**
- **Grading failed** — a calm inline message in the submit area:
  heading "Couldn't grade your answers yet", a short line ("This
  can happen if the AI grading service is unavailable. Your
  answers are kept — try again."), and a **"Try again"** button.
  The form is re-enabled and the typed answers are preserved. No
  stack traces, not a blocking page error.

### Visual & accessibility requirements

- Clean, calm, content-first — supportive, low-pressure,
  encouraging. Not an exam. A guide, not a verdict.
- Fully responsive; comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no
  hard-coded colors).
- Use **lucide-react** icons.
- Semantic HTML: the section has one heading (an `<h2>` within the
  page); the score summary, per-question feedback, and weak-area
  breakdown are `<h3>` sub-sections. No skipped heading levels. The
  question list is an `<ol>`; the question-grade list and weak-area
  list are `<ul>`s.
- Every answer input has its question `prompt` as a programmatically
  associated label; `multiple_choice` options are a labelled radio
  group in a `<fieldset>` with the prompt as `<legend>`.
- File-reference chips and concept tags are keyboard-operable
  in-page anchors with accessible names including the target;
  visible focus ring.
- The submit region carries `aria-busy` while grading runs; the
  grading-failed message is an `aria-live` region with real text;
  "Try again" is a real button.
- **The score and `score.label` are conveyed by text and number — a
  progress ring/bar is supportive only; a low score is never
  signalled by color alone** (mirrors M8 §13).
- **Verdict badges convey meaning by their text label, not color
  alone.**
- The "AI-generated coaching feedback" note is real text.
- All text meets WCAG AA contrast in both themes.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`), `Textarea`, `RadioGroup` (with `RadioGroupItem`),
`Label`, `Badge`, `Button`, `Alert` (for the grading-failed message),
`Progress` (for the optional score bar), `Separator`, `Collapsible`.
lucide-react for icons (help-circle, file, send, loader,
alert-circle, award, target, check-circle, circle-dot, x-circle,
lightbulb). Keep the component small and composable so it integrates
cleanly into an existing shadcn/ui monorepo — reuse `packages/ui`
rather than duplicating primitives.

---

## Notes for the integrator (task #138)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`)
  — **reuse it**; do not duplicate primitives.
- This is a **Client Component embedded in the Issue Learning
  Workspace page**
  (`apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx`
  §6f, §6g) — suggested home
  `apps/web/components/learning/understanding-questions.tsx` (with
  a co-located `score-weak-area.tsx` for the result half, or a
  single combined component — your call). It receives `unitId`,
  `questions`, `priorAnswers`, `score`, `weakAreas`,
  `relatedFilePaths`, and `conceptNames` as props; it does **no**
  data fetching.
- Replace the mocked submit with a **server action** that builds an
  `AnswerInput[]` (`{ questionId, response }` per question) and
  calls the M7 data-access layer (task #135) — which runs the
  bounded grading call (task #134) and persists `user_answers`,
  `score`, and `weak_areas` as JSON columns on `learning_units`
  (R2, FR-5, FR-8). **No API route** (ADR 0006).
- The `Question` / `AnswerInput` / `AnswerRecord` / `Score` /
  `QuestionGrade` / `WeakArea` shapes are defined in
  `docs/design/understanding-questions.page-spec.md` §5; reconcile
  the mock shapes with the merged `packages/db` types from tasks
  #133 / #134 / #135. **The grading shape mirrors M8's** — see
  `docs/design/score-weak-area.md` §5 for the M8 reference shape.
- Wire each `fileRefs` chip as an in-page anchor to the matching
  related-file entry in the Issue Learning Workspace §6b section,
  and each `conceptRefs` tag to the matching concept in §6c; for
  weak-area `relatedQuestionIds`, wire to the matching
  per-question row in the result sub-section.
- Handle a grading-call failure as a non-fatal inline "Try again"
  that preserves the typed answers — CI runs with no API key, so
  this path is real.
- **R6 — *normative*.** Scoring is strictly per-unit. Do not add
  any aggregate / cross-unit / per-repo score view to this
  component; M10 owns rollups.
- **R4 — *normative*.** The form must be available regardless of
  `checklistState` — the grading call has no checklist dependency.
- Verify the result against
  `docs/design/understanding-questions.page-spec.md` §15
  acceptance criteria; record integration notes in
  `docs/design/ui-integration-notes/` as part of task #138.
