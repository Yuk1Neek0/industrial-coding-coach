// Deterministic snapshot ingestion for the M6 Project Logic Mapper
// (project-logic-mapper epic, Issue #103).
//
// `ingestSnapshot` turns an imported M11 repository snapshot into the typed,
// reproducible structural base the rest of the pipeline reasons over: a file
// tree, a module/dependency graph built from parsed import/require statements,
// and the detected frameworks + entry points. It is a PURE, deterministic
// module — no network, no LLM, no database access of its own. The same
// snapshot always yields the same `IngestedProject`.
//
// `ingestSnapshotForRepo` is the convenience that reads a snapshot through the
// shipped M11 data-access layer (`getImportedRepo` / `listRepoFiles`) and runs
// `ingestSnapshot` — there is no second snapshot-access path.
//
// Reuse, not re-detection: frameworks and entry points come from the shipped
// M5 stack detection (`../stack`). Ingestion calls `detectStack` over the same
// key files and surfaces its `tools`/`notes` — it does not re-implement stack
// detection.
//
// Graceful degradation is a hard requirement: a snapshot with no key files, no
// parseable source, or no clear entry point still produces a valid
// `IngestedProject` (with explanatory `notes`), never an error.

import { getImportedRepo, listRepoFiles } from "../github/repos"
import { detectStack, type DetectedTool } from "../stack/detect"
import type { CatalogDb } from "../client"
import type { RepoFile, RepoSnapshot, RepoTreeEntry } from "../schema"
import { isParseableSource, parseImports, type ImportRef } from "./imports"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** One node of the ingested file tree — a file or a directory. */
export interface FileTreeNode {
  /** Repo-relative path, e.g. `apps/web/app/page.tsx`. */
  path: string
  /** Base name (last path segment), e.g. `page.tsx`. */
  name: string
  /** `file` (a tree blob) or `directory` (a tree entry / inferred parent). */
  type: "file" | "directory"
  /** Size in bytes for files, when the snapshot recorded one. */
  size?: number
  /** Child nodes, sorted: directories first, then files, each name-ascending. */
  children: FileTreeNode[]
}

/** One module in the dependency graph — an in-repo source file. */
export interface ModuleNode {
  /** Repo-relative path of the source file. */
  path: string
  /**
   * `true` when the file's content was imported into the snapshot (a key file)
   * and could be scanned for imports. `false` for a source file that is only
   * known from the file tree — its outgoing edges are unknown, not absent.
   */
  scanned: boolean
  /** `true` when M5 / heuristic detection marked this file an entry point. */
  isEntryPoint: boolean
}

/** A directed edge of the dependency graph: `from` imports `to`. */
export interface DependencyEdge {
  /** Repo-relative path of the importing module. */
  from: string
  /**
   * The resolved in-repo module path the import points at, when the relative
   * specifier resolved to a known file; otherwise `null` (unresolved).
   */
  to: string | null
  /** The raw module specifier exactly as written in the source. */
  specifier: string
  /** How the import was written — `static`, `dynamic`, or `require`. */
  kind: ImportRef["kind"]
  /**
   * `true` when `specifier` is relative (an in-repo edge attempt); `false` for
   * a bare specifier — an external package or Node built-in.
   */
  internal: boolean
}

/** The module/dependency graph derived from parsed imports. */
export interface DependencyGraph {
  /** Every in-repo source file, sorted by path. */
  modules: ModuleNode[]
  /** Directed import edges, sorted by `(from, specifier, kind)`. */
  edges: DependencyEdge[]
}

/** An external dependency a snapshot's source code imports. */
export interface ExternalDependency {
  /** The npm package name (scope-aware, version/subpath stripped). */
  name: string
  /** How many distinct in-repo modules import this package. */
  importedBy: number
}

/** A recognized entry point of the project. */
export interface EntryPoint {
  /** Repo-relative path of the entry-point file. */
  path: string
  /**
   * Why this file is treated as an entry point — e.g. `package.json "main"`,
   * `Next.js app router`, or `framework convention`.
   */
  reason: string
}

