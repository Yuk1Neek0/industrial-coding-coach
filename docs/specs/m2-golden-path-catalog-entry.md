# Spec Stub: Milestone 2 Entry Point — Golden Path Catalog MVP

Issue: #27 · Epic: product · Source: `.claude/prds/product.md`,
milestone plan M2 section

This is the hand-off from M1 (product definition) to M2. It scopes M2 so its
CCPM Plan phase can start cleanly. It is **not** M2's PRD.

## M2 goal

Create the first version of the **Golden Path Catalog**. A Golden Path is a
full recommended development route — it combines templates, workflow, quality
gates, and learning outcomes (per the milestone plan).

For this product, a Golden Path is what the coach uses to route a user through
**understanding their project**: a curated path that says "for a project like
yours, here is the route to understanding it, and here is what each step
teaches."

## How M2 serves the M1 definition

- **Persona** (`target-user-persona.md`): the catalog gives Mia a structured
  route instead of a blank "where do I start" — each Golden Path is a guided
  understanding journey for a recognizable kind of project.
- **Positioning** (`competitive-positioning.md`): Golden Paths are about
  *understanding* an existing project, not scaffolding a new one — this is
  where we borrow the "golden path" idea from Backstage but invert its purpose.
- **Metrics** (`success-metrics.md`): a Golden Path defines the "understanding
  path" whose completion + comprehension-check pass rate is the north-star
  metric.

## M2 required flow (from the milestone plan)

```
CCPM Plan / Spec → catalog schema decision → ADR if needed
→ CCPM Epic / Tasks → GitHub Issues → one issue at a time → CI → PR → review
```

v0 is **not** required for catalog schema/data tasks; it is required only if M2
adds UI issues (catalog page, detail page) — and only after a page spec.

## Open questions for M2's PRD

1. **Catalog schema** — what fields define a Golden Path? (id, name, target
   project type, steps, templates referenced, quality gates, learning outcomes,
   fit criteria, rejected alternatives.)
2. **Initial Golden Paths** — the milestone plan suggests: AI-native Next.js
   App, Agentic CCPM Workflow, Repo Understanding / Review Coach,
   Contract-first Fullstack App, LLM Observability App. Which 3–5 ship first?
3. **Storage** — flat files in-repo (e.g. `docs/` or a data package) vs a
   database. M1 assumes no DB yet; M2 likely starts file-based.
4. **Relationship to the Template Registry (M3)** — Golden Paths *reference*
   templates; confirm the boundary so M2 and M3 do not overlap.
5. **Explanation fields** — each Golden Path must carry sources, risks, fit
   criteria, and learning value so recommendations are never "naked LLM guesses".

## Definition of "M2 ready to start"

- This stub reviewed; M1 epic closed.
- M2 begins with CCPM Plan → a `golden-path-catalog` PRD answering the open
  questions above.
