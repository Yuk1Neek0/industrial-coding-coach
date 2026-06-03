# Claude Design Prompt: Observability Page

Issue: #226 · Epic: `llm-observability` (M13) · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the M13 Observability Page. Full contract: the page spec
`docs/design/observability-page.page-spec.md` — read it for the complete
behaviour, the typed shapes, the two panels, and the "no token / no API key at
view time" rule.

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it uses
   the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach `docs/design/observability-page.page-spec.md` as context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments —
   design **both panels** (Part A + Part B) and **all** their resting states
   (Part-A empty, Part-B absent, no-snapshot).
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#227** reconciles it with `apps/web`
+ `packages/ui` and wires it to the real M13 data-access layer
(`@workspace/db/observability` → `getObservability`, task **#225**) — do not
expect Claude Design to produce final wiring; it produces the interface.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only — no
data fetching, no SDK calls, no network.

---

## Prompt — paste into Claude Design

Build an **Observability Page** for a learning-coach web app, using Next.js (App
Router), React, TypeScript, Tailwind CSS, and shadcn/ui. It is a **single page**
at route `/observability/[owner]/[repo]`. Light and dark mode. Use only mock
sample data — render from a typed in-file object so it is trivial to swap for real
server data later. No data fetching, no API calls, no database.

### Domain

The app coaches a job-seeking junior developer to genuinely understand projects
they built with heavy AI assistance, so they can explain them in interviews. This
page has **two stacked panels** over one imported repo — design **both**, always
shown together:

- **Part A — the coach's own AI usage.** Every AI call the coach itself made on
  this repo (generating learning units, grading, interview Q&A, résumé bullets),
  shown honestly: model, token counts, an **estimated** cost (from a dated price
  table — always labelled "est."), latency, a success/failure outcome, and a
  lightweight quality check (passed/failed) per call.
- **Part B — this repo's observability story.** Whether the *imported* repo is an
  LLM app, what observability/eval tooling it has or lacks, and a beginner-first
  teaching of the three concepts — **tracing, failures, evals** — so the user can
  answer "how would you monitor and evaluate this in production?" in an interview.

**Critical: a `kind` discriminator picks the top-level shape.**
`"observability"` → render the header + Part A + Part B. `"no-snapshot"` → render
the not-found state ("This repository isn't imported yet" + an Import link).

### Header (always)

`{owner}/{repo}` as the page title (`<h1>`), the git `ref` as a small badge, a
one-line subtitle "How the coach used AI on this repo — and how this repo itself
is instrumented.", and a quiet real-text note
"Read-only · local snapshot · no network · no API key". A small "Re-import to
refresh" text link sits in the header.

### Part A — "What the coach's AI calls cost (on this repo)"

1. **Per-call summary cards** — one card per logical call name (`traceName`),
   e.g. `m10.generate-qa` shown as "Interview Q&A generation". Each card:
   call count ("3 calls"); a quality line — either **"67% checks passed (2/3)"**
   or a muted **"not graded"** (these are different — design both); an
   **estimated** cost ("~$0.04 avg · ~$0.12 total", with an "est." marker and the
   price-table date in a tooltip); and average latency ("avg 4.2 s"). Convey
   pass/fail by text + icon, never color alone.
2. **Traces list** — newest first. Each row: the call name, the model
   (`claude-opus-4-8`), a compact token breakdown (in / out / cache-write /
   cache-read), the **estimated** cost, latency, the outcome as a calm chip
   (**"success"** or a failure kind like **"failed · llm error"**), and a
   relative start time. A disclosure ("Details") reveals the per-turn breakdown
   (one line per model turn) and the call's quality checks (each check name, a
   passed/failed icon+text, and a short reason when failed — never a stack trace).
3. **Part-A empty state** — when no calls have been traced: a calm panel "No coach
   calls traced yet for this repo." with a one-line note that traces appear after
   the coach runs a generate/grade/Q&A call here. NOT an error.

