---
name: learning-memory-portfolio-export
description: Per-repo synthesis layer that turns M5–M9 outputs into durable learning memory + exportable interview Q&A, résumé bullets, architecture explanation, and a shareable portfolio page (Milestone 10)
status: backlog
created: 2026-05-27T13:24:13Z
---

# PRD: learning-memory-portfolio-export

## Executive Summary

Milestone 10. Turn the project understanding the user already built — across
the stack explainer (M5), project logic map (M6), issue learning units (M7),
diff reviews (M8), and debug/expansion challenge attempts (M9) — into
**durable learning memory** keyed to the imported repo, plus the
**job-market artifacts** the product PRD's executive summary promises:
interview Q&A, résumé bullets, an architecture explanation a junior dev can
defend, and a shareable portfolio page.

M10 is a **per-repo synthesis layer**. It does not import new data, it does
not change M5–M9 schemas, and it does not gate completion on a perfect
score. It composes what already exists into artifacts the user can take to
an interview, paste into a résumé, or share as a portfolio link — turning
the project on their résumé from a liability into something they can
genuinely defend.

The mechanism is **hybrid**: bounded Anthropic SDK calls on the shipped
`llm-foundation` client produce the narrative pieces (interview Q&A,
résumé bullets) where synthesis adds value; **deterministic composition**
from M5–M9 rows produces the structural pieces (architecture explanation,
learning memory tree, debug stories) where the underlying data is already
the answer. The user can **export** the bundle as per-type markdown files,
a single combined bundle, a **PDF**, or view it as a single
**hosted portfolio page** at `/portfolio/[owner]/[repo]`.

## Problem Statement

The product PRD's executive summary is explicit:

> The output includes job-market artifacts: interview Q&A, résumé bullets,
> and architecture explanations.

After M5–M9, the *raw material* for those artifacts lives in the database
— `stack_explanations`, `project_maps`, `learning_units`, `diff_reviews`,
`challenges` / `challenge_attempts`. None of it is in a form the user can
hand to an interviewer, attach to a résumé, or paste into a LinkedIn
"Projects" section. The user has *understood* the project but cannot yet
**show what they learned**.

Concretely, two career-blocking gaps remain:

1. **No interview-ready narrative.** The "walk me through your project"
   question (product PRD US-1) still requires the user to assemble pieces
   from five different surfaces in their head. The grading from M7/M8/M9
   tells them they understand it — but they have nothing to read out loud.
2. **No portable artifact.** Nothing leaves the app. A potential employer
   reading the user's résumé sees `Built X with Next.js` and the user has
   no way to point at the project's *explanation* — only the source code
   it produced. Per the product PRD: *"the project on their résumé becomes
   a liability instead of an asset — it invites questions they cannot
   answer."* M10 is what closes that liability gap.

This PRD is the milestone that connects every prior milestone to the
product PRD's stated outcome.

## User Stories

### US-1 — Read myself into interview-ready Q&A grounded in my repo

As a job-seeking junior dev who has worked through M5–M9 on my imported
repo, I want a generated set of **interview Q&A** that an interviewer
could plausibly ask about *my* project, and answers grounded in the
explanations I've already understood, so that I can practice and walk in
with confidence (product PRD US-1).

**Acceptance:**
- The Q&A is generated from this repo's M5/M6/M7/M8/M9 rows — every
  answer cites a real file path or concept from the project map, not
  generic tutorial text.
- The set covers: stack choices (M5 ground), architecture (M6 ground),
  per-issue learning (M7 ground), diff/risk reading (M8 ground), and
  debug/expansion reasoning (M9 ground).
- I can read each Q&A inline on the Portfolio Page and the same Q&A is
  included in the markdown / PDF export.

### US-2 — Export résumé bullets I can paste into my résumé

As the same user, I want **résumé bullets** generated from this project —
phrased in industry-standard "verb + outcome + technology" form — so that
when I update my résumé I can paste in bullets that I can actually defend
in interview.

**Acceptance:**
- The bullets reference real choices on this repo (e.g. "Implemented X
  with Next.js Server Actions" only if the project map actually shows
  Server Actions), not invented capabilities.
- Each bullet is short enough to fit a résumé line (≤ 160 chars).
- I get the bullets in the Portfolio Page **and** as a standalone
  markdown file in the export.

### US-3 — Get one architecture explanation I can speak from

