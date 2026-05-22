// Tests for the M6 LangGraph mapping pipeline (Issue #105).
//
// Exercises the full state graph end to end, the deterministic vs. agentic
// nodes, the seven outputs, file-reference verification, the non-AI "not
// applicable" AI-call flow, and graceful degradation on malformed model output.
//
// CI contract: every model call goes through a scripted fake model — no
// `ANTHROPIC_API_KEY`, no network, zero live calls. This mirrors how the M5
// stack-explanation call and #112's review call mock the model with
// `@workspace/ai/testing`; the mapping pipeline reaches Claude through a
// LangChain chat-model seam (`./model`) instead of the raw transport, so the
// fake here implements that seam.

import { describe, expect, it } from "vitest"

import type { IngestedProject } from "./ingest-types"
import type { SnapshotFile } from "./loader"
import type { MapperModel, MapperModelRequest } from "./model"
import {
  assembleMermaid,
  buildMappingGraph,
  detectAiIntegration,
  extractJson,
  runMappingPipeline,
  type FlowStep,
} from "./pipeline"

// ---------------------------------------------------------------------------
// A scripted fake model — the CI-safe seam, mirroring `createMockTransport`.
// ---------------------------------------------------------------------------

/** A {@link MapperModel} that serves scripted replies and records its calls. */
interface ScriptedModel extends MapperModel {
  /** Every request made through this model, oldest first. */
  readonly calls: ReadonlyArray<MapperModelRequest>
}

/**
 * Build a scripted {@link MapperModel}. Replies are consumed in order; once
 * exhausted the last reply repeats. `throws` makes every call reject.
 */
function createScriptedModel(options?: {
  replies?: string[]
  throws?: unknown
}): ScriptedModel {
  const replies = options?.replies ?? [""]
  const calls: MapperModelRequest[] = []
  let index = 0
  return {
    calls,
    invoke(request) {
      calls.push(request)
      if (options?.throws !== undefined) return Promise.reject(options.throws)
      const reply = replies[Math.min(index, replies.length - 1)] ?? ""
      index += 1
      return Promise.resolve(reply)
    },
  }
}

// ---------------------------------------------------------------------------
// Sample ingested projects + snapshot files.
// ---------------------------------------------------------------------------

/** A tiny AI-using Next.js-ish project, as the #103 ingestion would yield it. */
const aiIngestion: IngestedProject = {
  repo: { owner: "acme", repo: "coach", ref: "main", commitSha: "deadbeef" },
  fileTree: {
    path: "",
    name: "/",
    type: "directory",
    children: [
      {
        path: "apps",
        name: "apps",
        type: "directory",
        children: [
          {
            path: "apps/web/app/page.tsx",
            name: "page.tsx",
            type: "file",
            children: [],
          },
          {
            path: "apps/web/app/actions.ts",
            name: "actions.ts",
            type: "file",
            children: [],
          },
        ],
      },
      {
        path: "packages/db/schema.ts",
        name: "schema.ts",
        type: "file",
        children: [],
      },
    ],
  },
  graph: {
    modules: [
      {
        path: "apps/web/app/page.tsx",
        scanned: true,
        isEntryPoint: true,
      },
      { path: "apps/web/app/actions.ts", scanned: true, isEntryPoint: false },
    ],
    edges: [],
  },
  externalDependencies: [
    { name: "@anthropic-ai/sdk", importedBy: 1 },
    { name: "next", importedBy: 2 },
    { name: "react", importedBy: 2 },
  ],
  frameworks: [{ name: "Next.js", category: "framework" }],
  entryPoints: [{ path: "apps/web/app/page.tsx", reason: "Next.js App Router" }],
  notes: [],
}

const aiFiles: SnapshotFile[] = [
  {
    path: "apps/web/app/page.tsx",
    content:
      "export default function HomePage() {\n  return <main>Coach</main>\n}\n",
  },
  {
    path: "apps/web/app/actions.ts",
    content:
      "'use server'\n" +
      "import Anthropic from '@anthropic-ai/sdk'\n" +
      "export async function explain(prompt: string) {\n" +
      "  const client = new Anthropic()\n" +
      "  return client.messages.create({ model: 'claude', max_tokens: 100, " +
      "messages: [{ role: 'user', content: prompt }] })\n" +
      "}\n",
  },
  {
    path: "packages/db/schema.ts",
    content: "export const users = 'users table'\n",
  },
]

