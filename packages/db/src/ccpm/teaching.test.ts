// Unit tests for the CCPM teaching layer (Issue #202).
//
// Pure. Builds a real map via the #200 graph builder from parsed artifacts, then
// asserts the explanations are parameterized with the map's actual numbers — and
// that the degradation state carries the M2 Golden Path pointer.

import { describe, expect, it } from "vitest"

import { buildTraceabilityMap } from "./graph"
import { parseCcpmArtifact, type CcpmArtifact } from "./parse"
import { buildCcpmTeaching, type CcpmTeaching } from "./teaching"

function artifact(path: string, content: string): CcpmArtifact {
  const parsed = parseCcpmArtifact(path, content)
  if (parsed === null) throw new Error(`not a CCPM artifact: ${path}`)
  return parsed
}

// 1 PRD, 2 epics (1 archived), 4 tasks: 1 synced, 2 closed, 3 with no deps.
const FIXTURE: CcpmArtifact[] = [
  artifact(".claude/prds/feature.md", "---\nname: feature\nstatus: backlog\n---\nbody"),
  artifact(
    ".claude/epics/feature/epic.md",
    "---\nname: feature\nprd: .claude/prds/feature.md\ngithub: https://github.com/acme/widgets/issues/10\n---\nbody",
  ),
  artifact(
    ".claude/epics/feature/001.md",
    "---\nname: A\nstatus: open\ngithub: https://github.com/acme/widgets/issues/11\ndepends_on: []\n---\nbody",
  ),
  artifact(".claude/epics/feature/002.md", "---\nname: B\nstatus: closed\ndepends_on: [11]\n---\nbody"),
  artifact(".claude/epics/feature/003.md", "---\nname: C\nstatus: open\ndepends_on: []\n---\nbody"),
  artifact(".claude/epics/archived/old/epic.md", "---\nname: old\nstatus: completed\n---\nbody"),
  artifact(".claude/epics/archived/old/099.md", "---\nname: D\nstatus: closed\n---\nbody"),
]

/** Build teaching for the fixture and narrow to the map case. */
function teachingForFixture(): CcpmTeaching {
  const result = buildCcpmTeaching(buildTraceabilityMap(FIXTURE))
  if (result.kind !== "map") throw new Error("expected map teaching")
  return result
}

describe("buildCcpmTeaching — map case", () => {
  it("parameterizes the headline with real counts", () => {
    const t = teachingForFixture()
    expect(t.headline).toContain("1 requirement doc") // singular, prdCount 1
    expect(t.headline).toContain("2 epics")
    expect(t.headline).toContain("4 tasks")
    expect(t.headline).toContain("1 tracked as GitHub issues")
  })

  it("emits the four artifact concepts in order", () => {
    const t = teachingForFixture()
    expect(t.concepts.map((c) => c.artifact)).toEqual([
      "prd",
      "epic",
      "task",
      "issue-link",
    ])
  })

  it("parameterizes the task concept with real numbers", () => {
    const task = teachingForFixture().concepts.find((c) => c.artifact === "task")!
    expect(task.body).toContain("4 tasks")
    expect(task.body).toContain("3 of them have no dependencies") // independent
    expect(task.body).toContain("2 are already done") // closed
  })

  it("notes archived epics in the epic concept", () => {
    const epic = teachingForFixture().concepts.find((c) => c.artifact === "epic")!
    expect(epic.body).toContain("2 epics")
    expect(epic.body).toContain("1 epic is archived")
  })

  it("parameterizes the issue-link concept and names traceability", () => {
    const link = teachingForFixture().concepts.find(
      (c) => c.artifact === "issue-link",
    )!
    expect(link.body).toContain("1 of 4 tasks")
    expect(link.body).toContain("traceability")
  })

  it("uses singular PRD copy for a single PRD", () => {
    const prd = teachingForFixture().concepts.find((c) => c.artifact === "prd")!
    expect(prd.body).toContain("1 PRD")
    expect(prd.body).not.toContain("1 PRDs")
  })

  it("includes professional-value framing", () => {
    const t = teachingForFixture()
    expect(t.professionalValue.length).toBeGreaterThan(0)
    expect(t.professionalValue.join(" ")).toContain("Traceability")
  })
})

describe("buildCcpmTeaching — degradation case", () => {
  it("returns educational copy + the M2 Golden Path pointer", () => {
    const result = buildCcpmTeaching(buildTraceabilityMap([]))
    expect(result.kind).toBe("absent")
    if (result.kind !== "absent") return
    expect(result.title).toBe("No spec-driven workflow detected")
    expect(result.body).toContain("PRD")
    expect(result.body.toLowerCase()).toContain("interview")
    expect(result.searched).toContain(".claude/prds/")
    expect(result.goldenPath.slug).toBe("agentic-ccpm-workflow")
    expect(result.goldenPath.label).toBe("Agentic CCPM Workflow")
  })
})
