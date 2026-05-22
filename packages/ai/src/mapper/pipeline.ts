// The LangGraph mapping pipeline for the M6 Project Logic Mapper
// (project-logic-mapper epic, Issue #105).
//
// `runMappingPipeline` is the M6 critical path: a LangGraph (`@langchain/
// langgraph`) state-graph workflow that orchestrates the multi-step mapping of
// an imported repository snapshot and produces ONE typed structure carrying all
// seven outputs — architecture overview, key-file map, request/data flow, state
// flow, AI-call flow, debug path, and the Mermaid diagram source.
//
// The state graph sequence is:
//
//   ingestion → architecture overview → key-file map → request/data flow
//   → state flow → AI-call flow → debug path → Mermaid assembly
//
// Deterministic vs. agentic nodes (Issue #105 acceptance criterion):
//   - `ingestion` and `mermaid` are DETERMINISTIC — pure functions over the
//     ingested structure, no model call.
//   - the six section nodes are AGENTIC — each retrieves the code relevant to
//     its step through the RAG layer (#104) and reasons over it with a bounded
//     chat-model call reached via LangChain's Anthropic integration (#105's
//     model seam, `./model`).
//
// The pipeline consumes the deterministic ingestion structure (#103) and never
// stuffs the whole repository into model context — token use stays bounded by
// retrieval (#104). Every cited file path is verified against the snapshot, so
// a generated map only ever references real files. A non-AI project yields an
// explicit "not applicable" AI-call flow rather than failing; a node that
// produces nothing degrades gracefully and the run still completes.
//
// The output structure is `ProjectMapContent`-shaped (the #106 persistence
// contract), so the pipeline output and the `project_maps` data-access layer
// agree on one shape. LangChain/LangGraph stay confined to this package per
// ADR 0005.

import { Annotation, END, START, StateGraph } from "@langchain/langgraph"

import type { IngestedProject } from "./ingest-types"
import type { MapperModel } from "./model"
import {
  buildSnapshotRetriever,
  type SnapshotRetrieverBundle,
} from "./rag"
import type { SnapshotFile } from "./loader"

// ---------------------------------------------------------------------------
// Output types — aligned with the `project_maps` shape (#106)
// ---------------------------------------------------------------------------

/** One section of the architecture overview — a layer/area and what it does. */
export interface ArchitectureSection {
  /** The architectural layer or area, e.g. `Frontend`, `Data layer`. */
  title: string
  /** What this layer does in the project, in plain language. */
  detail: string
}

/** A file worth knowing to navigate the project, and the role it plays. */
export interface ProjectMapFile {
  /** Repo-relative path within the snapshot, e.g. `apps/web/app/page.tsx`. */
  path: string
  /** The role this file plays in the project. */
  role: string
}

/** One ordered step of a traced flow (request/data, state, or AI-call). */
export interface FlowStep {
  /** One-based position of this step in the flow. */
  order: number
  /** What happens at this step, in plain language. */
  description: string
  /** Repo-relative path where this step is implemented, if any. */
  path?: string
}

/** One step of the debug path — where to look first when something breaks. */
export interface DebugPathStep {
  /** Where to look — a repo-relative path or a named area of the project. */
  location: string
  /** What kind of failure this step helps diagnose, and what to check. */
  guidance: string
}

/**
 * The single typed structure the mapping pipeline produces — all seven outputs.
 *
 * Structurally identical to `@workspace/db`'s `ProjectMapContent` (the #106
 * persistence contract): the pipeline output is assignable straight into
 * `saveProjectMap`, so the producer and the store agree on one shape without a
 * cross-package type import (which would be a dependency cycle — `@workspace/db`
 * already depends on `@workspace/ai`).
 */
export interface ProjectMapContent {
  /** The architecture overview — one entry per layer/area of the project. */
  architectureOverview: ArchitectureSection[]
  /** The key-file map — files worth knowing and the role each plays. */
  keyFileMap: ProjectMapFile[]
  /** The request/data flow, traced step by step. */
  requestDataFlow: FlowStep[]
  /** The state flow, traced step by step. */
  stateFlow: FlowStep[]
  /** The AI-call flow, traced step by step. */
  aiCallFlow: FlowStep[]
  /** The Mermaid diagram source rendering the project's structure. */
  mermaidDiagram: string
  /** The debug path — where to start when something breaks. */
  debugPath: DebugPathStep[]
}

