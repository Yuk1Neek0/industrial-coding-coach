// Tests for the deterministic Backstage → registry mapper (M14, Issue #246).

import { describe, expect, it } from "vitest"

import type { BackstageTemplate } from "./backstage-template"
import type { TemplateEnrichment } from "./template-enrichment"
import { BackstageImportError, mapBackstageTemplate } from "./backstage-import"

const template: BackstageTemplate = {
  apiVersion: "scaffolder.backstage.io/v1beta3",
  kind: "Template",
  metadata: {
    name: "react-ssr-template",
    title: "React SSR Template",
    description: "Create a website powered by Next.js.",
    tags: ["recommended", "react"],
    annotations: {
      "backstage.io/source-location":
        "url:https://github.com/backstage/software-templates/tree/main/scaffolder-templates/react-ssr-template/",
    },
  },
  spec: {
    type: "website",
    owner: "web@example.com",
    steps: [
      { id: "fetch", action: "fetch:template" },
      { id: "publish", action: "publish:github" },
    ],
  },
}

const enrichment: TemplateEnrichment = {
  whyUsed: "Starts a server-rendered React site fast.",
  fitCriteria: "Use for a customer-facing site that needs SSR.",
  fitFactors: [{ factor: "rendering", detail: "Needs SSR/SSG." }],
  risks: ["Couples you to the chosen meta-framework."],
  alternatives: [{ name: "Plain SPA", reason: "When SEO/SSR is not needed." }],
  learningNotes: "Understand SSR vs SPA trade-offs.",
  sources: [{ label: "Next.js docs", url: "https://nextjs.org/docs" }],
}

describe("mapBackstageTemplate", () => {
  it("maps a full template + enrichment to a complete registry row", () => {
    const row = mapBackstageTemplate(template, enrichment)

    // Mechanical fields from the template.
    expect(row.slug).toBe("backstage-react-ssr-template")
    expect(row.name).toBe("React SSR Template")
    expect(row.summary).toBe("Create a website powered by Next.js.")
    expect(row.category).toBe("Project Scaffold")
    expect(row.whatItGenerates).toContain("fetch:template")
    expect(row.whatItGenerates).toContain("publish:github")

    // Coaching fields from the enrichment.
    expect(row.whyUsed).toBe(enrichment.whyUsed)
    expect(row.fitFactors).toEqual(enrichment.fitFactors)
    expect(row.risks).toEqual(enrichment.risks)
    expect(row.alternatives).toEqual(enrichment.alternatives)
    expect(row.learningNotes).toBe(enrichment.learningNotes)

    // Provenance.
    expect(row.source).toBe("backstage")
    expect(row.sourceUrl).toContain("github.com/backstage/software-templates")
    expect(row.sourceFormat).toBe("backstage/scaffolder.v1beta3")

    // Sources include the origin plus the curated source.
    expect(row.sources.map((s) => s.url)).toContain("https://nextjs.org/docs")
    expect(
      row.sources.some((s) => s.url?.includes("software-templates")),
    ).toBe(true)
  })

  it("is deterministic — same inputs produce an equal row", () => {
    expect(mapBackstageTemplate(template, enrichment)).toEqual(
      mapBackstageTemplate(template, enrichment),
    )
  })

  it("namespaces the slug and falls back to metadata.name for the title", () => {
    const noTitle: BackstageTemplate = {
      ...template,
      metadata: { ...template.metadata, title: undefined },
    }
    const row = mapBackstageTemplate(noTitle, enrichment)
    expect(row.slug).toBe("backstage-react-ssr-template")
    expect(row.name).toBe("react-ssr-template")
  })

  it("derives a summary when the template has no description", () => {
    const noDesc: BackstageTemplate = {
      ...template,
      metadata: { ...template.metadata, description: undefined },
    }
    const row = mapBackstageTemplate(noDesc, enrichment)
    expect(row.summary).toContain("Backstage website software template")
  })

  it("honours an enrichment category override", () => {
    const row = mapBackstageTemplate(template, {
      ...enrichment,
      category: "Doc/Spec Template",
    })
    expect(row.category).toBe("Doc/Spec Template")
  })

  it("prefers an explicit sourceUrl option over the annotation", () => {
    const row = mapBackstageTemplate(template, enrichment, {
      sourceUrl: "https://example.com/my-template.yaml",
    })
    expect(row.sourceUrl).toBe("https://example.com/my-template.yaml")
  })

  it("fails closed when no source can be determined", () => {
    const noSource: BackstageTemplate = {
      ...template,
      metadata: { ...template.metadata, annotations: undefined },
    }
    const noSourceEnrichment: TemplateEnrichment = {
      ...enrichment,
      sources: undefined,
    }
    expect(() =>
      mapBackstageTemplate(noSource, noSourceEnrichment),
    ).toThrow(BackstageImportError)
  })

  it("maps a documentation template to the Doc/Spec category", () => {
    const docs: BackstageTemplate = {
      ...template,
      spec: { ...template.spec, type: "documentation" },
    }
    const row = mapBackstageTemplate(docs, {
      ...enrichment,
      category: undefined,
    })
    expect(row.category).toBe("Doc/Spec Template")
  })
})
