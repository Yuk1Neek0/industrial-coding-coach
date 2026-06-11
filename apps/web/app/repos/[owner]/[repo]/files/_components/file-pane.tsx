import Link from "next/link"

import type { RepoFile, RepoSnapshot, RepoTreeEntry } from "@workspace/db"

import { Badge, IconExternal } from "../../../../_components/chrome"
import {
  categoryBadge,
  exactAndHumanSize,
  fileHref,
  type FileSelection,
  formatCount,
  formatDate,
  githubBlobUrl,
  shortSha,
} from "../_lib/view"

// The file pane of the M17 Snapshot File Viewer (task #268, page spec §6c):
// renders exactly one of four states, decided server-side — captured key
// file (full contents), in-tree-not-captured (the honest AD-4 state), path
// not in the tree (in-page, HTTP 200), or the no-selection default summary.

/** Cap on the default state's captured-key-file quick list (§6c-iv). */
const QUICK_LIST_CAP = 30

/** §6c-i — a captured key file: complete contents in a plain `<pre>`. */
function CapturedFile({
  snapshot,
  file,
}: {
  snapshot: RepoSnapshot
  file: RepoFile
}) {
  const badge = categoryBadge(file.category)
  return (
    <>
      <header className="files-pane-head">
        <h2 className="files-pane-title mono">{file.path}</h2>
        <Badge soft>{badge.long}</Badge>
      </header>
      <p className="files-pane-meta">
        {exactAndHumanSize(file.size)} · {shortSha(file.sha)} · imported{" "}
        {formatDate(snapshot.importedAt)}
      </p>
      {/* Capture is all-or-nothing (§5 honesty fact 1) — no truncation UI. */}
      <p className="files-pane-note">Complete file as captured at import.</p>
      <pre
        className="files-pre"
        tabIndex={0}
        role="region"
        aria-label={`File contents: ${file.path}`}
      >
        {file.content}
      </pre>
    </>
  )
}

/** §6c-ii — in the tree but not captured (epic AD-4). Calm, not an error. */
function NotCapturedFile({
  snapshot,
  entry,
}: {
  snapshot: RepoSnapshot
  entry: RepoTreeEntry
}) {
  return (
    <>
      <header className="files-pane-head">
        <h2 className="files-pane-title mono">{entry.path}</h2>
      </header>
      <p className="files-pane-meta">
        {entry.size !== undefined ? `${exactAndHumanSize(entry.size)} · ` : ""}
        {shortSha(entry.sha)} · file
      </p>
      <p className="files-pane-status">Content not captured at import.</p>
      <p className="files-pane-body">
        The import stores the full file tree, but file <em>contents</em> only
        for key files: package manifests (
        <span className="mono">package.json</span>), lockfiles, build and
        framework config, READMEs (root and package-level), CI workflows, and
        CCPM artifacts under <span className="mono">.claude/</span>. Files over
        512 KiB are skipped even when they match. This file isn&apos;t one of
        those, so the snapshot has its tree entry but not its text.
      </p>
      <p className="files-pane-body">
        You can read it on{" "}
        <a
          href={githubBlobUrl(snapshot.htmlUrl, snapshot.ref, entry.path)}
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub <IconExternal size={12} />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        .
      </p>
    </>
  )
}

/** §6c-iii — `?path` not in the tree. In-page HTTP 200, never `notFound()`. */
function UnknownPath({
  owner,
  repo,
  snapshot,
  requestedPath,
}: {
  owner: string
  repo: string
  snapshot: RepoSnapshot
  requestedPath: string
}) {
  return (
    <>
      <h2 className="files-pane-title">Not in this snapshot&apos;s tree</h2>
      <p className="files-pane-meta">{requestedPath}</p>
      <p className="files-pane-body">
        This snapshot (imported {formatDate(snapshot.importedAt)} at{" "}
        {shortSha(snapshot.commitSha)}) has no entry at this path. The file may
        have been added, moved, or renamed since the import; the link may come
        from an older analysis; or — for very large repositories — GitHub may
        have truncated the tree at import time.
      </p>
      <div className="status-actions files-actions">
        <Link className="btn btn-primary" href={fileHref(owner, repo)}>
          Browse the tree
        </Link>
        <Link className="btn" href="/import">
          Re-import to refresh
        </Link>
      </div>
    </>
  )
}

