import { Boxes } from "lucide-react"

import { getTemplates } from "@/lib/templates"

import { AppNav } from "./_components/chrome"
import { TemplateBrowser } from "./_components/template-browser"

// The registry reads a local SQLite database — render per request.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Template Registry",
  description:
    "The building blocks behind the Golden Paths — browse the templates a project is built on and see how each one fits.",
}

export default async function TemplatesPage() {
  const templates = await getTemplates()

  return (
    <div className="screen">
      <AppNav active="templates" />
      <main className="page">
        <div className="container">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Registry · M3
            </div>
            <h1 className="page-title">Template Registry</h1>
            <p className="page-subtitle">
              The building blocks behind the Golden Paths. Browse the templates
              a project is built on and see how each one fits.
            </p>
          </header>

          {templates.length > 0 ? (
            <TemplateBrowser templates={templates} />
          ) : (
            <div className="empty-state tall" role="status">
              <div className="empty-icon" aria-hidden="true">
                <Boxes size={22} />
              </div>
              <div className="empty-title">No templates yet</div>
              <div className="empty-body">
                The registry has not been seeded yet. Run the registry seed to
                load the templates, then refresh this page.
              </div>
              <div className="empty-actions">
                <code className="chip">
                  pnpm --filter @workspace/db db:seed
                </code>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
