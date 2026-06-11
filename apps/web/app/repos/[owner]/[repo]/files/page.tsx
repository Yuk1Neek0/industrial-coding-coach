import Link from "next/link"
import { notFound } from "next/navigation"

import {
  AppNav,
  Badge,
  IconArrowLeft,
  IconExternal,
} from "../../../_components/chrome"
import { FilePane } from "./_components/file-pane"
import { TreePane } from "./_components/tree-pane"
import { getFilesPageData } from "./_lib/data"
import {
  buildTreePane,
  firstParamValue,
  formatCount,
  formatDate,
  normalizePath,
  resolveSelection,
  shortSha,
  topLevelGroup,
} from "./_lib/view"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface FilesPageProps {
  params: Promise<{ owner: string; repo: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params }: FilesPageProps) {
  const { owner, repo } = await params
  return {
    title: `Files — ${owner}/${repo}`,
    description: `Browse the imported snapshot of ${owner}/${repo} — the full file tree and the captured key-file contents.`,
  }
}

/**
 * `/repos/[owner]/[repo]/files` — the M17 Snapshot File Viewer (task #268,
 * page spec `docs/design/snapshot-file-viewer.page-spec.md`). A read-only
 * Server Component page over one local snapshot: a tree pane (the full file
 * tree captured at import, grouped by top-level directory) and a file pane
 * (the `?path=`-selected file — captured contents, the honest not-captured
 * state, or a graceful unknown-path state). Ships with zero client
 * components: native `<details>` disclosures and plain links only.
 *
 * **Read-only and offline** (ADR 0009, local-first): the page reads only
 * `repo_snapshots.fileTree` + `repo_files` via the M11 DAL — no network, no
 * API key, no mutation. Opening the URL with `GITHUB_TOKEN` unset works.
 *
 * **URL contract (§4a, epic AD-3):** `?path=<repo-relative path>`, encoded
 * whole with `encodeURIComponent`; first param value wins; matching is exact
 * and case-sensitive after trimming and stripping a leading `/` or `./`;
 * lookup runs against the FULL stored tree, not the rendered subset; an
 * empty `path` is the default no-selection state. Consumed as-is by the
 * wiring tasks (#269 import success, #270 M5/M6 file references).
 */
export default async function SnapshotFilesPage({
  params,
  searchParams,
}: FilesPageProps) {
  const [{ owner, repo }, query] = await Promise.all([params, searchParams])
  const { snapshot, repoFiles } = await getFilesPageData(owner, repo)

  // Repo not imported — the only route-level notFound() on this route (§11).
  if (!snapshot) {
    notFound()
  }

  const requestedPath = normalizePath(firstParamValue(query.path))
  const selection = resolveSelection(requestedPath, snapshot.fileTree, repoFiles)
  // The group containing the selected path opens on load (§6b); a directory
  // near-miss opens its matching group too (§6c-iii).
  const openGroup =
    selection.kind === "captured" ||
    selection.kind === "not-captured" ||
    selection.kind === "directory"
      ? topLevelGroup(requestedPath)
      : null
  const pane = buildTreePane(snapshot.fileTree, repoFiles, openGroup)

  const fileCount = pane.totalBlobs
  const dirCount = snapshot.fileTree.filter(
    (entry) => entry.type === "tree",
  ).length

  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="files-container">
          {/* ── Header (§6a) ─────────────────────────────────────────── */}
          <header>
            <Link className="back-link" href="/repos">
              <IconArrowLeft size={14} /> All repos
            </Link>
            <div className="page-eyebrow" style={{ marginTop: 24 }}>
              <span className="dot" /> Snapshot files · M17
            </div>
            <div className="files-titlewrap">
              <h1 className="page-title" style={{ margin: 0 }}>
                {owner}/{repo}
              </h1>
              <Badge soft mono>
                {snapshot.ref}
              </Badge>
              <Badge mono tone="info">
                {shortSha(snapshot.commitSha)}
              </Badge>
              <a
                className="files-gh-link"
                href={snapshot.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub <IconExternal size={12} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
            <p className="files-meta">
              Imported {formatDate(snapshot.importedAt)} ·{" "}
              {formatCount(fileCount)} {fileCount === 1 ? "file" : "files"} ·{" "}
              {formatCount(dirCount)}{" "}
              {dirCount === 1 ? "directory" : "directories"} ·{" "}
              {formatCount(repoFiles.length)} captured key{" "}
              {repoFiles.length === 1 ? "file" : "files"}
            </p>
            <p className="files-note">
              Read-only local snapshot — contents are stored for key files
              only; nothing here touches the network.
            </p>
          </header>

          {/* ── Two panes: tree (§6b) + file (§6c) ───────────────────── */}
          <div className="files-layout">
            <TreePane
              owner={owner}
              repo={repo}
              pane={pane}
              selectedPath={requestedPath}
            />
            <FilePane
              owner={owner}
              repo={repo}
              snapshot={snapshot}
              repoFiles={repoFiles}
              selection={selection}
              fileCount={fileCount}
              dirCount={dirCount}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