/** The complete, deterministic result of {@link ingestSnapshot}. */
export interface IngestedProject {
  /** The snapshot this ingestion is for — `owner/repo` and resolved ref. */
  repo: { owner: string; repo: string; ref: string; commitSha: string }
  /** The repository file tree, as a sorted nested structure. */
  fileTree: FileTreeNode
  /** The module/dependency graph built from parsed import statements. */
  graph: DependencyGraph
  /** External packages the source code imports, sorted by name. */
  externalDependencies: ExternalDependency[]
  /** Detected frameworks/tools — the M5 stack-detection output (reused). */
  frameworks: DetectedTool[]
  /** Recognized entry points; empty when none could be identified. */
  entryPoints: EntryPoint[]
  /**
   * Graceful-degradation notes — an empty snapshot, no parseable source, no
   * clear entry point, an unparseable manifest. Empty when ingestion was clean.
   */
  notes: string[]
}

/** The minimal snapshot-file shape ingestion needs — a subset of `RepoFile`. */
export type IngestionFile = Pick<RepoFile, "path" | "content">

/** The input {@link ingestSnapshot} works from — a pre-loaded snapshot. */
export interface IngestSnapshotInput {
  owner: string
  repo: string
  ref: string
  commitSha: string
  /** The snapshot's full file tree (`repo_snapshots.file_tree`). */
  fileTree: RepoTreeEntry[]
  /** The snapshot's imported key files (`repo_files` rows). */
  files: IngestionFile[]
}

// ---------------------------------------------------------------------------
// File tree
// ---------------------------------------------------------------------------

/** Last `/`-separated segment of a repo-relative path. */
function basename(filePath: string): string {
  const segments = filePath.split("/")
  return segments[segments.length - 1] ?? filePath
}

/** Sort comparator: directories before files, then name-ascending. */
function compareTreeNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.type !== b.type) return a.type === "directory" ? -1 : 1
  return a.name.localeCompare(b.name)
}

/**
 * Build a nested, sorted file tree from a snapshot's flat `RepoTreeEntry[]`.
 *
 * Directories absent from the flat list (because GitHub's tree only listed the
 * blob) are synthesized so every file has a parent chain. The root node has an
 * empty path and name `/`.
 */
function buildFileTree(entries: RepoTreeEntry[]): FileTreeNode {
  const root: FileTreeNode = {
    path: "",
    name: "/",
    type: "directory",
    children: [],
  }
  /** path → node, so synthesized directories are created at most once. */
  const byPath = new Map<string, FileTreeNode>([["", root]])

  /** Get (creating if needed) the directory node at a repo-relative path. */
  const ensureDir = (dirPath: string): FileTreeNode => {
    const existing = byPath.get(dirPath)
    if (existing) return existing
    const node: FileTreeNode = {
      path: dirPath,
      name: basename(dirPath),
      type: "directory",
      children: [],
    }
    byPath.set(dirPath, node)
    const slash = dirPath.lastIndexOf("/")
    const parentPath = slash === -1 ? "" : dirPath.slice(0, slash)
    ensureDir(parentPath).children.push(node)
    return node
  }

  for (const entry of entries) {
    if (entry.path.length === 0) continue
    const slash = entry.path.lastIndexOf("/")
    const parentPath = slash === -1 ? "" : entry.path.slice(0, slash)
    if (entry.type === "tree") {
      ensureDir(entry.path)
      continue
    }
    // A blob: attach it to its (possibly synthesized) parent directory.
    if (byPath.has(entry.path)) continue
    const node: FileTreeNode = {
      path: entry.path,
      name: basename(entry.path),
      type: "file",
      ...(entry.size !== undefined ? { size: entry.size } : {}),
      children: [],
    }
    byPath.set(entry.path, node)
    ensureDir(parentPath).children.push(node)
  }

  // Sort every directory's children for a stable, deterministic tree.
  for (const node of byPath.values()) {
    node.children.sort(compareTreeNodes)
  }
  return root
}

// ---------------------------------------------------------------------------
// Import-specifier resolution
// ---------------------------------------------------------------------------

/** Candidate file extensions a relative import may omit, in resolution order. */
const RESOLVE_EXTENSIONS: readonly string[] = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]

/** `index` basenames a relative import to a directory may resolve to. */
const INDEX_BASENAMES: readonly string[] = RESOLVE_EXTENSIONS.map(
  (ext) => `index${ext}`,
)

/**
 * Normalize a `./a/../b`-style path against the importing file's directory,
 * collapsing `.` and `..` segments. Returns a repo-relative path with no
 * leading slash. A `..` that would escape the repo root is clamped at root.
 */
