---
name: product
description: Coach that helps job-seeking junior devs understand, review, debug, and explain their AI-assisted projects
status: backlog
created: 2026-05-20T18:41:41Z
---

# PRD: product

## Executive Summary

Industrial Coding Coach is a **learning coach for AI-assisted code**. It takes a
job-seeking junior developer's existing "vibe-coded" project — a repo built with
heavy AI assistance — and walks them to genuine understanding of it: what the
stack is and why, how the architecture works, and how the project maps onto a
real, professional ("industrial") development workflow shown in real time.

The product does **not** generate projects. It coaches the projects users
already have, so they can **explain and defend that project in interviews** and
ship it as a portfolio piece they truly own. Every explanation is paired with a
comprehension check, and the output includes job-market artifacts: interview
Q&A, résumé bullets, and architecture explanations.

The product is **open-source** and **local-first**: the user runs it on their
own machine and does everything through a browser-based web UI — no external
IDE, editor, or extension required, and their code is analyzed locally. The user
may optionally connect their GitHub account (read-only) to pull in a repo.

This PRD reframes the product (Milestone 1). It defines *what the product is and
for whom*; the capabilities below are realized by later milestones (M2–M10).

## Problem Statement

AI coding tools let a beginner produce a working, impressive-looking project
without understanding it. For a **job-seeking junior developer** (bootcamp
graduate or self-taught), this creates two acute, career-blocking problems:

1. **"I can't explain my own project."** In interviews, code reviews, and
   standups they are asked how their project works and they freeze. The project
   on their résumé becomes a liability instead of an asset — it invites
   questions they cannot answer.
2. **"I don't understand the stack."** They cannot say *why* the project uses
   Next.js, what a given config file does, why the folders are arranged that
   way, or what would change with a different choice. The technology is a black
   box, so they cannot reason about, debug, or extend it.

Underneath both: AI generated the *code*, but not the *understanding* — and not
any exposure to how software is actually built in a professional setting
(specs, issues, PRs, CI, review). Beginners ship output without ever seeing the
industrial workflow that produced equivalent code in a real job.

The cost is concrete: a portfolio full of projects the author cannot defend,
failed technical interviews, and no mental model of professional engineering.

## User Stories

### US-1 — Explain my project in an interview
As a job-seeking junior dev with an AI-built project, I want to be walked
through how my own project actually works, so that I can confidently explain it
in an interview instead of freezing.
**Acceptance:**
- The coach analyzes *my* repo and produces an explanation grounded in my actual
  files — not generic tutorial text.
- I can answer "walk me through your project" end to end: entry point → core
  logic → output.
- I receive interview-style Q&A generated from my project and can answer it.

### US-2 — Understand the stack and why it was chosen
As a job-seeking junior dev, I want to understand each major technology and
structural choice in my project, so that I can reason about it instead of
treating it as a black box.
**Acceptance:**
- For each major dependency / tool, the coach explains *what it does*, *why it
  is used here*, and *what a reasonable alternative would change*.
- The coach explains the project's folder structure and key configuration
  files in terms of my repo.
- I can correctly answer comprehension checks on the stack.

### US-3 — See how real software is built
As a job-seeking junior dev, I want to see the professional ("industrial")
development workflow visualized in real time and mapped onto my project, so that
I understand how working engineers build software — not just how to prompt an AI.
**Acceptance:**
- The coach visualizes the workflow (requirement → spec → issue → change → CI →
  review) and shows where my project's pieces fit.
- I can describe the lifecycle of a change in a professional team.

### US-4 — Ship a portfolio project I can defend
As a job-seeking junior dev, I want to turn one project into a portfolio piece I
fully understand, so that it strengthens my job search instead of exposing me.
**Acceptance:**
- I complete the understanding path for one project and pass its comprehension
  checks.
- I receive exportable job-market artifacts: an architecture explanation,
  interview Q&A, and résumé bullets — all traceable to my project.
- I self-report that I could defend the project to an interviewer.

## Functional Requirements

These are **product-level capabilities**, realized across milestones M2–M10.
M1 implements none of them — it defines them.

- **FR-1 Repo ingestion & analysis.** Accept an existing project — a local
  folder, or a repo from the user's optionally-connected GitHub account
  (read-only access via OAuth or token; delivered in M11). Parse file tree,
  package/manifest files, README, and key source files.
- **FR-2 Stack & architecture explanation.** Explain each major technology and
  structural decision in terms of the user's actual repo: what it does, why it
  is used, alternatives and trade-offs, which files to inspect.
- **FR-3 Real-time industrial-workflow visualization.** Visualize the
  professional development workflow (requirement → spec → issue → change → CI →
  review) and map the user's project onto it.
- **FR-4 Comprehension checks.** Pair every explanation or step with an
  understanding check; record which concepts the user does and does not grasp.
- **FR-5 Guided understanding paths.** Route the user through understanding
  their project via curated "golden paths" and recommendations (the catalog,
  template registry, and recommendation engine of M2–M4).
