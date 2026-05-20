import { Package } from "lucide-react"

import { getCatalogPaths } from "@/lib/catalog"

import { CatalogBrowser } from "./_components/catalog-browser"
import { AppNav } from "./_components/chrome"

// The catalog reads a local SQLite database — render per request.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Golden Path Catalog",
  description: "Curated routes for understanding an AI-assisted project.",
}

export default async function CatalogPage() {
  const paths = await getCatalogPaths()

  return (
    <div className="screen">
      <AppNav active="catalog" />
      <main className="page">
        <div className="container">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Catalog · M2
            </div>
            <h1 className="page-title">Golden Path Catalog</h1>
            <p className="page-subtitle">
              Curated routes for understanding an AI-assisted project. Pick the
              one that matches yours.
            </p>
          </header>

          {paths.length > 0 ? (
            <CatalogBrowser paths={paths} />
          ) : (
            <div className="empty-state tall" role="status">
              <div className="empty-icon" aria-hidden="true">
                <Package size={22} />
              </div>
              <div className="empty-title">No Golden Paths yet</div>
              <div className="empty-body">
                The catalog has not been seeded. Run the catalog seed to load
                the Golden Paths, then refresh this page.
              </div>
              <div className="empty-actions">
                <code className="chip">pnpm --filter @workspace/db db:seed</code>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
