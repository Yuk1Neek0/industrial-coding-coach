# Page Spec: Challenge List

Issue: #144 · Epic: `debug-expansion-challenge` (M9) · PRD: `.claude/prds/debug-expansion-challenge.md` (FR-1, FR-2, FR-3, FR-9, FR-10; US-1, US-6; R1, R2, R4, R5, R6, R8)

This spec defines the **Challenge List Page** for Milestone 9 — the entry
point to the Debug and Expansion Challenge System for one imported
repository. It is the input to the Claude Design prompt
(`docs/design/ui-prompts/challenge-list-page.md`) and to the integration
task #148. It must be human-reviewed before the prompt is run.

(UI tool: **Claude Design** — see ADR 0007. Every new page in M9 goes
through the Claude Design round-trip — Page Spec → prompt under
`docs/design/ui-prompts/` → Claude Design draft → integration notes under
`docs/design/ui-integration-notes/`.)

The Challenge List Page is the **top-level entry page** of the four M9 UI
pieces. Its siblings — the **Challenge Detail Page**
(`docs/design/challenge-detail-page.md`), the **Debug Walkthrough UI**
(`docs/design/debug-walkthrough-ui.md`), and the **Completion Review UI**
(`docs/design/completion-review-ui.md`) — are reached from a row on this
page. All four share layout, components, and tone with the M2 Catalog, M3
Registry, M4 Recommendation, M6 Project Map, and M8 Diff Review pages so
the whole app reads as one product.

---

## 1. Page name

**Challenge List** — a per-repository page listing every project-tied
debug/extension challenge applicable to the imported repository's
snapshot, each entry naming the target file(s)/module(s) from the M6
project map and surfacing the user's latest graded outcome as its current
status. From this page the user opens a challenge row and lands on the
Challenge Detail Page, where the answer-and-grade loop happens.

## 2. User goal

> "I imported my project. M6 mapped how it works. Now show me — for *my*
> repo — what 'add this small field', 'trace this failed call', 'fix this
> schema mismatch', 'extend this module safely' actually look like, each
> tied to specific files I can find on disk. And, as I work through them,
> show me where I stand on each one — without faking challenge types that
> my repo doesn't really have."

The user opens the Challenge List Page for one of their imported
repositories, sees the applicable challenge types as rows — each naming
the target file(s)/module(s) from the M6 project map and the user's
latest outcome on it — and picks one to open. Types that do not apply to
the snapshot are not in the list at all.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She
has one or two AI-built portfolio projects she cannot confidently explain
or defend. She can prompt an AI tool, run `pnpm`, and push to GitHub, but
cannot point at a file and say "if you asked me to add X, I would change
*this* file because…".

Design implications:

- **List is the bridge from M6 to the answer-and-grade loop.** Mia comes
  from the M6 Project Map. The list rows must be obviously about *her*
  repo — every entry names real file/module paths from the M6 map (US-1).
  A row that didn't would look broken, and that is intentional (FR-3,
  R8).
- **Omit, don't fake.** A non-AI project has no "AI call flow" to trace;
  a repo with no failing CI has no broken-CI challenge (R6). Mia must see
  the absence as honest, not as a missing button — types that don't
  apply are simply not in the list (R1 / FR-2).
- **Latest outcome is the status.** Mia retries challenges (US-6). The
  row's "status" is her **latest** attempt's 0–100 score and band, not
  her first, not her best (R5 / R4). If she hasn't attempted a challenge
  yet, the status reads as "Not attempted" — also honest.
- **Server-side coaching, server-side cost.** The generation call is a
  bounded Anthropic SDK call (ADR 0005). It is **lazy per challenge type
  and cached per snapshot** (R2 / FR-1). Mia must not see a spinner here
  for the LLM — opening the list view never triggers generation; opening
  a row (the Detail Page) is what does. The list view reads what is
  already cached for this snapshot.
- **AI-generated, said plainly.** The challenges are themselves AI-
  generated against the M6 project map. The page carries a small honest
  "AI-generated challenges, grounded in your project map" label —
  on-thesis with ADR 0005: coaching output is inspectable, not a black
  box.
