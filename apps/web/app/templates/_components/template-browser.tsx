"use client"

// The registry list browser — the list page's Client Component island. It owns
// the search, category filter, and grouped/flat view toggle, filtering
// client-side over the server-loaded template list.

import { LayoutGrid, Layers, Search, X } from "lucide-react"
import { useMemo, useState } from "react"

import type { Template } from "@workspace/db"

import { TemplateCard } from "./template-card"

const ALL_CATEGORIES = "All categories"

/** Canonical category order — groups render in this order (page spec). */
const CATEGORY_ORDER = [
  "Project Scaffold",
  "Agentic Workflow",
  "CI",
  "Security",
  "Doc/Spec Template",
  "Contract",
  "Observability",
]

type View = "grouped" | "flat"

/** A DOM-id-safe token for a category name. */
function categoryId(category: string): string {
  return `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
}

export function TemplateBrowser({ templates }: { templates: Template[] }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState(ALL_CATEGORIES)
  const [view, setView] = useState<View>("grouped")

  const categories = useMemo(
    () => [
      ALL_CATEGORIES,
      ...CATEGORY_ORDER.filter((c) => templates.some((t) => t.category === c)),
    ],
    [templates],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templates.filter((t) => {
      const matchesQuery =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q)
      const matchesCategory =
        category === ALL_CATEGORIES || t.category === category
      return matchesQuery && matchesCategory
    })
  }, [templates, query, category])

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => ({
        cat,
        items: filtered.filter((t) => t.category === cat),
      })).filter((group) => group.items.length > 0),
    [filtered],
  )

  const isFiltering = query.trim() !== "" || category !== ALL_CATEGORIES
  const countLabel = isFiltering
    ? `${filtered.length} of ${templates.length} templates`
    : `${templates.length} templates`

  return (
    <>
      <div className="filter-bar" role="search">
        <label className="search">
          <span className="icon" aria-hidden="true">
            <Search size={15} />
          </span>
          <input
            type="text"
            aria-label="Search templates"
            placeholder="Search templates"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="sr-only" htmlFor="category-filter">
          Category
        </label>
        <select
          className="select"
          id="category-filter"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div role="group" aria-label="View" className="segmented">
          <button
            type="button"
            aria-pressed={view === "grouped"}
            onClick={() => setView("grouped")}
          >
            <Layers size={13} aria-hidden="true" />
            Grouped
          </button>
          <button
            type="button"
            aria-pressed={view === "flat"}
            onClick={() => setView("flat")}
          >
            <LayoutGrid size={13} aria-hidden="true" />
            Flat
          </button>
        </div>
      </div>

      <div className="result-count" aria-live="polite">
        {countLabel}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state" role="status">
          <div className="empty-icon" aria-hidden="true">
            <Search size={22} />
          </div>
          <div className="empty-title">No templates match your search</div>
          <div className="empty-body">
            Try a different keyword, or clear the category filter to see every
            template.
          </div>
          <div className="empty-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQuery("")
                setCategory(ALL_CATEGORIES)
              }}
            >
              <X size={14} />
              Clear filters
            </button>
          </div>
        </div>
      ) : view === "flat" ? (
        <div className="grid">
          {filtered.map((t) => (
            <TemplateCard key={t.slug} template={t} />
          ))}
        </div>
      ) : (
        grouped.map((group) => (
          <section
            className="cat-section"
            key={group.cat}
            aria-labelledby={categoryId(group.cat)}
          >
            <div className="cat-head">
              <h2 id={categoryId(group.cat)} className="cat-title">
                {group.cat}
              </h2>
              <span className="cat-count">· {group.items.length}</span>
            </div>
            <div className="grid">
              {group.items.map((t) => (
                <TemplateCard key={t.slug} template={t} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  )
}