/** The complete result of {@link runMappingPipeline}. */
export interface MappingPipelineResult {
  /** The single typed map structure — all seven outputs. */
  content: ProjectMapContent
  /**
   * Graceful-degradation notes — a non-AI project, an empty snapshot, a node
   * that returned nothing, file references that were dropped because they did
   * not resolve to a real snapshot path. Empty when the run was clean.
   */
  notes: string[]
  /**
   * `true` when the snapshot has at least one detected AI/LLM integration, so
   * the AI-call flow was actually mapped. `false` → the AI-call flow is the
   * explicit "not applicable" placeholder.
   */
  hasAiIntegration: boolean
}

// ---------------------------------------------------------------------------
// Pipeline input + options
// ---------------------------------------------------------------------------

/** Input for {@link runMappingPipeline}. */
export interface MappingPipelineInput {
  /** The deterministic ingestion structure for the snapshot (Issue #103). */
  ingestion: IngestedProject
  /**
   * The snapshot's key files — their content grounds retrieval. The #103
   * ingestion input's `files` (`IngestionFile[]`) is assignable here.
   */
  files: readonly SnapshotFile[]
  /**
   * The chat model the agentic nodes call. Injectable so tests pass a scripted
   * model and CI makes no live API calls; omitted in the app → a real model
   * built on LangChain's Anthropic integration (`createAnthropicMapperModel`).
   */
  model: MapperModel
}

/** Output-token cap for an agentic node's bounded call. */
const NODE_MAX_TOKENS = 2048

// ---------------------------------------------------------------------------
// AI-integration detection — drives the "not applicable" AI-call flow
// ---------------------------------------------------------------------------

/**
 * npm packages whose presence marks a project as having an AI/LLM integration.
 * Matched against the snapshot's external dependencies — a project importing
 * none of these has its AI-call flow reported as "not applicable" rather than
 * the pipeline guessing or failing (Issue #105 acceptance criterion).
 */
const AI_PACKAGE_PATTERNS: readonly RegExp[] = [
  /^@anthropic-ai\//,
  /^@langchain\//,
  /^langchain$/,
  /^openai$/,
  /^@openai\//,
  /^ai$/,
  /^@ai-sdk\//,
  /^@google\/(generative-ai|genai)$/,
  /^@mistralai\//,
  /^cohere-ai$/,
  /^replicate$/,
  /^ollama$/,
  /^@huggingface\//,
  /^groq-sdk$/,
]

/** The `@workspace/ai` workspace package — the project's own AI foundation. */
const WORKSPACE_AI_PACKAGE = "@workspace/ai"

/**
 * Decide whether a snapshot has an AI/LLM integration worth mapping, from its
 * ingested external dependencies. Pure and deterministic.
 */
export function detectAiIntegration(ingestion: IngestedProject): boolean {
  return ingestion.externalDependencies.some((dep) => {
    if (dep.name === WORKSPACE_AI_PACKAGE) return true
    return AI_PACKAGE_PATTERNS.some((pattern) => pattern.test(dep.name))
  })
}

// ---------------------------------------------------------------------------
// Retrieval grounding — bounded code context for an agentic node
// ---------------------------------------------------------------------------

/**
 * Retrieve the snapshot code relevant to a query and format it as a grounding
 * block for a node's prompt. Each chunk is labelled with its real source path,
 * so the model can only cite paths that actually exist. Token use stays bounded
 * by the retriever's `k` (#104).
 */
async function retrieveGrounding(
  retriever: SnapshotRetrieverBundle["retriever"],
  query: string,
): Promise<string> {
  const chunks = await retriever.retrieveChunks(query)
  if (chunks.length === 0) {
    return "(no matching code was retrieved for this step)"
  }
  return chunks
    .map(
      (chunk) =>
        `--- ${chunk.metadata.source} (chunk ${chunk.metadata.chunk + 1}/` +
        `${chunk.metadata.chunkCount}) ---\n${chunk.pageContent}`,
    )
    .join("\n\n")
}

/** Render the ingested file tree as an indented path listing for a prompt. */
function describeFileTree(ingestion: IngestedProject, limit = 200): string {
  const paths: string[] = []
  const walk = (node: IngestedProject["fileTree"]): void => {
    if (node.type === "file" && node.path.length > 0) paths.push(node.path)
    for (const child of node.children) walk(child)
  }
  walk(ingestion.fileTree)
  paths.sort()
  const shown = paths.slice(0, limit)
  return shown.length < paths.length
    ? `${shown.join("\n")}\n…(${paths.length - shown.length} more files)`
    : shown.join("\n")
}

