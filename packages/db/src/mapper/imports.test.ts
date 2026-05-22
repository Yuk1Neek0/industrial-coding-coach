// Tests for the deterministic import/require parser (Issue #103).

import { describe, expect, it } from "vitest"

import { isParseableSource, parseImports } from "./imports"

describe("parseImports", () => {
  it("parses static ES imports", () => {
    const refs = parseImports(
      `import React from "react"\nimport { useState } from 'react'\n` +
        `import "./styles.css"`,
    )
    const specifiers = refs.map((r) => r.specifier).sort()
    expect(specifiers).toEqual(["./styles.css", "react"])
    expect(refs.every((r) => r.kind === "static")).toBe(true)
  })

  it("parses `export ... from` re-exports", () => {
    const refs = parseImports(`export { foo } from "./foo"\nexport * from "./bar"`)
    expect(refs.map((r) => r.specifier).sort()).toEqual(["./bar", "./foo"])
  })

  it("parses dynamic import() calls and tags them `dynamic`", () => {
    const refs = parseImports(`const m = await import("./lazy")`)
    expect(refs).toHaveLength(1)
    expect(refs[0]?.kind).toBe("dynamic")
    expect(refs[0]?.specifier).toBe("./lazy")
  })

  it("parses CommonJS require() calls and tags them `require`", () => {
    const refs = parseImports(`const fs = require("node:fs")\n` +
      `const util = require('./util')`)
    expect(refs.map((r) => r.kind).sort()).toEqual(["require", "require"])
    expect(refs.map((r) => r.specifier).sort()).toEqual(["./util", "node:fs"])
  })

  it("flags relative specifiers as relative and bare ones as not", () => {
    const refs = parseImports(`import a from "./a"\nimport b from "pkg"`)
    const byName = new Map(refs.map((r) => [r.specifier, r.relative]))
    expect(byName.get("./a")).toBe(true)
    expect(byName.get("pkg")).toBe(false)
  })

  it("ignores import statements inside line and block comments", () => {
    const refs = parseImports(
      `// import ghost from "./ghost"\n` +
        `/* import phantom from "./phantom" */\n` +
        `import real from "./real"`,
    )
    expect(refs.map((r) => r.specifier)).toEqual(["./real"])
  })

  it("de-duplicates the same specifier imported twice with the same kind", () => {
    const refs = parseImports(
      `import { a } from "./shared"\nimport { b } from "./shared"`,
    )
    expect(refs).toHaveLength(1)
  })

  it("prefers the dynamic classification over the static fallback", () => {
    const refs = parseImports(`const x = await import("./lazy")`)
    expect(refs.filter((r) => r.specifier === "./lazy")).toHaveLength(1)
    expect(refs[0]?.kind).toBe("dynamic")
  })

  it("returns an empty array for a file with no imports", () => {
    expect(parseImports(`export const answer = 42`)).toEqual([])
  })

  it("never throws on truncated or malformed source", () => {
    expect(() => parseImports(`import { unterminated from`)).not.toThrow()
    expect(() => parseImports(`require(`)).not.toThrow()
  })

  it("is deterministic — same source yields the same ordered result", () => {
    const source = `import b from "./b"\nimport a from "./a"\n` +
      `const c = require("./c")`
    expect(parseImports(source)).toEqual(parseImports(source))
  })
})

describe("isParseableSource", () => {
  it("recognizes JS/TS source extensions", () => {
    for (const path of ["a.ts", "b.tsx", "c.js", "d.mjs", "e.cjs"]) {
      expect(isParseableSource(path)).toBe(true)
    }
  })

  it("rejects non-source files", () => {
    for (const path of ["README.md", "styles.css", "data.json", "logo.png"]) {
      expect(isParseableSource(path)).toBe(false)
    }
  })
})
