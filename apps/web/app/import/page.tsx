import { AppNav } from "./_components/chrome"
import { ImportFlow } from "./_components/import-flow"

export const metadata = {
  title: "Import a GitHub Repository",
  description:
    "Point the coach at a public or private GitHub repo and import its file tree and key files into local storage.",
}

/**
 * The `/import` page (page spec §4). A Server Component shell — header and
 * layout — wrapping the `ImportFlow` Client Component island that owns the
 * interactive import. The page itself does no data fetching and renders
 * instantly; there is deliberately no route-level `loading.tsx`.
 */
export default function ImportPage() {
  return (
    <div className="screen">
      <AppNav active="import" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Import · M11
            </div>
            <h1 className="page-title">Import a GitHub Repository</h1>
            <p className="page-subtitle">
              Point the coach at a public or private GitHub repo. We import its
              file tree and key files into local storage so you can explore it
              here.
            </p>
          </header>

          <ImportFlow />
        </div>
      </main>
    </div>
  )
}