/** §6c-iii variant — `?path` matches a directory (`tree`) entry. */
function DirectoryPath({ path }: { path: string }) {
  return (
    <>
      <h2 className="files-pane-title">That&apos;s a directory</h2>
      <p className="files-pane-body">
        <span className="mono">{path}/</span> is a directory in this snapshot.
        Pick a file inside it from the tree.
      </p>
    </>
  )
}

/** §6c-iv — no selection: snapshot summary + captured-key-file quick list. */
function DefaultState({
  owner,
  repo,
  snapshot,
  repoFiles,
  fileCount,
  dirCount,
}: {
  owner: string
  repo: string
  snapshot: RepoSnapshot
  repoFiles: RepoFile[]
  fileCount: number
  dirCount: number
}) {
  return (
    <>
      <h2 className="files-pane-title">Pick a file</h2>
      <p className="files-pane-body">
        Select any file from the tree. Files with a badge were captured at
        import and open with their full contents.
      </p>

      <div className="files-summary-card">
        {snapshot.description && (
          <p className="files-summary-desc">{snapshot.description}</p>
        )}
        <dl className="files-summary-grid">
          {snapshot.primaryLanguage && (
            <>
              <dt>Language</dt>
              <dd>{snapshot.primaryLanguage}</dd>
            </>
          )}
          <dt>Default branch</dt>
          <dd className="mono">{snapshot.defaultBranch}</dd>
          <dt>Files</dt>
          <dd>{formatCount(fileCount)}</dd>
          <dt>Directories</dt>
          <dd>{formatCount(dirCount)}</dd>
          <dt>Captured key files</dt>
          <dd>{formatCount(repoFiles.length)}</dd>
          <dt>Imported</dt>
          <dd>{formatDate(snapshot.importedAt)}</dd>
        </dl>
      </div>

      {repoFiles.length > 0 ? (
        <div className="files-quick">
          <h3 className="files-quick-title">Captured key files</h3>
          <ul className="files-quick-list">
            {repoFiles.slice(0, QUICK_LIST_CAP).map((file) => {
              const badge = categoryBadge(file.category)
              return (
                <li key={file.path}>
                  <Link
                    href={fileHref(owner, repo, file.path)}
                    aria-label={`${file.path} — captured, ${badge.long}`}
                  >
                    <span className="files-entry-path mono">{file.path}</span>
                    <Badge soft>{badge.short}</Badge>
                  </Link>
                </li>
              )
            })}
          </ul>
          {repoFiles.length > QUICK_LIST_CAP && (
            <p className="files-quick-more">
              … {formatCount(repoFiles.length - QUICK_LIST_CAP)} more — find
              them by badge in the tree.
            </p>
          )}
        </div>
      ) : (
        // No captured key files (§10) — a calm resting state.
        <p className="files-pane-body">
          No key files were captured for this snapshot — the tree below is
          still fully browsable.
        </p>
      )}
    </>
  )
}

/** The file pane (§6c): exactly one of the four states. */
export function FilePane({
  owner,
  repo,
  snapshot,
  repoFiles,
  selection,
  fileCount,
  dirCount,
}: {
  owner: string
  repo: string
  snapshot: RepoSnapshot
  repoFiles: RepoFile[]
  selection: FileSelection
  fileCount: number
  dirCount: number
}) {
  return (
    <section className="files-pane" aria-label="Selected file">
      {selection.kind === "captured" && (
        <CapturedFile snapshot={snapshot} file={selection.file} />
      )}
      {selection.kind === "not-captured" && (
        <NotCapturedFile snapshot={snapshot} entry={selection.entry} />
      )}
      {selection.kind === "unknown" && (
        <UnknownPath
          owner={owner}
          repo={repo}
          snapshot={snapshot}
          requestedPath={selection.path}
        />
      )}
      {selection.kind === "directory" && <DirectoryPath path={selection.path} />}
      {selection.kind === "none" && (
        <DefaultState
          owner={owner}
          repo={repo}
          snapshot={snapshot}
          repoFiles={repoFiles}
          fileCount={fileCount}
          dirCount={dirCount}
        />
      )}
    </section>
  )
}
