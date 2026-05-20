# Spec: Competitive Positioning Teardown

Issue: #23 · Epic: product · Source: `.claude/prds/product.md`

Distinguishes Industrial Coding Coach from adjacent tools so later milestones do
not drift into their territory.

## One-line positioning

> Industrial Coding Coach is a coach for code you **already have** — it turns an
> AI-generated project into one you genuinely **understand and can defend**.
> It does not generate, scaffold, or manage projects.

## Positioning facets

1. **Coaches existing repos** — analyzes the user's project; never generates new
   ones.
2. **Teaches understanding, not generation** — the others build; this explains
   and reviews.
3. **Produces job-market artifacts** — interview Q&A, résumé bullets,
   architecture explanations tied to the user's project.
4. **Comprehension-checked** — every step has an understanding check; not a
   passive tutorial.
5. **Visualizes the industrial dev workflow in real time** — shows how
   real-world software is built (requirement → spec → issue → change → CI →
   review), not just how to prompt an AI.

## Teardown vs adjacent tools

| Tool | What it does | Overlap | How we differ |
|---|---|---|---|
| **CCPM** | Spec-driven delivery workflow: PRD → epic → issues → agents | We *use* CCPM internally and *teach* its workflow | CCPM **runs** delivery; we **explain** it to a learner and check understanding |
| **BMAD** | Agent-driven planning/build method | Both involve AI + structured process | BMAD helps you *build*; we help you *understand* something already built |
| **Kiro** | Spec-driven AI IDE that generates code | Both care about specs and AI code | Kiro is an IDE that *writes* code; we are a web coach that *explains* existing code — no IDE |
| **Backstage** | Internal developer portal; software templates / golden paths | We borrow the "golden path" idea (M2) | Backstage serves platform teams scaffolding services; we serve a junior dev understanding one repo |
| **Generic tutorials / courses** | Teach concepts via a fixed syllabus | Both teach | Tutorials teach *someone else's* example; we teach *the user's own* project, with comprehension checks |

## What we are deliberately NOT

- Not a code generator or scaffolder.
- Not an IDE or an autonomous coding agent.
- Not a team project-management tool.
- Not a generic course detached from the user's repo.

## Why this positioning wins for the target user

Mia (see `target-user-persona.md`) does not need another way to *produce* code —
AI already does that. She needs to *understand* what she produced so she can
defend it in interviews. No adjacent tool targets that gap directly; they target
generation, delivery, or generic teaching.
