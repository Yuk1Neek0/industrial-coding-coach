// Route Handler for the M10 Portfolio Page's PDF export (Page Spec §8 /
// PRD US-6 / PRD FR-7). POST returns a streamed `Response` with
// `Content-Type: application/pdf` and a `Content-Disposition: attachment`
// header carrying the slug filename from #183.
//
// Mirrors `../export-markdown/route.ts` — same shape, different bytes. The
// `@react-pdf/renderer` stack is Node-only (Buffer + pdfkit fonts) so this
// runs on the Node runtime, not the edge runtime.

import { exportPortfolioPdf } from "@/lib/portfolio"
import { getImportedRepo } from "@workspace/db"

interface RouteParams {
  params: Promise<{ owner: string; repo: string }>
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { owner, repo } = await params
  const snapshot = await getImportedRepo(owner, repo)
  if (!snapshot) {
    return new Response("Repository not imported.", { status: 404 })
  }
  const result = await exportPortfolioPdf(snapshot.id)
  if (!result.ok) {
    const status = result.error.kind === "no-memory" ? 409 : 500
    return new Response(result.error.message, { status })
  }
  return new Response(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Content-Length": String(result.bytes.length),
      "Cache-Control": "no-store",
    },
  })
}
