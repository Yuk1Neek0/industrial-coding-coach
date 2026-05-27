// CCPM-task local adapter for the M7 issue-based learning workspace
// (Issue #132, PRD FR-1, R1).
//
// Some imported repositories already use the CCPM delivery workflow — their
// `.claude/epics/<epic>/<task>.md` files describe units of work the same way
// GitHub Issues do (`name`, `status`, `github`, `depends_on` frontmatter +
// markdown body). This adapter reads those task files from the IMPORTED
// SNAPSHOT (the M11 snapshot data-access layer) — NOT the live filesystem —
// and folds them into the same {@link LearningUnitInput} shape GitHub issues
// normalize to (R1).
//
// Snapshot-deterministic: this module never touches the live filesystem and
// never calls GitHub. The whole CCPM-task surface reads only the local
// SQLite snapshot via `listRepoFiles` / `getRepoFile`, the same layer
// downstream analysis (M5, M6) uses. Mirrors the M8 PR-fetch extension's
// "one access path" discipline (ADR 0009).
//
// What this module ships:
//   - `listCcpmTasks(owner, repo, ref?)` — list every CCPM task in the
//     snapshot, parsed and normalized to {@link LearningUnitInput}.
//   - `fetchCcpmTask(owner, repo, taskRef, ref?)` — load one CCPM task by
//     its stable `taskRef` (e.g. `epic/<name>/<task>`).
//   - `parseCcpmTaskFile(content, taskRef)` — pure parser, tested directly.
//
// All three return `null` (or an empty list) for a clean miss — the
// learning workspace degrades cleanly when an imported snapshot carries no
// CCPM tasks.

import { getRepoFile, listRepoFiles } from "./repos"
import type { CatalogDb } from "../client"
import type { LearningUnitInput } from "./issues"

/** The frontmatter the CCPM task convention defines (`conventions.md`). */
export interface CcpmTaskFrontmatter {
  /** The task's human-readable title (frontmatter `name:`). */
  name: string | null
  /** Lifecycle status — `open` / `in-progress` / `closed`. */
  status: string | null
  /** GitHub issue URL once the task has been synced, else `null`. */
  github: string | null
  /** Issue numbers this task depends on (`depends_on:` list). */
  dependsOn: number[]
}

/** A CCPM task file, parsed but not yet normalized. */
export interface CcpmTask {
  /**
   * Stable reference string for the task — `epic/<epic-name>/<task-id>`
   * derived from the snapshot path. The schema stores this verbatim as
   * `learning_units.issue_ref` (R1).
   */
  taskRef: string
  /** Repo-relative snapshot path the task was read from. */
  path: string
  /** Parsed frontmatter; every field may be absent. */
  frontmatter: CcpmTaskFrontmatter
  /** Markdown body (everything after the closing `---`). */
  body: string
}

/**
 * Path-prefix the adapter scans for CCPM task files in an imported snapshot.
 * Matches the CCPM convention `.claude/epics/<epic>/<NNN>.md` (numeric task
 * filename — `epic.md`, `<N>-analysis.md`, and `github-mapping.md` are
 * filtered out below).
 */
const CCPM_EPICS_PREFIX = ".claude/epics/"

/**
 * Matches a CCPM task file inside `.claude/epics/<epic>/<task>.md`. Excludes
 * `epic.md`, `<N>-analysis.md`, `github-mapping.md`, `execution-status.md`,
 * and anything under `archived/` or `updates/`.
 */
const CCPM_TASK_PATH =
  /^\.claude\/epics\/(?!archived\/)([^/]+)\/(\d+)\.md$/

/** A markdown line that opens or closes a YAML frontmatter block. */
const FRONTMATTER_DELIMITER = /^---\s*$/

/** A `key: value` frontmatter line. */
const FRONTMATTER_FIELD = /^([A-Za-z_][\w-]*):\s*(.*)\s*$/

