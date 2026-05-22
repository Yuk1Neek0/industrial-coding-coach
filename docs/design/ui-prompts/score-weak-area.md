# Claude Design Prompt: Score / Weak Area UI

Issue: #115 · Epic: `diff-review` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Score / Weak Area UI. Full contract: the page spec
`docs/design/score-weak-area.md` — read that for the complete behaviour. This
component is **embedded** in the Diff Review page
(`docs/design/diff-review-page.md` §6g) — it is the **graded-result half of the
answer-and-score loop**; its sibling, the Understanding Check UI
(`understanding-check.md`), is the question-display and answer-entry half.

## How to use this (Claude Design)

1. In Claude Design, **create a project** (or continue the Diff Review project)
   and **link this repository** so it uses the real `packages/ui` (shadcn/ui)
   components and styling.
2. Optionally attach the page spec `docs/design/score-weak-area.md` as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft component**. Integration task **#116** reconciles it
with `apps/web` + `packages/ui` and embeds it in the Diff Review page wired to
the real `DiffReview.grading` data.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only —
no data fetching.

---

## Prompt — paste into Claude Design

Build a **Score / Weak Area** result component for a learning-coach web app,
using React, TypeScript, Tailwind CSS, and shadcn/ui. It is **not a page** — it
is a result section embedded inside a "Diff Review" page, shown after the user
answers the comprehension questions. Light and dark mode. Use only mock sample
data passed in as a prop — no data fetching.

### Domain

The app coaches a job-seeking junior developer to understand pull requests they
built with AI assistance. After the user answers the comprehension questions
about a reviewed PR, their answers are graded — this component presents that
result: a **numeric score**, a **per-question breakdown**, and a **weak-area
breakdown** of topics to revisit. The tone is **a guide, not a verdict** — calm
and encouraging, telling the user where to focus; no celebratory confetti, no
red "FAIL" stamp. The grading is AI-generated coaching feedback — the component
says so plainly. The **weak areas are the actionable payoff** — they get
first-class space.

The component takes a `grading` object with these fields:

- `score` — a number, **0–100**
- `scoreLabel` — a short calm band label, e.g. "Solid grasp", "Getting there",
  "Needs review"
- `summary` — one or two sentences of plain-language overall feedback
- `questionGrades` — array of `{ questionId, questionPrompt, verdict,
  pointsAwarded, pointsPossible, feedback, focusArea }`; `verdict` is "correct" |
  "partial" | "incorrect" | "unanswered"
- `weakAreas` — array of `{ area, explanation, suggestion, relatedQuestionIds,
  fileRefs }`
- `gradedAt` — a timestamp

Seed the mock data with a realistic result for a plausible PR (e.g. "Add rate
limiting to the login endpoint"): a score around **72/100**, label "Getting
there", a `summary`, **4–5 `questionGrades`** (a mix of verdicts — at least one
"partial" and one "incorrect"), and **2–3 `weakAreas`** with concrete
explanations, suggestions, related question ids, and file paths like
`src/auth/rate-limit.ts`. No "lorem ipsum".

### Component layout

A single headed section "Your result":

1. A **result header**: heading "Your result", a muted "Graded {gradedAt}"
   line, and a short, honest note that the grade is AI-generated coaching
   feedback on the user's answers.
2. A **score summary** — prominent but **calm**: the `score` as a clear 0–100
   value (optionally with a quiet progress ring or bar conveying magnitude — not
   a pass/fail color block), the `scoreLabel` band beside it, and the `summary`
   prose. A small derived line like "3 of 5 questions answered well" (from
   `questionGrades`) is fine.
