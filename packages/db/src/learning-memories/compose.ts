// Deterministic composition module for M10 Learning Memory & Portfolio Export
// (learning-memory-portfolio-export PRD FR-2, Issue #179).
//
// This module emits the three *structural* artifacts the Portfolio Page renders:
// the architecture explanation (M5 + M6), the learning memory tree
// (M7 + M8 + M9), and per-attempt debug stories (M9). It is intentionally a
// pure TypeScript renderer over the rows already shipped by M5/M6/M7/M8/M9 — no
// Anthropic SDK call, no random input, no clock read — so the structural
// artifacts can never hallucinate against the data the user already understood
// (PRD FR-2) and re-running the composers on identical seeded inputs is
// byte-identical (NFR-2).
//
// Stable ordering: every list output sorts deterministically by foreign-key id
// ascending. No `Map` / `Set` iteration order leaks. The grouping helpers below
// build their groups by walking pre-sorted source rows so leaf / revisit /
// debug-story ordering is fully determined by row ids in the database.
//
// Graceful degradation: a missing M5 / M6 / M7 / M8 / M9 row never throws. The
// composer returns the typed shape with an explicit "none yet" body (for the
// architecture explanation) or an empty list (for the tree branches and the
// debug stories) so the Portfolio Page can render the page on a fresh project.
//
// Outputs are typed TS objects, NOT markdown strings. The markdown bundle
// exporter (task #182) renders these once from the typed fields; keeping the
// composers structural lets the Portfolio Page bind to typed fields too.
//
// Server-side only — reads go through the existing M5 / M6 / M7 / M8 / M9
// data-access layers (no direct Drizzle queries here). Every function accepts
// an optional `CatalogDb` so tests inject a fixture database; in the app,
// callers omit it and the package-local default DAL singleton is used.

import { createCatalogDb, type CatalogDb } from "../client"
import {
  getChallengeById,
  listChallengeAttempts,
  listChallengesBySnapshot,
} from "../challenges/challenges"
import { listDiffReviews } from "../diff/reviews"
import { listLearningUnits } from "../learning-units/units"
import { getProjectMap } from "../mapper/project-maps"
import {
  type ArchitectureExplanation,
  type ArchitectureExplanationSection,
  type DebugStory,
  type LearningMemoryRevisitEntry,
  type LearningMemoryTree,
  type LearningMemoryTreeBranch,
  type LearningMemoryTreeLeaf,
  type WeakArea,
} from "../schema"
import { getStackExplanation } from "../stack/explanations"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

// ---------------------------------------------------------------------------
// composeArchitectureExplanation — M5 + M6
// ---------------------------------------------------------------------------

/** The "none yet" body the stack section emits when no M5 row exists. */
const NO_STACK_BODY =
  "No stack explanation has been generated for this snapshot yet."

/** The "none yet" body the architecture section emits when no M6 row exists. */
const NO_ARCHITECTURE_BODY =
  "No project logic map has been generated for this snapshot yet."

/** The "none yet" body the key-flows section emits when no M6 row exists. */
const NO_FLOWS_BODY =
  "No project logic map has been generated for this snapshot yet."

/**
 * Compose the deterministic architecture explanation for a snapshot from its
 * M5 `stack_explanations` row and its M6 `project_maps` row.
 *
 * Every section cites real file paths from the M6 map and real technology
 * names from the M5 row. Missing M5 / M6 rows degrade to an explicit "none
 * yet" body in that section rather than throwing — so a brand-new snapshot
 * still produces a well-typed `ArchitectureExplanation`.
 */
export async function composeArchitectureExplanation(
  snapshotId: number,
  db?: CatalogDb,
): Promise<ArchitectureExplanation> {
  const resolved = resolveDb(db)
  const [stack, map] = await Promise.all([
    getStackExplanation(snapshotId, resolved),
    getProjectMap(snapshotId, resolved),
  ])

  const intro = composeIntro(stack, map)
  return {
    intro,
    stackSection: composeStackSection(stack),
    architectureSection: composeArchitectureSection(map),
    keyFlowsSection: composeKeyFlowsSection(map),
  }
}

/** Build the opening paragraph that frames the project at a glance. */
function composeIntro(
  stack: Awaited<ReturnType<typeof getStackExplanation>>,
  map: Awaited<ReturnType<typeof getProjectMap>>,
): string {
  if (!stack && !map) {
    return "This snapshot has no stack explanation or project logic map yet — generate them in M5 and M6 to populate this section."
  }
  const toolList = stack
    ? stack.tools.map((t) => t.name).join(", ")
    : ""
  const layerList = map
    ? map.architectureOverview.map((l) => l.title).join(", ")
    : ""
  if (stack && map) {
    return `This project is built on ${toolList}. Its architecture is organised around ${layerList}.`
  }
  if (stack) {
    return `This project is built on ${toolList}.`
  }
  return `This project's architecture is organised around ${layerList}.`
}

