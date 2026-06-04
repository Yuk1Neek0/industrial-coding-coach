// Deterministic Backstage-template → registry-row mapper (M14, Issue #246).
//
// Pure function (no IO, no network, no LLM) that turns a parsed Backstage
// software template + its reviewed enrichment companion into a complete,
// valid `NewTemplate` (ADR 0010). Mechanical fields come from the template;
// coaching fields come from the enrichment; provenance is stamped. Fails closed
// if any NOT-NULL registry field would be empty.

import type { BackstageTemplate } from "./backstage-template"
import {
  type BackstageFixture,
  type TemplateEnrichment,
  loadBackstageFixtures,
} from "./template-enrichment"
import type { NewTemplate, TemplateSource } from "./schema"

/** The source format string stamped on imported rows. */
const SOURCE_FORMAT_PREFIX = "backstage/scaffolder"

/** Error thrown when a template cannot be mapped to a complete registry row. */
export class BackstageImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackstageImportError"
  }
}

/** Options for the mapper — chiefly the recorded upstream provenance URL. */
export interface MapBackstageOptions {
  /** Upstream `template.yaml` URL; overrides the source-location annotation. */
  sourceUrl?: string
}

/** Lowercase, hyphenate, collapse — a stable kebab-case slug fragment. */
function toKebab(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Map a Backstage `spec.type` / tags onto the registry category vocabulary. */
function deriveCategory(type: string, tags: string[] | undefined): string {
  const t = type.toLowerCase()
  if (tags?.some((tag) => tag.toLowerCase() === "security")) return "Security"
  if (/(^|[-_])(doc|docs|documentation|techdocs)([-_]|$)/.test(t)) {
    return "Doc/Spec Template"
  }
  if (/(ci|pipeline|workflow)/.test(t)) return "CI"
  // service / website / library / component / app / ... → a project scaffold.
  return "Project Scaffold"
}

/** Derive a non-empty "what it generates" from the scaffolder steps/type. */
function deriveWhatItGenerates(template: BackstageTemplate): string {
  const { type, steps } = template.spec
  const actions = (steps ?? []).map((s) => s.action)
  let text = `Scaffolds a ${type} project via the Backstage scaffolder`
  if (actions.length > 0) {
    text += `, running ${actions.length} step${
      actions.length > 1 ? "s" : ""
    }: ${actions.join(", ")}`
  }
  return `${text}.`
}

/** Extract a URL from a Backstage `backstage.io/source-location` annotation. */
function sourceLocationUrl(
  annotations: Record<string, string> | undefined,
): string | undefined {
  const loc = annotations?.["backstage.io/source-location"]
  if (!loc) return undefined
  const match = /^url:(.+)$/.exec(loc)
  if (match) return match[1]
  return loc.startsWith("http") ? loc : undefined
}

function requireNonEmpty(value: string, field: string): string {
  if (value.trim() === "") {
    throw new BackstageImportError(`mapped ${field} is empty`)
  }
  return value
}

/**
 * Map a parsed Backstage template + its enrichment to a registry `NewTemplate`.
 *
 * Deterministic: the same inputs always produce the same row. Throws
 * {@link BackstageImportError} if any required (NOT-NULL) field would be empty.
 */
export function mapBackstageTemplate(
  template: BackstageTemplate,
  enrichment: TemplateEnrichment,
  options: MapBackstageOptions = {},
): NewTemplate {
  const { metadata, spec, apiVersion } = template

  const slug = requireNonEmpty(
    `backstage-${toKebab(metadata.name)}`,
    "slug",
  )
  const name = requireNonEmpty(metadata.title ?? metadata.name, "name")
  const summary = requireNonEmpty(
    metadata.description ??
      `${name} — a Backstage ${spec.type} software template.`,
    "summary",
  )
  const category = requireNonEmpty(
    enrichment.category ?? deriveCategory(spec.type, metadata.tags),
    "category",
  )
  const whatItGenerates = requireNonEmpty(
    deriveWhatItGenerates(template),
    "whatItGenerates",
  )

  const sourceUrl =
    options.sourceUrl ?? sourceLocationUrl(metadata.annotations) ?? null

  // Origin + curated sources. The origin link is added when we know the URL.
  const originSources: TemplateSource[] = sourceUrl
    ? [{ label: "Backstage template source", url: sourceUrl }]
    : []
  const sources: TemplateSource[] = [
    ...originSources,
    ...(enrichment.sources ?? []),
  ]
  if (sources.length === 0) {
    throw new BackstageImportError("mapped sources is empty")
  }

  // Derive a stable source-format from the apiVersion (e.g. v1beta3).
  const version = apiVersion.split("/").pop() ?? "v1beta3"
  const sourceFormat = `${SOURCE_FORMAT_PREFIX}.${version}`

  return {
    slug,
    name,
    category,
    summary,
    whatItGenerates,
    whyUsed: enrichment.whyUsed,
    fitCriteria: enrichment.fitCriteria,
    fitFactors: enrichment.fitFactors,
    risks: enrichment.risks,
    alternatives: enrichment.alternatives,
    learningNotes: enrichment.learningNotes,
    sources,
    source: "backstage",
    sourceUrl,
    sourceFormat,
  }
}

/**
 * Load a set of bundled fixtures (parse + validate via the enrichment loader)
 * and map each to a registry row. The one-call path the seed uses to turn the
 * in-repo Backstage fixtures into insertable `NewTemplate[]`. Deterministic.
 */
export function importBackstageTemplates(
  fixtures: BackstageFixture[],
): NewTemplate[] {
  return loadBackstageFixtures(fixtures).map((fixture) =>
    mapBackstageTemplate(fixture.template, fixture.enrichment),
  )
}
