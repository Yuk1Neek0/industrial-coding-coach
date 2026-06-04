// Tests for the enrichment companion format + fixture loader (M14, #245).

import { describe, expect, it } from "vitest"

import {
  type TemplateEnrichment,
  TemplateEnrichmentError,
  loadBackstageFixtures,
  pairFixtures,
  validateEnrichment,
} from "./template-enrichment"

const YAML = `
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: react-ssr-template
  title: React SSR Template
spec:
  type: website
`

const ENRICHMENT: TemplateEnrichment = {
  whyUsed: "Starts a server-rendered React app fast.",
  fitCriteria: "Use for a customer-facing website that needs SSR.",
  fitFactors: [{ factor: "rendering", detail: "Needs SSR/SSG." }],
  risks: ["Couples you to the chosen meta-framework."],
  alternatives: [{ name: "SPA", reason: "When SEO/SSR is not needed." }],
  learningNotes: "Understand SSR vs SPA trade-offs.",
}

describe("validateEnrichment", () => {
  it("returns a complete enrichment unchanged", () => {
    expect(validateEnrichment("x", ENRICHMENT)).toBe(ENRICHMENT)
  })

  it("throws when a required text field is empty", () => {
    expect(() =>
      validateEnrichment("x", { ...ENRICHMENT, whyUsed: "" }),
    ).toThrow(/whyUsed/)
  })

  it("throws when a required array field is empty", () => {
    expect(() =>
      validateEnrichment("x", { ...ENRICHMENT, risks: [] }),
    ).toThrow(/risks/)
  })
})

describe("pairFixtures", () => {
  it("pairs a template with its enrichment by name key", () => {
    const pairs = pairFixtures(
      { "react-ssr-template": YAML },
      { "react-ssr-template": ENRICHMENT },
    )
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.name).toBe("react-ssr-template")
  })

  it("throws when a template.yaml has no enrichment companion", () => {
    expect(() => pairFixtures({ lonely: YAML }, {})).toThrow(
      TemplateEnrichmentError,
    )
  })

  it("throws when an enrichment has no matching template.yaml", () => {
    expect(() => pairFixtures({}, { lonely: ENRICHMENT })).toThrow(
      /no matching template\.yaml/,
    )
  })
})

describe("loadBackstageFixtures", () => {
  it("parses + validates a complete fixture pair", () => {
    const loaded = loadBackstageFixtures(
      pairFixtures(
        { "react-ssr-template": YAML },
        { "react-ssr-template": ENRICHMENT },
      ),
    )
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.template.metadata.name).toBe("react-ssr-template")
    expect(loaded[0]?.enrichment.whyUsed).toContain("React")
  })

  it("fails closed on an incomplete enrichment", () => {
    expect(() =>
      loadBackstageFixtures([
        {
          name: "react-ssr-template",
          templateYaml: YAML,
          enrichment: { ...ENRICHMENT, fitFactors: [] },
        },
      ]),
    ).toThrow(/fitFactors/)
  })
})
