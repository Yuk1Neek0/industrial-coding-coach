# M2 — Golden Path Catalog MVP

**State:** Stage 2 done — epic #28 synced; 6 task issues ready to execute · **Date:** 2026-05-20

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

| Issue | Task | Depends on |
|---|---|---|
| #29 | Set up SQLite + Drizzle ORM | — |
| #30 | Golden Path schema + migration | #29 |
| #31 | Typed catalog data-access layer + tests | #30 |
| #32 | Author 5 Golden Path entries + seed script | #30 |
| #33 | Catalog page spec + v0 prompt | — *(ends in v0 hand-off)* |
| #34 | Integrate the Catalog UI page | #31, #33 |

UI approach (decided 2026-05-20): **v0 round-trip** — #33 produces a page spec +
v0 prompt and hands off to the user; #34 integrates the v0 output.

## Acceptance Criteria (milestone plan)

- [ ] Recommendations are not naked LLM guesses — catalog entries carry reasoning
- [ ] Each Golden Path has sources, risks, fit criteria, and learning value
- [ ] User can understand why a path was recommended
- [ ] Schema + 5 entries + Catalog UI page delivered
