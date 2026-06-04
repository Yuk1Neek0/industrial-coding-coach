---
name: backstage-template-import
description: Import real Backstage software templates (template.yaml) into the Template Registry via a deterministic mapper plus reviewed enrichment, with source provenance
status: backlog
created: 2026-06-04T14:04:41Z
---

# PRD: backstage-template-import

## Executive Summary

Milestone 14 connects the product's Template Registry (M3) to a recognised
industry standard: **Backstage Software Templates**. Backstage (Spotify's
CNCF developer portal) describes reusable project scaffolds as `template.yaml`
files (`kind: Template`, scaffolder `parameters` + `steps`). M14 takes real
Backstage software templates and brings them into our registry as first-class,
reviewed entries — so the catalog is no longer limited to the 15 hand-authored
templates, and so the product can speak the same "software template" language
real engineering orgs use.

The mechanism is a **deterministic importer plus a curated seed**:

1. A typed, deterministic mapper parses a Backstage `template.yaml` and maps its
   mechanical fields (name, description, type/tags, steps, source URL) onto our
   `templates` schema.
2. Because a Backstage `template.yaml` does **not** carry the registry's
   *coaching* fields (`why_used`, `fit_criteria`, `fit_factors`, `risks`,
   `alternatives`, `learning_notes`), each imported template is paired with a
   **reviewed enrichment companion** that supplies those fields by hand — so
   every entry stays fully populated and no field is naked LLM output.
3. A version-controlled set of **real Backstage software templates is bundled
   in-repo as fixtures** and run through the importer to seed the registry,
   keeping the whole pipeline local-first and reproducible.

Imported templates land in the **same `templates` table** as the existing 15,
distinguished by new **provenance** fields (`source`, `source_url`,
`source_format`). The existing data-access layer, referential-integrity check,
and registry UI keep working; the UI gains a small provenance affordance so a
user can see a template came from Backstage and follow it to its origin.

M14 does **not** build a recommendation engine, run scaffolders, or accept
arbitrary unreviewed remote templates at runtime. It is an importer + reviewed
seed, in the spirit of M2/M3.

## Problem Statement

Mia, a job-seeking junior dev, is coached to understand and defend an AI-built
project. The Template Registry explains the building blocks behind Golden
Paths, but today it is a closed set of 15 entries we authored by hand. Two gaps
follow:

