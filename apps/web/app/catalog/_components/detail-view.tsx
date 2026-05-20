import {
  ArrowLeft,
  BookOpen,
  Check,
  CircleAlert,
  Compass,
  ExternalLink,
  Shield,
} from "lucide-react"
import Link from "next/link"

import type { GoldenPath } from "@workspace/db"

import { AppNav, Badge } from "./chrome"

/** Full detail view for one Golden Path. */
export function DetailView({ path }: { path: GoldenPath }) {
  return (
    <div className="screen">
      <AppNav active="catalog" />
      <main className="page page-narrow">
        <div className="container-narrow">
          <Link className="back-link" href="/catalog">
            <ArrowLeft size={14} />
            Back to catalog
          </Link>

          <header className="detail-header">
            <div className="detail-slug">{path.slug}</div>
            <h1 className="detail-title">{path.name}</h1>
            <p className="detail-lead">{path.summary}</p>
            <div className="detail-meta">
              <Badge>{path.targetProjectType}</Badge>
              <span className="chip">{path.steps.length} steps</span>
              <span className="chip">
                {path.learningOutcomes.length} learning outcomes
              </span>
            </div>
          </header>

          <section className="section" aria-labelledby="sec-fit">
            <div className="section-head">
              <h2 id="sec-fit" className="section-title">
                Does this fit your project?
              </h2>
              <span className="section-hint">
                <Compass size={12} style={{ marginRight: 4 }} /> orientation
              </span>
            </div>
            <div className="fit-block">
              <div>
                <div className="fit-label">Target project</div>
                <div className="fit-value" style={{ marginTop: 6 }}>
                  {path.targetProjectType}
                </div>
              </div>
              <div>
                <div className="fit-label">
                  Use this path if your project looks like this
                </div>
                <p className="fit-value lead" style={{ marginTop: 6 }}>
                  {path.fitCriteria}
                </p>
              </div>
            </div>
          </section>

          <section className="section" aria-labelledby="sec-steps">
            <div className="section-head">
              <h2 id="sec-steps" className="section-title">
                The understanding journey
              </h2>
              <span className="section-hint">in order</span>
            </div>
            <ol className="steps-list">
              {path.steps.map((step, i) => (
                <li className="step" key={step.title}>
                  <div className="step-num">{String(i + 1).padStart(2, "0")}</div>
                  <div className="step-body">
                    <div className="step-title">{step.title}</div>
                    <div className="step-detail">{step.detail}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="section" aria-labelledby="sec-outcomes">
            <div className="section-head">
              <h2 id="sec-outcomes" className="section-title">
                What you&apos;ll be able to explain
              </h2>
              <span className="section-hint">interview-ready</span>
            </div>
            <ul className="check-list">
              {path.learningOutcomes.map((outcome) => (
                <li key={outcome}>
                  <Check size={16} />
                  <span>{outcome}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="section" aria-labelledby="sec-gates">
            <div className="section-head">
              <h2 id="sec-gates" className="section-title">
                Quality gates
              </h2>
              <span className="section-hint">checks along the way</span>
            </div>
            <ul className="check-list muted">
              {path.qualityGates.map((gate) => (
                <li key={gate}>
                  <Shield size={16} />
                  <span>{gate}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="section" aria-labelledby="sec-templates">
            <div className="section-head">
              <h2 id="sec-templates" className="section-title">
                Templates this builds on
              </h2>
              <span className="section-hint">M2 · plain text</span>
            </div>
            <div className="chips">
              {path.templatesReferenced.map((template) => (
                <span key={template} className="chip">
                  {template}
                </span>
              ))}
            </div>
          </section>

          <section className="section" aria-labelledby="sec-alts">
            <div className="section-head">
              <h2 id="sec-alts" className="section-title">
                Alternatives considered
              </h2>
              <span className="section-hint">
                routes we weighed and why we didn&apos;t pick them
              </span>
            </div>
            <div className="alt-list">
              {path.rejectedAlternatives.map((alt) => (
                <div className="alt" key={alt.name}>
                  <div className="alt-name">{alt.name}</div>
                  <div className="alt-reason">{alt.reason}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="section" aria-labelledby="sec-risks">
            <div className="section-head">
              <h2 id="sec-risks" className="section-title">
                Risks &amp; caveats
              </h2>
              <span className="section-hint">things to watch</span>
            </div>
            <ul className="check-list muted">
              {path.risks.map((risk) => (
                <li key={risk}>
                  <CircleAlert size={16} />
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="section" aria-labelledby="sec-sources">
            <div className="section-head">
              <h2 id="sec-sources" className="section-title">
                Sources
              </h2>
              <span className="section-hint">references</span>
            </div>
            <div className="sources">
              {path.sources.map((source) => (
                <div className="source" key={source.label}>
                  {source.url ? (
                    <a
                      className="source-link"
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <BookOpen size={14} />
                      <span>{source.label}</span>
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="source-plain">
                      <BookOpen size={14} />
                      {source.label}
                    </span>
                  )}
                  {source.url && (
                    <span className="source-url">
                      {source.url.replace(/^https?:\/\//, "")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <footer className="detail-footer">
            slug: <span className="val">{path.slug}</span>
            <span className="sep">·</span>
            milestone 2 · seeded
          </footer>
        </div>
      </main>
    </div>
  )
}
