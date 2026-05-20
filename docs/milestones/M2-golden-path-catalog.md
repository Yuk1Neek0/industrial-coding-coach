# M2 — Golden Path Catalog MVP

**State:** Stage 1 done — PRD + ADR 0006 pending human review · **Date:** 2026-05-20

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
| 1 | CCPM Plan — PRD (`.claude/prds/golden-path-catalog.md`) + ADR 0006 | Done — pending human review |
| — | **Human review of the PRD + ADR 0006** | **Gate — pending** |
| 2 | CCPM Epic → Structure → Sync (epic + tasks → GitHub issues) | Pending approval |

## Gate — needs human review

Per the milestone plan's M2 flow (Plan → schema decision → ADR → Epic), the PRD
and the storage ADR are reviewed before the epic is built. Review surface:

- `.claude/prds/golden-path-catalog.md` — the M2 PRD
- `docs/decisions/0006-catalog-storage.md` — SQLite storage + schema decision

## Acceptance Criteria (milestone plan)

- [ ] Recommendations are not naked LLM guesses — catalog entries carry reasoning
- [ ] Each Golden Path has sources, risks, fit criteria, and learning value
- [ ] User can understand why a path was recommended
- [ ] Schema + 5 entries + Catalog UI page delivered
