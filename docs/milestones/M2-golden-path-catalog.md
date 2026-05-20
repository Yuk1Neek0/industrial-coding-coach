# M2 — Golden Path Catalog MVP

**State:** 5/6 issues done — #34 (UI integration) blocked on the v0 round-trip · **Date:** 2026-05-20

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
| #34 | Integrate the Catalog UI page | ⏸ Blocked — needs the v0 output |

UI approach: **Claude Design** (ADR 0007 — replaces v0) — #33 produced the page
spec + Claude Design prompt; the maintainer generates the design in Claude
Design; #34 integrates that output.

## Claude Design hand-off — action needed from the maintainer

#34 cannot proceed until the Catalog UI design is generated:

1. Open the prompt: `docs/design/ui-prompts/golden-path-catalog-page.md`.
2. In Claude Design, create a project, **link this repository**, and paste the
   prompt. Iterate on the canvas.
3. Export via **"Handoff to Claude Code"** (or `.zip` / standalone HTML) and
   return the result here.

Then #34 wires it into `apps/web` against the typed data-access layer and M2 is
complete. Spec to verify against: `docs/design/golden-path-catalog-page.md`.

## Acceptance Criteria (milestone plan)

- [ ] Recommendations are not naked LLM guesses — catalog entries carry reasoning
- [ ] Each Golden Path has sources, risks, fit criteria, and learning value
- [ ] User can understand why a path was recommended
- [ ] Schema + 5 entries + Catalog UI page delivered
