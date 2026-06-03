# Page Spec: Observability Page

Issue: #226 · Epic: `llm-observability` (M13) · PRD: `.claude/prds/llm-observability.md` (US-1, US-2, US-3, US-4; FR-1…FR-9)

This spec defines the **Observability Page** for Milestone 13 — the single new
user-facing surface introduced by `llm-observability`. It is the input to the
Claude Design prompt (`docs/design/ui-prompts/observability-page.md`) and to the
integration task **#227**. It must be human-reviewed before the prompt is run.

(UI tool: **Claude Design** — see ADR 0007. Page Spec → prompt under
`docs/design/ui-prompts/` → Claude Design draft → integration notes under
`docs/design/ui-integration-notes/`. v0 is **not** used.)

The page shares layout, components, and tone with the M2–M12 surfaces
(Catalog/Registry/Recommendation, Stack, Project Map, Issue Learning Workspace,
Diff Review, Challenge, Portfolio, Delivery) so the whole app reads as one product.

> **Two panels, one route — both always shown.** Unlike the M12 Delivery page
> (which renders *either* a map *or* a degradation state), the Observability page
> renders **two complementary panels together** for an imported repo:
> **Part A** (the coach's *own* AI usage on this repo — traces + evals + cost) and
> **Part B** (the *user's* repo observability story + teaching). Either panel can
> be in its own empty/absent resting state; the page still renders the other.

> **No network, no API key at view time (ADR 0009 / PRD US-4 NFR).** The page
> reads only the local SQLite catalog: the `llm_traces` + `llm_evals` recorded
> earlier **when the bounded calls ran**, and the Part-B analysis derived on-read
> from `repo_files`. Opening the URL with `GITHUB_TOKEN` and `ANTHROPIC_API_KEY`
> unset must succeed — Part-B teaching is **deterministic, no LLM** (epic AD-5),
> and the observability layer issues **no** SDK call of its own.

> **Honest about estimates (ADR 0005 — "AI-generated, said plainly").** Cost is a
> **dated estimate** from a static per-model price table (epic AD-4), never billed
> truth. Every cost figure carries an "estimated" label and the price-table date.

---

## 1. Page name

**Observability Page** — a per-repository page at `/observability/[owner]/[repo]`
with two halves over one local-first data model. **Part A** makes the coach's own
AI usage transparent: for each bounded SDK call the product ran against this repo
(M7 generate/grade, M9 generate/grade, M10 Q&A / résumé bullets), a **trace**
(model, tokens, estimated cost, latency, outcome) and a lightweight **eval**
(its integrity check, passed/failed). **Part B** detects whether the *imported*
repo is an LLM app and **teaches** its observability story — what tracing / cost /
eval instrumentation it has or lacks — so the user can answer "how would you
monitor and evaluate this in production?" in an interview.

## 2. User goal

> "I imported a repo. Show me — honestly and locally — what the coach's own AI
> calls on it cost and how reliable they were (Part A). And if my repo is an LLM
> app, tell me what observability it has and what a production setup would add,
> and teach me the concepts, so I can answer 'how would you monitor and evaluate
> this?' in an interview (Part B)."

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, 0–1 years, one or two AI-built portfolio projects she cannot
confidently defend. She vibe-coded an LLM app but never instrumented it and can't
describe its observability/eval story — a common gap for AI-app interview
questions. This page builds that literacy against her *real* repo, and models AI
transparency by showing the coach's own usage plainly.

Design implications:

- **Two resting states are first-class, not errors.** "No coach calls traced
  yet" (Part A empty) and "No LLM app detected here" (Part B absent) are calm,
  educational states — never failures.
- **Concept literacy over jargon.** Part-B teaching names the three concepts a
  junior dev should speak to — **tracing, failures, evals** — each tied to what
  *this* repo has or lacks, parameterized with the real SDK/call-site findings,
  never generic boilerplate.
- **Honest about estimates.** Every cost is a dated **estimate**; the eval is a
  reused integrity check, not an LLM judge — both said plainly.
- **Local-first, said plainly.** Viewing needs no token and no network; a small
  header note says so.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the page shell.

| Route | Purpose | File |
|---|---|---|
| `/observability/[owner]/[repo]` | The Observability Page for one imported repo's snapshot | `apps/web/app/observability/[owner]/[repo]/page.tsx` |

- **Route convention (epic AD-7).** One page per repo, mirroring the shipped
  per-repo pages (`/portfolio/[owner]/[repo]`, `/delivery/[owner]/[repo]`). A
  global cross-repo trace dashboard is a deferred follow-up — **not** this page.
- `[owner]` / `[repo]` come from the M11 snapshot identity; the page reads the
  **current snapshot** for that repo (ref handling matches the M6/M7/M10/M12
  convention). **No new GitHub access path.**
- A route-level **`loading.tsx`** (the local SQLite reads) and **`error.tsx`**
  (render-time failures only). A **`not-found.tsx`** covers "owner/repo isn't
  imported" — surfaced by the data layer's `no-snapshot` result (§11). There are
  **no per-trace sub-routes** — the whole view renders on this one route.

## 5. Data source / contract

The page is a **thin server-side view** over the typed M13 data-access layer
(`@workspace/db/observability` → `getObservability`, task **#225**). No
client-side fetching, no API route — Server Components call the data layer
directly (ADR 0006). There are **no Server Actions and no mutations** on this
page — it is read-only.

```ts
// M13 — the single read. Composes Part A (traces+evals+aggregates over
// llm_traces / llm_evals filtered by snapshotId) and Part B (analyzeObservability
// over repo_files → buildObservabilityTeaching). Offline: no network, no SDK.
getObservability(
  owner: string,
  repo: string,
  ref?: string,
  options?: { ref?: string; db?: CatalogDb },
): Promise<ObservabilityResult>
```

`getObservability` **never returns null and never throws** — it returns either a
populated `observability` result or the `no-snapshot` state, both of which the
page renders. (The `no-snapshot` case is the not-found/"import this repo first"
state, §11 — there is no separate `getImportedRepo` call needed.)

### `ObservabilityResult` — the M13 read contract

The exact TypeScript ships in `packages/db/src/observability` (tasks **#219**,
**#221**, **#223**, **#225**); if the merged code differs at integration time the
merged code is authoritative, but the *shape* below is fixed by the epic and must
not change without updating this spec.

```ts
type ObservabilityResult = Observability | ObservabilityNoSnapshot

interface Observability {
  kind: "observability"
  snapshotId: number
  partA: ObservabilityPartA   // the coach's own AI usage on this repo
  partB: ObservabilityPartB   // the user's repo observability story + teaching
}

interface ObservabilityNoSnapshot {
  kind: "no-snapshot"
  owner: string
  repo: string
  ref?: string                // the requested ref, if any
}
```

#### Part A (#225 / #219) — the coach's own AI usage

```ts
interface ObservabilityPartA {
  traces: TraceWithEvals[]          // every recorded trace for the snapshot
  aggregates: TraceNameAggregate[]  // per-traceName rollups, ordered by name
}

interface TraceWithEvals {
  trace: LlmTrace
  evals: LlmEval[]                  // [] when the trace was never graded
}

interface TraceNameAggregate {
  traceName: string                // e.g. "m10.generate-qa"
  callCount: number
  evalCount: number
  evalPassCount: number
  evalPassRate: number | null      // null = nothing graded (≠ 0% passed)
  totalCostUsd: number
  averageCostUsd: number
  totalLatencyMs: number
  averageLatencyMs: number
}

// schema (#219)
interface LlmTrace {
  id: number; name: string; snapshotId: number | null; model: string
  inputTokens: number; outputTokens: number
  cacheCreationTokens: number; cacheReadTokens: number
  estimatedCostUsd: number; latencyMs: number
  outcome: string                  // "success" or a failure kind (free text)
  startedAt: Date; observations: LlmObservation[]   // per-complete()-turn JSON
  createdAt: Date; updatedAt: Date
}
interface LlmObservation {
  model: string; inputTokens: number; outputTokens: number
  cacheCreationTokens: number; cacheReadTokens: number
  latencyMs: number; outcome: string
}
interface LlmEval {
  id: number; traceId: number; check: string
  passed: boolean; reason: string | null
  createdAt: Date; updatedAt: Date
}
```

#### Part B (#221 / #223) — the repo observability story + teaching

```ts
interface ObservabilityPartB {
  story: ObservabilityStory              // #221 — pure detection
  teaching: ObservabilityTeachingResult  // #223 — deterministic teaching
}

// #221 — detection
type ObservabilityStory = LlmAppStory | NoLlmApp
interface LlmAppStory {
  kind: "llm-app"
  sdks: { name: string; evidence: string }[]         // e.g. "Anthropic SDK"
  callSites: { path: string; pattern: string }[]     // e.g. ".messages.create"
  promptAssets: { path: string; reason: string }[]
  existingTooling: { name: string; evidence: string }[]  // e.g. "Langfuse"
}
interface NoLlmApp { kind: "absent"; searched: string[] }

// #223 — teaching (mirrors the detection discriminant)
type ObservabilityTeachingResult = ObservabilityTeaching | ObservabilityExplainer
interface ObservabilityTeaching {
  kind: "llm-app"
  headline: string
  concepts: ObservabilityConceptCard[]   // tracing, failures, evals
  professionalValue: string[]
}
interface ObservabilityConceptCard {
  concept: "tracing" | "failures" | "evals"
  title: string
  what: string            // beginner-first definition
  present: string         // what THIS repo has (parameterized from the story)
  production: string      // what a production setup would add (the gap)
  interviewAnswer: string // how to speak to it in an interview
}
interface ObservabilityExplainer {
  kind: "absent"
  title: string
  body: string                                   // calm explainer, not an error
  searched: string[]
  primer: { title: string; what: string }[]      // the 3 concepts, no repo anchor
}
```

> **Drift-watch (M8 retro lesson).** Integration task #227 must diff the shipped
> types in `packages/db/src/observability` against the shapes above before
> binding, and record any drift in
> `docs/design/ui-integration-notes/observability-page.md`.

## 6. Page sections

For an imported repo (`kind === "observability"`) the page renders the header
(§6a), then **Part A** (§6b) and **Part B** (§6c) as two stacked panels — both
always present, each with its own empty/absent resting state. When the repo
isn't imported (`kind === "no-snapshot"`) the page is the not-found state (§11).

### 6a. Page header (always)

- `{owner}/{repo}` as the `<h1>` title with the imported `ref` as a `Badge`.
- A one-line description: "How the coach used AI on this repo — and how this repo
  itself is instrumented."
- A small, honest **"Read-only · local snapshot · no network · no API key"** note
  (real text, not icon-only) — on-thesis with ADR 0009.
- A "Re-import to refresh" link to `/import` (M11 reuse) — the page never mutates.

### 6b. Part A — the coach's own AI usage (`partA`)

Heading: "What the coach's AI calls cost (on this repo)". A one-line framing:
"Every AI call the coach made on this repo, with model, tokens, an **estimated**
cost, latency, and whether its quality check passed."

1. **Per-call summary cards** — one card per `aggregates[]` entry (`traceName`):
   - the `traceName` (e.g. `m10.generate-qa`) with a plain-language label
     ("Interview Q&A generation"),
   - `callCount` ("3 calls"),
   - eval pass-rate: `evalPassRate === null` → muted **"not graded"**; else
     **"{round(rate·100)}% checks passed"** with `evalPassCount`/`evalCount`,
   - `averageCostUsd` + `totalCostUsd` — each with an **"est."** marker and the
     price-table date in a tooltip/footnote,
   - `averageLatencyMs` ("avg 4.2 s").
   Convey pass/fail by **text + icon**, never color alone.
2. **Traces list** — `partA.traces[]`, newest first (`startedAt`): each row shows
   `name`, `model`, a compact token breakdown (in / out / cache-write / cache-read
   from the trace), the **estimated** cost, `latencyMs`, the typed `outcome`
   (`success` or a failure kind as a calm chip), and `startedAt`. A disclosure
   reveals the per-turn `observations` (one line per `complete()` turn) and the
   trace's **evals** (`evals[]`: each `check`, passed/failed icon+text, and
   `reason` when failed — beginner-safe, never a raw stack trace).
3. **Empty state (Part A)** — `partA.traces` and `partA.aggregates` both `[]`:
   a calm panel "No coach calls traced yet for this repo." with a one-line
   explainer that traces appear here after the coach runs a generate/grade/Q&A
   call on this repo. **Not** an error (§10).

### 6c. Part B — this repo's observability story (`partB`)

Heading: "How observable is THIS repo?". Renders one of two shapes by
`partB.story.kind` / `partB.teaching.kind`:

#### 6c-i. LLM app detected (`kind === "llm-app"`)

1. **Teaching headline** — `teaching.headline` (a one-line summary naming the
   real SDK(s)).
2. **Detected-signals strip** — from `story`: the `sdks` (e.g. "Anthropic SDK"),
   a `callSites` count + first path ("called in 3 places, starting at
   `src/chat.ts`"), `promptAssets` when present, and `existingTooling` ("Langfuse
   detected" / "no tracing tooling found"). Text + icon, never color alone; each
   chip cites its `evidence`/`path` on disclosure.
3. **Concept cards** — `teaching.concepts[]`, one per concept
   (**tracing · failures · evals**): `title`, `what` (definition), **"In this
   repo:"** `present`, **"In production you'd add:"** `production`, and an
   **"In an interview:"** `interviewAnswer`. These are the heart of the page.
4. **Professional-value panel** — `teaching.professionalValue` as a short bulleted
   list under "Why this matters in an interview".

#### 6c-ii. No LLM app detected (`kind === "absent"`, US-3)

A calm, full-width educational panel — **not** an error:

- Heading: `teaching.title` ("No LLM app detected here").
- Body: `teaching.body` (what observability is and why it matters).
- A quiet "We looked for: {story.searched.join(', ')}" line.
- The `teaching.primer[]` cards (the three concepts defined generically, with no
  repo to anchor them) so the user still learns the vocabulary.

## 7. Input fields

The page has **no input fields** — no search, filter, sort, or free text. The
trace/observation disclosures and the Part-B concept cards are read-only
progressive disclosure.

## 8. Primary actions

**None that mutate.** The page is read-only (traces were recorded when the
bounded calls ran; Part B is derived on read). The only navigations are: the
header "Re-import to refresh" → `/import`, and (no-snapshot state) the
"Import this repository" → `/import`. There is no Server Action on this page.

## 9. Loading state

While the server read runs (`getObservability`), render a skeleton via
`loading.tsx`: a header bar, a row of summary-card silhouettes (Part A), a few
trace-row placeholders, and two concept-card silhouettes (Part B). Use shadcn
`Skeleton`; the source is local SQLite so loading is brief, but the state must
exist so the page never flashes empty. The page **never** shows a network/LLM
in-progress state — nothing async to GitHub or Anthropic happens at view.

## 10. Empty state

- **Part A empty** — `partA.traces === []` and `aggregates === []`: the "No coach
  calls traced yet" panel (§6b.3). Part B still renders. Calm, not a failure.
- **Part B absent** — `partB.story.kind === "absent"`: the educational explainer
  (§6c-ii). Part A still renders. The common case for a non-LLM repo; calm.
- **Both empty/absent** — a freshly imported non-LLM repo with no coach calls:
  both resting panels render; the page is still a coherent, calm, educational
  surface (Part A "nothing traced yet" + Part B "no LLM app detected").

## 11. Error state

Expected failures are in-page states or full-page panels — never raw stack
traces or DB errors:

- **`not-found` — repo not imported** — `getObservability` returns
  `kind: "no-snapshot"`. Call `notFound()` and render `not-found.tsx`: heading
  "This repository isn't imported yet.", a short explanation, and an "Import this
  repository" link to `/import`.
- **`load-failure`** — the data layer throws (unexpected). `error.tsx` renders a
  friendly full-page error: "Couldn't load observability", a short explanation,
  and a "Try again" button (`reset()`). No raw stack trace.
- **Per-trace failure outcome** — a trace whose `outcome` is a failure kind is
  rendered as a **calm chip on that trace** (e.g. "failed · llm error"), never as
  a page-level error. The list still renders.
- **Defensive unresolved field** — the page renders any unexpected/empty field as
  plain text rather than crashing.

`not-found` (expected: unknown owner/repo) and `load-failure` (unexpected: data
layer failed) are deliberately separate states with different copy. A Part-A
empty state and a Part-B `absent` state are **not** errors — they are §10.

## 12. Success state

- **Imported repo** (`kind: "observability"`): header + Part A (summary cards +
  traces list, or its empty panel) + Part B (concept cards + signals, or its
  absent explainer). Every field of `ObservabilityPartA` / `ObservabilityPartB`
  has a home in the layout. Cost figures are labelled estimates; eval pass-rates
  distinguish "not graded" from "0% passed".
- **Not imported** (`kind: "no-snapshot"`): the not-found state (§11).
- Success is implicit — the rendered panels *are* the answer; there is no
  confirmation banner.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (the `owner/repo` title). Part A and
  Part B panel headings are `<h2>`; within Part B, each concept card title is
  `<h3>` — heading order descends without skipping; content sits inside `<main>`.
- **Lists & cards.** The summary cards and the traces list use real list markup
  (`<ul>/<li>`); the traces list is a table or description list with header cells
  so a screen reader conveys column meaning. Indentation/spacing is never the only
  cue.
- **Disclosures.** Each trace's observations/evals disclosure and any signal
  "evidence" disclosure is a real `<button>` with `aria-expanded` + `aria-controls`;
  reachable by keyboard, not hover-only.
- **Status & outcome chips.** Eval passed/failed, trace `outcome`, and Part-B
  signal chips ("Langfuse detected", "no tracing tooling") convey meaning by
  **text + icon**, never color alone. `reason` and `failureReason` are real
  announced text — never a raw HTTP code or stack trace.
- **Cost honesty.** The "est." marker and price-table date are real text
  associated with each cost figure (not a color/opacity cue alone).
- **Reading order.** DOM order = visual order: header → Part A → Part B. Logical
  top-to-bottom.
- **Color & contrast.** WCAG 2.1 AA in light and dark themes (`next-themes`).
- **Keyboard.** Full keyboard operability in logical order: disclosures, the
  "Re-import" link, and (no-snapshot) the Import link. Enter/Space activate;
  visible focus ring.
- **Loading.** Skeletons are `aria-hidden`; the loading region carries
  `aria-busy="true"`.

## 14. Acceptance criteria

- [ ] `/observability/[owner]/[repo]` renders server-side from `getObservability`
      (M13 DAL) — no client fetch, no API route (ADR 0006).
- [ ] **Viewing requires no `GITHUB_TOKEN`, no `ANTHROPIC_API_KEY`, and no live
      network** (ADR 0009). Traces/evals come from `llm_traces` / `llm_evals`
      recorded when the bounded calls ran; Part-B teaching is deterministic (no
      LLM). Opening the URL with both keys unset renders the page.
- [ ] **Part A** renders the per-`traceName` aggregate cards (count, eval
      pass-rate with "not graded" vs "0%", **estimated** cost, avg latency) and a
      traces list (model, tokens, est. cost, latency, outcome, started-at) with a
      disclosure for per-turn observations + the trace's evals.
- [ ] **Cost is labelled an estimate** with the price-table date (epic AD-4) —
      never presented as billed truth.
- [ ] **Part A empty** (`traces === []`) renders the calm "no calls traced yet"
      panel, not an error; Part B still renders.
- [ ] **Part B (llm-app)** renders the teaching headline, the detected signals
      (real SDK(s) + call-site count/path + tooling), and the three concept cards
      (tracing / failures / evals — each with what / present / production /
      interview answer) + the professional-value panel — parameterized from the
      real story, never generic boilerplate.
- [ ] **Part B (absent)** renders the calm educational explainer (title, body,
      `searched`, the three primer cards) — not an error (US-3).
- [ ] The page binds to the **real TypeScript shapes** in §5
      (`ObservabilityPartA`, `TraceWithEvals`, `TraceNameAggregate`, `LlmTrace`,
      `LlmEval`, `ObservabilityStory`, `ObservabilityTeachingResult`) from
      `packages/db/src/observability` (#219/#221/#223/#225).
- [ ] **Drift-watch (§5).** Integration task #227 diffs the shipped types against
      the §5 shapes before binding and records any drift in
      `docs/design/ui-integration-notes/observability-page.md`.
- [ ] **Read-only.** No Server Actions, no mutations; the only navigations are
      Re-import (`/import`) and the no-snapshot Import link.
- [ ] **Empty / loading / error** states per §9–§11: skeleton on load; Part-A
      empty and Part-B absent are calm resting states (not errors); `no-snapshot`
      → `not-found.tsx` ("Import this repository" → `/import`); `load-failure` →
      `error.tsx` ("Try again"); no raw stack traces / HTTP codes.
- [ ] The page reads as one product with the M2–M12 surfaces — shared layout,
      spacing, calm, content-first tone.
- [ ] **Claude Design (ADR 0007)** is the UI generation tool; v0 is not used.
      This spec is human-reviewed before the prompt
      (`docs/design/ui-prompts/observability-page.md`) is run.
- [ ] Uses **only** `packages/ui` (shadcn/ui) components.
- [ ] Accessibility notes in §13 are satisfied (one `<h1>`, ordered headings,
      list/table semantics, keyboard-reachable disclosures, text-not-color status,
      labelled cost estimates, AA contrast).
