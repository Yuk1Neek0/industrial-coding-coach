# Claude Design Prompt: Review Checklist UI

Issue: #136 · Epic: `issue-based-learning-workspace` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Review Checklist UI. Full contract: the page
spec `docs/design/review-checklist.page-spec.md` — read that for the
complete behaviour. This component is **embedded** in the Issue Learning
Workspace page
(`docs/design/issue-learning-workspace.page-spec.md` §6e) — it is a
component, not a route.

## How to use this (Claude Design)

1. In Claude Design, **create a project** (or continue the Issue Learning
   Workspace project) and **link this repository** so it uses the real
   `packages/ui` (shadcn/ui) components and styling.
2. Optionally attach the page spec
   `docs/design/review-checklist.page-spec.md` as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline
   comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` /
   standalone HTML) and return it here.

The output is a **draft component**. Integration task **#138**
reconciles it with `apps/web` + `packages/ui`, embeds it in the Issue
Learning Workspace page, and wires its toggle to a server action that
persists `learning_units.checklist_state`.

**Stack to target:** Next.js App Router, React, TypeScript, Tailwind
CSS, shadcn/ui. This is an interactive **Client Component**. Light +
dark mode. Build with mock/sample data only — no data fetching; mock
the toggle persistence with a brief simulated delay.

---

## Prompt — paste into Claude Design

Build a **Review Checklist** component for a learning-coach web app,
using React, TypeScript, Tailwind CSS, and shadcn/ui. It is **not a
page** — it is an interactive section component embedded inside an
"Issue Learning Workspace" page. It holds toggle state, so it is a
Client Component. Light and dark mode. Use only mock sample data — no
data fetching; mock the toggle persistence with a brief delay.

### Domain

The app coaches a job-seeking junior developer to genuinely understand
issues on the project they built with AI assistance. After reading
what an issue is asking for and which files are in play, the user
walks a **review checklist** — concrete things to verify in whatever
diff the AI produces, tied to *this* issue's files and concepts. Each
toggle persists. The tone is supportive — **a tracker, not a gate**.

**R4 — *normative*.** Ticking checklist items **tracks the user's
progress; it does NOT change the understanding-question score**. The
two surfaces are independent by design — "comprehension over
completion". The component must surface this in copy and must never
block or unlock any other UI on the page based on checklist state.
There is no "you must finish this before…" copy anywhere; no
completion celebration; no pass/fail framing.

The component takes a `reviewChecklist` array; each **checklist
item** has:

- `id` — string
- `text` — the item text (concrete, references this issue's files /
  concepts; not a generic platitude)
- `fileRefs` — array of related-file paths the item cites (may be
  empty)
- `conceptName` — the tied concept name (matches a `Concept.name` in
  the parent), or `null`

It also takes `checklistState` — `{ items: Record<id, { done, toggledAt }> }`
— the user's current toggles (may be empty for a fresh unit) — and
`relatedFilePaths` — the parent unit's full list of related file
paths so `fileRefs` chips can be in-page anchors (unresolved
references render as plain text).

Seed the mock data with **4–5 realistic checklist items** for a
plausible issue (e.g. "Add per-user daily quota on top of the per-IP
rate limit") — each tied to a specific file path like
`src/auth/rate-limit.ts` and/or a concept like "Rate limiting".
Examples:
- "Verify `src/auth/rate-limit.ts` still exports `rateLimit` and the
  signature hasn't changed for existing callers."
- "Confirm the new per-user quota check runs *after* the existing
  per-IP check in the middleware chain."
- "Check that the migration adds the `user_quota` table without
  changing the `users` table."

**No generic "follow code style" / "add tests" filler.** Every item
must be concrete to this issue.

### Component layout

A single headed section:

1. A **section header**: heading "Review checklist" and a one-line
   description "Verify the AI's output against these checks — tied
   to the files this issue touches. **Ticking items tracks your
   progress; it does not change your understanding-question score.**"
   (the second sentence is the **explicit R4 surfacing** —
   "comprehension over completion"). Add a short, honest note that
   the checklist is AI-generated coaching guidance.
2. A **progress indicator** beside or below the header: a calm
   "Checked 2 of 5" counter (and optionally a quiet progress bar —
   supportive only, **never** a pass/fail color block). **No
   "complete!" celebration when all items are ticked** — completion
   is informational.
3. A **checklist list** — render `reviewChecklist` as a `<ul>`. Each
   **row** shows:
   - a shadcn `Checkbox` (labelled by the item text via
     `<label htmlFor>` or `aria-labelledby`);
   - the item `text` — concrete prose;
   - when `fileRefs` is non-empty, the file path(s) as monospace
     chips styled as in-page anchors (they will scroll to that
     file's row in the parent page's related-files section);
   - when `conceptName` is non-null, a small tag linking back to
     the concept in the parent page;
   - optionally a quiet "ticked {toggledAt}" caption when `done` is
     true (supportive only — no "great job!" copy).

There is **no submit button** — each toggle commits independently.
There is **no "tick all" or "clear all" control**.

### States — design all of these

Provide a toggle to preview each:

- **Empty state — default initial render** — every checkbox off,
  progress reads "Checked 0 of N". This is **not** an "empty/CTA"
  screen — it is the expected starting state and must look calm. No
  "Get started!" banner.
- **Partially ticked** — some checkboxes on, others off. Counter
  reads e.g. "Checked 2 of 5". No unlocking, no badges.
- **Fully ticked** — every checkbox on; counter reads "Checked N of
  N"; **no other UI changes** anywhere. Specifically: no badge, no
  celebratory banner, no "you can now answer the questions" copy
  (R4 — the form was always available).
- **Persistence failure** — after a toggle attempt fails: the
  affected checkbox **reverts** to its previous state, and a calm
  inline message appears beside the row — a small "Couldn't save —
  try again" with a real **"Try again"** button that re-attempts
  the toggle. Other rows remain fully interactive and their state is
  not affected.
- **Unresolved `fileRefs`** — a file chip whose path is not in
  `relatedFilePaths` renders as plain monospace text without an
  anchor (no dead link, no crash).

### Visual & accessibility requirements

- Clean, calm, content-first — supportive, low-pressure. Not a
  test, not a gate. **Subdued — never celebratory.**
- Fully responsive; comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no
  hard-coded colors).
- Use **lucide-react** icons.
- Semantic HTML: the section has one heading (an `<h2>` within the
  page); the list is a `<ul>`. No skipped heading levels.
- Every checkbox has its item `text` as a programmatically
  associated label.
- Toggle state (checked / unchecked) is announced; visible state
  never relies on color alone.
- The progress counter "Checked 2 of 5" is real text accessible to
  screen readers; an optional progress bar is `aria-hidden` (the
  text carries the meaning) or has a programmatic value.
- File-reference chips are keyboard-operable in-page anchors with
  accessible names including the path; visible focus ring.
- The persistence-failure message is an `aria-live` region with real
  text; the "Try again" affordance is a real button.
- All text meets WCAG AA contrast in both themes.

### Components to use

shadcn/ui: `Card`, `Checkbox`, `Label`, `Progress` (for the optional
progress bar — text-first), `Badge`, `Button`, `Alert` (for the
persistence-failure message). lucide-react for icons (check-square,
file, refresh-cw, alert-circle). Keep the component small and
composable so it integrates cleanly into an existing shadcn/ui
monorepo — reuse `packages/ui` rather than duplicating primitives.

---

## Notes for the integrator (task #138)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`)
  — **reuse it**; do not duplicate primitives.
