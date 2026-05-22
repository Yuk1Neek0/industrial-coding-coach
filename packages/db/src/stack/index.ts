// Public surface of the M5 Stack Decision Explainer backend (stack-explainer
// epic, Issues #85–#87).
//
// - `detect`        — deterministic stack detection from snapshot files (#85).
// - `explain`       — the bounded Anthropic SDK explanation call (#86).
// - `explanations`  — the `stack_explanations` data-access layer (#87).

export {
  detectStack,
  detectStackForSnapshot,
  type DetectedStack,
  type DetectedTool,
  type DetectionFile,
  type ToolCategory,
} from "./detect"
