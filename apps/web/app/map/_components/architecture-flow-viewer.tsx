"use client"

// Architecture Flow Viewer — the flow-diagram component of the Project Map
// page (page spec `docs/design/architecture-flow-viewer.md`). A Client
// Component island: it presents the three project flows as one-flow-at-a-time
// tabs and renders the pipeline's Mermaid source client-side.
//
// Reconciled against the real `@workspace/db` / `@workspace/ai` types (page
// spec §5 directs task #108 to do this). The real pipeline emits the three
// flows as `FlowStep[]` arrays (`{ order, description, path? }`) plus ONE
// shared `mermaidDiagram` string covering the request/data flow + key files —
// not a per-flow `Flow` object with its own `summary` / `mermaid`. So: the
// single client-rendered Mermaid diagram is shown once above the tabs, and
// each tab is the flow's ordered step list. The AI-call flow's "not
// applicable" state is the pipeline's explicit single-step placeholder
// (`detectAiIntegration` false → one step whose text begins "Not applicable").

import { useState } from "react"

import type { ProjectMapView } from "@/lib/project-mapper"

import { IconRoute } from "./chrome"
import { MermaidDiagram } from "./mermaid-diagram"

type FlowStep = ProjectMapView["requestDataFlow"][number]

interface FlowTab {
  id: string
  label: string
  purpose: string
  steps: FlowStep[]
}

/** Detect the pipeline's explicit "not applicable" AI-call-flow placeholder. */
function isNotApplicable(steps: FlowStep[]): boolean {
  return (
    steps.length === 1 &&
    steps[0]!.description.trim().toLowerCase().startsWith("not applicable")
  )
}

/** One flow's ordered step list — the authoritative, accessible representation. */
function FlowSteps({ steps }: { steps: FlowStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="flow-empty">
        No clear ordered path was found for this flow.
      </p>
    )
  }
  return (
    <ol className="flow-steps">
      {steps.map((step, i) => (
        <li className="flow-step" key={`${step.order}-${i}`}>
          <span className="flow-step-num" aria-hidden="true">
            {step.order}
          </span>
          <div>
            <span className="flow-step-desc">{step.description}</span>
            {step.path && (
              <code className="flow-step-path">{step.path}</code>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

/**
 * Render the request/data, state, and AI-call flows as tabbed panels, with the
 * pipeline's Mermaid diagram rendered client-side above them.
 *
 * @param mermaidDiagram - the pipeline's Mermaid diagram source (Output 6).
 * @param requestDataFlow - the request/data flow steps (Output 3).
 * @param stateFlow - the state flow steps (Output 4).
 * @param aiCallFlow - the AI-call flow steps (Output 5).
 */
export function ArchitectureFlowViewer({
  mermaidDiagram,
  requestDataFlow,
  stateFlow,
  aiCallFlow,
}: {
  mermaidDiagram: string
  requestDataFlow: FlowStep[]
  stateFlow: FlowStep[]
  aiCallFlow: FlowStep[]
}) {
  const tabs: FlowTab[] = [
    {
      id: "request",
      label: "Request / data flow",
      purpose:
        "How a request travels from the entry point to the core output.",
      steps: requestDataFlow,
    },
    {
      id: "state",
      label: "State flow",
      purpose: "Where state is created, updated, and read in the project.",
      steps: stateFlow,
    },
    {
      id: "ai",
      label: "AI-call flow",
      purpose: "Where the project builds a prompt and calls an AI / LLM.",
      steps: aiCallFlow,
    },
  ]
  const [active, setActive] = useState(0)
  const current = tabs[active]!
  const aiNotApplicable = isNotApplicable(aiCallFlow)

  return (
    <div>
      <MermaidDiagram
        source={mermaidDiagram}
        ariaLabel="Project flow diagram — request/data flow and key files"
      />

      <div className="flow-tabs" role="tablist" aria-label="Project flows">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`flowtab-${tab.id}`}
            aria-selected={i === active}
            aria-controls={`flowpanel-${tab.id}`}
            tabIndex={i === active ? 0 : -1}
            className="flow-tab"
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="flow-panel"
        role="tabpanel"
        id={`flowpanel-${current.id}`}
        aria-labelledby={`flowtab-${current.id}`}
      >
        <h3>{current.label}</h3>
        <p className="flow-purpose">{current.purpose}</p>

        {current.id === "ai" && aiNotApplicable ? (
          <div className="flow-na">
            <h4>Not applicable for this project</h4>
            <p>
              <IconRoute size={13} /> This project has no detected AI or LLM
              integration, so there is no AI-call flow to trace. That is a
              correct result — not every project talks to a model.
            </p>
          </div>
        ) : (
          <FlowSteps steps={current.steps} />
        )}
      </div>
    </div>
  )
}