- **No accounts, no setup.** M9 has no authentication. The imported repo
  and its snapshot come from M11; the project map comes from M6. The
  list page is reachable by its URL.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the page
shell — there is no client-side interaction on the list view itself
beyond row links and a small client island for the optional type filter
(see §6).

| Route | Purpose | File |
|---|---|---|
| `/repos/[owner]/[repo]/challenges` | The Challenge List Page for one imported repo's snapshot | `apps/web/app/repos/[owner]/[repo]/challenges/page.tsx` |

- `owner` and `repo` come from the M11 snapshot's identity (owner/repo +
  ref). The page reads the **current snapshot** for that repo; the
  M9-side ref handling matches the M6 Project Map page convention
  (`docs/design/project-map-page.md` §4).
- A route-level `loading.tsx` covers the initial server reads
  (`getApplicableChallenges`, `getLatestOutcome` per row, project-map
  read for file/module names). An `error.tsx` boundary covers
  render-time failures only — expected failures (no map, no snapshot)
  are in-page error states (§11).
- Each row links to `apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/page.tsx`
  — the Challenge Detail Page (its own spec). Selecting a *type* that
  has no cached row yet routes to the Detail Page **without a
  `challengeId`** so the Detail Page is the one that triggers generation
  (R2 — see §5, §8). The list view itself never triggers generation.
- The page is linkable and bookmarkable.

## 5. Data source / contract

The page is a **thin server-side view** over two existing typed
data-access layers — no client-side fetching, no API route. Server
Components call the data layers directly (ADR 0006).

```ts
// M9 — the typed challenges data-access layer, task #140 / FR-9.
// Returns one row per applicable challenge type for this snapshot;
// types that have not yet been generated may still appear as
// "type known, not yet generated" entries (see Applicability below).
getApplicableChallenges(
  owner: string,
  repo: string,
  ref?: string,
): Promise<ChallengeListEntry[]>

// M9 — latest-outcome accessor, task #140 / FR-9 / R5.
// Returns the most-recent attempt's grading result for a challenge,
// or null if the user has not attempted it.
getLatestOutcome(challengeId: number): Promise<LatestOutcome | null>

// M6 — project-map data-access layer (shipped, archived/106). Used to
// resolve the target file(s)/module(s) named on each challenge row.
// Reused as-is per ADR 0009 / FR-11; no new map-access path.
getProjectMapByRepo(
  owner: string,
  repo: string,
  ref?: string,
): Promise<ProjectMap | null>
```

The `getApplicableChallenges` call returns `[]` when no challenge type
applies (an unusual but valid state for a repo with no recognizable code
in its M6 map — see §10) and `null` is reserved for the parent reads
(`getProjectMapByRepo` returning `null` is the "no project map" error in
§11). Generation of a new challenge row is **never** triggered by this
page — see R2 / FR-1 below.

### `ChallengeListEntry` shape — the list-row contract