/** A non-AI project — no AI/LLM dependency at all. */
const plainIngestion: IngestedProject = {
  repo: { owner: "acme", repo: "blog", ref: "main", commitSha: "cafe" },
  fileTree: {
    path: "",
    name: "/",
    type: "directory",
    children: [
      { path: "src/index.ts", name: "index.ts", type: "file", children: [] },
    ],
  },
  graph: {
    modules: [{ path: "src/index.ts", scanned: true, isEntryPoint: true }],
    edges: [],
  },
  externalDependencies: [{ name: "express", importedBy: 1 }],
  frameworks: [{ name: "Express", category: "framework" }],
  entryPoints: [{ path: "src/index.ts", reason: "conventional source entry" }],
  notes: [],
}

const plainFiles: SnapshotFile[] = [
  {
    path: "src/index.ts",
    content:
      "import express from 'express'\n" +
      "const app = express()\n" +
      "app.get('/', (_req, res) => res.send('hi'))\n" +
      "app.listen(3000)\n",
  },
]

// ---------------------------------------------------------------------------
// Scripted replies for a full successful run — the six agentic nodes in order:
// architecture, keyFiles, requestFlow, stateFlow, aiFlow, debugPath.
// ---------------------------------------------------------------------------

function fullRunReplies(): string[] {
  return [
    // architecture
    JSON.stringify([
      { title: "Frontend", detail: "Next.js App Router pages in apps/web." },
      { title: "AI integration", detail: "A server action calls Claude." },
    ]),
    // keyFiles
    JSON.stringify([
      { path: "apps/web/app/page.tsx", role: "The home page component." },
      { path: "apps/web/app/actions.ts", role: "Server action calling the LLM." },
      // An invented path — must be dropped, not persisted.
      { path: "apps/web/app/ghost.ts", role: "Does not exist." },
    ]),
    // requestFlow
    JSON.stringify([
      {
        order: 1,
        description: "A request hits the home page.",
        path: "apps/web/app/page.tsx",
      },
      { order: 2, description: "The page renders and returns HTML." },
    ]),
    // stateFlow
    JSON.stringify([
      { order: 1, description: "The page is stateless server-rendered." },
    ]),
    // aiFlow
    JSON.stringify([
      {
        order: 1,
        description: "The server action builds a prompt.",
        path: "apps/web/app/actions.ts",
      },
      {
        order: 2,
        description: "It calls the Anthropic SDK and returns the message.",
        path: "apps/web/app/actions.ts",
      },
    ]),
    // debugPath
    JSON.stringify([
      {
        location: "apps/web/app/actions.ts",
        guidance: "Check here when the AI call fails.",
      },
      {
        location: "the build pipeline",
        guidance: "Check here for build errors.",
      },
    ]),
  ]
}

// ---------------------------------------------------------------------------
// extractJson
// ---------------------------------------------------------------------------

