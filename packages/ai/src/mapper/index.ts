// Public surface of the M6 Project Logic Mapper RAG layer
// (project-logic-mapper epic, Issue #104).
//
// The LangChain.js retrieval layer: load + split a snapshot's files into chunk
// documents, then index them into an in-memory keyword retriever so the
// LangGraph pipeline (Issue #105) retrieves only the code relevant to each
// step. LangChain stays confined to the M6 pipeline package per ADR 0005.
//
// - `rag`       — the entry point (`buildSnapshotRetriever`) + token-bound
//                 helpers the pipeline calls.
// - `loader`    — load + split snapshot files into LangChain `Document`s.
// - `retriever` — the in-memory keyword retriever (`BaseRetriever` subclass).

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
