// Route Handler for the M10 Portfolio Page's markdown-bundle export
// (Page Spec §8 / PRD US-6). POST returns a streamed `Response` with
// `Content-Type: application/zip` and a `Content-Disposition: attachment`
// header carrying the slug filename from #182.
//
// Why a Route Handler (not a Server Action): Next.js Server Actions return a
// JSON-ish payload, not a streamable binary body — clean downloads via
// `Content-Disposition` need a Route Handler. The integration notes
// record the decision.
//
// POST (not GET) because the action is non-idempotent in spirit (it renders
// the cached bytes for the user) and we never want a browser to follow a
// stale download URL on a refresh. The client-side fetch in
// `_components/export-buttons.tsx` calls POST.

import { exportPortfolioBundle } from "@/lib/portfolio"
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
  const result = await exportPortfolioBundle(snapshot.id)
  if (!result.ok) {
    const status = result.error.kind === "no-memory" ? 409 : 500
    return new Response(result.error.message, { status })
  }
  // `Buffer` is a `Uint8Array` subclass; cast to satisfy the `BodyInit`
  // typing across Node + edge runtimes.
  return new Response(new Uint8Array(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Content-Length": String(result.bytes.length),
      // Disable any intermediate caching — the bundle is per-user content
      // and the route is per-session.
      "Cache-Control": "no-store",
    },
  })
}
