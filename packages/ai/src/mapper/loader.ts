// Snapshot loading + splitting for the M6 Project Logic Mapper RAG layer
// (project-logic-mapper epic, Issue #104).
//
// This is the "load + split" half of LangChain's retrieve-augment-generate
// pattern: it turns a repository snapshot's files into LangChain `Document`s,
// chunked small enough that the LangGraph pipeline can retrieve only the code
// relevant to a step instead of stuffing the whole repo into model context.
//
// Pure and deterministic: no network, no LLM, no database access. The same
// snapshot always yields the same documents in the same order. LangChain stays
// confined to the M6 pipeline package per ADR 0005 — this module produces
// `@langchain/core` `Document`s the retriever (`./retriever`) then indexes.

import { Document } from "@langchain/core/documents"

/**
 * The minimal snapshot-file shape the RAG layer needs — a repo-relative path
 * and the file's text content.
 *
 * Deliberately a local structural type, not an import from `@workspace/db`:
 * `@workspace/db` already depends on `@workspace/ai`, so importing back would
 * be a dependency cycle. The deterministic ingestion output (Issue #103) is
 * assignable to this shape (`IngestionFile` is `Pick<RepoFile, "path" |
 * "content">`), so the pipeline passes ingestion's files straight through.
 */
export interface SnapshotFile {
  /** Repo-relative path, e.g. `apps/web/app/page.tsx`. */
  path: string
  /** The file's full text content. */
  content: string
}

/** Metadata attached to every chunk `Document` the loader emits. */
export interface ChunkMetadata {
  /** Repo-relative path of the source file this chunk came from. */
  source: string
  /** Zero-based index of this chunk within its source file. */
  chunk: number
  /** Total number of chunks the source file was split into. */
  chunkCount: number
}

/** A LangChain `Document` carrying a code chunk and its {@link ChunkMetadata}. */
export type ChunkDocument = Document<ChunkMetadata>

/** Options controlling how snapshot files are split into chunks. */
export interface SplitOptions {
  /**
   * Maximum characters per chunk. A file longer than this is split into
   * multiple chunks; a shorter file becomes a single chunk. Defaults to 1200 —
   * roughly 300 tokens, small enough to keep retrieval token-bounded.
   */
  chunkSize?: number
  /**
   * Characters of overlap carried from the end of one chunk into the start of
   * the next, so a construct straddling a boundary stays retrievable from
   * either side. Defaults to 150. Clamped below `chunkSize`.
   */
  chunkOverlap?: number
  /**
   * Skip files larger than this many characters entirely — a minified bundle
   * or a lockfile is noise, not code worth indexing. Defaults to 1_000_000
   * (~1 MB). A skipped file contributes no documents.
   */
  maxFileChars?: number
}

/** Resolved {@link SplitOptions} with every default applied. */
interface ResolvedSplitOptions {
  chunkSize: number
  chunkOverlap: number
  maxFileChars: number
}

/** Default split options — see {@link SplitOptions} for the rationale. */
const DEFAULT_SPLIT_OPTIONS: ResolvedSplitOptions = {
  chunkSize: 1200,
  chunkOverlap: 150,
  maxFileChars: 1_000_000,
}

/** Apply defaults and clamp `chunkOverlap` below `chunkSize`. */
function resolveSplitOptions(options?: SplitOptions): ResolvedSplitOptions {
  const chunkSize = Math.max(
    1,
    Math.floor(options?.chunkSize ?? DEFAULT_SPLIT_OPTIONS.chunkSize),
  )
  const requestedOverlap = Math.max(
    0,
    Math.floor(options?.chunkOverlap ?? DEFAULT_SPLIT_OPTIONS.chunkOverlap),
  )
  return {
    chunkSize,
    // Overlap must leave forward progress — clamp it below the chunk size.
    chunkOverlap: Math.min(requestedOverlap, chunkSize - 1),
    maxFileChars: Math.max(
      1,
      Math.floor(options?.maxFileChars ?? DEFAULT_SPLIT_OPTIONS.maxFileChars),
    ),
  }
}

/**
 * Separators tried in order when splitting source text — the recursive
 * character-splitting strategy LangChain documents. Splitting first on the
 * largest natural boundary (blank lines, then lines) keeps a chunk coherent;
 * the empty-string fallback guarantees termination on a run with no boundary.
 */
const SPLIT_SEPARATORS: readonly string[] = ["\n\n", "\n", " ", ""]