function resolveRelative(fromFile: string, specifier: string): string {
  const slash = fromFile.lastIndexOf("/")
  const fromDir = slash === -1 ? "" : fromFile.slice(0, slash)
  const segments = (fromDir ? fromDir.split("/") : []).concat(
    specifier.split("/"),
  )
  const out: string[] = []
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") {
      out.pop()
      continue
    }
    out.push(segment)
  }
  return out.join("/")
}

/**
 * Resolve a relative import specifier to a concrete in-repo file path, trying
 * the explicit path, common extensions, and directory-`index` files — exactly
 * the resolution order Node / a bundler uses. Returns `null` when nothing in
 * the known file set matches (an unresolved edge, recorded but not invented).
 */
function resolveSpecifier(
  fromFile: string,
  specifier: string,
  knownFiles: ReadonlySet<string>,
): string | null {
  const base = resolveRelative(fromFile, specifier)
  if (knownFiles.has(base)) return base
  for (const ext of RESOLVE_EXTENSIONS) {
    if (knownFiles.has(base + ext)) return base + ext
  }
  for (const index of INDEX_BASENAMES) {
    const candidate = base ? `${base}/${index}` : index
    if (knownFiles.has(candidate)) return candidate
  }
  return null
}

/** Node's built-in module names, including the `node:` prefix form. */
function isBuiltinModule(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true
  const builtins = new Set([
    "assert",
    "buffer",
    "child_process",
    "cluster",
    "crypto",
    "dgram",
    "dns",
    "events",
    "fs",
    "http",
    "http2",
    "https",
    "net",
    "os",
    "path",
    "perf_hooks",
    "process",
    "querystring",
    "readline",
    "stream",
    "string_decoder",
    "timers",
    "tls",
    "tty",
    "url",
    "util",
    "v8",
    "vm",
    "worker_threads",
    "zlib",
  ])
  return builtins.has(specifier)
}

/**
 * Extract the npm package name from a bare specifier — `react` from
 * `react/jsx-runtime`, `@scope/pkg` from `@scope/pkg/sub`. Returns `null` for
 * a relative specifier or a Node built-in (neither is an external package).
 */
function packageNameOf(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null
  if (isBuiltinModule(specifier)) return null
  const segments = specifier.split("/")
  if (specifier.startsWith("@")) {
    return segments.length >= 2
      ? `${segments[0]}/${segments[1]}`
      : (segments[0] ?? specifier)
  }
  return segments[0] ?? specifier
}

// ---------------------------------------------------------------------------
// Entry-point detection — reuse M5 stack output, never re-detect the stack
// ---------------------------------------------------------------------------

/**
 * Read the `main` / `module` / `bin` entry fields a `package.json` declares.
 * Returns repo-relative candidate paths (the manifest's directory + field).
 */
