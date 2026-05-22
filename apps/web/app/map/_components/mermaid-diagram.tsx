"use client"

// The client-side Mermaid renderer for the Project Logic Mapper (task #108,
// page spec §9, architecture-flow-viewer spec §9/§11).
//
// The mapping pipeline (#105) emits the diagram as Mermaid SOURCE text, not an
// image — keeping it portable, diffable, and re-themeable. This component runs
// the `mermaid` npm library in the browser to turn that source into an SVG.
//
// `mermaid` is imported dynamically inside an effect so it never lands in the
// server bundle and the page can render its server shell without it. A render
// failure (a malformed diagram) is caught and degrades to a calm inline
// fallback — the host always also renders the flow's ordered step list as the
// authoritative text alternative, so a failed diagram never loses information.

import { useEffect, useId, useRef, useState } from "react"

type RenderState = "loading" | "rendered" | "failed"

/**
 * Render a Mermaid `source` string to an inline SVG, client-side.
 *
 * @param source - the Mermaid diagram source text from the pipeline.
 * @param ariaLabel - accessible name for the rendered diagram region.
 */
export function MermaidDiagram({
  source,
  ariaLabel,
}: {
  source: string
  ariaLabel: string
}) {
  const [state, setState] = useState<RenderState>("loading")
  const [svg, setSvg] = useState<string>("")
  // A DOM-id-safe, unique render id — `mermaid.render` needs one per call.
  const renderId = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      // Reset to the loading state for this `source` — done inside the async
      // body (not synchronously in the effect) so it does not cascade renders.
      setState("loading")
      const trimmed = source.trim()
      if (trimmed === "") {
        if (!cancelled) setState("failed")
        return
      }
      try {
        const mermaid = (await import("mermaid")).default
        // Re-initialize per render so a theme change is picked up; `neutral`
        // reads acceptably in both light and dark themes.
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          fontFamily: "var(--font-mono)",
        })
        const { svg: rendered } = await mermaid.render(renderId, trimmed)
        if (cancelled) return
        setSvg(rendered)
        setState("rendered")
      } catch {
        // A malformed diagram must not crash the component or the page.
        if (!cancelled) setState("failed")
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [source, renderId])

  if (state === "loading") {
    return (
      <div
        className="mermaid-wrap"
        aria-busy="true"
        aria-label={`${ariaLabel} — rendering`}
      >
        <div className="skel mermaid-skeleton" />
      </div>
    )
  }

  if (state === "failed") {
    return (
      <div className="mermaid-wrap mermaid-fail" role="img" aria-label={ariaLabel}>
        <p>
          This diagram couldn&apos;t be drawn. The flow is still fully readable
          as the ordered step list below.
        </p>
        <details className="mermaid-source">
          <summary>View diagram source</summary>
          <pre>{source}</pre>
        </details>
      </div>
    )
  }

  return (
    <div className="mermaid-wrap">
      <div
        ref={wrapRef}
        role="img"
        aria-label={ariaLabel}
        // The SVG is produced by the `mermaid` library from trusted pipeline
        // source with `securityLevel: "strict"` (script/HTML stripped).
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <details className="mermaid-source">
        <summary>View diagram source</summary>
        <pre>{source}</pre>
      </details>
    </div>
  )
}
