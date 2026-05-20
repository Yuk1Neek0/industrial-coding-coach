# Spec: Success-Metrics Tree

Issue: #24 · Epic: product · Source: `.claude/prds/product.md` (Success Criteria)

Operationalizes the PRD's success criteria into measurable metrics so later
milestones know what to instrument.

## North-star metric

**The user ships a portfolio project they fully understand and can defend.**

A project is "shipped & understood" when, for that project, the user has:
- completed its understanding path,
- passed ≥ 80% of its comprehension checks,
- exported the job-market artifact set.

## Metrics tree

### Primary outcome

| Metric | Definition | How measured | Target | Instrumented by |
|---|---|---|---|---|
| Understood-project completion | User finishes a project's understanding path at ≥ 80% checks passed | Path state + check scores | ≥ 1 project per active user | M7–M10 |
| Artifact export | User exports architecture explanation + interview Q&A + résumé bullets | Export event | 100% of completed projects | M10 |

### Supporting / leading indicators

| Metric | Definition | How measured | Target | Instrumented by |
|---|---|---|---|---|
| Comprehension-check pass rate | % of checks passed across a project | Check scoring | Rises toward ≥ 80% | M7, M8 |
| Confidence delta | Self-rated "can I defend this project?" before vs after | 1–5 survey at ingest + at completion | +2 or more | M6/M10 |
| Stack-explanation coverage | % of major tools the user can explain (what + why) | Check on each major dependency | ≥ 90% | M5 |
| Debug-challenge completion | User completes ≥ 1 project-specific debug/extension challenge unaided | Challenge state | ≥ 1 per project | M9 |
| Time-to-first-explanation | Time from repo ingest to first grounded explanation | Timestamp delta | Low enough to keep users engaged | M6 |

## Guardrail metrics (must not regress)

- **Groundedness:** explanations reference the user's actual repo, not generic
  text. Measured by spot-review; a generic explanation is a defect.
- **Honesty:** the product never claims the user wrote code they did not.

## M1-specific success

- Product reframed as an understand/review/debug/explain coach (done — PRD).
- Product PRD human-approved before M2 (done).

## Notes

These metrics are **definitions**, not implementation. Instrumentation,
storage, and dashboards are scoped by the milestones noted above; M1 only
defines what success means.
