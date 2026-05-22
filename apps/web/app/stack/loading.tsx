import { AppNav } from "./_components/chrome"

/** Loading skeleton for the `/stack` chooser route. */
export default function StackChooserLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="stack" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Stack · M5
            </div>
            <h1 className="page-title">Stack explanations</h1>
            <p className="page-subtitle">
              Pick a repository you&apos;ve imported and we&apos;ll explain why
              it uses the stack it does — tied to your actual files, not a
              generic tutorial.
            </p>
          </header>

          <div className="repo-list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="repo-row"
                style={{ cursor: "default" }}
              >
                <div
                  className="skel"
                  style={{ height: 20, width: 20, borderRadius: 6 }}
                />
                <div>
                  <div className="skel" style={{ height: 14, width: 200 }} />
                  <div
                    className="skel"
                    style={{ height: 11, width: 260, marginTop: 8 }}
                  />
                </div>
                <div
                  className="skel"
                  style={{ height: 16, width: 16, borderRadius: 4 }}
                />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
