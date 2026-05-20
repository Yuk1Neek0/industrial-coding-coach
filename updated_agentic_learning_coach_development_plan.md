# Updated Agentic Learning Coach Development Plan

## 1. Purpose of This Update

This document updates the project development plan after the workflow decision:

> Use CCPM as the core project management and delivery workflow, GitHub CI as the quality gate, Copier as the workflow filesystem initializer, v0 only for UI/interface milestones after page specs, Claude Code as the main implementation agent, and all tool installation must follow official installation methods.

This update is intended to replace the previous loosely combined workflow with a stricter, CCPM-centered production pipeline.

---

## 2. Core Workflow Decision

The project will use the following tool responsibility model:

| Layer | Primary Tool | Responsibility |
|---|---|---|
| Project delivery workflow | CCPM | PRD, Epic, task decomposition, GitHub issue sync, issue execution, tracking, close/merge/archive flow |
| Implementation agent | Claude Code | Executes one bounded GitHub Issue / CCPM task at a time |
| Quality gate | GitHub Actions CI | Runs install, lint, build, tests, security checks |
| Workflow filesystem initializer | Copier | Generates the standard docs, workflow, and GitHub template structure |
| UI draft generation | v0 | Used only for approved UI/interface issues after page specs |
| Product / engineering approval | Human review | Approves scope, architecture, tools, PRs, and milestone completion |

The project must not use a custom “CCPM-like” workflow invented by Claude Code. The installed CCPM skill and its official reference files are the source of truth for CCPM operations.

---

## 3. Updated Global Development Rule

Every milestone must follow this pattern:

```text
Roadmap / Milestone Goal
→ CCPM Plan: PRD / Spec
→ CCPM Epic: technical planning
→ CCPM Structure: task decomposition
→ CCPM Sync: GitHub issues + worktree / mapping if supported by installed CCPM
→ One GitHub Issue / CCPM task at a time
→ UI issue? Page Spec → v0 prompt → v0 draft → Claude Code integration
→ Claude Code implementation
→ AI self-review
→ local verification
→ Pull Request
→ GitHub CI / security checks
→ human review
→ merge / cleanup / archive through CCPM where applicable
→ retrospective
```

Hard rule:

```text
No product feature implementation is allowed without a PRD/spec and a CCPM issue/task.
```

---

## 4. CCPM as the Core Delivery Workflow

### 4.1 Required CCPM Usage

Claude Code must use the installed CCPM skill for:

- creating PRDs;
- parsing PRDs into technical epics;
- decomposing epics into tasks;
- syncing epics/tasks to GitHub Issues;
- starting issue execution;
- tracking status, standup, next, blocked, and validation;
- closing issues;
- merging / cleanup / archive operations where supported by the installed CCPM skill.

Claude Code must not manually recreate CCPM folder formats, GitHub issue formats, or scripts unless the installed CCPM reference files explicitly instruct it to do so.

### 4.2 Required Reading Before CCPM Work

Before any CCPM operation, Claude Code must read:

```text
.claude/skills/ccpm/SKILL.md
.claude/skills/ccpm/references/conventions.md
```

Then it must read the phase-specific reference file:

```text
Plan      → references/plan.md
Structure → references/structure.md
Sync      → references/sync.md
Execute   → references/execute.md
Track     → references/track.md
```

If the installed CCPM version differs from this expected structure, Claude Code must stop and report the difference instead of guessing.

### 4.3 CCPM Command Discipline

For deterministic tracking operations, Claude Code must use CCPM scripts when available, such as:

```text
status
standup
next
blocked
validate
epic-list
epic-status
prd-list
```

The principle is:

```text
Scripts for deterministic status.
LLM reasoning for planning, architecture, implementation, and review.
```

---

## 5. GitHub CI as the Quality Gate

### 5.1 CI Creation Rule

CI must not be invented from memory.

The first CI baseline should be created from official or mature templates, then customized to the actual repository structure.

Required inspection before writing CI:

```text
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
turbo.json
apps/web/package.json
packages/ui/package.json
```

### 5.2 Required CI Baseline

The project must include:

```text
.github/workflows/ci.yml
.github/workflows/security.yml
.github/workflows/codeql.yml
.github/dependabot.yml
.gitleaks.toml
```

### 5.3 Minimum CI Checks

For the current Next.js / TypeScript / shadcn monorepo foundation, CI should run at minimum:

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

Security baseline:

```text
Gitleaks
CodeQL
Dependabot
```

### 5.4 CI and Merge Rule

A task is not merge-ready until:

- local verification has passed or failures are documented;
- AI self-review is complete;
- a PR exists;
- GitHub CI/security checks pass;
- human review approves the change.

CCPM manages delivery state. GitHub CI manages quality gates. Human review remains the final approval authority.

---

## 6. Copier as the Workflow Filesystem Initializer

### 6.1 Copier Responsibility