function manifestEntryPaths(
  manifestPath: string,
  content: string,
): { path: string; field: string }[] {
  let manifest: unknown
  try {
    manifest = JSON.parse(content)
  } catch {
    return []
  }
  if (typeof manifest !== "object" || manifest === null) return []
  const record = manifest as Record<string, unknown>
  const slash = manifestPath.lastIndexOf("/")
  const dir = slash === -1 ? "" : manifestPath.slice(0, slash)
  const join = (rel: string): string => {
    const cleaned = rel.replace(/^\.\//, "")
    return dir ? `${dir}/${cleaned}` : cleaned
  }
  const found: { path: string; field: string }[] = []
  for (const field of ["main", "module"] as const) {
    const value = record[field]
    if (typeof value === "string" && value.length > 0) {
      found.push({ path: join(value), field })
    }
  }
  const bin = record["bin"]
  if (typeof bin === "string" && bin.length > 0) {
    found.push({ path: join(bin), field: "bin" })
  } else if (typeof bin === "object" && bin !== null) {
    for (const value of Object.values(bin as Record<string, unknown>)) {
      if (typeof value === "string" && value.length > 0) {
        found.push({ path: join(value), field: "bin" })
      }
    }
  }
  return found
}

/**
 * Framework-convention entry points. Each is a regexp over a repo-relative
 * path; a match means the file is a conventional entry point of that
 * framework. Only consulted when the M5-detected frameworks include the
 * framework — so this reuses M5's decision rather than re-detecting it.
 */
const FRAMEWORK_ENTRY_CONVENTIONS: ReadonlyArray<{
  framework: string
  pattern: RegExp
  reason: string
}> = [
  {
    framework: "Next.js",
    pattern: /(^|\/)app\/(layout|page)\.[jt]sx?$/,
    reason: "Next.js App Router entry",
  },
  {
    framework: "Next.js",
    pattern: /(^|\/)pages\/(_app|index)\.[jt]sx?$/,
    reason: "Next.js Pages Router entry",
  },
  {
    framework: "Vite",
    pattern: /(^|\/)src\/main\.[jt]sx?$/,
    reason: "Vite application entry",
  },
  {
    framework: "Remix",
    pattern: /(^|\/)app\/root\.[jt]sx?$/,
    reason: "Remix root route",
  },
  {
    framework: "SvelteKit",
    pattern: /(^|\/)src\/routes\/\+(page|layout)\.svelte$/,
    reason: "SvelteKit route entry",
  },
  {
    framework: "Astro",
    pattern: /(^|\/)src\/pages\/index\.astro$/,
    reason: "Astro index page",
  },
]

/** Generic, framework-agnostic entry-point filename conventions. */
const GENERIC_ENTRY_PATTERNS: ReadonlyArray<{
  pattern: RegExp
  reason: string
}> = [
  {
    pattern: /(^|\/)src\/(index|main)\.[jt]sx?$/,
    reason: "conventional source entry (src/index)",
  },
  {
    pattern: /^(index|main|server|app)\.[jt]sx?$/,
    reason: "conventional root entry",
  },
]

/**
 * Identify the project's entry points. Reuses the M5-detected `frameworks` to
 * decide which framework conventions apply, plus `package.json` `main`/`bin`
 * fields and generic conventions. Returns `[]` when nothing matches — a
 * snapshot with no clear entry point degrades gracefully.
 */
function detectEntryPoints(
  files: IngestionFile[],
  knownFiles: ReadonlySet<string>,
  frameworks: DetectedTool[],
): EntryPoint[] {
  const byPath = new Map<string, EntryPoint>()
  const add = (path: string, reason: string): void => {
    if (path.length > 0 && knownFiles.has(path) && !byPath.has(path)) {
      byPath.set(path, { path, reason })
    }
  }

  // package.json main / module / bin — explicit, declared entry points.
  for (const file of files) {
    if (basename(file.path).toLowerCase() !== "package.json") continue
    for (const entry of manifestEntryPaths(file.path, file.content)) {
      add(entry.path, `package.json "${entry.field}"`)
    }
  }

  // Framework conventions — only for frameworks M5 actually detected.
  const detectedNames = new Set(frameworks.map((tool) => tool.name))
  for (const filePath of knownFiles) {
    for (const convention of FRAMEWORK_ENTRY_CONVENTIONS) {
      if (
        detectedNames.has(convention.framework) &&
        convention.pattern.test(filePath)
      ) {
        add(filePath, convention.reason)
      }
    }
  }

  // Generic conventions — only when nothing more specific was found, so a bare
  // `src/index.ts` is still recognized in a snapshot with no framework signal.
  if (byPath.size === 0) {
    for (const filePath of knownFiles) {
      for (const generic of GENERIC_ENTRY_PATTERNS) {
        if (generic.pattern.test(filePath)) add(filePath, generic.reason)
      }
    }
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

/**
 * Ingest a pre-loaded repository snapshot into the deterministic structural
 * base for the M6 pipeline (Issue #103).
 *
 * Pure and deterministic: the same `input` always yields the same
 * `IngestedProject`. No network, no LLM, no database access. Frameworks and
 * entry points reuse the shipped M5 stack detection — there is no re-detection.
 *
 * Graceful degradation is guaranteed: an empty file tree, no imported key
 * files, no parseable source, or no recognizable entry point each produce a
 * valid result with an explanatory `notes` entry, never an error.
 *
 * @param input - the snapshot's identity, file tree, and imported key files.
 *   In the app, use {@link ingestSnapshotForRepo} to load these from M11.
 */
export function ingestSnapshot(input: IngestSnapshotInput): IngestedProject {
  const notes: string[] = []

  // --- File tree -----------------------------------------------------------
  const fileTree = buildFileTree(input.fileTree)
  if (input.fileTree.length === 0) {
    notes.push("Snapshot file tree is empty — no structure to ingest.")
  }

  // --- Frameworks: reuse M5 stack detection, do not re-detect --------------
  const stack = detectStack(input.files)
  for (const note of stack.notes) notes.push(note)
  const frameworks = stack.tools.filter(
    (tool) => tool.category === "framework",
  )

  // --- Module / dependency graph ------------------------------------------
  // The set of every file path the snapshot knows about — used to resolve
  // relative imports to concrete in-repo modules.
  const knownFiles = new Set(
    input.fileTree
      .filter((entry) => entry.type === "blob")
      .map((entry) => entry.path),
  )
  // Imported (content-bearing) source files, keyed by path, can be scanned.
  const contentByPath = new Map(
    input.files.map((file) => [file.path, file.content] as const),
  )

  // Modules: every in-repo JS/TS source file from the tree. A file whose
  // content was imported is `scanned`; one known only from the tree is not.
  const sourcePaths = [...knownFiles].filter(isParseableSource).sort()
  const edges: DependencyEdge[] = []
  const externalImporters = new Map<string, Set<string>>()
  let scannedCount = 0

  for (const path of sourcePaths) {
    const content = contentByPath.get(path)
    if (content === undefined) continue
    scannedCount += 1
    for (const ref of parseImports(content)) {
      if (ref.relative) {
        const to = resolveSpecifier(path, ref.specifier, knownFiles)
        edges.push({
          from: path,
          to,
          specifier: ref.specifier,
          kind: ref.kind,
          internal: true,
        })
      } else {
        edges.push({
          from: path,
          to: null,
          specifier: ref.specifier,
          kind: ref.kind,
          internal: false,
        })
        const pkg = packageNameOf(ref.specifier)
        if (pkg) {
          const importers = externalImporters.get(pkg) ?? new Set<string>()
          importers.add(path)
          externalImporters.set(pkg, importers)
        }
      }
    }
  }

  if (sourcePaths.length === 0) {
    notes.push("No JS/TS source files found in the snapshot file tree.")
  } else if (scannedCount === 0) {
    notes.push(
      "Source files were found but none had imported content to scan — " +
        "the dependency graph reflects only the file tree.",
    )
  }

  // --- Entry points: reuse M5 framework detection -------------------------
  const entryPoints = detectEntryPoints(input.files, knownFiles, frameworks)
  if (entryPoints.length === 0) {
    notes.push(
      "No clear entry point detected — neither a package.json main/bin " +
        "field nor a framework/source convention matched.",
    )
  }
  const entryPointPaths = new Set(entryPoints.map((entry) => entry.path))

  const modules: ModuleNode[] = sourcePaths.map((path) => ({
    path,
    scanned: contentByPath.has(path),
    isEntryPoint: entryPointPaths.has(path),
  }))

  edges.sort(
    (a, b) =>
      a.from.localeCompare(b.from) ||
      a.specifier.localeCompare(b.specifier) ||
      a.kind.localeCompare(b.kind),
  )

  const externalDependencies: ExternalDependency[] = [...externalImporters]
    .map(([name, importers]) => ({ name, importedBy: importers.size }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    repo: {
      owner: input.owner,
      repo: input.repo,
      ref: input.ref,
      commitSha: input.commitSha,
    },
    fileTree,
    graph: { modules, edges },
    externalDependencies,
    frameworks,
    entryPoints,
    notes,
  }
}

/** Build {@link IngestSnapshotInput} from a snapshot row and its key files. */
function toIngestInput(
  snapshot: RepoSnapshot,
  files: RepoFile[],
): IngestSnapshotInput {
  return {
    owner: snapshot.owner,
    repo: snapshot.repo,
    ref: snapshot.ref,
    commitSha: snapshot.commitSha,
    fileTree: snapshot.fileTree,
    files: files.map((file) => ({ path: file.path, content: file.content })),
  }
}

/**
 * Ingest an imported repository snapshot, reading it through the shipped M11
 * data-access layer ({@link getImportedRepo} / {@link listRepoFiles}).
 *
 * A convenience over {@link ingestSnapshot} — the single snapshot-access path.
 * Returns `null` only when no snapshot matches `owner/repo[/ref]` (so the
 * caller can tell "repo not imported" apart from "imported but sparse"); a
 * sparse-but-present snapshot still ingests successfully with explanatory
 * `notes`.
 *
 * @param db - injectable `CatalogDb` for tests; omitted → the package default.
 */
export async function ingestSnapshotForRepo(
  owner: string,
  repo: string,
  ref?: string,
  db?: CatalogDb,
): Promise<IngestedProject | null> {
  const snapshot = await getImportedRepo(owner, repo, ref, db)
  if (!snapshot) return null
  const files = await listRepoFiles(owner, repo, ref, db)
  return ingestSnapshot(toIngestInput(snapshot, files))
}
