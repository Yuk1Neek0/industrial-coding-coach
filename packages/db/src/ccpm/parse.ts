// Generalized CCPM artifact parser (Issue #198, M12 epic ccpm-integration).
//
// Pure parsers that turn CCPM artifact file CONTENTS into typed structures for
// the traceability graph (Issue #200): PRDs (`.claude/prds/*.md`), epics
// (`.claude/epics/<e>/epic.md`), and tasks (`.claude/epics/<e>/<N>.md`) —
// INCLUDING the `archived/` subtree, which the M7 task adapter
// (`github/ccpm-task-adapter.ts`) intentionally excludes for the learning
// workspace.
//
// This generalizes the frontmatter approach proven in `parseCcpmTaskFile`
// rather than duplicating it: one tolerant frontmatter splitter feeds three
// artifact parsers. Everything here is pure and total — each parser takes raw
// `content: string`, never the network and never the live filesystem. Type
// names carry an `Artifact` flavor (`CcpmTaskArtifact`, …) so they never clash
// with M7's `CcpmTask` / `CcpmTaskFrontmatter` when both modules are re-exported
// from the package root.

/** The three CCPM artifact kinds M12 reconstructs a delivery map from. */
export type CcpmArtifactType = "prd" | "epic" | "task"

/** Frontmatter a PRD carries (`.claude/prds/<name>.md`, conventions.md). */
export interface CcpmPrdFrontmatter {
  name: string | null
  description: string | null
  status: string | null
  created: string | null
}

/** Frontmatter an epic carries (`.claude/epics/<e>/epic.md`). */
export interface CcpmEpicFrontmatter {
  name: string | null
  status: string | null
  /** e.g. `0%` / `100%` — kept verbatim; the graph parses the number. */
  progress: string | null
  /** Path to the source PRD, e.g. `.claude/prds/<name>.md`. */
  prd: string | null
  /** GitHub epic-issue URL once synced, else `null`. */
  github: string | null
}

/** Frontmatter a task carries (`.claude/epics/<e>/<N>.md`). */
export interface CcpmTaskArtifactFrontmatter {
  name: string | null
  status: string | null
  /** GitHub issue URL once synced, else `null`. */
  github: string | null
  /** Issue numbers this task depends on (`depends_on:` list). */
  dependsOn: number[]
  /** Whether the task may run concurrently (`parallel:`), or `null` if absent. */
  parallel: boolean | null
  /** Issue numbers that touch the same files (`conflicts_with:` list). */
  conflictsWith: number[]
}

/** A parsed PRD. `name` is the stable ref: frontmatter `name` or the filename. */
export interface CcpmPrd {
  type: "prd"
  name: string
  path: string
  frontmatter: CcpmPrdFrontmatter
  body: string
}

/** A parsed epic. `name` is the stable ref: frontmatter `name` or the dir name. */
export interface CcpmEpic {
  type: "epic"
  name: string
  /** The directory under `.claude/epics/` (or `archived/`) holding the epic. */
  epicDir: string
  /** `true` when the epic lives under `.claude/epics/archived/`. */
  archived: boolean
  path: string
  frontmatter: CcpmEpicFrontmatter
  body: string
}

/** A parsed task. `taskRef` is the stable ref `epic/<epicDir>/<taskId>`. */
export interface CcpmTaskArtifact {
  type: "task"
  taskRef: string
  epicDir: string
  taskId: string
  /** `true` when the task lives under `.claude/epics/archived/`. */
  archived: boolean
  path: string
  frontmatter: CcpmTaskArtifactFrontmatter
  body: string
}

/** Any parsed CCPM artifact. */
export type CcpmArtifact = CcpmPrd | CcpmEpic | CcpmTaskArtifact

// --- Path classification ---------------------------------------------------