1. **It does not connect to how real orgs work.** "Software templates" /
   "golden paths" are an industry practice with a dominant open-source
   implementation — Backstage. A coach that ignores that standard misses a
   chance to teach Mia the actual vocabulary and tooling she will meet on the
   job, and misses an obvious portfolio talking point ("I integrated Backstage
   software templates into my own registry").

2. **The registry has no way in.** Every template is bespoke seed data. There
   is no reproducible path to bring an *external, real-world* template
   definition into the registry while keeping the product's hard rules:
   local-first, reviewable, every explanation field populated, no naked LLM
   output.

M14's job is to build that way in for the most important external source
(Backstage), prove it with real templates, and do it without violating the
registry's review discipline.

## User Stories

### US-1 — Browse Backstage-sourced templates alongside the curated ones
As a user, I want imported Backstage templates to appear in the Template
Registry next to the hand-authored ones, so that my registry reflects real
industry templates, not just our 15.
**Acceptance:**
- After seeding, the Template Registry list shows the imported Backstage
  templates together with the existing 15, browsable by category.
- Each imported template's detail view shows every registry field populated
  (what it generates, why used, fit, risks, alternatives, learning notes,
  sources) — no empty fields.

### US-2 — See where a template came from
As a user, I want to see that a template originated from Backstage and follow it
to its source, so that I can trust the entry and learn from the real definition.
**Acceptance:**
- Imported templates display a **provenance** indicator (e.g. a "Source:
  Backstage" badge) in the registry UI.
- The provenance links to the template's `source_url` (its `template.yaml`
  origin).
- Curated (non-imported) templates show no Backstage badge; they are marked as
  internally curated.

### US-3 — Import a Backstage template deterministically
As a maintainer, I want a Backstage `template.yaml` to map onto our schema
deterministically, so that imports are reproducible and reviewable like code.
**Acceptance:**
- A typed importer takes a parsed Backstage `template.yaml` plus its reviewed
  enrichment companion and produces a complete, valid registry row.
- The importer is pure/deterministic (no network, no LLM at import time); the
  same inputs always produce the same row.
- The importer rejects (with a clear error) a template that is missing required
  Backstage fields or whose enrichment leaves a required registry field empty.

### US-4 — Reproducible, reviewed seed from bundled fixtures
As a maintainer, I want the imported templates produced from version-controlled
fixtures, so that the registry can be rebuilt reproducibly and every imported
entry was reviewed.
**Acceptance:**
- At least **three real** Backstage software templates (`template.yaml`) are
  committed in-repo as fixtures, each with a reviewed enrichment companion.
- Re-running the seed/import is idempotent — it does not duplicate entries on a
  second run.
- The fixtures cite their real upstream source.

### US-5 — Imports do not break existing registry guarantees
As a maintainer, I want imported templates to coexist with the curated set
without breaking referential integrity, so that the catalog stays consistent.
**Acceptance:**
- Imported template slugs are unique and do not collide with the 15 curated
  slugs.
- The existing Golden Path `templatesReferenced` referential-integrity test
  still passes.
- Existing data-access functions (list all, get by slug, list by category,
  resolve `templatesReferenced`) keep working unchanged and now return imported
  templates too.

## Functional Requirements

- **FR-1 Provenance schema.** Extend the `templates` table with provenance
  fields: `source` (`'curated' | 'backstage'`), `source_url` (nullable), and
  `source_format` (nullable, e.g. `'backstage/scaffolder.v1beta3'`). A migration
  adds the columns and **backfills the existing 15 entries to `source =
  'curated'`**.
- **FR-2 Backstage template model.** A typed representation of the subset of a
  Backstage `template.yaml` the importer consumes: `apiVersion`, `kind`,
  `metadata` (`name`, `title`, `description`, `tags`, `annotations`), and
  `spec` (`type`, `owner`, `parameters`, `steps`). A typed YAML parse step
  produces this model from raw `template.yaml` text.
- **FR-3 Deterministic mapper.** A pure function mapping a parsed Backstage
  template + a reviewed enrichment record onto a `NewTemplate`:
  - **Mechanical fields from `template.yaml`:** `slug` (derived from
    `metadata.name`, namespaced to avoid collisions), `name` (from
    `metadata.title`/`name`), `summary` (from `metadata.description`),
    `category` (mapped from `spec.type`/`metadata.tags` into the registry's
    category vocabulary), `what_it_generates` (derived deterministically from
    `spec.steps`/`spec.type`), and `sources` (including the `template.yaml`
    origin URL).
  - **Coaching fields from the enrichment companion:** `why_used`,
    `fit_criteria`, `fit_factors`, `risks`, `alternatives`, `learning_notes`,
    plus any additional curated `sources`.
  - **Provenance:** `source = 'backstage'`, `source_url`, `source_format`.
- **FR-4 Enrichment companion format.** A version-controlled, reviewable
  companion (e.g. a sidecar file keyed to each fixture) carrying the coaching
  fields Backstage does not provide. The importer requires the companion and
  fails if a required registry field would be empty — enforcing "every field
  populated, no naked output."
- **FR-5 Bundled fixtures.** At least three real Backstage software templates
  committed in-repo as fixtures (`template.yaml` + enrichment), each citing its
  real upstream source.
- **FR-6 Reproducible seed/import.** A reproducible, idempotent seed step that
  runs the fixtures through the importer and writes them into the `templates`
  table, consistent with the existing M2/M3 seed pattern.
- **FR-7 Data-access continuity.** The existing typed data-access layer returns
  imported templates through the same functions; an accessor (or returned field)
  lets the UI distinguish source/provenance.
- **FR-8 Registry UI provenance.** The Template Registry UI surfaces provenance
  — a source badge and a link to `source_url` on list and/or detail — built via
  the page-spec → v0 → integration flow if it warrants new page work, or as a
  small bounded enhancement to the existing registry pages otherwise.
- **FR-9 Integrity preserved.** Imported slugs are unique vs. the curated set,
  and the Golden Path `templatesReferenced` referential-integrity test
  continues to pass.

## Non-Functional Requirements

- **Local-first.** Import reads bundled in-repo fixtures; no network and no
  external service at import time. (Live fetch from GitHub is explicitly a
  future extension, out of scope here.)
- **Deterministic & no naked LLM output.** The mapper is pure and reproducible;
  coaching fields come from reviewed companions, never from an unreviewed LLM
  call at import time.
- **Reviewable & reproducible.** Fixtures + enrichment are version-controlled
  and reviewed like code; re-running the seed is idempotent.
- **Typed.** The Backstage model, importer, enrichment record, and provenance
  schema are fully typed (TypeScript).
- **Consistent.** Schema, seed, and data-access changes mirror the existing M3
  registry patterns so the registry continues to read the same way.
- **Non-destructive migration.** Adding provenance columns preserves all
  existing template data; the 15 curated entries remain intact and become
  `source = 'curated'`.

## Success Criteria

- The `templates` table has `source`, `source_url`, `source_format`; all
  existing 15 rows are backfilled to `source = 'curated'`; the migration runs
  cleanly and reproducibly.
- At least **3** real Backstage software templates are imported from in-repo
  fixtures, each with **every** required registry field populated (no empty
  fields) and `source = 'backstage'` with a working `source_url`.
- The importer is deterministic and typed, covered by tests including a
  round-trip (fixture `template.yaml` + enrichment → expected `Template` row)
  and a failure test (missing required field → clear error).
- Re-running the seed/import is idempotent — total template count is stable on a
  second run.
- The Golden Path referential-integrity test still passes; no imported slug
  collides with a curated slug.
- The Template Registry UI lists imported templates alongside the curated ones
  and shows their Backstage provenance (badge + source link).
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and the db test suite pass; CI is
  green on the epic PR.

## Constraints & Assumptions

- **Constraint:** storage is the **same local SQLite `templates` table** (ADR
  0006); M14 extends it with provenance columns rather than creating a new
  store.
- **Constraint:** all product work follows the CCPM workflow — one issue at a
  time, bounded-work statements, AI self-review, local verification, PR, green
  CI before merge.
- **Constraint:** M14 runs as an epic on an `epic/backstage-template-import`
  worktree/branch, merged to `main` via PR (ADR 0008).
- **Constraint:** any new registry UI page follows the page-spec → v0 → Claude
  Code integration flow (v0 rule); a small badge/link enhancement to existing
  pages is treated as a bounded integration task.
- **Assumption:** "Backstage-style software templates" means the **scaffolder
  `template.yaml`** format (`kind: Template`,
  `scaffolder.backstage.io/v1beta3`), **not** the broader Backstage catalog
  entities (`catalog-info.yaml` Components/Systems).
- **Assumption:** Backstage `template.yaml` does not contain the registry's
  coaching fields; supplying them via a reviewed enrichment companion is
  expected and intended, not a workaround.
- **Assumption:** no authentication and no per-user data; the registry remains
  the same for everyone.
- **Assumption:** a schema-change ADR is created during the epic phase if the
  provenance change warrants it ("ADR if needed").

## Out of Scope

- **Live/runtime import of arbitrary remote templates.** No "paste a URL / fetch
  from GitHub" import path in M14; fixtures are bundled in-repo. (Future
  extension; M11 GitHub integration exists for it later.)
