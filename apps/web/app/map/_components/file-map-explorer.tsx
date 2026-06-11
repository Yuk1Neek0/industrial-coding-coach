"use client"

// File Map Explorer — the key-file map component of the Project Map page
// (page spec `docs/design/file-map-explorer.md`). A small Client Component
// island: it receives the already-loaded key-file list as props and filters
// it client-side by path search.
//
// Reconciled against the real `@workspace/db` types (page spec §5 directs
// task #108 to do this): the pipeline's `ProjectMapFile` is `{ path, role }`.
// The spec's `category` / `importance` fields are not in the real schema, so
// the category filter and importance ranking are omitted — the same
// adaptation the M5 Stack Explainer made for its missing `category` field.
// The path search is kept; it is the filter the real shape supports.

import Link from "next/link"
import { useMemo, useState } from "react"

import type { ProjectMapView } from "@/lib/project-mapper"

import { IconBox, IconFileCode } from "./chrome"

type KeyFile = ProjectMapView["keyFileMap"][number]

/** Deep link into the snapshot file viewer (#268 URL contract, spec §4a). */
function viewerHref(owner: string, repo: string, path: string): string {
  return `/repos/${owner}/${repo}/files?path=${encodeURIComponent(path)}`
}

/**
 * Render the key-file map with a client-side path search.
 *
 * @param owner - the snapshot's repo owner, for file-viewer links.
 * @param repo - the snapshot's repo name, for file-viewer links.
 * @param keyFiles - the pipeline's key-file map (pipeline Output 2).
 */
export function FileMapExplorer({
  owner,
  repo,
  keyFiles,
}: {
  owner: string
  repo: string
  keyFiles: KeyFile[]
}) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === "") return keyFiles
    return keyFiles.filter((f) => f.path.toLowerCase().includes(q))
  }, [keyFiles, query])

  if (keyFiles.length === 0) {
    return (
      <p className="inline-empty">
        <IconBox size={13} /> No key files were identified for this project.
      </p>
    )
  }

  const filterActive = query.trim() !== ""

  return (
    <div>
      <p className="fme-intro">
        The files that carry this project&apos;s logic — start here to
        understand the codebase. {keyFiles.length} key file
        {keyFiles.length === 1 ? "" : "s"}.
      </p>

      <div className="fme-filterbar">
        <label className="sr-only" htmlFor="fme-search">
          Search file paths
        </label>
        <input
          id="fme-search"
          className="fme-search"
          type="search"
          placeholder="Search file paths"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filterActive && (
        <p className="fme-count" aria-live="polite">
          {filtered.length} of {keyFiles.length} files
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="fme-nomatch">
          <span>No files match your search.</span>
          <button type="button" className="btn" onClick={() => setQuery("")}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="fileref-list">
          {filtered.map((f, i) => (
            <li className="fileref" key={`${f.path}-${i}`}>
              <span className="fileref-icon" aria-hidden="true">
                <IconFileCode size={14} />
              </span>
              <Link
                className="fileref-path"
                href={viewerHref(owner, repo, f.path)}
              >
                {f.path}
              </Link>
              <p className="fileref-reason">{f.role}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