/** `.claude/prds/<name>.md` (flat — PRDs are not nested). */
const PRD_PATH = /^\.claude\/prds\/([^/]+)\.md$/
/** `.claude/epics/[archived/]<epic>/epic.md`. */
const EPIC_PATH = /^\.claude\/epics\/(?:(archived)\/)?([^/]+)\/epic\.md$/
/** `.claude/epics/[archived/]<epic>/<N>.md` — numeric task filename only. */
const TASK_PATH = /^\.claude\/epics\/(?:(archived)\/)?([^/]+)\/(\d+)\.md$/

/**
 * Classify a repo-relative path as a CCPM artifact, or `null` when it is not
 * one. Path-based and total: `epic.md` is an epic, a numeric `<N>.md` is a task,
 * and noise (`<N>-analysis.md`, `github-mapping.md`, `execution-status.md`,
 * `updates/**`) matches none.
 */
export function classifyCcpmArtifact(path: string): CcpmArtifactType | null {
  if (PRD_PATH.test(path)) return "prd"
  if (EPIC_PATH.test(path)) return "epic"
  if (TASK_PATH.test(path)) return "task"
  return null
}

function prdNameFromPath(path: string): string {
  const match = PRD_PATH.exec(path)
  if (match) return match[1]!
  const base = path.split("/").pop() ?? path
  return base.replace(/\.md$/, "")
}

function epicLocationFromPath(
  path: string,
): { epicDir: string; archived: boolean } | null {
  const match = EPIC_PATH.exec(path)
  if (!match) return null
  return { epicDir: match[2]!, archived: match[1] === "archived" }
}

function taskLocationFromPath(
  path: string,
): { epicDir: string; taskId: string; archived: boolean } | null {
  const match = TASK_PATH.exec(path)
  if (!match) return null
  return {
    epicDir: match[2]!,
    taskId: match[3]!,
    archived: match[1] === "archived",
  }
}

// --- Frontmatter splitting -------------------------------------------------

/** A markdown line that opens or closes a YAML frontmatter block. */
const FRONTMATTER_DELIMITER = /^---\s*$/
/** A `key: value` frontmatter line. */
const FRONTMATTER_FIELD = /^([A-Za-z_][\w-]*):\s*(.*?)\s*$/

interface SplitContent {
  /** Raw `key → trimmed value` map; absent keys are simply missing. */
  fields: Map<string, string>
  /** Markdown body after the closing `---`, leading/trailing blanks stripped. */
  body: string
}

/**
 * Split a CCPM artifact file into `{ fields, body }`. The file is expected to
 * open with `---` (after optional leading blank lines), carry `key: value`
 * lines, and close with `---` before the body. A file without a complete
 * frontmatter block surfaces as empty `fields` + the whole file as `body` — the
 * same clean-miss tolerance as M7's `parseCcpmTaskFile`.
 */
function splitFrontmatter(content: string): SplitContent {
  const lines = content.split(/\r?\n/)

  let index = 0
  while (index < lines.length && lines[index]!.trim().length === 0) index += 1
  if (index >= lines.length || !FRONTMATTER_DELIMITER.test(lines[index]!)) {
    return { fields: new Map(), body: content }
  }

  const start = index + 1
  let end = -1
  for (let i = start; i < lines.length; i += 1) {
    if (FRONTMATTER_DELIMITER.test(lines[i]!)) {
      end = i
      break
    }
  }
  if (end === -1) return { fields: new Map(), body: content }

  const fields = new Map<string, string>()
  for (let i = start; i < end; i += 1) {
    const match = FRONTMATTER_FIELD.exec(lines[i]!)
    if (!match) continue
    fields.set(match[1]!, match[2]!.trim())
  }

  const body = lines
    .slice(end + 1)
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
  return { fields, body }
}

