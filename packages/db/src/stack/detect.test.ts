import { describe, expect, it } from "vitest"

import { detectStack, type DetectionFile } from "./detect"

/** Build a detection file from a path and content. */
function file(path: string, content: string): DetectionFile {
  return { path, content }
}

/** A package.json string from dependency / devDependency maps. */
function manifest(deps: {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}): string {
  return JSON.stringify({ name: "sample", version: "0.0.0", ...deps })
}

describe("detectStack", () => {
  it("detects frameworks, ORMs, and AI SDKs from package.json dependencies", () => {
    const { tools } = detectStack([
      file(
        "package.json",
        manifest({
          dependencies: {
            next: "16.0.0",
            react: "19.0.0",
            "drizzle-orm": "0.45.0",
            "@anthropic-ai/sdk": "0.98.0",
          },
        }),
      ),
    ])
    const names = tools.map((t) => t.name)
    expect(names).toContain("Next.js")
    expect(names).toContain("React")
    expect(names).toContain("Drizzle ORM")
    expect(names).toContain("Anthropic SDK")
  })

  it("reads devDependencies as well as dependencies", () => {
    const { tools } = detectStack([
      file(
        "package.json",
        manifest({ devDependencies: { typescript: "5.9.3", vitest: "4.1.7" } }),
      ),
    ])
    const names = tools.map((t) => t.name)
    expect(names).toContain("TypeScript")
    expect(names).toContain("Vitest")
  })

  it("categorizes detected tools by their role in the stack", () => {
    const { tools } = detectStack([
      file("package.json", manifest({ dependencies: { next: "16.0.0" } })),
    ])
    const next = tools.find((t) => t.name === "Next.js")
    expect(next?.category).toBe("framework")
  })

  it("records evidence pointing back to the file and signal", () => {
    const { tools } = detectStack([
      file(
        "apps/web/package.json",
        manifest({ dependencies: { next: "16.0.0" } }),
      ),
    ])
    const next = tools.find((t) => t.name === "Next.js")
    expect(next?.evidence).toContain("apps/web/package.json")
    expect(next?.evidence).toContain("next")
  })

  it("maps scoped-package families onto a single tool", () => {
    const { tools } = detectStack([
      file(
        "package.json",
        manifest({
          dependencies: {
            "@radix-ui/react-dialog": "1.0.0",
            "@radix-ui/react-slot": "1.0.0",
            "@trpc/server": "11.0.0",
          },
        }),
      ),
    ])
    const names = tools.map((t) => t.name)
    expect(names.filter((n) => n === "Radix UI")).toHaveLength(1)
    expect(names).toContain("tRPC")
  })

  it("de-duplicates a tool detected from several signals", () => {
    const { tools } = detectStack([
      file(
        "package.json",
        manifest({ dependencies: { react: "19.0.0", "react-dom": "19.0.0" } }),
      ),
    ])
    expect(tools.filter((t) => t.name === "React")).toHaveLength(1)
  })

  it("detects the package manager from a lockfile", () => {
    const { tools } = detectStack([file("pnpm-lock.yaml", "lockfileVersion: 9")])
    const pnpm = tools.find((t) => t.name === "pnpm")
    expect(pnpm?.category).toBe("package-manager")
  })

  it("detects tools from exact config-file names", () => {
    const { tools } = detectStack([
      file("turbo.json", "{}"),
      file("tsconfig.json", "{}"),
    ])
    const names = tools.map((t) => t.name)
    expect(names).toContain("Turborepo")
    expect(names).toContain("TypeScript")
  })

  it("detects tools from config-file name patterns", () => {
    const { tools } = detectStack([
      file("next.config.mjs", "export default {}"),
      file("tailwind.config.ts", "export default {}"),
    ])
    const names = tools.map((t) => t.name)
    expect(names).toContain("Next.js")
    expect(names).toContain("Tailwind CSS")
  })

  it("detects GitHub Actions from a workflow file", () => {
    const { tools } = detectStack([
      file(".github/workflows/ci.yml", "name: CI"),
    ])
    const ci = tools.find((t) => t.name === "GitHub Actions")
    expect(ci?.category).toBe("ci")
  })

  it("is deterministic — same files yield the same ordered result", () => {
    const files = [
      file("package.json", manifest({ dependencies: { next: "16.0.0" } })),
      file("pnpm-lock.yaml", "lockfileVersion: 9"),
      file("turbo.json", "{}"),
    ]
    expect(detectStack(files)).toEqual(detectStack(files))
  })

  it("orders tools by category then name", () => {
    const { tools } = detectStack([
      file(
        "package.json",
        manifest({ dependencies: { next: "16.0.0", zod: "3.0.0" } }),
      ),
    ])
    const ordered = [...tools].sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    )
    expect(tools).toEqual(ordered)
  })

  it("degrades gracefully on an unparseable package.json", () => {
    const { tools, notes } = detectStack([
      file("package.json", "{ this is not valid json"),
      file("pnpm-lock.yaml", "lockfileVersion: 9"),
    ])
    // The bad manifest is skipped; the lockfile is still detected.
    expect(tools.map((t) => t.name)).toEqual(["pnpm"])
    expect(notes.some((n) => n.includes("package.json"))).toBe(true)
  })

  it("returns an empty stack for a snapshot with no recognizable files", () => {
    const { tools, notes } = detectStack([file("README.md", "# Hello")])
    expect(tools).toEqual([])
    expect(notes).toEqual([])
  })

  it("ignores peerDependencies — they describe a published package's host", () => {
    const { tools } = detectStack([
      file(
        "package.json",
        JSON.stringify({ name: "lib", peerDependencies: { react: "19.0.0" } }),
      ),
    ])
    expect(tools).toEqual([])
  })
})
