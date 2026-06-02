# Claude Design Prompt: Delivery Traceability Page

Issue: #204 · Epic: `ccpm-integration` (M12) · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the M12 Delivery Traceability Page. Full contract: the
page spec `docs/design/delivery-traceability-page.page-spec.md` — read it for the
complete behaviour, the typed shapes, the two states, and the "no token / no API
key at view time" rule.

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it uses
   the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach `docs/design/delivery-traceability-page.page-spec.md` as
   context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments —
   make sure to design **both** states (map + degradation).
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#205** reconciles it with `apps/web`
+ `packages/ui` and wires it to the real M12 data-access layer
(`@workspace/db/ccpm` → `getDeliveryMap`, task **#203**) and the M11 snapshot DAL
— do not expect Claude Design to produce final wiring; it produces the interface.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only — no
data fetching, no SDK calls, no network.

---

## Prompt — paste into Claude Design

Build a **Delivery Traceability Page** for a learning-coach web app, using
Next.js (App Router), React, TypeScript, Tailwind CSS, and shadcn/ui. It is a
**single page** at route `/delivery/[owner]/[repo]`. Light and dark mode. Use
only mock sample data — render from a typed in-file object so it is trivial to
swap for real server data later. No data fetching, no API calls, no database.

### Domain

The app coaches a job-seeking junior developer to genuinely understand projects
they built with heavy AI assistance, so they can explain them in interviews. This
page reconstructs **how an imported repository was delivered** when it used a
spec-driven workflow (CCPM): the chain **PRD → Epic → Task → GitHub Issue → PR**.
It also teaches *why* that workflow is shaped the way it is, because "how did you
manage and ship this work?" is a routine interview question.

**Critical: design TWO states on this one route.** A boolean `kind` switches
between them:

1. **`"map"` — the repo uses CCPM.** Render the traceability tree + teaching.
2. **`"absent"` — the repo has no spec-driven workflow (the common case).**
   Render a calm, educational panel — **not** an error.

### State 1 — the traceability map (`kind: "map"`)

A single readable column, top to bottom:

1. **Header:** `{owner}/{repo}` as the page title (`<h1>`), the git `ref` as a
   small badge, a one-line subtitle "How this repository was delivered — from
   requirement to shipped code.", and a quiet real-text note
   "Read-only · local snapshot · no network". A small "Re-import to refresh" text
   link sits in the header.
2. **Teaching headline + stats strip:** a prominent one-line summary like *"This
   project was delivered through a spec-driven workflow: 1 requirement doc → 3
   epics → 14 tasks, 14 tracked as GitHub issues."* Under it, a compact stats
   strip of labelled chips: "1 PRD · 3 epics · 14 tasks · 14 tracked · 9 done · 1
   archived". Convey meaning with text + an icon, never color alone.
3. **The traceability tree** — a vertically indented tree:
   - **PRD** as a top-level card: name heading, a one-line description, a status
     badge, and a small "What's a PRD?" disclosure button that reveals a
     beginner-first explanation.
   - **Epics** nested under their PRD: name, a status + progress badge (e.g.
     "in-progress · 56%"), an "Epic #196" chip, and a "What's an epic?"
     disclosure. An epic with no `epic.md` shows a muted "(inferred from tasks)"
     marker.
   - **Tasks** nested under their epic: name, a status chip, an optional "depends
     on #198, #199" hint, and an **issue/PR status chip** (see below). A "What's
     a task?" / "Why link issues & PRs?" disclosure sits at this level.
   - A clearly labelled **"Epics without a PRD"** group below the tree for orphan
     epics; archived epics carry an "Archived" badge. Nothing is dropped.
4. **Issue/PR status chip per task** — design all of these variants:
   - muted **"Not tracked as a GitHub issue"** (task has no issue)
   - **"Issue #11"** (tracked, status not resolved)
   - **"Issue #11 · open"**
   - **"Issue #13 · closed · PR #99"** (the PR number links out)
   - **"Issue #14 · couldn't link"** with a calm one-line reason like *"This
     issue couldn't be found on GitHub — it may be private."* — **never** an HTTP
     code or stack trace.
5. **"Why this matters in an interview" panel** — a short bulleted list:
   traceability (every change traces to a requirement), bounded work (small
   reviewable units), reviewable scope (a human approved each step).

### State 2 — no spec-driven workflow (`kind: "absent"`)

A calm, centered, full-width educational panel (NOT an error, no red, no warning
iconography):

- Heading "No spec-driven workflow detected".
- A friendly paragraph explaining that most AI-assisted projects don't use one
  yet; that a spec-driven workflow writes the requirement (a PRD) and the plan
  (an epic broken into tasks) into files before coding, then links each task to a
  GitHub issue and the PR that closed it; and that the payoff is being able to
  explain *how* a project was delivered in an interview.
- A quiet line "We looked for: .claude/prds/, .claude/epics/".
- A primary button/link **"Learn the Agentic CCPM Workflow →"** (goes to a Golden
  Path catalog page) and a secondary "Import a different repository" link.

### Visual & tone

- Match a calm, content-first shadcn/ui product: generous spacing, a comfortable
  reading column, `Card`, `Badge`, `Separator`, `Button`, and a disclosure
  pattern (`Collapsible`/`Accordion`/`Popover`) for the teaching explanations.
- The tree should make nesting obvious with indentation **and** structure (nested
  lists), not indentation alone.
- Light + dark mode. WCAG AA contrast. Status conveyed by text + icon, never
  color alone.

### Accessibility (must)

- One `<h1>` (the owner/repo title); PRD `<h2>`, epic `<h3>`, task `<h4>` — never
  skip levels. Use `<main>`, `<nav>`, nested `<ul>/<li>` (or ARIA `tree`).
- Teaching disclosures are real `<button>`s with `aria-expanded` + `aria-controls`;
  reachable by keyboard, not hover-only.
- Status chips and the "couldn't link" reason are real announced text. The
  closing-PR link is a real `<a>` named "Closing PR #99".
- Full keyboard operability, visible focus rings, DOM order = visual order.

### Mock data

Include one in-file sample for **each** state so both can be previewed:

- a `"map"` sample with 1 PRD, ~3 epics (one archived, one "inferred from
  tasks"), and ~8 tasks spanning every issue/PR status variant above (not
  tracked, open, closed+PR, couldn't-link);
- an `"absent"` sample with `searched: [".claude/prds/", ".claude/epics/"]` and
  the Golden Path label "Agentic CCPM Workflow".

Render from a typed object shaped like the page spec's `DeliveryMapResult` so the
integrator can swap in `getDeliveryMap(owner, repo)` unchanged.
