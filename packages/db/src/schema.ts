// Drizzle schema for the Golden Path Catalog — local SQLite (ADR 0006).
//
// MVP shape: one `golden_paths` table. List-valued fields are stored as JSON
// text columns; normalize into related tables later only if query needs require
// it (ADR 0006).

import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

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

// ---------------------------------------------------------------------------
// GitHub repository snapshots — local-first import storage (ADR 0009).
//
// A snapshot is an imported GitHub repository, keyed by `owner/repo` + `ref`.
// `repo_snapshots` holds repo metadata and the full file tree (a JSON column,
// mirroring the golden_paths list-valued-fields-as-JSON convention). The
// contents of selected key files are stored as child rows in `repo_files` so
// large blobs are not packed into the snapshot row. GitHub is contacted only at
// import time; downstream analysis reads these tables, never the network.
// ---------------------------------------------------------------------------

/**
 * One entry of a repository's file tree, as returned by the GitHub recursive
 * tree API. `type` is `blob` (file) or `tree` (directory).
 */
export interface RepoTreeEntry {
  /** Path relative to the repo root, e.g. `apps/web/package.json`. */
  path: string
  type: "blob" | "tree"
  /** Size in bytes; present for blobs only. */
  size?: number
  /** Git object SHA for the entry. */
  sha: string
}

/**
 * An imported GitHub repository snapshot. One row per `owner/repo` + `ref`;
 * re-importing the same repo/ref updates the row in place (PRD US-3).
 */
export const repoSnapshots = sqliteTable(
  "repo_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Repository owner (user or org), e.g. `vercel`. */
    owner: text("owner").notNull(),
    /** Repository name, e.g. `next.js`. */
    repo: text("repo").notNull(),
    /** The imported ref — a branch, tag, or commit SHA, e.g. `main`. */
    ref: text("ref").notNull(),
    /** The resolved commit SHA the snapshot's tree was taken at. */
    commitSha: text("commit_sha").notNull(),
    /** Default branch reported by GitHub at import time. */
    defaultBranch: text("default_branch").notNull(),
    /** Repository description, if any. */
    description: text("description"),
    /** Primary language reported by GitHub, if any. */
    primaryLanguage: text("primary_language"),
    /** Whether the source repository is private. */
    isPrivate: integer("is_private", { mode: "boolean" })
      .notNull()
      .$defaultFn(() => false),
    /** Canonical HTML URL of the repository. */
    htmlUrl: text("html_url").notNull(),
    /** The full repository file tree, in repo order. */
    fileTree: text("file_tree", { mode: "json" })
      .$type<RepoTreeEntry[]>()
      .notNull(),
    /** When this repository was last imported / refreshed. */
    importedAt: integer("imported_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    /** A repository snapshot is unique per owner/repo/ref. */
    uniqueIndex("repo_snapshots_owner_repo_ref_unique").on(
      table.owner,
      table.repo,
      table.ref,
    ),
  ],
)

/**
 * The content of one imported key file (`package.json`, lockfiles, build/
 * framework config, README, CI workflow files). Child of a `repo_snapshots`
 * row; deleted with its parent snapshot.
 */
export const repoFiles = sqliteTable(
  "repo_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Owning snapshot. */
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => repoSnapshots.id, { onDelete: "cascade" }),
    /** Path relative to the repo root, e.g. `apps/web/package.json`. */
    path: text("path").notNull(),
    /** Git blob SHA of the file's content. */
    sha: text("sha").notNull(),
    /** File size in bytes as reported by GitHub. */
    size: integer("size").notNull(),
    /** The file's text content. */
    content: text("content").notNull(),
    /** Why this file was selected as a key file, e.g. `package-manifest`. */
    category: text("category").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    /** A given path appears at most once per snapshot. */
    uniqueIndex("repo_files_snapshot_path_unique").on(
      table.snapshotId,
      table.path,
    ),
    /** Fast lookup of all files for a snapshot. */
    index("repo_files_snapshot_idx").on(table.snapshotId),
  ],
)

// ---------------------------------------------------------------------------
// Recommendations — M4 Recommendation Engine output (recommendation-engine PRD).
//
// One row per recommendation: the user-context intake it was computed from, the
// deterministic scored result (recommended Golden Path + templates, rejected
// alternatives), and the generated coaching narrative. Joins the same local
// SQLite store (ADR 0006) — a new table, not a new database. Cited slugs are
// verified against the catalog by a referential-integrity test, mirroring M3.
// ---------------------------------------------------------------------------

