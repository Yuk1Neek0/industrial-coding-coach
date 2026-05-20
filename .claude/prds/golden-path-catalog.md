---
name: golden-path-catalog
description: Curated catalog of Golden Paths — recommended routes for understanding a kind of AI-assisted project
status: backlog
created: 2026-05-20T19:17:40Z
---

# PRD: golden-path-catalog

## Executive Summary

The Golden Path Catalog is the curated knowledge base at the centre of
Industrial Coding Coach. A **Golden Path** is a full recommended route for
*understanding* a kind of AI-assisted project — it bundles the steps to
understand it, the templates it builds on, its quality gates, the learning
outcomes, and explicit reasoning (fit criteria, rejected alternatives, sources,
risks).

Milestone 2 delivers the **catalog MVP**: the schema (stored in a local SQLite
database), **five seeded Golden Path entries**, a typed data-access layer, and a
**Catalog UI page** to browse them in the web app. The catalog is what makes
later recommendations grounded — so a recommendation is never a "naked LLM
guess" but a citation into a reviewed catalog entry.

M2 builds the catalog. It does **not** build the recommendation engine (M4) or
the Template Registry (M3) — it provides the structured data both will consume.

## Problem Statement

From the product PRD: Mia, a job-seeking junior dev, faces a blank page — she
has an AI-built project and no idea how to start understanding it. She needs a
*structured route*, not improvised advice.

If the product simply asked an LLM "how should this user understand their
project?", the answer would be unreviewable, inconsistent, and unaccountable —
exactly the black-box problem the product exists to fix. The product must
instead recommend from a **curated, reviewed catalog** of routes, each carrying
its own reasoning the user (and the team) can inspect.

Milestone 2's job is to create that catalog and prove the model with five real
entries and a way to browse them.

## User Stories

### US-1 — Browse the catalog of routes
As a user, I want to browse a catalog of Golden Paths in the web app, so that I
can see the structured routes available for understanding a project.
**Acceptance:**
- The Catalog UI page lists all Golden Paths with name and summary.
- Selecting a path shows its full detail (steps, fit criteria, learning
  outcomes, rejected alternatives, sources, risks).

### US-2 — Understand why a path fits
As a user, I want each Golden Path to state who it is for and why, so that I can
judge whether it matches my project instead of trusting a black box.
**Acceptance:**
- Every entry has explicit **fit criteria** (the kind of project it suits).
- Every entry has **rejected alternatives** — paths considered and why not.
- Every entry cites **sources** and lists **risks**.

### US-3 — See the learning value of a path
As a job-seeking junior dev, I want each Golden Path to state what I will be
able to explain after following it, so that I know it improves my interview
readiness.
**Acceptance:**
- Every entry lists concrete **learning outcomes**.
- Every entry lists the **steps** of the understanding journey.

### US-4 — A reviewable, maintainable catalog
As a maintainer, I want the catalog stored as structured, seedable data, so that
entries can be reviewed, versioned, and extended.
**Acceptance:**
- The catalog lives in a local SQLite database with a defined schema (ADR 0006).
- Entries are produced by a reproducible seed; the seed is version-controlled.

## Functional Requirements

- **FR-1 Catalog schema.** A `golden_paths` schema in local SQLite (per ADR
  0006) with fields: `id`, `slug`, `name`, `summary`, `target_project_type`,
  `fit_criteria`, `steps`, `templates_referenced`, `quality_gates`,
  `learning_outcomes`, `rejected_alternatives`, `sources`, `risks`,
  `created_at`, `updated_at`.
- **FR-2 Five seeded Golden Paths.** Reproducible seed data for: (1) AI-native
  Next.js App, (2) Agentic CCPM Workflow, (3) Repo Understanding & Review
  Coach, (4) Contract-first Fullstack App, (5) LLM Observability & Eval App.
  Each entry is fully populated — no empty explanation fields.
- **FR-3 Data-access layer.** A typed module in the monorepo to query the
  catalog (list all, get by slug), usable server-side by the Next.js app.
- **FR-4 Catalog UI page.** A web page in `apps/web` to browse the catalog —
  a list view and a detail view. Built via the page-spec → v0 → integration
  flow (v0 rule).
- **FR-5 Explanation fields enforced.** Every entry carries fit criteria,
  rejected alternatives, learning outcomes, sources, and risks — so downstream
  recommendations can always cite reasoning.

## Non-Functional Requirements

- **Grounded.** Every Golden Path carries sources, risks, and fit criteria;
  recommendations built on it are never naked LLM guesses.
- **Local-first.** The catalog is a local SQLite file; no server or external
  service (consistent with the product PRD).
- **Reviewable & reproducible.** The catalog is rebuilt from a version-controlled
  seed; entries are reviewed like code.
- **Typed.** Schema and data-access layer are fully typed (TypeScript).
- **No naked LLM output.** M2 itself writes catalog entries by hand/review; it
  does not generate them with an unreviewed LLM call.

## Success Criteria

- The SQLite schema exists and is created reproducibly.
- All **five** Golden Path entries exist, each with every explanation field
  populated (fit criteria, steps, learning outcomes, rejected alternatives,
  sources, risks).
- The Catalog UI page lists all five and shows full detail for each.
- The data-access layer is typed and covered by at least basic tests.
- A later recommendation could cite a catalog entry by `slug` — the data model
  supports it.

## Constraints & Assumptions

- **Constraint:** catalog storage is **local SQLite** — see ADR 0006.
- **Constraint:** built on the M0 monorepo; the Catalog UI page follows the
  page-spec → v0 → Claude Code integration flow.
- **Constraint:** all product work follows the CCPM workflow; one issue at a
  time; CI green before merge.
- **Assumption:** Golden Paths *reference* templates by identifier; the
  Template Registry itself is M3 — M2 stores references, not template bodies.
- **Assumption:** no authentication or per-user data in M2; the catalog is the
  same for everyone.

## Out of Scope

- **The recommendation engine (M4).** M2 builds the catalog; it does not match
  users to paths.
- **The Template Registry (M3).** M2 stores template *references*; M3 defines
  the templates.
- **Catalog authoring UI.** Entries are seeded/edited as data in M2, not via an
  in-app editor.
- **Search / vector similarity.** Browsing is list + detail; semantic search is
  a later concern.
- **Authentication, accounts, multi-user data.**

## Dependencies

- **M0 foundation** and **M1 product definition** (complete).
- **ADR 0005** — LLM integration (M2 is mostly data/UI; minimal LLM use).
- **ADR 0006** — Golden Path Catalog storage (SQLite) — created with this PRD.
- **M3 (Template Registry)** — will define the templates that Golden Paths
  reference.
- **M4 (Recommendation Engine)** — will consume this catalog.
- **Human review** — approval of this PRD and ADR 0006 is required before the
  M2 epic is executed.