describe("extractJson", () => {
  it("parses a bare JSON array", () => {
    expect(extractJson('[{"a":1}]')).toEqual([{ a: 1 }])
  })

  it("parses JSON inside a Markdown code fence", () => {
    expect(extractJson('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }])
  })

  it("parses JSON after leading prose", () => {
    expect(extractJson('Here is the result: [{"a":1}] done')).toEqual([
      { a: 1 },
    ])
  })

  it("ignores brackets inside string values", () => {
    expect(extractJson('[{"a":"a [bracket] here"}]')).toEqual([
      { a: "a [bracket] here" },
    ])
  })

  it("returns null for a reply with no JSON", () => {
    expect(extractJson("the model produced no JSON at all")).toBeNull()
  })

  it("returns null for malformed JSON", () => {
    expect(extractJson("[{a: not valid}]")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// detectAiIntegration
// ---------------------------------------------------------------------------

describe("detectAiIntegration", () => {
  it("detects an Anthropic SDK dependency", () => {
    expect(detectAiIntegration(aiIngestion)).toBe(true)
  })

  it("returns false for a project with no AI dependency", () => {
    expect(detectAiIntegration(plainIngestion)).toBe(false)
  })

  it("detects the @workspace/ai foundation package", () => {
    const ingestion: IngestedProject = {
      ...plainIngestion,
      externalDependencies: [{ name: "@workspace/ai", importedBy: 1 }],
    }
    expect(detectAiIntegration(ingestion)).toBe(true)
  })

  it("detects a langchain dependency", () => {
    const ingestion: IngestedProject = {
      ...plainIngestion,
      externalDependencies: [{ name: "@langchain/core", importedBy: 3 }],
    }
    expect(detectAiIntegration(ingestion)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// assembleMermaid — the deterministic node
// ---------------------------------------------------------------------------

describe("assembleMermaid", () => {
  it("renders a flowchart from key files and request flow", () => {
    const diagram = assembleMermaid({
      keyFileMap: [{ path: "src/index.ts", role: "Entry point." }],
      requestDataFlow: [
        { order: 1, description: "Request enters." },
        { order: 2, description: "Response leaves." },
      ],
    })
    expect(diagram.startsWith("flowchart TD")).toBe(true)
    expect(diagram).toContain('"src/index.ts"')
    expect(diagram).toContain("f0 --> f1")
  })

  it("degrades to a single node when there is nothing to map", () => {
    const diagram = assembleMermaid({ keyFileMap: [], requestDataFlow: [] })
    expect(diagram).toContain("flowchart TD")
    expect(diagram).toContain("No structure could be mapped")
  })

  it("escapes double quotes in node labels", () => {
    const diagram = assembleMermaid({
      keyFileMap: [],
      requestDataFlow: [
        { order: 1, description: 'A step with "quotes" in it.' },
      ],
    })
    expect(diagram).not.toContain('with "quotes"')
    expect(diagram).toContain("with 'quotes'")
  })
})

// ---------------------------------------------------------------------------
// buildMappingGraph
// ---------------------------------------------------------------------------

describe("buildMappingGraph", () => {
  it("compiles a graph with every pipeline node", () => {
    const graph = buildMappingGraph()
    const nodeNames = Object.keys(graph.getGraph().nodes)
    for (const node of [
      "ingestionStep",
      "architectureStep",
      "keyFilesStep",
      "requestFlowStep",
      "stateFlowStep",
      "aiFlowStep",
      "debugPathStep",
      "mermaidStep",
    ]) {
      expect(nodeNames).toContain(node)
    }
  })
})

// ---------------------------------------------------------------------------
// runMappingPipeline — the full state graph end to end
// ---------------------------------------------------------------------------

describe("runMappingPipeline", () => {
  it("produces all seven outputs for an AI project", async () => {
    const model = createScriptedModel({ replies: fullRunReplies() })
    const result = await runMappingPipeline({
      ingestion: aiIngestion,
      files: aiFiles,
      model,
    })

    // All seven outputs are present.
    expect(result.content.architectureOverview.length).toBeGreaterThan(0)
    expect(result.content.keyFileMap.length).toBeGreaterThan(0)
    expect(result.content.requestDataFlow.length).toBeGreaterThan(0)
    expect(result.content.stateFlow.length).toBeGreaterThan(0)
    expect(result.content.aiCallFlow.length).toBeGreaterThan(0)
    expect(result.content.mermaidDiagram).toContain("flowchart TD")
    expect(result.content.debugPath.length).toBeGreaterThan(0)
  })

  it("runs the six agentic nodes in pipeline order", async () => {
    const model = createScriptedModel({ replies: fullRunReplies() })
    await runMappingPipeline({
      ingestion: aiIngestion,
      files: aiFiles,
      model,
    })
    // Six agentic nodes → six model calls (ingestion + mermaid are
    // deterministic and never touch the model).
    expect(model.calls).toHaveLength(6)
  })

  it("drops cited file paths that are not real snapshot files", async () => {
    const model = createScriptedModel({ replies: fullRunReplies() })
    const result = await runMappingPipeline({
      ingestion: aiIngestion,
      files: aiFiles,
      model,
    })
    const keyPaths = result.content.keyFileMap.map((f) => f.path)
    expect(keyPaths).not.toContain("apps/web/app/ghost.ts")
    expect(keyPaths).toContain("apps/web/app/page.tsx")
    expect(
      result.notes.some((n) => n.includes("apps/web/app/ghost.ts")),
    ).toBe(true)
  })

  it("every cited path resolves to a real file in the snapshot", async () => {
    const model = createScriptedModel({ replies: fullRunReplies() })
    const result = await runMappingPipeline({
      ingestion: aiIngestion,
      files: aiFiles,
      model,
    })
    const realPaths = new Set([
      "apps/web/app/page.tsx",
      "apps/web/app/actions.ts",
      "packages/db/schema.ts",
    ])
    for (const file of result.content.keyFileMap) {
      expect(realPaths.has(file.path)).toBe(true)
    }
    const flowPaths: (string | undefined)[] = [
      ...result.content.requestDataFlow,
      ...result.content.stateFlow,
      ...result.content.aiCallFlow,
    ].map((step: FlowStep) => step.path)
    for (const path of flowPaths) {
      if (path !== undefined) expect(realPaths.has(path)).toBe(true)
    }
  })

  it("Mermaid nodes correspond to real key files", async () => {
    const model = createScriptedModel({ replies: fullRunReplies() })
    const result = await runMappingPipeline({
      ingestion: aiIngestion,
      files: aiFiles,
      model,
    })
    for (const file of result.content.keyFileMap) {
      expect(result.content.mermaidDiagram).toContain(file.path)
    }
  })

  it("renumbers flow steps sequentially from 1", async () => {
    const replies = fullRunReplies()
    // requestFlow reply with out-of-order, gapped orders.
    replies[2] = JSON.stringify([
      { order: 5, description: "Second by intent." },
      { order: 2, description: "First by intent." },
    ])
    const model = createScriptedModel({ replies })
    const result = await runMappingPipeline({
      ingestion: aiIngestion,
      files: aiFiles,
      model,
    })
    expect(result.content.requestDataFlow.map((s) => s.order)).toEqual([1, 2])
    expect(result.content.requestDataFlow[0]?.description).toBe(
      "First by intent.",
    )
  })

  it("yields a not-applicable AI-call flow for a non-AI project", async () => {
    // Replies for architecture, keyFiles, requestFlow, stateFlow, debugPath —
    // the aiFlow node does NOT call the model for a non-AI project.
    const model = createScriptedModel({
      replies: [
        JSON.stringify([{ title: "Server", detail: "An Express server." }]),
        JSON.stringify([{ path: "src/index.ts", role: "The server entry." }]),
        JSON.stringify([{ order: 1, description: "A request hits Express." }]),
        JSON.stringify([{ order: 1, description: "No client state." }]),
        JSON.stringify([
          { location: "src/index.ts", guidance: "Check routing here." },
        ]),
      ],
    })
    const result = await runMappingPipeline({
      ingestion: plainIngestion,
      files: plainFiles,
      model,
    })
    expect(result.hasAiIntegration).toBe(false)
    expect(result.content.aiCallFlow).toHaveLength(1)
    expect(result.content.aiCallFlow[0]?.description).toContain(
      "Not applicable",
    )
    // Five agentic calls — the AI-call flow node was skipped.
    expect(model.calls).toHaveLength(5)
    expect(
      result.notes.some((n) => n.includes("not applicable")),
    ).toBe(true)
  })

  it("degrades gracefully when the model returns malformed output", async () => {
    // Every node gets an unparseable reply.
    const model = createScriptedModel({
      replies: ["sorry, I cannot help with that"],
    })
    const result = await runMappingPipeline({
      ingestion: aiIngestion,
      files: aiFiles,
      model,
    })
    // The run still completes with a valid, fully-shaped structure.
    expect(result.content.architectureOverview).toEqual([])
    expect(result.content.keyFileMap).toEqual([])
    expect(result.content.requestDataFlow).toEqual([])
    expect(result.content.stateFlow).toEqual([])
    expect(result.content.debugPath).toEqual([])
    // Mermaid degrades to its single explanatory node.
    expect(result.content.mermaidDiagram).toContain(
      "No structure could be mapped",
    )
    // The AI-call flow falls back to the not-applicable placeholder.
    expect(result.content.aiCallFlow[0]?.description).toContain(
      "Not applicable",
    )
    // Each empty section is explained in the notes.
    expect(result.notes.length).toBeGreaterThan(0)
  })

  it("notes an empty snapshot but still produces a structure", async () => {
    const model = createScriptedModel({ replies: fullRunReplies() })
    const result = await runMappingPipeline({
      ingestion: aiIngestion,
      files: [],
      model,
    })
    expect(
      result.notes.some((n) => n.includes("no key files")),
    ).toBe(true)
    // The graph still ran every node and produced the typed structure.
    expect(result.content.mermaidDiagram).toContain("flowchart TD")
  })

  it("grounds every agentic prompt in retrieved snapshot code", async () => {
    const model = createScriptedModel({ replies: fullRunReplies() })
    await runMappingPipeline({
      ingestion: aiIngestion,
      files: aiFiles,
      model,
    })
    // Each prompt carries a retrieved-code grounding block.
    for (const call of model.calls) {
      expect(call.prompt).toContain("Relevant code:")
    }
  })

  it("propagates a model failure as a rejection", async () => {
    const model = createScriptedModel({ throws: new Error("model offline") })
    await expect(
      runMappingPipeline({
        ingestion: aiIngestion,
        files: aiFiles,
        model,
      }),
    ).rejects.toThrow("model offline")
  })
})
