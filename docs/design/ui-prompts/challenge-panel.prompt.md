# Claude Design Prompt: Challenge Panel

Issue: #136 · Epic: `issue-based-learning-workspace` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Challenge Panel. Full contract: the page
spec `docs/design/challenge-panel.page-spec.md` — read that for the
complete behaviour. This component is **embedded** in the Issue Learning
Workspace page
(`docs/design/issue-learning-workspace.page-spec.md` §6h) — it is a
read-only stub component, not a route.

## How to use this (Claude Design)

1. In Claude Design, **create a project** (or continue the Issue Learning
   Workspace project) and **link this repository** so it uses the real
   `packages/ui` (shadcn/ui) components and styling.
2. Optionally attach the page spec
   `docs/design/challenge-panel.page-spec.md` as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline
   comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` /
   standalone HTML) and return it here.

The output is a **draft component**. Integration task **#138**
reconciles it with `apps/web` + `packages/ui` and embeds it in the
Issue Learning Workspace page wired to the real
`learningUnit.challengeConcept` and `learningUnit.challengeType`
fields.

**Stack to target:** Next.js App Router, React Server Components,
TypeScript, Tailwind CSS, shadcn/ui. Light + dark mode. Build with
mock/sample data only — no data fetching. **No interactive
state — the component is read-only by design.**

---

## Prompt — paste into Claude Design

Build a **Challenge Panel** component for a learning-coach web app,
using React, TypeScript, Tailwind CSS, and shadcn/ui. It is **not a
page** — it is a **read-only stub** section embedded inside an "Issue
Learning Workspace" page. Light and dark mode. Use only mock sample
data passed in as a prop — no data fetching, no client state, no
interactivity beyond the static render.

### Domain

The app coaches a job-seeking junior developer to genuinely understand
issues on the project they built with AI assistance. This panel sits
at the very end of an issue's learning unit and previews **the
concept of a debug/expand challenge** that would deepen the user's
grasp of *this* issue's code. **The runnable challenge does not exist
yet** — it lives in Milestone 9 (Debug & Expansion Challenges). M7
ships only the stub concept and a "deferred to M9" notice; it does
**not** run, grade, or claim to resolve a challenge.

**FR-7 + R3 — *normative*.** M7 stores **only two stub fields** on
the learning unit — `challengeConcept` and `challengeType`. The
panel must:
- render `challengeConcept` and `challengeType` plainly;
- display an **explicit, visible "Deferred to Milestone 9" notice**
  — always shown when the panel renders; **never hidden behind a
  toggle, never tucked into a footnote**;
- **have no input fields, no buttons, no run/grade affordances**.
  No "Start challenge", no "Coming soon!", no fake button that
  does nothing. Adding any interactive control would imply M9
  functionality exists today; that is exactly what R3 forbids.

The panel is **visually subdued** — the *least* prominent section
on the page. The grounding sections and the answer-and-score loop
are the product; this panel is an honest pointer to a future
milestone.

The component takes a `challengePanel` object with these two fields
only:

- `challengeConcept` — string (one or two plain-language sentences
  describing the concept of the challenge that would exercise this
  issue's code — grounded in this issue's related files and
  concepts, not a generic platitude)
- `challengeType` — string (a short label like "debug" or "expand"
  — meaning carried by text, not color)

Seed the mock data with a plausible stub for an issue like "Add
per-user daily quota on top of the per-IP rate limit":
- `challengeConcept`: "Trace a failed login call from the API route
  through the rate-limit middleware and find where the 429 is
  emitted. Then add a per-user daily quota on top of the existing
  per-IP rate limit and update the relevant tests."
- `challengeType`: "debug" (or "expand")

No "lorem ipsum"; no generic "try a hands-on exercise" filler. The
concept must be concrete to the issue.

### Component layout

A single headed section, **visually subdued** (low chrome, calm
typography, no CTAs). Top to bottom:

1. A **section header**: heading "Challenge" and a one-line
   description "A debug or expand exercise that would deepen your
   grasp of *this* issue's code. The runnable challenge lives in
   Milestone 9 — this panel is a preview of the concept."
2. A **type label** — `challengeType` shown as a small calm text
   tag (e.g. "Debug" or "Expand") — meaning by text, not by color.
3. The **concept** — `challengeConcept` rendered as readable prose,
   plain language. This is the substantive content.
4. A **deferral notice** — an explicit, visible message: heading
   "Deferred to Milestone 9" (or rendered as a calm shadcn `Alert`
   / inline note), body text "Running and grading challenges is
   part of the Debug & Expansion Challenges milestone (M9). When M9
   lands, this panel will host the runnable challenge for this
   issue." **Always shown** when the panel renders — not behind a
   "Learn more" toggle.

Wrap the panel in a single subdued `Card` or sectioned region.
**No call-to-action buttons. No input fields. No "Start", "Run", or
"Submit". No progress indicator. No spinner. Nothing interactive.**

### States — design these

Provide a toggle to preview each:

- **Populated** — `challengeConcept` and `challengeType` both
  non-empty: panel renders as above.
- **Defensive: empty concept** — `challengeConcept` is empty
  (whitespace-only): render the header and the deferral notice as
  normal, but in place of the missing concept show a quiet inline
  note: "No challenge concept was generated for this unit." The
  panel must never appear empty or broken; the deferral notice
  still shows.
- **Defensive: empty type** — `challengeType` is empty: render the
  panel without the type tag; concept and deferral notice render
  as normal. Never crash.

There is **no loading state, no error state, no submitting state**
— the panel is read-only and has no behaviour.

### Visual & accessibility requirements

- Clean, calm, content-first — honest, restrained. **Subdued; never
  celebratory; no "Coming soon!" hype.**
- Fully responsive; comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no
  hard-coded colors).
- Use **lucide-react** icons sparingly — at most a single calm icon
  in the deferral notice (e.g. `info` or `calendar`).
- Semantic HTML: the section has one heading (an `<h2>` within the
  page); the deferral notice may be an `<h3>` sub-heading or a
  calm `Alert` region with a programmatic role and label. No
  skipped heading levels.
- **The deferral notice is real, announced text** — not a
  color-only or icon-only signal; not hidden behind a toggle.
- The `challengeType` tag conveys meaning by text, not color
  alone — and AA-contrast in both themes.
- **No focusable controls** — because the panel is read-only, no
  buttons, no links, no inputs. DOM order matches the visual order
  so a screen reader reads header → type → concept → deferral
  notice.
- All text meets WCAG AA contrast in both themes. The subdued
  styling must still meet AA — "visually subdued" is not an excuse
  for low contrast.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`), `Badge` (for the type tag), `Alert` (with
`AlertTitle` and `AlertDescription` for the deferral notice). **Do
not include `Button` or any input components** — the panel is
read-only by design (R3, FR-7). lucide-react for icons (info,
calendar — at most one). Keep the component small and composable
so it integrates cleanly into an existing shadcn/ui monorepo —
reuse `packages/ui` rather than duplicating primitives.