/** Build the stack section from the M5 row. */
function composeStackSection(
  stack: Awaited<ReturnType<typeof getStackExplanation>>,
): ArchitectureExplanationSection {
  if (!stack) {
    return {
      heading: "Stack & tooling",
      body: NO_STACK_BODY,
      citedFiles: [],
    }
  }
  // Tools are read in their stored order, which is the order the M5
  // generator persisted — stable per snapshot.
  const lines = stack.tools.map((tool) => `- ${tool.name}: ${tool.purpose}`)
  const citedFiles = stack.keyFiles.map((kf) => kf.path).sort()
  return {
    heading: "Stack & tooling",
    body: lines.join("\n"),
    citedFiles,
  }
}

/** Build the architecture-layers section from the M6 row. */
function composeArchitectureSection(
  map: Awaited<ReturnType<typeof getProjectMap>>,
): ArchitectureExplanationSection {
  if (!map) {
    return {
      heading: "Architectural layers",
      body: NO_ARCHITECTURE_BODY,
      citedFiles: [],
    }
  }
  const lines = map.architectureOverview.map(
    (layer) => `- ${layer.title}: ${layer.detail}`,
  )
  // Files come from `keyFileMap` — the intentional set M6 surfaced.
  const citedFiles = map.keyFileMap.map((f) => f.path).sort()
  return {
    heading: "Architectural layers",
    body: lines.join("\n"),
    citedFiles,
  }
}

/** Build the key-flows section from the M6 row. */
function composeKeyFlowsSection(
  map: Awaited<ReturnType<typeof getProjectMap>>,
): ArchitectureExplanationSection {
  if (!map) {
    return {
      heading: "Key flows",
      body: NO_FLOWS_BODY,
      citedFiles: [],
    }
  }
  const sections: string[] = []
  const cited = new Set<string>()
  for (const [label, flow] of [
    ["Request / data flow", map.requestDataFlow],
    ["State flow", map.stateFlow],
    ["AI-call flow", map.aiCallFlow],
  ] as const) {
    if (flow.length === 0) continue
    const ordered = [...flow].sort((a, b) => a.order - b.order)
    const steps = ordered.map((step) => `${step.order}. ${step.description}`)
    sections.push(`**${label}**\n${steps.join("\n")}`)
    for (const step of ordered) {
      if (step.path) cited.add(step.path)
    }
  }
  return {
    heading: "Key flows",
    body:
      sections.length === 0
        ? "No flows have been traced in the project logic map yet."
        : sections.join("\n\n"),
    // Sort to drop Set iteration order from the output.
    citedFiles: [...cited].sort(),
  }
}

// ---------------------------------------------------------------------------
// composeLearningMemoryTree — M7 + M8 + M9
// ---------------------------------------------------------------------------

/**
 * Compose the deterministic learning memory tree for a snapshot from its
 * `learning_units`, `diff_reviews`, and `challenge_attempts.grading` rows.
 *
 * Branches group learned concepts by milestone source ("From learning units",
 * "From diff reviews", "From debug & expansion challenges"); leaves cite the
 * milestone + row id that taught the concept. The `stillToRevisit` list
 * surfaces every weak-area entry from M7 / M8 / M9 grading per PRD FR-4 — the
 * honest "what the user still doesn't know" view.
 *
 * Missing rows degrade to empty branches + empty `stillToRevisit` rather than
 * throwing.
 */
