# Agentic Learning Coach — Updated Milestone Plan

## Update Summary

This milestone plan updates the project around the following decision:

> CCPM is the core delivery workflow. GitHub CI is the quality gate. Copier initializes the workflow filesystem. v0 is required only for UI/interface work after page specs. Claude Code is the main implementation agent. All tools must be installed using their official installation methods.

This document replaces the previous milestone execution assumptions with a stricter CCPM-centered process.

---

## Global Development Rule

Every milestone must follow this flow:

```text
Milestone Goal
→ CCPM Plan: PRD / Spec
→ CCPM Epic: technical planning
→ CCPM Structure: task decomposition
→ CCPM Sync: GitHub Issues + worktree / mapping if supported by installed CCPM
→ One GitHub Issue / CCPM task at a time
→ UI issue? Page Spec → v0 Prompt → v0 Draft → Claude Code Integration
→ Claude Code Implementation
→ AI Self-Review
→ Local Verification
→ Pull Request
→ GitHub CI / Security Checks
→ Human Review
→ Merge / Cleanup / Archive through CCPM where applicable
→ Retrospective
```

Hard rules:

- No product feature can be implemented without a PRD/spec and a CCPM task or GitHub Issue.
- Claude Code must not invent a custom CCPM-like workflow.
- Claude Code must follow the installed `.claude/skills/ccpm/` workflow and reference files.
- Claude Code must execute one bounded issue at a time.
- UI/interface issues must include page specs and v0 drafts.
- CI must pass before merge.
- Human review is required before merge and milestone completion.
- Tool installation must follow official documentation or official repository README.

---

## Tool Responsibility Map

| Layer | Tool | Responsibility |
|---|---|---|
| Delivery workflow | CCPM | PRD, epic, task decomposition, GitHub sync, tracking, issue execution, close/merge/archive |
| Implementation | Claude Code | Executes one bounded issue at a time |
| Quality gate | GitHub Actions CI | install, lint, build, tests, security checks |
| Security baseline | Gitleaks, CodeQL, Dependabot | secrets, static analysis, dependency risk |
| Workflow filesystem | Copier | initializes docs, templates, workflow folders, `.env.example` |
| UI draft generation | v0 | UI/interface drafts after page specs |
| Human control | Human review | approves scope, architecture, tools, PRs, milestone completion |

---

# Milestone 0: AI-Native Development Pipeline Foundation

## Goal

Create the clean, traceable, AI-native industrial development foundation for the project.

M0 is not product feature development. It establishes the project scaffold, Claude Code setup, CCPM workflow, workflow filesystem, GitHub issue workflow, CI/security baseline, and governance.

## Non-Goals

M0 must not implement:

- product UI pages;
- Golden Path recommendation logic;
- Template Registry business logic;
- LLM API business features;
- database;
- authentication;
- user accounts.

---

## M0.1 Clean App Scaffold with shadcn/ui Monorepo

### Purpose

Create the app and package foundation using the official shadcn/ui monorepo setup method.

### Tool Rule

Use official shadcn/ui documentation or official README only.

### Expected Output

```text
apps/web/
packages/ui/
package.json
pnpm-workspace.yaml
turbo.json
Tailwind
shadcn/ui
Next.js
TypeScript
```

### Verification

```bash
pnpm install
pnpm lint
pnpm build
```

### Acceptance Criteria

- No nested project folder problem.
- Root directory is the monorepo root.
- `pnpm install` works.
- `pnpm lint` works or lint status is documented.
- `pnpm build` works.
- No product feature is implemented.

---

## M0.2 Install Claude Code Project Setup

### Purpose

Make local Claude Code aware of the project rules, commands, agents, hooks, MCP configuration, and local guidance.

### Tool Rule

Use the official installation method for the selected Claude Code setup tool.

### Expected Output

```text
CLAUDE.md
.claude/settings.json
.claude/commands/
.claude/agents/
optional .claude/skills/
.mcp.json
```

### Acceptance Criteria

- Generated files exist locally.
- Hooks are reviewed before commit.
- `.mcp.json` contains no secrets.
- High-permission configuration requires human approval.
- Claude Code setup is committed only after review.

---

