// CCPM teaching layer (Issue #202, M12 epic).
//
// Deterministic, beginner-first explanations of the spec-driven workflow,
// PARAMETERIZED by the real delivery map (Issue #200) — "this project has N
// tasks, M independent, K done" — not static boilerplate. No LLM (epic AD-3):
// the copy is templated and filled from the graph, which satisfies US-2's
// "references the actual artifact" without an SDK call or integrity-check
// surface. Also supplies the educational copy for the `NoCcpmWorkflow`
// degradation state, with a pointer to the M2 "Agentic CCPM Workflow" Golden
// Path the UI links to.

import type { CcpmDeliveryMap, CcpmEpicNode, CcpmTaskNode } from "./graph"

/** One artifact-type explanation, parameterized by the real map. */
export interface CcpmConcept {
  artifact: "prd" | "epic" | "task" | "issue-link"
  /** Short title, e.g. "PRD — the requirement". */
  title: string
  /** Beginner-first explanation filled with the map's real numbers. */
  body: string
}

/** The teaching content for a populated delivery map. */
export interface CcpmTeaching {
  kind: "map"
  /** A one-line summary of the delivery story, with real counts. */
  headline: string
  /** Per-artifact-type explanations. */
  concepts: CcpmConcept[]
  /** The professional value a hiring manager cares about. */
  professionalValue: string[]
}

/** The educational content for the "no spec-driven workflow" state (US-4). */
export interface CcpmDegradationTeaching {
  kind: "absent"
  title: string
  body: string
  /** Echoed from detection — what was searched for. */
  searched: string[]
  /** The M2 Golden Path the UI links to. */
  goldenPath: { label: string; slug: string }
}

export type CcpmTeachingResult = CcpmTeaching | CcpmDegradationTeaching

/** The M2 Golden Path the degradation state points at (see seed-data.ts). */
const CCPM_GOLDEN_PATH = {
  label: "Agentic CCPM Workflow",
  slug: "agentic-ccpm-workflow",
} as const

/** "1 task" / "3 tasks" — regular pluralization (PRD/epic/task all add "s"). */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}

/** Flatten every task node across PRD-nested and orphan epics. */
function allEpics(map: Extract<CcpmDeliveryMap, { kind: "map" }>): CcpmEpicNode[] {
  return [...map.prds.flatMap((p) => p.epics), ...map.orphanEpics]
}

function allTasks(
  map: Extract<CcpmDeliveryMap, { kind: "map" }>,
): CcpmTaskNode[] {
  return allEpics(map).flatMap((e) => e.tasks)
}

/**
 * Build the teaching content for a delivery map, or the educational degradation
 * content when no CCPM workflow was detected.
 *
 * Pure and deterministic: the map case is parameterized entirely by the map's
 * stats + structure (counts, dependencies, status), so every explanation
 * references the actual artifacts in front of the user (US-2). No network, no
 * model call.
 */
export function buildCcpmTeaching(map: CcpmDeliveryMap): CcpmTeachingResult {
  if (map.kind === "absent") {
    return {
      kind: "absent",
      title: "No spec-driven workflow detected",
      body:
        "We looked for CCPM artifacts and didn't find any — that's normal, most " +
        "AI-assisted projects don't use one yet. A spec-driven workflow writes the " +
        "requirement (a PRD) and the plan (an epic broken into tasks) into files " +
        "before coding, then links each task to a GitHub issue and the pull request " +
        "that closed it. The payoff in an interview: you can explain HOW the project " +
        "was delivered — how work was scoped, tracked, and reviewed — not just what " +
        "it does. That's exactly the “how did you manage this work?” question " +
        "hiring managers ask.",
      searched: map.searched,
      goldenPath: { ...CCPM_GOLDEN_PATH },
    }
  }

  const { stats } = map
  const tasks = allTasks(map)
  const independentTaskCount = tasks.filter(
    (t) => t.dependsOn.length === 0,
  ).length

  const headline =
    `This project was delivered through a spec-driven workflow: ` +
    `${count(stats.prdCount, "requirement doc")} → ` +
    `${count(stats.epicCount, "epic")} → ` +
    `${count(stats.taskCount, "task")}, ` +
    `${stats.syncedTaskCount} tracked as GitHub issues.`

  const archivedNote =
    stats.archivedEpicCount > 0
      ? ` ${count(stats.archivedEpicCount, "epic")} ${stats.archivedEpicCount === 1 ? "is" : "are"} archived — completed and filed away.`
      : ""

  const concepts: CcpmConcept[] = [
    {
      artifact: "prd",
      title: "PRD — the requirement",
      body:
        `A PRD (Product Requirements Document) captures WHAT to build and WHY ` +
        `before any code is written — the problem, the users, and what “done” ` +
        `means. This project has ${count(stats.prdCount, "PRD")}; ` +
        `each is the root of a traceability chain.`,
    },
    {
      artifact: "epic",
      title: "Epic — the plan",
      body:
        `Each PRD becomes a technical epic that decomposes the requirement into ` +
        `bounded tasks — this is where the architecture decisions and the task ` +
        `breakdown live. This project has ${count(stats.epicCount, "epic")}.` +
        archivedNote,
    },
    {
      artifact: "task",
      title: "Task — the unit of work",
      body:
        `${count(stats.taskCount, "task")} — each a single, bounded unit of work a ` +
        `developer or AI agent completes and a human reviews. ` +
        `${independentTaskCount} of them have no dependencies, so they could be ` +
        `worked in parallel; ${stats.closedTaskCount} ` +
        `${stats.closedTaskCount === 1 ? "is" : "are"} already done.`,
    },
    {
      artifact: "issue-link",
      title: "Issue & PR — the shipped trail",
      body:
        `${stats.syncedTaskCount} of ${count(stats.taskCount, "task")} ` +
        `${stats.syncedTaskCount === 1 ? "is" : "are"} tracked as a GitHub issue; ` +
        `once shipped, each links to the pull request that closed it. That full ` +
        `chain — PRD → epic → task → issue → PR — is traceability: you can ` +
        `point at any change and trace it back to the requirement that drove it.`,
    },
  ]

  const professionalValue = [
    "Traceability: every change traces back to the requirement that drove it.",
    "Bounded work: tasks are small, reviewable units — not one giant unreviewed dump.",
    "Reviewable scope: a human approved each step, so AI work was reviewed, not blindly accepted.",
  ]

  return { kind: "map", headline, concepts, professionalValue }
}
