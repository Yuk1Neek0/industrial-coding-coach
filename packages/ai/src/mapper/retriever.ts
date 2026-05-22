// In-memory keyword retriever for the M6 Project Logic Mapper RAG layer
// (project-logic-mapper epic, Issue #104).
//
// This is the "retrieve" half of LangChain's RAG pattern: it indexes the chunk
// `Document`s the loader (`./loader`) produced and, given a query, returns only
// the chunks relevant to it — so a LangGraph pipeline step reasons over the
// code it needs instead of the whole repository. Keeping retrieval bounded is
// what keeps token use bounded for a large repo.
//
// It is a real LangChain retriever — `SnapshotKeywordRetriever` extends
// `BaseRetriever`, so it composes with the rest of the LangChain pipeline and
// is reached the same way any retriever is (`retriever.invoke(query)`).
//
// A keyword (TF-IDF-style) score is used rather than an embedding model: it is
// deterministic, needs no API key, makes NO live calls, and is sufficient for
// the MVP (ADR 0005 / Issue #104 allow an in-memory keyword retriever). The
// retriever stays inside the M6 pipeline package per ADR 0005.

import type { Document } from "@langchain/core/documents"
import {
  BaseRetriever,
  type BaseRetrieverInput,
} from "@langchain/core/retrievers"

import type { ChunkDocument, ChunkMetadata } from "./loader"

/** Options for {@link SnapshotKeywordRetriever}. */
export interface SnapshotRetrieverOptions extends BaseRetrieverInput {
  /**
   * Maximum number of chunks a single retrieval returns. The hard token bound
   * for retrieval: `k` chunks of at most `chunkSize` characters. Defaults to 6.
   */
  k?: number
}

/** A scored term — a query token and how distinctive it is across the corpus. */
interface IndexedTerm {
  /** The normalized term. */
  term: string
  /** Inverse-document-frequency weight: rarer terms score higher. */
  idf: number
}

/**
 * Lowercase a string and split it into alphanumeric terms. Identifier-ish
 * splitting only — punctuation is a separator — so `getImportedRepo` tokenizes
 * to `get`, `imported`, `repo` is intentionally NOT done; the whole identifier
 * is one term, which keeps an exact-symbol query precise.
 */
function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9_$]+/g)
  return matches ?? []
}

/** Term-frequency map for one document: term → count. */
function termFrequencies(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return counts
}

/**
 * An in-memory keyword retriever over a snapshot's chunk documents.
 *
 * Built via {@link SnapshotKeywordRetriever.fromDocuments}. Indexing is done
 * once up front; each {@link getRelevantDocuments} call scores every chunk
 * against the query with a TF-IDF dot product and returns the top `k`.
 *
 * Deterministic and offline: no embeddings, no network, no LLM. Identical
 * documents + query always yield the same ranked result.
 */
export class SnapshotKeywordRetriever extends BaseRetriever {
  static lc_name(): string {
    return "SnapshotKeywordRetriever"
  }

  /** LangChain serialization namespace — required by `BaseRetriever`. */
  lc_namespace = ["workspace", "ai", "mapper", "retriever"]

  /** Max chunks returned per retrieval. */
  readonly k: number

  /** The indexed chunk documents, in their original load order. */
  private readonly documents: ChunkDocument[]

  /** Per-document term-frequency maps, index-aligned with {@link documents}. */
  private readonly docTermFreqs: Map<string, number>[]

  /** Per-document token totals, for TF normalization. */
  private readonly docLengths: number[]

  /** Corpus-wide IDF weight per term. */
  private readonly idf: Map<string, number>

  private constructor(
    documents: ChunkDocument[],
    options?: SnapshotRetrieverOptions,
  ) {
    super(options)
    this.k = Math.max(1, Math.floor(options?.k ?? 6))
    this.documents = documents

    // Build the term-frequency index and document-frequency counts in one pass.
    this.docTermFreqs = []
    this.docLengths = []
    const docFreq = new Map<string, number>()
    for (const doc of documents) {
      const tokens = tokenize(doc.pageContent)
      const tf = termFrequencies(tokens)
      this.docTermFreqs.push(tf)
      this.docLengths.push(tokens.length)
      for (const term of tf.keys()) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1)
      }
    }

    // IDF: smoothed, so a term in every document still contributes a little.
    const n = documents.length
    this.idf = new Map()
    for (const [term, df] of docFreq) {
      this.idf.set(term, Math.log((n + 1) / (df + 1)) + 1)
    }
  }

  /**
   * Build a retriever by indexing chunk documents from the loader.
   *
   * @param documents - chunks from {@link import("./loader").loadSnapshotDocuments}.
   * @param options - retrieval options; see {@link SnapshotRetrieverOptions}.
   */
  static fromDocuments(
    documents: readonly ChunkDocument[],
    options?: SnapshotRetrieverOptions,
  ): SnapshotKeywordRetriever {
    return new SnapshotKeywordRetriever([...documents], options)
  }

  /** Number of indexed chunk documents. */
  get size(): number {
    return this.documents.length
  }

  /** Resolve the query's distinctive terms and their IDF weights. */
  private queryTerms(query: string): IndexedTerm[] {
    const terms: IndexedTerm[] = []
    for (const term of new Set(tokenize(query))) {
      const idf = this.idf.get(term)
      // A term absent from the whole corpus cannot discriminate — skip it.
      if (idf !== undefined) terms.push({ term, idf })
    }
    return terms
  }

  /**
   * Score one document against the query terms: a TF-IDF dot product, with
   * term frequency normalized by document length so a long file is not
   * favored purely for its size.
   */
  private scoreDocument(docIndex: number, terms: IndexedTerm[]): number {
    const tf = this.docTermFreqs[docIndex]!
    const length = this.docLengths[docIndex]!
    if (length === 0) return 0
    let score = 0
    for (const { term, idf } of terms) {
      const count = tf.get(term) ?? 0
      if (count > 0) score += (count / length) * idf
    }
    return score
  }

  /**
   * Retrieve the chunks most relevant to `query` — the `BaseRetriever` hook.
   *
   * Returns at most `k` documents, ranked by descending TF-IDF score; ties and
   * a query with no indexable terms fall back to the documents' original load
   * order, so the result is always deterministic. A retrieval over an empty
   * index returns `[]`.
   */
  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const terms = this.queryTerms(query)
    if (terms.length === 0 || this.documents.length === 0) return []

    const ranked = this.documents
      .map((doc, index) => ({
        doc,
        index,
        score: this.scoreDocument(index, terms),
      }))
      .filter((entry) => entry.score > 0)
      // Descending score; stable tie-break on original index.
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, this.k)

    return ranked.map((entry) => entry.doc)
  }

  /**
   * Retrieve the relevant chunks as their typed {@link ChunkDocument} form,
   * preserving the {@link ChunkMetadata} (`source`, `chunk`, `chunkCount`).
   *
   * A convenience over `invoke` for callers that need the chunk metadata — the
   * LangGraph pipeline uses it to cite real snapshot paths.
   */
  async retrieveChunks(query: string): Promise<ChunkDocument[]> {
    const docs = await this._getRelevantDocuments(query)
    return docs as ChunkDocument[]
  }
}

export type { ChunkMetadata }
