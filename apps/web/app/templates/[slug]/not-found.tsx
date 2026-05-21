import { ArrowLeft, CircleSlash } from "lucide-react"
import Link from "next/link"

import { AppNav } from "../_components/chrome"

/** Shown when a template slug does not exist. */
export default function TemplateNotFound() {
  return (
    <div className="screen">
      <AppNav active="templates" />
      <main className="page page-narrow">
        <div className="container-narrow">
          <Link className="back-link" href="/templates">
            <ArrowLeft size={14} />
            Back to registry
          </Link>

          <div className="empty-state tall" role="status">
            <div className="empty-icon" aria-hidden="true">
              <CircleSlash size={22} />
            </div>
            <div className="empty-title">Template not found</div>
            <div className="empty-body">
              We couldn&apos;t find a template at that address. It may have been
              renamed, or the link is out of date.
            </div>
            <div className="empty-actions">
              <Link className="btn btn-primary" href="/templates">
                Back to registry
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
