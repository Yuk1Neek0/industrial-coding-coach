import { AppNav } from "./_components/chrome"

/** Loading skeleton for the `/reviews` chooser route. */
export default function ReviewsChooserLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="reviews" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Diff Review · M8
            </div>
            <h1 className="page-title">Diff reviews</h1>
            <p className="page-subtitle">
              Pick a repository you&apos;ve imported and review a pull request
              on it — what each file changed, what could break, and a
              comprehension check so you can defend the change in an interview.
            </p>
          </header>

          <div className="repo-list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="repo-row" style={{ cursor: "default" }}>
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
