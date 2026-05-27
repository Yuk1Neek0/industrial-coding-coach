// Public surface of the M10 Learning Memory & Portfolio Export backend
// (learning-memory-portfolio-export epic).
//
// - `integrity` — the reusable file + stack-reference integrity check
//                 (`checkFileReferences`, `checkStackReferences`,
//                 `checkArtifactIntegrity`) the two bounded SDK calls
//                 (#180 Q&A, #181 résumé bullets) consume to verify every
//                 generated artifact only cites files M6 surfaced and
//                 technologies M5 explained (FR-3 / NFR-5, Issue #177).
//
// Additional sub-modules (`memories` data-access layer, the SDK calls)
// land in sister tasks (#176, #180, #181) and are re-exported here as
// they merge.

export {
  checkArtifactIntegrity,
  checkFileReferences,
  checkStackReferences,
  type IntegrityArtifact,
  type IntegrityArtifactBullet,
  type IntegrityArtifactQA,
  type IntegrityResult,
} from "./integrity"
