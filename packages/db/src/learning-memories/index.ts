// Public surface of the M10 Learning Memory and Portfolio Export backend
// (learning-memory-portfolio-export epic).
//
// - `memories`  — the typed `learning_memories` data-access layer:
//                 `getMemory`, `getMemoryByRepo`, `createMemory`,
//                 `updateMemory`, `upsertMemory` (the regeneration path),
//                 and `isMemoryStale` (drives the stale banner per
//                 PRD FR-11). Plus the `LearningMemoryContent` shape the
//                 generators (#179 composers, #180 Q&A, #181 résumé
//                 bullets) all produce (Issue #176).
// - `integrity` — the reusable file + stack-reference integrity check
//                 (`checkFileReferences`, `checkStackReferences`,
//                 `checkArtifactIntegrity`) the two bounded SDK calls
//                 (#180 Q&A, #181 résumé bullets) consume to verify every
//                 generated artifact only cites files M6 surfaced and
//                 technologies M5 explained (FR-3 / NFR-5, Issue #177).
//
// Additional sub-modules (the SDK calls, composers, exporters) land in
// the remaining M10 tasks (#179, #180, #181, #182, #183) and are
// re-exported here as they merge.

export {
  createMemory,
  getMemory,
  getMemoryByRepo,
  isMemoryStale,
  type LearningMemoryContent,
  updateMemory,
  upsertMemory,
} from "./memories"

export {
  checkArtifactIntegrity,
  checkFileReferences,
  checkStackReferences,
  type IntegrityArtifact,
  type IntegrityArtifactBullet,
  type IntegrityArtifactQA,
  type IntegrityResult,
} from "./integrity"

export {
  composeArchitectureExplanation,
  composeDebugStories,
  composeLearningMemoryTree,
} from "./compose"

export {
  GenerateInterviewQAError,
  type GenerateInterviewQAErrorKind,
  type GenerateInterviewQAOptions,
  InterviewQAIntegrityError,
  generateInterviewQA,
  parseInterviewQAItems,
} from "./generate-qa"

export {
  GenerateResumeBulletsError,
  type GenerateResumeBulletsErrorKind,
  type GenerateResumeBulletsOptions,
  ResumeBulletsIntegrityError,
  generateResumeBullets,
  parseResumeBulletItems,
} from "./generate-bullets"

export {
  type PortfolioMarkdownBundle,
  renderPortfolioMarkdownBundle,
} from "./export-markdown"

export { type PortfolioPdf, renderPortfolioPdf } from "./export-pdf"
