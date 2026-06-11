import path from "node:path"

import Link from "next/link"

import {
  type CatalogDb,
  countRepoFilesBySnapshot,
  createCatalogDb,
  listImportedRepos,
} from "@workspace/db"

import {
  AppNav,
  Badge,
  GitHubMark,
  IconBox,
  IconExternal,
  relTime,
} from "./_components/chrome"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Repos",
  description:
    "Every repository you've imported — jump into its files, issues, challenges, and coaching areas from here.",
}

/** Path to the catalog SQLite file; `DB_FILE_NAME` overrides the default. */
function reposDbFile(): string {
  return (
    process.env.DB_FILE_NAME ??
    path.join(process.cwd(), "..", "..", "packages", "db", "catalog.db")
  )
}

let cached: CatalogDb | undefined

/** Lazily open the catalog database (first call only — keeps build-time safe). */
function db(): CatalogDb {
  cached ??= createCatalogDb(reposDbFile())
  return cached
}

/** The nine per-repo coaching areas, in the spec's order (page spec §6b). */
function areaLinks(owner: string, repo: string) {
  return [
    { label: "Files", href: `/repos/${owner}/${repo}/files` },
    { label: "Issues", href: `/repos/${owner}/${repo}/issues` },
    { label: "Challenges", href: `/repos/${owner}/${repo}/challenges` },
    { label: "Stack", href: `/stack/${owner}/${repo}` },
    { label: "Map", href: `/map/${owner}/${repo}` },
    { label: "Reviews", href: `/reviews/${owner}/${repo}` },
    { label: "Portfolio", href: `/portfolio/${owner}/${repo}` },
    { label: "Delivery", href: `/delivery/${owner}/${repo}` },
    { label: "Observability", href: `/observability/${owner}/${repo}` },
  ]
}

/**
 * `/repos` — the Repos Hub (M17, page spec
 * `docs/design/repos-hub-page.page-spec.md`; replaces the M16 redirect).
 *
 * A read-only Server Component listing every imported repository snapshot,
 * newest import first, each linking into its nine coaching areas. Local
 * SQLite only — no GitHub call, no token, no LLM at view time (ADR 0009).
 */
export default async function ReposHubPage() {
  const database = db()
  const repos = await listImportedRepos(database)
  const keyFileCounts =
    repos.length > 0
      ? await countRepoFilesBySnapshot(database)
      : new Map<number, number>()

  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <header className="hub-header">
            <div>
              <div className="page-eyebrow">
                <span className="dot" /> Repo hub · M17
              </div>
              <h1 className="page-title">Repos</h1>
              <p className="page-subtitle">
                Every repository you&apos;ve imported — jump into its files,
                issues, challenges, and coaching areas from here.
              </p>
            </div>
            <Link className="btn" href="/import">
              <GitHubMark size={14} /> Import a repository
            </Link>
          </header>

          {repos.length > 0 ? (
            <>
              <p className="hub-count">
                {repos.length} imported snapshot{repos.length === 1 ? "" : "s"}
              </p>
              <ul className="repo-list" aria-label="Imported repositories">
                {repos.map((snapshot) => {
                  const { id, owner, repo, ref } = snapshot
                  const fileCount = snapshot.fileTree.filter(
                    (entry) => entry.type === "blob",
                  ).length
                  const keyFileCount = keyFileCounts.get(id) ?? 0
                  return (
                    <li className="repo-row" key={id}>
                      <span className="repo-icon" aria-hidden="true">
                        <GitHubMark size={20} />
                      </span>
                      <div className="repo-main">
                        <div className="repo-identity">
                          <strong className="repo-name">
                            {owner}/{repo}
                          </strong>
                          <Badge soft mono>
                            {ref}
                          </Badge>
                        </div>
                        <div className="repo-meta">
                          <span className="repo-state mono">
                            imported {relTime(snapshot.importedAt.toISOString())}
                          </span>
                          <span className="repo-state mono">
                            {fileCount} file{fileCount === 1 ? "" : "s"}
                          </span>
                          <span className="repo-state mono">
                            {keyFileCount} key file
                            {keyFileCount === 1 ? "" : "s"} captured
                          </span>
                          {snapshot.primaryLanguage && (
                            <Badge tone="info">{snapshot.primaryLanguage}</Badge>
                          )}
                        </div>
                        <div className="repo-desc">
                          {snapshot.description && (
                            <span className="repo-desc-text">
                              {snapshot.description}
                            </span>
                          )}
                          <a
                            className="repo-gh-link"
                            href={snapshot.htmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View on GitHub <IconExternal size={12} />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        </div>
                        <ul
                          className="repo-areas"
                          aria-label={`Coaching areas for ${owner}/${repo}`}
                        >
                          {areaLinks(owner, repo).map((area) => (
                            <li key={area.label}>
                              <Link
                                className="repo-area-link"
                                href={area.href}
                                aria-label={`${area.label} — ${owner}/${repo}`}
                              >
                                {area.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <div className="empty-state" role="status">
              <div aria-hidden="true">
                <IconBox size={22} />
              </div>
              <div className="empty-title">No repositories imported yet</div>
              <p className="empty-body">
                Import a GitHub repository to start coaching on it — its files,
                issues, stack, and more all start from here.
              </p>
              <div>
                <Link className="btn btn-primary" href="/import">
                  <GitHubMark size={14} /> Import a repository
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
