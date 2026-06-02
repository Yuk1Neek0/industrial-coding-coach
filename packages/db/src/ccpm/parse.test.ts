// Unit tests for the generalized CCPM artifact parser (Issue #198).
//
// Pure parsers — no DB, no filesystem, no network. Covers PRD / epic / task
// frontmatter + body parsing, the `archived/` subtree, path classification
// (incl. noise files), quoted scalars, list/boolean parsing, and the
// frontmatter-less clean-miss fallback.

import { describe, expect, it } from "vitest"

import {
  classifyCcpmArtifact,
  parseCcpmArtifact,
  parseEpic,
  parsePrd,
  parseTask,
} from "./parse"

const prdFile = `---
name: ccpm-integration
description: Read a repo's CCPM artifacts into a local traceability map.
status: backlog
created: 2026-06-02T12:57:29Z
---

# PRD: ccpm-integration

## Executive Summary

Some summary text.
`

const epicFile = `---
name: ccpm-integration
status: in-progress
created: 2026-06-02T13:09:15Z
progress: 33%
prd: .claude/prds/ccpm-integration.md
github: https://github.com/acme/widgets/issues/196
---

# Epic: ccpm-integration

## Overview

Overview text.
`

const taskFile = `---
name: Generalized CCPM parser
status: open
created: 2026-06-02T13:21:59Z
updated: 2026-06-02T13:21:59Z
github: https://github.com/acme/widgets/issues/198
depends_on: [1, 2, 3]
parallel: true
conflicts_with: []
---

# Task: Generalized CCPM parser

## Description

Parse PRD / epic / task files.
`

describe("classifyCcpmArtifact", () => {
  it("classifies PRD, epic, and task paths", () => {
    expect(classifyCcpmArtifact(".claude/prds/ccpm-integration.md")).toBe("prd")
    expect(classifyCcpmArtifact(".claude/epics/foo/epic.md")).toBe("epic")
    expect(classifyCcpmArtifact(".claude/epics/foo/001.md")).toBe("task")
  })

  it("classifies artifacts under the archived/ subtree", () => {
    expect(classifyCcpmArtifact(".claude/epics/archived/foo/epic.md")).toBe(
      "epic",
    )
    expect(classifyCcpmArtifact(".claude/epics/archived/foo/099.md")).toBe(
      "task",
    )
  })

  it("returns null for non-artifact noise files", () => {
    expect(classifyCcpmArtifact(".claude/epics/foo/001-analysis.md")).toBeNull()
    expect(classifyCcpmArtifact(".claude/epics/foo/github-mapping.md")).toBeNull()
    expect(
      classifyCcpmArtifact(".claude/epics/foo/execution-status.md"),
    ).toBeNull()
    expect(
      classifyCcpmArtifact(".claude/epics/foo/updates/1/progress.md"),
    ).toBeNull()
    expect(classifyCcpmArtifact("README.md")).toBeNull()
    expect(classifyCcpmArtifact(".claude/prds/nested/x.md")).toBeNull()
  })
})

describe("parsePrd", () => {
  it("parses full frontmatter and the body", () => {
    const prd = parsePrd(prdFile, ".claude/prds/ccpm-integration.md")
    expect(prd.type).toBe("prd")
    expect(prd.name).toBe("ccpm-integration")
    expect(prd.frontmatter.description).toContain("traceability map")
    expect(prd.frontmatter.status).toBe("backlog")
    expect(prd.frontmatter.created).toBe("2026-06-02T12:57:29Z")
    expect(prd.body).toContain("# PRD: ccpm-integration")
    expect(prd.body).toContain("Some summary text.")
  })

  it("falls back to the filename when frontmatter name is missing", () => {
    const prd = parsePrd("---\nstatus: backlog\n---\nbody\n", ".claude/prds/my-feature.md")
    expect(prd.name).toBe("my-feature")
    expect(prd.frontmatter.name).toBeNull()
    expect(prd.frontmatter.description).toBeNull()
  })
})