/** Short, deterministic summary of the ingested structure for every prompt. */
function describeIngestion(ingestion: IngestedProject): string {
  const frameworks =
    ingestion.frameworks.length > 0
      ? ingestion.frameworks.map((f) => f.name).join(", ")
      : "(none detected)"
  const entries =
    ingestion.entryPoints.length > 0
      ? ingestion.entryPoints.map((e) => `${e.path} (${e.reason})`).join("; ")
      : "(none detected)"
  const deps =
    ingestion.externalDependencies.length > 0
      ? ingestion.externalDependencies
          .slice(0, 30)
          .map((d) => d.name)
          .join(", ")
      : "(none)"
  return (
    `Repository: ${ingestion.repo.owner}/${ingestion.repo.repo} ` +
    `(ref: ${ingestion.repo.ref})\n` +
    `Detected frameworks: ${frameworks}\n` +
    `Entry points: ${entries}\n` +
    `Key external dependencies: ${deps}\n` +
    `Modules in dependency graph: ${ingestion.graph.modules.length}, ` +
    `import edges: ${ingestion.graph.edges.length}`
  )
}

// ---------------------------------------------------------------------------
// Model output parsing — defensive, never throws on a malformed reply
// ---------------------------------------------------------------------------

/**
 * Extract a JSON value from a model reply. The model is asked for raw JSON, but
 * a reply may still be wrapped in a ```json fence or have leading prose — this
 * finds the first balanced `{...}` or `[...]` and parses it. Returns `null`
 * when nothing parseable is found, so a node degrades gracefully.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  // Strip a Markdown code fence if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1]!.trim() : trimmed
  // Find the first JSON object or array and the matching closing bracket.
  const start = body.search(/[[{]/)
  if (start === -1) return null
  const open = body[start]!
  const close = open === "{" ? "}" : "]"
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i]!
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** A non-empty trimmed string, or `null`. */
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null
}

/** A finite non-negative integer, or `null`. */
function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null
}

/** The records inside a model reply's array — `[]` for a non-array reply. */
function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null,
  )
}

// ---------------------------------------------------------------------------
// LangGraph pipeline state
// ---------------------------------------------------------------------------

/**
 * The LangGraph state annotation threaded through the pipeline nodes.
 *
 * Each channel keeps last-write semantics — all a strictly sequential graph
 * needs. The first block is the immutable run context (ingestion, retriever,
 * model, the known-file set); the rest are the section outputs each node owns.
 */
const PipelineAnnotation = Annotation.Root({
  ingestion: Annotation<IngestedProject>,
  retriever: Annotation<SnapshotRetrieverBundle["retriever"]>,
  model: Annotation<MapperModel>,
  /** Set of real snapshot file paths — every cited path is checked against it. */
  knownFiles: Annotation<Set<string>>,
  hasAiIntegration: Annotation<boolean>,
  architectureOverview: Annotation<ArchitectureSection[]>,
  keyFileMap: Annotation<ProjectMapFile[]>,
  requestDataFlow: Annotation<FlowStep[]>,
  stateFlow: Annotation<FlowStep[]>,
  aiCallFlow: Annotation<FlowStep[]>,
  debugPath: Annotation<DebugPathStep[]>,
  mermaidDiagram: Annotation<string>,
  notes: Annotation<string[]>,
})

/** The mutable state threaded through the LangGraph nodes. */
type PipelineState = typeof PipelineAnnotation.State

/** Coerce a model array reply into validated, path-checked {@link FlowStep}s. */
function parseFlowSteps(
  value: unknown,
  knownFiles: ReadonlySet<string>,
  notes: string[],
  flowLabel: string,
): FlowStep[] {
  const steps: FlowStep[] = []
  for (const [index, record] of records(value).entries()) {
    const description = str(record.description)
    if (!description) continue
    const order = int(record.order) ?? index + 1
    const rawPath = str(record.path)
    let path: string | undefined
    if (rawPath) {
      if (knownFiles.has(rawPath)) {
        path = rawPath
      } else {
        notes.push(
          `${flowLabel}: dropped path "${rawPath}" — not a real snapshot file.`,
        )
      }
    }
    steps.push({
      order,
      description,
      ...(path !== undefined ? { path } : {}),
    })
  }
  // Renumber sequentially so the persisted flow is always 1..n in step order.
  return steps
    .sort((a, b) => a.order - b.order)
    .map((step, index) => ({ ...step, order: index + 1 }))
}

