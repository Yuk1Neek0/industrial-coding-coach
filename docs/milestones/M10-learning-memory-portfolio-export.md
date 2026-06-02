# M10 — Learning Memory and Portfolio Export

**State:** ✅ Complete — epic #175 done; merged to `main` via **PR #195**
· **Date:** 2026-05-27

Goal: turn a user's accumulated project understanding into durable **learning
memory** and job-market materials (interview Q&A, résumé bullets, a portfolio
project explanation) they can export and defend in interviews — the capstone of
the M5–M9 analysis chain.

## Scope decisions

- **Composition is deterministic; only the job-market prose is LLM-generated.**
  The learning-memory tree, architecture explanation, and debug stories are
  composed deterministically from existing M5/M6/M8/M9 outputs; only the two
  bounded SDK calls (interview Q&A, résumé bullets) generate prose, each guarded
  by a file/stack-reference integrity check.
- **Local-first (ADR 0009).** Composition and export read only the local
  snapshot + prior analysis rows; no network beyond the two SDK calls.
- **Two export formats.** A Markdown bundle (zipped via `fflate`) and a PDF
  (rendered via `@react-pdf/renderer`), sharing one slug helper.

## Stage status

| Stage | Description | Status |
|---|---|---|
| 1 | CCPM Plan — PRD `learning-memory-portfolio-export.md` | Done — approved |
| 2 | CCPM Epic → Structure → Sync | Done — epic #175, tasks #176–#184 |
| 3 | Execution + UI hand-off | Done — see backlog |

## Execution backlog

| Issue | Task | Closing PR |
|---|---|---|
| #176 | `learning_memories` schema + Drizzle migration + DAL | — |
| #177 | Reusable file + stack-reference integrity check | — |
| #178 | Portfolio Page — Page Spec + Claude Design prompt | #188 |
| #179 | Deterministic composition module (architecture + memory tree + debug stories) | #189 |
| #180 | Interview Q&A bounded SDK call + integrity check + mocked tests | #190 |
| #181 | Résumé-bullet bounded SDK call + integrity check + mocked tests | #191 |
| #182 | Markdown bundle exporter (+ `fflate`) | #192 |
| #183 | PDF exporter (+ `@react-pdf/renderer`) + shared slug helper | #193 |
| #184 | Integrate Portfolio Page into `apps/web` (Wave 4 final) | #194 |

All task issues + epic #175 are closed; merged to `main` via **PR #195**.

## Delivered

- `packages/db/src/learning-memories/` — `memories.ts` (`learning_memories`
  schema + DAL), `integrity.ts` (reusable file/stack-reference integrity check),
  `compose.ts` (deterministic composition: architecture, memory tree, debug
  stories), `generate-qa.ts` + `generate-bullets.ts` (two bounded SDK calls on
  the shared `llm-foundation` client, via `_sdk-shared.ts`), `export-markdown.ts`
  (`fflate` bundle), `export-pdf.ts` (`@react-pdf/renderer`), and a shared
  `_filename-slug.ts`.
- Portfolio UI: `/portfolio/[owner]` — Server Component + Client island over the
  data-access layer, built from a Page Spec via Claude Design (ADR 0007).

## Acceptance Criteria (PRD)

- [x] The user can export project-explanation materials (Markdown bundle + PDF).
- [x] Materials show what the user *learned*, not just what AI generated —
      composed from prior analysis, with integrity-checked generated prose.
- [x] Interview Q&A and résumé bullets are produced by bounded SDK calls and
      reject any output referencing files/stacks outside the project.
- [x] Composition and export are local-first; the Portfolio Page renders both
      populated and empty states.

## Retrospective

**What went well**

- The composition module is fully deterministic — it stitches M5/M6/M8/M9
  outputs into the memory tree and debug stories with no model call, so the only
  generated prose (Q&A, bullets) is small, bounded, and integrity-checked.
- Two exporters shipped behind one slug helper, keeping filename logic in a
  single tested place (#183 introduced the shared `_filename-slug.ts`).

**What to watch — lessons**

- `@react-pdf/renderer` is a heavy dependency added for one feature; its bundle
  weight is worth watching if PDF export ever moves client-side.
- The two SDK calls share `_sdk-shared.ts`; future bounded calls should reuse it
  rather than re-implementing the request/integrity scaffold.

**Follow-ups**

- None blocking. M10 is the capstone of the analysis chain; subsequent work
  (M12 CCPM Integration) builds on the same snapshot + `llm-foundation` base.
