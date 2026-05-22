// The M6 Project Logic Mapper RAG layer — public entry point
// (project-logic-mapper epic, Issue #104).
//
// `buildSnapshotRetriever` is the one call the LangGraph pipeline makes to
// stand up retrieval for a snapshot: load + split the snapshot's files into
// chunk `Document`s, then index them into an in-memory keyword retriever. The
// pipeline then retrieves only the code relevant to each step, instead of
// stuffing the whole repository into model context.
//
// `estimateTokens` and the `maxRetrievedChars` option are the token guard: the
// number of chunks returned (`k`) times the chunk size is a hard upper bound on
// retrieval size, so token use stays bounded regardless of repository size.
//
// Pure, deterministic, offline — no network, no LLM, no database. LangChain
// stays confined to the M6 pipeline package per ADR 0005.

import {
  loadSnapshotDocuments,
  type ChunkDocument,
  type SnapshotFile,
  type SplitOptions,
} from "./loader"
import {
  SnapshotKeywordRetriever,
  type SnapshotRetrieverOptions,
} from "./retriever"

/** Options for {@link buildSnapshotRetriever}. */
export interface BuildRetrieverOptions {
  /** How snapshot files are loaded and split — see {@link SplitOptions}. */
  split?: SplitOptions
  /** How retrieval is bounded — see {@link SnapshotRetrieverOptions}. */
  retrieval?: Pick<SnapshotRetrieverOptions, "k">
}

/**
 * The result of building the RAG layer for a snapshot — the retriever the
 * pipeline queries, plus the index stats a caller can log or assert on.
 */
export interface SnapshotRetrieverBundle {
  /** The keyword retriever — `retriever.invoke(query)` retrieves chunks. */
  retriever: SnapshotKeywordRetriever
  /** Every chunk document indexed, in load order. */
  documents: ChunkDocument[]
  /** Number of indexed chunk documents. */
  chunkCount: number
}

/**
 * Build the RAG retrieval layer for a repository snapshot (Issue #104).
 *
 * Loads + splits the snapshot's files into chunk documents and indexes them
 * into an in-memory keyword retriever. This is the single call the LangGraph
 * mapping pipeline (Issue #105) makes to obtain a retriever.
 *
 * Deterministic and offline — the same `files` and `options` always yield the
 * same retriever and ranking. A sparse snapshot (no files, empty files) still
 * produces a valid retriever; it simply retrieves nothing.
 *
 * @param files - the snapshot's files; the deterministic ingestion output
 *   (Issue #103) is assignable to {@link SnapshotFile} and passed directly.
 * @param options - split and retrieval bounds; see {@link BuildRetrieverOptions}.
 */
export function buildSnapshotRetriever(
  files: readonly SnapshotFile[],
  options?: BuildRetrieverOptions,
): SnapshotRetrieverBundle {
  const documents = loadSnapshotDocuments(files, options?.split)
  const retriever = SnapshotKeywordRetriever.fromDocuments(documents, {
    k: options?.retrieval?.k,
  })
  return { retriever, documents, chunkCount: documents.length }
}

/**
 * Estimate the token count of a string.
 *
 * A deliberately cheap, deterministic heuristic — ~4 characters per token, the
 * widely used rule of thumb — not a real tokenizer: the RAG layer needs a
 * *bound check*, not an exact count, and a heuristic keeps this module free of
 * a tokenizer dependency and any model coupling. It always over- rather than
 * under-estimates short strings, so it is safe to budget against.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Sum the estimated token count of a set of retrieved chunk documents.
 *
 * The LangGraph pipeline uses this to assert a retrieval result fits the token
 * budget for a step before sending it to the model — the concrete check behind
 * Issue #104's "token use stays bounded for large repositories".
 */
export function estimateRetrievedTokens(
  documents: readonly ChunkDocument[],
): number {
  return documents.reduce(
    (total, doc) => total + estimateTokens(doc.pageContent),
    0,
  )
}