// ---------------------------------------------------------------------------
// Node implementations
// ---------------------------------------------------------------------------

const ARCHITECTURE_SYSTEM =
  "You are a coding coach helping a job-seeking junior developer understand " +
  "and defend a project they built with heavy AI assistance. Describe the " +
  "project's architecture as a small set of layers/areas, grounded in its " +
  "actual files — never generic tutorial text. Reply with ONLY a JSON array; " +
  "each element is an object {\"title\": string, \"detail\": string}. " +
  "`title` names a layer/area (e.g. Frontend, Data layer, AI integration); " +
  "`detail` explains in plain language what that layer does in THIS project."

/** Agentic node: the architecture overview. */
async function architectureNode(
  state: PipelineState,
): Promise<Partial<PipelineState>> {
  const grounding = await retrieveGrounding(
    state.retriever,
    "application architecture layers entry point routing data layer config",
  )
  const reply = await state.model.invoke({
    system: ARCHITECTURE_SYSTEM,
    maxTokens: NODE_MAX_TOKENS,
    prompt:
      `${describeIngestion(state.ingestion)}\n\n` +
      `Project file tree:\n${describeFileTree(state.ingestion)}\n\n` +
      `Relevant code:\n${grounding}\n\n` +
      `List the architecture layers/areas of this project as a JSON array.`,
  })
  const notes = [...state.notes]
  const sections: ArchitectureSection[] = []
  for (const record of records(extractJson(reply))) {
    const title = str(record.title)
    const detail = str(record.detail)
    if (title && detail) sections.push({ title, detail })
  }
  if (sections.length === 0) {
    notes.push(
      "Architecture overview: the model returned no usable sections.",
    )
  }
  return { architectureOverview: sections, notes }
}

const KEY_FILE_SYSTEM =
  "You are a coding coach. Identify the files a junior developer must know to " +
  "navigate and explain this project. Reply with ONLY a JSON array; each " +
  "element is {\"path\": string, \"role\": string}. `path` MUST be a real " +
  "repo-relative path copied exactly from the provided file tree — never " +
  "invent a path. `role` explains, in plain language, what that file does."

/** Agentic node: the key-file map. */
async function keyFileNode(
  state: PipelineState,
): Promise<Partial<PipelineState>> {
  const grounding = await retrieveGrounding(
    state.retriever,
    "entry point main configuration schema route component server action",
  )
  const reply = await state.model.invoke({
    system: KEY_FILE_SYSTEM,
    maxTokens: NODE_MAX_TOKENS,
    prompt:
      `${describeIngestion(state.ingestion)}\n\n` +
      `Project file tree (every path here is real — cite only these):\n` +
      `${describeFileTree(state.ingestion)}\n\n` +
      `Relevant code:\n${grounding}\n\n` +
      `List the key files of this project as a JSON array.`,
  })
  const notes = [...state.notes]
  const files: ProjectMapFile[] = []
  const seen = new Set<string>()
  for (const record of records(extractJson(reply))) {
    const path = str(record.path)
    const role = str(record.role)
    if (!path || !role) continue
    if (!state.knownFiles.has(path)) {
      notes.push(
        `Key-file map: dropped "${path}" — not a real snapshot file.`,
      )
      continue
    }
    if (seen.has(path)) continue
    seen.add(path)
    files.push({ path, role })
  }
  if (files.length === 0) {
    notes.push("Key-file map: the model returned no resolvable files.")
  }
  return { keyFileMap: files, notes }
}

const FLOW_SYSTEM =
  "You are a coding coach tracing how a project works, step by step, so a " +
  "junior developer can walk an interviewer through it. Reply with ONLY a " +
  "JSON array of ordered steps; each element is {\"order\": number, " +
  "\"description\": string, \"path\"?: string}. `order` is 1-based. " +
  "`description` is plain language. `path`, when given, MUST be a real " +
  "repo-relative path from the provided file tree — omit it rather than " +
  "guessing."