/**
 * The job-seeking junior dev's context — the nine intake fields the
 * Recommendation Engine scores against (recommendation-engine PRD FR-1).
 */
export interface RecommendationIntake {
  /** What the user wants to build or achieve. */
  goal: string
  /** The user's self-assessed experience level. */
  experienceLevel: string
  /** Technologies the user already knows. */
  knownStack: string[]
  /** The kind of role the user is targeting. */
  jobTarget: string
  /** How much time the user can invest. */
  timeBudget: string
  /** The user's tolerance for project complexity. */
  complexityTolerance: string
  /** The kind of project the user wants to build. */
  projectType: string
  /** The user's preferred AI tooling. */
  aiToolPreference: string
  /** What the user most wants to learn. */
  learningFocus: string
}

/** A catalog option considered and not recommended, with the reason. */
export interface RejectedRecommendation {
  /** The catalog slug of the rejected option. */
  slug: string
  /** Which catalog the slug belongs to. */
  kind: "golden_path" | "template"
  /** Why this option was not recommended. */
  reason: string
}

/**
 * The coaching narrative generated for a recommendation
 * (recommendation-engine PRD FR-3) — the four dimensions a junior dev needs to
 * defend the choices in an interview.
 */
export interface RecommendationNarrative {
  /** Why each recommended choice fits the user's intake. */
  whyItFits: string
  /** Complexity risks the user should be aware of. */
  complexityRisks: string
  /** Learning checkpoints along the recommended path. */
  learningCheckpoints: string[]
  /** The portfolio / interview value of the recommended project. */
  portfolioValue: string
}

/**
 * A recommendation produced by the M4 engine. The hybrid split is visible in
 * the columns: the scored result is deterministic; `narrative` is generated by
 * a bounded Anthropic SDK call and is null until (and unless) it succeeds.
 */
export const recommendations = sqliteTable("recommendations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** The user-context intake this recommendation was computed from. */
  intake: text("intake", { mode: "json" })
    .$type<RecommendationIntake>()
    .notNull(),
  /** The recommended Golden Path, by `golden_paths.slug`. */
  recommendedGoldenPathSlug: text("recommended_golden_path_slug").notNull(),
  /** The recommended templates, by `templates.slug`. */
  recommendedTemplateSlugs: text("recommended_template_slugs", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  /** Catalog options considered and not recommended, with reasons. */
  rejectedAlternatives: text("rejected_alternatives", { mode: "json" })
    .$type<RejectedRecommendation[]>()
    .notNull(),
  /** The coaching narrative; null until the bounded LLM call generates it. */
  narrative: text("narrative", { mode: "json" }).$type<RecommendationNarrative>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
})

/** A Recommendation row as read from the store. */
export type Recommendation = typeof recommendations.$inferSelect

/** The shape required to insert a Recommendation. */
export type NewRecommendation = typeof recommendations.$inferInsert

/** An imported repository snapshot as read from the database. */
export type RepoSnapshot = typeof repoSnapshots.$inferSelect

/** The shape required to insert a repository snapshot. */
export type NewRepoSnapshot = typeof repoSnapshots.$inferInsert

/** An imported key-file row as read from the database. */
export type RepoFile = typeof repoFiles.$inferSelect

/** The shape required to insert an imported key-file. */
export type NewRepoFile = typeof repoFiles.$inferInsert

// ---------------------------------------------------------------------------
// Stack explanations — M5 Stack Decision Explainer output (stack-explainer PRD).
//
// One row per imported repo snapshot: the structured, project-tied explanation
// of why the repo uses its stack. Joins the same local SQLite store (ADR 0006)
// — a new table, not a new database — as a child of `repo_snapshots`. Cited
// file paths are verified against the snapshot by an integrity check (FR-4).
// ---------------------------------------------------------------------------

/** An alternative to a stack tool and what would change if it were used. */
export interface StackToolAlternative {
  /** The alternative tool's name. */
  name: string
  /** What would change in the project if this alternative were used. */
  tradeOff: string
}

/**
 * One tool in the explained stack, with its project-specific explanation —
 * together the `tools` array forms the stack decision map (stack-explainer
 * PRD FR-3).
 */