Copier is responsible for generating the standard workflow filesystem and project governance templates.

The baseline should include:

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

### 6.2 No Manual Folder Sprawl

Claude Code must not manually create an ad-hoc workflow filesystem that bypasses Copier.

Allowed:

```text
Use Copier or an approved Copier-based foundation overlay to initialize structure.
```

Also allowed:

```text
After the structure exists, Claude Code may create specific task documents inside approved folders.
```

Not allowed:

```text
Inventing a new docs structure during implementation.
```

### 6.3 Copier Template Evolution

After the first project structure and CI baseline are validated, they should be added to the Copier foundation template so future projects can generate the same structure consistently.

---

## 7. UI / Interface Milestone Rule

### 7.1 When v0 Must Be Used

For UI/interface milestones, every UI page or major interface issue must include v0 in the workflow.

Correct UI flow:

```text
Product requirement
→ Page Spec
→ human review of Page Spec
→ v0 prompt
→ v0 UI draft
→ Claude Code integration
→ UI review
→ lint / build / tests
```

### 7.2 When v0 Must Not Be Used

v0 must not be used for:

- foundation setup;
- CI setup;
- CCPM setup;
- Copier setup;
- backend logic;
- recommendation algorithms;
- database schemas;
- security configuration;
- architecture decisions;
- product scope decisions.

v0 generates interface drafts. It does not decide product scope or architecture.

### 7.3 Page Spec Requirement

Before using v0, Claude Code must create a page spec under:

```text
docs/design/
```

A page spec must include:

- page name;
- user goal;
- target user;
- route;
- data source / API contract if available;
- page sections;
- input fields;
- primary actions;
- loading state;
- empty state;
- error state;
- success state;
- accessibility notes;
- acceptance criteria.

### 7.4 v0 Prompt Storage

The v0 prompt must be stored under:

```text
docs/design/v0-prompts/
```

The v0 output integration notes should be stored under:

```text
docs/design/v0-integration-notes/
```

This makes UI generation traceable.

---

## 8. Claude Code Execution Rule

Claude Code is the main implementation agent, but it must work under strict issue boundaries.

Before editing files, Claude Code must state:

```text
Current issue/task
Expected files to modify
Plan of attack
Verification commands
Risks / assumptions
```

After editing files, Claude Code must provide:

```text
Changed files summary
Acceptance criteria checklist
Verification results
Risk notes
Follow-up issues if needed
```

Claude Code must stop after one bounded task and wait for human review.

---

## 9. Official Installation Rule

All tool installation and upgrades must follow official documentation or the official repository README.

This applies to:

- CCPM;
- Claude Code setup tools;
- shadcn/ui;
- Copier;
- GitHub Actions;
- Gitleaks;
- CodeQL;
- Dependabot;
- v0;
- Storybook / Playwright if adopted later.

Before installing or upgrading a major tool, Claude Code must:

```text
1. Check official docs or official README.
2. Record the source in a setup note or ADR.
3. Explain the expected files and permissions.
4. Ask for human approval if the tool changes architecture, permissions, or workflow.
```

Claude Code must not install major tools from memory.

---

## 10. Updated Milestone 0 Plan

Milestone 0 remains a foundation milestone. It must not implement product UI pages or product business logic.

### M0.1 Clean App Scaffold with shadcn/ui Monorepo

Use the official shadcn/ui monorepo setup method.

Expected output:

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

Verification:

```bash
pnpm install
pnpm lint
pnpm build
```

### M0.2 Install Claude Code Project Setup

Use the official method for the chosen Claude Code setup tool.

Expected output:

```text
CLAUDE.md
.claude/settings.json
.claude/commands/
.claude/agents/
optional .claude/skills/
.mcp.json
```

Human review required before commit.

### M0.3 Install CCPM as the Core Workflow Layer

Install CCPM strictly according to the official CCPM installation method.

Expected output:

```text
.claude/skills/ccpm/
```

Verification:

```text
Claude Code can read CCPM SKILL.md.
Claude Code can explain installed CCPM phases using local files.
Claude Code does not invent a separate workflow.
```

### M0.4 Create Local Claude Code Workflow Memory

Update `CLAUDE.md` to include:

- CCPM as core workflow;
- one issue at a time;
- no product feature during M0;
- CI as quality gate;
- Copier as filesystem initializer;
- v0 only after page specs for UI issues;
- official installation rule;
- human review gates.

### M0.5 Initialize Workflow Filesystem with Copier

Use Copier or an approved Copier-based foundation overlay.

Expected output:

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

### M0.6 Create Foundation PRD with CCPM

Use CCPM Plan phase.

The PRD must cover:

- scaffold state;
- Claude Code setup;
- CCPM setup;
- Copier workflow filesystem;
- GitHub Issues workflow;
- CI/security baseline;
- tool radar;
- no product feature implementation.

### M0.7 Convert Foundation PRD to Epic and GitHub Issues