/** Agentic node: the request/data flow. */
async function requestFlowNode(
  state: PipelineState,
): Promise<Partial<PipelineState>> {
  const grounding = await retrieveGrounding(
    state.retriever,
    "request handler route api server action fetch response data flow",
  )
  const reply = await state.model.invoke({
    system: FLOW_SYSTEM,
    maxTokens: NODE_MAX_TOKENS,
    prompt:
      `${describeIngestion(state.ingestion)}\n\n` +
      `Project file tree:\n${describeFileTree(state.ingestion)}\n\n` +
      `Relevant code:\n${grounding}\n\n` +
      `Trace the request / data flow of this project: how a request enters, ` +
      `is handled, and how data flows back. Reply as a JSON array of steps.`,
  })
  const notes = [...state.notes]
  const steps = parseFlowSteps(
    extractJson(reply),
    state.knownFiles,
    notes,
    "Request/data flow",
  )
  if (steps.length === 0) {
    notes.push("Request/data flow: the model returned no usable steps.")
  }
  return { requestDataFlow: steps, notes }
}

/** Agentic node: the state flow. */
async function stateFlowNode(
  state: PipelineState,
): Promise<Partial<PipelineState>> {
  const grounding = await retrieveGrounding(
    state.retriever,
    "state store context useState reducer hook session client state management",
  )
  const reply = await state.model.invoke({
    system: FLOW_SYSTEM,
    maxTokens: NODE_MAX_TOKENS,
    prompt:
      `${describeIngestion(state.ingestion)}\n\n` +
      `Project file tree:\n${describeFileTree(state.ingestion)}\n\n` +
      `Relevant code:\n${grounding}\n\n` +
      `Trace how application state is created, updated, and read in this ` +
      `project. Reply as a JSON array of steps.`,
  })
  const notes = [...state.notes]
  const steps = parseFlowSteps(
    extractJson(reply),
    state.knownFiles,
    notes,
    "State flow",
  )
  if (steps.length === 0) {
    notes.push("State flow: the model returned no usable steps.")
  }
  return { stateFlow: steps, notes }
}

/** The explicit "not applicable" AI-call flow for a project with no AI. */
function notApplicableAiFlow(): FlowStep[] {
  return [
    {
      order: 1,
      description:
        "Not applicable — this project has no detected AI/LLM " +
        "integration, so there is no AI-call flow to trace.",
    },
  ]
}

/**
 * Agentic node: the AI-call flow.
 *
 * When the snapshot has no detected AI integration this node does NOT call the
 * model — it returns an explicit "not applicable" flow, so a non-AI project
 * still produces a complete, valid map (Issue #105 acceptance criterion).
 */
async function aiFlowNode(
  state: PipelineState,
): Promise<Partial<PipelineState>> {
  if (!state.hasAiIntegration) {
    return {
      aiCallFlow: notApplicableAiFlow(),
      notes: [
        ...state.notes,
        "AI-call flow: not applicable — no AI/LLM integration detected.",
      ],
    }
  }
  const grounding = await retrieveGrounding(
    state.retriever,
    "ai llm model prompt completion anthropic openai langchain embedding agent",
  )
  const reply = await state.model.invoke({
    system: FLOW_SYSTEM,
    maxTokens: NODE_MAX_TOKENS,
    prompt:
      `${describeIngestion(state.ingestion)}\n\n` +
      `Project file tree:\n${describeFileTree(state.ingestion)}\n\n` +
      `Relevant code:\n${grounding}\n\n` +
      `Trace how this project calls an AI / LLM: where a prompt is built, ` +
      `where the model is invoked, and how the response is used. Reply as a ` +
      `JSON array of steps.`,
  })
  const notes = [...state.notes]
  const steps = parseFlowSteps(
    extractJson(reply),
    state.knownFiles,
    notes,
    "AI-call flow",
  )
  if (steps.length === 0) {
    // The dependencies say there IS an AI integration but the model traced
    // nothing — fall back to the explicit placeholder rather than an empty flow.
    notes.push(
      "AI-call flow: an AI dependency was detected but no call flow could " +
        "be traced; reporting it as not applicable.",
    )
    return { aiCallFlow: notApplicableAiFlow(), notes }
  }
  return { aiCallFlow: steps, notes }
}

const DEBUG_SYSTEM =
  "You are a coding coach. Produce a debug path: an ordered list of places a " +
  "junior developer should look first when something breaks in this project. " +
  "Reply with ONLY a JSON array; each element is {\"location\": string, " +
  "\"guidance\": string}. `location` is a real repo-relative path OR a named " +
  "area of the project. `guidance` says what failures that location helps " +
  "diagnose and what to check."

