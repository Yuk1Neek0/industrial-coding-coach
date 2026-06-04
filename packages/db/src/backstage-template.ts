// Typed model + parser for Backstage software templates (M14, Issue #244).
//
// Covers the subset of a Backstage scaffolder `template.yaml`
// (`kind: Template`, `scaffolder.backstage.io/v1beta3`) that the M14 importer
// consumes (ADR 0010). Parsing is deterministic and offline — it reads YAML
// text only; it never touches the network or an LLM. Anything malformed or
// missing a required field throws a typed {@link BackstageTemplateError} so the
// importer can fail closed.

import { parse as parseYaml } from "yaml"

/** Error thrown when a `template.yaml` is malformed or missing a required field. */
export class BackstageTemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackstageTemplateError"
  }
}

/** The `metadata` block of a Backstage software template. */
export interface BackstageTemplateMetadata {
  /** Stable identifier (kebab-case in practice). Required. */
  name: string
  /** Human-friendly display title. */
  title?: string
  /** One-line description. */
  description?: string
  /** Free-form tags used for discovery (e.g. `react`, `recommended`). */
  tags?: string[]
  /** Arbitrary annotations (e.g. source-location). */
  annotations?: Record<string, string>
}

/** One scaffolder step — what the template *does* when run. */
export interface BackstageTemplateStep {
  id?: string
  name?: string
  /** The scaffolder action, e.g. `fetch:template`, `publish:github`. Required. */
  action: string
  input?: Record<string, unknown>
}

/** The `spec` block of a Backstage software template. */
export interface BackstageTemplateSpec {
  /** The template type, e.g. `service`, `website`, `documentation`. Required. */
  type: string
  /** The owning user/group (entity reference). */
  owner?: string
  /** Input parameters (a JSON-schema object or an array of step objects). */
  parameters?: unknown
  /** The scaffolder steps. */
  steps?: BackstageTemplateStep[]
}

/**
 * A parsed Backstage software template — the subset the M14 importer maps onto
 * the Template Registry schema.
 */
export interface BackstageTemplate {
  apiVersion: string
  kind: "Template"
  metadata: BackstageTemplateMetadata
  spec: BackstageTemplateSpec
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireNonEmptyString(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BackstageTemplateError(
      `Backstage template ${field} must be a non-empty string`,
    )
  }
  return value
}

function parseSteps(value: unknown): BackstageTemplateStep[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new BackstageTemplateError("spec.steps must be an array when present")
  }
  return value.map((step, i) => {
    if (!isRecord(step)) {
      throw new BackstageTemplateError(`spec.steps[${i}] must be an object`)
    }
    const action = requireNonEmptyString(step.action, `spec.steps[${i}].action`)
    return {
      action,
      id: typeof step.id === "string" ? step.id : undefined,
      name: typeof step.name === "string" ? step.name : undefined,
      input: isRecord(step.input) ? step.input : undefined,
    }
  })
}

/**
 * Parse raw `template.yaml` text into a typed {@link BackstageTemplate}.
 *
 * Validates that the document is a `kind: Template` with the required
 * `metadata.name` and `spec.type`. Throws {@link BackstageTemplateError} on
 * malformed YAML, the wrong `kind`, or a missing required field.
 */
export function parseBackstageTemplate(yamlText: string): BackstageTemplate {
  let doc: unknown
  try {
    doc = parseYaml(yamlText)
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new BackstageTemplateError(`invalid YAML: ${detail}`)
  }

  if (!isRecord(doc)) {
    throw new BackstageTemplateError(
      "template.yaml must be a YAML mapping (object)",
    )
  }

  if (doc.kind !== "Template") {
    throw new BackstageTemplateError(
      `expected kind: Template, got ${JSON.stringify(doc.kind)}`,
    )
  }

  const apiVersion = requireNonEmptyString(doc.apiVersion, "apiVersion")

  if (!isRecord(doc.metadata)) {
    throw new BackstageTemplateError("metadata must be an object")
  }
  if (!isRecord(doc.spec)) {
    throw new BackstageTemplateError("spec must be an object")
  }

  const md = doc.metadata
  const spec = doc.spec

  const metadata: BackstageTemplateMetadata = {
    name: requireNonEmptyString(md.name, "metadata.name"),
    title: typeof md.title === "string" ? md.title : undefined,
    description: typeof md.description === "string" ? md.description : undefined,
    tags: Array.isArray(md.tags)
      ? md.tags.filter((t): t is string => typeof t === "string")
      : undefined,
    annotations: isRecord(md.annotations)
      ? Object.fromEntries(
          Object.entries(md.annotations).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : undefined,
  }

  const parsedSpec: BackstageTemplateSpec = {
    type: requireNonEmptyString(spec.type, "spec.type"),
    owner: typeof spec.owner === "string" ? spec.owner : undefined,
    parameters: spec.parameters,
    steps: parseSteps(spec.steps),
  }

  return { apiVersion, kind: "Template", metadata, spec: parsedSpec }
}
