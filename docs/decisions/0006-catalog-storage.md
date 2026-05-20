# ADR 0006 — Golden Path Catalog Storage

- **Status:** Proposed — pending review with the M2 PRD
- **Date:** 2026-05-20

## Context

Milestone 2 needs a home for the Golden Path Catalog: structured, queryable data
that M3 (Template Registry) and M4 (Recommendation Engine) will also build on.

Constraints from the product PRD (`.claude/prds/product.md`): the product is
**local-first** — it runs on the user's machine with no hosted server. The M1
PRD assumed "no DB yet"; M2 is where that assumption is revisited.

Options considered:
- **Flat files** (JSON/YAML in the repo) — simplest, but no querying; awkward as
  M4's recommendation queries and cross-references grow.
- **SQLite** — a single local file database; queryable; zero server.
- **Postgres + pgvector** — powerful (vector search), but heavy infrastructure
  for a local-first MVP.

## Decision

Use **SQLite** as the catalog store — a single local database file, accessed
server-side by the Next.js app.

- **Access layer:** an ORM rather than raw SQL — recommend **Drizzle ORM**
  (TypeScript-first, lightweight, first-class SQLite + migrations). The exact
  SQLite driver (`better-sqlite3` vs Node's built-in `node:sqlite`) and the
  Drizzle install are the **first M2 epic task**, with an official-docs check
  per the installation rule.
- **Schema (MVP):** a single `golden_paths` table.
  - Scalar columns: `id`, `slug`, `name`, `summary`, `target_project_type`,
    `fit_criteria`, `created_at`, `updated_at`.
  - List-valued fields (`steps`, `templates_referenced`, `quality_gates`,
    `learning_outcomes`, `rejected_alternatives`, `sources`, `risks`) stored as
    **JSON columns** for the MVP. Normalize into related tables later only if
    query needs require it.
- **Migrations + seed:** schema is created via Drizzle migrations; the five
  Golden Path entries are loaded by a version-controlled **seed script**. The
  generated `.db` file is git-ignored; the seed is the source of truth.

## Rationale

- SQLite is a perfect fit for a local-first app: no server, one file, ubiquitous
  and well-supported in Node/Next.js.
- It is queryable (unlike flat files), which M4's recommendation logic needs.
- It is far lighter than Postgres while leaving an upgrade path open.
- Drizzle keeps the schema and queries fully typed, consistent with the project's
  TypeScript-first, reviewable stance.

## Consequences

- This is the **first database in the project**; it supersedes the M1 PRD's "no
  DB yet" assumption for M2 onward.
- A migration + seed mechanism is introduced; CI may later run the seed to
  verify it.
- The `.db` file is generated and git-ignored; reviewers review the *seed*, not
  the binary.
- If later milestones need vector/semantic search (M4/M6), revisit: SQLite has
  vector extensions (e.g. `sqlite-vec`), or migrate the catalog to
  Postgres + pgvector. That would be a new ADR.
- Adopting Drizzle + a SQLite driver is a tool adoption — recorded here; the
  install happens as a bounded M2 task with an official-docs check.
