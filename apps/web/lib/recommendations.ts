// Server-side data access + orchestration for the M4 Recommendation Engine.
//
// Wraps the @workspace/db engine (scoring, narrative, persistence) and the
// M2/M3 catalog layers with an explicit DB path resolved from the web app's
// working directory. Mirrors `lib/catalog.ts`. Imported only by server
// components and server actions — never by client components.

import path from "node:path"

import {
  type CatalogDb,
  createCatalogDb,
  createRecommendation,
  generateRecommendationNarrative,
  getGoldenPathBySlug,
  getRecommendationById,
  getTemplateBySlug,
  type GoldenPath,
  listGoldenPaths,
  listTemplates,
  type Recommendation,
  type RecommendationEdit,
  type RecommendationIntake,
  type RecommendationNarrative,
  type RejectedRecommendation,
  resolveTemplates,
  scoreRecommendation,
  type Template,
  updateRecommendation,
} from "@workspace/db"

export type {
  GoldenPath,
  Recommendation,
  RecommendationEdit,
  RecommendationIntake,
  RecommendationNarrative,
  Template,
}

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function recommendationsDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(recommendationsDbFile())
  return cached
}

/** A rejected alternative resolved to a display name and a catalog link. */
export interface ResolvedRejection extends RejectedRecommendation {
  /** The catalog entry's display name, or the slug when it does not resolve. */
  name: string
  /** Link to the entry's detail page, or `null` when it does not resolve. */
  href: string | null
}

/** Everything the result page needs, with all cited slugs resolved. */
export interface ResolvedRecommendation {
  recommendation: Recommendation
  /** The recommended Golden Path, or `null` if its slug does not resolve. */
  goldenPath: GoldenPath | null
  /** The recommended templates, resolved and best-fit first. */
  templates: Template[]
  /** The rejected alternatives, each resolved to a name and link. */
  rejected: ResolvedRejection[]
  /** Every Golden Path (slug + name) — for the edit-mode selector. */
  goldenPathOptions: { slug: string; name: string }[]
}

/**
 * Build a recommendation from a user's intake: score it deterministically,
 * attempt the bounded narrative call, and persist the result. Returns the new
 * recommendation's id.
 *
 * The narrative call may fail (no API key, rate limit, network) — the
 * `narrative` column is nullable, so a failed narrative still yields a saved
 * recommendation. Scoring never fails for a non-empty catalog.
 */
export async function createRecommendationFromIntake(
  intake: RecommendationIntake,
): Promise<number> {
  const database = db()
  const [goldenPaths, templates] = await Promise.all([
    listGoldenPaths(database),
    listTemplates(database),
  ])
  const scored = scoreRecommendation(intake, goldenPaths, templates)

  const goldenPath = goldenPaths.find(
    (p) => p.slug === scored.recommendedGoldenPathSlug,
  )
  const recommendedTemplates = templates.filter((t) =>
    scored.recommendedTemplateSlugs.includes(t.slug),
  )
  let narrative: RecommendationNarrative | null = null
  if (goldenPath) {
    const result = await generateRecommendationNarrative({
      intake,
      goldenPath,
      templates: recommendedTemplates,
      rejectedAlternatives: scored.rejectedAlternatives,
    })
    if (result.ok) narrative = result.data
  }

  const created = await createRecommendation(
    {
      intake,
      recommendedGoldenPathSlug: scored.recommendedGoldenPathSlug,
      recommendedTemplateSlugs: scored.recommendedTemplateSlugs,
      rejectedAlternatives: scored.rejectedAlternatives,
      narrative,
    },
    database,
  )
  return created.id
}

/** Load one recommendation with every cited slug resolved, or `null`. */
export async function loadRecommendation(
  id: number,
): Promise<ResolvedRecommendation | null> {
  const database = db()
  const recommendation = await getRecommendationById(id, database)
  if (!recommendation) return null

  const [goldenPath, templates, goldenPathOptions] = await Promise.all([
    getGoldenPathBySlug(recommendation.recommendedGoldenPathSlug, database),
    resolveTemplates(recommendation.recommendedTemplateSlugs, database),
    listGoldenPaths(database),
  ])

  const rejected: ResolvedRejection[] = await Promise.all(
    recommendation.rejectedAlternatives.map(async (alternative) => {
      const entry =
        alternative.kind === "golden_path"
          ? await getGoldenPathBySlug(alternative.slug, database)
          : await getTemplateBySlug(alternative.slug, database)
      const href = entry
        ? alternative.kind === "golden_path"
          ? `/catalog/${alternative.slug}`
          : `/templates/${alternative.slug}`
        : null
      return { ...alternative, name: entry?.name ?? alternative.slug, href }
    }),
  )

  return {
    recommendation,
    goldenPath,
    templates,
    rejected,
    goldenPathOptions: goldenPathOptions.map((p) => ({
      slug: p.slug,
      name: p.name,
    })),
  }
}

/** Apply a human edit to a stored recommendation (FR-7). */
export async function editRecommendation(
  id: number,
  edit: RecommendationEdit,
): Promise<Recommendation | null> {
  return updateRecommendation(id, edit, db())
}

/**
 * Generate (or regenerate) the coaching narrative for a stored recommendation
 * and persist it. Returns whether the bounded narrative call succeeded.
 */
export async function generateNarrativeForRecommendation(
  id: number,
): Promise<{ ok: boolean }> {
  const database = db()
  const recommendation = await getRecommendationById(id, database)
  if (!recommendation) return { ok: false }

  const goldenPath = await getGoldenPathBySlug(
    recommendation.recommendedGoldenPathSlug,
    database,
  )
  if (!goldenPath) return { ok: false }
  const templates = await resolveTemplates(
    recommendation.recommendedTemplateSlugs,
    database,
  )

  const result = await generateRecommendationNarrative({
    intake: recommendation.intake,
    goldenPath,
    templates,
    rejectedAlternatives: recommendation.rejectedAlternatives,
  })
  if (!result.ok) return { ok: false }

  await updateRecommendation(id, { narrative: result.data }, database)
  return { ok: true }
}
