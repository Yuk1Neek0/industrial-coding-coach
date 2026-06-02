// Unit tests for the CCPM traceability graph builder (Issue #200).
//
// Pure — builds artifacts via the #198 parser, then asserts the map structure,
// edges, detection/degradation, orphan handling, synthetic epics, ordering, and
// stats. No DB, no network.

import { describe, expect, it } from "vitest"

import { parseCcpmArtifact, type CcpmArtifact } from "./parse"
import {
  buildTraceabilityMap,
  type CcpmTraceabilityMap,
} from "./graph"

/** Parse a (path, content) pair into an artifact (non-null in these fixtures). */
function artifact(path: string, content: string): CcpmArtifact {
  const parsed = parseCcpmArtifact(path, content)
  if (parsed === null) throw new Error(`not a CCPM artifact: ${path}`)
  return parsed
}

const PRD_FEATURE = artifact(
  ".claude/prds/feature.md",
  "---\nname: feature\nstatus: backlog\ndescription: A feature\n---\nbody",
)
const PRD_LONELY = artifact(
  ".claude/prds/lonely.md",
  "---\nname: lonely\nstatus: backlog\n---\nbody",
)
const EPIC_FEATURE = artifact(
  ".claude/epics/feature/epic.md",
  "---\nname: feature\nstatus: in-progress\nprogress: 50%\nprd: .claude/prds/feature.md\ngithub: https://github.com/acme/widgets/issues/10\n---\nbody",
)
const TASK_001 = artifact(
  ".claude/epics/feature/001.md",
  "---\nname: First\nstatus: open\ngithub: https://github.com/acme/widgets/issues/11\ndepends_on: []\n---\nbody",
)
const TASK_002 = artifact(
  ".claude/epics/feature/002.md",
  "---\nname: Second\nstatus: open\n---\nbody",
)
const EPIC_ARCHIVED = artifact(
  ".claude/epics/archived/old/epic.md",
  "---\nname: old\nstatus: completed\n---\nbody",
)
const TASK_ARCHIVED = artifact(
  ".claude/epics/archived/old/099.md",
  "---\nname: Legacy\nstatus: closed\n---\nbody",
)
const EPIC_ORPHAN = artifact(
  ".claude/epics/orphan/epic.md",
  "---\nname: orphan\nstatus: backlog\nprd: .claude/prds/missing.md\n---\nbody",
)

const FULL_FIXTURE: CcpmArtifact[] = [
  // Intentionally unsorted to prove deterministic ordering.
  TASK_002,
  EPIC_ARCHIVED,
  PRD_LONELY,
  TASK_001,
  EPIC_FEATURE,
  PRD_FEATURE,
  TASK_ARCHIVED,
  EPIC_ORPHAN,
]

/** Build and narrow to a populated map (the fixtures are never absent). */
function buildMap(artifacts: CcpmArtifact[]): CcpmTraceabilityMap {
  const map = buildTraceabilityMap(artifacts)
  if (map.kind !== "map") throw new Error("expected a populated map")
  return map
}

describe("buildTraceabilityMap — detection / degradation", () => {
  it("returns the absent state for no artifacts", () => {
    const map = buildTraceabilityMap([])
    expect(map.kind).toBe("absent")
    if (map.kind !== "absent") return
    expect(map.searched).toContain(".claude/prds/")
    expect(map.searched).toContain(".claude/epics/")
  })

  it("returns a populated map when any artifact exists", () => {
    expect(buildTraceabilityMap([PRD_LONELY]).kind).toBe("map")
  })
})

describe("buildTraceabilityMap — edges and nesting", () => {
  it("nests epics under their PRD via the prd: field", () => {
    const map = buildMap(FULL_FIXTURE)
    const feature = map.prds.find((p) => p.name === "feature")
    expect(feature).toBeDefined()
    expect(feature!.epics.map((e) => e.name)).toEqual(["feature"])
    expect(feature!.epics[0]!.prdName).toBe("feature")
    expect(feature!.epics[0]!.issueNumber).toBe(10)
  })

  it("nests tasks under their epic, sorted by numeric id", () => {
    const map = buildMap(FULL_FIXTURE)
    const epic = map.prds.find((p) => p.name === "feature")!.epics[0]!
    expect(epic.tasks.map((t) => t.taskId)).toEqual(["001", "002"])
    expect(epic.tasks.map((t) => t.name)).toEqual(["First", "Second"])
  })

  it("flags synced vs unsynced tasks and parses the issue number", () => {
    const map = buildMap(FULL_FIXTURE)
    const tasks = map.prds.find((p) => p.name === "feature")!.epics[0]!.tasks
    const first = tasks.find((t) => t.taskId === "001")!
    const second = tasks.find((t) => t.taskId === "002")!
    expect(first.synced).toBe(true)
    expect(first.issueNumber).toBe(11)
    expect(second.synced).toBe(false)
    expect(second.issueNumber).toBeNull()
  })

  it("keeps a PRD with no epics (PRD-without-epic), not dropped", () => {
    const map = buildMap(FULL_FIXTURE)
    const lonely = map.prds.find((p) => p.name === "lonely")
    expect(lonely).toBeDefined()
    expect(lonely!.epics).toEqual([])
  })

  it("puts epics with no/missing PRD into orphanEpics, not dropped", () => {
    const map = buildMap(FULL_FIXTURE)
    const orphanNames = map.orphanEpics.map((e) => e.name).sort()
    // `old` (archived, no prd) and `orphan` (prd points at a missing PRD).
    expect(orphanNames).toEqual(["old", "orphan"])
    const archived = map.orphanEpics.find((e) => e.name === "old")!
    expect(archived.archived).toBe(true)
    expect(archived.tasks.map((t) => t.taskId)).toEqual(["099"])
    expect(archived.tasks[0]!.status).toBe("closed")
  })
})

describe("buildTraceabilityMap — synthetic epics + ordering + stats", () => {
  it("synthesizes an epic node for a task whose epic.md is absent", () => {
    const ghostTask = artifact(
      ".claude/epics/ghost/005.md",
      "---\nname: Ghost task\nstatus: open\n---\nbody",
    )
    const map = buildMap([PRD_LONELY, ghostTask])
    const ghost = map.orphanEpics.find((e) => e.epicDir === "ghost")
    expect(ghost).toBeDefined()
    expect(ghost!.synthetic).toBe(true)
    expect(ghost!.tasks.map((t) => t.taskId)).toEqual(["005"])
  })

  it("orders PRDs by name deterministically", () => {
    const map = buildMap(FULL_FIXTURE)
    expect(map.prds.map((p) => p.name)).toEqual(["feature", "lonely"])
  })

  it("computes summary stats", () => {
    const map = buildMap(FULL_FIXTURE)
    expect(map.stats).toEqual({
      prdCount: 2,
      epicCount: 3, // feature, old, orphan
      taskCount: 3, // 001, 002, 099
      syncedTaskCount: 1, // only 001 carries a github ref
      closedTaskCount: 1, // only 099 is closed
      archivedEpicCount: 1, // old
    })
  })
})
