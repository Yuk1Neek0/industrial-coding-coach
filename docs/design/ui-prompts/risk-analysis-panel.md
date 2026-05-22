# Claude Design Prompt: Risk Analysis Panel

Issue: #115 · Epic: `diff-review` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Risk Analysis Panel. Full contract: the page spec
`docs/design/risk-analysis-panel.md` — read that for the complete behaviour.
This panel is **embedded** in the Diff Review page
(`docs/design/diff-review-page.md` §6d) — it is a component, not a route.

## How to use this (Claude Design)

1. In Claude Design, **create a project** (or continue the Diff Review project)
   and **link this repository** so it uses the real `packages/ui` (shadcn/ui)
   components and styling.
2. Optionally attach the page spec `docs/design/risk-analysis-panel.md` as
   context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft component**. Integration task **#116** reconciles it
with `apps/web` + `packages/ui` and embeds it in the Diff Review page wired to
the real `DiffReview.risks` data.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only —
no data fetching.

---

## Prompt — paste into Claude Design

Build a **Risk Analysis Panel** component for a learning-coach web app, using
React, TypeScript, Tailwind CSS, and shadcn/ui. It is **not a page** — it is a
section component embedded inside a "Diff Review" page. Light and dark mode.
Use only mock sample data passed in as a prop — no data fetching.

### Domain

The app coaches a job-seeking junior developer to understand pull requests they
built with AI assistance. This panel presents the **risk analysis** of one
reviewed PR: the bugs and risks the change may introduce. The whole point: every
risk is **tied to a specific changed file** (and hunk where relevant) — a risk
with no file reference would be the generic, untrustworthy "review trivia" the
product rejects. The tone is honest caution, not alarm — no scary red banners.

The panel takes a `risks` array; each **risk finding** has:

- `id` — string
- `title` — a short risk headline
- `description` — plain-language explanation of the risk
- `severity` — "high" | "medium" | "low"
- `category` — "bug" | "regression" | "security" | "performance" |
  "maintainability" | "other"
- `fileRef` — `{ path, hunkHeader? }` — the changed file (and optional hunk
  header) the risk is tied to
- `suggestion` — a "what to check" string, or `null`

Seed the mock data with **3–4 realistic risks** for a plausible PR (e.g. "Add
rate limiting to the login endpoint") — a mix of severities and categories,
each with a real file path like `src/auth/rate-limit.ts`, plausible
descriptions, and a suggestion on most (one with `null`). No "lorem ipsum".

### Panel layout

A single headed section:

1. A **panel header**: heading "Risks to watch" and a one-line description
   "Bugs and risks this change may introduce — each tied to the file it
   affects." Show a small **risk count** ("4 risks") and optionally a compact
   severity summary ("1 high · 2 medium · 1 low").
2. A **risk list** — render `risks` ordered by `severity` (high → medium → low).
   Each **risk row** (a shadcn `Card` or bordered list item) shows:
   - the `title` as the row heading;
   - a **severity badge** ("High" / "Medium" / "Low") — calm coloring, meaning
     in the text;
   - a **category tag** ("Bug" / "Regression" / "Security" / "Performance" /
     "Maintainability" / "Other");
   - the **file reference** — a small file icon + `fileRef.path` in monospace,
     placed prominently; when `hunkHeader` is present, also show it ("in hunk
     `@@ ... @@`"). Render the file reference as a link styled as an in-page
     anchor (it will scroll to the file's diff in the parent page);
   - the `description` prose;
   - the `suggestion` prose, framed "What to check", **only when** `suggestion`
     is not `null`.
   You may instead group rows under "High" / "Medium" / "Low" subheadings —
   either flat-sorted or grouped is fine, as long as every row keeps its file
   reference.

The panel is plainly visible — **not** a closed accordion by default.

### States — design these

- **Populated** — the risk list as above.
- **Empty — no risks** — when `risks` is empty, show the panel header and a
  calm message in place of the list: "No notable risks found for this change."
  plus a short reassuring line ("The review did not flag specific bugs or
  risks — still read the changed files and core-logic explanation above."). Not
  alarming, not hidden, not an error.

Provide a toggle so both the populated and empty states can be previewed.

### Visual & accessibility requirements

- Clean, calm, content-first — honest caution, not alarm. No oversized red
  warning blocks.
- Fully responsive; comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no hard-coded
  colors). Severity coloring is supportive and AA-contrast in both themes.
- Use **lucide-react** icons.
- Semantic HTML: the panel has one section heading (an `<h2>` within the page);
  risk-row titles are `<h3>`; the risk list is a `<ul>`. No skipped heading
  levels.
- **Severity and category badges convey meaning by their text label, not color
  alone.**
- The file-reference anchor is keyboard-operable with a visible focus ring and
  an accessible name including the path ("Jump to changes in
  `src/auth/rate-limit.ts`").
- All text meets WCAG AA contrast in both themes.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardContent`), `Badge`,
`Separator`. lucide-react for icons (shield-alert, file, alert-triangle,
arrow-down-up, bug, gauge). Keep the component small and composable so it
integrates cleanly into an existing shadcn/ui monorepo — reuse `packages/ui`
rather than duplicating primitives.

---

## Notes for the integrator (task #116)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives.
- This is a **component embedded in the Diff Review page**
  (`apps/web/app/reviews/[id]/page.tsx` §6d) — suggested home
  `apps/web/components/reviews/risk-analysis-panel.tsx`. It is a **Server
  Component** — it does **no** data fetching; it receives `risks: RiskFinding[]`
  and `changedFilePaths: string[]` as props from the parent.
- The `RiskFinding` shape is defined in `docs/design/risk-analysis-panel.md`
  §5 / `docs/design/diff-review-page.md` §5; reconcile the mock shape with the
  merged `packages/db` types from the M8 review call (task #112).
- Wire each in-PR `fileRef.path` as an in-page anchor to the matching
  changed-file entry in the Diff Review §6b changed-files section; an unresolved
  path renders as plain text, not a dead link.
- Verify the result against `docs/design/risk-analysis-panel.md` §14 acceptance
  criteria; record integration notes in `docs/design/ui-integration-notes/`.
