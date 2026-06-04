import {
  ArrowLeft,
  BookOpen,
  CircleAlert,
  ExternalLink,
  Shield,
  Target,
} from "lucide-react"
import Link from "next/link"

import type { Template } from "@workspace/db"

import { AppNav, Badge, SourceBadge } from "./chrome"

/**
 * Full detail view for one template.
 *
 * Adapted from the Claude Design handoff to the real `Template` shape: the
 * stored `fitFactors` are `{ factor, detail }` with no weight, so the Template
 * Fit block renders reasoned factors without weight badges/meters; and
 * `learningNotes` is a prose string, rendered as a paragraph rather than a
 * checklist (see the #48 integration notes).
 */
export function TemplateDetailView({ template }: { template: Template }) {
  return (
    <div className="screen">
      <AppNav active="templates" />
      <main className="page page-narrow">
        <div className="container-narrow">
          <Link className="back-link" href="/templates">
            <ArrowLeft size={14} />
            Back to registry
          </Link>

          <header className="detail-header">
            <div className="detail-slug">{template.slug}</div>
            <h1 className="detail-title">{template.name}</h1>
            <p className="detail-lead">{template.summary}</p>
            <div className="detail-meta">
              <Badge>{template.category}</Badge>
              <SourceBadge
                source={template.source}
                sourceUrl={template.sourceUrl}
                asLink
              />
              <span className="chip">
                {template.fitFactors.length} fit factors
              </span>
              <span className="chip">
                {template.alternatives.length} alternatives
              </span>
            </div>
          </header>

          <section className="section" aria-labelledby="sec-generates">
            <div className="section-head">
              <h2 id="sec-generates" className="section-title">
                What it generates
              </h2>
              <span className="section-hint">
                what you get when you use this template
              </span>
            </div>
            <p className="fit-value lead">{template.whatItGenerates}</p>
          </section>

          <section className="section" aria-labelledby="sec-why">
            <div className="section-head">
              <h2 id="sec-why" className="section-title">
                Why it&apos;s used
              </h2>
              <span className="section-hint">reasoning, not preference</span>
            </div>
            <p className="fit-value lead">{template.whyUsed}</p>
          </section>

          <section className="section" aria-labelledby="sec-fit">
            <div className="section-head fit-head">
              <h2 id="sec-fit" className="section-title fit-title">
                Template Fit
              </h2>
              <span className="fit-subtitle">
                How well this template suits a project, and why.
              </span>
            </div>
            <p className="fit-disclaimer">
              <Shield size={14} aria-hidden="true" />
              Fit is shown as reasoned factors, not a single score — a
              recommendation engine (later) weighs these against your project.
            </p>
            <div className="fit-callout" role="note" aria-label="Fit criteria">
              <span className="fit-callout-icon" aria-hidden="true">
                <Target size={20} />
              </span>
              <div>
                <div className="fit-callout-label">
                  Use this template when your project looks like this
                </div>
                <div className="fit-callout-text">{template.fitCriteria}</div>
              </div>
            </div>
            <ul className="fit-factors">
              {template.fitFactors.map((factor) => (
                <li className="fit-factor" key={factor.factor}>
                  <div className="fit-factor-label">{factor.factor}</div>
                  <div className="fit-factor-note">{factor.detail}</div>
                </li>
              ))}
            </ul>
          </section>

          <section className="section" aria-labelledby="sec-learn">
            <div className="section-head">
              <h2 id="sec-learn" className="section-title">
                What you&apos;ll be able to explain
              </h2>
              <span className="section-hint">interview-ready</span>
            </div>
            <p className="fit-value lead">{template.learningNotes}</p>
          </section>

          <section className="section" aria-labelledby="sec-alts">
            <div className="section-head">
              <h2 id="sec-alts" className="section-title">
                Alternatives considered
              </h2>
              <span className="section-hint">
                other building blocks we weighed and why we picked this one
              </span>
            </div>
            <div className="alt-list">
              {template.alternatives.map((alt) => (
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
              {template.risks.map((risk) => (
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
              {template.sources.map((source) => (
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
            slug: <span className="val">{template.slug}</span>
            <span className="sep">·</span>
            milestone 3 · registry
          </footer>
        </div>
      </main>
    </div>
  )
}
