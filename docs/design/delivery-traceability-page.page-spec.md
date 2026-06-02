# Page Spec: Delivery Traceability Page

Issue: #204 · Epic: `ccpm-integration` (M12) · PRD: `.claude/prds/ccpm-integration.md` (US-1, US-2, US-3, US-4, US-5; FR-1…FR-7)

This spec defines the **Delivery Traceability Page** for Milestone 12 — the
single new user-facing surface introduced by `ccpm-integration`. It is the input
to the Claude Design prompt (`docs/design/ui-prompts/delivery-traceability-page.md`)
and to the integration task **#205**. It must be human-reviewed before the prompt
is run.

(UI tool: **Claude Design** — see ADR 0007. Page Spec → prompt under
`docs/design/ui-prompts/` → Claude Design draft → integration notes under
`docs/design/ui-integration-notes/`. v0 is **not** used.)

The page shares layout, components, and tone with the M2/M3/M4
Catalog/Registry/Recommendation pages, the M5 Stack page, the M6 Project Map,
the M7 Issue Learning Workspace, the M8 Diff Review, the M9 Challenge pages, and
the M10 Portfolio page, so the whole app reads as one product.

> **Two states, one route.** Most of the product's real users imported a repo
> that uses **no** spec-driven workflow — so the page's **primary** job for the
> common case is the **graceful-degradation educational state** (§10b / US-4),
> not the map. The populated map (§6b) is the CCPM-repo case (incl. dogfooding
> this very repository).

> **No network, no API key at view time (ADR 0009 / PRD FR-4 NFR).** The page
> reads only the local snapshot: parsed artifacts from `repo_files` and the
> issue/PR links from `ccpm_issue_links`, both produced earlier **at import**.
> Opening the URL with `GITHUB_TOKEN` and `ANTHROPIC_API_KEY` unset must
> succeed — the teaching layer is **deterministic, no LLM** (epic AD-3).

---

## 1. Page name

**Delivery Traceability Page** — a per-repository page at
`/delivery/[owner]/[repo]` that reconstructs **how an imported repository was
delivered**: the PRD → Epic → Task → Issue → PR chain, with a beginner-first
teaching layer explaining the spec-driven workflow. When the repo uses no CCPM
workflow, the page degrades to an educational explainer of what a spec-driven
workflow is and why it matters, linking to the M2 "Agentic CCPM Workflow" Golden
Path.

## 2. User goal

> "I imported a repo. If it was built with a spec-driven workflow, show me the
> chain from requirement to shipped code — which PRD drove which epic, which
> tasks it broke into, which GitHub issue and PR closed each one — and teach me
> *why* it's shaped that way so I can explain it in an interview. If it wasn't,
> tell me plainly and teach me what that workflow is and why a hiring manager
> values it."

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, 0–1 years, one or two AI-built portfolio projects she cannot
confidently defend. She can describe *features* but not *process* — and "how did
you manage and ship this work?" is a routine interview question. This page gives
her either the evidence (the traceability map) or the literacy (the educational
state) to answer it.

Design implications:

- **Degradation is a first-class state, not an error.** Most imported repos have
  no `.claude/` workflow. "No spec-driven workflow detected" must read as a calm,
  educational resting state with a clear next step — never a failure (§10b).
- **Process literacy over jargon.** Every artifact type carries a beginner-first
  explanation (PRD / epic / task / issue+PR) that names the professional value
  (traceability, bounded work, reviewable scope) — parameterized with the repo's
  real numbers, never generic boilerplate.
- **Honest about what's tracked.** A task with no GitHub issue is shown as "not
  tracked", not dropped or faked. A link that couldn't be resolved shows a
  calm, beginner-safe reason — never a raw HTTP code.
- **Local-first, said plainly.** Viewing needs no token and no network; the
  small header note says so.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the page shell.

| Route | Purpose | File |
|---|---|---|
| `/delivery/[owner]/[repo]` | The Delivery Traceability Page for one imported repo's snapshot | `apps/web/app/delivery/[owner]/[repo]/page.tsx` |

- **Route convention note (refines epic AD-5).** The epic sketched
  `/delivery/[owner]`, but the data layer keys on **owner + repo**
  (`getDeliveryMap(owner, repo, ref?)`), and the shipped per-repo pages use
  `/[name]/[owner]/[repo]` (e.g. M10 `/portfolio/[owner]/[repo]`). This spec
  finalizes the route as **`/delivery/[owner]/[repo]`** for consistency.