3. A **per-question breakdown** — heading "Per-question feedback"; render
   `questionGrades` as a list (a `Card` or `Collapsible` per question, but the
   feedback prose visible by default). Each row shows: the `questionPrompt`
   echoed; a **verdict badge** ("Correct" / "Partial" / "Incorrect" / "Not
   answered") — calm coloring, meaning in the text; the
   `pointsAwarded` / `pointsPossible` ("2 / 3 points"); the `feedback` prose;
   and a small `focusArea` tag.
4. A **weak-area breakdown** — heading "Areas to focus on"; render `weakAreas`,
   one **weak-area block** each: the `area` name as the block heading; the
   `explanation` prose; the `suggestion` prose framed "What to do next"; the
   `relatedQuestionIds` as small links/anchors ("From question 2, 4"); and, when
   `fileRefs` is non-empty, the file path(s) as monospace chips styled as
   in-page anchors (they will scroll to the file's diff in the parent page).
   This is the most actionable content — give it generous space; plainly
   visible, never collapsed by default.

### States — design these

Provide a toggle to preview both:

- **Populated** — score summary, per-question breakdown, and weak-area breakdown
  as above.
- **Empty weak areas** — when `weakAreas` is empty (the user did well), the
  "Areas to focus on" section shows a calm encouraging message instead: heading
  "No specific weak areas — nice work" and a short line ("Your answers covered
  the change well. Re-read the per-question feedback above for any small
  refinements."). The score summary and per-question breakdown still render
  fully. This is a positive outcome, not an empty/error state.

(There is no loading or error state for this component — it renders only when a
stored grading result exists; loading/grading-failure belong to the
Understanding Check UI and the parent page.)

### Visual & accessibility requirements

- Clean, calm, content-first — a guide, not a verdict. No confetti, no red
  "FAIL"; honest, encouraging feedback.
- Fully responsive; comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no hard-coded
  colors).
- Use **lucide-react** icons.
- Semantic HTML: the section has one heading (an `<h2>` within the page); the
  score summary, per-question breakdown, and weak-area breakdown are `<h3>`
  sub-sections; no skipped heading levels. The question-grade list and the
  weak-area list are `<ul>`s.
- **The score and `scoreLabel` are conveyed by text and number — a progress
  ring/bar is supportive only; a low score is never signalled by color alone.**
- **Verdict badges convey meaning by their text label, not color alone.**
- The "AI-generated coaching feedback" note is real text.
- Related-question and file-reference anchors are keyboard-operable with visible
  focus rings and accessible names including their target.
- All text meets WCAG AA contrast in both themes.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`, `CardContent`),
`Badge`, `Progress` (for the optional score bar), `Separator`, `Collapsible`.
lucide-react for icons (award / target, check-circle, circle-dot, x-circle,
file, lightbulb). Keep the component small and composable so it integrates
cleanly into an existing shadcn/ui monorepo — reuse `packages/ui` rather than
duplicating primitives.

---

## Notes for the integrator (task #116)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives.
- This is a **component embedded in the Diff Review page**
  (`apps/web/app/reviews/[id]/page.tsx` §6g) — suggested home
  `apps/web/components/reviews/score-weak-area.tsx`. It is a **Server
  Component** — it does **no** data fetching; it receives
  `grading: GradingResult` and `changedFilePaths: string[]` as props.
- The parent renders this component **only when `DiffReview.grading` is
  non-null** — i.e. after the answer-and-score loop has completed. An ungraded
  review shows the Understanding Check form instead.
- The `GradingResult` / `QuestionGrade` / `WeakArea` shapes are defined in
  `docs/design/score-weak-area.md` §5 / `docs/design/diff-review-page.md` §5;
  reconcile the mock shapes with the merged `packages/db` types from the M8
  grading call (task #113).
- Wire each `weakArea.fileRefs` chip as an in-page anchor to the matching
  changed-file entry in the Diff Review §6b changed-files section, and each
  `relatedQuestionIds` link to the matching per-question row; an unresolved file
  reference renders as plain text, not a dead link.
- Verify the result against `docs/design/score-weak-area.md` §14 acceptance
  criteria; record integration notes in `docs/design/ui-integration-notes/`.
