// Tests for the M6 Project Logic Mapper RAG layer (Issue #104).
//
// Exercises load + split, the keyword retriever's ranking, the token bound,
// and an end-to-end retrieval over a sample snapshot. Everything here is pure
// and offline: no `ANTHROPIC_API_KEY`, no network, no LLM, zero live calls —
// the CI contract for the M6 pipeline package.

import { describe, expect, it } from "vitest"

import {
  loadSnapshotDocuments,
  type SnapshotFile,
} from "./loader"
import {
  buildSnapshotRetriever,
  estimateRetrievedTokens,
  estimateTokens,
} from "./rag"
import { SnapshotKeywordRetriever } from "./retriever"

// --------------------------------------------------------------------------
// A small, representative sample snapshot — a tiny Next.js-ish project.
// --------------------------------------------------------------------------

const sampleSnapshot: SnapshotFile[] = [
  {
    path: "apps/web/app/page.tsx",
    content:
      "import { Button } from '@workspace/ui'\n\n" +
      "export default function HomePage() {\n" +
      "  return <Button>Welcome to the portfolio site</Button>\n" +
      "}\n",
  },
  {
    path: "apps/web/app/actions.ts",
    content:
      "'use server'\n\n" +
      "import { createLlmClient } from '@workspace/ai/client'\n\n" +
      "export async function explainProject(prompt: string) {\n" +
      "  const client = createLlmClient()\n" +
      "  return client.complete({ messages: [{ role: 'user', content: prompt }] })\n" +
      "}\n",
  },
  {
    path: "packages/db/src/schema.ts",
    content:
      "import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'\n\n" +
      "export const repoSnapshots = sqliteTable('repo_snapshots', {\n" +
      "  id: integer('id').primaryKey(),\n" +
      "  owner: text('owner').notNull(),\n" +
      "})\n",
  },
  {
    path: "README.md",
    content: "# Portfolio\n\nA small site built with Next.js and Drizzle.\n",
  },
]

// --------------------------------------------------------------------------
// loadSnapshotDocuments — load + split
// --------------------------------------------------------------------------

describe("loadSnapshotDocuments", () => {
  it("loads every non-empty file as at least one chunk document", () => {
    const docs = loadSnapshotDocuments(sampleSnapshot)
    const sources = new Set(docs.map((d) => d.metadata.source))
    expect(sources).toEqual(
      new Set([
        "apps/web/app/page.tsx",
        "apps/web/app/actions.ts",
        "packages/db/src/schema.ts",
        "README.md",
      ]),
    )
  })

  it("keeps a small file as a single chunk", () => {
    const docs = loadSnapshotDocuments([
      { path: "small.ts", content: "export const x = 1\n" },
    ])
    expect(docs).toHaveLength(1)
    expect(docs[0]?.metadata).toMatchObject({ chunk: 0, chunkCount: 1 })
    expect(docs[0]?.pageContent).toBe("export const x = 1\n")
  })

  it("splits a large file into multiple bounded, ordered chunks", () => {
    const big = "line of source code\n".repeat(400) // ~8000 chars
    const docs = loadSnapshotDocuments([{ path: "big.ts", content: big }], {
      chunkSize: 1000,
      chunkOverlap: 100,
    })
    expect(docs.length).toBeGreaterThan(1)
    // Every chunk respects the size bound and is correctly numbered.
    docs.forEach((doc, index) => {
      expect(doc.pageContent.length).toBeLessThanOrEqual(1000)
      expect(doc.metadata).toMatchObject({
        source: "big.ts",
        chunk: index,
        chunkCount: docs.length,
      })
    })
  })

  it("hard-slices content with no natural separator", () => {
    const docs = loadSnapshotDocuments(
      [{ path: "min.js", content: "x".repeat(2500) }],
      { chunkSize: 1000 },
    )
    expect(docs).toHaveLength(3)
    expect(docs.every((d) => d.pageContent.length <= 1000)).toBe(true)
  })

  it("skips empty files and files over maxFileChars", () => {
    const docs = loadSnapshotDocuments(
      [
        { path: "empty.ts", content: "" },
        { path: "huge.ts", content: "a".repeat(5000) },
        { path: "ok.ts", content: "export const ok = true\n" },
      ],
      { maxFileChars: 1000 },
    )
    expect(docs.map((d) => d.metadata.source)).toEqual(["ok.ts"])
  })

  it("is deterministic regardless of input file order", () => {
    const forward = loadSnapshotDocuments(sampleSnapshot)
    const reversed = loadSnapshotDocuments([...sampleSnapshot].reverse())
    expect(reversed.map((d) => d.metadata.source)).toEqual(
      forward.map((d) => d.metadata.source),
    )
  })
})

// --------------------------------------------------------------------------
// SnapshotKeywordRetriever — retrieval
// --------------------------------------------------------------------------