### Part B — "How observable is THIS repo?"

Design **two** shapes (a `kind` switch):

**B1 — LLM app detected (`kind: "llm-app"`):**

1. A teaching **headline** naming the real SDK(s), e.g. *"This repo is an LLM app
   built on the Anthropic SDK, called in 3 places — here's its observability
   story."*
2. A **detected-signals strip**: chips for the SDK(s) ("Anthropic SDK"), a
   call-site count + first path ("3 call sites · src/chat.ts"), any prompt assets
   ("prompts/system.prompt"), and existing tooling ("Langfuse detected" OR a muted
   "no tracing tooling found"). Each chip reveals its evidence/path on click.
3. Three **concept cards** — **Tracing**, **Failures**, **Evals**. Each card:
   a title, a one-paragraph **"What it is"**, a **"In this repo:"** line (what the
   repo has or lacks for that concept), a **"In production you'd add:"** line (the
   gap), and an **"In an interview:"** line (how to talk about it). These cards
   are the heart of the page.
4. A **"Why this matters in an interview"** panel — a short bulleted list.

**B2 — no LLM app detected (`kind: "absent"`):** a calm, full-width educational
panel (NOT an error, no red, no warning iconography): heading "No LLM app detected
here"; a friendly paragraph on what observability is and why it matters; a quiet
"We looked for: AI SDK imports, model-call sites, prompt assets, tracing tooling"
line; and three short **primer** cards defining tracing / failures / evals
generically (no repo to anchor them) so the user still learns the vocabulary.

### no-snapshot state (`kind: "no-snapshot"`)

A simple centered panel: "This repository isn't imported yet.", a one-line
explanation, and a primary "Import this repository" link.

### Visual & tone

- Match a calm, content-first shadcn/ui product: generous spacing, a comfortable
  reading column, `Card`, `Badge`, `Separator`, `Table` (or a description list)
  for the traces, and a disclosure pattern (`Collapsible`/`Accordion`) for trace
  details and concept depth.
- **Cost is always an estimate** — every dollar figure carries an "est." marker;
  it is never presented as a bill.
- Light + dark mode. WCAG AA contrast. Status/outcome/pass-fail conveyed by text +
  icon, never color alone.

### Accessibility (must)

- One `<h1>` (the owner/repo title); Part A and Part B headings `<h2>`; concept
  card titles `<h3>` — never skip levels. Use `<main>`, real `<ul>/<li>` for the
  cards/list, and a real `<table>` (with header cells) or description list for the
  traces.
- Trace-detail and evidence disclosures are real `<button>`s with `aria-expanded`
  + `aria-controls`; reachable by keyboard, not hover-only.
- Outcome chips, pass/fail markers, and the "est." cost marker are real announced
  text. Any failure reason is real text — never an HTTP code or stack trace.
- Full keyboard operability, visible focus rings, DOM order = visual order
  (header → Part A → Part B).

### Mock data

Include one in-file sample object shaped like the page spec's
`ObservabilityResult` so the integrator can swap in `getObservability(owner,
repo)` unchanged. Provide enough to preview **every** state:

- a `"observability"` sample with **Part A** = ~3 aggregate cards (one "not
  graded", one with a sub-100% pass-rate) and ~5 traces spanning a `success`
  outcome, a failure outcome, cache tokens, and a failed eval with a reason; and
  **Part B** = a `"llm-app"` story (Anthropic SDK, 3 call sites, one prompt asset,
  no existing tooling) with the three concept cards + professional-value bullets;
- a second `"observability"` sample with **Part A empty** (`traces: []`,
  `aggregates: []`) and **Part B absent** (`kind: "absent"`, the three primer
  cards) — the common freshly-imported-non-LLM-repo case;
- a `"no-snapshot"` sample.

Render from a typed object; do not fetch. Cost values are plain numbers rendered
with an "est." label and a price-table date.
