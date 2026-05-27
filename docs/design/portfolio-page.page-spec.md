# Page Spec: Portfolio Page

Issue: #178 · Epic: `learning-memory-portfolio-export` (M10) · PRD: `.claude/prds/learning-memory-portfolio-export.md` (FR-1, FR-2, FR-4, FR-5, FR-6, FR-7, FR-8, FR-10, FR-11; US-1, US-2, US-3, US-4, US-5, US-6; NFR-3, NFR-4, NFR-5)

This spec defines the **Portfolio Page** for Milestone 10 — the single new
user-facing surface introduced by `learning-memory-portfolio-export`. It is the
input to the Claude Design prompt
(`docs/design/ui-prompts/portfolio-page.md`) and to the integration task
**#184**. It must be human-reviewed before the prompt is run.

(UI tool: **Claude Design** — see ADR 0007. Every new page in M10 goes
through the Claude Design round-trip — Page Spec → prompt under
`docs/design/ui-prompts/` → Claude Design draft → integration notes under
`docs/design/ui-integration-notes/`. v0 is **not** used.)

The Portfolio Page is **the** user-facing surface of M10: there are no
sibling per-artifact pages, no per-artifact sub-routes, and no separate
preview UI. Per PRD US-5 the page is a **single scrollable layout** that
composes all five M10 artifacts in a fixed order with anchor links — sending
an interviewer a single URL is the explicit shape of the share affordance.
The page shares layout, components, and tone with the M2/M3/M4
Catalog/Registry/Recommendation pages, the M6 Project Map page, the M7 Issue
Learning Workspace, the M8 Diff Review page, and the M9 Challenge Detail /
List pages so the whole app reads as one product.