## M0.3 Install CCPM as Core Delivery Workflow Layer

### Purpose

Install CCPM as the core workflow for PRD → Epic → Tasks → GitHub Issues → Agent Execution.

### Tool Rule

Use the official CCPM installation method.

### Expected Output

```text
.claude/skills/ccpm/
```

### Required Verification

Claude Code must be able to read:

```text
.claude/skills/ccpm/SKILL.md
.claude/skills/ccpm/references/conventions.md
```

### Acceptance Criteria

- CCPM files are present.
- Claude Code can explain the installed CCPM workflow from local files.
- Claude Code does not invent a separate workflow.
- No product code is implemented during installation.
- Any conflict with existing `.claude/` setup is reviewed.

---

## M0.4 Create Local Claude Code Workflow Memory

### Purpose

Make local Claude Code enforce the project workflow, boundaries, and tool responsibilities.

### Required Updates

`CLAUDE.md` must include:

- CCPM as the core delivery workflow;
- one issue at a time;
- no product features during M0;
- human planning/review gates;
- GitHub CI as quality gate;
- Copier as workflow filesystem initializer;
- v0 only for UI/interface issues after page specs;
- official installation rule;
- security rules;
- source-of-truth rules.

### Acceptance Criteria

- Claude Code can follow the workflow without repeated human reminders.
- Claude Code knows to stop after one task for human review.
- Product features require PRD/spec/issue first.
- Local AI guidance is committed.

---

## M0.5 Initialize Workflow Filesystem with Copier

### Purpose

Generate the documentation and workflow filesystem with Copier instead of ad-hoc manual folders.

### Tool Rule

Use Copier or an approved Copier-based foundation overlay.

### Copier Must Generate

```text
docs/current/
docs/milestones/
docs/specs/
docs/design/
docs/decisions/
docs/testing/
docs/review/
docs/retrospectives/
docs/archive/
.github/ISSUE_TEMPLATE/
.github/PULL_REQUEST_TEMPLATE.md
.env.example
```

### Acceptance Criteria

- Structure is generated from Copier or documented foundation overlay.
- Folder purpose and source-of-truth rules are documented.
- CCPM, v0, test, review, and decision outputs have defined locations.
- Claude Code does not invent an alternative structure.

---

## M0.6 Create Foundation PRD with CCPM

### Purpose

Use CCPM immediately on the project foundation itself.

### CCPM Phase

```text
CCPM Plan
```

### PRD Scope

Foundation PRD must include:

- current scaffold state;
- Claude Code setup;
- CCPM workflow;
- Copier workflow filesystem;
- GitHub Issues workflow;
- CI/security baseline;
- tool radar/trial track;
- no product feature implementation.

### Acceptance Criteria

- Foundation PRD exists in the CCPM-expected location or documented equivalent.
- PRD defines scope and non-scope clearly.
- Human review approves the PRD before task execution.

---

## M0.7 Convert Foundation PRD to Epic and GitHub Issues

### Purpose

Make GitHub Issues the execution source of truth.

### CCPM Phases

```text
CCPM Epic
CCPM Structure
CCPM Sync
```

### Expected Output

```text
foundation epic
small actionable issues
acceptance criteria
verification notes
execution order
GitHub Issues
worktree / mapping if supported by installed CCPM
```

### Acceptance Criteria

- GitHub CLI is authenticated.
- Issues are created or issue creation is explicitly documented if deferred.
- Each issue is small enough for one agent execution pass.
- Each issue has acceptance criteria and verification notes.

---

## M0.8 Add CI and Security Baseline

### Purpose

Create quality gates before product implementation starts.

### Creation Rule

CI must be created from official or mature templates first, then customized to the actual monorepo.

Claude Code must inspect before writing CI:

```text
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
turbo.json
apps/web/package.json
packages/ui/package.json
```

### Required Files

```text
.github/workflows/ci.yml
.github/workflows/security.yml
.github/workflows/codeql.yml
.github/dependabot.yml
.gitleaks.toml
```

