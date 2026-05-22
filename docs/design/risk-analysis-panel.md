# Page Spec: Risk Analysis Panel

Issue: #115 · Epic: `diff-review` · PRD: `.claude/prds/diff-review.md` (FR-3, FR-4, FR-8)

This spec defines the **Risk Analysis Panel** for Milestone 8. It is the input
to the Claude Design prompt (`docs/design/ui-prompts/risk-analysis-panel.md`)
and to the integration task #116. It must be human-reviewed before the prompt
is run. (UI tool: Claude Design — see ADR 0007.)

The Risk Analysis Panel is **not a standalone route** — it is a component
embedded in the **Diff Review** page (`docs/design/diff-review-page.md` §6d) at
route `/reviews/[id]`. It is specified separately so the risk presentation is
reviewable on its own and so its component contract is unambiguous for
integration. It shares layout, components, and tone with the rest of M8 and the
M2–M4 pages so the whole app reads as one product.

---

## 1. Page name

**Risk Analysis Panel** — an embedded panel within the Diff Review page that
presents the risk analysis: the bugs and risks the reviewed pull request may
introduce, each tied to a specific changed file or hunk.

## 2. User goal

> "An AI wrote this change and I'm about to claim it as mine. What could it have
> quietly broken? Show me the risks plainly — and tied to the actual lines that
> changed — so I can speak to them in an interview instead of being blindsided."

The user scans the risks, sees each one anchored to a real file (and hunk where
relevant), reads why it is a risk, and knows what to watch for.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She merges
AI-generated PRs and cannot reliably spot the risks an AI introduced.

Design implications:
- **Tied to the diff, always.** A risk that does not point at a file is the
  exact "generic review trivia" the product rejects (PRD FR-4). Every risk row
  shows its file reference prominently; the reference is the proof the risk is
  real.
- **Honest, not alarmist.** This is caution, not a scare. Severity is shown
  calmly and clearly; the copy frames risks as "things to check," not failures.
- **Plainly visible.** Risks are *why the review is trustworthy* — they are not
  hidden behind a closed accordion by default.
- **Honest about AI.** The risk analysis is AI-generated, like the rest of the
  review; the panel inherits the Diff Review page's "AI-generated review"
  framing (it does not need its own separate label).
- **No accounts, no setup.** M8 has no authentication.

## 4. Route(s)

**No route of its own.** The panel is rendered inside
`apps/web/app/reviews/[id]/page.tsx` (the Diff Review page) as the §6d "Risks to
watch" section. Suggested component home:
`apps/web/components/reviews/risk-analysis-panel.tsx` (a Server Component — it
renders already-loaded data and has no interactivity beyond optional
file-anchor links). Final placement is the integrator's call (task #116).

## 5. Data source / contract

