// CCPM traceability graph + detection + degradation (Issue #200, M12 epic).
//
// A pure builder that turns parsed CCPM artifacts (Issue #198) into a typed
// delivery map — PRD → Epic → Task nodes with the edges that exist in the
// source files — or a `NoCcpmWorkflow` detection state when the snapshot carries
// no CCPM artifacts at all (the common case for the target user).
//
// Pure and deterministic: no I/O, no network, stable ordering. The issue/PR
// LINK data is NOT fetched here — each task node records only the parsed
// `issueNumber` and a `synced` flag; the resolved link (issue state + closing
// PR) is attached by the data-access layer (Issue #203) from the persisted
// `ccpm_issue_links` rows the import-time linking pass (Issue #201) writes.

import type { CcpmArtifact, CcpmEpic, CcpmPrd, CcpmTaskArtifact } from "./parse"

/** A task node: the parsed task plus its (unresolved) issue-link slot. */
export interface CcpmTaskNode {
  /** Stable ref `epic/<epicDir>/<taskId>`. */
  taskRef: string
  taskId: string
  /** Frontmatter `name`, or the taskRef when absent. */
  name: string
  status: string | null
  archived: boolean
  /** Issue number parsed from the task's `github:` field, or `null`. */
  issueNumber: number | null
  /** `true` when the task carries a `github:` issue reference (US-1). */
  synced: boolean
  dependsOn: number[]
  path: string
}

/** An epic node with its tasks nested. */
export interface CcpmEpicNode {
  /** Frontmatter `name`, or the directory name when absent. */
  name: string
  epicDir: string
  archived: boolean
  status: string | null
  progress: string | null
  /** PRD name this epic links to (derived from its `prd:` field), or `null`. */
  prdName: string | null
  /** Issue number parsed from the epic's `github:` field, or `null`. */
  issueNumber: number | null
  /** `true` when the epic has no `epic.md` and exists only via its tasks. */
  synthetic: boolean
  tasks: CcpmTaskNode[]
  path: string
}

/** A PRD node with its linked epics nested. */
export interface CcpmPrdNode {
  /** Frontmatter `name`, or the filename when absent. */
  name: string
  status: string | null
  description: string | null
  epics: CcpmEpicNode[]
  path: string
}

/** Summary counts for the teaching layer (Issue #202) and the UI. */
export interface CcpmMapStats {
  prdCount: number
  epicCount: number
  taskCount: number
  syncedTaskCount: number
  closedTaskCount: number
  archivedEpicCount: number
}

/** A populated traceability map. */
export interface CcpmTraceabilityMap {
  kind: "map"
  /** PRDs with their linked epics nested. */
  prds: CcpmPrdNode[]
  /** Epics that resolve to no PRD — still shown, never dropped (US-1). */
  orphanEpics: CcpmEpicNode[]
  stats: CcpmMapStats
}

/** The degradation state: no spec-driven workflow detected (US-4). */
export interface NoCcpmWorkflow {
  kind: "absent"
  /** What was searched for — surfaced to the user in the explainer. */
  searched: string[]
}

/** Either a populated map or the absent/degradation state. */
export type CcpmDeliveryMap = CcpmTraceabilityMap | NoCcpmWorkflow

/** The path roots scanned for CCPM artifacts (reported in the absent state). */
const SEARCHED_PATHS = [".claude/prds/", ".claude/epics/"]

/** Parse a trailing `/issues/<N>` or `/pull/<N>` number from a github URL. */
function issueNumberFromGithub(github: string | null): number | null {
  if (github === null) return null
  const match = /\/(?:issues|pull)\/(\d+)\b/.exec(github)
  return match ? Number(match[1]) : null
}

/** Derive a PRD name from an epic's `prd:` field (`.claude/prds/<name>.md`). */
function prdNameFromField(prdField: string | null): string | null {
  if (prdField === null) return null
  const match = /(?:^|\/)([^/]+)\.md$/.exec(prdField)
  return match ? match[1]! : prdField
}

/** Stable epic key combining the archived flag and the directory name. */
function epicKey(archived: boolean, epicDir: string): string {
  return `${archived ? "archived" : "active"}:${epicDir}`
}

function toTaskNode(task: CcpmTaskArtifact): CcpmTaskNode {
  const issueNumber = issueNumberFromGithub(task.frontmatter.github)
  return {
    taskRef: task.taskRef,
    taskId: task.taskId,
    name: task.frontmatter.name ?? task.taskRef,
    status: task.frontmatter.status,
    archived: task.archived,
    issueNumber,
    synced: task.frontmatter.github !== null,
    dependsOn: task.frontmatter.dependsOn,
    path: task.path,
  }
}

