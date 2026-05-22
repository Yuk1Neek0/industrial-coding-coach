// Public surface of the M6 Project Logic Mapper backend
// (project-logic-mapper epic).
//
// - `ingest`       — deterministic snapshot ingestion: file tree,
//                    module/dependency graph, import relationships, reused M5
//                    frameworks/entry points (Issue #103).
// - `imports`      — the pure import/require statement parser `ingest` builds on.
// - `project-maps` — the `project_maps` data-access layer + file-reference
//                    integrity check (Issue #106).

export {
  ingestSnapshot,
  ingestSnapshotForRepo,
  type DependencyEdge,
  type DependencyGraph,
  type EntryPoint,
  type ExternalDependency,
  type FileTreeNode,
  type IngestedProject,
  type IngestionFile,
  type IngestSnapshotInput,
  type ModuleNode,
} from "./ingest"

export {
  isParseableSource,
  parseImports,
  PARSEABLE_EXTENSIONS,
  type ImportRef,
} from "./imports"

export {
  checkProjectMapFileReferences,
  checkProjectMapIntegrity,
  createProjectMap,
  getProjectMap,
  getProjectMapByRepo,
  saveProjectMap,
  updateProjectMap,
  type ProjectMapContent,
  type ProjectMapReferenceCheck,
} from "./project-maps"
