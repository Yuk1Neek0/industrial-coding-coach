// Deterministic recommendation scoring for the M4 Recommendation Engine
// (recommendation-engine PRD FR-2 / FR-4).
//
// This is the *decision* half of the hybrid engine: a pure, reproducible
// function that ranks the M2 Golden Path catalog and the M3 Template Registry
// against a user's intake and decides the recommendation. No LLM is involved —
// identical input always yields an identical ranking. The narrative half
// (`recommendation-narrative.ts`) only explains the decision made here; it
// never overrides it.

import type {
  GoldenPath,
  RecommendationIntake,
  RejectedRecommendation,
  Template,
} from "./schema"

/**
 * The Golden Path fields the scorer reads — a structural subset, so both a
 * stored {@link GoldenPath} and an unsaved seed row satisfy it.
 */
export type ScorableGoldenPath = Pick<
  GoldenPath,
  | "slug"
  | "name"
  | "summary"
  | "targetProjectType"
  | "fitCriteria"
  | "templatesReferenced"
  | "learningOutcomes"
>

/** The Template fields the scorer reads — a structural subset (see above). */
export type ScorableTemplate = Pick<
  Template,
  "slug" | "name" | "category" | "summary" | "fitCriteria" | "fitFactors"
>

/** A scored catalog candidate and the intake signals behind its score. */
export interface ScoredCandidate {
  /** The catalog slug of the candidate. */
  slug: string
  /** Which catalog the slug belongs to. */
  kind: "golden_path" | "template"
  /** The candidate's display name. */
  name: string
  /** Total weighted fit score; higher is a better fit. Always an integer. */
  score: number
  /** Human-readable labels of the intake signals that matched. */
  matchedSignals: string[]
}

/** The full deterministic scoring result for one intake. */
export interface ScoredRecommendation {
  /** The winning Golden Path, by `golden_paths.slug`. */
  recommendedGoldenPathSlug: string
  /** The winner's referenced templates that resolve, best fit first. */
  recommendedTemplateSlugs: string[]
  /** The Golden Paths not recommended, each with a concrete reason. */
  rejectedAlternatives: RejectedRecommendation[]
  /** Every Golden Path scored, best fit first — for inspection and tests. */
  goldenPathRanking: ScoredCandidate[]
  /** Every Template scored, best fit first. */
  templateRanking: ScoredCandidate[]
}

/** Tokens shorter than this are dropped as too noisy to be a fit signal. */
const MIN_TOKEN_LENGTH = 3

/**
 * Common words with no fit-signal value, dropped during tokenization. Includes
 * words that appear across nearly every catalog entry (`app`, `project`,
 * `understand`), which would otherwise match everything and dilute the score.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  "the", "and", "for", "with", "that", "this", "you", "your", "are", "use",
  "used", "using", "from", "how", "what", "when", "where", "why", "into",
  "not", "but", "its", "has", "have", "want", "wants", "need", "needs",
  "build", "building", "built", "make", "makes", "made", "via", "per", "out",
  "app", "apps", "application", "applications", "project", "projects",
  "understand", "understanding", "kind", "real", "modern", "good", "more",
])

/** Split text into a deduplicated set of lowercase fit-signal tokens. */
function tokenize(...parts: string[]): Set<string> {
  const tokens = new Set<string>()
  for (const part of parts) {
    for (const raw of part.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(raw)) {
        tokens.add(raw)
      }
    }
  }
  return tokens
}

/** Count how many of `intake`'s tokens appear in the `target` token set. */
function overlap(intake: Set<string>, target: Set<string>): number {
  let count = 0
  for (const token of intake) {
    if (target.has(token)) count += 1
  }
  return count
}

/** One weighted fit signal: an intake field matched against catalog text. */
interface Signal {
  /** Label surfaced in {@link ScoredCandidate.matchedSignals}. */
  label: string
  /** Score multiplier applied to the token-overlap count. */
  weight: number
  /** The intake-side text. */
  intake: string
  /** The catalog-side text. */
  target: string
}

/** Score a list of signals into a total and the labels that contributed. */
function scoreSignals(signals: Signal[]): {
  score: number
  matchedSignals: string[]
} {
  let score = 0
  const matchedSignals: string[] = []
  for (const signal of signals) {
    const hits = overlap(tokenize(signal.intake), tokenize(signal.target))
    if (hits > 0) {
      score += hits * signal.weight
      matchedSignals.push(signal.label)
    }
  }
  return { score, matchedSignals }
}

