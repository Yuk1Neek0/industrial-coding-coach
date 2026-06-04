// Enrichment companion format + fixture loader for Backstage import (M14, #245).
//
// A Backstage `template.yaml` carries only mechanical metadata; it does NOT
// carry the registry's coaching fields. Per ADR 0010 those come from a typed,
// version-controlled "enrichment companion" authored and reviewed by a human,
// so every imported row stays fully populated with no naked LLM output.
//
// This module defines that companion type and a loader that pairs each fixture
// `template.yaml` with its companion (by a stable name key) and validates the
// pair, failing closed if a companion is missing or a required coaching field is
// empty. The deterministic mapping to a registry row is #246.

import {
  type BackstageTemplate,
  parseBackstageTemplate,
} from "./backstage-template"
import type {
  TemplateAlternative,
  TemplateFitFactor,
  TemplateRisk,
  TemplateSource,
} from "./schema"

/** Error thrown when a fixture is unpaired or its enrichment is incomplete. */
export class TemplateEnrichmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TemplateEnrichmentError"
  }
}

/**
 * The reviewed coaching fields a Backstage `template.yaml` cannot provide. Field
 * types reuse the registry schema's JSON types so enrichment and registry rows
 * stay consistent.
 */
export interface TemplateEnrichment {
  /** Why this template is used / the problem it solves. */
  whyUsed: string
  /** When this template fits a project or Golden Path. */
  fitCriteria: string
  /** Structured fit factors — the dimensions M4 will score against. */
  fitFactors: TemplateFitFactor[]
  /** Risks/cautions the template carries. */
  risks: TemplateRisk[]
  /** Alternatives to this template and the reason each might be chosen. */
  alternatives: TemplateAlternative[]
  /** What the user should learn from / about this template. */
  learningNotes: string
  /** Optional override of the category the mapper would otherwise derive. */
  category?: string
  /** Extra curated sources, merged with the template's origin URL by the mapper. */
  sources?: TemplateSource[]
}

/** A fixture pair before parsing: raw `template.yaml` text + its companion. */
export interface BackstageFixture {
  /** Stable key — the template.yaml base name; ties the pair together. */
  name: string
  /** Raw `template.yaml` text. */
  templateYaml: string
  /** Reviewed enrichment companion. */
  enrichment: TemplateEnrichment
}

/** A loaded fixture: parsed Backstage template + its validated enrichment. */
export interface LoadedBackstageFixture {
  name: string
  template: BackstageTemplate
  enrichment: TemplateEnrichment
}

function requireText(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TemplateEnrichmentError(`${where} must be a non-empty string`)
  }
  return value
}

function requireNonEmptyArray(value: unknown, where: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TemplateEnrichmentError(`${where} must be a non-empty array`)
  }
}

/**
 * Validate that an enrichment companion fills every required coaching field.
 * Throws {@link TemplateEnrichmentError} on the first empty field.
 */
export function validateEnrichment(
  name: string,
  enrichment: TemplateEnrichment,
): TemplateEnrichment {
  const at = `enrichment for "${name}":`
  requireText(enrichment.whyUsed, `${at} whyUsed`)
  requireText(enrichment.fitCriteria, `${at} fitCriteria`)
  requireText(enrichment.learningNotes, `${at} learningNotes`)
  requireNonEmptyArray(enrichment.fitFactors, `${at} fitFactors`)
  requireNonEmptyArray(enrichment.risks, `${at} risks`)
  requireNonEmptyArray(enrichment.alternatives, `${at} alternatives`)
  return enrichment
}

/**
 * Pair raw `template.yaml` texts with their enrichment companions by matching
 * name key. Throws if any template lacks a companion or any companion lacks a
 * template — a fixture must always come as a complete pair.
 */
export function pairFixtures(
  templateYamls: Record<string, string>,
  enrichments: Record<string, TemplateEnrichment>,
): BackstageFixture[] {
  const names = new Set([
    ...Object.keys(templateYamls),
    ...Object.keys(enrichments),
  ])
  return [...names].sort().map((name) => {
    const templateYaml = templateYamls[name]
    const enrichment = enrichments[name]
    if (templateYaml === undefined) {
      throw new TemplateEnrichmentError(
        `enrichment "${name}" has no matching template.yaml`,
      )
    }
    if (enrichment === undefined) {
      throw new TemplateEnrichmentError(
        `template.yaml "${name}" has no matching enrichment companion`,
      )
    }
    return { name, templateYaml, enrichment }
  })
}

/**
 * Parse and validate a set of fixtures: parses each `template.yaml` and
 * validates each enrichment. Fails closed on any malformed template or
 * incomplete enrichment.
 */
export function loadBackstageFixtures(
  fixtures: BackstageFixture[],
): LoadedBackstageFixture[] {
  return fixtures.map((fixture) => ({
    name: fixture.name,
    template: parseBackstageTemplate(fixture.templateYaml),
    enrichment: validateEnrichment(fixture.name, fixture.enrichment),
  }))
}