The panel **receives its data as a prop** — it does no fetching. Its parent (the
Diff Review page) loads the `DiffReview` via the M8 data-access layer
(`getDiffReviewById`, task #114) and passes the risk list down.

```ts
interface RiskAnalysisPanelProps {
  risks: RiskFinding[]
  // The PR's changed-file set, so a risk's fileRef can be rendered as an
  // in-page anchor to the matching changed-file entry in Diff Review §6b.
  changedFilePaths: string[]
}
```

### `RiskFinding` shape — the typed risk contract

`RiskFinding` is one element of `DiffReview.risks` (see
`docs/design/diff-review-page.md` §5). It is produced by the M8 review call
(task #112) as structured output. The exact TypeScript lives in `packages/db`;
if the merged code differs at integration time the merged code is authoritative,
but the shape is fixed by PRD FR-3/FR-4 and must not change without updating
this spec.

| Field | Type | Use |
|---|---|---|
| `id` | `string` | stable key for the row |
| `title` | `string` | a short risk headline |
| `description` | `string` | plain-language explanation of the risk |
| `severity` | `"high" \| "medium" \| "low"` | a calm severity badge; also sort/group key |
| `category` | `"bug" \| "regression" \| "security" \| "performance" \| "maintainability" \| "other"` | a category tag |
| `fileRef` | `{ path: string; hunkHeader?: string }` | the changed file (and optional hunk) the risk is tied to |
| `suggestion` | `string \| null` | optional "what to do about it" guidance; **may be null** |

Every `RiskFinding.fileRef.path` is guaranteed to resolve to a path in the PR's
changed-file set (the M8 integrity check, task #114). If a reference
unexpectedly fails to resolve, render the path as plain text without an anchor
link and flag it quietly — never crash (PRD NFR "project-grounded", PRD FR-4).

## 6. Page sections

The panel is a single headed section. Top to bottom:

1. **Panel header** — heading "Risks to watch" and a one-line description "Bugs
   and risks this change may introduce — each tied to the file it affects." A
   small **risk count** (e.g. "4 risks") and, optionally, a compact severity
   summary ("1 high · 2 medium · 1 low").
2. **Risk list** — `risks` rendered as a list, one **risk row** per finding.
   Rows are ordered by `severity` (high → medium → low) so the most important
   risks are first; within a severity, source order is preserved. Each risk row
   shows:
   - the `title` as the row's heading;
   - a **severity badge** ("High" / "Medium" / "Low") — calm, not alarmist
     coloring, meaning carried by the text;
   - a **category tag** ("Bug", "Regression", "Security", "Performance",
     "Maintainability", "Other");
   - the **file reference** — `fileRef.path` in monospace, prominently placed
     (a small "file" icon + path). When `fileRef.hunkHeader` is present, show it
     too ("in hunk `@@ ... @@`"). The file reference is an **in-page anchor**
     that scrolls to that file's entry in the Diff Review §6b changed-files
     section (when the path is in `changedFilePaths`);
   - the `description` prose;
   - the `suggestion` prose, framed "What to check", when `suggestion` is not
     `null`; omitted when it is `null`.
3. **Severity grouping (optional)** — instead of one flat sorted list, the rows
   may be grouped under "High", "Medium", "Low" subheadings. Either flat-sorted
   or grouped is acceptable; both must keep the file reference on every row.

Each risk row may be a shadcn `Card` or a bordered list item. The panel itself
must be **plainly visible** within the Diff Review page — it must not be a
closed accordion by default.

## 7. Input fields

The Risk Analysis Panel has **no input fields** — it is a read-only
presentation. (The interactive parts of the Diff Review route are the
Understanding Check UI, a separate spec.)

## 8. Primary actions

- **Read the risks** — scan the list; the main action.
- **Jump to the affected file** — click a risk's file reference to scroll to
  that file's changed-file entry in the Diff Review page (§6b). The one
  interactive affordance; it is an in-page anchor, not navigation.

No create/edit/delete — risks are generated by the M8 review call.

## 9. Loading state

The panel does **not** own a loading state. Its parent (the Diff Review page,
`docs/design/diff-review-page.md` §9) renders the route's skeleton, which
includes a risk-list placeholder block. By the time the panel renders, `risks`
is already loaded and passed in as a prop.

## 10. Empty state

- **No risks** — when `risks` is an empty array, render the panel header and a
  calm inline message in place of the list: heading-adjacent text "No notable
  risks found for this change." with a short reassuring line ("The review did
  not flag specific bugs or risks — still read the changed files and core-logic
  explanation above."). This is a legitimate, non-alarming outcome — do **not**
  hide the whole panel, and do not show it as an error.
- The M8 review call typically produces at least one risk; the empty state
  exists so the panel never renders a bare heading with nothing under it.

## 11. Error state

The panel itself does not fetch, so it has **no error state of its own**. A
failure to load the `DiffReview` is handled by the Diff Review page's route
`error.tsx` boundary (`docs/design/diff-review-page.md` §11).

The one panel-level concern is an **unresolved file reference**: if a
`RiskFinding.fileRef.path` is not in `changedFilePaths`, render the path as
plain non-linked text and show a quiet inline flag ("file not in this PR's
changed set") — the risk still renders; the page does not crash.

## 12. Success state

- The panel renders every `RiskFinding` as a row, ordered by severity, each with
  its title, severity badge, category tag, file reference, description, and
  (where present) suggestion.
- The risk count and optional severity summary are accurate.
- Each in-PR file reference is a working in-page anchor to the file's diff
  entry.
- When `risks` is empty, the calm "no notable risks" message shows instead of a
  list.
- Success is implicit (content shown) — there is no toast; the panel is a
  read-only section.

## 13. Accessibility notes

- **Semantics & headings.** The panel has one section heading ("Risks to watch")
  at the heading level the Diff Review page assigns it (an `<h2>` within the
  page). Risk-row titles are the next level down (`<h3>`); if severity
  subheadings are used they sit between, with no skipped levels. The risk list
  is a `<ul>`.
- **Severity & category not color-only.** Severity and category badges convey
  meaning by their text label, not color alone — a "High" badge reads "High."
  Severity color is supportive, calm, and AA-contrast in both themes.
- **File reference.** The file-reference anchor has an accessible name that
  includes the path and its purpose (e.g. "Jump to changes in
  `src/auth/session.ts`"). It is keyboard-operable with a visible focus ring; an
  unresolved reference is plain text, not a dead link.
- **Reading order.** DOM order = visual order; each row reads title → severity →
  category → file → description → suggestion.
- **States announced.** The empty-state message and any unresolved-reference
  flag are real text content, not color-only signals.
- **Keyboard.** Every file-reference anchor is reachable in logical order;
  Enter activates. Visible focus ring throughout.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes (the app
  uses `next-themes`).
- **Targets.** The file-reference links are comfortably sized for pointer and
  touch.

## 14. Acceptance criteria

- [ ] The panel renders every `RiskFinding` in `risks` as a row showing its
      `title`, `severity` badge, `category` tag, `fileRef`, `description`, and
      (when non-null) `suggestion`.
- [ ] **Every risk row shows a file reference** — `fileRef.path` (and
      `hunkHeader` when present) — prominently; a risk with no visible file tie
      would be a spec violation (PRD FR-4).
- [ ] Risks are ordered by `severity` (high → medium → low), flat-sorted or
      under severity subheadings.
- [ ] An in-PR file reference is an **in-page anchor** to that file's entry in
      the Diff Review changed-files section; an unresolved reference is plain
      text with a quiet flag, never a crash.
- [ ] The panel receives `risks` and `changedFilePaths` as props — it does **no**
      data fetching of its own.
- [ ] An **empty** `risks` array shows a calm "No notable risks found" message,
      not a hidden panel and not an error.
- [ ] The panel is **plainly visible** within the Diff Review page — not a
      closed accordion by default.
- [ ] Severity and category badges convey meaning by text, not color alone; the
      tone is honest caution, not alarm.
- [ ] The panel reads as one product with the rest of M8 and the M2–M4 pages —
      shared components, spacing, and calm tone.
- [ ] Accessibility notes in §13 are satisfied (heading order, badges not
      color-only, accessible file-reference anchors, keyboard operability, AA
      contrast).
- [ ] Page spec is human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #115).
