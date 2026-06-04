# M14 — Backstage Template Import

**State:** ✅ Complete — epic #242 done; merged to `main` via **PR #251**
(`e038942`) · **Date:** 2026-06-04

Goal: import real **Backstage software templates** (`template.yaml`,
`scaffolder.backstage.io/v1beta3`) into the M3 Template Registry as first-class,
reviewed entries — so the registry is no longer just the 15 hand-authored
templates and the product speaks the same "software template" language real
engineering orgs use (Backstage = Spotify's CNCF developer portal).

## Scope decisions

- **Importer + curated seed (not auto-ingest).** A deterministic mapper maps a
  Backstage `template.yaml`'s mechanical fields; the registry's coaching fields
  come from a hand-reviewed **enrichment companion** — so every imported row is
  fully populated with no naked LLM output.
- **Same table + provenance (AD-1).** Imported templates are rows in the existing
  `templates` table, distinguished by `source`/`source_url`/`source_format`
  columns; the data-access layer and referential-integrity check are unchanged.
- **Local-first, in-repo fixtures (AD-2).** The importable set ships as
  version-controlled `template.yaml` fixtures + enrichment; the mapper is pure
  (no IO/network/LLM). Live GitHub fetch is intentionally out of scope (a future
  extension on M11).
- **Fail-closed (AD-3).** The parser and mapper reject malformed templates or any
  result that would leave a NOT-NULL registry field empty.
- **Vetted YAML library (AD-5).** `template.yaml` is parsed with the `yaml`
  package; no bespoke parser.
- See **ADR 0010** (`docs/decisions/0010-backstage-import-contract.md`).

## Stage status

| Stage | Description | Status |
|---|---|---|
| 1 | CCPM Plan — PRD `backstage-template-import.md` | Done — approved |
| 2 | CCPM Epic → Structure → Sync | Done — epic #242, tasks #243–#249 (planning PR #250) |
| 3 | Execution | Done — see backlog |

## Execution backlog

| Wave | Issue | Task |
|---|---|---|
| 1 | #243 | Provenance schema + migration `0012` + ADR 0010 |
| 1 | #244 | Backstage template model + YAML parser (`yaml` dep) |
| 1 | #245 | Enrichment companion format + fixture loader |
| 2 | #246 | Deterministic Backstage-to-registry mapper |
| 2 | #247 | Bundled Backstage fixtures + reviewed enrichment (×3) |
| 2 | #249 | Registry UI provenance affordance |
| 3 | #248 | Import + seed integration |

All 7 task issues + epic #242 are closed; the epic is archived to
`.claude/epics/archived/backstage-template-import/`. Merged to `main` via
**PR #251** (CCPM planning artifacts via **PR #250**).

## Delivered

- `packages/db/src/schema.ts` — `templates` gains `source`
  (`'curated' | 'backstage'`, NOT NULL default `'curated'`), `source_url`,
  `source_format`; migration `0012_brainy_boomer.sql` adds them additively and
  backfills the 15 curated rows.
- `packages/db/src/backstage-template.ts` — typed `BackstageTemplate` model +
  `parseBackstageTemplate` (fail-closed) over the `yaml` library.
- `packages/db/src/template-enrichment.ts` — `TemplateEnrichment` companion +
  `validateEnrichment`/`pairFixtures`/`loadBackstageFixtures`.
- `packages/db/src/backstage-import.ts` — pure `mapBackstageTemplate(template,
  enrichment, options)` → `NewTemplate` + `importBackstageTemplates(fixtures)`.
- `packages/db/src/fixtures/backstage/` + `backstage-fixtures.ts` — 3 real
  Backstage software templates (react-ssr / springboot-grpc / docs) with cited
  upstream sources, each paired with a reviewed enrichment companion.
- `packages/db/src/seed.ts` — seeds curated `templateSeed` ++ imported rows in
  one idempotent drop-and-reload (`15 curated + 3 imported`).
- `apps/web/app/templates/_components/` — `SourceBadge`: a "Source: Backstage"
  pill on registry cards and a linked badge (→ upstream `template.yaml`) on the
  detail page; curated entries render unchanged.

## Acceptance Criteria (PRD)

- [x] `templates` has provenance columns; migration `0012` runs cleanly; the 15
      curated rows are backfilled to `source = 'curated'` — verified by test.
- [x] ≥3 real Backstage templates imported from in-repo fixtures, every NOT-NULL
      field populated, `source = 'backstage'` + working `source_url` — verified.
- [x] The mapper is pure/deterministic with round-trip + fail-closed tests; the
      parser rejects malformed/incomplete input.
- [x] Seed is idempotent (stable total on re-run); no imported slug collides with
      a curated slug; referential-integrity test still passes.
- [x] Registry UI shows Backstage provenance (badge + source link); curated
      entries unaffected; `web` build passes.
- [x] `pnpm lint` / `typecheck` / `build` pass; `@workspace/db` tests green
      (838); CI green on PR #251.

## Retrospective

**What went well**

- **Extend, don't rebuild.** M14 reused the M3 `templates` schema, seed,
  data-access, and UI; the import layer is a thin, well-tested addition in
  `packages/db`. A `NOT NULL DEFAULT 'curated'` column backfilled all existing
  rows with one additive migration and kept `NewTemplate` insert-compatible.
- **Mapper + reviewed enrichment held the "no naked output" line.** Mechanical
  fields are mapped deterministically; coaching fields are hand-authored — every
  imported row is complete and reviewed, like the M3 seed.
- **Pure-function core = trivial tests.** `mapBackstageTemplate` /
  `parseBackstageTemplate` are pure, so round-trip + fail-closed coverage is
  cheap; the in-memory-migrate pattern verified the seed end-to-end.
- **One epic branch, clean per-task history.** Seven `Issue #N:` commits on
  `epic/backstage-template-import`, merged via a single no-ff PR (#251) after CI;
  every task verified locally (typecheck/lint/test) before commit.

**What to watch — lessons**

- **CCPM sync scripts are not portable to this gh/Windows setup.** The
  `sed '1,/^---$/d; 1,/^---$/d'` frontmatter-strip wipes the body (it created
  empty GitHub issue bodies before being caught); `gh issue create` lacks
  `--json`; `gh sub-issue create` takes `--body`, not `--body-file`. Use an
  `awk`-based strip and parse issue numbers from the URL. (Recorded in agent
  memory.)
- **Shell variable expansion was intermittently unreliable** during the archive
  step; frontmatter status flips were done with the editor, not `sed`.
- **Fixtures are structure-faithful, not byte-exact.** The 3 `template.yaml`
  files are adapted from the official `backstage/software-templates` repo (cited)
  and trimmed for fixtures — fidelity is structural, which is what the importer
  consumes.
- **Keep fs-reading modules out of the package barrel.** `backstage-fixtures.ts`
  / `seed.ts` read files at load; `index.ts` exports only the data-access + schema
  so the web bundle never pulls in fs/seed code.

**Follow-ups**

- **Live import is unbuilt by design.** A "fetch from a GitHub source" path
  (on top of M11) is the natural next extension; the `source` enum + mapper are
  ready for additional loaders.
- **Category mapping is a small deterministic table.** Backstage `spec.type` →
  registry category covers the common cases with an enrichment override; richer
  mapping can follow if more template types are imported.
- **No Golden Path references an imported template yet** — imports only add
  slugs; wiring a Golden Path's `templatesReferenced` to a Backstage entry is a
  future content task.