/** Agentic node: the debug path. */
async function debugPathNode(
  state: PipelineState,
): Promise<Partial<PipelineState>> {
  const grounding = await retrieveGrounding(
    state.retriever,
    "error handling logging try catch entry point config environment",
  )
  const reply = await state.model.invoke({
    system: DEBUG_SYSTEM,
    maxTokens: NODE_MAX_TOKENS,
    prompt:
      `${describeIngestion(state.ingestion)}\n\n` +
      `Project file tree:\n${describeFileTree(state.ingestion)}\n\n` +
      `Relevant code:\n${grounding}\n\n` +
      `Produce the debug path for this project as a JSON array.`,
  })
  const notes = [...state.notes]
  const steps: DebugPathStep[] = []
  for (const record of records(extractJson(reply))) {
    const location = str(record.location)
    const guidance = str(record.guidance)
    if (!location || !guidance) continue
    // A path-shaped location that does not resolve is informational, not a
    // failure (mirrors `checkProjectMapFileReferences` in #106) — but note it.
    if (location.includes("/") && !state.knownFiles.has(location)) {
      notes.push(
        `Debug path: location "${location}" looks like a path but does ` +
          `not resolve to a snapshot file.`,
      )
    }
    steps.push({ location, guidance })
  }
  if (steps.length === 0) {
    notes.push("Debug path: the model returned no usable steps.")
  }
  return { debugPath: steps, notes }
}

// ---------------------------------------------------------------------------
// Mermaid assembly — deterministic node
// ---------------------------------------------------------------------------