As the same user, I want a **single architecture explanation** at
portfolio length (~1–2 pages of prose) — composed from M5 + M6 + recurring
M7/M8/M9 themes — that I can either talk through at a whiteboard or paste
into a portfolio entry.

**Acceptance:**
- The explanation is grounded in this repo: every architectural claim
  cites a real M6 project-map node and / or a real M5 stack-explanation
  entry.
- It is **derived deterministically** from M5 + M6 rows — no separate
  bounded SDK call — so it stays in sync with the data and never
  hallucinates a layer the project does not have.
- Available inline on the Portfolio Page and as `architecture.md` in the
  export.

### US-4 — Read my learning memory tree for this repo

As the same user, I want a **learning memory tree** — a structured list of
"things I now understand about this repo and how I came to understand
them" — composed from my M7 issue learning logs + my M9 debug story
attempts + my M8 weak-area history.

**Acceptance:**
- Each leaf entry is a concrete concept I touched (e.g., "Server Actions
  in `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/actions.ts`")
  with a link back to the M7 / M8 / M9 row that taught it.
- Weak-area entries (where I scored < pass) are surfaced as "still to
  revisit" so the tree honestly shows what I do and don't know yet
  — per product PRD's "comprehension over completion" rule.

### US-5 — Share my portfolio page with an interviewer

As the same user, I want a single **Portfolio Page** at
`/portfolio/[owner]/[repo]` that combines the architecture explanation,
Q&A, résumé bullets, and learning memory tree into one shareable view, so
that I can send the URL to an interviewer or hiring manager who wants to
see the project explained.

**Acceptance:**
- The page renders all four artifacts in a single scrollable layout with
  anchor links.
- It loads with no `ANTHROPIC_API_KEY` and no live network: artifacts are
  read from the `learning_memories` row.
- It is the same content as the markdown / PDF export, just in HTML.

### US-6 — Take the artifacts away from the app

As the same user, I want to **export the full bundle** of artifacts — so
that I can paste them into LinkedIn / my résumé / interview prep, and so
that I am not locked into running the app to read what I learned.

**Acceptance:**
- A single "Export" action produces a downloadable ZIP / folder
  containing: `interview-qa.md`, `resume-bullets.md`, `architecture.md`,
  `learning-memory-tree.md`, `debug-stories.md`, and a combined
  `portfolio.md` that stitches all five.
- A separate "PDF" action produces a `portfolio.pdf` rendering the same
  bundle for résumé attachment.
- Export filenames include the imported repo's `owner-repo-snapshot.id`
  so multiple repos do not collide on the user's disk.

## Functional Requirements

- **FR-1 — Per-repo scoping.** A learning memory and all derived artifacts
  are scoped to a single `repo_snapshots.id` row. M10 does not cross
  repos and ships no global / cross-repo aggregate view. (Mirrors M7-R6,
  M9-R7 — strict per-snapshot scoping.)
- **FR-2 — Hybrid synthesis.**
  - **SDK-generated (bounded Anthropic SDK calls on `@workspace/ai`):**
    interview Q&A, résumé bullets. Tool use reads M5 / M6 / M7 / M8 / M9
    rows. Each call is single-purpose and structurally typed; matches the
    M7 / M8 / M9 bounded-call shape.
  - **Deterministically composed (no SDK call):** architecture
    explanation, learning memory tree, debug stories. Read M5 / M6 / M7 /
    M8 / M9 rows and stitch via templated markdown.
- **FR-3 — Grounding constraints.** Every SDK output must name only files
  / modules that the M6 project map already lists; every résumé-bullet
  technology claim must resolve to a real M5 `stack_explanations` row.
  An integrity check (reused / adapted from M9's
  `integrity-check.ts`) rejects outputs that violate either rule before
  persistence.
- **FR-4 — Honest learning memory.** The learning memory tree surfaces
  every weak-area entry from M7 / M8 / M9 grading as "still to revisit"
  rather than hiding them. The user is shown what they don't know yet.
- **FR-5 — Lazy + cached.** Synthesis runs lazily on first open of the
  Portfolio Page for a repo and caches the result in `learning_memories`
  for subsequent reads. A "Regenerate memory" action re-invokes the
  bounded calls and refreshes the row. (Same lazy-cached shape as M9.)
- **FR-6 — Export bundle.** A single export action produces the four /
  five markdown files plus the combined `portfolio.md` as a downloadable
  bundle (ZIP). Filename includes `owner-repo-snapshot.id`.
- **FR-7 — PDF export.** A separate action renders the combined bundle to
  PDF via a server-side PDF library (selection deferred to the epic per
  installation-rule; e.g. `@react-pdf/renderer` or `puppeteer`-based
  with a documented choice).
- **FR-8 — Hosted Portfolio Page.** Route
  `apps/web/app/portfolio/[owner]/[repo]/page.tsx` renders the full
  bundle in HTML with anchor links per artifact. Reads from
  `learning_memories`; no LLM call at request time once the row exists.
- **FR-9 — Storage.** One new `learning_memories` table on the existing
  SQLite store (ADR 0006), keyed by `snapshot_id` (unique), with JSON
  columns for: `interview_qa`, `resume_bullets`, `architecture_explanation`,
  `learning_memory_tree`, `debug_stories`, `generated_at`. No companion
  tables — same one-table-per-milestone shape as M6 / M7 / M8 / M9.
- **FR-10 — Read-only of M5–M9.** M10 only reads the prior milestones'
  rows via their existing data-access layers. It does not write to or
  migrate any of those tables.
- **FR-11 — Stale-data signaling.** When the underlying snapshot's
  `repo_snapshots.updated_at` is newer than `learning_memories.generated_at`,
  the Portfolio Page shows a "memory may be stale — regenerate" banner.
  Regeneration is user-triggered, not automatic.

## Non-Functional Requirements

- **NFR-1 — Bounded token use.** Each SDK call uses tool use to read
  specific rows; no whole-database stuffing. Matches the
  `llm-foundation` token-bound posture used since M5.
- **NFR-2 — Reproducible / mockable.** Both bounded calls test on the
  `@workspace/ai` mock transport. `pnpm test` runs with no
  `ANTHROPIC_API_KEY` and no live GitHub calls.
- **NFR-3 — Local-first.** Per the product PRD, the artifacts and the
  portfolio page are served by the same local Next.js app. No external
  hosting, no upload, no signup. The user owns the bundle the moment it
  exists on disk.
- **NFR-4 — UI via Claude Design (ADR 0007).** Both new pages — the
  Portfolio Page and any per-artifact preview UI — go through the
  Claude Design round-trip: Page Spec under `docs/design/` → prompt under
  `docs/design/ui-prompts/` → Claude Design draft → integration notes
  under `docs/design/ui-integration-notes/`. v0 is not used.
- **NFR-5 — Honest output.** The system shall never present a generated
  artifact as anything other than user-defensible. Q&A and bullets that
  cannot be grounded in M5/M6/M7/M8/M9 rows are dropped, not softened.

## Success Criteria

- Given a sample imported repo with rows in `stack_explanations`,
  `project_maps`, `learning_units`, `diff_reviews`, and `challenges`, the
  Portfolio Page at `/portfolio/[owner]/[repo]` renders all four artifacts
  and the user can read the architecture explanation aloud end-to-end
  (US-3).
- Interview Q&A and résumé bullets are generated by bounded SDK calls and
  pass the file-reference / stack-reference integrity check (FR-3); test
  coverage on the mock transport demonstrates the grounding constraint.
- Architecture explanation and learning memory tree are produced by pure
  deterministic composition with no SDK call; tests confirm identical
  output across two runs on identical inputs (NFR-2).
- Export produces a downloadable bundle of markdown files plus a PDF; a
  user can `cat portfolio.md` outside the app and read a coherent
  end-to-end project explanation (US-6).
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` pass with
  no `ANTHROPIC_API_KEY` and no live network access — same CI gate as
  M7 / M8 / M9.
- A weak-area entry from M7/M8/M9 grading appears in the learning memory
  tree marked "still to revisit" (FR-4) — confirms the comprehension-
  over-completion stance survives into the exported artifact.
- The `learning_memories` Drizzle migration applies cleanly on top of M9's
  `0008_wealthy_starbolt.sql` (this is the next migration in sequence —
  see Constraints below).

## Constraints & Assumptions

- **LLM mechanism is fixed by ADR 0005.** The two narrative artifacts use
  bounded Anthropic SDK calls on the shipped `llm-foundation` client. Not
  LangChain (confined to M6) and not autonomous agents.
- **Storage is fixed by ADR 0006.** One new table on the existing local
  SQLite database. JSON columns for structured / list-valued fields.
- **UI is fixed by ADR 0007.** Claude Design only; v0 is not used.
- **GitHub access is fixed by ADR 0009.** M10 does not add a new GitHub
  access path; it reads existing snapshot / project-map / learning-unit /
  diff-review / challenge rows only.
- **Parallel execution is fixed by ADR 0008.** M10 runs on its own
  `epic/learning-memory-portfolio-export` branch / worktree, merged to
  `main` via a single epic PR. In-epic non-conflicting tasks may run as
  parallel sub-agents.
- **Migration discipline (from M9 retrospective).** M10 is a
  single-schema-adding epic and will land *after* M9 — its migration
  numbers cleanly as `0009`. The "fourth cross-epic migration collision"
  lesson from the M9 retrospective applies: M10 should not run in
  parallel with any other schema-adding epic. (This is a serialization
  decision the user can revisit if a parallel epic appears.)
- **PDF library choice is an epic-time decision** (FR-7). Candidates:
  `@react-pdf/renderer` (React-component-based, no headless browser),
  `puppeteer` / `playwright` (headless browser, larger install). The
  installation-rule applies: choice + reason recorded in an ADR or a
  setup note before install.
- **Pre-existing weak-area schema is reused.** The learning memory
  tree's "still to revisit" entries reuse the M8 `WeakArea` type and the
  M7 / M9 weak-area columns; no new grading shape.
- **No new user-identity layer.** The portfolio page is local and
  unauthenticated, like the rest of the app. There is no "share with
  someone over the internet" hosting story — the user shares the URL to
  their locally running app or sends the exported files / PDF.

## Out of Scope

The following are explicitly **not** in M10:

- **Cross-repo aggregate view.** No "my whole portfolio across every
  imported repo" surface. Per-repo only (FR-1).
- **Editing the generated artifacts inline in the app.** The user
  regenerates or edits the exported markdown files outside the app; M10
  ships no rich-text editor.
- **Hosted / cloud publication.** No "publish my portfolio at
  example.com/u/<user>" feature. The product is local-first; sharing is
  by sending the exported files or a localhost URL on the user's
  machine.
- **Copy-to-clipboard per-artifact buttons.** The user copies from the
  exported markdown files or the Portfolio Page using the browser's
  native selection. (Explicitly considered and dropped during PRD
  brainstorm.)
- **Identity, auth, user accounts.** Same posture as the rest of the
  product.
- **A bounded SDK call for the architecture explanation, learning memory
  tree, or debug stories.** Those are deterministic compositions — see
  FR-2. The product PRD's "comprehension over completion" rule favors
  showing the user the underlying data, not regenerating a third LLM
  variant of it.
- **Live regeneration on every snapshot update.** Regeneration is
  user-triggered (FR-5); a stale-data banner exists (FR-11) but
  background auto-regeneration is out.
- **Resume PDF templating (separate styled résumé layouts).** M10
  produces a portfolio-bundle PDF. Specialized résumé PDFs targeting
  specific job-board formats are an M11+ topic.
- **Multi-language / localization.** All artifacts ship in English.

## Dependencies

- **M5 `stack-explainer`** — résumé bullets cite real M5 entries; the
  architecture explanation reads the stack decision map. (Shipped.)
- **M6 `project-logic-mapper`** — file / module names in *every* artifact
  must come from the M6 project map; the architecture explanation is
  composed largely from M6 rows. (Shipped.)
- **M7 `issue-based-learning-workspace`** — learning memory tree leaves
  cite M7 issue learning rows; weak areas feed "still to revisit." (Shipped.)
- **M8 `diff-review`** — debug stories include M8 weak-area history; Q&A
  uses M8 comprehension-question shape. (Shipped.)
- **M9 `debug-expansion-challenge`** — debug stories cite M9
  challenge attempts; learning memory tree surfaces M9 weak areas.
  (Shipped.)
- **M11 `github-integration`** — snapshot identity (`owner/repo/ref`) is
  the routing key for `/portfolio/[owner]/[repo]`. No new GitHub access.
  (Shipped.)
- **`llm-foundation`** — the shared Anthropic SDK client and mock
  transport for the two bounded calls. (Shipped.)
- **ADRs 0005 (LLM mechanism), 0006 (storage), 0007 (UI tool), 0008
  (parallel execution), 0009 (GitHub access).**
- **New ADR may be required** for the PDF rendering choice — to be
  decided at the epic phase per the official-installation rule.
- **Human approval of this PRD** before the M10 epic is drafted (CLAUDE.md
  hard rule).