### Minimum CI

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
```

When tests exist:

```bash
pnpm test
pnpm test:e2e
```

### Security Baseline

```text
Gitleaks
CodeQL
Dependabot
```

### Acceptance Criteria

- CI runs on PRs and pushes to `main`.
- Security baseline exists.
- `.env` is ignored.
- `.env.example` is committed.
- No secrets are committed.
- CI files are reviewed by human.

---

## M0.9 Add GitHub Engineering Governance

### Purpose

Protect the main branch and enforce reviewable work.

### Configure or Document

- PR required before merge;
- required status checks after CI names are known;
- disallow force push to main;
- require conversation resolution where practical;
- enable Issues;
- enable security alerts where available.

### Acceptance Criteria

- Governance settings are configured or documented.
- Main branch is protected before product feature development.
- Required checks align with actual CI job names.

---

## M0.10 Establish Tool Radar and Trial Track

### Purpose

Allow powerful tools to be explored without polluting the main path.

### Adopted Main Path

```text
shadcn/ui monorepo
Claude Code
CCPM
GitHub Issues
GitHub Actions
Gitleaks
CodeQL
Dependabot
Copier
```

### Trial Track

```text
v0
BMAD
GitHub Spec Kit
OpenHands
Langfuse
Storybook
Playwright
```

### Assess Track

```text
Backstage
Port
Red Hat Developer Hub templates
Roadie templates
Pulumi templates
contract-first templates
```

### Acceptance Criteria

- Tool radar exists.
- Each tool has status: Adopt / Trial / Assess / Hold.
- Every adopted tool has reason and risk note.
- Trial tools are not added to the main path without review.

---

## M0.11 Verify and Commit Foundation

### Run Locally

```bash
pnpm install
pnpm lint
pnpm build
git status
git diff
```

### Acceptance Criteria

- Local build passes.
- Claude Code setup exists and is reviewed.
- CCPM setup exists and is reviewed.
- Copier workflow filesystem exists.
- Foundation PRD exists.
- Foundation epic/issues exist or are documented.
- CI/security baseline exists.
- GitHub governance is configured or documented.
- Tool radar exists.
- No product features are implemented.
- Human review is complete.
- Foundation is committed.

---

## M0 Definition of Done

M0 is complete when:

- shadcn monorepo is clean and verified;
- Claude Code project setup is installed and reviewed;
- CCPM is installed and usable;
- Copier workflow filesystem exists;
- Foundation PRD is created through CCPM;
- Foundation PRD is converted into epic/issues or issue plan;
- CI/security baseline exists;
- GitHub governance is configured or documented;
- tool radar/trial track exists;
- human review has approved the foundation;
- no secrets are committed;
- no product features are implemented.

---

# Milestone 1: Product Reframing and Core Problem Definition

## Goal

Define the product around the real problem: helping users understand, review, debug, and explain AI-assisted or vibe-coded projects.

## Required Flow

```text
CCPM Plan
→ Product PRD
→ Human Review
→ CCPM Epic
→ CCPM Structure
→ GitHub Issues
```

## Deliverables

- product vision;
- target user profiles;
- core problem definition;
- product positioning;
- non-goals;
- success metrics;
- updated product PRD.

## Key Questions

- Who is the user?
- What does the user not understand after vibe coding a project?
- What advantage should the product give the user in job search, expansion, debugging, and review?
- How is this different from CCPM, BMAD, Kiro, Backstage, or a normal tutorial?

## v0 Rule

v0 is not required for M1 unless M1 creates a UI/interface issue such as:

- landing page concept;
- onboarding concept;
- product positioning screen;
- early dashboard concept.

If a UI issue exists:

```text
Page Spec
→ v0 Prompt
→ v0 Draft
→ Claude Code Integration
```

## Acceptance Criteria

- Product is no longer framed as generic project generation.
- Product is framed as project understanding, review, debug, and explanation coach.
- Human review approves the PRD before M2.

---

# Milestone 2: Golden Path Catalog MVP

## Goal

Create the first version of the Golden Path Catalog.

Golden Paths define full recommended development routes. They combine templates, workflow, quality gates, and learning outcomes.

## Required Flow

```text
CCPM Plan / Spec
→ catalog schema decision
→ ADR if needed
→ CCPM Epic / Tasks
→ GitHub Issues
→ One issue at a time
→ CI
→ PR
→ Review
```

## Initial Golden Paths

- AI-native Next.js App
- Agentic CCPM Workflow
- Repo Understanding / Review Coach
- Contract-first Fullstack App
- LLM Observability and Eval App

## Deliverables

- catalog schema;
- first 3-5 golden path entries;
- matching criteria;
- explanation fields;
- rejected alternatives field;
- learning outcomes field.

## v0 Rule

v0 is not required for catalog schema/data tasks.

v0 is required only for UI issues such as:

- Golden Path Catalog Page;
- Golden Path Detail Page;
- Golden Path Comparison UI;
- Recommendation Explanation Card.

## Acceptance Criteria

- Recommendations are not naked LLM guesses.
- Each Golden Path has sources, risks, fit criteria, and learning value.
- User can understand why a path was recommended.

---

# Milestone 3: Template Registry MVP

## Goal

Create a structured registry of real-world templates used inside Golden Paths.

## Required Flow

```text
CCPM Plan / Spec
→ template schema decision
→ ADR if needed
→ CCPM Epic / Tasks
→ GitHub Issues
→ One issue at a time
→ CI
→ PR
→ Review
```

## Initial Templates

- shadcn/ui monorepo
- create-next-app
- T3 stack
- claude-code-templates
- CCPM
- GitHub Spec Kit
- BMAD
- GitHub Actions Node CI
- CodeQL
- Gitleaks
- Dependabot
- ADR template
- PRD template
- OpenAPI contract-first template
- Langfuse integration starter

## Deliverables

- template schema;
- template registry entries;
- template categories;
- template fit scoring;
- template learning notes.

## v0 Rule

v0 is not required for data/model/schema tasks.

v0 is required only for UI issues such as:

- Template Registry List Page;
- Template Detail Page;
- Template Fit Score UI.

## Acceptance Criteria

- Templates are separated from Golden Paths.
- Golden Paths reference templates.
- Each template explains what it generates, why it is used, risks, alternatives, and learning value.

---

# Milestone 4: Recommendation Engine MVP

## Goal

Recommend a Golden Path and template set based on user context.

## Required Flow

```text
CCPM Plan / Spec
→ recommendation logic design
→ ADR if needed
→ CCPM Epic / Tasks
→ GitHub Issues
→ One issue at a time
→ CI
→ PR
→ Review
```

## User Intake

Collect:

- user goal;
- experience level;
- known stack;
- job target;
- time budget;
- complexity tolerance;
- project type;
- AI tool preference;
- learning focus.

## Output

- recommended topic;
- recommended Golden Path;
- selected templates;
- rejected alternatives;
- why each choice fits;
- complexity risks;
- learning checkpoints;
- portfolio value.

## v0 Rule

v0 is required for interface issues such as:

- Recommendation Intake Page;
- Recommendation Result Page;
- Trade-off Explanation UI;
- Learning Checkpoint UI.

Each UI issue must follow:

```text
Page Spec
→ v0 Prompt
→ v0 Draft
→ Claude Code Integration
→ UI Review
→ lint / build / test
```

## Acceptance Criteria

- Recommendation cites catalog entries.
- Recommendation includes trade-offs.
- Recommendation is reviewable and editable by human.

---

# Milestone 5: Stack Decision Explainer

## Goal

Help users understand why an AI-assisted or vibe-coded project uses a specific technology stack.

## Required Flow

```text
CCPM Plan / Spec
→ explainer model design
→ CCPM Epic / Tasks
→ GitHub Issues
→ One issue at a time
→ CI
→ PR
→ Review
```

## Deliverables

- stack decision map;
- tool purpose explanation;
- alternatives and trade-offs;
- job-market relevance;
- key files to inspect;
- debugging entry points.

## v0 Rule

v0 is required for UI issues such as:

- Stack Explanation Page;
- Stack Decision Map UI;
- Alternatives Comparison UI.

## Acceptance Criteria

- User can explain the purpose of each major tool.
- User can explain what would change if an alternative was used.
- Explanation is tied to the project and not generic tutorial text.

---

# Milestone 6: Project Logic Mapper

## Goal

Generate an understandable map of an AI-generated project.

## Inputs

- repo file tree;
- package files;
- README;
- key files;
- issue/PR context if available.

## Outputs

- architecture overview;
- key file map;
- request/data flow;
- state flow;
- AI call flow if applicable;
- Mermaid diagrams;
- debug path.

## v0 Rule

v0 is required for UI issues such as:

- Project Map Page;
- Architecture Flow Viewer;
- File Map Explorer;
- Debug Path UI.

## Acceptance Criteria

- User can explain the project flow from entry point to core output.
- User knows where to start debugging common failures.

---

# Milestone 7: Issue-Based Learning Workspace

## Goal

Turn each GitHub Issue / CCPM task into a learning unit.

## Deliverables

- issue goal;
- related files;
- concepts to understand;
- AI agent execution notes;
- review checklist;
- understanding questions;
- debug/expand challenge.

## v0 Rule

v0 is required for UI issues such as:

- Issue Learning Workspace;
- Review Checklist UI;
- Understanding Questions UI;
- Challenge Panel.

## Acceptance Criteria

- Each issue teaches something concrete.
- User can review AI work instead of passively accepting it.

---

# Milestone 8: Diff Review and Understanding Check

## Goal

Analyze AI-generated changes and verify whether the user understands them.

## Inputs

- Git diff;
- PR;
- issue acceptance criteria;
- relevant specs.

## Outputs

- changed file explanation;
- core logic explanation;
- risk analysis;
- test suggestions;
- comprehension questions;
- score / weak areas.

## v0 Rule

v0 is required for UI issues such as:

- Diff Review Page;
- Risk Analysis Panel;
- Understanding Check UI;
- Score / Weak Area UI.

## Acceptance Criteria

- User can explain what changed and why.
- User can identify possible bugs or risks.
- User gets targeted review questions.

---

# Milestone 9: Debug and Expansion Challenge System

## Goal

Help users prove they can modify or debug the project.

## Challenge Types

- add a small field;
- trace a failed API call;
- fix schema mismatch;
- add loading/error state;
- add a unit test;
- explain a broken CI result;
- extend one module safely.

## v0 Rule

v0 is required for UI issues such as:

- Challenge List Page;
- Challenge Detail Page;
- Debug Walkthrough UI;
- Completion Review UI.

## Acceptance Criteria

- Challenge is tied to actual project structure.
- User explains what files to change and why.
- System records whether the user demonstrates understanding.

---

# Milestone 10: Learning Memory and Portfolio Export

## Goal

Turn project understanding into durable learning memory and job-market materials.

## Outputs

- learning memory tree;
- stack decision notes;
- architecture explanation;
- debug stories;
- issue learning logs;
- interview Q&A;
- resume bullets;
- portfolio project explanation.

## v0 Rule

v0 is required for UI issues such as:

- Learning Memory Page;
- Portfolio Export Page;
- Interview Q&A UI;
- Resume Bullet Export UI.

## Acceptance Criteria

- User can export project explanation materials.
- User can show what they learned, not just what AI generated.

---

# Future Milestones

## M11: GitHub Integration

Import GitHub repos, issues, PRs, and diffs.

## M12: CCPM Integration

Read CCPM PRDs, epics, tasks, and issue traceability.

## M13: Langfuse / LLM Observability Integration

Track prompts, outputs, costs, failures, and evals for AI app projects.

## M14: Backstage / Golden Path Source Import

Import or map Backstage-style software templates into the Template Registry.

## M15: Team / Classroom Mode

Allow instructors, mentors, or teams to assign Golden Paths and review understanding.

---

# Global Definition of Done

A milestone is complete only when:

- the milestone has a CCPM PRD/spec;
- the milestone has a CCPM epic and tasks;
- tasks are synced to GitHub Issues or sync deferral is documented;
- each completed issue has acceptance criteria checked;
- Claude Code execution stayed within issue scope;
- AI self-review is complete;
- human review is complete;
- local verification passes or failures are documented;
- GitHub CI/security checks pass for PR work;
- UI work includes Page Spec, v0 prompt, v0 draft, and integration notes where applicable;
- documentation is updated;
- no secrets are committed;
- merge / cleanup / archive is completed where applicable;
- retrospective notes exist.
