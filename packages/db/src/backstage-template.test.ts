// Tests for the Backstage software-template parser (M14, Issue #244).

import { describe, expect, it } from "vitest"

import {
  BackstageTemplateError,
  parseBackstageTemplate,
} from "./backstage-template"

const VALID = `
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: react-ssr-template
  title: React SSR Template
  description: Create a website powered by Next.js
  tags:
    - recommended
    - react
  annotations:
    backstage.io/source-location: url:https://github.com/backstage/software-templates/
spec:
  owner: web@example.com
  type: website
  parameters:
    - title: Provide some simple information
      required:
        - name
  steps:
    - id: fetch
      name: Fetch Base
      action: fetch:template
      input:
        url: ./skeleton
    - id: publish
      action: publish:github
`

describe("parseBackstageTemplate", () => {
  it("parses a valid v1beta3 software template", () => {
    const t = parseBackstageTemplate(VALID)
    expect(t.kind).toBe("Template")
    expect(t.apiVersion).toBe("scaffolder.backstage.io/v1beta3")
    expect(t.metadata.name).toBe("react-ssr-template")
    expect(t.metadata.title).toBe("React SSR Template")
    expect(t.metadata.tags).toEqual(["recommended", "react"])
    expect(t.metadata.annotations?.["backstage.io/source-location"]).toContain(
      "github.com",
    )
    expect(t.spec.type).toBe("website")
    expect(t.spec.owner).toBe("web@example.com")
    expect(t.spec.steps).toHaveLength(2)
    expect(t.spec.steps?.[0]?.action).toBe("fetch:template")
    expect(t.spec.steps?.[1]?.action).toBe("publish:github")
  })

  it("throws on malformed YAML", () => {
    expect(() => parseBackstageTemplate("kind: Template\n  : : ["))
      .toThrow(BackstageTemplateError)
  })

  it("throws when the document is not a mapping", () => {
    expect(() => parseBackstageTemplate("- just\n- a\n- list")).toThrow(
      /must be a YAML mapping/,
    )
  })

  it("throws when kind is not Template", () => {
    const yaml = VALID.replace("kind: Template", "kind: Component")
    expect(() => parseBackstageTemplate(yaml)).toThrow(/expected kind: Template/)
  })

  it("throws when metadata.name is missing", () => {
    const yaml = VALID.replace("  name: react-ssr-template\n", "")
    expect(() => parseBackstageTemplate(yaml)).toThrow(/metadata.name/)
  })

  it("throws when spec.type is missing", () => {
    const yaml = VALID.replace("  type: website\n", "")
    expect(() => parseBackstageTemplate(yaml)).toThrow(/spec.type/)
  })

  it("throws when a step is missing its action", () => {
    const yaml = `
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: bad-steps
spec:
  type: service
  steps:
    - id: no-action
`
    expect(() => parseBackstageTemplate(yaml)).toThrow(/steps\[0\].action/)
  })

  it("accepts a minimal template with no optional fields", () => {
    const t = parseBackstageTemplate(`
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: minimal
spec:
  type: service
`)
    expect(t.metadata.name).toBe("minimal")
    expect(t.metadata.title).toBeUndefined()
    expect(t.spec.steps).toBeUndefined()
  })
})
