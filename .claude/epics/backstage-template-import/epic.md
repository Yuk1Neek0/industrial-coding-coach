---
name: backstage-template-import
status: backlog
created: 2026-06-04T14:09:57Z
updated: 2026-06-04T14:41:59Z
progress: 0%
prd: .claude/prds/backstage-template-import.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/242
---

# Epic: backstage-template-import

## Overview

Bring real Backstage software templates into the existing Template Registry (M3)
as first-class, reviewed entries, distinguished by source provenance. The
mechanism is a **deterministic importer + curated seed**: a pure mapper turns a
parsed Backstage `template.yaml` plus a reviewed enrichment companion into a
`NewTemplate` row; a set of version-controlled, in-repo fixtures is run through
that mapper by the existing seed pipeline. Imported rows live in the same
`templates` table as the 15 curated entries, with new `source` / `source_url` /
`source_format` columns; the existing data-access layer, referential-integrity
test, and registry UI keep working, with the UI gaining a small provenance
affordance.

This epic deliberately reuses the M3 machinery (`templates` schema, `seed.ts`,
`templates.ts` data-access, `apps/web/app/templates/*` UI) and adds a thin,
well-tested import layer in `packages/db`. No new store, no runtime fetch, no
scaffolder execution, no LLM at import time.

## Architecture Decisions

- **AD-1 Same table + provenance, not a new store.** Extend `templates` with
  `source` (`'curated' | 'backstage'`, NOT NULL, default `'curated'` so the
  migration backfills the 15 existing rows), `source_url` (nullable),
  `source_format` (nullable, e.g. `'backstage/scaffolder.v1beta3'`). The
  existing `select()`-based data-access returns the new columns automatically.
- **AD-2 Import = pure mapper + reviewed enrichment.** Mechanical fields come
  deterministically from `template.yaml`; coaching fields
  (`why_used`/`fit_criteria`/`fit_factors`/`risks`/`alternatives`/
  `learning_notes`) come from a typed, version-controlled enrichment companion.
  The mapper is a pure function — no IO, no network, no LLM — so it is fully
  unit-testable and reproducible.
- **AD-3 Fail-closed validation.** The mapper/import rejects a fixture whose
  parsed YAML is missing required Backstage fields or whose merged result would
  leave any NOT-NULL registry field empty. This enforces the PRD invariant
  "every field populated, no naked output" at build/seed time.
- **AD-4 Reuse the idempotent seed.** Extend `seed.ts`'s drop-and-reload to also
  produce imported rows (curated `templateSeed` ++ imported rows), keeping a
  single reproducible seed entry point. Slug-uniqueness across curated +
  imported is asserted by test.
- **AD-5 YAML parsing via a vetted library.** Add the `yaml` package (installed
  per its official docs/README, recorded in the ADR/setup note) for parsing
  `template.yaml`. No bespoke YAML parser.