- This is a **Client Component embedded in the Issue Learning
  Workspace page**
  (`apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx`
  §6e) — suggested home
  `apps/web/components/learning/review-checklist.tsx`. It receives
  `unitId`, `reviewChecklist`, `checklistState`, and
  `relatedFilePaths` as props; it does **no** data fetching.
- Replace the mocked toggle persistence with a **server action**
  that calls the M7 data-access layer (task #135), which writes
  the `learning_units.checklist_state` JSON column (FR-6, FR-8,
  R2). **No API route** (ADR 0006).
- **R4 — *normative*.** `checklistState` must **never** be an input
  to the grading call (task #134); the data-access layer must
  expose checklist updates independently of grading. The component
  must never block or unlock the Understanding Questions form.
  Verify the integration honours this in both code and copy.
- The `ChecklistItem` / `ChecklistState` shapes are defined in
  `docs/design/review-checklist.page-spec.md` §5; reconcile the
  mock shapes with the merged `packages/db` types.
- Wire each `fileRefs` chip as an in-page anchor to the matching
  related-file entry in the Issue Learning Workspace §6b section,
  and each `conceptName` tag to the matching concept in §6c.
- Handle a persistence failure as a non-fatal inline "Try again"
  that reverts the optimistic toggle and preserves all other state
  — never a page error.
- Verify the result against
  `docs/design/review-checklist.page-spec.md` §15 acceptance
  criteria; record integration notes in
  `docs/design/ui-integration-notes/` as part of task #138.