- `[owner]` / `[repo]` come from the M11 snapshot identity; the page reads the
  **current snapshot** for that repo (ref handling matches the M6/M7/M10
  convention). **No new GitHub access path** — identity comes from the shipped
  `getImportedRepo` DAL.
- A route-level **`loading.tsx`** (the local SQLite reads) and **`error.tsx`**
  (render-time failures only). A **`not-found.tsx`** covers "owner/repo isn't
  imported". There are **no per-artifact sub-routes** — the whole map renders on
  this one route.

## 5. Data source / contract

The page is a **thin server-side view** over the typed M12 data-access layer
(`@workspace/db/ccpm`, task **#203**). No client-side fetching, no API route —
Server Components call the data layer directly (ADR 0006). There are **no Server
Actions and no mutations** on this page — it is read-only.

```ts
// M12 — the single read. Composes parse (#198) → graph (#200) → teaching (#202)
// and joins persisted issue/PR links (#201). Offline: no network, no live FS.
getDeliveryMap(
  owner: string,
  repo: string,
  options?: { ref?: string },
): Promise<DeliveryMapResult>

// M11 — snapshot identity for the route / not-found. Reused as-is (ADR 0009).
getImportedRepo(
  owner: string,
  repo: string,
  ref?: string,
): Promise<RepoSnapshot | null>
```

`getImportedRepo` returning `null` is the "repo not imported" not-found state
(§11). `getDeliveryMap` **never returns null** — it returns either a populated
`map` or the `absent` degradation result, both of which the page renders.

### `DeliveryMapResult` — the M12 read contract

The exact TypeScript ships in `packages/db/src/ccpm` (tasks **#200**, **#202**,
**#203**); if the merged code differs at integration time the merged code is
authoritative, but the *shape* below is fixed by the epic and must not change
without updating this spec.

```ts
type DeliveryMapResult = DeliveryMap | DeliveryMapAbsent

interface DeliveryMap {
  kind: "map"
  map: CcpmTraceabilityMap          // #200 — nodes + edges + stats
  teaching: CcpmTeaching            // #202 — headline + concepts + value
  links: Record<string, CcpmIssueLink>  // #201 — keyed by task.taskRef
}

interface DeliveryMapAbsent {
  kind: "absent"
  detection: NoCcpmWorkflow         // { kind:"absent"; searched: string[] }
  teaching: CcpmDegradationTeaching // educational copy + Golden Path pointer
}
```

#### `CcpmTraceabilityMap` (#200) — what the map renders

```ts
interface CcpmTraceabilityMap {
  kind: "map"
  prds: CcpmPrdNode[]       // PRDs with their linked epics nested
  orphanEpics: CcpmEpicNode[] // epics that resolve to no PRD — shown, not dropped
  stats: CcpmMapStats
}
interface CcpmMapStats {
  prdCount: number; epicCount: number; taskCount: number
  syncedTaskCount: number; closedTaskCount: number; archivedEpicCount: number
}
interface CcpmPrdNode {
  name: string; status: string | null; description: string | null
  epics: CcpmEpicNode[]; path: string
}
interface CcpmEpicNode {
  name: string; epicDir: string; archived: boolean
  status: string | null; progress: string | null
  prdName: string | null; issueNumber: number | null
  synthetic: boolean        // true when no epic.md exists (tasks-only epic)
  tasks: CcpmTaskNode[]; path: string
}
interface CcpmTaskNode {
  taskRef: string; taskId: string; name: string
  status: string | null; archived: boolean
  issueNumber: number | null
  synced: boolean           // true when the task carries a github: issue ref
  dependsOn: number[]; path: string
}
```

#### `CcpmTeaching` (#202) — the teaching layer

```ts
interface CcpmTeaching {
  kind: "map"
  headline: string                 // one-line delivery summary with real counts
  concepts: CcpmConcept[]          // one per artifact type, parameterized
  professionalValue: string[]      // hiring-manager value bullets
}
interface CcpmConcept {
  artifact: "prd" | "epic" | "task" | "issue-link"
  title: string                    // e.g. "PRD — the requirement"
  body: string                     // beginner-first copy, real numbers
}
```

#### `CcpmIssueLink` (#201) — per-task issue/PR link (joined by `taskRef`)

```ts
interface CcpmIssueLink {
  taskRef: string; issueNumber: number
  issueState: "open" | "closed" | null   // null when linking failed
  closingPrNumber: number | null
  closingPrUrl: string | null
  closingPrTitle: string | null
  failureReason: string | null           // beginner-safe; no raw HTTP codes
}
```

#### `CcpmDegradationTeaching` (#202) — the educational state

```ts
interface CcpmDegradationTeaching {
  kind: "absent"
  title: string                    // "No spec-driven workflow detected"
  body: string                     // what CCPM is + why it matters in interviews
  searched: string[]               // e.g. [".claude/prds/", ".claude/epics/"]
  goldenPath: { label: string; slug: string } // M2 — "agentic-ccpm-workflow"
}
```

> **Drift-watch (M8 retro lesson).** Integration task #205 must diff the shipped
> types in `packages/db/src/ccpm` against the shapes above before binding, and
> record any drift in `docs/design/ui-integration-notes/delivery-traceability-page.md`.

## 6. Page sections

The page renders one of **two** top-level shapes depending on
`getDeliveryMap(...).kind`: the **map** (§6b) or the **degradation** state
(§6c). Both share the header (§6a).

### 6a. Page header (both states)

- `{owner}/{repo}` as the `<h1>` title with the imported `ref` as a `Badge`.
- A one-line description: "How this repository was delivered — from requirement
  to shipped code."
- A small, honest **"Read-only · local snapshot · no network"** note (real text,
  not icon-only) — on-thesis with ADR 0009.
- A "Re-import to refresh" link to `/import` (M11 reuse) — the only way to
  refresh the snapshot and re-resolve links; the page itself never mutates.

### 6b. Populated map (`kind === "map"`)

Top to bottom, single readable column:

1. **Teaching headline** — `teaching.headline` rendered prominently (the
   one-line delivery summary with real counts), with a compact **stats strip**
   from `map.stats`: PRDs · epics · tasks · "{syncedTaskCount} tracked" ·
   "{closedTaskCount} done" · "{archivedEpicCount} archived". Text + icon, never
   color alone.
2. **The traceability map** — a vertical, indented tree:
   - **PRD nodes** (`map.prds`) as top-level cards: `name` heading, optional
     `description`, a `status` badge. Each carries a small **teaching popover/
     disclosure** sourced from the `prd` concept (`teaching.concepts`).
   - **Epic nodes** nested under their PRD (`prd.epics`): `name`, a `status` +
     `progress` badge, and the epic's `issueNumber` as an "Epic #N" chip when
     present. A `synthetic` epic (no `epic.md`) is labelled "(inferred from
     tasks)". The `epic` teaching concept attaches here.
   - **Task nodes** nested under their epic (`epic.tasks`): `name`, a `status`
     chip, a `dependsOn` hint ("depends on #a, #b") when non-empty, and the
     **issue/PR link status** (see §6b-i). The `task` + `issue-link` concepts
     attach at the task/issue level.
   - **`orphanEpics`** render in a clearly labelled "Epics without a PRD"
     group below the PRD-rooted tree — shown, never dropped (US-1). Archived
     epics (`archived === true`) carry an "Archived" badge.
3. **Professional value panel** — `teaching.professionalValue` as a short
   bulleted list under a heading like "Why this matters in an interview".

#### 6b-i. Per-task issue/PR link status (US-1, US-3)

For each task node, render its link status from `links[task.taskRef]`:

| Condition | Render |
|---|---|
| `task.synced === false` | muted chip **"Not tracked as a GitHub issue"** |
| synced, no `links[taskRef]` entry | chip **"Issue #{issueNumber}"** (links resolved at import not run yet) |
| `link.issueState === "open"` | chip **"Issue #{n} · open"** |
| `link.issueState === "closed"`, `closingPrNumber` set | chip **"Issue #{n} · closed · PR #{m}"**, PR links to `closingPrUrl` |
| `link.issueState === "closed"`, no PR | chip **"Issue #{n} · closed"** |
| `link.failureReason` set (`issueState === null`) | calm chip **"Issue #{n} · couldn't link"** with `failureReason` as the inline explanation / tooltip — **never a raw HTTP code** |

Status is conveyed by **text + icon**, never color alone (§13).

### 6c. Degradation / educational state (`kind === "absent"`, US-4)

A calm, full-width educational panel — **not** an error:

- Heading: `teaching.title` ("No spec-driven workflow detected").
- Body: `teaching.body` (what a spec-driven workflow is, and why "how did you
  manage this work?" is an interview question it answers).
- A quiet "We looked for: {searched.join(', ')}" line echoing
  `detection.searched`, so the user sees *what* was checked.
- A primary link to the **M2 Golden Path**: "Learn the Agentic CCPM Workflow →"
  → `/catalog/{teaching.goldenPath.slug}` (i.e. `/catalog/agentic-ccpm-workflow`).
- A secondary "Import a different repository" link to `/import`.

## 7. Input fields

The page has **no input fields** — no search, filter, sort, or free text. The
map's teaching popovers/disclosures are read-only progressive disclosure.

## 8. Primary actions

**None that mutate.** The page is read-only (links are resolved at import, not
here). The only navigations are: the header "Re-import to refresh" → `/import`,
the per-task closing-PR external link → `closingPrUrl`, and (degradation state)
the Golden Path link → `/catalog/agentic-ccpm-workflow` and "Import" → `/import`.
There is no Server Action on this page.

## 9. Loading state

While the server reads run (`getImportedRepo`, `getDeliveryMap`), render a
skeleton via `loading.tsx`: a header bar, a headline/stats placeholder, and a few
indented tree-row placeholders (PRD → epic → task silhouettes). Use shadcn
`Skeleton`; the source is local SQLite so loading is brief, but the state must
exist so the page never flashes empty. The page **never** shows a network/LLM
in-progress state — nothing async to GitHub happens at view.

## 10. Empty state

- **Not a CCPM repo** — `getDeliveryMap` returns `kind: "absent"`: the
  degradation/educational state (§6c) **is** the resting "empty" shape. This is
  the common case and must read as calm and educational, not as a failure.
- **CCPM repo, links not yet resolved** — `kind: "map"` with `links === {}`:
  the map still renders fully; each synced task shows the plain "Issue #{n}" chip
  (§6b-i) without a resolved state. The map is never blank just because linking
  hasn't run.

## 11. Error state

Expected failures are in-page states or full-page panels — never raw stack
traces or DB errors:

- **`not-found` — repo not imported** — `getImportedRepo` returns `null`. Call
  `notFound()` and render `not-found.tsx`: heading "This repository isn't
  imported yet.", a short explanation, and an "Import this repository" link to
  `/import`.
- **`load-failure`** — the data layer throws (unexpected). `error.tsx` renders a
  friendly full-page error: "Couldn't load the delivery map", a short
  explanation, and a "Try again" button (`reset()`). No raw stack trace.
- **Per-task link failure** — `link.failureReason` is rendered inline on the
  task (§6b-i), never as a page-level error. The map still renders.
- **Defensive unresolved node** — the page renders any unexpected/empty field as
  plain text rather than crashing.

`not-found` (expected: unknown owner/repo) and `load-failure` (unexpected: data
layer failed) are deliberately separate states with different copy. The
`absent` degradation result is **not** an error state — it is §6c.

## 12. Success state

- **CCPM repo** (`kind: "map"`): header + teaching headline + stats strip + the
  PRD → epic → task tree with per-task issue/PR status + the professional-value
  panel. Every field of `CcpmTraceabilityMap` / `CcpmTeaching` / `links` has a
  home in the layout. Orphan epics and archived epics are visible, not dropped.
- **Non-CCPM repo** (`kind: "absent"`): the educational panel (§6c) with the
  Golden Path link and the Import link.
- Success is implicit — the rendered map (or the educational panel) *is* the
  answer; there is no confirmation banner.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (the `owner/repo` title). In the map
  state: PRD names are `<h2>`, epic names `<h3>`, task names `<h4>` — heading
  order descends without skipping; the tree uses nested lists
  (`<ul>`/`<li>`) inside `<main>`. In the degradation state: `teaching.title` is
  the `<h2>` under the `<h1>`.
- **Tree semantics.** The PRD → epic → task structure is real nested list markup
  (or an ARIA `tree`/`treeitem` if interactive disclosure is used), so a screen
  reader conveys the nesting. Indentation is not the only cue.
- **Teaching disclosures.** Each per-artifact teaching popover/disclosure is a
  real `<button>` with `aria-expanded`; the revealed copy is associated via
  `aria-controls`. Content is reachable by keyboard, not hover-only.
- **Link status chips.** Each issue/PR status chip conveys meaning by **text +
  icon**, never color alone. "Not tracked", "open", "closed", "couldn't link"
  are real words; the closing-PR external link is a real `<a>` with an accessible
  name ("Closing PR #{m}"). `failureReason` is real announced text.
- **Degradation state.** The educational panel is real text; the Golden Path and
  Import links are real `<a>` elements with clear accessible names.
- **Reading order.** DOM order = visual order: header → (map: headline → stats →
  tree → value panel) | (absent: educational panel). Logical top-to-bottom.
- **Color & contrast.** WCAG 2.1 AA in light and dark themes (`next-themes`).
  Status badges, the ref badge, archived/synthetic markers convey meaning by
  text + icon, not color alone.
- **Keyboard.** Full keyboard operability in logical order: teaching
  disclosures, the closing-PR links, the "Re-import" link, and (degradation) the
  Golden Path + Import links. Enter/Space activate; visible focus ring.
- **Loading.** Skeletons are `aria-hidden`; the loading region carries
  `aria-busy="true"`.

## 14. Acceptance criteria

- [ ] `/delivery/[owner]/[repo]` renders server-side from `getDeliveryMap`
      (M12 DAL) + `getImportedRepo` (M11 DAL) — no client fetch, no API route
      (ADR 0006).
- [ ] **Viewing requires no `GITHUB_TOKEN`, no `ANTHROPIC_API_KEY`, and no live
      network** (ADR 0009). Links come from `ccpm_issue_links`, resolved at
      import; the teaching layer is deterministic (no LLM). Opening the URL with
      both keys unset renders the page.
- [ ] **CCPM repo** (`kind: "map"`): the page renders the PRD → Epic → Task tree
      with edges from real fields, the teaching headline + stats, per-task
      issue/PR status (§6b-i), and the professional-value panel. Orphan epics and
      archived epics are shown, not dropped (US-1).
- [ ] **Per-task link status** covers all of §6b-i: not-tracked, issue-only,
      open, closed, closed+PR, and link-failed (with a **beginner-safe**
      `failureReason`, never a raw HTTP code).
- [ ] **Non-CCPM repo** (`kind: "absent"`): the page renders the educational
      degradation state (§6c) — calm, not an error — with the `searched` paths,
      the **M2 `agentic-ccpm-workflow`** Golden Path link, and an Import link
      (US-4).
- [ ] The page binds to the **real TypeScript shapes** in §5
      (`CcpmTraceabilityMap`, `CcpmTeaching`, `CcpmIssueLink`,
      `CcpmDegradationTeaching`) from `packages/db/src/ccpm` (#200/#201/#202/#203).
- [ ] **Drift-watch (§5).** Integration task #205 diffs the shipped types
      against the §5 shapes before binding and records any drift in
      `docs/design/ui-integration-notes/delivery-traceability-page.md`.
- [ ] **Read-only.** No Server Actions, no mutations; the only navigations are
      Re-import (`/import`), the closing-PR external links, and the degradation
      Golden Path / Import links.
- [ ] **Empty / loading / error** states per §9–§11: skeleton on load;
      `absent` is the resting non-CCPM state (not an error); `map` with no links
      still renders; `not-found` ("Import this repository" → `/import`) and
      `load-failure` (`error.tsx`, "Try again") are distinct, with no raw stack
      traces.
- [ ] The page reads as one product with the M2–M10 surfaces — shared layout,
      spacing, calm, content-first tone.
- [ ] **Claude Design (ADR 0007)** is the UI generation tool; v0 is not used.
      This spec is human-reviewed before the prompt
      (`docs/design/ui-prompts/delivery-traceability-page.md`) is run.
- [ ] Uses **only** `packages/ui` (shadcn/ui) components.
- [ ] Accessibility notes in §13 are satisfied (one `<h1>`, ordered headings,
      nested-list/tree semantics, keyboard-reachable disclosures, text-not-color
      status, AA contrast).
