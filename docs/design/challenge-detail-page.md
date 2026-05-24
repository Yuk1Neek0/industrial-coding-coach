# Page Spec: Challenge Detail

Issue: #145 · Epic: `debug-expansion-challenge` (M9) · PRD: `.claude/prds/debug-expansion-challenge.md` (FR-1, FR-3, FR-4, FR-5, FR-10; R2, R5, R8)

This spec defines the **Challenge Detail** page for Milestone 9. It is the
input to the Claude Design prompt (`docs/design/ui-prompts/challenge-detail-page.md`)
and to the M9 UI integration task (#148). It must be human-reviewed before the
prompt is run. (UI tool: Claude Design — see ADR 0007. v0 is **not** used.)

The Challenge Detail page is the **top-level page** of three of the four M9 UI
pieces. Its two siblings are nested inside it: the **Debug Walkthrough UI**
(`docs/design/debug-walkthrough-ui.md`, task #146) — the answer-entry form — and
the **Completion Review UI** (`docs/design/completion-review-ui.md`, task #147)
— the graded outcome. The fourth M9 UI, the **Challenge List Page**
(`docs/design/challenge-list-page.md`, task #144), is the index that links here.
All four share layout, components, and tone with the M2/M3/M4 Catalog/Registry/
Recommendation pages and the M8 Diff Review page so the whole app reads as one
product.

> **R5 — most-recent attempt primary, prior attempts inline (collapsible).**
> This is the one bit that distinguishes M9's Detail page from a stock
> list-detail view. The Detail page is the **single host** for the answer-and-
> score loop and the attempt history. **Prior attempts are not on a separate
> page.**

---

## 1. Page name

**Challenge Detail** — a single-route page (`/repos/[owner]/[repo]/challenges/[challengeId]`)
showing one project-tied debug/expansion challenge generated for the user's
imported repository: the challenge type, plain-language task description,
in-scope and out-of-scope file/module sets, acceptance criteria, the answer-
entry form (Debug Walkthrough), the most-recent graded outcome (Completion
Review), and prior attempts inline below — collapsible — so the user can
self-review their progression on the challenge.

## 2. User goal

> "An AI helped me build this project and I want an honest, project-tied check
> that I understand it. Give me one realistic task on *my* repo — name the
> files I'd touch, the files I should leave alone, and what 'done' looks like.
> Let me explain my approach, grade my explanation against my actual repo, and
> let me see how my answer improved across attempts."

The user opens a challenge of a given type, reads what is being asked grounded
in the real files of their repository, writes a short explanation (plus
optional snippets) in the embedded Debug Walkthrough, and sees the graded
outcome — 0–100 score plus weak-area breakdown — in the embedded Completion
Review. Prior attempts are listed below the most-recent one, collapsed, with
timestamps; the user can expand any of them to read the past explanation and
its grade.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She has
one or two AI-built portfolio projects she cannot confidently defend. She can
prompt an AI tool, run `pnpm`, and push to GitHub, but cannot honestly say
which files she would change to add a small field, or where to start when a
request fails.

Design implications:

- **Project-tied, never generic.** Every file/module reference on the page is
  a real path from the M6 project map (PRD R8 / FR-3). A generic-looking task
  would be a product failure (PRD NFR "project-grounded, never generic").
- **In/out-of-scope is normative.** Mia learns *which files own this concern*
  and *which files do not* — that boundary is the actionable answer to "where
  do I start?". The page surfaces both sets, not just the in-scope set.
- **Plain about what is being graded.** Mia is asked to **explain** what she
  would change and why; she is **not** asked to submit working code, and the
  optional snippets are not graded for style or plausibility (PRD FR-7 / R3).
  The page says this in plain language.
- **Comprehension across attempts.** R5 is the M9 self-review affordance: by
  putting prior attempts inline (collapsed) below the most-recent one, Mia
  can see her progression on this challenge without leaving the page.
- **Honest about AI.** The challenge and the grading are AI-generated. The
  page carries a small, honest label saying so — on-thesis with ADR 0005.
- **No accounts, no setup.** A challenge is reachable by its URL. The
  imported repo, its project map, and the generated challenges come from M6,
  M9, and M11.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the page shell; a
Client Component island for the answer-entry form (the embedded Debug
Walkthrough UI — see §6e and the `debug-walkthrough-ui.md` spec) and for the
prior-attempts panel's expand/collapse (see §6h).

| Route | Purpose | File |
|---|---|---|
| `/repos/[owner]/[repo]/challenges/[challengeId]` | One generated challenge on an imported repo, with the answer-and-score loop and prior-attempt history | `apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/page.tsx` |

- `owner` and `repo` identify the imported repository snapshot (M11). The
  upstream Challenge List page (`/repos/[owner]/[repo]/challenges`) links here.
- `challengeId` is the primary key of the `challenges` row (M9 schema, task
  #140), keyed internally by snapshot (`owner/repo` + ref) + challenge type.
  It is the URL key.
- A loading UI (`loading.tsx`) and a not-found UI (`not-found.tsx`) accompany
  the route; an error boundary (`error.tsx`) covers it.
- The page is linkable and bookmarkable — a challenge can be revisited; a
  returning user with attempts already stored sees the most-recent graded
  outcome and the prior-attempt list, not a blank form (§6e / §6g / §12).

### 4a. Hosting decision — Debug Walkthrough UI and Completion Review UI live **inline on this page**

The PRD (FR-10) and the epic (Architecture Decisions, Frontend Components)
leave open whether the Debug Walkthrough UI (#146) and the Completion Review
UI (#147) sit inline on the Detail page or on a sub-route. **This spec
resolves that question: both are embedded inline on
`/repos/[owner]/[repo]/challenges/[challengeId]`.** There are no separate
`/walkthrough` or `/review` sub-routes.

Rationale:

- **R5 lives on one page.** R5 (most-recent attempt primary, prior attempts
  inline collapsible) puts the most-recent attempt — i.e. the Completion
  Review output — on the Detail page. Adding a separate sub-route for the
  Review would split R5's "all of it inline" affordance across two URLs.
- **The answer-and-score loop is one loop.** Writing the explanation
  (Walkthrough) and reading the grade (Review) are two phases of the same
  user action; M8's Diff Review applies the same pattern (Understanding Check
  + Score/Weak Area embedded in `/reviews/[id]`).
- **Single source of truth for the challenge context.** The challenge type,
  task description, and in/out-of-scope sets must be visible while the user
  writes the explanation; embedding the Walkthrough avoids cross-route
  context fetching and avoids duplicating that context in a sub-route shell.
- **Consistency with M8.** M8's `/reviews/[id]` embeds four sibling pieces in
  one route. M9 follows the same shape with three sibling pieces — Debug
  Walkthrough, Completion Review, and the prior-attempts panel — inline on
  one Detail route. The two milestones read as one product.

**Implication for #146 and #147.** The Debug Walkthrough UI (#146) and the
Completion Review UI (#147) are **components**, not standalone routes — their
specs need only declare their props contract, their rendering, and their
states; they do not redefine the host route, `loading.tsx`, `error.tsx`, or
`not-found.tsx`. This page owns those. The Debug Walkthrough is a Client
Component island whose submit goes through a server action (`submitAttempt`,
§5); the Completion Review is a server-rendered presentation component over
the most-recent attempt's `grading` field.

## 5. Data source / contract

The page is a **thin server-side view** over the typed M9 data-access layer
(`@workspace/db`, task #140). No client-side fetching, no API route — Server
Components call the data layer directly (ADR 0006). The answer-entry form
posts through a server action (see §6e and the Debug Walkthrough UI spec).

```ts
// M9 — the generated challenge (lazy per type, cached per snapshot — R2 / FR-1)
getChallengeById(challengeId: string): Promise<Challenge | null>

// M9 — the user's attempt history on this challenge (most-recent first)
getChallengeAttempts(challengeId: string): Promise<ChallengeAttempt[]>

// M9 — the user's most-recent attempt's graded outcome (may be null — no attempts yet)
getLatestOutcome(challengeId: string): Promise<ChallengeAttempt | null>

// M9 — re-invoke the generation call for the same challenge type (R2 / FR-1)
// Triggered by the "New challenge" action in §6c; produces a new Challenge row.
regenerateChallenge(input: { owner: string; repo: string; type: ChallengeType }):
  Promise<Challenge>

// M9 — submit an attempt; invoked server-side from the Debug Walkthrough form (§6e)
// Persists the attempt, runs the bounded grading call (FR-5), persists the grade,
// and returns the updated attempt (with `grading` populated).
submitAttempt(challengeId: string, input: AttemptInput):
  Promise<ChallengeAttempt>
```

`getChallengeById` returns `null` when no row matches — the page treats `null`
as not-found (§11). `getChallengeAttempts` returns an empty array when the
user has not yet attempted the challenge (§10).

### `Challenge` record shape — the M9 typed challenge contract (PRD FR-3, R8)

This is the **typed challenge contract** the page renders and that integration
task #148 must satisfy. The exact TypeScript lives in `packages/db` (the
schema is task #140, the generation call is task #142); if the field names
below differ from the merged code at integration time, the merged code is
authoritative — but the *shape* is fixed by PRD FR-3 and must not change
without updating this spec.

| Field | Type | Used by |
|---|---|---|
| `id` | `string` | URL key |
| `repo` | `{ owner: string; name: string; ref: string }` | §6 header — which repository (M11 snapshot) |
| `type` | `ChallengeType` | §6 header — which challenge type |
| `taskDescription` | `string` | §6b — the plain-language task |
| `inScope` | `FileOrModuleRef[]` | §6d — the in-scope file/module set (R8) |
| `outOfScope` | `FileOrModuleRef[]` | §6d — the out-of-scope file/module set (R8) |
| `acceptanceCriteria` | `string[]` | §6e — what "done" looks like for the grader |
| `sourceRefs` | `ProjectMapRef[]` | §6f — source references into the M6 project map |
| `createdAt` / `updatedAt` | `Date` | §6 header — "generated on" |

`ChallengeType` (PRD FR-2):

```ts
type ChallengeType =
  | "add-small-field"
  | "trace-failed-api-call"
  | "fix-schema-mismatch"
  | "add-loading-or-error-state"
  | "add-unit-test"
  | "explain-broken-ci-result"
  | "extend-one-module-safely";
```

The page renders the type via a calm human-readable label
("Add a small field", "Trace a failed API call", …) — not the raw enum value.

`FileOrModuleRef` — a single in-scope or out-of-scope entry:

| Field | Type | Use |
|---|---|---|
| `kind` | `"file" \| "module"` | distinguishes a file path from a logical module (e.g. "the auth route handler") |
| `path` | `string` | real snapshot path (when `kind === "file"`) — monospace in the UI |
| `label` | `string` | display label for a module, or the basename for a file |
| `note` | `string \| null` | optional one-line "why this is in scope" / "why this is out of scope" |

`ProjectMapRef` — a back-pointer into the M6 project map for traceability:

| Field | Type | Use |
|---|---|---|
| `section` | `"architecture" \| "key-files" \| "request-flow" \| "data-flow" \| "state-flow" \| "ai-call-flow" \| "debug-path"` | which M6 pipeline output this comes from |
| `anchor` | `string` | a stable section anchor / id within that output |
| `label` | `string` | display label, e.g. "Login request flow" |

`AttemptInput` — what the Debug Walkthrough form posts:

| Field | Type | Use |
|---|---|---|
| `explanation` | `string` | the user's free-text explanation (FR-4); **the graded field** (FR-7 / R3) |
| `snippets` | `{ path: string; code: string }[]` | optional per-file snippets keyed to M6-map paths; illustrative only — not graded (FR-7 / R3) |
| `filePaths` | `string[]` | the file paths the user said they would change (FR-4) |

`ChallengeAttempt` — one stored attempt (PRD FR-4 + FR-5):

| Field | Type | Use |
|---|---|---|
| `id` | `string` | identifies the attempt within its challenge |
| `challengeId` | `string` | FK back to `Challenge` |
| `explanation` | `string` | echoed in the Walkthrough / prior-attempt entry |
| `snippets` | `{ path: string; code: string }[]` | echoed in the prior-attempt entry; illustrative |
| `filePaths` | `string[]` | the file paths the user said they would change |
| `submittedAt` | `Date` | shown as the attempt timestamp in the prior-attempts panel |
| `grading` | `GradingResult \| null` | the M9 grading output; `null` only mid-flight, transient |

`GradingResult` is the **M8-shape grading output** (PRD R4 / FR-5) — the same
0–100 numeric score plus weak-area breakdown that M8 produces. The full shape
is defined in `docs/design/score-weak-area.md` §5; M9 reuses it. The summary
used by this page:

| Field | Type | Use |
|---|---|---|
| `score` | `number` | 0–100 numeric score (FR-5 / R4) |
| `scoreLabel` | `string` | calm band label, e.g. "Solid grasp", "Getting there", "Needs review" |
| `summary` | `string` | one-or-two-sentence plain-language overall feedback |
| `criterionGrades` | `CriterionGrade[]` | per-acceptance-criterion result |
| `weakAreas` | `WeakArea[]` | the topics the user should revisit (M8-shape) |
| `gradedAt` | `Date` | when grading ran |

`CriterionGrade` mirrors M8's per-question grade, one per
`Challenge.acceptanceCriteria` entry:

| Field | Type | Use |
|---|---|---|
| `criterion` | `string` | the acceptance-criterion text, echoed |
| `verdict` | `"met" \| "partial" \| "missed"` | calm outcome badge |
| `feedback` | `string` | plain-language feedback on this criterion |

`WeakArea` — same as M8 (`docs/design/score-weak-area.md` §5): `{ area,
explanation, suggestion, relatedCriteria: string[], fileRefs: string[] }`.
Every `fileRefs` path resolves to a real snapshot path in the M6 project map
(PRD FR-6 / R8) — guaranteed by the integrity check (task #141). An
unresolved reference renders as plain text without an anchor — never a crash
(§11).

> **`attempts` may be empty; `grading` is populated on every saved attempt.**
> A freshly generated challenge has `attempts = []`. After the user submits
> via the Debug Walkthrough form (§6e), `submitAttempt` persists the attempt
> *and* its grading in the same flow — there is no "saved-but-ungraded"
> state. The page must render correctly when `attempts` is empty (the Debug
> Walkthrough form is active and the Completion Review section + prior-
> attempts panel are absent) and when it is non-empty (the most-recent
> attempt is shown as primary in the Completion Review, the Debug Walkthrough
> remains available to retry, and the prior-attempts panel lists any earlier
> attempts collapsed — §6e / §6g / §6h).

The challenge is guaranteed project-grounded: every `inScope` / `outOfScope`
file path, every `sourceRefs` entry, every `criterionGrades` file reference,
and every `weakAreas.fileRefs` path resolves to a real path in the M6 project
map (the M9 integrity check, task #141). If a reference unexpectedly fails to
resolve, the page renders it as plain text and flags it quietly rather than
crashing.

## 6. Page sections

Top to bottom, single readable column (comfortable max width):

1. **Back link** — "← Back to challenges" (to the M9 Challenge List page at
   `/repos/[owner]/[repo]/challenges`, task #144).
2. **Challenge header** — the human-readable challenge type as an `<h1>`
   (e.g. "Add a small field"); a muted line `{repo.owner}/{repo.name} ·
   ref {repo.ref}` with an optional "View repository on GitHub →" external
   link (new tab, `rel="noopener noreferrer"`); a muted "Generated
   {createdAt}" line. A small, honest **"AI-generated challenge"** label
   sits in the header — real text, not an icon-only signal (ADR 0005, §13).
3. **In-page section nav (optional)** — for a long challenge, a compact set
   of anchor links — "Task", "New challenge", "Scope", "Acceptance",
   "Sources", "Walkthrough", "Result", "Prior attempts" — so the user can
   jump between sections. Optional; if omitted the page is still a clean
   single scroll.

### 6a. Honest framing line

A short calm line under the header, e.g. *"This challenge was generated from
your project map. The grader judges your **explanation** — your snippet, if
you add one, is illustrative and is not scored."* This makes FR-7 / R3
visible to the user before they write a single word.

### 6b. Task description

A clearly headed section — "What you're being asked to do" — rendering
`Challenge.taskDescription` as readable prose, generous spacing. Plain
language. References real files/modules from the user's repo (PRD US-2,
FR-1, FR-3). Carries the same "AI-generated" framing as the rest of the
page.

### 6c. "New challenge" action (R2 / FR-1)

A clearly labelled action button — **"New challenge of this type"** — in or
just under the header, e.g. as a header-bar control on the right of the
challenge title. Click invokes `regenerateChallenge({ owner, repo, type })`
(§5) and, on success, navigates to the new challenge's Detail page
(`/repos/[owner]/[repo]/challenges/[newChallengeId]`).

Behaviour:

- **R2 normative.** The action re-invokes the generation call for the same
  `type` and the same snapshot. It produces a *new* `Challenge` row with a
  fresh `challengeId`; it does **not** mutate the current challenge in
  place. The current challenge and its attempts remain accessible by URL.
- **Confirmation.** Because the action issues a bounded LLM call (a few
  seconds, cost), the button shows a confirmation dialog if the current
  challenge has at least one attempt — "Generate a new challenge of this
  type? Your current attempts will stay accessible by URL but won't appear
  on the new challenge." For an untouched challenge (no attempts), the
  click invokes the action directly without a dialog.
- **In-progress state.** While the generation call is running, the button
  shows a spinner and is disabled; on success the page navigates; on
  failure (no API key, rate limit, network) a quiet inline error appears
  next to the button — "Couldn't generate a new challenge. Try again." —
  and the user's current challenge stays fully visible. The error is
  handled at the action site, not as a page-level error (see §11).
- **Integration.** Task #148 wires this action's server action to task
  #142's generation pipeline. This spec only declares the action and the
  expected behaviour.

### 6d. Scope — in-scope and out-of-scope file/module sets (R8 / FR-3)

The heart of the project grounding. A clearly headed section — "Scope" —
rendered as **two side-by-side panels** on wide screens, stacked on mobile:

- **"In scope"** — a `<ul>` of `Challenge.inScope` entries. Each entry
  shows the `label` (or basename), the `path` (monospace) when
  `kind === "file"`, a `Badge` reading "file" or "module", and the
  optional `note` ("why this is in scope") as a one-line caption.
- **"Out of scope"** — a `<ul>` of `Challenge.outOfScope` entries, rendered
  the same way, with the panel visually distinct (a calmer / dimmer
  surface or a "do not touch" framing) so the user can tell the sets
  apart at a glance.

A short intro line frames the section: *"These are the files and modules
this challenge expects you to touch — and the ones you should leave alone.
All paths come from your project map."* (PRD R8 / FR-3 normative: both
sets are strictly limited to files/modules the M6 project map names; the
integrity check rejects anything outside that set.)

If `outOfScope` is empty, render an inline note in the panel — "No
explicit out-of-scope files for this challenge." — rather than omitting
the panel. If `inScope` is empty, that is unexpected and the page renders
a quiet inline flag (see §11) — a real challenge has at least one
in-scope entry.

### 6e. Acceptance criteria

A clearly headed section — "What 'done' looks like" — rendering
`Challenge.acceptanceCriteria` as a numbered `<ol>` of plain-language
criteria. These are the criteria the **grader** uses (PRD FR-5) — the page
says so in a short intro line: *"The grader checks your explanation against
these criteria."*

### 6f. Project-map sources

A clearly headed section — "Where this came from" — rendering
`Challenge.sourceRefs` as a `<ul>`. Each entry is a calm chip showing the
`section` (human-readable: "Architecture overview", "Key-file map",
"Request flow", "Data flow", "State flow", "AI-call flow", "Debug path")
and the `label`, optionally linkable to the corresponding section of the
M6 Project Map page (`/map/[owner]/[repo]`) via the `anchor`. This makes
the project-map grounding inspectable, on-thesis with the M6 / M9 R8 +
FR-6 traceability requirement.

If `sourceRefs` is empty, omit the section quietly rather than showing an
empty heading.

### 6g. Debug Walkthrough — answer-entry form (the embedded #146 piece)

The **Debug Walkthrough UI** — its own spec,
`docs/design/debug-walkthrough-ui.md` — embedded here as a headed section
("Walk through your answer"), rendering the answer-entry form over the
current `Challenge`. It is a Client Component island: it collects the
user's `explanation`, optional `snippets`, and `filePaths`, then submits
via the `submitAttempt` server action.

This page provides the slot, the `Challenge` data (so the form can
show the in-scope file paths as snippet path suggestions, per FR-4 keyed
to M6-map paths), and the server action. The full form behaviour — fields,
validation, in-progress state, error handling — is specified in the
sibling spec, **not redefined here**.

**Always visible.** The Walkthrough is available both for first-time
answer entry (when `attempts` is empty) and for a retry on a challenge
that already has attempts (PRD US-6 — the user can retry). It is **not**
hidden when prior attempts exist; submitting through it appends a new
attempt and rotates the most-recent attempt's role to the new submission.

### 6h. Completion Review — most-recent attempt (the embedded #147 piece) + prior attempts inline (R5)

The **Completion Review UI** — its own spec,
`docs/design/completion-review-ui.md` — embedded here as a headed section
("Your most recent attempt"), rendered **only when** `attempts.length > 0`
(the most-recent attempt is `attempts[0]`; see §5 sort order, most-recent
first). It renders the most-recent attempt's `grading` as the primary
outcome: the 0–100 score, the `scoreLabel`, the `summary`, the per-
acceptance-criterion result (`criterionGrades`), the weak-area breakdown
(`weakAreas`, M8-shape per R4), and the attempt's `submittedAt`
timestamp framed "Submitted {submittedAt}". A short feedback paragraph
sits with the score band, per FR-5.

> **R5 normative.** **The most-recent attempt is rendered as primary;
> prior attempts are rendered inline below it, collapsed by default, with
> timestamps. Expand/collapse is client-side. Prior attempts are not on a
> separate page.** This panel is the M9 self-review affordance — the user
> can read what they wrote and how they scored on past attempts without
> leaving `/repos/[owner]/[repo]/challenges/[challengeId]`.

**Inline collapsible prior-attempts panel — behaviour.** Below the
"Your most recent attempt" Completion Review:

- Render a sub-section "Prior attempts" *only when* `attempts.length > 1`
  (i.e. there is at least one attempt before the most-recent). If
  `attempts.length === 1`, omit this sub-section — the most-recent
  Completion Review *is* the only attempt.
- The "Prior attempts" sub-section is a `<ul>` of the prior attempts
  (`attempts.slice(1)`), in **most-recent-first** order — the
  second-most-recent attempt is the first item in the list.
- Each prior-attempt entry is a shadcn `Collapsible` (or `Accordion`
  item), **collapsed by default**, with a calm one-line summary row as
  the trigger and the full attempt content as the expanded panel.
  - **Trigger row (collapsed state)** shows: the attempt's `submittedAt`
    timestamp (e.g. "May 22, 2026 · 14:07"), the `grading.score` as a
    compact 0–100 chip, the `grading.scoreLabel` ("Solid grasp" / etc.),
    and a chevron/expand affordance. The trigger is a real `<button>`
    with `aria-expanded` (§13).
  - **Expanded panel** shows: the attempt's `explanation` as readable
    prose; the optional `snippets` rendered the same way the Debug
    Walkthrough renders them (monospace blocks per `path`, illustrative
    only — *not* re-graded by this view); the `filePaths` as a list of
    monospace chips; the `grading.summary` and the **weak-area
    breakdown** (`weakAreas`) rendered with the same Completion Review
    component used for the primary most-recent attempt (so the rendering
    is consistent; only the framing differs — "Prior attempt" vs "Your
    most recent attempt"). The per-criterion breakdown
    (`criterionGrades`) may be collapsed within the expanded panel for
    older attempts to keep the page scannable; the score, label, and
    weak-area summary are always visible inside the expanded panel.
- Expand / collapse is purely client-side (no server round-trip). State
  is local to the panel; it does not need to be persisted in the URL.
- The prior-attempts panel is rendered server-side with the full attempt
  data already loaded (`getChallengeAttempts`); there is no lazy fetch
  on expand. This keeps the page renderable as one server response and
  avoids per-attempt API routes.
- **Not on a separate page.** There is no `/attempts` sub-route, no
  `/attempts/[attemptId]` page. The whole attempt history for a
  challenge lives on its Detail page, per R5.

### 6i. Honest "what is graded" reminder (optional)

A short calm line at the bottom of the page, before the back link, e.g.
*"M9 grades your explanation against your project map. It does not run,
build, or test your code (PRD FR-7)."* This is optional but recommended;
it makes the FR-7 boundary visible without being preachy.

Sections 6a–6i may be grouped into shadcn `Card`s or rendered as headed
`<section>`s in one column. The grounding sections (6b, 6d, 6e, 6f) and
the answer-and-score loop (6g, 6h) must remain visually prominent — never
hidden behind closed accordions by default. The honest-framing line (6a)
is always visible. Only the optional in-page nav, the optional bottom
reminder (6i), and the **prior-attempt entries within §6h** are
collapsible by default — the prior-attempt entries are explicitly
collapsed per R5.

## 7. Input fields

The Challenge Detail page shell itself has **no input fields**. The only
inputs on the route are inside the embedded **Debug Walkthrough UI** (§6g)
— the explanation field, optional per-file snippet entries, the file-paths
list, and a submit control. Those are fully specified in
`docs/design/debug-walkthrough-ui.md` §7.

## 8. Primary actions

- **Read the challenge** — scroll/jump through the task description, scope,
  acceptance criteria, and project-map sources. The main grounding action.
- **Open the repository on GitHub** — optional external link in the header.
- **Generate a new challenge of this type (R2 / FR-1)** — the "New
  challenge" action (§6c).
- **Write the explanation and submit** — the answer-and-score loop, in the
  embedded Debug Walkthrough UI (§6g). The main forward action.
- **Review the graded result** — read the most-recent attempt's score,
  per-criterion result, and weak-area breakdown in the embedded
  Completion Review (§6h).
- **Expand a prior attempt (R5)** — toggle a collapsed prior-attempt entry
  to read its explanation and grade (§6h). Pure client-side toggle.
- **Retry** — submit a new attempt via the Debug Walkthrough; the new
  attempt becomes the most-recent, the previous most-recent rotates into
  the prior-attempts list (PRD US-6).

No create/edit/delete of the challenge itself from the page shell — the
challenge is generated by the M9 generation call (the "New challenge"
action regenerates of the same type, producing a new row, not editing the
current one).

## 9. Loading state

While `getChallengeById` and `getChallengeAttempts` run, render a skeleton
challenge layout via `app/repos/[owner]/[repo]/challenges/[challengeId]/loading.tsx`:
a header bar, a task-description prose block, two scope-panel placeholders
side by side (in-scope / out-of-scope rows), an acceptance-criteria list
placeholder, a source-refs chip-row placeholder, a Walkthrough form
placeholder (a textarea-sized block and a submit-button-sized block), and
a small Completion-Review placeholder (a score-chip + a weak-area row).
Use shadcn `Skeleton`. The data source is a local SQLite file, so loading
is brief — but the state must exist so the page never flashes empty.

The Debug Walkthrough's submit has its own in-progress state (the M9
grading call is a bounded LLM call taking a few seconds) — that is
specified in `docs/design/debug-walkthrough-ui.md` §9, not here. The "New
challenge" action (§6c) has its own in-progress state (the M9 generation
call) — that is specified in §6c.

## 10. Empty state

A challenge always has content — the generation call always produces a
type, a task description, an in-scope set with at least one entry, and at
least one acceptance criterion (PRD FR-3, R8). So there is **no "empty
challenge" state** for the page as a whole. The partial states are:

- **No attempts yet** — `attempts` is empty: the Debug Walkthrough form
  (§6g) is active; the Completion Review section + prior-attempts panel
  (§6h) are absent; the page shows just challenge content + the form.
  This is a normal state, not an empty state.
- **One attempt** — `attempts.length === 1`: the most-recent Completion
  Review (§6h) renders the only attempt; the "Prior attempts" sub-section
  is omitted.
- **`outOfScope` empty** — §6d shows a quiet inline note ("No explicit
  out-of-scope files for this challenge.") rather than omitting the panel.
- **`sourceRefs` empty** — §6f is omitted (handled in §6f, not an empty
  state).
- **`inScope` empty** — *unexpected*; the page renders a quiet inline flag
  (§11) — a real generated challenge has at least one in-scope entry.

If a list-valued field is unexpectedly empty, hide that section rather
than showing an empty heading.

## 11. Error state

- **Not found** — if `getChallengeById(challengeId)` returns `null`, or
  `challengeId` does not match the snapshot's challenges, call Next.js
  `notFound()` and render
  `app/repos/[owner]/[repo]/challenges/[challengeId]/not-found.tsx`:
  heading "Challenge not found", a line explaining it does not exist, and
  a "Back to challenges" link to the Challenge List page.
- **Load failure** — if the data layer throws, the route `error.tsx`
  boundary renders a friendly error: heading "Couldn't load this
  challenge", a short explanation, and a "Try again" button (`reset()`).
  No raw stack trace or DB error.
- **Submit failure** — if `submitAttempt` fails (no API key, rate limit,
  network), it is handled inside the Debug Walkthrough UI, not as a page
  error: the user's typed explanation and snippets are preserved and a
  quiet "Try again" is offered (see `docs/design/debug-walkthrough-ui.md`
  §11). The rest of the challenge stays fully visible.
- **Regenerate failure** — if the "New challenge" action's
  `regenerateChallenge` fails, the failure is handled inline next to the
  button (§6c): a quiet "Couldn't generate a new challenge. Try again."
  The current challenge and its attempts stay fully visible.
- **Unresolved file reference** — if an `inScope`/`outOfScope` `path`, a
  `sourceRefs.anchor`, a `criterionGrades` file reference, or a
  `weakAreas.fileRefs` path fails to resolve against the M6 project map,
  render it as plain text with a quiet inline flag — never crash the page
  (PRD NFR "project-grounded, never generic"; integrity check task #141).
- Not-found (expected: unknown id) and load-error (unexpected: data layer
  failed) are deliberately separate states with different copy.

## 12. Success state

- The page renders the header, the honest framing line, the task
  description, the in-scope/out-of-scope panels, the acceptance criteria,
  the project-map sources, the Debug Walkthrough form, and (when there
  are attempts) the Completion Review and prior-attempts panel — every
  field of §5 has a home in the layout.
- **No attempts** (`attempts = []`): the Debug Walkthrough form (§6g) is
  active; the Completion Review section and prior-attempts panel (§6h)
  are absent.
- **One attempt** (`attempts.length === 1`): the Completion Review (§6h)
  renders the only attempt as the most-recent / primary; the prior-
  attempts sub-section is omitted; the Debug Walkthrough remains
  available for a retry.
- **Multiple attempts** (`attempts.length > 1`): the Completion Review
  renders the most-recent attempt as primary; the **inline collapsible
  prior-attempts panel** lists the remaining attempts in most-recent-
  first order, **each collapsed by default**, with timestamp + score
  chip + label in the trigger and the full attempt + grading inside the
  expanded panel (R5). The header optionally gains an "· last attempted
  {attempts[0].submittedAt}" line.
- **After "New challenge"** (§6c): the page navigates to the new
  challenge's Detail route (`/repos/[owner]/[repo]/challenges/[newId]`)
  with a fresh `attempts = []` state; the previous challenge remains
  reachable by URL.
- Success is otherwise implicit (content shown) — this is a read-and-do
  page, not a page with a confirmation banner; the graded result *is* the
  confirmation of the answer-and-score loop.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (the challenge type label); section
  headings descend in order (`<h2>` for the major sections, `<h3>` within)
  with no skipped levels. Use `<main>`, `<nav>` (back link, optional
  in-page section nav), and `<section>` landmarks. Multi-item fields
  (in-scope, out-of-scope, acceptance criteria, source refs, prior
  attempts) use `<ul>` / `<ol>`.
- **Scope panels.** The in-scope and out-of-scope panels must not convey
  meaning by color alone — pair the visual distinction with a clear
  heading ("In scope" / "Out of scope") and per-entry text. The panels
  are labelled `<section>` landmarks.
- **"New challenge" action.** A real `<button>` with a clear accessible
  name; the confirmation dialog (when shown) is a real `<dialog>` /
  `AlertDialog` with focus trap and Esc-to-dismiss; the in-progress state
  uses `aria-busy="true"` and an accessible "Generating new challenge…"
  status; the inline error is announced via an `aria-live="polite"`
  region next to the button.
- **Prior-attempts collapsibles (R5).** Each prior-attempt entry's
  trigger is a real `<button>` with `aria-expanded` and an accessible
  name including the attempt's timestamp and score (e.g. "Prior attempt
  from May 22, 2026 · score 64"). The expanded panel is reachable by
  keyboard. Collapsing an attempt **never** removes it from the DOM in a
  way that loses focus position. Expanded state is *not* mutually
  exclusive — multiple prior attempts can be open at once. By default
  **all are collapsed** on page load (R5).
- **AI-generated label.** The "AI-generated challenge" framing is real,
  announced text — not a color-only or icon-only signal.
- **External link.** The optional "View repository on GitHub" link uses
  `rel="noopener noreferrer"` and an accessible hint that it opens
  externally.
- **Reading order.** DOM order = visual order: header → honest framing
  line → task → new-challenge action → scope → acceptance → sources →
  walkthrough → most-recent result → prior attempts → optional reminder
  → back link. Logical for a screen reader top to bottom.
- **Loading state.** Skeletons are decorative and `aria-hidden`; the
  loading region carries `aria-busy="true"`.
- **Keyboard.** Full keyboard operability in logical order: the back
  link, the GitHub link, the in-page nav links, the "New challenge"
  button (and its dialog), every control in the embedded Debug
  Walkthrough, every prior-attempt collapsible trigger, and any
  Completion Review interactive elements are reachable; Enter/Space
  activate. Visible focus ring throughout.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes
  (the app uses `next-themes`). Score chips and verdict badges convey
  meaning by text, not color alone.
- **Targets.** Interactive targets — including the prior-attempt
  collapsible triggers — are comfortably sized for pointer and touch.
- The embedded panels carry their own accessibility requirements — see
  §13 of the two sibling specs (`debug-walkthrough-ui.md` and
  `completion-review-ui.md`).

## 14. Acceptance criteria

- [ ] `/repos/[owner]/[repo]/challenges/[challengeId]` renders one
      generated challenge read from the typed M9 data-access layer
      server-side — no client fetch, no API route.
- [ ] The **challenge header** shows a human-readable challenge type as
      `<h1>`, the `repo` identifier, an optional external "View
      repository on GitHub" link, and an honest "AI-generated challenge"
      label.
- [ ] An **honest framing line** (§6a) is visible above the fold,
      stating that the grader judges the user's explanation and that
      optional snippets are illustrative (PRD FR-7 / R3).
- [ ] The **task description** renders as a clearly headed prose section.
- [ ] **The "New challenge" action (R2 / FR-1)** is present, invokes
      `regenerateChallenge` for the same `type`, navigates to the new
      challenge on success, shows a confirmation dialog when the current
      challenge has attempts, and handles failure with a quiet inline
      error next to the button.
- [ ] **The in-scope file/module set** and **the out-of-scope file/module
      set** are rendered as two distinct panels (R8 / FR-3), each entry
      naming a real path from the M6 project map and visually
      distinguishable; an empty `outOfScope` shows a quiet inline note,
      not a missing panel.
- [ ] **Acceptance criteria** render as an ordered list with framing
      stating they are the criteria the grader uses (FR-5).
- [ ] **Project-map sources** (`sourceRefs`) render as a calm chip list
      naming the M6 pipeline output and label.
- [ ] The **Debug Walkthrough UI** (sibling spec, #146) is embedded
      inline on this page (no sub-route — §4a) and drives the
      answer-and-score loop. It is available both for first-time entry
      and for retry (PRD US-6).
- [ ] The **Completion Review UI** (sibling spec, #147) is embedded
      inline on this page (no sub-route — §4a) and renders the
      **most-recent** attempt as the primary outcome — the 0–100 score,
      `scoreLabel`, `summary`, per-criterion result, and weak-area
      breakdown (M8-shape, PRD R4 / FR-5).
- [ ] The **inline collapsible prior-attempts panel (R5)** is present
      when `attempts.length > 1`, rendered below the most-recent
      Completion Review, in most-recent-first order, **each prior
      attempt collapsed by default** with a trigger row showing
      timestamp + 0–100 score chip + score label, and an expanded panel
      showing the explanation, optional snippets (illustrative only),
      grading summary, and weak-area breakdown. **No `/attempts`
      sub-route.**
- [ ] **The hosting question for #146 and #147 is resolved** (§4a): both
      live inline on the Challenge Detail page; neither has its own
      route. Sibling specs declare props + states only.
- [ ] **Loading** state shows a skeleton challenge layout (header,
      scope panels, criteria, walkthrough form, review).
- [ ] **Error** state: an unknown/invalid `challengeId` shows a "not
      found" page with a back link to the Challenge List; a load failure
      shows a friendly "Try again" error; a submit failure and a
      regenerate failure are handled in-place, not as page-level errors.
- [ ] **Unresolved file references** (in any of `inScope`, `outOfScope`,
      `sourceRefs`, `criterionGrades` files, `weakAreas.fileRefs`)
      render as plain text with a quiet flag — never a crash (R8 / FR-6;
      integrity check task #141).
- [ ] The page reads as one product with the M2/M3/M4 Catalog/Registry/
      Recommendation pages and the M8 Diff Review page — shared layout,
      spacing, and calm, content-first tone.
- [ ] Accessibility notes in §13 are satisfied (one `<h1>`, ordered
      headings, landmarks, scope panels not color-only, accessible
      collapsibles, announced states, AA contrast).
- [ ] **UI tool is Claude Design (ADR 0007); v0 is not used.**
- [ ] Page spec is human-reviewed before the Claude Design prompt is
      used (Definition of Done, task #145).
