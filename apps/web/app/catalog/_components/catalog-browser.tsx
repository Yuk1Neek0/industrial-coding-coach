"use client"

import { Search, X } from "lucide-react"
import { useMemo, useState } from "react"

import type { GoldenPath } from "@workspace/db"

import { PathCard } from "./path-card"

const ALL_TYPES = "All types"

/** Client-side filtered catalog: search + project-type filter over the grid. */
export function CatalogBrowser({ paths }: { paths: GoldenPath[] }) {
  const [query, setQuery] = useState("")
  const [type, setType] = useState(ALL_TYPES)

  const types = useMemo(
    () => [
      ALL_TYPES,
      ...Array.from(new Set(paths.map((p) => p.targetProjectType))),
    ],
    [paths],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return paths.filter((p) => {
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q)
      const matchesType = type === ALL_TYPES || p.targetProjectType === type
      return matchesQuery && matchesType
    })
  }, [paths, query, type])

  const isFiltering = query.trim() !== "" || type !== ALL_TYPES
  const countLabel = isFiltering
    ? `${filtered.length} of ${paths.length} paths`
    : `${paths.length} paths`

  return (
    <>
      <div className="filter-bar" role="search">
        <label className="search">
          <span className="icon" aria-hidden="true">
            <Search size={15} />
          </span>
          <input
            type="text"
            aria-label="Search Golden Paths"
            placeholder="Search Golden Paths"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="sr-only" htmlFor="type-filter">
          Project type
        </label>
        <select
          className="select"
          id="type-filter"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="result-count" aria-live="polite">
        {countLabel}
      </div>

      {filtered.length > 0 ? (
        <div className="grid">
          {filtered.map((p) => (
            <PathCard key={p.slug} path={p} />
          ))}
        </div>
      ) : (
        <div className="empty-state" role="status">
          <div className="empty-icon" aria-hidden="true">
            <Search size={22} />
          </div>
          <div className="empty-title">No Golden Paths match your search</div>
          <div className="empty-body">
            Try a different keyword, or clear the project-type filter to see
            every path.
          </div>
          <div className="empty-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQuery("")
                setType(ALL_TYPES)
              }}
            >
              <X size={14} />
              Clear filters
            </button>
          </div>
        </div>
      )}
    </>
  )
}