/** Score one Golden Path against an intake. */
function scoreGoldenPath(
  intake: RecommendationIntake,
  path: ScorableGoldenPath,
): ScoredCandidate {
  const knownStack = intake.knownStack.join(" ")
  const learningOutcomes = path.learningOutcomes.join(" ")
  const { score, matchedSignals } = scoreSignals([
    {
      label: "project type",
      weight: 3,
      intake: intake.projectType,
      target: `${path.targetProjectType} ${path.summary}`,
    },
    {
      label: "goal",
      weight: 2,
      intake: intake.goal,
      target: `${path.summary} ${path.fitCriteria}`,
    },
    {
      label: "learning focus",
      weight: 2,
      intake: intake.learningFocus,
      target: learningOutcomes,
    },
    {
      label: "known stack",
      weight: 1,
      intake: knownStack,
      target: `${path.summary} ${path.fitCriteria} ${path.targetProjectType}`,
    },
    {
      label: "job target",
      weight: 1,
      intake: intake.jobTarget,
      target: `${path.summary} ${learningOutcomes}`,
    },
  ])
  return {
    slug: path.slug,
    kind: "golden_path",
    name: path.name,
    score,
    matchedSignals,
  }
}

/** Score one Template against an intake, using its structured fit factors. */
function scoreTemplate(
  intake: RecommendationIntake,
  template: ScorableTemplate,
): ScoredCandidate {
  const knownStack = intake.knownStack.join(" ")
  const fitFactorText = template.fitFactors
    .map((factor) => `${factor.factor} ${factor.detail}`)
    .join(" ")
  const { score, matchedSignals } = scoreSignals([
    {
      label: "project type",
      weight: 2,
      intake: intake.projectType,
      target: `${template.category} ${template.summary}`,
    },
    {
      label: "goal",
      weight: 2,
      intake: intake.goal,
      target: `${template.summary} ${template.fitCriteria}`,
    },
    {
      label: "known stack",
      weight: 2,
      intake: knownStack,
      target: `${fitFactorText} ${template.summary}`,
    },
    {
      label: "learning focus",
      weight: 1,
      intake: intake.learningFocus,
      target: `${fitFactorText} ${template.summary}`,
    },
  ])
  return {
    slug: template.slug,
    kind: "template",
    name: template.name,
    score,
    matchedSignals,
  }
}

/**
 * Order candidates best fit first. Ties are broken by slug so an identical
 * input always produces a byte-identical ranking (FR-2: deterministic).
 */
function byFitThenSlug(a: ScoredCandidate, b: ScoredCandidate): number {
  if (a.score !== b.score) return b.score - a.score
  if (a.slug < b.slug) return -1
  if (a.slug > b.slug) return 1
  return 0
}

/**
 * Score and rank the catalog against an intake, deciding the recommendation
 * (recommendation-engine PRD FR-2). Pure and deterministic: identical input
 * yields an identical {@link ScoredRecommendation}.
 *
 * The recommended Golden Path is the highest-scoring one; recommended templates
 * are that path's referenced templates that resolve to a real registry entry
 * (FR-4 — a recommendation never cites a slug with no catalog entry), ordered
 * by their own fit score. Every other Golden Path is returned as a rejected
 * alternative with a concrete reason.
 *
 * @throws if `goldenPaths` is empty — there is nothing to recommend.
 */
export function scoreRecommendation(
  intake: RecommendationIntake,
  goldenPaths: ScorableGoldenPath[],
  templates: ScorableTemplate[],
): ScoredRecommendation {
  const goldenPathRanking = goldenPaths
    .map((path) => scoreGoldenPath(intake, path))
    .sort(byFitThenSlug)
  const templateRanking = templates
    .map((template) => scoreTemplate(intake, template))
    .sort(byFitThenSlug)

  const [winner, ...rest] = goldenPathRanking
  if (!winner) {
    throw new Error("scoreRecommendation: no Golden Paths to score against.")
  }

  const pathBySlug = new Map(goldenPaths.map((path) => [path.slug, path]))
  const templateScoreBySlug = new Map(
    templateRanking.map((candidate) => [candidate.slug, candidate.score]),
  )

  // Recommended templates: the winner's referenced templates that resolve to a
  // real registry entry, ordered by their own fit score (ties broken by slug).
  const winnerPath = pathBySlug.get(winner.slug)
  const recommendedTemplateSlugs = [
    ...new Set(winnerPath?.templatesReferenced ?? []),
  ]
    .filter((slug) => templateScoreBySlug.has(slug))
    .sort((a, b) => {
      const scoreA = templateScoreBySlug.get(a) ?? 0
      const scoreB = templateScoreBySlug.get(b) ?? 0
      if (scoreA !== scoreB) return scoreB - scoreA
      if (a < b) return -1
      if (a > b) return 1
      return 0
    })

  const rejectedAlternatives: RejectedRecommendation[] = rest.map(
    (candidate) => {
      const path = pathBySlug.get(candidate.slug)
      const suitedTo = path
        ? path.targetProjectType
        : "a different kind of project"
      return {
        slug: candidate.slug,
        kind: "golden_path",
        reason:
          `Lower fit score (${candidate.score}) than the recommended ` +
          `${winner.name} (${winner.score}). Best suited to: ${suitedTo}`,
      }
    },
  )

  return {
    recommendedGoldenPathSlug: winner.slug,
    recommendedTemplateSlugs,
    rejectedAlternatives,
    goldenPathRanking,
    templateRanking,
  }
}
