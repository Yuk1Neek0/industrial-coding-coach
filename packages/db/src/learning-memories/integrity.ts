// Reusable file + stack-reference integrity check for M10 Learning Memory
// & Portfolio Export (learning-memory-portfolio-export PRD FR-3 / NFR-5,
// Issue #177).
//
// This is the project-grounding guard the two M10 bounded SDK calls
// consume:
//   - the Q&A pack call (#180) calls it on every generated interview-style
//     answer before persistence; a rejection means the generator named a file
//     M6 did not surface or a technology M5 did not explain, and the
//     candidate is thrown away.
//   - the résumé-bullet call (#181) calls it on every generated bullet before
//     persistence; same failure mode.
//
// The check is the M10 analogue of M9's `../challenges/integrity-check.ts`
// (#141). The public shape mirrors what M9 ships so consumers — generation
// (#180/#181) and the integration task (#184) — learn one API across
// milestones. M9 checks against `project_maps` only; M10 checks against
// `project_maps` *and* `stack_explanations`, because M10 outputs cite both
// files (from the M6 map) and named technologies (from the M5 stack
// decision map).
//
// Pure module on the JS side: file/stack lookups are pulled from the M5 +
// M6 data-access layers inside this module so callers (the SDK calls and
// the integration layer) pass only the snapshot id + the references they
// extracted from the candidate. No SDK imports here.
//
// FR-3 normative: a file path is accepted iff `projectMap.keyFileMap`
// explicitly lists it (same R8 narrowness M9 enforces — adjacent-file
// inference is rejected even if the file exists in the snapshot). A
// technology name is accepted iff the M5 stack explanation's `tools[]`
// list names it; matching is *case-sensitive* (mirrors M9's `Set.has`
// behaviour so consumers do not get surprised by a quiet difference
// between the two milestones).

import { getProjectMap } from "../mapper/project-maps"
import { getStackExplanation } from "../stack/explanations"
import { createCatalogDb, type CatalogDb } from "../client"