---

## Notes for the integrator (task #138)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`)
  — **reuse it**; do not duplicate primitives.
- This is a **Server Component embedded in the Issue Learning
  Workspace page**
  (`apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx`
  §6h) — suggested home
  `apps/web/components/learning/challenge-panel.tsx`. It receives
  `challengeConcept: string` and `challengeType: string` as props
  and does **no** data fetching.
- **FR-7 + R3 — *normative*.** The panel must remain read-only.
  Do **not** add a "Start challenge", "Run", "Coming soon!", or
  any other affordance. Do **not** add a placeholder answer field.
  Do **not** add a "Notify me when M9 ships" CTA. The panel's
  honesty about deferral is the product's credibility — pretending
  otherwise is exactly the failure mode R3 forbids.
- **R3 — *normative*.** The data contract is exactly
  `{ challengeConcept, challengeType }`. **Do not pre-allocate M9
  fields** — no `acceptanceCriteria`, no `runnerConfig`, no
  `solutionDiffHash`. M9 will add its full schema in its own
  Drizzle migration when M9 lands; M7 must not pre-empt that
  schema decision.
- The `challengeConcept` / `challengeType` shapes are defined in
  `docs/design/challenge-panel.page-spec.md` §5; reconcile the
  mock shapes with the merged `packages/db` types from task #131
  (the M7 schema migration).
- Verify the panel **remains visually subdued** when integrated —
  it must not become the most prominent section on the unit. The
  grounding sections (related files, concepts) and the
  answer-and-score loop are the product.
- Verify the result against
  `docs/design/challenge-panel.page-spec.md` §15 acceptance
  criteria; record integration notes in
  `docs/design/ui-integration-notes/` as part of task #138.
