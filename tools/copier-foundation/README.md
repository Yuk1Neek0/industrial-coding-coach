# Copier Foundation Template

This is the **Copier** template that satisfies the tracked follow-up in
[`docs/decisions/0002-workflow-filesystem.md`](../../docs/decisions/0002-workflow-filesystem.md):
it regenerates the `docs/` workflow filesystem, the `.github/` issue/PR
templates, and a starter `.env.example` for any new project that wants the same
overlay this repository uses.

Authored against the official Copier docs:

- <https://copier.readthedocs.io/en/stable/configuring/>
- <https://copier.readthedocs.io/en/stable/creating/>

> **Tool installation rule.** Copier itself is *not* installed by this repo.
> The template ships only as source files. Install Copier per its official
> installation guide before using the template.

## What it generates

Running this template produces:

```
docs/
  README.md                       # folder-purpose table, parameterized
  current/.gitkeep
  milestones/.gitkeep
  milestones/README.md            # milestone-doc conventions
  specs/.gitkeep
  design/.gitkeep
  design/ui-prompts/.gitkeep
  design/ui-integration-notes/.gitkeep
  decisions/.gitkeep
  decisions/README.md             # ADR conventions
  decisions/0001-development-workflow.md   # starter ADR
  testing/.gitkeep
  review/.gitkeep
  retrospectives/.gitkeep
  archive/.gitkeep
.github/
  ISSUE_TEMPLATE/bug_report.md
  ISSUE_TEMPLATE/task.md
  ISSUE_TEMPLATE/config.yml
  PULL_REQUEST_TEMPLATE.md
.env.example
```

This matches the structure ADR 0002 describes, with one intentional rename
documented below.

## Usage

From the directory in which you want the project to be generated:

```bash
copier copy gh:<owner>/<repo>/tools/copier-foundation <destination>
# or against a local checkout:
copier copy ./tools/copier-foundation /path/to/new-project
```

Copier will prompt for the questions defined in `copier.yml`:

| Question | Purpose |
|---|---|
| `project_name` | Human-readable name used in headings and prose |
| `project_slug` | Lowercase machine slug used in filenames and CLI snippets |
| `description` | One-sentence project description |
| `license` | SPDX identifier (choice list) |
| `github_owner` | GitHub user/org that hosts the repo |
| `github_repo` | Repository name |

Re-run with `copier update` later to pick up template changes — answers are
recorded in `.copier-answers.yml` in the generated project.

## Template structure

```
tools/copier-foundation/
├── README.md          # this file
├── copier.yml         # Copier settings + questions
└── template/          # rendered into the destination
    ├── docs/
    ├── .github/
    └── .env.example.jinja
```

`copier.yml` sets `_subdirectory: template`, so this README and `copier.yml`
itself stay out of the generated project. `_templates_suffix: .jinja` means a
file like `README.md.jinja` is rendered to `README.md` in the output.

## Deviations from the ADR 0002 sketch

ADR 0002 was written before ADR 0007 (UI generation tool) settled on **Claude
Design** instead of v0. The live `docs/design/` tree therefore uses:

- `docs/design/ui-prompts/`            (was `v0-prompts/` in the ADR sketch)
- `docs/design/ui-integration-notes/`  (was `v0-integration-notes/`)

The template follows the live tree because ADR 0002's hard rule is "do not
invent an alternative structure" — and the live structure is the canonical
overlay. The ADR's example block is a snapshot from before that rename.

No other deviations.

## Verification (when ready to test)

This template is authoring-only in this PR; no Copier install is performed
here. To verify after Copier is installed locally:

```bash
copier copy tools/copier-foundation /tmp/test-foundation
diff -r --brief \
  /tmp/test-foundation/docs \
  docs \
  | grep -v -E '\.copier-answers\.yml|specs/|design/(?!ui-prompts|ui-integration-notes|\.gitkeep)|milestones/|decisions/000[2-9]|decisions/README\.md'
```

The diff should show only intentional differences (project-specific ADRs and
specs that this repo has accumulated, which the template does not ship).
