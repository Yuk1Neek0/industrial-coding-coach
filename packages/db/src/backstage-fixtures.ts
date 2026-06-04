// Bundled Backstage template fixtures + reviewed enrichment (M14, Issue #247).
//
// The importer is local-first (ADR 0010): the importable Backstage templates
// ship as version-controlled `template.yaml` files under
// `fixtures/backstage/`, each paired here with a hand-authored, reviewed
// enrichment companion supplying the coaching fields Backstage does not carry.
// The `source` URL is taken from each template's `backstage.io/source-location`
// annotation by the mapper (#246). The seed (#248) runs these through the mapper.

import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type {
  BackstageFixture,
  TemplateEnrichment,
} from "./template-enrichment"

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "backstage",
)

function readTemplateYaml(name: string): string {
  return readFileSync(path.join(fixturesDir, `${name}.template.yaml`), "utf8")
}

/**
 * Reviewed enrichment companions, keyed by fixture name (the `template.yaml`
 * base name). Hand-authored and reviewed — never naked LLM output. Each fills
 * every coaching field the mapper needs.
 */
const enrichments: Record<string, TemplateEnrichment> = {
  "react-ssr-template": {
    whyUsed:
      "It gives a team a one-click, server-rendered React (Next.js) website " +
      "wired to a repository and registered in the software catalog, so a new " +
      "frontend starts with SSR, routing, and CI already in place instead of " +
      "being assembled by hand.",
    fitCriteria:
      "Fits a customer-facing web UI that benefits from server-side rendering " +
      "or static generation (SEO, fast first paint). Overkill for an internal " +
      "tool or a pure client-side SPA with no SEO needs.",
    fitFactors: [
      {
        factor: "Rendering needs",
        detail:
          "Best when SSR/SSG matters (SEO, first-paint); a plain SPA does not " +
          "need it.",
      },
      {
        factor: "Stack",
        detail: "Commits you to React + Next.js and its conventions.",
      },
      {
        factor: "Onboarding speed",
        detail:
          "Fits teams that want a repo + CI + catalog entry generated, not " +
          "configured by hand.",
      },
    ],
    risks: [
      "Couples the project to Next.js — migrating rendering frameworks later " +
        "is costly.",
      "The generated CI/skeleton must still be reviewed; scaffolded code is a " +
        "starting point, not a finished, audited app.",
    ],
    alternatives: [
      {
        name: "create-next-app (no Backstage)",
        reason:
          "Simpler when you just need a Next.js app and are not standardising " +
          "scaffolding across an org via Backstage.",
      },
      {
        name: "Client-only React (Vite SPA)",
        reason: "When SEO/SSR is irrelevant and a lighter setup is preferred.",
      },
    ],
    learningNotes:
      "Read this to understand what a Backstage scaffolder template is: a " +
      "`template.yaml` whose `spec.steps` (fetch:template → publish:github → " +
      "catalog:register) automate creating a repo from a skeleton and " +
      "registering it. Notice how SSR is a deliberate choice with trade-offs, " +
      "not a default.",
    sources: [
      { label: "Next.js documentation", url: "https://nextjs.org/docs" },
      {
        label: "Backstage Software Templates",
        url: "https://backstage.io/docs/features/software-templates/",
      },
    ],
  },
  "springboot-grpc-template": {
    whyUsed:
      "It scaffolds a Spring Boot gRPC microservice with Gradle and CI, giving " +
      "a backend team a service that speaks a typed, contract-first protocol " +
      "(protobuf/gRPC) from day one and is registered in the catalog.",
    fitCriteria:
      "Fits an internal microservice that needs low-latency, strongly-typed " +
      "service-to-service calls (gRPC). Not a fit for a browser-facing API " +
      "(where REST/JSON is usually simpler) or a non-JVM team.",
    fitFactors: [
      {
        factor: "Protocol",
        detail:
          "Best when you want typed RPC (protobuf/gRPC) between services, not " +
          "public REST.",
      },
      {
        factor: "Runtime",
        detail: "Commits you to the JVM / Spring Boot / Gradle ecosystem.",
      },
      {
        factor: "Org standardisation",
        detail:
          "Fits orgs standardising service scaffolds and catalog registration " +
          "via Backstage.",
      },
    ],
    risks: [
      "gRPC adds tooling (protobuf compilation, code generation) and is harder " +
        "to call from browsers than REST.",
      "Spring Boot's footprint and startup time can be heavy for very small " +
        "services.",
    ],
    alternatives: [
      {
        name: "Spring Boot REST service",
        reason:
          "When clients are browsers or you want the simplest HTTP/JSON API.",
      },
      {
        name: "A lighter JVM framework (Quarkus/Micronaut)",
        reason: "When fast startup / low memory (e.g. serverless) matters more.",
      },
    ],
    learningNotes:
      "Use this to see contract-first service design in practice: gRPC means " +
      "the protobuf schema is the contract both sides compile against. Compare " +
      "its scaffolder steps to the React template — same fetch→publish→register " +
      "shape, different stack and protocol.",
    sources: [
      { label: "gRPC documentation", url: "https://grpc.io/docs/" },
      {
        label: "Spring Boot",
        url: "https://spring.io/projects/spring-boot",
      },
    ],
  },
  "docs-template": {
    whyUsed:
      "It creates a TechDocs documentation site (MkDocs) wired to a repo and " +
      "the catalog, so docs live as versioned Markdown next to code and render " +
      "in the developer portal — docs-as-code instead of a separate wiki.",
    fitCriteria:
      "Fits any component that needs maintained, reviewable documentation " +
      "co-located with its source. Less relevant for a throwaway prototype " +
      "with no audience.",
    fitFactors: [
      {
        factor: "Docs-as-code",
        detail:
          "Best when docs should be versioned, reviewed in PRs, and rendered " +
          "in the portal.",
      },
      {
        factor: "Tooling",
        detail: "Assumes MkDocs/TechDocs conventions and Markdown authoring.",
      },
    ],
    risks: [
      "Docs still rot if no one maintains them — scaffolding the site does not " +
        "guarantee good content.",
      "TechDocs rendering/publishing needs supporting infrastructure to be set " +
        "up in the portal.",
    ],
    alternatives: [
      {
        name: "A hosted wiki (Confluence/Notion)",
        reason:
          "When docs are not tied to a repo or non-engineers own most editing.",
      },
      {
        name: "A plain README",
        reason: "When a single file is enough and a full docs site is overkill.",
      },
    ],
    learningNotes:
      "Read this to understand docs-as-code: documentation is Markdown in the " +
      "repo, built by MkDocs and surfaced via TechDocs. Note this template's " +
      "`spec.type: documentation` — the importer maps that to the registry's " +
      "Doc/Spec Template category.",
    sources: [
      {
        label: "Backstage TechDocs",
        url: "https://backstage.io/docs/features/techdocs/",
      },
      { label: "MkDocs", url: "https://www.mkdocs.org/" },
    ],
  },
}

/**
 * The bundled Backstage fixtures: each `template.yaml` paired with its reviewed
 * enrichment companion. Consumed by the seed (#248) and by tests.
 */
export const backstageFixtures: BackstageFixture[] = Object.keys(enrichments)
  .sort()
  .map((name) => ({
    name,
    templateYaml: readTemplateYaml(name),
    enrichment: enrichments[name]!,
  }))