Use CCPM Epic / Structure / Sync phases.

Expected output:

```text
foundation epic
small GitHub issues
acceptance criteria
verification notes
execution order
```

### M0.8 Add CI and Security Baseline

Use official/mature templates first, then customize for the actual monorepo.

Required files:

```text
.github/workflows/ci.yml
.github/workflows/security.yml
.github/workflows/codeql.yml
.github/dependabot.yml
.gitleaks.toml
```

CI minimum:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
```

### M0.9 Add GitHub Engineering Governance

Configure or document:

- PR required before merge;
- required status checks;
- disallow force push to main;
- require conversation resolution where practical;
- enable Issues;
- enable security alerts where available.

### M0.10 Establish Tool Radar and Trial Track

Adopted main path:

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

Trial track:

```text
v0
BMAD
GitHub Spec Kit
OpenHands
Langfuse
Storybook
Playwright
```

### M0.11 Verify and Commit Foundation

Run:

```bash
pnpm install
pnpm lint
pnpm build
git status
git diff
```

Definition of Done:

```text
scaffold verified
Claude Code setup reviewed
CCPM installed and usable
Copier workflow filesystem exists
Foundation PRD exists
Foundation epic/issues exist or are documented
CI/security baseline exists
GitHub governance configured or documented
tool radar exists
no product features implemented
human review complete
```

---

## 11. Updated Milestone 1 Plan

Milestone 1 remains product reframing and core problem definition.

Required flow:

```text
CCPM Plan
→ product PRD
→ human review
→ CCPM Epic
→ CCPM Structure
→ GitHub Issues
```

Deliverables:

- product vision;
- target user profiles;
- problem statements;
- product positioning;
- non-goals;
- success metrics;
- updated product PRD.

No v0 is required unless Milestone 1 explicitly creates a UI/interface issue such as a landing page, onboarding page, or product concept screen.

---

## 12. Updated Milestone 2 Plan

Milestone 2: Golden Path Catalog MVP.

Required flow:

```text
CCPM Plan / Spec
→ catalog schema decision
→ ADR if needed
→ CCPM Epic / Tasks
→ GitHub Issues
→ one issue at a time
→ CI
→ PR
→ review
```

v0 is not required for catalog data/schema issues.

v0 is required only if M2 includes UI issues such as:

- Golden Path Catalog Page;
- Golden Path Detail Page;
- Golden Path Comparison UI;
- Recommendation Explanation Card.

For each UI issue:

```text
Page Spec
→ v0 prompt
→ v0 draft
→ Claude Code integration
```

---

## 13. Updated Milestone 3 Plan

Milestone 3: Template Registry MVP.

Main work:

- template schema;
- template registry entries;
- category and scoring logic;
- learning notes;
- Golden Path references.

v0 is not required for data/model/schema tasks.

v0 is required only for UI issues such as:

- Template Registry List Page;
- Template Detail Page;
- Template Fit Score UI.

---

## 14. Updated Milestone 4 Plan

Milestone 4: Recommendation Engine MVP.

Main work:

- user intake schema;
- recommendation logic;
- scoring / matching;
- rejected alternatives;
- explanation generation;
- reviewable output.

v0 is required for interface issues such as:

- Recommendation Intake Page;
- Recommendation Result Page;
- Trade-off Explanation UI;
- Learning Checkpoint UI.

Each interface issue must follow:

```text
Page Spec
→ v0 prompt
→ v0 draft
→ Claude Code integration
→ UI review
→ lint/build/test
```

---

## 15. Updated Future Milestone Rules

For all future milestones:

### Backend / logic / data milestone

Use:

```text
CCPM → GitHub Issues → Claude Code → tests → CI → PR → review
```

v0 is not required.

### UI / interface milestone

Use:

```text
CCPM → GitHub Issues → Page Spec → v0 → Claude Code → UI review → CI → PR → review
```

v0 is required.

### Architecture / tool adoption milestone

Use:

```text
ADR / RFC → official docs check → human approval → bounded implementation issue
```

v0 is not required.

---

## 16. Updated Definition of Done

A task is done only when:

- it maps to a CCPM task or GitHub Issue;
- acceptance criteria are satisfied;
- AI self-review is complete;
- human review is complete;
- local verification passes or failures are documented;
- GitHub CI/security checks pass for PR work;
- no secrets are committed;
- related docs/checklists are updated;
- UI work includes page spec and v0 trace if applicable;
- follow-up issues are documented;
- merge / cleanup / archive is completed where applicable.

---

## 17. Practical Next Action

The next recommended action is to update the project local guidance files:

```text
CLAUDE.md
docs/decisions/development-workflow.md
docs/milestones/M0-ai-native-foundation.md
```

Then execute M0 using CCPM:

```text
Use CCPM.
We are executing Milestone 0 only.
Read the updated workflow rule.
Create or update the Foundation PRD.
Stop for human review.
```