export interface StackTool {
  /** The tool or framework name, e.g. `Next.js`. */
  name: string
  /** What this tool does in this project, in plain language. */
  purpose: string
  /** Alternatives to this tool and the trade-off of each. */
  alternatives: StackToolAlternative[]
  /** Why this tool matters for the job market. */
  jobRelevance: string
}

/** A file worth inspecting to understand the project, and why. */
export interface KeyFilePointer {
  /** Path within the snapshot, e.g. `apps/web/app/page.tsx`. */
  path: string
  /** Why this file is worth inspecting. */
  reason: string
}

/** A debugging entry point — where to start when something breaks. */
export interface DebugEntryPoint {
  /** Where to look — a path or area of the project. */
  location: string
  /** What kind of failure this entry point helps diagnose. */
  guidance: string
}

/**
 * A stack explanation produced by the M5 explainer for one imported snapshot.
 * Generated by a bounded Anthropic SDK call grounded in the snapshot's files.
 */
export const stackExplanations = sqliteTable(
  "stack_explanations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The imported repo snapshot this explanation is for. */
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => repoSnapshots.id, { onDelete: "cascade" }),
    /** The explained stack — one entry per major tool (the decision map). */
    tools: text("tools", { mode: "json" }).$type<StackTool[]>().notNull(),
    /** Key files worth inspecting to understand the project. */
    keyFiles: text("key_files", { mode: "json" })
      .$type<KeyFilePointer[]>()
      .notNull(),
    /** Where to start debugging common failures. */
    debugEntryPoints: text("debug_entry_points", { mode: "json" })
      .$type<DebugEntryPoint[]>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    /** One explanation per snapshot; re-explaining updates the row. */
    uniqueIndex("stack_explanations_snapshot_unique").on(table.snapshotId),
  ],
)

/** A stack explanation as read from the database. */
export type StackExplanation = typeof stackExplanations.$inferSelect

/** The shape required to insert a stack explanation. */
export type NewStackExplanation = typeof stackExplanations.$inferInsert

// ---------------------------------------------------------------------------
// Project maps — M6 Project Logic Mapper output (project-logic-mapper PRD).
//
// One row per imported repo snapshot: the generated project logic map that
// helps a junior dev explain and defend the project in interviews. Joins the
// same local SQLite store (ADR 0006) — a new table, not a new database — as a
// child of `repo_snapshots`, deleted with its parent, unique per snapshot.
// Structured/list-valued sections are stored as JSON text columns, mirroring
// the `stack_explanations` convention. Cited file paths are verified against
// the snapshot by an integrity check.
// ---------------------------------------------------------------------------

/**
 * One section of the architecture overview — a layer or area of the project
 * with its plain-language explanation.
 */
export interface ArchitectureSection {
  /** The architectural layer or area, e.g. `Frontend`, `Data layer`. */
  title: string
  /** What this layer does in the project, in plain language. */
  detail: string
}

/** A file worth knowing to navigate the project, and the role it plays. */
export interface ProjectMapFile {
  /** Path within the snapshot, e.g. `apps/web/app/page.tsx`. */
  path: string
  /** The role this file plays in the project. */
  role: string
}

/**
 * One step of a traced flow (request/data, state, or AI-call). Steps are
 * ordered; together they form a flow the user can walk through end to end.
 */
export interface FlowStep {
  /** One-based position of this step in the flow. */
  order: number
  /** What happens at this step, in plain language. */
  description: string
  /** Path within the snapshot where this step is implemented, if any. */
  path?: string
}

/** One step of the debug path — where to look first when something breaks. */
export interface DebugPathStep {
  /** Where to look — a path or area of the project. */
  location: string
  /** What kind of failure this step helps diagnose, and what to check. */
  guidance: string
}

/**
 * A project logic map produced by the M6 mapper for one imported snapshot.
 * Generated by a bounded Anthropic SDK call grounded in the snapshot's files.
 * Re-mapping the same snapshot updates the row in place.
 */
