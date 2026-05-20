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