> **PRD US-5 — single page, no sub-routes.** Architecture Explanation,
> Learning Memory Tree, Interview Q&A, Résumé Bullets, and Debug Stories
> render on **one** route (`/portfolio/[owner]/[repo]`) with intra-page
> anchor navigation. There is no `/portfolio/.../architecture`,
> `/portfolio/.../qa`, or any other per-artifact route. The Claude Design
> draft must produce a single page; the integrator (#184) must not split it.

> **PRD FR-8 — no API key at view time.** The page reads cached artifacts
> from the `learning_memories` row keyed by `snapshot_id`. **No LLM call
> runs on render.** The only paths that touch the Anthropic SDK are the
> Server Actions invoked by the "Regenerate memory" action (which re-runs
> the two M10 bounded calls + the deterministic composers and refreshes the
> row). Opening the URL with `ANTHROPIC_API_KEY` unset must succeed.

---

## 1. Page name

**Portfolio Page** — a per-repository page at
`/portfolio/[owner]/[repo]` that renders the user's **learning memory** for
one imported repository as a single shareable view: the deterministic
**Architecture Explanation**, the **Learning Memory Tree** (with weak-area
items surfaced honestly as "still to revisit"), the bounded-SDK
**Interview Q&A**, the bounded-SDK **Résumé Bullets**, and the
deterministic **Debug Stories**. From this page the user reads, **exports**
a markdown bundle (ZIP) or a PDF, and **regenerates** the memory when the
underlying snapshot has changed.

## 2. User goal

> "I worked through the imported repo across M5–M9. Now show me — as one
> shareable page — what I actually learned: the architecture I can speak
> from, what I now understand (and what I should still revisit), the
> interview Q&A I can practice with, the résumé bullets I can paste, and
> the debug stories I can talk about. Let me share the URL with an
> interviewer, or take the bundle away as files or a PDF. And tell me
> honestly when this is stale relative to the project."

The user opens `/portfolio/[owner]/[repo]` for one of their imported
repositories, scrolls through the five fixed sections (or jumps via the
anchor nav), and either reads the memory inline, regenerates it after
working through new M5–M9 outputs, or exports it as a markdown ZIP or a
PDF. They never need a live network or an API key just to read what is
already cached (PRD FR-8 / NFR-3).

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She
has one or two AI-built portfolio projects she cannot confidently defend.
She can prompt an AI tool, run `pnpm`, and push to GitHub, but cannot
deliver a coherent "walk me through your project" narrative or paste
defensible résumé bullets that name real choices on her repo.

Design implications:

- **One page, one URL, sharable.** The page must read as a single
  coherent artifact a hiring manager could open. Per PRD US-5, fragmenting
  into sub-routes would defeat the share affordance — every artifact is
  on one scroll.
- **Honest output is the contract (PRD FR-4 / NFR-5).** Weak-area items
  from M7/M8/M9 grading appear in the Learning Memory Tree's
  "still to revisit" branch — they are **surfaced, not hidden**. The
  page never softens "you scored 41 here" into "you got it"; it shows the
  real weak-area entries with the row that taught them.
- **Project-grounded, never generic.** Every file/module reference, every
  technology claim, every Q&A answer, every résumé bullet resolves to a
  real M5 / M6 / M7 / M8 / M9 row. The M10 integrity check (#177) enforces
  this at write time; the page trusts the persisted contract and renders a
  quiet inline flag for any reference that defensively fails to resolve.
- **No "share to the cloud" affordance.** Per PRD out-of-scope and
  NFR-3, the page is local-first. The "share" model is the URL on the
  user's running app, the exported markdown files, or the exported PDF
  — there is no upload, no signup, no hosted publish flow on the page.
- **AI-generated, said plainly.** Q&A and résumé bullets are bounded SDK
  outputs (FR-2). The header carries a small, honest "AI-generated Q&A
  and résumé bullets, grounded in your repo" label — on-thesis with ADR
  0005.
- **Cached + lazy (FR-5).** First visit triggers generation server-side
  via a Server Action (the regenerate path); subsequent visits read the
  cache. The page does not show an LLM spinner on render — the Detail-
  Page-style "in progress" only appears on the explicit Regenerate action.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the page
shell. The three top-level actions (Regenerate / Export Bundle / Export
PDF) are **Server Actions** invoked from small Client Component islands
in the page header (see §8).

| Route | Purpose | File |
|---|---|---|
| `/portfolio/[owner]/[repo]` | The Portfolio Page for one imported repo's snapshot | `apps/web/app/portfolio/[owner]/[repo]/page.tsx` |

- `[owner]` and `[repo]` come from the M11 snapshot's identity
  (owner/repo + ref). The page reads the **current snapshot** for that
  repo; the M10-side ref handling matches the M6 Project Map /
  M7 Workspace / M9 Detail Page convention. **No new GitHub access path**
  (ADR 0009 / PRD constraint) — the snapshot identity comes from the
  shipped `getImportedRepoById` / `getSnapshotByOwnerRepo` DAL.
- A route-level **`loading.tsx`** covers the initial server reads
  (`getMemory`, `isMemoryStale`, the M5/M6 reads the deterministic
  sections render from). A route-level **`error.tsx`** covers render-time
  failures only — expected failures (no snapshot, no memory yet,
  regenerate-key-missing) are in-page error states (§11). A
  **`not-found.tsx`** covers the "owner/repo isn't imported" case.
- The page is linkable and bookmarkable. **There are no per-artifact
  sub-routes** (PRD US-5). All five artifacts render on this single
  route; anchor links (§6) provide intra-page navigation.

### 4a. Hosting decision — single page, fixed section order, anchor nav only

PRD US-5 is normative: the Portfolio Page is *one* page that composes all
five M10 artifacts in a fixed order. This spec resolves the consequences:

- **No sub-routes.** No `/portfolio/.../architecture`, no
  `/portfolio/.../qa`, no `/portfolio/.../resume`, no
  `/portfolio/.../tree`, no `/portfolio/.../debug-stories`. The Claude
  Design draft must not introduce them; the integrator (#184) must not
  add them.
- **Fixed section order (per PRD US-3, US-4, US-1, US-2 + epic Frontend
  Components):**
  1. **Architecture Explanation** (`#architecture`)
  2. **Learning Memory Tree** (`#memory-tree`)
  3. **Interview Q&A** (`#interview-qa`)
  4. **Résumé Bullets** (`#resume-bullets`)
  5. **Debug Stories** (`#debug-stories`)
  The order matches the deterministic-first → SDK-narrative reading shape
  and the bundle exporter's `portfolio.md` ordering (task #182). The page,
  the markdown bundle, and the PDF must all use this same ordering so the
  three reading surfaces stay byte-aligned for the user (PRD US-5
  acceptance: *"the same content as the markdown / PDF export, just in
  HTML"*).
- **Anchor link IDs** on each `<section>` match the slugs above
  (`#architecture`, `#memory-tree`, `#interview-qa`, `#resume-bullets`,
  `#debug-stories`). The header carries a compact in-page anchor nav
  (§6) listing the five sections in order.

## 5. Data source / contract

The page is a **thin server-side view** over the typed M10 data-access
layer (`@workspace/db`, task **#176**). No client-side fetching, no API
route — Server Components call the data layer directly (ADR 0006). The
three top-level actions go through Server Actions (§8).

```ts
// M10 — read the cached learning memory for one snapshot.
// Returns null when the row has not yet been generated for this snapshot.
getMemory(snapshotId: number): Promise<LearningMemory | null>

// M10 — is the cached memory older than the underlying snapshot's
// updated_at? Drives the stale-data banner (FR-11).
isMemoryStale(snapshotId: number): Promise<boolean>

// M11 — snapshot identity for the route. Reused as-is (ADR 0009 / FR-10).
getSnapshotByOwnerRepo(
  owner: string,
  repo: string,
  ref?: string,
): Promise<RepoSnapshot | null>
```

The three top-level actions (§8) are Server Actions implemented at
`apps/web/app/portfolio/[owner]/[repo]/actions.ts` (task #184). Each
takes `snapshotId` and routes to the corresponding M10 backend:

```ts
// Re-invokes generateInterviewQA + generateResumeBullets (tasks #180/#181),
// runs the three deterministic composers (task #179), integrity-checks via
// #177, upserts the learning_memories row, and revalidates the route.
// This is the ONLY path on this page that touches the Anthropic SDK.
regenerateMemory(snapshotId: number): Promise<void>

// Returns the markdown bundle ZIP (task #182) as a streamed Response with
// Content-Disposition: attachment; filename="<owner>-<repo>-<snapshotId>-portfolio.zip".
exportPortfolioBundle(snapshotId: number): Promise<Response>

// Returns the rendered portfolio PDF (task #183) as a streamed Response
// with Content-Disposition: attachment; filename="<owner>-<repo>-<snapshotId>-portfolio.pdf".
exportPortfolioPdf(snapshotId: number): Promise<Response>
```

`getMemory` returns `null` when the row has not yet been generated; the
page treats `null` as the **first-open** empty state (§10) — it does not
auto-trigger generation on render. The user must click **Regenerate
memory** to populate the row (PRD FR-5 — regeneration is user-triggered,
not background). `getSnapshotByOwnerRepo` returning `null` is the
"repo not imported" not-found state (§11). `isMemoryStale` returning
`true` drives the stale-data banner (§6a / FR-11).

### `LearningMemory` shape — the M10 cache contract

`LearningMemory` is the typed row stored in `learning_memories` (task
**#176**). The exact TypeScript ships there; if the merged code differs
at integration time the merged code is authoritative, but the *shape* is
fixed by PRD FR-9 and must not change without updating this spec.

| Field | Type | Used by |
|---|---|---|
| `id` | `number` | DB key |
| `snapshotId` | `number` | FK → `repo_snapshots.id`, unique (FR-1 / FR-9) |
| `architectureExplanation` | `ArchitectureExplanation` | §6b — deterministic composer output (task #179) |
| `learningMemoryTree` | `LearningMemoryTree` | §6c — deterministic composer output (task #179) |
| `interviewQa` | `InterviewQA[]` | §6d — bounded SDK output (task #180) |
| `resumeBullets` | `ResumeBullet[]` | §6e — bounded SDK output (task #181) |
| `debugStories` | `DebugStory[]` | §6f — deterministic composer output (task #179) |
| `generatedAt` | `Date` | §6a — drives the stale-data banner (FR-11) |
| `createdAt` / `updatedAt` | `Date` | meta |

### Real TypeScript shapes — what the page binds to

These are the **typed contracts** the page renders and that integration
task **#184** must satisfy. The exact TypeScript lives in `packages/db`
(declared by task **#176**, populated by tasks **#179**, **#180**,
**#181**); if the field names below differ from the merged code at
integration time, the merged code is authoritative — but the *shape* is
fixed by PRD FR-2 and the M10 epic Frontend-Components section and must
not change without updating this spec.

> **Drift-watch — guard against the M8 "spec ↔ shape drift" retro
> lesson.** The M8 retrospective flagged that letting the shipped types
> diverge from the rendering spec caused integration churn — the page
> bound to a shape the back-end no longer produced. M10 follows the
> shipped-types-are-authoritative rule, **but the integrator (#184) must
> diff the shipped types from `packages/db` (task #176) against the
> shapes below before binding, and update this spec (or the merged
> types) if they have drifted.** This is the M10 integration-boundary
> check; flag any drift in `docs/design/ui-integration-notes/portfolio-page.md`.

#### `ArchitectureExplanation` (§6b, US-3, FR-2 deterministic)

| Field | Type | Use |
|---|---|---|
| `intro` | `string` | a short opening paragraph framing what this project is, grounded in M5 + M6 |
| `stackSection` | `ArchitectureExplanationSection` | the stack-decisions narrative composed from `stack_explanations` (M5) |
| `architectureSection` | `ArchitectureExplanationSection` | the architecture-shape narrative composed from `project_maps` (M6) |
| `keyFlowsSection` | `ArchitectureExplanationSection` | the key-flow narrative (request / data / state / AI-call / debug paths) from `project_maps` |

```ts
interface ArchitectureExplanationSection {
  heading: string;           // human-readable section heading
  paragraphs: string[];      // 1–N plain-language paragraphs
  citedFiles: string[];      // every file path here resolves to a real M6 project_maps node
  citedStack: string[];      // every entry here resolves to a real M5 stack_explanations row
}
```

The composer (#179) guarantees every `citedFiles` path is in the M6
project map and every `citedStack` entry is in the M5 stack-explanation
row. Unresolved references are a defensive case only — the page renders
them as plain text with a quiet inline flag (§11).

#### `LearningMemoryTree` (§6c, US-4, FR-4 — honest output)

| Field | Type | Use |
|---|---|---|
| `branches` | `LearningMemoryTreeBranch[]` | the "things I now understand" branches, one per major M7/M8/M9 theme |
| `stillToRevisit` | `LearningMemoryRevisitEntry[]` | the **honest weak-area branch** (FR-4) — every weak-area entry from M7/M8/M9 grading is surfaced here, not hidden |

```ts
interface LearningMemoryTreeBranch {
  heading: string;                         // e.g. "Server Actions on apps/web"
  leaves: LearningMemoryLeaf[];            // concrete concepts under this branch
}

interface LearningMemoryLeaf {
  concept: string;                         // plain-language label of the concept understood
  filePath: string | null;                 // a real M6-named path when applicable
  source: {
    kind: "learning-unit" | "diff-review" | "challenge-attempt";
    rowId: number;                         // FK back to the M7/M8/M9 row that taught it (US-4)
    href: string;                          // route-relative link back to that row's surface
    label: string;                         // human-readable label of the source row
  };
}

interface LearningMemoryRevisitEntry {
  area: string;                            // the weak-area title — reuses M8 WeakArea.area
  explanation: string;                     // M8 WeakArea.explanation
  suggestion: string;                      // M8 WeakArea.suggestion
  fileRefs: string[];                      // M8 WeakArea.fileRefs — every entry resolves to a real M6 path
  source: {
    kind: "learning-unit" | "diff-review" | "challenge-attempt";
    rowId: number;                         // FK back to the M7/M8/M9 row whose grading produced this weak area
    href: string;                          // route-relative link back to that row's surface
    label: string;                         // human-readable label
  };
}
```

The composer (#179) reads `learning_units.weak_areas`,
`diff_reviews.weak_areas`, and `challenge_attempts.grading.weakAreas`
verbatim and surfaces every entry into `stillToRevisit`. **The page
must render `stillToRevisit` even when it is non-empty — never collapse
it by default and never hide individual entries (PRD FR-4 /
NFR-5).** The "still to revisit" branch is the honest-output affordance
of M10.

#### `InterviewQA[]` (§6d, US-1, FR-2 SDK-generated, FR-3 grounded)

```ts
interface InterviewQA {
  id: string;                              // stable id within the row
  question: string;                        // the interviewer-style question
  answer: string;                          // grounded answer (cites real files / stack entries)
  groundArea:
    | "stack"                              // grounded in M5
    | "architecture"                       // grounded in M6
    | "issue-learning"                     // grounded in M7
    | "diff-risk"                          // grounded in M8
    | "debug-expansion";                   // grounded in M9
  citedFiles: string[];                    // every entry resolves to a real M6 path
  citedStack: string[];                    // every entry resolves to a real M5 stack_explanations row
}
```

The bounded SDK call (#180) runs the M10 integrity check (#177) on the
output before persistence — every `citedFiles` resolves to an M6 path,
every `citedStack` resolves to an M5 row, or the output is rejected
(PRD FR-3 / NFR-5). The page trusts the persisted contract.

#### `ResumeBullet[]` (§6e, US-2, FR-2 SDK-generated, FR-3 grounded)

```ts
interface ResumeBullet {
  id: string;                              // stable id within the row
  text: string;                            // the "verb + outcome + technology" bullet, ≤ 160 chars (US-2)
  citedFiles: string[];                    // every entry resolves to a real M6 path
  citedStack: string[];                    // every entry resolves to a real M5 stack_explanations row
}
```

The bounded SDK call (#181) enforces the ≤ 160-char limit and the
integrity check at write time; the page trusts the persisted contract.

#### `DebugStory[]` (§6f, FR-2 deterministic, US-1 debug ground area)

```ts
interface DebugStory {
  challengeId: number;                     // FK back to the M9 challenges row
  challengeType: string;                   // human-readable M9 ChallengeType label
  taskSummary: string;                     // one-line plain-language summary from the M9 challenge
  attemptId: number;                       // FK back to the M9 challenge_attempts row
  explanationExcerpt: string;              // 2–4 sentences from the attempt's explanation
  gradingResult: {
    score: number;                         // 0–100 — the attempt's grading.score
    scoreLabel: string;                    // M9 grading.scoreLabel band
    summary: string;                       // M9 grading.summary
  };
  attemptedAt: Date;
  href: string;                            // route-relative link back to `/repos/[owner]/[repo]/challenges/[challengeId]`
}
```

The composer (#179) reads `challenge_attempts` + parent `challenges`
verbatim; the page renders one card per `DebugStory` (§6f).

### Per-section anchor IDs

The five major `<section>` elements carry the slugs from §4a so the
header anchor nav and any external deep link land on the right section:

| Slug | Section |
|---|---|
| `#architecture` | Architecture Explanation (§6b) |
| `#memory-tree` | Learning Memory Tree (§6c) |
| `#interview-qa` | Interview Q&A (§6d) |
| `#resume-bullets` | Résumé Bullets (§6e) |
| `#debug-stories` | Debug Stories (§6f) |

The slugs are stable and load-bearing — they are part of the page's
shareable contract.

## 6. Page sections

Top to bottom, single readable column (comfortable max width):

1. **Page header** — `{owner}/{repo}` as the `<h1>` title with the
   imported `ref` as a `Badge`; a one-line description: "Your learning
   memory + portfolio artifacts for this repository." A small, honest
   **"AI-generated Q&A and résumé bullets, grounded in your repo"**
   label sits in the header — real text, not an icon-only signal (ADR
   0005, §13).
2. **Top-level actions bar** — three buttons, in this order:
   **Regenerate memory**, **Export bundle (.zip)**, **Export PDF**.
   Behaviour per §8. The bar sits on the right of the header on wide
   screens, stacked under the title on mobile. Each is a small Client
   Component island invoking its Server Action (§8); the rest of the
   page is a React Server Component shell.
3. **Stale-data banner** — see §6a. Rendered conditionally above the
   anchor nav when `isMemoryStale(snapshotId)` returns `true` (FR-11).
4. **In-page anchor nav** — a compact horizontal list of five anchor
   links: "Architecture", "Memory tree", "Interview Q&A", "Résumé
   bullets", "Debug stories" — wired to the slugs in §5. Sticky on wide
   screens so it stays available while the user scrolls; not sticky on
   mobile (the page is short enough to scroll the nav back into view).
5. **The five artifact sections, in fixed order** — §6b → §6c → §6d →
   §6e → §6f. Each is a labelled `<section>` with its slug as `id` and
   a clearly headed `<h2>` matching the anchor-nav label.
6. **Footnote** — a quiet one-line footnote below the last section:
   "Cached per imported repository. Click *Regenerate memory* to refresh
   after working through more of M5–M9." This is the user-facing
   acknowledgement of FR-5 / FR-11.

### 6a. Stale-data banner (FR-11)

A clearly framed but calm banner sitting above the in-page anchor nav,
rendered **only when** `isMemoryStale(snapshotId)` returns `true` —
i.e. `learning_memories.generated_at` < `repo_snapshots.updated_at`
(PRD FR-11).

- **Copy (normative):** heading "Your learning memory may be out of
  date." Body: *"This repository's snapshot was updated after this
  memory was last generated. Click **Regenerate memory** to refresh
  the artifacts from your latest M5–M9 outputs."*
- **Action:** a secondary **Regenerate memory** button inside the
  banner that invokes the same Server Action as the header's primary
  Regenerate (§8). Convenience only — the header button stays the
  primary entry point.
- **Visual:** a calm `Alert` / `Banner` shadcn component, not an
  alarming color-only signal — the framing is conveyed by the heading
  text and an `info` / `clock` icon, never by red alone (§13).
- **Hidden when not stale.** When `isMemoryStale` returns `false`, the
  banner is absent (not greyed out, not a "memory up to date" badge —
  staleness is the exception worth surfacing; freshness is the default
  and is implicit in the absence of the banner).
- **Trigger condition is normative.** The banner trigger is exactly
  the FR-11 condition: `learning_memories.generated_at <
  repo_snapshots.updated_at`. The page does not show the banner for
  any other reason (e.g. it does not call the banner stale when the
  M5/M6/M7/M8/M9 rows have been individually edited — that scenario
  is out of scope per FR-11). Background auto-regeneration is
  out-of-scope (PRD Out of Scope); the banner is the only signal.

### 6b. Architecture Explanation (`#architecture`, US-3, FR-2 deterministic)

The first artifact section. A clearly headed `<h2>` — "Architecture
Explanation" — followed by the four parts of `ArchitectureExplanation`:

- The **`intro`** paragraph rendered first, generous spacing, as a
  short framing of what this project is.
- The **`stackSection`** rendered under an `<h3>` matching
  `stackSection.heading`. Paragraphs render as readable prose; cited
  files appear as monospace path chips after the prose (each is a
  `Badge` of `<code>{path}</code>`); cited stack entries appear as
  calm chips with the stack technology name.
- The **`architectureSection`** rendered identically under its own
  `<h3>`.
- The **`keyFlowsSection`** rendered identically under its own
  `<h3>`.

A short intro line under the `<h2>` frames the section: *"Composed
deterministically from your stack explainer and project map — no LLM
call, never hallucinates against your data."* (PRD FR-2 / FR-3 /
NFR-5.) When any of the four parts is missing (`intro === ""`,
`citedFiles.length === 0`, etc. — the deterministic-composer
"missing-input" degradation per task #179 AC), the section renders an
inline "Not yet — generate your stack explanation / project map first"
note rather than an empty heading.

### 6c. Learning Memory Tree (`#memory-tree`, US-4, FR-4 — honest output)

The honest-output centerpiece of M10. A clearly headed `<h2>` —
"Learning Memory Tree" — followed by:

- A short intro line: *"Things you now understand about this repo, and
  the M7 / M8 / M9 row that taught each one."*
- The **`branches`** array rendered as a vertical list of branches.
  Each branch shows `branches[].heading` as an `<h3>` followed by a
  `<ul>` of leaves; each leaf shows `concept` as the entry title, the
  optional `filePath` as a monospace path chip when present, and the
  `source` rendered as a small "Learned in {label}" link to
  `source.href` — the back-pointer to the M7 / M8 / M9 row that taught
  the leaf (PRD US-4 acceptance: *"with a link back to the M7 / M8 / M9
  row that taught it"*).
- The **`stillToRevisit`** array rendered as a clearly distinct
  sub-section — an `<h3>` reading "Still to revisit" with a short
  framing line: *"Weak-area entries from your M7 / M8 / M9 grading.
  These are what you should brush up on before an interview."* Each
  `LearningMemoryRevisitEntry` renders as a `Card`-shaped block
  showing `area` as the heading, `explanation` + `suggestion` as
  prose, `fileRefs` as monospace path chips, and the `source` link
  back to the M7 / M8 / M9 row whose grading produced the entry. **The
  block is always visually present when `stillToRevisit.length > 0`;
  it is never collapsed by default and individual entries are never
  hidden (PRD FR-4 / NFR-5).** This is the honest-output stance — the
  page surfaces what the user doesn't know yet, it does not soften it.

When `branches.length === 0` and `stillToRevisit.length === 0`, render
an inline "Not yet — work through some issues, diffs, and challenges
to build your memory tree" note. When `branches.length > 0` but
`stillToRevisit.length === 0`, render only the "Still to revisit"
heading with a quiet "Nothing currently flagged — keep working through
challenges to keep it honest" note rather than omitting the sub-section
silently (the absence of weak areas should still be visible, not
inferred).

### 6d. Interview Q&A (`#interview-qa`, US-1, FR-2 SDK-generated)

A clearly headed `<h2>` — "Interview Q&A" — followed by:

- A short intro line: *"Generated by a bounded Anthropic SDK call from
  your M5/M6/M7/M8/M9 rows; every answer cites a real file path or
  stack entry from your repo."*
- The **`interviewQa`** array rendered as a vertical list of expandable
  Q&A entries (`Accordion` or stacked `Card`s, **all visible** — none
  collapsed by default; M10's read surface is for skimming + reading).
  Each entry shows the `question` as an `<h3>`, the `answer` as readable
  prose, the `groundArea` as a small `Badge` with a human-readable
  label ("Stack", "Architecture", "Issue learning", "Diff & risk",
  "Debug & expansion"), and `citedFiles` + `citedStack` as monospace
  chips at the bottom of the entry.

When `interviewQa.length === 0`, render an inline "Not yet generated —
click *Regenerate memory* in the header" note rather than an empty
heading.

### 6e. Résumé Bullets (`#resume-bullets`, US-2, FR-2 SDK-generated)

A clearly headed `<h2>` — "Résumé Bullets" — followed by:

- A short intro line: *"Generated by a bounded Anthropic SDK call;
  ≤ 160 characters each, in industry-standard verb + outcome +
  technology form. Select and copy any bullet, or grab the full set
  in the markdown bundle."*
- The **`resumeBullets`** array rendered as a `<ul>` of bullets. Each
  bullet's `text` is the primary content; `citedFiles` + `citedStack`
  render as a quiet "grounded in" sub-line of monospace chips under
  each bullet (so a returning user can see *why* the bullet is
  defensible).

When `resumeBullets.length === 0`, render an inline "Not yet
generated — click *Regenerate memory* in the header" note.

The page does **not** add a copy-to-clipboard button per bullet — per
PRD Out of Scope, copy-to-clipboard per artifact is explicitly dropped.
The user copies from the rendered text or from the exported
`resume-bullets.md`.

### 6f. Debug Stories (`#debug-stories`, US-1 debug ground area, FR-2 deterministic)

A clearly headed `<h2>` — "Debug Stories" — followed by:

- A short intro line: *"Composed deterministically from your M9
  challenge attempts — what you tried, what you scored, and the
  feedback the grader gave."*
- The **`debugStories`** array rendered as a vertical list of `Card`s,
  one per story. Each card shows: `challengeType` as the card title,
  `taskSummary` underneath, `explanationExcerpt` as a calm pull-quote-
  shaped block, the `gradingResult` as a compact "{score}/100 ·
  {scoreLabel}" line with `summary` as a single feedback sentence, the
  `attemptedAt` as a muted "Attempted {attemptedAt}" line, and a
  "View this challenge →" link to `href` (back to the M9 Challenge
  Detail page).

When `debugStories.length === 0`, render an inline "Not yet — work
through some M9 challenges to populate your debug stories" note.

## 7. Input fields

The Portfolio Page has **no free-text input** and **no data-mutating
text input**. The three top-level actions (§8) are buttons that invoke
Server Actions; the in-page anchor nav (§4 / §6) is read-only. There
is no search, no filter, no sort control on the page — the artifacts
ship in their composed / generated order.

## 8. Primary actions

Three top-level actions sit in the header (§6 item 2) — three small
Client Component islands wired to Server Actions (§5). All three are
**server-only** at execution time (no client-side SDK access, no
client-side PDF rendering).

- **Regenerate memory** — invokes `regenerateMemory(snapshotId)` (§5).
  Re-runs the two bounded SDK calls (`generateInterviewQA`,
  `generateResumeBullets`) + the three deterministic composers,
  integrity-checks the SDK outputs via the M10 integrity module (#177),
  upserts the `learning_memories` row, and revalidates the route.
  Behaviour:
  - **Confirmation dialog.** Because the action issues two bounded
    LLM calls (several seconds, cost), the button shows a confirmation
    `AlertDialog` when the current memory row exists with any
    `interviewQa` or `resumeBullets` content. The dialog reads:
    "Regenerate your learning memory? Your existing cached artifacts
    will be replaced; M5–M9 rows are not affected." For a first-open
    (no row yet) the click invokes directly without a dialog — this is
    the user's first chance to populate the memory.
  - **In-progress state.** While the action runs, the button shows a
    spinner and is disabled with an accessible status reading
    "Regenerating your learning memory…". The rest of the page stays
    visible and readable — the user can keep reading the previous
    cached version while regeneration runs.
  - **Failure — no API key.** When `ANTHROPIC_API_KEY` is unset and
    the user clicks Regenerate, the action returns a typed
    `missing-api-key` error and the page renders a quiet inline error
    next to the button: *"Set `ANTHROPIC_API_KEY` in your `.env` to
    regenerate the AI-generated Q&A and résumé bullets."* The page
    itself stays readable — viewing is API-key-free (PRD FR-8).
  - **Failure — integrity check rejected.** When the bounded SDK
    output fails the integrity check (#177), the action returns a
    typed `integrity-failure` error and the inline error reads:
    *"Couldn't ground the new artifacts against your repo. Try
    regenerating; if it keeps failing, your project map or stack
    explainer may need a refresh."* The previous cached row is
    retained.
  - **Failure — other.** Any other failure (rate limit, network)
    shows *"Couldn't regenerate. Try again."* No raw stack trace.
- **Export bundle (.zip)** — invokes `exportPortfolioBundle(snapshotId)`
  (§5). Triggers a browser download of the M10 markdown bundle ZIP
  (per-type `.md` files plus combined `portfolio.md`, filename
  contains `owner-repo-snapshot.id` per PRD US-6). Disabled when
  `getMemory` returned `null` — there is nothing to export yet. In-
  progress shows a small spinner on the button; failure surfaces an
  inline error next to the button.
- **Export PDF** — invokes `exportPortfolioPdf(snapshotId)` (§5).
  Triggers a browser download of the rendered PDF (filename contains
  `owner-repo-snapshot.id` per PRD US-6). Disabled when `getMemory`
  returned `null`. In-progress + failure handling mirror Export
  bundle.

No destructive actions — the page never deletes a memory row, a
snapshot, or any M5–M9 data. Regenerate **replaces** the cached row
in place; the M5–M9 rows it reads from are untouched (FR-10).

## 9. Loading state

While the server reads run (`getSnapshotByOwnerRepo`, `getMemory`,
`isMemoryStale`), render a skeleton portfolio layout via
`app/portfolio/[owner]/[repo]/loading.tsx`:

- A header bar (title + actions-bar placeholder + AI-generated label).
- A faint banner-sized placeholder where the stale-data banner would
  sit (only the silhouette — no copy).
- An anchor-nav placeholder (five chip-sized blocks).
- Five `<section>` placeholders matching the five artifact sections,
  each with an `<h2>`-shaped block and a few prose-paragraph
  placeholders + a few chip-shaped placeholders.

Use shadcn `Skeleton`. The data source is local SQLite, so loading is
brief — but the state must exist so the page never flashes empty.

**Section-level skeletons inside the page** are an acceptable
alternative when the integrator (#184) prefers per-section loading —
the artifact sections each render their own `<Suspense>` boundary with
a skeleton fallback. Either choice satisfies this spec; the integration
notes (#184) document which one shipped.

The page **never** shows an LLM-in-progress state on render — the
"in progress" only appears inside the Regenerate button (§8) when the
user explicitly clicks it. Opening the URL with `ANTHROPIC_API_KEY`
unset must still render the cached page (FR-8 / NFR-3) — no spinner
because no LLM call is happening.

## 10. Empty state

A learning memory has two empty shapes:

- **No memory row yet (first open of the page for this snapshot)** —
  `getMemory(snapshotId)` returns `null`. The page renders a calm
  full-page panel inside the main content area: heading "No learning
  memory yet for this repository", a short explanation that M10 caches
  artifacts on first generation, and a primary **Generate memory**
  button that invokes the same `regenerateMemory` Server Action as the
  header's Regenerate. The anchor nav, the five artifact sections, and
  the stale-data banner are absent in this state (there is nothing to
  render yet). The header (title, actions bar with Export bundle /
  Export PDF disabled, AI-generated label) stays visible.
- **Memory row exists but a section is empty** — handled per-section
  inline (§6b / §6c / §6d / §6e / §6f). Each section renders its
  "Not yet — …" inline note rather than disappearing. Empty sections
  appear in the anchor nav (the slug is still valid) — the page does
  not silently drop sections.

Both are **resting states**, not errors. A repo with no M5/M6/M7/M8/M9
rows yet is the normal first-open shape — the empty state is the
honest first impression, not a failure.

## 11. Error state

Expected failures are **in-page error states** or full-page error
panels with a heading, a plain-language explanation, and a recovery
action — never raw stack traces or DB errors:

- **`not-found` — repo not imported** — `getSnapshotByOwnerRepo`
  returns `null`. Call Next.js `notFound()` and render
  `app/portfolio/[owner]/[repo]/not-found.tsx`: heading "This
  repository isn't imported yet.", a short explanation, and an
  "Import this repository" link to `/import` (M11 reuse, ADR 0009).
- **`load-failure`** — the data layer throws (unexpected). The route
  `error.tsx` boundary renders a friendly full-page error: heading
  "Couldn't load your learning memory", a short explanation, and a
  "Try again" button (`reset()`). No raw stack trace.
- **`missing-api-key` (Regenerate only)** — handled in-place next to
  the Regenerate button (§8), not as a page-level error. The page
  itself stays readable — viewing the cached memory is API-key-free
  (PRD FR-8).
- **`integrity-failure` (Regenerate only)** — handled in-place next
  to the Regenerate button (§8). The previous cached row is retained;
  the page stays readable.
- **`export-failure` (Export bundle / PDF only)** — handled in-place
  next to the export button. The cached row is unaffected.
- **Unresolved file / stack reference** — if any `citedFiles`,
  `citedStack`, `fileRefs`, or `filePath` defensively fails to resolve
  against the M6 project map or M5 stack explanation, render it as
  plain text with a quiet inline flag — **never crash the page**. The
  M10 integrity check (#177) is supposed to prevent this at write
  time, but the page must be resilient if the contract drifts.

Not-found (expected: unknown owner/repo) and load-error (unexpected:
data layer failed) are deliberately separate states with different
copy.

## 12. Success state

- The page renders the header (title, ref badge, AI-generated label),
  the actions bar (Regenerate / Export bundle / Export PDF), the
  stale-data banner (only when stale), the in-page anchor nav, and
  the five artifact sections **in the fixed order** Architecture →
  Memory Tree → Q&A → Résumé Bullets → Debug Stories. Every field of
  `LearningMemory` (§5) has a home in the layout.
- **Fresh memory** (`isMemoryStale === false`): no banner; the anchor
  nav and the five sections render.
- **Stale memory** (`isMemoryStale === true`): the banner appears
  above the anchor nav (§6a); the cached sections still render —
  staleness does not hide the content, it labels it.
- **First-open** (`getMemory === null`): the empty-state panel
  (§10) renders inline; the header stays visible with Export buttons
  disabled.
- **After successful Regenerate**: the action revalidates the route;
  the page re-renders with the new `generated_at` (banner gone or
  refreshed). The user sees the new content without leaving the page.
- **After successful Export bundle / Export PDF**: the browser starts
  the download; the page is unchanged.
- Success is implicit (content shown) — there is no "memory generated"
  confirmation banner; the populated sections *are* the answer.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (the `owner/repo` title); the
  five artifact section headings are `<h2>` with their slug as `id`;
  the sub-headings inside Architecture (`stackSection.heading`,
  `architectureSection.heading`, `keyFlowsSection.heading`), Memory
  Tree (per `branches[].heading` + "Still to revisit"), and Q&A (per
  `question`) are `<h3>` — heading order descends without skipping.
  Use `<main>`, `<nav>` (the in-page anchor nav), and `<section>`
  landmarks. Each anchor nav link uses `href="#<slug>"` and the
  matching `<section id="<slug>">` is the target.
- **Anchor nav.** The anchor nav is a labelled `<nav
  aria-label="In-page sections">` containing a `<ul>`/`<li>` of
  links. Activating a link scrolls to the section and focuses its
  `<h2>` (`tabIndex={-1}`).
- **Stale-data banner.** The banner is a real text region (not
  color-only) headed "Your learning memory may be out of date." with
  an `<button>` action. The banner uses `role="status"` or
  `aria-live="polite"` so assistive tech announces it on appearance.
  The icon is decorative (`aria-hidden`) — the heading carries the
  meaning.
- **Top-level actions.** The Regenerate / Export bundle / Export PDF
  buttons are real `<button>` elements with clear accessible names.
  The confirmation `AlertDialog` for Regenerate is a real
  `AlertDialog` with focus trap and Esc-to-dismiss. The in-progress
  state uses `aria-busy="true"` and a status reading "Regenerating
  your learning memory…" / "Building your bundle…" / "Building your
  PDF…". Inline errors are announced via an `aria-live="polite"`
  region next to each button.
- **Memory tree "Still to revisit" sub-section.** Each revisit entry
  is a real `<article>` (or `<section>`) with its `area` as an
  `<h4>`; the `source` link is a real `<a>`. The sub-section is
  **never** collapsed by default (FR-4) — a screen reader reads it
  inline as part of the page.
- **Path chips & stack chips.** File paths are `<code>` inside the
  chip; each chip's accessible name names the path. Stack chips name
  the technology. Long lists wrap — nothing meaningful is hidden
  behind hover.
- **AI-generated label.** The "AI-generated Q&A and résumé bullets,
  grounded in your repo" framing is real, announced text — not a
  color-only or icon-only signal.
- **Reading order.** DOM order = visual order: header → actions bar
  → stale banner (when present) → anchor nav → §6b → §6c → §6d →
  §6e → §6f → footnote. Logical for a screen reader top to bottom.
  The actions bar can sit visually to the right of the title on wide
  screens, but the DOM order keeps it after the title (or before, in
  a single nav landmark) — never split across the page in a way
  that breaks reading order.
- **Loading state.** Skeletons are decorative and `aria-hidden`; the
  loading region carries `aria-busy="true"`.
- **Keyboard.** Full keyboard operability in logical order: the
  anchor nav links, the three top-level action buttons (and the
  Regenerate confirmation dialog), each `source` back-link in the
  memory tree, each Q&A heading (if rendered in an `Accordion`),
  each Debug-Story "View this challenge →" link. Enter/Space
  activate. Visible focus ring throughout. DOM order = visual
  order.
- **Color & contrast.** WCAG 2.1 AA in light and dark themes
  (`next-themes`). The `ref` badge, the AI-generated label, the
  stale-data banner, the ground-area badges on Q&A entries, and the
  score line on Debug Stories convey meaning by text + icon, not
  color alone.
- **Targets.** Interactive targets (anchor links, action buttons,
  source back-links, dialog controls) are comfortably sized for
  pointer and touch.

## 14. Acceptance criteria

- [ ] `/portfolio/[owner]/[repo]` renders the Portfolio Page
      server-side from the typed M10 data-access layer
      (`getMemory`, `isMemoryStale`) and the M11 snapshot DAL
      (`getSnapshotByOwnerRepo`) — no client fetch, no API route
      (ADR 0006).
- [ ] **Viewing requires no `ANTHROPIC_API_KEY` and no live
      network** (PRD FR-8 / NFR-3). LLM calls only happen inside
      the `regenerateMemory` Server Action when the user clicks
      Regenerate. Opening the URL with the key unset renders the
      cached page successfully.
- [ ] The page renders the **five artifact sections in fixed
      order** — Architecture Explanation → Learning Memory Tree →
      Interview Q&A → Résumé Bullets → Debug Stories — on **one
      route** with no per-artifact sub-routes (PRD US-5 / §4a).
- [ ] Each section's `<section id>` matches its slug
      (`#architecture`, `#memory-tree`, `#interview-qa`,
      `#resume-bullets`, `#debug-stories`) and the header's
      **in-page anchor nav** links to those slugs in the same
      order (§5 / §6).
- [ ] The **three top-level actions** — Regenerate memory, Export
      bundle (.zip), Export PDF — are present in the header
      (§6 item 2 / §8), each invoking its Server Action per §5.
      Export buttons are disabled when `getMemory` returns `null`.
- [ ] The **stale-data banner** (§6a) appears above the anchor nav
      when `isMemoryStale(snapshotId)` returns `true`
      (i.e. `learning_memories.generated_at <
      repo_snapshots.updated_at`, PRD FR-11) with the normative
      copy and an inline Regenerate action; it is absent when not
      stale.
- [ ] The page binds to the **real TypeScript shapes** in §5 —
      `InterviewQA[]`, `ResumeBullet[]`,
      `ArchitectureExplanation` (with `intro`, `stackSection`,
      `architectureSection`, `keyFlowsSection` of
      `ArchitectureExplanationSection`), `LearningMemoryTree`
      (with `branches: LearningMemoryTreeBranch[]` +
      `stillToRevisit: LearningMemoryRevisitEntry[]`), and
      `DebugStory[]` — declared by task **#176** and populated by
      tasks **#179** / **#180** / **#181**.
- [ ] **Drift-watch (§5).** The integration task #184 diffs the
      shipped types from `packages/db` against the §5 shapes
      before binding, and records any drift in
      `docs/design/ui-integration-notes/portfolio-page.md` — the
      M8 spec ↔ shape drift retro lesson is honored.
- [ ] **Honest output (FR-4 / NFR-5).** The Learning Memory Tree's
      `stillToRevisit` branch is rendered when populated, is
      **never** collapsed by default, and surfaces every weak-area
      entry from M7 / M8 / M9 grading with its source link back to
      the row that produced it (§6c / US-4).
- [ ] **Project-grounded.** Every cited file / cited stack
      reference in any of the five sections resolves to a real M6
      project_maps node or a real M5 stack_explanations row; the
      M10 integrity check (#177) enforces this at write time, and
      the page renders defensively-unresolved references as plain
      text with a quiet inline flag (§11) rather than crashing
      (PRD FR-3 / NFR-5).
- [ ] **Empty state** — `getMemory` returning `null` renders the
      first-open panel (§10) with a primary **Generate memory**
      action; per-section empties render their "Not yet — …"
      inline notes rather than silently disappearing.
- [ ] **Loading** state shows a skeleton portfolio layout
      (header, banner placeholder, anchor-nav placeholder, five
      section placeholders) or per-section `<Suspense>`
      skeletons; the page never shows an LLM-in-progress state on
      render.
- [ ] **Error** states cover `not-found` ("Import this
      repository" → `/import`), `load-failure` (`error.tsx` with
      "Try again"), `missing-api-key` (inline next to Regenerate),
      `integrity-failure` (inline next to Regenerate, previous
      cache retained), and `export-failure` (inline next to the
      export button) — each with a distinct copy and recovery
      action. No raw stack traces.
- [ ] The page reads as one product with the M2 / M3 / M4
      Catalog / Registry / Recommendation pages, the M6 Project
      Map, the M7 Issue Learning Workspace, the M8 Diff Review,
      and the M9 Challenge Detail / List pages — shared layout,
      spacing, calm, content-first tone.
- [ ] **Claude Design (ADR 0007)** is the UI generation tool. v0
      is **not** used. This spec must be human-reviewed before
      the Claude Design prompt
      (`docs/design/ui-prompts/portfolio-page.md`) is run.
- [ ] Uses **only** `packages/ui` (shadcn/ui) components.
- [ ] Accessibility notes in §13 are satisfied (one `<h1>`,
      ordered headings, landmarks, list semantics, real-text
      stale banner, accessible action buttons + AlertDialog,
      labelled anchor nav, text-not-color status, keyboard
      operability, AA contrast).