export const projectMaps = sqliteTable(
  "project_maps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The imported repo snapshot this map is for. */
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => repoSnapshots.id, { onDelete: "cascade" }),
    /** The architecture overview — one entry per layer/area of the project. */
    architectureOverview: text("architecture_overview", { mode: "json" })
      .$type<ArchitectureSection[]>()
      .notNull(),
    /** The key-file map — files worth knowing and the role each plays. */
    keyFileMap: text("key_file_map", { mode: "json" })
      .$type<ProjectMapFile[]>()
      .notNull(),
    /** The request/data flow, traced step by step. */
    requestDataFlow: text("request_data_flow", { mode: "json" })
      .$type<FlowStep[]>()
      .notNull(),
    /** The state flow, traced step by step. */
    stateFlow: text("state_flow", { mode: "json" })
      .$type<FlowStep[]>()
      .notNull(),
    /** The AI-call flow, traced step by step. */
    aiCallFlow: text("ai_call_flow", { mode: "json" })
      .$type<FlowStep[]>()
      .notNull(),
    /** The Mermaid diagram source rendering the project's structure. */
    mermaidDiagram: text("mermaid_diagram").notNull(),
    /** The debug path — where to start when something breaks. */
    debugPath: text("debug_path", { mode: "json" })
      .$type<DebugPathStep[]>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    /** One map per snapshot; re-mapping updates the row. */
    uniqueIndex("project_maps_snapshot_unique").on(table.snapshotId),
  ],
)

/** A project logic map as read from the database. */
export type ProjectMap = typeof projectMaps.$inferSelect

/** The shape required to insert a project logic map. */
export type NewProjectMap = typeof projectMaps.$inferInsert

// ---------------------------------------------------------------------------
// Diff reviews — M8 Diff Review Coach output (diff-review PRD).
//
// One row per reviewed pull request, keyed by repo identity (a `repo_snapshots`
// child) plus PR number. A row holds the six generated review outputs, the
// user's answers to the comprehension questions, and the grading score with a
// weak-area breakdown. Joins the same local SQLite store (ADR 0006) — a new
// table, not a new database. List-valued fields are JSON text columns,
// mirroring the `stack_explanations` convention. The answers and score columns
// are nullable: a review is generated first, then graded once the user
// completes the understanding check.
// ---------------------------------------------------------------------------

/** A changed file in the PR, explained in plain language. */
export interface ChangedFileExplanation {
  /** Path of the changed file, relative to the repo root. */
  path: string
  /** What changed in this file and why it matters, in plain language. */
  explanation: string
}

/** A risk the pull request introduces, and how it might surface. */
export interface DiffRisk {
  /** A short label for the risk. */
  title: string
  /** What could go wrong and where it would surface. */
  detail: string
}

/** A suggested test that would cover the change. */
export interface TestSuggestion {
  /** What the suggested test should verify. */
  description: string
  /** Why this test matters for the change. */
  rationale: string
}

/** A comprehension question the user must answer to defend the change. */
export interface ComprehensionQuestion {
  /** Stable identifier of the question, used to key the user's answer. */
  id: string
  /** The question text. */
  prompt: string
}

/** The user's answer to one comprehension question. */
export interface ComprehensionAnswer {
  /** The `ComprehensionQuestion.id` this answer responds to. */
  questionId: string
  /** The user's free-text answer. */
  answer: string
}

/** A weak area surfaced by grading, with how strongly it showed. */
export interface WeakArea {
  /** The area of understanding that was weak, e.g. `risk-analysis`. */
  area: string
  /** Why this area was judged weak, in plain language. */
  detail: string
}

/**
 * A diff review produced by the M8 Diff Review Coach for one pull request.
 * The six generated outputs are filled at review time; `answers`, `score`, and
 * `weakAreas` stay null until the user completes the understanding check and
 * the answers are graded.
 */
export const diffReviews = sqliteTable(
  "diff_reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The imported repo snapshot this review's repo identity is anchored to. */
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => repoSnapshots.id, { onDelete: "cascade" }),
    /** The reviewed pull request's number within the repo. */
    prNumber: integer("pr_number").notNull(),
    /** Plain-language explanation of each changed file in the PR. */
    changedFiles: text("changed_files", { mode: "json" })
      .$type<ChangedFileExplanation[]>()
      .notNull(),
    /** Plain-language explanation of the PR's core logic (prose). */
    coreLogicExplanation: text("core_logic_explanation").notNull(),
    /** Risks the PR introduces. */
    riskAnalysis: text("risk_analysis", { mode: "json" })
      .$type<DiffRisk[]>()
      .notNull(),
    /** Tests suggested to cover the change. */
    testSuggestions: text("test_suggestions", { mode: "json" })
      .$type<TestSuggestion[]>()
      .notNull(),
    /** Comprehension questions the user must answer to defend the change. */
    comprehensionQuestions: text("comprehension_questions", { mode: "json" })
      .$type<ComprehensionQuestion[]>()
      .notNull(),
    /** The user's answers; null until the understanding check is completed. */
    answers: text("answers", { mode: "json" }).$type<ComprehensionAnswer[]>(),
    /** The grading score (0–100); null until the answers are graded. */
    score: integer("score"),
    /** Weak areas surfaced by grading; null until the answers are graded. */
    weakAreas: text("weak_areas", { mode: "json" }).$type<WeakArea[]>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    /** One review per snapshot + PR number; re-reviewing updates the row. */
    uniqueIndex("diff_reviews_snapshot_pr_unique").on(
      table.snapshotId,
      table.prNumber,
    ),
  ],
)