`ChallengeListEntry` is the per-type/per-row view of a challenge that
the M9 data-access layer (task #140) exposes for this page. It composes
parts of the typed challenge model (FR-3) with the latest-outcome
accessor (R5). The exact TypeScript lives in `packages/db`
(`packages/db/src/challenges/`); if the merged code differs at
integration time the merged code is authoritative, but the *shape* is
fixed by PRD FR-1, FR-3, FR-9, and R5 and must not change without
updating this spec.

| Field | Type | Used by |
|---|---|---|
| `challengeId` | `number \| null` | Row link / route key — `null` when the type is applicable but no row has been generated yet (R2 — Detail Page generates on first open) |
| `type` | `ChallengeType` | §6 row header — which kind of challenge this is |
| `typeLabel` | `string` | §6 row header — plain-language label for the type ("Add a small field", "Trace a failed API call", …) |
| `taskSummary` | `string` | §6 row body — one-line plain-language summary of the task (from the generated challenge); omitted when the row is "type known, not yet generated" |
| `targetFiles` | `string[]` | §6 row body — the in-scope file(s)/module(s) from the M6 project map (FR-3 / R8 / US-1) |
| `latestOutcome` | `LatestOutcome \| null` | §6 row status — the user's latest 0–100 score + band (R5); `null` until the user has any attempt |
| `generatedAt` | `Date \| null` | §6 row meta — "Generated <time>"; `null` when not yet generated |

`ChallengeType` (FR-2): one of the M9 challenge-type set —
`"add-small-field"`, `"trace-failed-api-call"`, `"fix-schema-mismatch"`,
`"add-loading-error-state"`, `"add-unit-test"`, `"explain-broken-ci"`,
`"extend-module-safely"`. The exact enum lives in `packages/db`.

`LatestOutcome` (R4 / R5 — mirrors the M8 grading shape so M8 and M9
produce one comprehension-grading pattern):

| Field | Type | Use |
|---|---|---|
| `score` | `number` | 0–100 numeric score (R4) — the headline number on the row |
| `scoreBand` | `string` | calm short band label, e.g. "Solid grasp", "Getting there", "Needs review" — matches M8's `scoreLabel` |
| `passed` | `boolean` | whether the score met the shared M8/M9 pass threshold |
| `attemptedAt` | `Date` | "Last attempt <time>" on the row |

### Applicability — what is in the list and what is not

This is the heart of the page's contract; **the list is exhaustive of
applicable types and omits the rest** (R1 / FR-2 / R6). The M9
data-access layer enforces applicability before returning a row to this
page:

- **Applicable, generated.** A row exists in `challenges` for this
  snapshot and type. `challengeId` is set, `taskSummary` / `targetFiles`
  / `generatedAt` are populated. `latestOutcome` reflects the user's
  most recent attempt (or `null`).
- **Applicable, not yet generated.** The type is supported and the M6
  project map yields enough grounding to generate one, but no row has
  been generated yet for this snapshot. `challengeId` is `null`;
  `taskSummary` and `generatedAt` are `null`; `targetFiles` is the M6-
  map subset the generator will use. The row links to the Detail Page,
  which triggers generation on first open (R2 — see §6 and §8).
- **Not applicable — omitted.** The type does not apply to this
  snapshot. **No row is returned.** The page does not render a
  "disabled" placeholder, does not invent a description, does not
  hand-fake the type from a CI config file (R6). Examples (per FR-2
  and the epic): the AI-call-flow-based types on a non-AI project; the
  "trace a failed API call" type on a project with no request/data
  flow in its M6 map; the "explain a broken CI result" type on a
  snapshot with no real failing CI run or log (R6 — until M11 surfaces
  real CI runs, this type is expected to be absent on most repos).

A row referencing a file that is not in the M6 project map is a violated
integrity invariant (FR-6, R8). The data-access layer drops such a row
silently rather than passing it through to this page; the upstream
integrity check (task #141) is what guarantees this — the page just
renders what it receives. If, defensively, a row arrives with empty
`targetFiles`, the page omits that row entirely — **generic challenges
with no file reference are not shown** (US-1).

## 6. Page sections

Top to bottom, single readable column (comfortable max width):

1. **Page header** — `owner/repo` as the `<h1>` title with the imported
   `ref` as a `Badge`; a one-line description: "Project-tied debug and
   extension challenges generated from your project map." A small,
   honest **"AI-generated challenges, grounded in your project map"**
   label sits in the header — real text, not an icon-only signal (ADR
   0005, §13).
2. **Map link** — a quiet "Based on the map of {owner}/{repo} →" link to
   `/map/[owner]/[repo]`. The list is downstream of the map; surfacing
   that lineage is on-thesis. If no map exists for the snapshot, this
   block becomes the "no map" error state (§11).
3. **Type filter (optional)** — a small segmented control or
   `Select`/`Tabs` listing the *applicable* types in the data, plus
   "All". Default "All". Filters the list client-side. Only renders
   when there are at least 3 applicable types — under that, the list is
   short enough to scan without a filter. **The filter only ever shows
   types that are in the data**: types that don't apply to the snapshot
   are not options, are not greyed out, and are not faked (R1 / FR-2 /
   R6).
4. **Challenge list** — one row per `ChallengeListEntry`. Each row
   shows:
   - the **`typeLabel`** as the row title (e.g. "Add a small field"),
     with the underlying `type` available as the row's stable id;
   - the **`taskSummary`** in plain language directly under the title
     (or "Generate the first challenge of this type" placeholder when
     `challengeId` is `null` — the "applicable, not yet generated"
     state);
   - the **`targetFiles`** as monospace path chips ("`Badge`"-style,
     wrapped) — the in-scope file(s)/module(s) from the M6 project map
     (US-1 / FR-3). Long lists wrap; the row does not truncate this
     information silently;
   - the **latest-outcome status** (§6a, below);
   - a quiet **"Generated {generatedAt}"** meta line on the right (or
     "Not yet generated" when `challengeId` is `null`).
   The row is clickable as a whole and is also a real link; activating
   it navigates to the Detail Page (§8).

### 6a. Latest-outcome status — per-row (R5 / R4 / US-6)

Each row carries one piece of status: the user's **latest** attempt's
outcome on this challenge (R5 — the most recent, not the best, not the
first). It mirrors the M8 grading shape (R4) so the product reads as
one comprehension-grading pattern across M8 and M9:

- **No attempt yet** — `latestOutcome` is `null`. Status reads
  "Not attempted" as a quiet text label (a neutral `Badge`).
- **Attempted** — `latestOutcome` is populated. Status shows:
  - the **score** (0–100, R4) as a prominent number;
  - the **`scoreBand`** as a short calm label (e.g. "Solid grasp",
    "Getting there", "Needs review");
  - a "Last attempt {attemptedAt}" muted line.

The status conveys meaning by **text**, not by color alone (a green
checkmark or a red cross is not sufficient — see §13). The score is
0–100 numeric (R4); the page does **not** invent a stars/grade letter
mapping. If the user has multiple attempts, only the **latest** appears
here — the prior-attempts panel lives on the Challenge Detail Page (R5
— `docs/design/challenge-detail-page.md` §6).

### 6b. Footnote — lazy generation, server-side (R2 / FR-1)

A quiet one-line footnote below the list: "Each challenge is generated
on first open, then cached per repository snapshot." This is the user-
facing acknowledgement of R2 / FR-1. The footnote is informational —
it does not link to the SDK, the model, or the cache. (The "new
challenge" regeneration action lives on the Detail Page, not here.)

## 7. Input fields

The Challenge List page shell has **no free-text input** and **no
data-mutating input**. The only interactive control on the list view
itself is the optional **type filter** (§6, item 3) and the row links
(§6, item 4 / §8). Generation is not triggered here.

## 8. Primary actions

- **Open a challenge** — the row link. Navigates to
  `/repos/[owner]/[repo]/challenges/[challengeId]` when `challengeId`
  is set, or to a type-keyed URL like
  `/repos/[owner]/[repo]/challenges/new?type=<type>` when `challengeId`
  is `null` (the exact "applicable, not yet generated" route shape is
  the Detail Page's decision — see
  `docs/design/challenge-detail-page.md` §4). **The Detail Page is the
  one that triggers generation** (R2 / FR-1) — opening a row on this
  page does not.
- **Filter by type** — the optional segmented control / `Select`
  (§6, item 3). Client-side, immediate. Only ever lists types that are
  in the data (R1).
- **View the project map** — the §6 item 2 map link to
  `/map/[owner]/[repo]`.
- **Import a repository** / **Map this project** — surfaced only in
  error states (§11) when the prerequisite is missing.

No destructive actions — the page never deletes a challenge, a snapshot,
or a project map.

## 9. Loading state

While the server reads run (`getApplicableChallenges`,
`getLatestOutcome` per row, `getProjectMapByRepo`), render a skeleton
list layout via `app/repos/[owner]/[repo]/challenges/loading.tsx`: the
header bar, a few placeholder rows (each a title bar + path-chip bar +
status block + meta line). Use shadcn `Skeleton`. The data source is
local SQLite plus an in-process M6-map read — loading is brief, but the
state must exist so the page never flashes empty.

The list view **never** shows an LLM-in-progress state. Generation is
lazy per type and runs only when the Detail Page is opened (R2 / FR-1)
— that in-progress state belongs to the Detail Page, not this one.

## 10. Empty state

- **No applicable challenge types for this snapshot** —
  `getApplicableChallenges` returns `[]`. Render a quiet, calm panel:
  heading "No applicable challenges for this snapshot yet", a short
  explanation that M9 only generates challenges whose target files are
  in the M6 project map (R1 / R8) and that types like "explain a broken
  CI result" appear once a real failing CI run is surfaced (R6), and a
  secondary "View project map" link to `/map/[owner]/[repo]`. This is a
  **resting state**, not an error — it is the honest answer for a
  snapshot whose map yields no grounding for any type.
- **All applicable types are filtered out** — the type filter (§6) is
  set to a value that excludes everything. Keep the filter bar visible
  and show an inline "No challenges match this filter" message with a
  **Clear filter** action that resets it. This is visibly distinct from
  the "no applicable challenges" state above.

A type that does not apply is **omitted from the list** (R1 / FR-2 /
R6) and is **never** rendered as a faked, greyed-out, or
"coming soon" row — that would violate the omit-not-fake invariant.

## 11. Error state

Expected failures are **in-page error states** in the §6 status area,
each with a heading, a plain-language explanation, and a recovery
action — never raw stack traces or DB errors:

- **`not-imported`** — the repo has no M11 snapshot. Heading: "This
  repository isn't imported yet." Explanation: project-tied challenges
  need an imported snapshot. Action: "Import this repository" →
  `/import`. (M11 reuse, ADR 0009 / FR-11.)
- **`no-project-map`** — the snapshot exists but `getProjectMapByRepo`
  returns `null`. Heading: "No project map yet for this snapshot."
  Explanation: M9 generates challenges from the M6 project map; the
  map needs to exist first. Action: "Map this project" →
  `/map/[owner]/[repo]`. (M6 reuse, FR-11.)
- **`load-failure`** — the data layer throws (unexpected). The route
  `error.tsx` boundary renders a friendly error: heading "Couldn't
  load challenges", a short explanation, and a "Try again" button
  (`reset()`). No raw stack trace or DB error.

The list page never shows a `missing-api-key` error — generation does
not happen on this page (R2 / FR-1); the API key only matters once the
Detail Page actually triggers a generation call, and the missing-key
error lives there.

A row whose `targetFiles` is empty (a generic challenge with no file
reference) is **silently dropped** at the data-access layer per US-1 —
this is not an error state, it is the omit-not-fake invariant in
action.

## 12. Success state

The page renders the header, the optional type filter (when there are
3+ applicable types), and the list of `ChallengeListEntry` rows — every
field of §5 has a home in the layout. Each row names its `typeLabel`,
its `taskSummary`, its in-scope `targetFiles` from the M6 map, its
latest-outcome status (or "Not attempted"), and its generation meta —
or, for an "applicable, not yet generated" row, makes the "open this
row to generate the first challenge of this type" intent obvious.

A returning user lands directly in this state with whatever cached
challenges and latest outcomes the database has for this snapshot.
Success is implicit (content shown) — there is no confirmation banner;
the populated list *is* the answer.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (the `owner/repo` title);
  section headings descend in order (`<h2>` for the major sections,
  `<h3>` within rows where applicable) with no skipped levels. Use
  `<main>`, `<nav>` (the back/map link), and `<section>` landmarks. The
  challenge list is a `<ul>`/`<li>` list of rows (or a list of
  `<article>`s).
- **Row links.** Each row is a real link (or contains exactly one
  link covering the row) with an accessible name that includes the
  `typeLabel`, the `taskSummary` (when present), and the latest-outcome
  status — so a screen reader user knows the row's identity and state
  without parsing chips.
- **Path chips.** `targetFiles` paths are `<code>` inside chips; the
  chip's accessible name names the path. Long lists wrap; nothing
  meaningful is truncated behind hover.
- **Status convey meaning by text.** "Not attempted", the score, and
  the `scoreBand` are real text — never color alone or icon alone (the
  M8 score-weak-area accessibility rule applies, §13 of
  `docs/design/score-weak-area.md`). Badges meet WCAG 2.1 AA contrast
  in both themes.
- **Type filter.** The filter is a labelled, keyboard-operable control
  (segmented control with a visible legend, or a `Select` with an
  `<label>`); the filtered-count line / "no matches" message is real
  text, updated so assistive tech can observe the change.
- **AI-generated label.** The "AI-generated challenges, grounded in
  your project map" framing is real, announced text — not a color-only
  or icon-only signal.
- **Loading state.** Skeletons are decorative and `aria-hidden`; the
  loading region carries `aria-busy="true"`.
- **Keyboard.** Full keyboard operability in logical order: the map
  link, the (optional) filter control, each row link in order, the
  empty-state / error-state actions. Enter/Space activate. Visible
  focus ring throughout. DOM order = visual order.
- **Color & contrast.** WCAG 2.1 AA in light and dark themes
  (`next-themes`). The `ref` badge, type chips, and status conveys
  meaning by text + icon, not color.
- **Targets.** Interactive targets are comfortably sized for pointer
  and touch.

## 14. Acceptance criteria

- [ ] `/repos/[owner]/[repo]/challenges` renders the Challenge List
      Page server-side from the typed M9 data-access layer
      (`getApplicableChallenges`, `getLatestOutcome`) and the M6
      project-map data-access layer (`getProjectMapByRepo`) — no
      client fetch, no API route (ADR 0006).
- [ ] The **page header** shows `owner/repo` (as `<h1>`), the `ref`
      `Badge`, the one-line description, and an honest "AI-generated
      challenges, grounded in your project map" label.
- [ ] **Every list row** shows the `typeLabel`, the `taskSummary`
      (or the "applicable, not yet generated" placeholder when
      `challengeId` is `null`), the in-scope **`targetFiles` from the
      M6 project map** (US-1 / FR-3), the **latest-outcome status**
      (§6a), and the generation meta line.
- [ ] Each list row's **target file(s)/module(s) come from the M6
      project map** and are real snapshot paths (US-1 / R8); a row
      whose `targetFiles` would be empty is **not rendered** (generic
      challenges with no file reference are not shown).
- [ ] **Challenge types that do not apply to the snapshot are
      omitted, not faked** (R1 / FR-2) — including the
      "explain a broken CI result" type when no real failing CI run
      is available (R6). No greyed-out, no "coming soon", no
      synthesized rows.
- [ ] Each row shows the user's **latest** 0–100 outcome (R5 / R4)
      as the challenge's current status — the most recent attempt's
      score + band, not the first or best — or "Not attempted" when
      `latestOutcome` is `null`.
- [ ] The list view **does not trigger generation** on render —
      generation is **lazy per challenge type, cached per snapshot,
      server-side** (R2 / FR-1), triggered only when the Detail Page
      opens. The list view shows what is already cached.
- [ ] The optional **type filter** (when ≥ 3 applicable types) lists
      only types that are in the data; filtering to nothing shows an
      inline "no matches" message with a Clear filter action — visibly
      distinct from the "no applicable challenges" state.
- [ ] **Empty state** — `getApplicableChallenges` returning `[]`
      renders a calm "no applicable challenges for this snapshot yet"
      panel with a "View project map" link, not an error.
- [ ] **Loading** state shows a skeleton list layout (header bar,
      several row placeholders). The list view never shows an LLM-in-
      progress state.
- [ ] **Error** states cover `not-imported` ("Import this repository"
      → `/import`), `no-project-map` ("Map this project" →
      `/map/[owner]/[repo]`), and `load-failure` ("Try again") — each
      with a distinct heading and recovery action. No raw stack
      traces.
- [ ] The page reads as one product with the M2 Catalog, M3 Registry,
      M4 Recommendation, M6 Project Map, and M8 Diff Review pages —
      shared layout, spacing, calm, content-first tone.
- [ ] **Claude Design (ADR 0007)** is the UI generation tool. The
      page-spec-first discipline applies: this spec must be human-
      reviewed before the Claude Design prompt
      (`docs/design/ui-prompts/challenge-list-page.md`) is run.
- [ ] Uses **only** `packages/ui` (shadcn/ui) components.
- [ ] Accessibility notes in §13 are satisfied (one `<h1>`, ordered
      headings, landmarks, list semantics, text-not-color status,
      labelled filter, keyboard operability, AA contrast).