export async function composeLearningMemoryTree(
  snapshotId: number,
  db?: CatalogDb,
): Promise<LearningMemoryTree> {
  const resolved = resolveDb(db)

  const units = await listLearningUnits(snapshotId, resolved)
  const reviews = await listDiffReviews(snapshotId, resolved)
  const challenges = await listChallengesBySnapshot(snapshotId, resolved)

  // Walk attempts per challenge in oldest-first order; the result is a
  // deterministic ordering by (challenge.id, attempt.id).
  const attemptsByChallenge: { challengeId: number; attempts: Awaited<
    ReturnType<typeof listChallengeAttempts>
  > }[] = []
  for (const challenge of challenges) {
    const attempts = await listChallengeAttempts(challenge.id, resolved)
    attemptsByChallenge.push({ challengeId: challenge.id, attempts })
  }

  const branches: LearningMemoryTreeBranch[] = []

  // --- From learning units (M7) -----------------------------------------
  const unitLeaves: LearningMemoryTreeLeaf[] = []
  for (const unit of units) {
    for (const concept of unit.concepts) {
      unitLeaves.push({
        concept: concept.name,
        detail: concept.explanation,
        source: {
          milestone: "M7",
          rowId: unit.id,
          locator: unit.issueRef,
        },
      })
    }
  }
  if (unitLeaves.length > 0) {
    branches.push({
      heading: "From learning units",
      leaves: unitLeaves,
    })
  }

  // --- From diff reviews (M8) -------------------------------------------
  const reviewLeaves: LearningMemoryTreeLeaf[] = []
  for (const review of reviews) {
    // The PR's "core logic explanation" is the M8 row's distilled concept.
    reviewLeaves.push({
      concept: `Diff review for PR #${review.prNumber}`,
      detail: review.coreLogicExplanation,
      source: {
        milestone: "M8",
        rowId: review.id,
        locator: `PR #${review.prNumber}`,
      },
    })
  }
  if (reviewLeaves.length > 0) {
    branches.push({
      heading: "From diff reviews",
      leaves: reviewLeaves,
    })
  }

  // --- From debug & expansion challenges (M9) ----------------------------
  const challengeLeaves: LearningMemoryTreeLeaf[] = []
  for (const challenge of challenges) {
    challengeLeaves.push({
      concept: `Challenge (${challenge.type})`,
      detail: challenge.taskDescription,
      source: {
        milestone: "M9",
        rowId: challenge.id,
        locator: challenge.type,
      },
    })
  }
  if (challengeLeaves.length > 0) {
    branches.push({
      heading: "From debug & expansion challenges",
      leaves: challengeLeaves,
    })
  }

  // --- Still to revisit (FR-4) ------------------------------------------
  const stillToRevisit: LearningMemoryRevisitEntry[] = []
  // M7 weak areas.
  for (const unit of units) {
    if (!unit.weakAreas) continue
    for (const wa of unit.weakAreas) {
      stillToRevisit.push({
        area: wa.area,
        detail: wa.detail,
        source: { milestone: "M7", rowId: unit.id },
      })
    }
  }
  // M8 weak areas.
  for (const review of reviews) {
    if (!review.weakAreas) continue
    for (const wa of review.weakAreas) {
      stillToRevisit.push({
        area: wa.area,
        detail: wa.detail,
        source: { milestone: "M8", rowId: review.id },
      })
    }
  }
  // M9 weak areas — pulled from each attempt's grading.weakAreas.
  for (const { attempts } of attemptsByChallenge) {
    for (const attempt of attempts) {
      if (!attempt.grading) continue
      for (const wa of attempt.grading.weakAreas) {
        stillToRevisit.push({
          area: wa.area,
          detail: wa.detail,
          source: { milestone: "M9", rowId: attempt.id },
        })
      }
    }
  }

  return { branches, stillToRevisit }
}

// ---------------------------------------------------------------------------
// composeDebugStories — M9
// ---------------------------------------------------------------------------

/** The shared M8/M9 pass threshold (R4 — score >= 70 is a pass). */
const PASS_THRESHOLD = 70

/** Max length of the explanation excerpt rendered into a debug story. */
const EXPLANATION_EXCERPT_LIMIT = 280

/**
 * Compose the deterministic per-attempt debug stories for a snapshot from its
 * `challenge_attempts` rows (and their parent `challenges` rows for the
 * task summary + type).
 *
 * One story per attempt. Stories are ordered by `(challenge.id, attempt.id)`
 * ascending so the output is fully determined by foreign-key ids. Missing
 * data degrades to `[]` rather than throwing.
 */
export async function composeDebugStories(
  snapshotId: number,
  db?: CatalogDb,
): Promise<DebugStory[]> {
  const resolved = resolveDb(db)
  const challenges = await listChallengesBySnapshot(snapshotId, resolved)

  const stories: DebugStory[] = []
  for (const challenge of challenges) {
    const attempts = await listChallengeAttempts(challenge.id, resolved)
    // Walk attempts in stored order (oldest-first by submittedAt then id).
    // Re-sort by id ascending for full determinism — attempts seeded in the
    // same fixture tick share a timestamp and only id distinguishes them.
    const ordered = [...attempts].sort((a, b) => a.id - b.id)
    // Re-fetch the parent challenge by id so the snapshotId narrowing is
    // explicit; in practice it equals `challenge`.
    const parent = await getChallengeById(challenge.id, resolved)
    if (!parent) continue
    for (const attempt of ordered) {
      stories.push(buildDebugStory(parent, attempt))
    }
  }
  return stories
}

/** Build one debug story from a challenge + its attempt. */
function buildDebugStory(
  challenge: Awaited<ReturnType<typeof getChallengeById>> & object,
  attempt: Awaited<ReturnType<typeof listChallengeAttempts>>[number],
): DebugStory {
  const grading = attempt.grading
  const score = grading?.score ?? 0
  const passed = grading ? grading.score >= PASS_THRESHOLD : false
  const topWeakArea: WeakArea | undefined =
    grading && grading.weakAreas.length > 0 ? grading.weakAreas[0] : undefined

  return {
    challengeType: challenge.type,
    taskSummary: challenge.taskDescription,
    explanationExcerpt: excerpt(attempt.explanation, EXPLANATION_EXCERPT_LIMIT),
    gradingResult: {
      score,
      passed,
      // Only include topWeakArea when present so the field round-trips through
      // JSON identically across calls.
      ...(topWeakArea ? { topWeakArea } : {}),
    },
  }
}

/** Slice a string to at most `limit` chars, appending a marker when clipped. */
function excerpt(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}…`
}