/** A diff review as read from the database. */
export type DiffReview = typeof diffReviews.$inferSelect

/** The shape required to insert a diff review. */
export type NewDiffReview = typeof diffReviews.$inferInsert

// ---------------------------------------------------------------------------
// Challenges + challenge attempts — M9 Debug and Expansion Challenge System
// (debug-expansion-challenge PRD).
//
// Two tables keyed off the existing `repo_snapshots` (ADR 0006 — M9 adds
// tables, not a database):
//
//   - `challenges`         — one row per snapshot + challenge type, holding
//                            the typed challenge model (FR-3): type, task
//                            description, in-/out-of-scope file sets,
//                            acceptance criteria, and source references into
//                            the M6 project map. Keyed `(snapshot_id, type)`
//                            unique so R2's lazy-per-type, cached-per-snapshot
//                            generation can look up an existing row before
//                            issuing a new SDK call; the "new challenge"
//                            action overwrites the same row.
//   - `challenge_attempts` — child of `challenges`, one row per submission.
//                            Holds the user's free-text explanation, optional
//                            per-file code snippets, file paths the user said
//                            they would change, a timestamp, and the grading
//                            result (0–100 score + weak-area breakdown per
//                            R4 / FR-5). Multiple attempts per challenge
//                            (US-6) are preserved; the latest-outcome
//                            accessor returns the most recent row (R5).
//
// Structured / list-valued fields are JSON text columns, mirroring the
// `stack_explanations` / `project_maps` / `diff_reviews` convention. `WeakArea`
// is reused from `diff_reviews` so M8 and M9 share one grading shape (R4).
// ---------------------------------------------------------------------------

/**
 * The M9 challenge-type set (PRD FR-2). The "broken CI" type is gated on the
 * snapshot exposing a real failing CI run / log (R6); the type is omitted
 * from a snapshot's challenge list when no real failure is available, not
 * synthesized from a CI config file.
 */
export type ChallengeType =
  | "add-small-field"
  | "trace-failed-api-call"
  | "fix-schema-mismatch"
  | "add-loading-error-state"
  | "add-unit-test"
  | "explain-broken-ci-result"
  | "extend-module-safely"

/** A single acceptance criterion the grader will check against. */
export interface ChallengeAcceptanceCriterion {
  /** Stable identifier of the criterion, used to key per-criterion grading. */
  id: string
  /** What "done" looks like, in plain language. */
  detail: string
}

/**
 * A pointer from a challenge back into the M6 project map it was generated
 * from — the section of the map and the path it cites. The integrity check
 * (Issue #141) verifies that the path resolves to a real M6-mapped file.
 */
export interface ChallengeSourceReference {
  /** Which M6 project-map section this reference is from. */
  section:
    | "architectureOverview"
    | "keyFileMap"
    | "requestDataFlow"
    | "stateFlow"
    | "aiCallFlow"
    | "debugPath"
  /** The M6-mapped path the challenge is grounded in, e.g. `apps/web/...`. */
  path: string
  /** Plain-language note on how this reference grounds the challenge. */
  note: string
}

/**
 * One project-tied challenge generated for an imported repo snapshot. Each
 * row encodes the typed challenge model (FR-3); the user submits attempts
 * through `challenge_attempts`. Keyed `(snapshot_id, type)` unique so the
 * lazy-per-type cache (R2) can look up before re-generating; the "new
 * challenge" action overwrites the same row, but the attempts foreign-key
 * is `ON DELETE CASCADE` so a regenerated challenge takes a fresh history.
 */