- **FR-6 Debug & extension challenges.** Give the user concrete, project-specific
  tasks (add a field, trace a failed call, add a test) to prove they can modify
  and debug the project.
- **FR-7 Job-market artifact generation.** Produce exportable artifacts:
  architecture explanation, interview Q&A, résumé bullets, portfolio writeup —
  each tied to the user's project.

## Non-Functional Requirements

- **Grounded, never generic.** Every explanation references the user's actual
  repo. Generic tutorial text is a failure mode, not an acceptable fallback.
- **Comprehension over completion.** Progress is measured by demonstrated
  understanding (passed checks), not by steps clicked.
- **Reviewable & traceable.** Product work follows the M0 CCPM workflow: PRD →
  epic → issue → PR → CI → review. The product practices the workflow it teaches.
- **Honest about AI.** The product does not pretend the user wrote code they did
  not; it converts AI-generated code into user understanding.
- **LLM architecture per ADR 0005.** Core LLM features use the Anthropic SDK
  directly; LangChain is confined to the M6 repo-analysis pipeline.
- **Open-source.** The project is released as open-source (MIT). Its own
  development — built with the M0 CCPM/CI workflow — is a working reference
  example of the industrial workflow it teaches.
- **Local-first.** The product runs on the user's own machine. The user's code
  is analyzed locally and is not uploaded to a third-party server.
- **Web UI, no IDE.** All user interaction happens in a browser-based web app
  (`apps/web`). No external IDE, editor, or extension is required.

## Success Criteria

Primary metric — **the user ships a portfolio project they fully understand and
can defend.** Operationally, for a given project the user:

- completes its understanding path and **passes ≥ 80% of comprehension checks**;
- can give an end-to-end walkthrough (entry point → core logic → output);
- can answer, for every major tool/choice, *what it does* and *why it is here*;
- exports the job-market artifact set (architecture explanation, interview Q&A,
  résumé bullets).

Supporting / leading indicators:

- Self-rated confidence to "defend this project in an interview" rises measurably
  between first ingestion and path completion.
- Comprehension-check pass rate improves across a project.
- The user can complete at least one debug/extension challenge unaided.

M1-specific success: the product is reframed (see Out of Scope) and the Product
PRD is human-approved before Milestone 2 begins.

## Constraints & Assumptions

- **Constraint:** built on the M0 foundation — shadcn/ui Next.js monorepo, CCPM
  workflow, GitHub CI. No new core stack without an ADR.
- **Constraint:** LLM usage follows ADR 0005.
- **Constraint:** all product work follows the M0 workflow (PRD → epic → issue →
  PR → CI → review); no feature without a spec and an issue.
- **Constraint:** the project is open-source (MIT-licensed) and local-first — a
  web app the user runs on their own machine, not a hosted SaaS in the
  milestones covered here.
- **Constraint:** all user interaction is via the web UI in `apps/web`; no IDE
  plugin or desktop-editor dependency.
- **Assumption:** users arrive with an existing AI-assisted project; the product
  is not responsible for creating one.
- **Assumption:** connecting a GitHub account is optional — the product works on
  a local folder without it; GitHub connection (read-only) is delivered in M11.
- **Assumption:** the primary user is a job-seeking junior dev — early-career,
  English-reading, comfortable running an AI tool but not yet able to explain
  the code it produced.
- **Assumption:** authentication, accounts, and persistence are deferred; early
  milestones can operate per-session / on a single project.

## Out of Scope

This PRD explicitly reframes the product. The following are **non-goals**:

- **Not a code generator / scaffolder.** Generating new projects is the job of
  `create-next-app`, CCPM, BMAD, and similar tools. This product coaches
  projects that already exist.
- **Not a generic programming course or tutorial.** Teaching is always anchored
  to the user's own repo, not a syllabus.
- **Not a team project-management tool.** CCPM and Backstage occupy that space;
  here the industrial workflow is shown to *teach*, not to *run a team*.
- **Not an IDE or an autonomous coding agent.** The product explains and checks
  understanding; it does not take over writing the user's code.
- **Not a hosted SaaS or an IDE plugin** in the milestones covered here — it is
  an open-source, local-first web app.
- **Out of scope for M1 specifically:** any implementation, UI, database, auth,
  or LLM integration. M1 produces definition only.

## Dependencies

- **M0 foundation** — monorepo scaffold, CCPM, CI/security, workflow filesystem
  (complete).
- **ADR 0005** — LLM integration architecture (Anthropic SDK core; LangChain at
  M6).
- **Downstream milestones** — capabilities FR-1…FR-7 are delivered by M2 (Golden
  Path Catalog), M3 (Template Registry), M4 (Recommendation Engine), M5 (Stack
  Decision Explainer), M6 (Project Logic Mapper), M7–M9 (issue learning, diff
  review, challenges), M10 (learning memory & portfolio export).
- **M11 (GitHub Integration)** — delivers the optional read-only GitHub-account
  connection referenced in FR-1.
- **Human review** — approval of this PRD is required before Milestone 2.