/** Strip an optional surrounding quote pair; empty → `null`. */
function unwrapScalar(value: string): string | null {
  if (value.length === 0) return null
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

/** Read a scalar field, unwrapping quotes; absent or empty → `null`. */
function scalarField(fields: Map<string, string>, key: string): string | null {
  const raw = fields.get(key)
  if (raw === undefined) return null
  return unwrapScalar(raw)
}

/** Parse `[1, 2]` / `[]` / missing into a number array (non-numbers dropped). */
function parseNumberList(raw: string | undefined): number[] {
  if (raw === undefined) return []
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed === "[]") return []
  const stripped = trimmed.replace(/^\[|\]$/g, "")
  if (stripped.trim().length === 0) return []
  return stripped
    .split(",")
    .map((segment) => Number(segment.trim()))
    .filter((n) => Number.isFinite(n))
}

/** Parse a `true` / `false` scalar; anything else (incl. absent) → `null`. */
function parseBoolean(raw: string | undefined): boolean | null {
  if (raw === undefined) return null
  const value = unwrapScalar(raw.trim())
  if (value === "true") return true
  if (value === "false") return false
  return null
}

// --- Artifact parsers ------------------------------------------------------

/**
 * Parse a PRD file's contents. `name` resolves to the frontmatter `name`, or
 * the filename when that is absent, so a PRD always has a stable ref.
 */
export function parsePrd(content: string, path: string): CcpmPrd {
  const { fields, body } = splitFrontmatter(content)
  const frontmatter: CcpmPrdFrontmatter = {
    name: scalarField(fields, "name"),
    description: scalarField(fields, "description"),
    status: scalarField(fields, "status"),
    created: scalarField(fields, "created"),
  }
  return {
    type: "prd",
    name: frontmatter.name ?? prdNameFromPath(path),
    path,
    frontmatter,
    body,
  }
}

/**
 * Parse an epic file's contents. `epicDir` / `archived` come from the path;
 * `name` resolves to the frontmatter `name`, or the directory name when absent.
 */
export function parseEpic(content: string, path: string): CcpmEpic {
  const { fields, body } = splitFrontmatter(content)
  const frontmatter: CcpmEpicFrontmatter = {
    name: scalarField(fields, "name"),
    status: scalarField(fields, "status"),
    progress: scalarField(fields, "progress"),
    prd: scalarField(fields, "prd"),
    github: scalarField(fields, "github"),
  }
  const location = epicLocationFromPath(path)
  const epicDir = location?.epicDir ?? ""
  return {
    type: "epic",
    name: frontmatter.name ?? epicDir,
    epicDir,
    archived: location?.archived ?? false,
    path,
    frontmatter,
    body,
  }
}

/**
 * Parse a task file's contents. `taskRef` is `epic/<epicDir>/<taskId>` derived
 * from the path (stable across snapshot refreshes); `archived` reflects the
 * `archived/` subtree.
 */
export function parseTask(content: string, path: string): CcpmTaskArtifact {
  const { fields, body } = splitFrontmatter(content)
  const frontmatter: CcpmTaskArtifactFrontmatter = {
    name: scalarField(fields, "name"),
    status: scalarField(fields, "status"),
    github: scalarField(fields, "github"),
    dependsOn: parseNumberList(fields.get("depends_on")),
    parallel: parseBoolean(fields.get("parallel")),
    conflictsWith: parseNumberList(fields.get("conflicts_with")),
  }
  const location = taskLocationFromPath(path)
  const epicDir = location?.epicDir ?? ""
  const taskId = location?.taskId ?? ""
  return {
    type: "task",
    taskRef: `epic/${epicDir}/${taskId}`,
    epicDir,
    taskId,
    archived: location?.archived ?? false,
    path,
    frontmatter,
    body,
  }
}

/**
 * Classify a path and parse its contents into the matching artifact, or return
 * `null` when the path is not a CCPM artifact. The single entry point the
 * snapshot scanner (Issue #200) uses while walking `repo_files`.
 */
export function parseCcpmArtifact(
  path: string,
  content: string,
): CcpmArtifact | null {
  switch (classifyCcpmArtifact(path)) {
    case "prd":
      return parsePrd(content, path)
    case "epic":
      return parseEpic(content, path)
    case "task":
      return parseTask(content, path)
    default:
      return null
  }
}