export const challenges = sqliteTable(
  "challenges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The imported repo snapshot this challenge is generated for. */
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => repoSnapshots.id, { onDelete: "cascade" }),
    /** The M9 challenge type — one row per (snapshot, type). */
    type: text("type").$type<ChallengeType>().notNull(),
    /** Plain-language description of what the user must do. */
    taskDescription: text("task_description").notNull(),
    /**
     * In-scope file paths — files the user is expected to touch. Strictly
     * limited to paths the M6 project map names (R8 / FR-3); the integrity
     * check (Issue #141) rejects any path outside that set.
     */
    inScopeFiles: text("in_scope_files", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    /**
     * Out-of-scope file paths — files the user must not touch for this
     * challenge. Same M6-grounding rule as `inScopeFiles`.
     */
    outOfScopeFiles: text("out_of_scope_files", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    /** Acceptance criteria the grader will check the explanation against. */
    acceptanceCriteria: text("acceptance_criteria", { mode: "json" })
      .$type<ChallengeAcceptanceCriterion[]>()
      .notNull(),
    /** Pointers back into the M6 project map this challenge was grounded in. */
    sourceReferences: text("source_references", { mode: "json" })
      .$type<ChallengeSourceReference[]>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    /** One challenge per (snapshot, type) — R2's lazy-per-type cache key. */
    uniqueIndex("challenges_snapshot_type_unique").on(
      table.snapshotId,
      table.type,
    ),
    /** Fast lookup of every challenge for a snapshot (Challenge List Page). */
    index("challenges_snapshot_idx").on(table.snapshotId),
  ],
)

/** A challenge row as read from the database. */
export type Challenge = typeof challenges.$inferSelect

/** The shape required to insert a challenge. */
export type NewChallenge = typeof challenges.$inferInsert

/** An optional per-file code snippet attached to an attempt (illustrative). */
export interface ChallengeAttemptSnippet {
  /** Path the snippet illustrates (keyed to an in-scope file). */
  path: string
  /** The user's code snippet text (not graded for style — R3 / FR-7). */
  code: string
}

/** A per-criterion grading result, matching the M8 grading shape (R4). */
export interface ChallengeCriterionResult {
  /** The `ChallengeAcceptanceCriterion.id` this result responds to. */
  criterionId: string
  /** Whether the explanation satisfied this criterion. */
  passed: boolean
  /** Plain-language note on why this criterion did / did not pass. */
  detail: string
}

/**
 * The grading result for a submission — 0–100 numeric score + weak-area
 * breakdown matching M8 (R4 / FR-5), plus per-criterion results and a short
 * feedback paragraph. Stored on the attempt row as a single JSON column to
 * keep the row total even if the grading shape evolves.
 */
export interface ChallengeGradingResult {
  /** The 0–100 numeric score. */
  score: number
  /** Weak areas surfaced by grading — reuses the M8 `WeakArea` shape. */
  weakAreas: WeakArea[]
  /** Per-criterion pass/fail breakdown. */
  criterionResults: ChallengeCriterionResult[]
  /** A short plain-language feedback paragraph. */
  feedback: string
}

/**
 * One user attempt at a challenge. Multiple attempts per challenge (US-6) are
 * preserved; the latest-outcome accessor returns the row with the largest
 * `submittedAt` (R5). The grading result is filled when the M9 grading call
 * (#143) completes; it stays `null` between submission and grading.
 */
export const challengeAttempts = sqliteTable(
  "challenge_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The challenge this attempt is against. */
    challengeId: integer("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    /** The user's free-text explanation — the graded artifact (R3 / FR-7). */
    explanation: text("explanation").notNull(),
    /** Optional per-file code snippets the user attached (illustrative). */
    snippets: text("snippets", { mode: "json" })
      .$type<ChallengeAttemptSnippet[]>()
      .notNull(),
    /** Paths the user said they would change — illustrative, not graded. */
    filePaths: text("file_paths", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    /** When the user submitted this attempt — drives latest-outcome (R5). */
    submittedAt: integer("submitted_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Grading result; null until the M9 grading call completes. */
    grading: text("grading", { mode: "json" }).$type<ChallengeGradingResult>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    /** Fast lookup of every attempt for a challenge (Detail Page R5). */
    index("challenge_attempts_challenge_idx").on(table.challengeId),
  ],
)

/** A challenge attempt as read from the database. */
export type ChallengeAttempt = typeof challengeAttempts.$inferSelect

/** The shape required to insert a challenge attempt. */
export type NewChallengeAttempt = typeof challengeAttempts.$inferInsert