describe("parseEpic", () => {
  it("parses full frontmatter incl. prd + github links", () => {
    const epic = parseEpic(epicFile, ".claude/epics/ccpm-integration/epic.md")
    expect(epic.type).toBe("epic")
    expect(epic.name).toBe("ccpm-integration")
    expect(epic.epicDir).toBe("ccpm-integration")
    expect(epic.archived).toBe(false)
    expect(epic.frontmatter.progress).toBe("33%")
    expect(epic.frontmatter.prd).toBe(".claude/prds/ccpm-integration.md")
    expect(epic.frontmatter.github).toBe(
      "https://github.com/acme/widgets/issues/196",
    )
  })

  it("marks an archived epic and falls back to the dir name", () => {
    const epic = parseEpic(
      "---\nstatus: completed\n---\nbody\n",
      ".claude/epics/archived/old-epic/epic.md",
    )
    expect(epic.archived).toBe(true)
    expect(epic.epicDir).toBe("old-epic")
    expect(epic.name).toBe("old-epic")
    expect(epic.frontmatter.prd).toBeNull()
    expect(epic.frontmatter.github).toBeNull()
  })
})

describe("parseTask", () => {
  it("parses full frontmatter incl. depends_on, parallel, conflicts_with", () => {
    const task = parseTask(taskFile, ".claude/epics/ccpm-integration/198.md")
    expect(task.type).toBe("task")
    expect(task.taskRef).toBe("epic/ccpm-integration/198")
    expect(task.epicDir).toBe("ccpm-integration")
    expect(task.taskId).toBe("198")
    expect(task.archived).toBe(false)
    expect(task.frontmatter.name).toBe("Generalized CCPM parser")
    expect(task.frontmatter.github).toBe(
      "https://github.com/acme/widgets/issues/198",
    )
    expect(task.frontmatter.dependsOn).toEqual([1, 2, 3])
    expect(task.frontmatter.parallel).toBe(true)
    expect(task.frontmatter.conflictsWith).toEqual([])
    expect(task.body).toContain("# Task: Generalized CCPM parser")
  })

  it("builds an archived taskRef and tolerates missing optional fields", () => {
    const task = parseTask(
      "---\nname: x\nstatus: closed\n---\nbody\n",
      ".claude/epics/archived/old/099.md",
    )
    expect(task.archived).toBe(true)
    expect(task.taskRef).toBe("epic/old/099")
    expect(task.frontmatter.github).toBeNull()
    expect(task.frontmatter.dependsOn).toEqual([])
    expect(task.frontmatter.parallel).toBeNull()
    expect(task.frontmatter.conflictsWith).toEqual([])
  })

  it("unwraps single- and double-quoted scalars", () => {
    const task = parseTask(
      `---\nname: "Quoted name"\nstatus: 'open'\n---\n`,
      ".claude/epics/foo/001.md",
    )
    expect(task.frontmatter.name).toBe("Quoted name")
    expect(task.frontmatter.status).toBe("open")
    expect(task.body).toBe("")
  })

  it("parses a conflicts_with list", () => {
    const task = parseTask(
      "---\nname: x\nconflicts_with: [3, 4]\n---\nbody\n",
      ".claude/epics/foo/005.md",
    )
    expect(task.frontmatter.conflictsWith).toEqual([3, 4])
  })
})

describe("parseCcpmArtifact (dispatch)", () => {
  it("dispatches by path to the right parser", () => {
    expect(
      parseCcpmArtifact(".claude/prds/x.md", prdFile)?.type,
    ).toBe("prd")
    expect(
      parseCcpmArtifact(".claude/epics/foo/epic.md", epicFile)?.type,
    ).toBe("epic")
    expect(
      parseCcpmArtifact(".claude/epics/foo/198.md", taskFile)?.type,
    ).toBe("task")
  })

  it("returns null for a non-artifact path", () => {
    expect(parseCcpmArtifact("package.json", "{}")).toBeNull()
    expect(parseCcpmArtifact(".claude/epics/foo/epic-notes.md", "x")).toBeNull()
  })

  it("treats a file with no frontmatter delimiter as all body", () => {
    const prd = parsePrd("just markdown, no frontmatter", ".claude/prds/x.md")
    expect(prd.frontmatter.name).toBeNull()
    expect(prd.name).toBe("x")
    expect(prd.body).toBe("just markdown, no frontmatter")
  })
})
