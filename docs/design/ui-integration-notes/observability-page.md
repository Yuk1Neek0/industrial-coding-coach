# Integration Notes: Observability Page

Issue: #227 · Epic: `llm-observability` (M13) · Page Spec:
`docs/design/observability-page.page-spec.md` · Prompt:
`docs/design/ui-prompts/observability-page.md`

What shipped when `/observability/[owner]/[repo]` was integrated into `apps/web`,
and the decisions/trade-offs a future M13-touching change should know.

## What shipped

- `apps/web/lib/observability.ts` — server-side facade:
  `getObservabilityPageData(owner, repo, ref?, injectedDb?)` over the M13
  `getObservability` (#225). Read-only, offline, lazy `db()` with `DB_FILE_NAME`
  override and an injectable db for tests. Mirrors `lib/delivery.ts`.
- `apps/web/app/observability/[owner]/[repo]/page.tsx` — the Server Component
  page (`force-dynamic`), rendering the header + Part A + Part B, with Part-A
  empty and Part-B absent as calm in-page resting states. Calls `notFound()` on
  the `no-snapshot` result.
- `_components/chrome.tsx` — page-local chrome (AppNav + a new "Observability"
  nav entry alongside "Delivery", Badge, stroke icons), mirroring the M12
  Delivery chrome.
- `_components/disclosure.tsx` — the page's single small client island: a real
  `<button>` with `aria-expanded` + `aria-controls` for the trace-detail and
  Part-B evidence disclosures (Page Spec §13). Holds only open/closed UI state,
  no data — the page shell stays a Server Component.
- `loading.tsx` (skeleton, `aria-busy`), `not-found.tsx` ("This repository
  isn't imported yet" → `/import`), `error.tsx` (`"use client"`, "Couldn't load
  observability" + "Try again" `reset()`).
- `apps/web/lib/observability.test.ts` — 3 cases (no-snapshot / imported LLM repo
  with Part-A aggregates + Part-B llm-app / non-LLM repo with empty Part A +
  absent Part B). Mirrors the `lib/delivery.test.ts` harness; injects an
  in-memory SQLite db (real migrations).

### Verification

- `pnpm --filter web typecheck` — PASS.
- `pnpm --filter web lint` — PASS (0 errors; the single pre-existing warning in
  `lib/learning-units.test.ts` is unrelated to this change, same as the M12
  integration notes record).
- `pnpm --filter web build` — the observability route compiles cleanly with
  **zero** errors attributed to any observability file. The build as a whole
  fails on a **pre-existing, environment-only** blocker unrelated to this task:
  Turbopack can't resolve `@langchain/langgraph` from
  `packages/ai/src/mapper/pipeline.ts` (the `/map` route) in this cold isolated
  git worktree, because pnpm did not materialize that package's bundler-visible
  link here. Proof it is environmental and not from this change: (a) the only
  error's import trace is `/map → apps/web/lib/project-mapper.ts →
  packages/ai/src/mapper/pipeline.ts`, none of which this task touches; (b) the
  **same code builds green in the main checkout** (`pnpm --filter web build` from
  the repo root succeeds and the `/map` route builds). CI (Linux) is the
  authoritative build gate.
- `pnpm --filter web test` — vitest **fails to BOOT** with
  `ERR_PACKAGE_IMPORT_NOT_DEFINED: "#module-evaluator"` — the known cold-worktree
  Vitest 4 / pnpm ESM defect flagged in the task brief; it reproduces on the
  untouched suite before any test runs, not on this code. The facade test's logic
  was instead validated via a throwaway `tsx` harness (same in-memory SQLite +
  real migrations + injected db as the committed test): **all 3 cases / 20
  assertions passed**. The real `lib/observability.test.ts` is committed and
  relies on CI's Linux vitest as the authoritative gate.

## Drift-watch (§5 of the spec — M8 retro lesson)

The shipped types in `packages/db/src/observability` (+ `packages/db/src/schema`)
were diffed against the Page Spec §5 shapes before binding. The result shape is
**faithful to the spec, with only additive, non-breaking differences** — the page
binds to the shipped types directly with no adapters.

Confirmed identical to §5: `ObservabilityResult = Observability |
ObservabilityNoSnapshot`; `Observability` (`kind`, `snapshotId`, `partA`,
`partB`); `ObservabilityNoSnapshot` (`kind`, `owner`, `repo`, optional `ref`);
`ObservabilityPartA` (`traces`, `aggregates`); `TraceWithEvals` (`trace`,
`evals`); `TraceNameAggregate` (all nine fields incl. `evalPassRate: number |
null`); `LlmTrace` and `LlmObservation` (all token/cost/latency/outcome/timestamp
fields); `LlmEval` (`id`, `traceId`, `check`, `passed`, `reason: string | null`,
timestamps); `ObservabilityStory = LlmAppStory | NoLlmApp`; `LlmAppStory` (`sdks`,
`callSites`, `promptAssets`, `existingTooling`); `NoLlmApp` (`kind`, `searched`);
`ObservabilityTeachingResult = ObservabilityTeaching | ObservabilityExplainer`;
`ObservabilityTeaching` (`headline`, `concepts`, `professionalValue`);
`ObservabilityConceptCard` (`title`, `what`, `present`, `production`,
`interviewAnswer`); `ObservabilityExplainer` (`title`, `body`, `searched`,
`primer`).

Differences found (additive only — reconciled by simply consuming the richer
shape; nothing renamed or removed vs the spec):

1. **`GetObservabilityOptions` carries a `ref` field too.** The shipped
   `getObservability(owner, repo, ref?, options?)` accepts the ref both as the
   3rd positional arg and inside `options.ref`. The facade passes the ref
   positionally (spec-shaped); no impact.
2. **`ObservabilityConceptCard` has an extra `concept` discriminant**
   (`"tracing" | "failures" | "evals"`), which the §5 sketch omits. Used as the
   stable React `key` and to order the cards — a strict superset of §5, no
   conflict.
3. **`ObservabilityExplainer.primer[]` items carry a `concept` field too**
   (`{ concept, title, what }`) where §5 shows `{ title, what }`. Additive; the
   page renders `title` + `what` and uses `concept` only as a key fallback.
4. **`LlmTrace.outcome` is `LlmTraceOutcome` (an alias for `string`)** rather
   than a literal union — exactly as §5's free-text note describes; rendered as a
   calm chip with `success` special-cased and any other value shown as
   `failed · {outcome}`.

No drift required a spec change or a shape adapter.

## Decisions & trade-offs

- **No Claude Design draft was used (approach A).** Per the same human-in-the-loop
  call as M12's `/delivery` page (#205), the page was implemented **directly from
  the Page Spec** + the shipped `apps/web` patterns. The Claude Design prompt
  (`docs/design/ui-prompts/observability-page.md`) remains available for a future
  visual refresh.
- **One client island, server-rendered shell.** To satisfy the spec's literal
  §13 disclosure requirement (a real `<button>` with `aria-expanded` /
  `aria-controls`, keyboard-reachable, not hover-only), the trace-detail and
  evidence disclosures use a tiny `"use client"` `Disclosure` component. It holds
  no data — the page (`page.tsx`) stays a Server Component that reads
  `getObservability` directly. A native `<details>/<summary>` was rejected
  because it does not expose `<button>` + `aria-expanded`/`aria-controls`.
- **No header ref badge.** §6a calls for the imported `ref` as a `Badge` in the
  header. `getObservability` returns the snapshot id but **not** the resolved
  `ref` string on the `Observability` result, so rendering a literal ref would
  require a second snapshot read (or a data-layer change, out of scope). The
  header keeps the `{owner}/{repo}` `<h1>` and the read-only/offline note; the
  ref badge is a deferred follow-up if the DAL later surfaces the ref. (The
  `no-snapshot` shape does carry `ref`, but that branch renders `not-found.tsx`.)
- **Estimated-cost honesty.** Every cost figure carries a real-text "est." marker,
  and each aggregate card prints the price-table date (`PRICE_TABLE_DATE`, epic
  AD-4, re-exported from `@workspace/db`) — never billed truth.
- **Heading hierarchy:** one `<h1>` (owner/repo); Part A / Part B panel headings
  are `<h2>`; sub-section labels ("Per-call summary", "Traces", "Detected
  signals", "The three concepts to speak to", etc.) and the absent-state title are
  `<h3>`; each concept card / aggregate card / trace card / primer card title is
  `<h4>`; the in-disclosure "Per-turn breakdown" / "Quality checks" labels are
  `<h5>`. Descends without skipping. (The spec §13 names concept-card titles as
  `<h3>`; they render as `<h4>` here because they sit under an `<h3>` sub-section
  heading — the same one-level-deeper reconciliation the M12 notes record, to
  avoid a broken chain. Semantic grouping is preserved via real `<ul>/<li>` +
  `<dl>` markup.)
- **Status by text + icon, never color alone.** Eval pass/fail, trace `outcome`,
  per-turn outcome, and Part-B signal chips all pair an icon with real text;
  `reason` renders as plain announced text (never an HTTP code or stack trace).
- **Traces newest-first in the view.** The DAL returns traces oldest-first
  (`startedAt`, then id); the list component reverses for the spec's
  newest-first §6b.2 order without changing the DAL.
- **Styling reuses the existing design system.** Like `/delivery`, the page uses
  only existing CSS design-system classes (`.screen`, `.review-section`,
  `.file-card`, `.badge`, `.status-card`, `.hint`, `.btn`, …, shared via the
  globally-bundled `reviews.css`) plus inline layout styles and `packages/ui`
  shadcn primitives — no new CSS file, so it reads as one product with M2–M12.
- **Nav:** an "Observability" entry was added to this page's `AppNav` alongside
  the M12 "Delivery" entry (points at `/import`, the same placeholder the per-repo
  Portfolio/Delivery entries use). Per the standing chrome note, each milestone's
  page-local chrome carries its own nav copy; the unifying cross-milestone nav
  pass remains an unscoped follow-up.

## Components used

`packages/ui` shadcn primitives are surfaced through the page-local chrome
(`AppNav`, `Badge`, the stroke `Icon*` set, `GitHubMark`) mirroring the M12
chrome, plus `next/link` for navigations and the local `Disclosure` client
island. No new dependencies; no Langfuse; no network or API key at view (ADR
0009).
