import { AppNav } from "./_components/chrome"
import { IntakeForm } from "./_components/intake-form"

export const metadata = {
  title: "Get a Recommendation",
  description:
    "Describe your goal and skills and get a recommended Golden Path and template set, with the trade-offs.",
}

/**
 * The `/recommend` intake page (page spec §4). A Server Component shell —
 * header and layout — wrapping the `IntakeForm` Client Component island that
 * owns the nine-field form and the submit-to-engine flow. The page itself does
 * no data fetching and renders instantly; there is no route-level `loading.tsx`.
 */
export default function RecommendPage() {
  return (
    <div className="screen">
      <AppNav active="recommend" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Recommend · M4
            </div>
            <h1 className="page-title">Get a recommendation</h1>
            <p className="page-subtitle">
              Tell us about your goal and your skills. We&apos;ll recommend a
              Golden Path and a set of templates — with the trade-offs, so you
              can defend the choices.
            </p>
          </header>

          <IntakeForm />
        </div>
      </main>
    </div>
  )
}
