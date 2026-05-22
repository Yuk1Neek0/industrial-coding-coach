// The structural shape of the deterministic ingestion output the M6 mapping
// pipeline consumes (project-logic-mapper epic, Issue #105).
//
// The ingestion structure itself is produced by `@workspace/db`'s
// `ingestSnapshot` (Issue #103). It is NOT imported from there: `@workspace/db`
// already depends on `@workspace/ai`, so importing `IngestedProject` back would
// be a dependency cycle (the same reason `./loader`'s `SnapshotFile` is a local
// structural type, not a `RepoFile` import).
//
// These interfaces are therefore a deliberate structural mirror of
// `@workspace/db`'s `IngestedProject` and its parts: the #103 output is
// assignable to {@link IngestedProject} and the pipeline accepts it directly.
// Only the fields the pipeline reads are modelled — it is a consumption view,
// not a re-declaration of the whole ingestion contract.

/** One node of the ingested file tree — a file or a directory. */
export interface FileTreeNode {
  /** Repo-relative path, e.g. `apps/web/app/page.tsx`. */
  path: string
  /** Base name (last path segment), e.g. `page.tsx`. */
  name: string
  /** `file` (a tree blob) or `directory`. */
  type: "file" | "directory"
  /** Size in bytes for files, when the snapshot recorded one. */
  size?: number
  /** Child nodes — directories first, then files, each name-ascending. */
  children: FileTreeNode[]
}

/** One module in the ingested dependency graph — an in-repo source file. */
export interface ModuleNode {
  /** Repo-relative path of the source file. */
  path: string
  /** `true` when the file's content was imported and scanned for imports. */
  scanned: boolean
  /** `true` when detection marked this file an entry point. */
  isEntryPoint: boolean
}

/** A directed edge of the ingested dependency graph: `from` imports `to`. */
export interface DependencyEdge {
  /** Repo-relative path of the importing module. */
  from: string
  /** Resolved in-repo target path, or `null` when the import did not resolve. */
  to: string | null
  /** The raw module specifier exactly as written in the source. */
  specifier: string
  /** How the import was written — `static`, `dynamic`, or `require`. */
  kind: "static" | "dynamic" | "require"
  /** `true` when `specifier` is relative (an in-repo edge attempt). */
  internal: boolean
}

/** The module/dependency graph derived from parsed imports. */
export interface DependencyGraph {
  /** Every in-repo source file, sorted by path. */
  modules: ModuleNode[]
  /** Directed import edges. */
  edges: DependencyEdge[]
}

/** An external npm dependency the snapshot's source code imports. */
export interface ExternalDependency {
  /** The npm package name (scope-aware, version/subpath stripped). */
  name: string
  /** How many distinct in-repo modules import this package. */
  importedBy: number
}

/** A detected framework/tool — a subset of `@workspace/db`'s `DetectedTool`. */
export interface DetectedFramework {
  /** The framework/tool name, e.g. `Next.js`. */
  name: string
  /** Its category, e.g. `framework`. */
  category: string
}

/** A recognized entry point of the project. */
export interface EntryPoint {
  /** Repo-relative path of the entry-point file. */
  path: string
  /** Why this file is treated as an entry point. */
  reason: string
}

/**
 * The deterministic ingestion structure the mapping pipeline consumes.
 *
 * A structural mirror of `@workspace/db`'s `IngestedProject` (Issue #103) — the
 * #103 output is assignable to this type and passed to the pipeline directly.
 */
export interface IngestedProject {
  /** The snapshot this ingestion is for — `owner/repo` and resolved ref. */
  repo: { owner: string; repo: string; ref: string; commitSha: string }
  /** The repository file tree, as a sorted nested structure. */
  fileTree: FileTreeNode
  /** The module/dependency graph built from parsed import statements. */
  graph: DependencyGraph
  /** External packages the source code imports, sorted by name. */
  externalDependencies: ExternalDependency[]
  /** Detected frameworks/tools. */
  frameworks: DetectedFramework[]
  /** Recognized entry points; empty when none could be identified. */
  entryPoints: EntryPoint[]
  /** Graceful-degradation notes from ingestion. */
  notes: string[]
}
