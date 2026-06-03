// Unit tests for the observability teaching layer (Issue #223, Part B).
//
// Pure. Builds a real story via the #221 analyzer from snapshot files, then
// asserts the explanations are parameterized with the story's actual findings —
// the named SDK and a real call-site reference — and that the `absent` case
// returns a calm explainer (no error, no scolding).

import { describe, expect, it } from "vitest"

import { analyzeObservability, type ObservabilityFile } from "./detect"
import {
  buildObservabilityTeaching,
  type ObservabilityTeaching,
} from "./teaching"

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

// An LLM-app fixture: Anthropic SDK dep + a real call site at src/chat.ts.
const LLM_APP_FILES: ObservabilityFile[] = [
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
]

/** Build teaching for the LLM-app fixture and narrow to the llm-app case. */
function teachingForLlmApp(): ObservabilityTeaching {
  const story = analyzeObservability(LLM_APP_FILES)
  const result = buildObservabilityTeaching(story)
  if (result.kind !== "llm-app") throw new Error("expected llm-app teaching")
  return result
}

describe("buildObservabilityTeaching — llm-app case", () => {
  it("parameterizes the headline with the real SDK name", () => {
    const t = teachingForLlmApp()
    expect(t.headline).toContain("Anthropic SDK") // the REAL detected SDK
    expect(t.headline).toContain("place") // call-site count surfaced
  })

  it("emits the three concepts in order", () => {
    const t = teachingForLlmApp()
    expect(t.concepts.map((c) => c.concept)).toEqual([
      "tracing",
      "failures",
      "evals",
    ])
  })

  it("surfaces a real call-site reference in the tracing concept", () => {
    const tracing = teachingForLlmApp().concepts.find(
      (c) => c.concept === "tracing",
    )!
    // The REAL finding — the call site's file path — must appear, not boilerplate.
    expect(tracing.present).toContain("src/chat.ts")
    expect(tracing.present).toContain("Anthropic SDK")
  })

  it("names the production-setup gap for tracing when no tooling is present", () => {
    const tracing = teachingForLlmApp().concepts.find(
      (c) => c.concept === "tracing",
    )!
    // No tracing tool wired up in the fixture.
    expect(tracing.present.toLowerCase()).toContain("no tracing tool")
    expect(tracing.production).toMatch(/langfuse|openllmetry/i)
  })

  it("covers failures (swallowing) and evals (output quality)", () => {
    const t = teachingForLlmApp()
    const failures = t.concepts.find((c) => c.concept === "failures")!
    const evals = t.concepts.find((c) => c.concept === "evals")!
    expect(failures.what.toLowerCase()).toContain("swallow")
    expect(evals.what.toLowerCase()).toContain("output quality")
    // Each concept carries a ready interview answer.
    for (const c of t.concepts) {
      expect(c.interviewAnswer.length).toBeGreaterThan(0)
    }
  })

  it("frames the professional value as the production-monitoring question", () => {
    const t = teachingForLlmApp()
    expect(t.professionalValue.length).toBeGreaterThan(0)
    expect(t.professionalValue.join(" ")).toContain(
      "How would you monitor and evaluate this in production?",
    )
  })

  it("reflects existing tracing + eval tooling when the repo has it", () => {
    const story = analyzeObservability([
      file(
        "package.json",
        manifest({
          dependencies: { openai: "^4.0.0", langfuse: "^3.0.0" },
          devDependencies: { promptfoo: "^0.1.0" },
        }),
        "package-manifest",
      ),
      file(
        "src/llm.ts",
        `import OpenAI from "openai"\nawait client.chat.completions.create({})`,
      ),
      file("prompts/system.prompt", "You are helpful."),
    ])
    const result = buildObservabilityTeaching(story)
    expect(result.kind).toBe("llm-app")
    if (result.kind !== "llm-app") return

    expect(result.headline).toContain("OpenAI SDK")
    expect(result.headline).toContain("Langfuse")

    const tracing = result.concepts.find((c) => c.concept === "tracing")!
    expect(tracing.present).toContain("Langfuse") // existing tracing tool named

    const evals = result.concepts.find((c) => c.concept === "evals")!
    expect(evals.present).toContain("Promptfoo") // existing eval tool named
    expect(evals.present).toContain("prompts/system.prompt") // real prompt asset
  })

  it("is deterministic — same story yields identical output", () => {
    const a = buildObservabilityTeaching(analyzeObservability(LLM_APP_FILES))
    const b = buildObservabilityTeaching(analyzeObservability(LLM_APP_FILES))
    expect(a).toEqual(b)
  })
})

describe("buildObservabilityTeaching — absent case", () => {
  it("returns a calm educational explainer, not an error or scolding", () => {
    const story = analyzeObservability([
      file("src/app.ts", `export const add = (a: number, b: number) => a + b`),
    ])
    expect(story.kind).toBe("absent")

    const result = buildObservabilityTeaching(story)
    expect(result.kind).toBe("absent")
    if (result.kind !== "absent") return

    expect(result.title).toContain("observability")
    // Calm + educational: explains the concept and the interview payoff.
    expect(result.body.toLowerCase()).toContain("normal")
    expect(result.body.toLowerCase()).toContain("interview")
    // No scolding / blame language, and the absent state isn't framed as a failure.
    expect(result.body.toLowerCase()).not.toContain("should have")
    expect(result.body.toLowerCase()).not.toMatch(/\berror[:\s]+at\b/) // no raw stack trace
    expect(result.title.toLowerCase()).not.toContain("error")
    // Echoes what was searched for, and primes the three concepts.
    expect(result.searched.length).toBeGreaterThan(0)
    expect(result.primer.map((p) => p.concept)).toEqual([
      "tracing",
      "failures",
      "evals",
    ])
  })

  it("is deterministic for the absent case", () => {
    const story = analyzeObservability([file("readme.md", "# hi")])
    expect(buildObservabilityTeaching(story)).toEqual(
      buildObservabilityTeaching(story),
    )
  })
})
