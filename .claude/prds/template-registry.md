---
name: template-registry
description: Structured registry of the real-world templates Golden Paths build on — what each generates, why, its risks, alternatives, and learning value
status: backlog
created: 2026-05-21T00:33:03Z
---

# PRD: template-registry

## Executive Summary

The Template Registry (Milestone 3) is the structured knowledge base of the
**templates** that Golden Paths build on. A **template** is a reusable,
real-world starting artifact — a project scaffold (`create-next-app`), an
agentic workflow toolkit (`ccpm`), a CI config (GitHub Actions Node CI), a
security tool (CodeQL), or a document template (ADR template).

Milestone 2 already has Golden Paths *reference* templates by slug
(`templatesReferenced`), but those slugs currently resolve to nothing. M3 makes
them resolve: it defines the template schema, seeds **all 15 templates** from
the milestone plan, gives them a browsable UI, and enforces that every slug a
Golden Path references exists in the registry.

Templates are kept **separate from Golden Paths**: a Golden Path is a *route*, a
template is a *building block*, and multiple paths reference the same template.
The registry stores templates in the **same local SQLite database** as the
catalog (ADR 0006) — a new table, not a new store.

M3 builds the registry. It does **not** build the recommendation engine (M4) —
it provides the structured template data, including fit metadata, that M4 will
score against.

## Problem Statement

From the product PRD: Mia, a job-seeking junior dev, must genuinely understand
and defend an AI-built project. A Golden Path tells her *which* templates a kind
of project builds on — but `create-next-app` or `ccpm` is just a slug. She
cannot see what that template generates, why it is used, what risks it carries,
or what alternatives exist.

To understand an AI-built project, the user must understand its **building
blocks**, not only its route. Without a registry, every template reference in
the catalog is a dead end — a name with no explanation behind it. M3's job is to
turn those names into reviewable, explained entries.

## User Stories

### US-1 — Browse the template registry
As a user, I want to browse a registry of templates in the web app, so that I
can see the building blocks behind the Golden Paths.
**Acceptance:**
- The Template Registry UI page lists all templates with name, category, and
  summary.
- Templates can be viewed grouped by category.

### US-2 — Understand a single template
As a user, I want each template to explain itself fully, so that I can defend
why a project uses it instead of trusting a black box.
**Acceptance:**
- Every template detail view shows: what it generates, why it is used, its
  risks, its alternatives, its learning notes, and its sources.
- No explanation field is empty.

### US-3 — See where a template fits
As a user, I want each template to state the kinds of project and Golden Path it
suits, so that I can judge fit.
**Acceptance:**
- Every template carries structured **fit data** (fit criteria + fit factors).
- The registry UI surfaces a template's fit at a glance (Template Fit Score UI).

### US-4 — Template references resolve from Golden Paths
As a maintainer, I want every template slug referenced by a Golden Path to
resolve to a registry entry, so that the catalog has no dangling references.
**Acceptance:**
- Every slug in any Golden Path's `templatesReferenced` exists as a template.
- An automated check/test enforces this referential integrity.

### US-5 — A reviewable, reproducible registry
As a maintainer, I want the registry stored as structured, seedable data, so
that entries are reviewed, versioned, and extended like code.
**Acceptance:**
- Templates live in the local SQLite database (ADR 0006) with a defined schema.
- Entries are produced by a reproducible, version-controlled seed.

## Functional Requirements

- **FR-1 Template schema.** A `templates` table in the existing catalog SQLite
  database (ADR 0006) with fields: `id`, `slug`, `name`, `category`, `summary`,
  `what_it_generates`, `why_used`, `fit_criteria`, `fit_factors`, `risks`,
  `alternatives`, `learning_notes`, `sources`, `created_at`, `updated_at`.
- **FR-2 Fifteen seeded templates.** Reproducible, hand-authored seed data for
  all 15 milestone-plan templates: shadcn/ui monorepo, create-next-app, T3
  stack, claude-code-templates, CCPM, GitHub Spec Kit, BMAD, GitHub Actions Node
  CI, CodeQL, Gitleaks, Dependabot, ADR template, PRD template, OpenAPI
  contract-first template, Langfuse integration starter. Each entry is fully
  populated — no empty explanation fields.
