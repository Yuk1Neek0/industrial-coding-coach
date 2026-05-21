// Drizzle schema for the Golden Path Catalog — local SQLite (ADR 0006).
//
// MVP shape: one `golden_paths` table. List-valued fields are stored as JSON
// text columns; normalize into related tables later only if query needs require
// it (ADR 0006).

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** One step of a Golden Path's understanding journey. */
export interface GoldenPathStep {
  title: string
  detail: string
}

/** A route considered for a Golden Path and the reason it was not chosen. */
export interface RejectedAlternative {
  name: string
  reason: string
}

/** A cited source backing a Golden Path's claims. */
export interface GoldenPathSource {
  label: string
  url?: string
}

/**
 * The Golden Path Catalog. One row per curated route for understanding a kind
 * of AI-assisted project.
 */
export const goldenPaths = sqliteTable("golden_paths", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Stable kebab-case identifier, unique across the catalog. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  summary: text("summary").notNull(),
  /** The kind of project this path suits. */
  targetProjectType: text("target_project_type").notNull(),
  /** When this path fits the user's project (prose). */
  fitCriteria: text("fit_criteria").notNull(),
  /** The understanding journey, in order. */
  steps: text("steps", { mode: "json" }).$type<GoldenPathStep[]>().notNull(),
  /** Identifiers of templates this path builds on (defined in M3). */
  templatesReferenced: text("templates_referenced", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  qualityGates: text("quality_gates", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  learningOutcomes: text("learning_outcomes", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  rejectedAlternatives: text("rejected_alternatives", { mode: "json" })
    .$type<RejectedAlternative[]>()
    .notNull(),
  sources: text("sources", { mode: "json" })
    .$type<GoldenPathSource[]>()
    .notNull(),
  risks: text("risks", { mode: "json" }).$type<string[]>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
})

/** A Golden Path row as read from the catalog. */
export type GoldenPath = typeof goldenPaths.$inferSelect

/** The shape required to insert a Golden Path. */
export type NewGoldenPath = typeof goldenPaths.$inferInsert

// --- Template Registry (Milestone 3) ---------------------------------------
//
// The `templates` table joins `golden_paths` in the same local SQLite store
// (ADR 0006) — a new table, not a new database. It mirrors the `golden_paths`
// style: list-valued fields are JSON text columns; normalize later only if
// query needs require it. A Golden Path's `templatesReferenced` slugs resolve
// to rows here.

/** A risk a template carries — a free-text caution. */
export type TemplateRisk = string

/** An alternative to a template and why it might be chosen instead. */
export interface TemplateAlternative {
  name: string
  reason: string
}

/** A cited source backing a template's claims. */
export interface TemplateSource {
  label: string
  url?: string
}

/**
 * A structured fit factor: one dimension along which a template's suitability
 * can be judged. M3 stores these; M4 scores against them.
 */
export interface TemplateFitFactor {
  factor: string
  detail: string
}

/**
 * The Template Registry. One row per real-world building block (project
 * scaffold, agentic workflow, CI config, security tool, doc/spec template,
 * contract, observability starter) that Golden Paths build on.
 */
export const templates = sqliteTable("templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Stable kebab-case identifier, unique across the registry. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** Browsing category, e.g. "Project Scaffold", "CI", "Security". */
  category: text("category").notNull(),
  summary: text("summary").notNull(),
  /** What concrete artifacts/output the template produces (prose). */
  whatItGenerates: text("what_it_generates").notNull(),
  /** Why this template is used / the problem it solves (prose). */
  whyUsed: text("why_used").notNull(),
  /** When this template fits a project or Golden Path (prose). */
  fitCriteria: text("fit_criteria").notNull(),
  /** Structured fit factors — the dimensions M4 will score against. */
  fitFactors: text("fit_factors", { mode: "json" })
    .$type<TemplateFitFactor[]>()
    .notNull(),
  /** Risks/cautions the template carries. */
  risks: text("risks", { mode: "json" }).$type<TemplateRisk[]>().notNull(),
  /** Alternatives to this template and the reason each might be chosen. */
  alternatives: text("alternatives", { mode: "json" })
    .$type<TemplateAlternative[]>()
    .notNull(),
  /** What the user should learn from / about this template (prose). */
  learningNotes: text("learning_notes").notNull(),
  /** Cited sources backing the entry. */
  sources: text("sources", { mode: "json" })
    .$type<TemplateSource[]>()
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
})

/** A Template row as read from the registry. */
export type Template = typeof templates.$inferSelect

/** The shape required to insert a Template. */
export type NewTemplate = typeof templates.$inferInsert