describe("SnapshotKeywordRetriever", () => {
  it("retrieves the chunk most relevant to a query", async () => {
    const { retriever } = buildSnapshotRetriever(sampleSnapshot)
    const docs = await retriever.invoke("createLlmClient explainProject")
    expect(docs[0]?.metadata.source).toBe("apps/web/app/actions.ts")
  })

  it("retrieves a different file for a different query", async () => {
    const { retriever } = buildSnapshotRetriever(sampleSnapshot)
    const docs = await retriever.invoke("sqliteTable repoSnapshots drizzle")
    expect(docs[0]?.metadata.source).toBe("packages/db/src/schema.ts")
  })

  it("returns at most k chunks", async () => {
    const { retriever } = buildSnapshotRetriever(sampleSnapshot, {
      retrieval: { k: 2 },
    })
    const docs = await retriever.invoke("import export const")
    expect(docs.length).toBeLessThanOrEqual(2)
    expect(retriever.k).toBe(2)
  })

  it("returns nothing for a query with no indexable terms", async () => {
    const { retriever } = buildSnapshotRetriever(sampleSnapshot)
    expect(await retriever.invoke("zzzz nonexistentsymbol")).toEqual([])
  })

  it("returns nothing when the index is empty", async () => {
    const { retriever } = buildSnapshotRetriever([])
    expect(retriever.size).toBe(0)
    expect(await retriever.invoke("anything")).toEqual([])
  })

  it("retrieveChunks preserves chunk metadata", async () => {
    const { retriever } = buildSnapshotRetriever(sampleSnapshot)
    const chunks = await retriever.retrieveChunks("Button HomePage portfolio")
    expect(chunks[0]?.metadata.source).toBe("apps/web/app/page.tsx")
    expect(chunks[0]?.metadata).toHaveProperty("chunk")
    expect(chunks[0]?.metadata).toHaveProperty("chunkCount")
  })

  it("ranks identically for the same query (deterministic)", async () => {
    const first = buildSnapshotRetriever(sampleSnapshot).retriever
    const second = buildSnapshotRetriever(sampleSnapshot).retriever
    const q = "import export"
    expect((await first.invoke(q)).map((d) => d.metadata.source)).toEqual(
      (await second.invoke(q)).map((d) => d.metadata.source),
    )
  })

  it("is a real LangChain BaseRetriever subclass", async () => {
    const { retriever } = buildSnapshotRetriever(sampleSnapshot)
    expect(retriever).toBeInstanceOf(SnapshotKeywordRetriever)
    // `invoke` is the BaseRetriever runnable interface.
    expect(typeof retriever.invoke).toBe("function")
    expect(SnapshotKeywordRetriever.lc_name()).toBe("SnapshotKeywordRetriever")
  })
})

// --------------------------------------------------------------------------
// Token bounding — Issue #104: "token use stays bounded for large repos"
// --------------------------------------------------------------------------

describe("token bounding", () => {
  it("estimateTokens grows with text length", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens("a".repeat(400))).toBe(100)
  })

  it("keeps retrieval bounded regardless of repository size", async () => {
    // A large synthetic repo: 500 files, each non-trivial.
    const largeRepo: SnapshotFile[] = Array.from({ length: 500 }, (_, i) => ({
      path: `src/module-${i}.ts`,
      content:
        `import { helper } from './helper'\n` +
        `export function feature${i}() {\n` +
        `  return helper('feature ${i} does important work')\n` +
        `}\n`.repeat(20),
    }))

    const { retriever, chunkCount } = buildSnapshotRetriever(largeRepo, {
      split: { chunkSize: 1000 },
      retrieval: { k: 6 },
    })
    // The index is large — at least one chunk per file.
    expect(chunkCount).toBeGreaterThanOrEqual(largeRepo.length)

    // ...but a retrieval returns at most k chunks of at most chunkSize each,
    // so the token cost is bounded no matter how big the repo grows.
    const docs = await retriever.retrieveChunks("helper feature important")
    expect(docs.length).toBeLessThanOrEqual(6)
    const tokens = estimateRetrievedTokens(docs)
    // 6 chunks * 1000 chars / 4 chars-per-token = 1500-token hard ceiling.
    expect(tokens).toBeLessThanOrEqual(1500)
  })

  it("estimateRetrievedTokens sums chunk estimates", () => {
    const docs = loadSnapshotDocuments(sampleSnapshot)
    const expected = docs.reduce(
      (sum, d) => sum + estimateTokens(d.pageContent),
      0,
    )
    expect(estimateRetrievedTokens(docs)).toBe(expected)
  })
})

// --------------------------------------------------------------------------
// buildSnapshotRetriever — end-to-end over a sample snapshot
// --------------------------------------------------------------------------

describe("buildSnapshotRetriever", () => {
  it("builds a retriever and reports index stats", () => {
    const bundle = buildSnapshotRetriever(sampleSnapshot)
    expect(bundle.chunkCount).toBe(bundle.documents.length)
    expect(bundle.retriever.size).toBe(bundle.chunkCount)
    expect(bundle.chunkCount).toBeGreaterThan(0)
  })

  it("handles a sparse snapshot gracefully", () => {
    const bundle = buildSnapshotRetriever([
      { path: "blank.ts", content: "" },
    ])
    expect(bundle.chunkCount).toBe(0)
    expect(bundle.retriever.size).toBe(0)
  })
})
