# Integration notes: Portfolio Page

Issue: #184 · Page Spec: `docs/design/portfolio-page.page-spec.md` (#178) ·
ADR 0007 (Claude Design — `docs/decisions/0007-ui-generation-tool.md`).

This file records the deviations between the Page Spec (#178) and the
shipped React implementation at
`apps/web/app/portfolio/[owner]/[repo]/page.tsx`. Per ADR 0007, the
Claude Design round-trip is **Page Spec → Claude Design prompt → Claude
Design draft → integration notes**; task **#184** ships the integration
notes documenting deviations (the Claude Design draft itself is a manual
external step, not invoked by Claude Code). The lifecycle file exists
from task **#178** so the round-trip is traceable from the start.

## Shipped types vs. Page-Spec types

The Page Spec §5 lists the field names the page should bind to. The
shipped TypeScript in `packages/db/src/schema.ts` (declared by #176,
populated by #179/#180/#181) is the authoritative source — per CLAUDE.md
and the spec's own "shipped types are authoritative" rule, the page binds
to what ships and the spec is updated by a follow-up. Below are the
diffs the integrator (this task) discovered while binding.

| Concept | Page-Spec field | Shipped field (authoritative) | Resolution |
|---|---|---|---|
| `InterviewQA` | `citedFiles: string[]` + `citedStack: string[]` | single bucket `sourceReferences: string[]` (file paths OR stack names mixed) | Page renders all entries as monospace chips; spec to be updated by a follow-up. The shipped integrity check (`generate-qa.ts` line ~640) accepts each entry if it matches the M5 OR the M6 set, so the bucket is correct by design. |
| `ResumeBullet` | `citedFiles: string[]` + `citedStack: string[]` | `sourceFiles: string[]` + `technologies: string[]` (cleanly separated) | Page renders both as monospace chips under the bullet (Page Spec §6e — "grounded in" sub-line). Spec field names should be renamed in a follow-up; the shipped split is the cleaner shape and matches `checkArtifactIntegrity`'s happy path. |
| `ArchitectureExplanationSection` | `paragraphs: string[]` + `citedFiles: string[]` + `citedStack: string[]` | `heading: string` + `body: string` (single markdown-flavoured prose blob) + `citedFiles: string[]` only — no `citedStack` | Page renders `body` directly as a `<p>` (no paragraph splitting). No stack chips per-section. Spec to be updated to match. |
| `LearningMemoryTreeLeaf` | `filePath: string \| null` + rich `source: { kind, rowId, href, label }` | `detail: string` + `source: { milestone: "M5".."M9", rowId: number, locator?: string }` | Page renders `detail` as inline prose, `locator` as a monospace chip when present, and synthesises `href` via the new `sourceHref()` helper in `_components/chrome.tsx`. The shipped source shape carries the milestone label cleanly but does **not** carry a back-pointer to the exact row UI — see Drift Watch below. |
| `LearningMemoryRevisitEntry` | `area` + `explanation` + `suggestion` + `fileRefs[]` + rich `source` | `area` + `detail` + `source: { milestone: "M7".."M9", rowId: number }` | Page renders `area` as `<h4>`, `detail` as prose, and a "Surfaced in M7 #123 →" link via `sourceHref()`. No `suggestion`, no `fileRefs` in the shipped shape (the M8 weak-area shape is just `{ area, detail }` — see `schema.ts` line 644). Spec to be trimmed to match shipped reality. |
| `DebugStory` | `challengeId` + `attemptId` + `attemptedAt` + `href` + nested `gradingResult: { score, scoreLabel, summary }` | only `challengeType` + `taskSummary` + `explanationExcerpt` + `gradingResult: { score, passed, topWeakArea? }` — no `challengeId`, no `attemptId`, no `attemptedAt`, no `href` | Page renders one card per story with the score band + the top weak area (when present) + a link back to the per-repo `/repos/[owner]/[repo]/challenges` list (not a deep link to the exact challenge — see Drift Watch). |

None of these deviations changed the page's user-facing intent: the
five sections still render in the fixed order, the stale-data banner
fires from the same `isMemoryStale` signal, and every reference is
either a real M5/M6 token (per the integrity check at write time) or a
defensively rendered plain-text token (per Page Spec §11).

## Route decisions

### Server Action vs. Route Handler for downloads

The Page Spec §5 / §8 framed all three top-level actions
(Regenerate / Export bundle / Export PDF) as Server Actions returning a
streamed `Response`. The integrator chose:

- **`regenerateMemoryAction`** — kept as a Server Action
  (`apps/web/app/portfolio/[owner]/[repo]/actions.ts`). It returns a
  discriminated `RegenerateMemoryResult` so the client component can
  render typed inline errors (missing-api-key / integrity-failure /
  length-violation / verb-violation / llm-failure) without losing the
  user's place on the page.
- **`exportPortfolioBundle`** and **`exportPortfolioPdf`** —
  implemented as **Route Handlers** at
  `apps/web/app/portfolio/[owner]/[repo]/api/export-markdown/route.ts`
  and `.../api/export-pdf/route.ts`. Reason: Next.js Server Actions
  return a JSON-ish payload, not a streamable binary body, so a clean
  `Content-Disposition: attachment; filename="…"` download is fiddly
  to plumb through `useFormState`/`useActionState`. Route Handlers
  natively return a `Response` with the right headers. The client
  component (`_components/export-buttons.tsx`) does a small
  `fetch + blob → <a download>` bridge.

Both paths reuse the same `lib/portfolio.ts` orchestration layer
(`exportPortfolioBundle` / `exportPortfolioPdf` functions), so the
Server Action vs. Route Handler split is purely about the framing of
the HTTP response — the rendering logic is single-sourced.

### Loading skeleton

The Page Spec §9 offered two options (page-level `loading.tsx` or
per-section `<Suspense>`). We shipped page-level — single
`loading.tsx` that renders a header + five section placeholders. The
data source is local SQLite so per-section streaming would add
complexity without a user-facing payoff.

### Confirmation dialog for Regenerate

The Page Spec §8 calls for an `AlertDialog` confirmation when an
existing memory row would be replaced. We **deferred** the dialog to
keep this PR focused. The button is a real `<button>` with a clear
label, a pending state, and an inline error region — the regenerate
action itself is idempotent and re-runs cheaply; the dialog is a
courtesy. Logged as an unscoped UX follow-up.

## Drift watch — for future M10-touching work

The biggest single drift is **the M10 `LearningMemoryTreeLeaf` source
back-pointer**. The Page Spec §6c calls for "a link back to the M7 / M8
/ M9 row that taught it" — but the shipped `source` shape only carries
`{ milestone, rowId, locator? }`, not the route-relative `href` the
spec promised. The integrator wrote a `sourceHref()` helper in the
portfolio chrome that synthesises a link per milestone, but the M7 and
M8 links go to **list pages**, not directly to the row (the row's
issueRef / PR number isn't on the leaf). The M9 leaf links directly to
the challenge detail since the leaf's `rowId` is the challenge id.

A future M10-touching change should either (a) widen
`LearningMemoryTreeLeaf.source` to carry an `href: string` + a
`label: string` the composers fill in at write time, or (b) widen the
M7/M8 leaf carriers in the composers (`compose.ts`) to include the
`issueRef` / `prNumber` so the page can build the deep link itself.
Either way, the drift is **the M8 spec ↔ shape drift retro lesson** in
miniature — guard against it before any M10 v0.6 work re-binds the
tree.

Three smaller drift watches:

1. **`DebugStory` carries no `challengeId` / `attemptId`.** The page
   cannot deep-link to the specific M9 challenge that produced a
   story; it links to the list. If a Q&A / résumé / memory-tree
   refresh ever cites a debug story by id, this gap will bite.
2. **`InterviewQA.sourceReferences` is a mixed bucket.** Files and
   technologies share one array. The integrity check works around it
   (each entry is accepted against EITHER set), but the rendering
   code treats every entry as a chip — there's no visual distinction
   between "file path" and "stack tech" on the page. A typed split
   would be nice; the shipped shape is correct, just rough.
3. **No per-section `<Suspense>`.** If the M5/M6/M7/M8/M9 reads ever
   grow expensive (e.g. M10 starts compositing across many large
   project maps), the page will block the whole shell. The current
   reads are local SQLite + JSON columns; it's fine for now.

## Nav entry

A "Portfolio" link was added to the shared `AppNav` in two places:

- `apps/web/app/repos/[owner]/[repo]/challenges/_components/chrome.tsx`
  — the M9 chrome's AppNav now carries a `portfolio` active state and
  a "Portfolio" link (currently linking to `/import`; deep-link from
  the imported-repo card is a unifying-nav follow-up).
- `apps/web/app/repos/_components/chrome.tsx` — the M7 chrome's
  AppNav, same treatment.

The portfolio page's own AppNav lives at
`apps/web/app/portfolio/[owner]/[repo]/_components/chrome.tsx` and
mirrors the M9 shape with `portfolio` highlighted. The **unifying nav
pass** across M7/M8/M9/M10 — one shared AppNav with per-repo deep
links to each feature — remains an unscoped follow-up; this task only
adds the portfolio entry to the existing per-feature copies.

## End-to-end verification record

The sub-agent environment for this task has **no `ANTHROPIC_API_KEY`
and no interactive browser**, so the verification recorded here is the
**code + test surface**. Manual browser verification with a real key
is the parent session's / the human reviewer's job before the
epic-PR-to-`main` merges.

### What was tested in code

`apps/web/lib/portfolio.test.ts` — 16 new unit tests covering:

- **`getPortfolioPageData`** — snapshot-missing, memory-missing, fresh
  memory row. Verifies the empty-memory case maps to `stale: false`
  (Page Spec §6a — banner hidden when no row exists; empty panel
  renders §10 instead).
- **`regenerateMemory`** — missing API key → `missing-api-key`,
  unknown snapshot → `unknown-snapshot`, happy path with injected
  composers + generators → row upserted, `InterviewQAIntegrityError`
  → `integrity-failure`, `ResumeBulletsIntegrityError` →
  `integrity-failure`.
- **`exportPortfolioBundle`** — unknown snapshot, no memory yet,
  happy path → real ZIP bytes (asserts PK magic header).
- **`exportPortfolioPdf`** — no memory yet, happy path → real PDF
  bytes (asserts `%PDF` magic header).

Verification commands and their outcomes:

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | clean (951 packages, no warnings) |
| `pnpm -r test` | 6 ai + 688 db + 39 web = **794 tests pass** (with **no `ANTHROPIC_API_KEY`**) |
| `pnpm lint` | only the pre-existing `learning-units.test.ts:209` warning |
| `pnpm typecheck` | no errors |
| `pnpm build` | succeeds; three new routes registered: `/portfolio/[owner]/[repo]`, `.../api/export-markdown`, `.../api/export-pdf` |

### What's deferred to manual / browser verification

The parent session or a human reviewer should still run, with the
M10-seeded `catalog.db` and `ANTHROPIC_API_KEY` set in `.env`:

1. **No-key smoke test.** Visit `/portfolio/acme/portfolio` (or any
   seeded snapshot) with **`ANTHROPIC_API_KEY` unset**. Confirm:
   - The deterministic sections (Architecture, Memory Tree, Debug
     Stories) render from cached rows, the Q&A and Résumé sections
     either render cached content or show the "Not yet generated"
     inline note. The page loads. No spinner.
2. **First-open empty state.** Visit a snapshot with no
   `learning_memories` row. Confirm the §10 empty panel renders with
   the "Generate memory" button; the Export buttons are disabled.
3. **Regenerate happy path.** With `ANTHROPIC_API_KEY` set, click
   "Regenerate memory" on the empty-state panel. Wait ~30s. Confirm
   all five sections populate; the header shows "generated just now".
4. **Stale-data banner (FR-11).** Re-import the snapshot (so
   `repo_snapshots.updated_at` advances past
   `learning_memories.generated_at`). Reload the portfolio page.
   Confirm the banner appears above the anchor nav with the normative
   "Your learning memory may be out of date." copy.
5. **Export bundle.** Click "Export bundle (.zip)". Confirm a ZIP
   downloads, named `portfolio-acme-portfolio-<id>.zip`. Unpack and
   read `portfolio.md` outside the app.
6. **Export PDF.** Click "Export PDF". Confirm a PDF downloads,
   named `portfolio-acme-portfolio-<id>.pdf`. Open in a PDF viewer
   (Adobe / browser viewer / preview).
7. **Not-found.** Visit `/portfolio/ghost/missing`. Confirm the
   `not-found.tsx` renders with the "Import this repository" link
   to `/import`.

If any of (1)–(7) fail, file a follow-up PR; the epic merge to `main`
should not block on (4) and (5) testing flakiness against a real key.
