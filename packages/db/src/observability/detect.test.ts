import { describe, expect, it } from "vitest"

import { analyzeObservability, type ObservabilityFile } from "./detect"

/** Build a snapshot file from a path and content (category is incidental). */
function file(
  path: string,
  content: string,
  category = "source",
): ObservabilityFile {
  return { path, content, category }
}

/** A package.json string from dependency / devDependency maps. */
function manifest(deps: {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}): string {
  return JSON.stringify({ name: "sample", version: "0.0.0", ...deps }, null, 2)
}

describe("analyzeObservability", () => {
  // (a) LLM-app fixture: anthropic SDK dep + a call site.
  it("detects an LLM app from an Anthropic SDK dep and a call site", () => {
    const result = analyzeObservability([
      file(
        "package.json",
        manifest({ dependencies: { "@anthropic-ai/sdk": "^0.99.0" } }),
        "package-manifest",
      ),
      file(
        "src/chat.ts",
        [
          `import Anthropic from "@anthropic-ai/sdk"`,
          `const client = new Anthropic()`,
          `const res = await client.messages.create({ model: "claude" })`,
        ].join("\n"),
      ),
    ])

    expect(result.kind).toBe("llm-app")
    if (result.kind !== "llm-app") return

    // Names the real SDK (deduped across manifest + import).
    expect(result.sdks.map((s) => s.name)).toEqual(["Anthropic SDK"])
    expect(result.sdks[0]?.evidence).toContain("package.json")

    // Reports the call sites where they were found.
    const patterns = result.callSites.map((c) => c.pattern)
    expect(patterns).toContain(".messages.create")
    expect(patterns).toContain("new Anthropic")
    for (const site of result.callSites) {
      expect(site.path).toBe("src/chat.ts")
    }
  })

  it("flags an LLM app from an import alone, with no manifest", () => {
    const result = analyzeObservability([
      file("lib/ai.ts", `import OpenAI from "openai"\nexport const x = 1`),
    ])
    expect(result.kind).toBe("llm-app")
    if (result.kind !== "llm-app") return
    expect(result.sdks.map((s) => s.name)).toEqual(["OpenAI SDK"])
    expect(result.sdks[0]?.evidence).toContain('import "openai"')
  })

  it("flags an LLM app from a call site alone (deep-import openai)", () => {
    const result = analyzeObservability([
      file(
        "server.mjs",
        `const r = await openai.chat.completions.create({ model: "gpt" })`,
      ),
    ])
    expect(result.kind).toBe("llm-app")
    if (result.kind !== "llm-app") return
    expect(result.callSites.map((c) => c.pattern)).toContain(
      ".chat.completions.create",
    )
  })

  it("maps scoped AI SDK families and dedupes by SDK name", () => {
    const result = analyzeObservability([
      file(
        "package.json",
        manifest({
          dependencies: {
            "@langchain/core": "0.3.0",
            langchain: "0.3.0",
            "@mistralai/mistralai": "1.0.0",
          },
        }),
        "package-manifest",
      ),
    ])
    expect(result.kind).toBe("llm-app")
    if (result.kind !== "llm-app") return
    const names = result.sdks.map((s) => s.name)
    expect(names).toContain("LangChain")
    expect(names).toContain("Mistral SDK")
    // LangChain appears once despite two matching deps.
    expect(names.filter((n) => n === "LangChain")).toHaveLength(1)
  })

  // (b) Tooling-present fixture: langfuse + an evals dir (+ prompt assets).
  it("populates existingTooling from langfuse, an evals dir, and prompt assets", () => {
    const result = analyzeObservability([
      file(
        "package.json",
        manifest({
          dependencies: { openai: "^4.0.0", langfuse: "^3.0.0" },
        }),
        "package-manifest",
      ),
      file("src/agent.ts", `import { openai } from "openai"`, "source"),
      file("evals/regression.eval.ts", `export const suite = []`, "source"),
      file("prompts/system.prompt", "You are a helpful assistant."),
      file("templates/summary.prompt", "Summarize: {{input}}"),
    ])

    expect(result.kind).toBe("llm-app")
    if (result.kind !== "llm-app") return

    const tooling = result.existingTooling.map((t) => t.name)
    expect(tooling).toContain("Langfuse")
    expect(tooling).toContain("Evals directory")

    const promptPaths = result.promptAssets.map((p) => p.path)
    expect(promptPaths).toContain("prompts/system.prompt")
    expect(promptPaths).toContain("templates/summary.prompt")
  })

  it("detects OpenLLMetry / Traceloop tooling from a scoped import", () => {
    const result = analyzeObservability([
      file(
        "src/trace.ts",
        [
          `import { traceloop } from "@traceloop/node-server-sdk"`,
          `import OpenAI from "openai"`,
        ].join("\n"),
      ),
    ])
    expect(result.kind).toBe("llm-app")
    if (result.kind !== "llm-app") return
    expect(result.existingTooling.map((t) => t.name)).toContain(
      "OpenLLMetry (Traceloop)",
    )
  })

  // (c) Non-LLM fixture → absent.
  it("returns a clean absent state for a non-LLM repo", () => {
    const result = analyzeObservability([
      file(
        "package.json",
        manifest({
          dependencies: { next: "16.0.0", react: "19.0.0" },
          devDependencies: { typescript: "5.9.3", vitest: "4.1.7" },
        }),
        "package-manifest",
      ),
      file("src/page.tsx", `export default function Page() { return null }`),
      file("README.md", "# A normal web app", "readme"),
    ])
    expect(result.kind).toBe("absent")
    if (result.kind !== "absent") return
    expect(result.searched.length).toBeGreaterThan(0)
  })

  it("does NOT flag an LLM app from tooling / prompt assets alone", () => {
    // Langfuse + a prompts/ asset but no SDK and no call site: nothing to
    // instrument, so the repo is not an LLM app.
    const result = analyzeObservability([
      file(
        "package.json",
        manifest({ dependencies: { langfuse: "^3.0.0" } }),
        "package-manifest",
      ),
      file("prompts/hello.prompt", "hi"),
    ])
    expect(result.kind).toBe("absent")
  })

  it("is tolerant of an unparseable package.json and an empty snapshot", () => {
    expect(analyzeObservability([]).kind).toBe("absent")
    const result = analyzeObservability([
      file("package.json", "{ this is not json", "package-manifest"),
      file("src/chat.ts", `import Anthropic from "@anthropic-ai/sdk"`),
    ])
    // The bad manifest is skipped, but the import still flags the app.
    expect(result.kind).toBe("llm-app")
    if (result.kind !== "llm-app") return
    expect(result.sdks.map((s) => s.name)).toEqual(["Anthropic SDK"])
  })

  it("is stably ordered and order-independent in its composition", () => {
    const files: ObservabilityFile[] = [
      file("z/last.ts", `import OpenAI from "openai"`),
      file("a/first.ts", `await anthropic.messages.create({})`),
      file(
        "package.json",
        manifest({ dependencies: { "@anthropic-ai/sdk": "1", openai: "1" } }),
        "package-manifest",
      ),
    ]
    const a = analyzeObservability(files)
    const b = analyzeObservability([...files].reverse())
    if (a.kind !== "llm-app" || b.kind !== "llm-app") {
      throw new Error("expected llm-app")
    }
    // The detected SET (names / paths) is independent of input order; the
    // EVIDENCE may legitimately differ (first-evidence-wins depends on order).
    expect(a.sdks.map((s) => s.name)).toEqual(b.sdks.map((s) => s.name))
    expect(a.callSites.map((c) => c.path)).toEqual(b.callSites.map((c) => c.path))
    // SDKs sorted by name; call sites sorted by path.
    expect(a.sdks.map((s) => s.name)).toEqual(["Anthropic SDK", "OpenAI SDK"])
    expect(a.callSites.map((c) => c.path)).toEqual(["a/first.ts"])
    // Re-running the SAME input is fully deterministic, evidence included.
    expect(analyzeObservability(files)).toEqual(a)
  })

  it("does not treat relative imports as packages", () => {
    const result = analyzeObservability([
      file(
        "src/util.ts",
        [`import { x } from "./openai"`, `import { y } from "../anthropic"`].join(
          "\n",
        ),
      ),
    ])
    // `./openai` / `../anthropic` are local modules, not the SDKs.
    expect(result.kind).toBe("absent")
  })
})