/**
 * Split a CCPM task file into `{ frontmatter, body }`. The file is expected
 * to open with `---`, carry YAML-ish `key: value` pairs, and close with `---`
 * before the body. A file without a frontmatter block surfaces as
 * `frontmatter: {}` + the whole file as `body`.
 *
 * Exported so it can be unit-tested directly.
 */
export function parseCcpmTaskFile(content: string, taskRef: string): CcpmTask {
  const lines = content.split(/\r?\n/)
  const result: CcpmTask = {
    taskRef,
    path: "",
    frontmatter: { name: null, status: null, github: null, dependsOn: [] },
    body: "",
  }

  // File MUST start with `---` (allowing leading blank lines) for a
  // frontmatter block; anything else is treated as a frontmatter-less file.
  let index = 0
  while (index < lines.length && lines[index]!.trim().length === 0) index += 1
  if (index >= lines.length || !FRONTMATTER_DELIMITER.test(lines[index]!)) {
    result.body = content
    return result
  }

  // Walk frontmatter lines until the closing `---`.
  const frontmatterStart = index + 1
  let frontmatterEnd = -1
  for (let i = frontmatterStart; i < lines.length; i += 1) {
    if (FRONTMATTER_DELIMITER.test(lines[i]!)) {
      frontmatterEnd = i
      break
    }
  }
  if (frontmatterEnd === -1) {
    // No closing `---` — treat the whole file as body.
    result.body = content
    return result
  }

  for (let i = frontmatterStart; i < frontmatterEnd; i += 1) {
    const line = lines[i]!
    const match = FRONTMATTER_FIELD.exec(line)
    if (!match) continue
    const key = match[1]!
    const rawValue = match[2]!.trim()
    if (key === "name") {
      result.frontmatter.name = unwrapScalar(rawValue)
    } else if (key === "status") {
      result.frontmatter.status = unwrapScalar(rawValue)
    } else if (key === "github") {
      result.frontmatter.github = unwrapScalar(rawValue)
    } else if (key === "depends_on") {
      result.frontmatter.dependsOn = parseDependsOn(rawValue)
    }
  }

  // Body: everything after the closing `---`, with leading and trailing
  // blank lines stripped so the body round-trips through the schema as
  // "the markdown the user wrote" (no stray newlines from the file's
  // trailing-newline convention).
  const body = lines.slice(frontmatterEnd + 1).join("\n")
  result.body = body.replace(/^\n+/, "").replace(/\n+$/, "")
  return result
}

/** Strip an optional surrounding quote pair from a scalar frontmatter value. */
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

/** Parse a `depends_on:` value: either `[1, 2]` inline or a JSON-ish list. */
function parseDependsOn(raw: string): number[] {
  if (raw.length === 0 || raw === "[]") return []
  const stripped = raw.replace(/^\[|\]$/g, "")
  if (stripped.trim().length === 0) return []
  return stripped
    .split(",")
    .map((segment) => Number(segment.trim()))
    .filter((n) => Number.isFinite(n))
}

/**
 * Build the stable `taskRef` for a CCPM task file at a snapshot path. The
 * shape is `epic/<epic-name>/<task-id>` — stable across snapshot refreshes.
 *
 * Returns `null` when the path is not a CCPM task file (e.g. `epic.md`,
 * `<N>-analysis.md`, `github-mapping.md`, or anything outside
 * `.claude/epics/`).
 */
function taskRefForPath(repoPath: string): string | null {
  const match = CCPM_TASK_PATH.exec(repoPath)
  if (!match) return null
  return `epic/${match[1]}/${match[2]}`
}

/**
 * Map the CCPM `status` value onto the {@link LearningUnitInput.state} enum.
 * A task is `closed` only when its frontmatter `status:` is explicitly
 * `closed`; everything else (incl. `open`, `in-progress`, missing) is treated
 * as `open` so an in-flight task is included in the learning workspace.
 */
function ccpmStateFor(frontmatter: CcpmTaskFrontmatter): "open" | "closed" {
  return frontmatter.status === "closed" ? "closed" : "open"
}

