# M2 — Golden Path Catalog MVP

**State:** ✅ Complete — epic #28 done & archived; catalog UI live at `/catalog` · **Date:** 2026-05-20

Goal: build the Golden Path Catalog MVP — the curated knowledge base of routes
for understanding AI-assisted projects. First milestone of real product work.

## Brainstorm decisions (2026-05-20)

- **Storage:** local **SQLite** (ADR 0006).
- **Scope:** schema + catalog data **+ a Catalog UI page** (triggers the
  page-spec → v0 → integration flow).
- **Golden Paths:** all **5** suggested — AI-native Next.js App, Agentic CCPM
  Workflow, Repo Understanding & Review Coach, Contract-first Fullstack App,
  LLM Observability & Eval App.

## Stage status

| Stage | Description | Status |
|---|---|---|
| 1 | CCPM Plan — PRD + ADR 0006 | Done — approved |
| — | Human review of the PRD + ADR 0006 | Approved 2026-05-20 |
| 2 | CCPM Epic → Structure → Sync | Done — epic #28, tasks #29–#34 |

## Execution backlog

| Issue | Task | Status |
|---|---|---|
| #29 | Set up SQLite + Drizzle ORM | ✅ Done |
| #30 | Golden Path schema + migration | ✅ Done |
| #31 | Typed catalog data-access layer + tests | ✅ Done — 4 tests |
| #32 | Author 5 Golden Path entries + seed script | ✅ Done — seed verified |
| #33 | Catalog page spec + v0 prompt | ✅ Done — v0 prompt handed off |
| #34 | Integrate the Catalog UI page | ✅ Done — `/catalog` routes live |

All 6 task issues are closed; epic #28 is complete and archived to
`.claude/epics/archived/golden-path-catalog/`.

UI approach: **Claude Design** (ADR 0007 — replaced v0). #33 produced the page
spec + prompt; the design was generated in Claude Design and #34 integrated the
handoff into `apps/web` — see `docs/design/ui-integration-notes/`.

## Delivered

- `packages/db` — SQLite + Drizzle; `golden_paths` schema + migration; typed
  data-access layer with Vitest tests.
- 5 hand-authored Golden Path entries + idempotent seed.
- Catalog UI: `/catalog` (list + filter) and `/catalog/[slug]` (detail), with
  loading / error / not-found states, wired to the data-access layer.

## Acceptance Criteria (milestone plan)

- [x] Recommendations are not naked LLM guesses — catalog entries carry reasoning
- [x] Each Golden Path has sources, risks, fit criteria, and learning value
- [x] User can understand why a path was recommended
- [x] Schema + 5 entries + Catalog UI page delivered
