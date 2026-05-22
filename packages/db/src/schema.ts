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
