// Debug Path UI — the debug-path component of the Project Map page (page spec
// `docs/design/debug-path-ui.md`). Pure presentation; rendered inside the
// Server Component map page.
//
// Reconciled against the real `@workspace/db` / `@workspace/ai` types (page
// spec §5 directs task #108 to do this): the pipeline's `DebugPathStep` is
// `{ location, guidance }`. The spec's separate `symptom` / `file` fields are
// not in the real schema — `location` (a real repo path or a named area) is
// the "Start here" anchor and `guidance` is the body of each entry.

import type { ProjectMapView } from "@/lib/project-mapper"

import { IconBug } from "./chrome"

type DebugStep = ProjectMapView["debugPath"][number]

/**
 * Render the debug path — an ordered list of places to look first when
 * something breaks (pipeline Output 7).
 *
 * @param debugPath - the pipeline's debug-path steps.
 */
export function DebugPathUi({ debugPath }: { debugPath: DebugStep[] }) {
  if (debugPath.length === 0) {
    return (
      <p className="inline-empty">
        <IconBug size={13} /> No specific debug starting points were identified
        for this project.
      </p>
    )
  }

  return (
    <div>
      <p className="debug-intro">
        If something breaks, here is where to start looking — matched to common
        problems and your real files.
      </p>
      <ul className="debug-list">
        {debugPath.map((step, i) => (
          <li key={`${step.location}-${i}`}>
            <article className="debug-card">
              <h3>
                <span className="debug-icon" aria-hidden="true">
                  <IconBug size={16} />
                </span>
                <span className="debug-start">
                  <span className="debug-start-label">Start here:</span>
                  <code className="debug-start-loc">{step.location}</code>
                </span>
              </h3>
              <p className="debug-guidance">{step.guidance}</p>
            </article>
          </li>
        ))}
      </ul>
    </div>
  )
}