- **Running scaffolders.** The registry *describes* Backstage templates; it does
  not execute `template.yaml` steps or generate projects.
- **Backstage catalog entities** (`catalog-info.yaml` Components/Systems/APIs)
  — only software templates are in scope.
- **LLM-generated enrichment.** Coaching fields are hand-authored and reviewed,
  not produced by an unreviewed model call.
- **Recommendation/scoring (M4).** M14 stores imported templates and their fit
  data; it does not match users to them.
- **In-app template authoring/editing UI.** Entries are produced from fixtures +
  enrichment as data, not via an editor.
- **Bidirectional sync / export back to Backstage.** Import only.
- **Authentication, accounts, multi-user data.**

## Dependencies

- **M3 template-registry** (complete) — provides the `templates` table, schema,
  data-access layer, seed pattern, and registry UI that M14 extends.
- **M2 golden-path-catalog** (complete) — provides the `templatesReferenced`
  referential-integrity check imports must not break.
- **ADR 0006** — Golden Path Catalog storage (SQLite) — M14 reuses this store.
- **ADR 0008** — parallel execution model — M14 runs as an `epic/` worktree.
- **A possible new ADR** — provenance schema / Backstage import-contract
  decision, created during the epic phase if warranted.
- **M11 github-integration** (complete) — not used in M14, but is the basis for
  a future live-fetch extension.
- **Human review** — approval of this PRD is required before the M14 epic is
  executed.