- **FR-3 Template categories.** Each template belongs to a category (e.g.
  Project Scaffold, Agentic Workflow, CI, Security, Doc/Spec Template, Contract,
  Observability) so the registry can be browsed by category.
- **FR-4 Template fit data.** Each template carries structured fit data — fit
  criteria and fit factors — describing the project types and Golden Paths it
  suits. M3 *stores* this data; the runtime scoring/matching algorithm is M4.
- **FR-5 Data-access layer.** A typed module to query the registry (list all,
  get by slug, list by category) and to resolve a Golden Path's
  `templatesReferenced` into full template entries, usable server-side by the
  Next.js app.
- **FR-6 Referential integrity.** Every slug used in the M2 `goldenPathSeed`
  `templatesReferenced` arrays resolves to a template entry; a test enforces it.
- **FR-7 Template Registry UI.** Web pages in `apps/web`: a registry list page,
  a template detail page, and a fit-score presentation. Built via the
  page-spec → v0 → Claude Code integration flow (v0 rule).

## Non-Functional Requirements

- **Local-first.** The registry is a table in the local SQLite file; no server
  or external service.
- **Reviewable & reproducible.** The registry is rebuilt from a
  version-controlled seed; entries are reviewed like code.
- **Typed.** Schema and data-access layer are fully typed (TypeScript).
- **No naked LLM output.** M3 writes template entries by hand and review; it
  does not generate them with an unreviewed LLM call.
- **Consistent.** The schema, seed, and data-access patterns mirror the M2
  catalog so the two read the same way.

## Success Criteria

- The `templates` table exists in the catalog SQLite database and is created
  reproducibly.
- All **15** templates exist, each with every explanation field populated
  (what it generates, why used, fit data, risks, alternatives, learning notes,
  sources).
- Every `templatesReferenced` slug in the M2 seed resolves to a template — the
  referential-integrity test passes.
- The Template Registry UI lists all 15 templates, supports browsing by
  category, and shows full detail (including fit) for each.
- The data-access layer is typed and covered by at least basic tests.
- M4 could score a template by reading its fit data — the data model supports it.

## Constraints & Assumptions

- **Constraint:** template storage is the **same local SQLite database** as the
  catalog (ADR 0006) — a new table, not a new database.
- **Constraint:** all product work follows the CCPM workflow; one issue at a
  time; CI green before merge; the Template Registry UI follows the
  page-spec → v0 → Claude Code integration flow.
- **Constraint:** M3 runs as an epic on an `epic/template-registry` worktree and
  branch, merged to `main` via PR (ADR 0008).
- **Assumption:** "template fit scoring" in M3 means **structured fit data on
  each template**. The runtime algorithm that scores templates against a user's
  context is M4 (Recommendation Engine), not M3.
- **Assumption:** if M3 adds cross-links from the M2 catalog detail page to
  template entries, that integration touches the M2 catalog UI and is scoped as
  a small, explicit task in the epic.
- **Assumption:** no authentication and no per-user data; the registry is the
  same for everyone.

## Out of Scope

- **The recommendation engine (M4).** M3 builds the registry and its fit data;
  it does not match users to templates.
- **The Stack Decision Explainer (M5).**
- **Template authoring UI.** Entries are seeded/edited as data, not via an
  in-app editor.
- **Executing templates.** The registry *describes* templates; it does not run
  `create-next-app`, install CCPM, etc.
- **Search / vector similarity.** Browsing is list + category + detail.
- **Authentication, accounts, multi-user data.**

## Dependencies

- **M2 golden-path-catalog** (complete) — provides the SQLite database and the
  `templatesReferenced` slugs the registry must resolve.
- **ADR 0006** — Golden Path Catalog storage (SQLite) — M3 reuses this store.
- **A possible new ADR** — the template schema decision, created during the
  epic phase if the schema warrants it ("ADR if needed").
- **M4 (Recommendation Engine)** — will consume the registry's fit data.
- **ADR 0008** — parallel execution model; M3 runs in parallel with M11
  (amended pairing).
- **Human review** — approval of this PRD is required before the M3 epic is
  executed.