/** Sort tasks by numeric id, falling back to the ref for non-numeric ids. */
function compareTasks(a: CcpmTaskNode, b: CcpmTaskNode): number {
  const na = Number(a.taskId)
  const nb = Number(b.taskId)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return a.taskRef.localeCompare(b.taskRef)
}

/**
 * Build the delivery traceability map from parsed CCPM artifacts, or return the
 * `NoCcpmWorkflow` state when there are none.
 *
 * Edges come straight from the source files: an epic links to its PRD via the
 * `prd:` field; a task belongs to its epic by directory; a task links to its
 * issue via `github:`. Nothing is dropped — an epic with no PRD becomes an
 * orphan, a PRD with no epic keeps an empty `epics` list, and tasks whose epic
 * has no `epic.md` get a synthetic epic node so they still appear.
 */
export function buildTraceabilityMap(
  artifacts: CcpmArtifact[],
): CcpmDeliveryMap {
  const prds: CcpmPrd[] = []
  const epics: CcpmEpic[] = []
  const tasks: CcpmTaskArtifact[] = []
  for (const artifact of artifacts) {
    if (artifact.type === "prd") prds.push(artifact)
    else if (artifact.type === "epic") epics.push(artifact)
    else tasks.push(artifact)
  }

  if (prds.length === 0 && epics.length === 0 && tasks.length === 0) {
    return { kind: "absent", searched: SEARCHED_PATHS }
  }

  // Index epic nodes by key; seed from parsed epics, then synthesize for any
  // epic directory that only appears via its tasks (so no task is dropped).
  const epicNodes = new Map<string, CcpmEpicNode>()
  for (const epic of epics) {
    epicNodes.set(epicKey(epic.archived, epic.epicDir), {
      name: epic.name,
      epicDir: epic.epicDir,
      archived: epic.archived,
      status: epic.frontmatter.status,
      progress: epic.frontmatter.progress,
      prdName: prdNameFromField(epic.frontmatter.prd),
      issueNumber: issueNumberFromGithub(epic.frontmatter.github),
      synthetic: false,
      tasks: [],
      path: epic.path,
    })
  }
  for (const task of tasks) {
    const key = epicKey(task.archived, task.epicDir)
    let node = epicNodes.get(key)
    if (node === undefined) {
      node = {
        name: task.epicDir,
        epicDir: task.epicDir,
        archived: task.archived,
        status: null,
        progress: null,
        prdName: null,
        issueNumber: null,
        synthetic: true,
        tasks: [],
        path: `.claude/epics/${task.archived ? "archived/" : ""}${task.epicDir}`,
      }
      epicNodes.set(key, node)
    }
    node.tasks.push(toTaskNode(task))
  }
  for (const node of epicNodes.values()) node.tasks.sort(compareTasks)

  // Sort epics deterministically (active before archived, then by name).
  const sortedEpics = [...epicNodes.values()].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1
    return a.name.localeCompare(b.name) || a.epicDir.localeCompare(b.epicDir)
  })

  // Group epics under PRDs by name; the rest are orphans.
  const prdByName = new Map<string, CcpmPrdNode>()
  const prdNodes: CcpmPrdNode[] = prds
    .map((prd): CcpmPrdNode => {
      const node: CcpmPrdNode = {
        name: prd.name,
        status: prd.frontmatter.status,
        description: prd.frontmatter.description,
        epics: [],
        path: prd.path,
      }
      prdByName.set(prd.name, node)
      return node
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const orphanEpics: CcpmEpicNode[] = []
  for (const epicNode of sortedEpics) {
    const prd =
      epicNode.prdName !== null ? prdByName.get(epicNode.prdName) : undefined
    if (prd !== undefined) prd.epics.push(epicNode)
    else orphanEpics.push(epicNode)
  }

  const allTaskNodes = sortedEpics.flatMap((e) => e.tasks)
  const stats: CcpmMapStats = {
    prdCount: prdNodes.length,
    epicCount: sortedEpics.length,
    taskCount: allTaskNodes.length,
    syncedTaskCount: allTaskNodes.filter((t) => t.synced).length,
    closedTaskCount: allTaskNodes.filter((t) => t.status === "closed").length,
    archivedEpicCount: sortedEpics.filter((e) => e.archived).length,
  }

  return { kind: "map", prds: prdNodes, orphanEpics, stats }
}