- **AD-6 ADR for the provenance/import contract.** Record AD-1..AD-3 as a new
  ADR under `docs/decisions/` during the epic (the PRD's "ADR if needed").

## Technical Approach

### Backend Services (packages/db)

- **Schema + migration:** add the three provenance columns to the `templates`
  table in `schema.ts`; regenerate the Drizzle migration (`0012_*`); the NOT-NULL
  default backfills curated rows. Update `Template` / `NewTemplate` types (free
  via `$inferSelect`/`$inferInsert`). Mark `templateSeed` entries `source:
  'curated'` (explicit, even though the default covers it).
- **Backstage model + parser:** a typed `BackstageTemplate` (subset:
  `apiVersion`, `kind`, `metadata{name,title,description,tags,annotations}`,
  `spec{type,owner,parameters,steps}`) and `parseBackstageTemplate(yamlText)`
  using the `yaml` lib, with validation of required fields.
- **Enrichment companion:** a typed `TemplateEnrichment` record (the coaching
  fields + extra sources/category override) and a loader that pairs each fixture
  `template.yaml` with its companion file.
- **Deterministic mapper:** `mapBackstageTemplate(parsed, enrichment):
  NewTemplate` — derives `slug` (namespaced to avoid collisions), `name`,
  `summary`, `category` (mapped from `spec.type`/`tags` to the registry
  vocabulary), `what_it_generates` (derived from `spec.steps`/`type`), `sources`
  (incl. origin URL), merges the enrichment coaching fields, sets provenance,
  and validates fail-closed.
- **Import + seed integration:** a helper that loads all fixtures → maps → array
  of `NewTemplate`, wired into `seed.ts` after `templateSeed`; idempotent.
- **Data-access:** existing `templates.ts` functions return imported rows
  unchanged; expose provenance to callers (already on the row). Add a thin
  helper only if the UI needs filtering by source.

### Frontend Components (apps/web/app/templates)

- **Provenance affordance:** a "Source: Backstage" badge + external link to
  `source_url` on `template-card.tsx` (list) and `detail-view.tsx` (detail);
  curated entries render as internally curated. Small, bounded enhancement to
  existing pages. If it grows into new page structure, a Page Spec delta under
  `docs/design/` + v0 draft precedes integration (v0 rule); a badge/link on
  existing pages is treated as a direct bounded integration task.

### Infrastructure

- No new infrastructure. Same local SQLite store (ADR 0006). New dev dependency
  `yaml`. Fixtures committed under `packages/db` test/fixture dirs. CI unchanged
  (lint/typecheck/build/test + security) is the gate.

## Implementation Strategy

Run as an `epic/backstage-template-import` worktree/branch merged to `main` via
PR (ADR 0008). Sequence in waves so the schema lands first, the pure building
blocks are built in parallel, then the mapper + fixtures, then integration and
UI. Tests are co-located with the code they cover (matching the repo pattern),
so there is no standalone "tests" task. Keep each task a single bounded issue.

## Task Breakdown Preview

Target: 7 tasks (≤10). Parallelizable tasks marked `[P]`.

1. **Provenance schema + migration + ADR** — add `source`/`source_url`/
   `source_format` to `templates` (schema.ts), generate migration `0012`,
   backfill curated rows, mark `templateSeed` as `source: 'curated'`, write the
   provenance/import-contract ADR. Tests: schema/migration + curated rows carry
   provenance. *(foundation; blocks 4, 6, 7 writes)*
2. **[P] Backstage model + YAML parser** — add `yaml` dep; typed
   `BackstageTemplate` + `parseBackstageTemplate` with required-field validation;
   tests. *(independent of 1)*
3. **[P] Enrichment companion format + loader** — typed `TemplateEnrichment` +
   fixture pairing/loader; tests. *(independent of 1)*
4. **Deterministic mapper** — `mapBackstageTemplate(parsed, enrichment)` with
   field derivation, provenance, fail-closed validation; tests: round-trip +
   missing-field failure. *(depends on 1, 2, 3)*
5. **[P] Bundled Backstage fixtures** — ≥3 real Backstage software templates
   (`template.yaml`) + reviewed enrichment companions, each citing upstream
   source. *(depends on the 2/3 formats; content authoring)*
6. **Import + seed integration** — load fixtures → mapper → insert via extended
   `seed.ts`; idempotent; slug-uniqueness vs curated; referential-integrity test
   stays green. Tests for uniqueness + idempotency. *(depends on 4, 5, 1)*
7. **[P] Registry UI provenance** — Backstage badge + `source_url` link on
   list/detail; Page Spec delta + v0 only if new page structure is needed;
   integrate. *(depends on 1; parallel with 4–6)*

## Dependencies

- **M3 template-registry** (complete) — `templates` schema/seed/data-access/UI
  this epic extends.
- **M2 golden-path-catalog** (complete) — `referential-integrity.test.ts` must
  stay green.
- **ADR 0006** — SQLite store (reused). **ADR 0008** — parallel epic execution.
- **New dep `yaml`** — installed per official docs; recorded in the new ADR.
- **New ADR** — provenance + import-contract decision (task 1).
- **Human review** — PRD approved; epic + each task PR require review before merge.

## Success Criteria (Technical)

- `templates` has `source`/`source_url`/`source_format`; migration `0012` runs
  cleanly; all 15 curated rows backfilled to `source = 'curated'`.
- ≥3 real Backstage templates imported from in-repo fixtures, every NOT-NULL
  registry field populated, `source = 'backstage'` + working `source_url`.
- `mapBackstageTemplate` is pure/deterministic, covered by round-trip + failure
  tests; the importer rejects incomplete inputs with a clear error.
- Seed is idempotent (stable total count on re-run); no imported slug collides
  with a curated slug; referential-integrity test passes.
- Registry UI shows Backstage provenance (badge + source link) for imported
  templates; curated entries unaffected.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, db tests pass; CI green on the PR.

## Estimated Effort

~7 bounded tasks across ~3–4 waves. Backend-heavy (5 tasks in `packages/db`),
one UI task, one fixtures/authoring task. Comparable in size to M3's registry
work but smaller in scope (extends rather than creates). Critical path:
task 1 → task 4 → task 6; tasks 2, 3, 5, 7 parallelize off the critical path.

## Tasks Created
- [ ] #243 - Provenance schema + migration + ADR (parallel: true)
- [ ] #244 - Backstage template model + YAML parser (parallel: true)
- [ ] #245 - Enrichment companion format + loader (parallel: true)
- [ ] #246 - Deterministic Backstage-to-registry mapper (parallel: true; depends_on #243,#244,#245)
- [ ] #247 - Bundled Backstage fixtures + reviewed enrichment (parallel: true; depends_on #244,#245)
- [ ] #248 - Import + seed integration (parallel: true; depends_on #243,#246,#247)
- [ ] #249 - Registry UI provenance affordance (parallel: true; depends_on #243)

Total tasks: 7
Parallel tasks: 7 (all parallelizable once dependencies are met)
Sequential tasks: 0 (ordering enforced by depends_on, not file-conflicts)
Estimated total effort: 26 hours

Execution waves (from depends_on):
- Wave 1: #243, #244, #245
- Wave 2: #246, #247, #249
- Wave 3: #248