/**
 * Recursively split `text` into pieces no longer than `chunkSize`, preferring
 * the largest natural separator that makes progress. A piece already within
 * `chunkSize` is returned whole; otherwise it is split on the best separator
 * and the parts are recursively split again.
 */
function splitText(text: string, chunkSize: number): string[] {
  if (text.length <= chunkSize) return text.length > 0 ? [text] : []

  for (const separator of SPLIT_SEPARATORS) {
    if (separator === "") break
    if (!text.includes(separator)) continue
    const pieces = text.split(separator)
    // Only useful if it actually divides the text into more than one piece.
    if (pieces.length < 2) continue
    const out: string[] = []
    for (let i = 0; i < pieces.length; i += 1) {
      // Re-attach the separator to every piece but the first, so joining the
      // pieces back together reproduces the original text exactly.
      const withSep = i === 0 ? pieces[i]! : separator + pieces[i]!
      if (withSep.length > chunkSize) {
        for (const sub of splitText(withSep, chunkSize)) out.push(sub)
      } else {
        out.push(withSep)
      }
    }
    return out.filter((piece) => piece.length > 0)
  }

  // No separator helped (e.g. a single very long token): hard-slice.
  const out: string[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    out.push(text.slice(i, i + chunkSize))
  }
  return out
}

/**
 * Merge fine-grained pieces from {@link splitText} into final chunks, packing
 * pieces up to `chunkSize` and carrying `chunkOverlap` characters of context
 * from the end of one chunk into the start of the next.
 */
function mergePieces(
  pieces: string[],
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const chunks: string[] = []
  let current = ""
  for (const piece of pieces) {
    if (current.length > 0 && current.length + piece.length > chunkSize) {
      chunks.push(current)
      current = chunkOverlap > 0 ? current.slice(-chunkOverlap) : ""
    }
    current += piece
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

/**
 * Split one file's content into ordered chunk strings. A file within
 * `chunkSize` becomes a single chunk; a longer file is split on natural
 * boundaries with overlap. Returns `[]` for empty content.
 */
function chunkFileContent(
  content: string,
  options: ResolvedSplitOptions,
): string[] {
  if (content.length === 0) return []
  if (content.length <= options.chunkSize) return [content]
  // Split into pieces no larger than `chunkSize - chunkOverlap`, so that when
  // `mergePieces` prepends up to `chunkOverlap` characters of carried context
  // the merged chunk still respects the `chunkSize` bound.
  const pieceSize = Math.max(1, options.chunkSize - options.chunkOverlap)
  const pieces = splitText(content, pieceSize)
  return mergePieces(pieces, options.chunkSize, options.chunkOverlap)
}

/**
 * Load and split a repository snapshot's files into LangChain `Document`
 * chunks ready for indexing (Issue #104).
 *
 * The "load + split" stage of the RAG layer: each file is chunked into pieces
 * small enough to retrieve individually, and every chunk carries its source
 * path and position so a retrieved chunk can be traced back to a real file.
 *
 * Pure and deterministic — the same `files` and `options` always yield the
 * same documents. Files with empty content, and files larger than
 * `maxFileChars`, contribute no documents (graceful degradation: a sparse or
 * binary-heavy snapshot still loads, it just yields fewer chunks).
 *
 * @param files - the snapshot's files; the deterministic ingestion output
 *   (Issue #103) is assignable to {@link SnapshotFile} and passed directly.
 * @param options - chunk sizing; see {@link SplitOptions} for the defaults.
 */
export function loadSnapshotDocuments(
  files: readonly SnapshotFile[],
  options?: SplitOptions,
): ChunkDocument[] {
  const resolved = resolveSplitOptions(options)
  const documents: ChunkDocument[] = []

  // Sort by path so the document order is deterministic regardless of how the
  // caller ordered the files.
  const ordered = [...files].sort((a, b) => a.path.localeCompare(b.path))

  for (const file of ordered) {
    if (file.content.length === 0) continue
    if (file.content.length > resolved.maxFileChars) continue
    const chunks = chunkFileContent(file.content, resolved)
    for (let index = 0; index < chunks.length; index += 1) {
      documents.push(
        new Document<ChunkMetadata>({
          pageContent: chunks[index] ?? "",
          metadata: {
            source: file.path,
            chunk: index,
            chunkCount: chunks.length,
          },
        }),
      )
    }
  }

  return documents
}
