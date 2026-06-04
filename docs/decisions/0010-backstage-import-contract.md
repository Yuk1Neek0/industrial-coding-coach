# ADR 0010 — Backstage Template Import Contract & Registry Provenance

- **Status:** Accepted
- **Date:** 2026-06-04

## Context

Milestone 14 (Backstage / Golden Path Source Import) brings real **Backstage
software templates** (`kind: Template`, `scaffolder.backstage.io/v1beta3`
`template.yaml` files) into the Template Registry built in M3. Until now the
registry held only the 15 hand-authored, reviewed entries seeded in
`template-seed-data.ts`. The milestone PRD
(`.claude/prds/backstage-template-import.md`) and epic
(`.claude/epics/backstage-template-import/epic.md`) require settling, before the
implementation tasks run, how external templates enter the registry without
breaking its hard constraints:

- **Local-first.** No external service or network at import time (the registry is
  a local SQLite table — ADR 0006).
- **Reviewable & reproducible.** Entries are rebuilt from a version-controlled
  seed and reviewed like code.
- **Every field populated, no naked LLM output.** Each registry row must carry a
  full explanation (what it generates, why used, fit, risks, alternatives,
  learning notes, sources) authored/reviewed by a human — never an unreviewed
  model call.

A Backstage `template.yaml` carries only *mechanical* metadata
(`metadata.name`/`title`/`description`/`tags`, `spec.type`/`owner`/`parameters`/
`steps`). It does **not** carry the registry's *coaching* fields (`why_used`,
`fit_criteria`, `fit_factors`, `risks`, `alternatives`, `learning_notes`). Three
decisions must be settled:

1. **Storage** — where imported templates live relative to the curated 15, and
   how they are distinguished.
2. **Import contract** — how a `template.yaml` becomes a complete registry row
   given the coaching-field gap.
3. **Parsing** — how `template.yaml` (YAML) is read.

Options considered:

- **Storage** — (a) the existing `templates` table with added provenance
  columns; (b) a separate `imported_templates` table/namespace.
- **Import contract** — (a) a pure mapper that maps mechanical fields plus a
  human-reviewed *enrichment companion* for the coaching fields; (b) auto-fill
  the coaching fields with an LLM at import time; (c) import only the mechanical
  fields and leave the coaching fields empty.
- **Parsing** — (a) a vetted YAML library; (b) a bespoke parser.

## Decision

### 1. Storage — the existing `templates` table with provenance columns

Imported templates are **first-class rows in the existing `templates` table**
(ADR 0006), not a separate store. Three provenance columns are added:

- `source` — `'curated' | 'backstage'`, **NOT NULL, default `'curated'`**. The
  default makes the migration backfill every existing curated row and lets
  curated callers omit it.
- `source_url` — nullable; for imported entries, the upstream `template.yaml`
  URL.
- `source_format` — nullable; e.g. `'backstage/scaffolder.v1beta3'`.

The existing `select()`-based data-access (`templates.ts`) returns the new
columns automatically; the existing Golden Path `templatesReferenced`
referential-integrity check is unaffected (imports only *add* slugs).

### 2. Import contract — deterministic mapper + reviewed enrichment companion

A Backstage template becomes a registry row through a **pure, deterministic
function** `mapBackstageTemplate(parsed, enrichment) → NewTemplate`:

- **Mechanical fields** are derived from the parsed `template.yaml`: `slug`
  (from `metadata.name`, namespaced to avoid colliding with curated slugs),
  `name`, `summary`, `category` (mapped from `spec.type`/`tags`),
  `what_it_generates` (derived from `spec.steps`/`type`), and `sources`
  (including the origin URL).
- **Coaching fields** (`why_used`, `fit_criteria`, `fit_factors`, `risks`,
  `alternatives`, `learning_notes`) come from a typed, version-controlled
  **enrichment companion** authored and reviewed by a human.
- **Provenance** is set: `source = 'backstage'`, `source_url`, `source_format`.
- **Fail-closed:** the function throws if a required Backstage field is missing
  or any NOT-NULL registry field would be empty after merging.

The function is pure — no IO, no network, no LLM — so it is fully unit-testable
and reproducible. The set of importable templates ships as **in-repo bundled
fixtures** (a `template.yaml` + an enrichment companion each), run through the
mapper by the existing idempotent `seed.ts`. Live fetch from GitHub is **not**
part of this milestone (a future extension on top of M11).

LLM auto-fill of coaching fields (option 2b) is rejected: it would reintroduce
the naked-output problem the registry exists to avoid. Mechanical-only import
(2c) is rejected: it would leave empty explanation fields, violating the
registry invariant.

### 3. Parsing — a vetted YAML library

`template.yaml` is parsed with the **`yaml`** npm package, added as a dependency
of `packages/db` per its official documentation. No bespoke YAML parser is
written.

## Rationale

- **One table + provenance** keeps a single schema, data-access layer, seed
  entry point, and UI surface; a separate table would duplicate all of them for
  no gain. A `NOT NULL DEFAULT 'curated'` column is the simplest non-destructive
  way to backfill existing rows and to make provenance a required, queryable
  property of every template. This **confirms** ADR 0006's single-local-DB model.
- **Mapper + reviewed enrichment** is the only option that satisfies *both* "a
  genuine Backstage integration" and the registry's review discipline: the
  mechanical mapping is real and deterministic, while the coaching content stays
  human-authored. It mirrors how M3 produced the curated 15 (reviewed seed
  data), extended with a deterministic front-end for the external format.
- **Vetted YAML library** avoids a class of parsing bugs and security issues a
  hand-rolled parser would invite, consistent with the project rule to install
  tools from official sources rather than reimplement them.

## Consequences

- `packages/db/src/schema.ts` gains `source` / `source_url` / `source_format` on
  the `templates` table; migration `0012_brainy_boomer.sql` adds them
  additively and backfills curated rows to `'curated'`. The generated `.db` file
  stays git-ignored; schema + migration are the reviewed source of truth.
- `Template` / `NewTemplate` types gain the provenance fields via Drizzle
  inference; because `source` has a default, it is optional on insert, so
  existing curated seed code keeps compiling.
- A new dependency, `yaml`, is added to `packages/db` (task #244).
- Downstream M14 tasks build on this ADR: #244 (parser), #245 (enrichment
  format), #246 (mapper), #247 (fixtures), #248 (seed integration), #249 (UI
  provenance).
- The registry can later support additional sources (e.g. live GitHub fetch, or
  other template ecosystems) by extending the `source` enum and adding loaders;
  this ADR is revisited rather than silently widened if that happens.
- Complements ADR 0006 (storage) and ADR 0008 (parallel execution — M14 runs as
  the `epic/backstage-template-import` branch). Supersedes nothing.
