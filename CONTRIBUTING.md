# Contributing to Industrial Coding Coach

Thanks for your interest. This project is open-source (MIT) and is itself a
reference example of the development workflow it teaches — so contributions
follow that workflow.

## Local setup

Requirements: Node.js ≥ 20 and pnpm.

```bash
pnpm install     # install workspace dependencies
pnpm dev         # run the web app
pnpm lint        # lint all packages
pnpm typecheck   # type-check
pnpm build       # production build
```

Repository layout and conventions are documented in [`CLAUDE.md`](CLAUDE.md).

## How work is organized

Delivery follows **CCPM** (see [`docs/decisions/0001-development-workflow.md`](docs/decisions/0001-development-workflow.md)):

```
Milestone → PRD → Epic → Tasks → GitHub Issues → one issue at a time → PR → CI → review
```

- Product definition lives in `.claude/prds/`; epics and tasks in
  `.claude/epics/`. GitHub Issues are the execution source of truth.
- Decisions that affect architecture, tooling, or workflow get an ADR in
  `docs/decisions/`.

## Making a change

1. **Pick or open an issue.** Every change maps to a GitHub Issue with
   acceptance criteria. Use the issue templates in `.github/ISSUE_TEMPLATE/`.
2. **Work one bounded issue at a time.** Branch from `main`
   (`git switch -c <type>/<short-name>`).
3. **Keep it scoped.** State the files you expect to touch and the verification
   steps; don't widen scope mid-change.
4. **Verify locally** — `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass
   (document any failure).
5. **Open a PR** using `PULL_REQUEST_TEMPLATE.md`; link the issue.
6. **CI must pass** — the CI and Gitleaks secret-scan workflows run on every PR.
7. **Review** — a human reviewer approves before merge.

## Reporting bugs

Open an issue with the **Bug report** template. Include steps to reproduce, the
branch/commit, and your environment.

## Code style

Match the surrounding code. Lint and Prettier configs are in
`packages/eslint-config` and the repo root; CI enforces them.

## Security

Never commit secrets. `.env` is git-ignored; `.env.example` is the committed
template. Gitleaks scans every PR.

## License

By contributing, you agree your contributions are licensed under the
project's [MIT License](LICENSE).
