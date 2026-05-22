// Public surface of the M6 Project Logic Mapper
// (project-logic-mapper epic, Issues #104 + #105).
//
// The LangChain.js RAG layer (#104) and the LangGraph mapping pipeline (#105).
// LangChain/LangGraph stay confined to this M6 package per ADR 0005.
//
// - `rag`       — the retrieval entry point (`buildSnapshotRetriever`) +
//                 token-bound helpers the pipeline calls.
// - `loader`    — load + split snapshot files into LangChain `Document`s.
// - `retriever` — the in-memory keyword retriever (`BaseRetriever` subclass).
// - `pipeline`  — the LangGraph state-graph mapping pipeline that produces the
//                 one typed structure with all seven project-map outputs.
// - `model`     — the chat-model seam the pipeline's agentic nodes call,
//                 backed by LangChain's Anthropic integration.
// - `ingest-types` — the structural shape of the #103 ingestion output the
//                 pipeline consumes.

export {
  buildSnapshotRetriever,
  estimateTokens,
  estimateRetrievedTokens,
  type BuildRetrieverOptions,
  type SnapshotRetrieverBundle,
} from "./rag"

export {
  loadSnapshotDocuments,
  type ChunkDocument,
  type ChunkMetadata,
  type SnapshotFile,
  type SplitOptions,
} from "./loader"

export {
  SnapshotKeywordRetriever,
  type SnapshotRetrieverOptions,
} from "./retriever"

export {
  assembleMermaid,
  buildMappingGraph,
  detectAiIntegration,
  extractJson,
  runMappingPipeline,
  type ArchitectureSection,
  type DebugPathStep,
  type FlowStep,
  type MappingPipelineInput,
  type MappingPipelineResult,
  type ProjectMapContent,
  type ProjectMapFile,
} from "./pipeline"

export {
  createAnthropicMapperModel,
  messageContentToText,
  type AnthropicMapperModelOptions,
  type MapperModel,
  type MapperModelRequest,
} from "./model"

export type {
  DependencyEdge,
  DependencyGraph,
  DetectedFramework,
  EntryPoint,
  ExternalDependency,
  FileTreeNode,
  IngestedProject,
  ModuleNode,
} from "./ingest-types"