/** Resolve the catalog DB: an injected one (tests) or a lazy package default. */
let defaultDb: CatalogDb | undefined
function resolveDb(override?: CatalogDb): CatalogDb {
  if (override) return override
  defaultDb ??= createCatalogDb()
  return defaultDb
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * The outcome of an integrity check. Shape mirrors M9's family of
 * `{ ok, missing }` results so consumers learn one API across milestones.
 *
 * `ok: true` means every reference resolved. `ok: false` carries the
 * `missing` list — the references that did *not* resolve, in the order they
 * were supplied, de-duplicated.
 */
export type IntegrityResult =
  | { ok: true }
  | { ok: false; missing: string[] }

// ---------------------------------------------------------------------------
// Local artifact input shape
// ---------------------------------------------------------------------------
//
// The M10 typed artifact shapes (`InterviewQA`, `ResumeBullet`) ship in a
// sister task (#176, `task/176-learning-memories-schema`) and are not yet
// in this worktree's base. To keep this module compilable and unblock the
// downstream SDK calls (#180 / #181), `checkArtifactIntegrity` accepts a
// minimal local shape that names only the reference-bearing fields the
// integrity check reads. The integration task (#184) rewires the consumers
// to pass real `InterviewQA[]` / `ResumeBullet[]` once #176 lands.
//
// TODO: tighten to InterviewQA / ResumeBullet from ../schema once #176 lands.

/**
 * The minimal shape of an in-flight interview-style Q&A item this module
 * reads. Generation (#180) hands its in-flight candidate before persistence.
 * The `sourceReferences` field carries the file paths the answer cites —
 * each must resolve to an M6-named file.
 */
export interface IntegrityArtifactQA {
  /** File paths the answer cites; each must be an M6 project-map-named file. */
  sourceReferences: string[]
}

/**
 * The minimal shape of an in-flight résumé bullet this module reads.
 * Generation (#181) hands its in-flight candidate before persistence. Both
 * the `technologies` (M5 stack names) and `sourceFiles` (M6 project-map
 * paths) fields must resolve.
 */
export interface IntegrityArtifactBullet {
  /** Stack technologies the bullet names; each must be M5-named. */
  technologies: string[]
  /** File paths the bullet cites; each must be M6-named. */
  sourceFiles: string[]
}

/**
 * The minimal artifact shape `checkArtifactIntegrity` accepts: a list of
 * in-flight Q&A items and/or a list of in-flight résumé bullets. Either
 * list may be omitted — the check runs over whichever lists are supplied.
 */
export interface IntegrityArtifact {
  /** In-flight interview-style Q&A items, if any. */
  interviewQa?: IntegrityArtifactQA[]
  /** In-flight résumé bullets, if any. */
  resumeBullets?: IntegrityArtifactBullet[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * De-duplicate `values` preserving first-seen order. The integrity check
 * reports each missing reference once even if a candidate names it twice —
 * a duplicated bad reference is still one mistake.
 */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/**
 * Run a check over `values` against the `allowed` set, returning the M10
 * {@link IntegrityResult}. Case-sensitive (mirrors M9's `Set.has` behaviour).
 *
 * Empty `values` always returns `ok: true` — there is nothing to verify.
 */
function checkAgainstSet(
  values: string[],
  allowed: Set<string>,
): IntegrityResult {
  if (values.length === 0) return { ok: true }
  const missing = dedupe(values.filter((v) => !allowed.has(v)))
  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}

// ---------------------------------------------------------------------------
// File-reference check (against M6 `project_maps`)
// ---------------------------------------------------------------------------

/**
 * Verify every file `path` in the supplied list resolves to a file the M6
 * project map for `snapshotId` explicitly names (FR-3).
 *
 * The authoritative set per FR-3 / R8 is `projectMap.keyFileMap[].path` —
 * those are the files M6 intentionally surfaced. Adjacent-file inference
 * (sibling `.test.ts`, `.d.ts`, `index.ts` barrels) is **rejected** even
 * when the file exists in the snapshot. The M6 map is the narrower
 * intentional set and that is what M10 must defer to.
 *
 * When no project map exists for the snapshot, every non-empty list of
 * paths fails — the M10 output cannot reference files when the project
 * never produced a map to cite from.
 *
 * @param snapshotId - the imported snapshot the artifact is tied to.
 * @param paths      - the file paths the artifact cites.
 * @param db         - optional injected catalog DB (tests); production
 *                     callers omit it and the package-local default is used.
 */
export async function checkFileReferences(
  snapshotId: number,
  paths: string[],
  db?: CatalogDb,
): Promise<IntegrityResult> {
  if (paths.length === 0) return { ok: true }
  const map = await getProjectMap(snapshotId, resolveDb(db))
  const allowed = new Set(map?.keyFileMap.map((f) => f.path) ?? [])
  return checkAgainstSet(paths, allowed)
}

// ---------------------------------------------------------------------------
// Stack-reference check (against M5 `stack_explanations`)
// ---------------------------------------------------------------------------

/**
 * Verify every technology name in the supplied list resolves to a tool the
 * M5 stack explanation for `snapshotId` names (FR-3).
 *
 * The authoritative set is `stackExplanation.tools[].name` — those are the
 * technologies M5 intentionally surfaced and explained. Matching is
 * **case-sensitive** by design: it mirrors M9's `Set.has` behaviour, and
 * the M10 generator is grounded by being handed the stack explanation in
 * its prompt, so it has the canonical casing to mirror. A
 * case-insensitive check would silently accept "next.js" when the map
 * names "Next.js" — losing the very grounding FR-3 enforces.
 *
 * When no stack explanation exists for the snapshot, every non-empty list
 * of technologies fails — the M10 output cannot cite stack tools when the
 * project never produced an explanation to cite from.
 *
 * @param snapshotId    - the imported snapshot the artifact is tied to.
 * @param technologies  - the technology names the artifact cites.
 * @param db            - optional injected catalog DB (tests); production
 *                        callers omit it and the package-local default is used.
 */
export async function checkStackReferences(
  snapshotId: number,
  technologies: string[],
  db?: CatalogDb,
): Promise<IntegrityResult> {
  if (technologies.length === 0) return { ok: true }
  const explanation = await getStackExplanation(snapshotId, resolveDb(db))
  const allowed = new Set(explanation?.tools.map((t) => t.name) ?? [])
  return checkAgainstSet(technologies, allowed)
}

// ---------------------------------------------------------------------------
// Combined artifact check
// ---------------------------------------------------------------------------

/**
 * Combined integrity check for a M10 in-flight artifact: pulls the
 * file paths and technology names out of the candidate's
 * `interviewQa[]` / `resumeBullets[]` lists and runs both
 * {@link checkFileReferences} and {@link checkStackReferences}.
 *
 * Returns one merged {@link IntegrityResult}. When both checks pass, the
 * artifact passes; otherwise the `missing` list is the concatenation of
 * both checks' missing lists (file paths first, then technology names),
 * de-duplicated globally so a name that appears in both files-and-stack
 * (unlikely but cheap to guard against) is reported once.
 *
 * The DAL lookups happen inside this module per FR-3 / Issue #177's "pure
 * function, M5/M6 DAL fetches inside" rule: consumers (#180, #181, #184)
 * pass the snapshot id and the candidate — they do not load the project
 * map or stack explanation themselves.
 *
 * @param snapshotId - the imported snapshot the artifact is tied to.
 * @param artifact   - the in-flight Q&A items + résumé bullets to verify.
 * @param db         - optional injected catalog DB (tests).
 */
export async function checkArtifactIntegrity(
  snapshotId: number,
  artifact: IntegrityArtifact,
  db?: CatalogDb,
): Promise<IntegrityResult> {
  const qaItems = artifact.interviewQa ?? []
  const bullets = artifact.resumeBullets ?? []

  const paths: string[] = []
  for (const qa of qaItems) paths.push(...qa.sourceReferences)
  for (const bullet of bullets) paths.push(...bullet.sourceFiles)

  const technologies: string[] = []
  for (const bullet of bullets) technologies.push(...bullet.technologies)

  const resolved = resolveDb(db)
  const [fileResult, stackResult] = await Promise.all([
    checkFileReferences(snapshotId, paths, resolved),
    checkStackReferences(snapshotId, technologies, resolved),
  ])

  if (fileResult.ok && stackResult.ok) return { ok: true }
  const missing = dedupe([
    ...(fileResult.ok ? [] : fileResult.missing),
    ...(stackResult.ok ? [] : stackResult.missing),
  ])
  return { ok: false, missing }
}