/** Escape a label for safe use inside a Mermaid node `["..."]`. */
function mermaidLabel(text: string): string {
  return text.replace(/"/g, "'").replace(/[\r\n]+/g, " ").trim()
}

/** Stable Mermaid node id for an index, e.g. `n0`, `n1`. */
function nodeId(prefix: string, index: number): string {
  return `${prefix}${index}`
}

/**
 * Deterministic node: assemble the Mermaid diagram source from the sections the
 * agentic nodes produced.
 *
 * Every diagram node is derived from a real key file or a real flow step, so a
 * Mermaid node always corresponds to a real file/module or a mapped step — the
 * diagram never invents structure (Issue #105 acceptance criterion). When the
 * upstream sections are empty the diagram degrades to a single explanatory
 * node rather than producing invalid Mermaid.
 */
export function assembleMermaid(content: {
  keyFileMap: ProjectMapFile[]
  requestDataFlow: FlowStep[]
}): string {
  const lines: string[] = ["flowchart TD"]

  const hasFiles = content.keyFileMap.length > 0
  const hasFlow = content.requestDataFlow.length > 0

  if (!hasFiles && !hasFlow) {
    lines.push(
      `  empty["No structure could be mapped for this snapshot"]`,
    )
    return lines.join("\n")
  }

  if (hasFlow) {
    lines.push("  subgraph Request_Data_Flow")
    const flowIds = content.requestDataFlow.map((step, index) => {
      const id = nodeId("f", index)
      lines.push(`    ${id}["${mermaidLabel(step.description)}"]`)
      return id
    })
    lines.push("  end")
    for (let i = 0; i + 1 < flowIds.length; i += 1) {
      lines.push(`  ${flowIds[i]} --> ${flowIds[i + 1]}`)
    }
  }

  if (hasFiles) {
    lines.push("  subgraph Key_Files")
    content.keyFileMap.forEach((file, index) => {
      const id = nodeId("k", index)
      lines.push(`    ${id}["${mermaidLabel(file.path)}"]`)
    })
    lines.push("  end")
  }

  return lines.join("\n")
}

/** Deterministic node: build the Mermaid diagram into pipeline state. */
function mermaidNode(state: PipelineState): Partial<PipelineState> {
  return {
    mermaidDiagram: assembleMermaid({
      keyFileMap: state.keyFileMap,
      requestDataFlow: state.requestDataFlow,
    }),
  }
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/**
 * Build (and compile) the LangGraph state graph for the mapping pipeline.
 *
 * The graph is the explicit, inspectable orchestration of the pipeline: nodes
 * for ingestion handoff, the six section steps, and Mermaid assembly, wired in
 * the fixed sequence Issue #105 specifies. Exposed for tests that assert on the
 * graph shape; `runMappingPipeline` is the normal entry point.
 */
export function buildMappingGraph() {
  const graph = new StateGraph(PipelineAnnotation)
    // `ingestionHandoff` is the deterministic handoff node: the ingested
    // structure and retriever are already in the initial state, so it is a
    // pass-through that makes the "ingestion" step explicit in the graph. (The
    // node name differs from the `ingestion` state channel — LangGraph forbids
    // a node and a channel sharing a name.)
    // Node names are suffixed `Step` so none collides with a state channel —
    // LangGraph forbids a node and a channel sharing a name.
    .addNode("ingestionStep", () => ({}))
    .addNode("architectureStep", architectureNode)
    .addNode("keyFilesStep", keyFileNode)
    .addNode("requestFlowStep", requestFlowNode)
    .addNode("stateFlowStep", stateFlowNode)
    .addNode("aiFlowStep", aiFlowNode)
    .addNode("debugPathStep", debugPathNode)
    .addNode("mermaidStep", mermaidNode)
    .addEdge(START, "ingestionStep")
    .addEdge("ingestionStep", "architectureStep")
    .addEdge("architectureStep", "keyFilesStep")
    .addEdge("keyFilesStep", "requestFlowStep")
    .addEdge("requestFlowStep", "stateFlowStep")
    .addEdge("stateFlowStep", "aiFlowStep")
    .addEdge("aiFlowStep", "debugPathStep")
    .addEdge("debugPathStep", "mermaidStep")
    .addEdge("mermaidStep", END)

  return graph.compile()
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Collect every real file path in the ingested file tree. */
function collectKnownFiles(ingestion: IngestedProject): Set<string> {
  const paths = new Set<string>()
  const walk = (node: IngestedProject["fileTree"]): void => {
    if (node.type === "file" && node.path.length > 0) paths.add(node.path)
    for (const child of node.children) walk(child)
  }
  walk(ingestion.fileTree)
  return paths
}

/**
 * Run the M6 mapping pipeline for an ingested repository snapshot (Issue #105).
 *
 * Builds the RAG retriever over the snapshot's files (#104), then runs the
 * LangGraph state graph: the deterministic ingestion handoff, the six agentic
 * section nodes — each grounded in retrieved code and a bounded chat-model call
 * — and the deterministic Mermaid assembly. The result is the single typed
 * {@link ProjectMapContent} structure plus graceful-degradation notes.
 *
 * Token use stays bounded: nodes reason over retrieved chunks, never the whole
 * repository. Every cited file path is verified against the snapshot — an
 * unresolvable path is dropped and noted, so the map only references real
 * files. A non-AI project yields an explicit "not applicable" AI-call flow; a
 * node that produces nothing degrades gracefully and the run still completes.
 *
 * @param input - the ingested structure (#103), the snapshot files, and the
 *   chat model. In tests the model is a scripted fake, so the call makes no
 *   live API request.
 */
export async function runMappingPipeline(
  input: MappingPipelineInput,
): Promise<MappingPipelineResult> {
  const { ingestion, files, model } = input

  const { retriever } = buildSnapshotRetriever(files)
  const knownFiles = collectKnownFiles(ingestion)
  const hasAiIntegration = detectAiIntegration(ingestion)

  const startNotes: string[] = []
  if (files.length === 0) {
    startNotes.push(
      "Snapshot has no key files — sections are mapped from the file tree " +
        "and dependency graph only, with no retrieved code grounding.",
    )
  }

  const graph = buildMappingGraph()
  const finalState = (await graph.invoke({
    ingestion,
    retriever,
    model,
    knownFiles,
    hasAiIntegration,
    architectureOverview: [],
    keyFileMap: [],
    requestDataFlow: [],
    stateFlow: [],
    aiCallFlow: [],
    debugPath: [],
    mermaidDiagram: "",
    notes: startNotes,
  })) as PipelineState

  const content: ProjectMapContent = {
    architectureOverview: finalState.architectureOverview,
    keyFileMap: finalState.keyFileMap,
    requestDataFlow: finalState.requestDataFlow,
    stateFlow: finalState.stateFlow,
    aiCallFlow: finalState.aiCallFlow,
    mermaidDiagram: finalState.mermaidDiagram,
    debugPath: finalState.debugPath,
  }

  return {
    content,
    notes: finalState.notes,
    hasAiIntegration,
  }
}