/**
 * Build the labels list for a CCPM task. CCPM tasks don't carry GitHub-style
 * labels, but the workflow defines a small set of useful markers — the task's
 * `status` (e.g. `in-progress`) — that we surface as labels so the learning
 * workspace can filter / group on the same field shape as GitHub issues.
 */
function ccpmLabelsFor(frontmatter: CcpmTaskFrontmatter): string[] {
  const labels: string[] = []
  if (frontmatter.status !== null && frontmatter.status.length > 0) {
    labels.push(`status:${frontmatter.status}`)
  }
  return labels
}

/**
 * Convert a parsed {@link CcpmTask} onto the {@link LearningUnitInput} shape
 * (R1, FR-1). The output is the input contract for the learning-unit
 * generation call (Issue #133); the unit and the call do not differentiate
 * GitHub issues from CCPM tasks.
 */
export function normalizeCcpmTaskToLearningUnitInput(
  task: CcpmTask,
): LearningUnitInput {
  const title = task.frontmatter.name ?? task.taskRef
  return {
    source: "ccpm-task",
    issueRef: task.taskRef,
    title,
    body: task.body,
    labels: ccpmLabelsFor(task.frontmatter),
    state: ccpmStateFor(task.frontmatter),
    linkedPrs: [],
  }
}

/** Options shared by the snapshot reads — mirrors the M11 data-access layer. */
export interface CcpmReadOptions {
  /** The imported ref the snapshot was taken at. Omitted → most recent. */
  ref?: string
  /** Inject a catalog DB; defaults to the package-local one. */
  db?: CatalogDb
}

/**
 * List every CCPM task in the imported snapshot for `owner/repo`, parsed and
 * normalized to the {@link LearningUnitInput} shape (R1, FR-1).
 *
 * Returns an empty array for a clean miss — when the snapshot is not
 * present, when it carries no `.claude/epics/<epic>/<N>.md` files, or when
 * the imported repository simply doesn't use CCPM. The learning workspace
 * degrades cleanly to "no CCPM tasks available".
 *
 * Reads strictly via the M11 data-access layer (`listRepoFiles`) — never
 * the live filesystem (snapshot-determinism, NFR Reproducible).
 */
export async function listCcpmTasks(
  owner: string,
  repo: string,
  options: CcpmReadOptions = {},
): Promise<LearningUnitInput[]> {
  const files = await listRepoFiles(owner, repo, options.ref, options.db)
  const tasks: LearningUnitInput[] = []
  for (const file of files) {
    if (!file.path.startsWith(CCPM_EPICS_PREFIX)) continue
    const taskRef = taskRefForPath(file.path)
    if (taskRef === null) continue
    const parsed = parseCcpmTaskFile(file.content, taskRef)
    parsed.path = file.path
    tasks.push(normalizeCcpmTaskToLearningUnitInput(parsed))
  }
  // Stable order: by issueRef (which encodes epic + task id).
  tasks.sort((a, b) => a.issueRef.localeCompare(b.issueRef))
  return tasks
}

/**
 * Fetch one CCPM task by its stable `taskRef` (e.g. `epic/foo/003`).
 *
 * Returns `null` when no matching file exists in the snapshot — the same
 * clean-miss convention {@link getRepoFile} uses. The learning workspace
 * routes a clean miss to "no such task" rather than failing the request.
 *
 * @param owner - repository owner the snapshot belongs to.
 * @param repo - repository name.
 * @param taskRef - `epic/<epic-name>/<task-id>`.
 */
export async function fetchCcpmTask(
  owner: string,
  repo: string,
  taskRef: string,
  options: CcpmReadOptions = {},
): Promise<LearningUnitInput | null> {
  const match = /^epic\/([^/]+)\/(\d+)$/.exec(taskRef)
  if (!match) return null
  const path = `.claude/epics/${match[1]}/${match[2]}.md`
  const file = await getRepoFile(owner, repo, path, options.ref, options.db)
  if (file === null) return null
  const parsed = parseCcpmTaskFile(file.content, taskRef)
  parsed.path = file.path
  return normalizeCcpmTaskToLearningUnitInput(parsed)
}

