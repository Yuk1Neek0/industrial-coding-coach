# Industrial Coding Coach

A learning coach for AI-assisted code.

Industrial Coding Coach takes a project you built with heavy AI assistance — a
"vibe-coded" repo — and coaches you to genuinely **understand** it: the stack,
the architecture, and how it maps onto a real professional development workflow.
So you can explain and defend it in an interview, and ship it as a portfolio
project you truly own.

It **coaches existing repos** — it does not generate projects.

## Who it's for

Job-seeking junior developers (bootcamp grads and self-taught devs) who built
AI-assisted projects and can't yet explain them.

## What makes it different

- **Coaches your repo**, not a generic example.
- **Teaches understanding**, not code generation.
- Produces **job-market artifacts** — interview Q&A, résumé bullets, architecture
  explanations.
- **Comprehension-checked** — every step has an understanding check.
- **Visualizes the professional dev workflow in real time** — see how real
  software is built, not just how to prompt an AI.

## How it runs

Open-source (MIT), **local-first**, and fully **web-based**: you run it on your
own machine and work entirely in the browser — no external IDE or extension, and
your code is analyzed locally. A GitHub account can optionally be connected
(read-only) to import a repo.

## Status

Early development. **Milestone 0** (AI-native foundation) is complete and
**Milestone 1** (product definition) is in progress — no product features yet.
The roadmap runs M2–M15 (Golden Path Catalog → recommendation engine → project
mapper → diff review → portfolio export → integrations).

## Tech stack

shadcn/ui Next.js monorepo (pnpm workspaces + Turborepo). See `CLAUDE.md` for
repository layout and the development workflow.

```bash
pnpm install     # install workspace dependencies
pnpm dev         # run the web app
pnpm lint        # lint
pnpm build       # build
```

## Documentation

- Product definition — [`.claude/prds/product.md`](.claude/prds/product.md)
- Product overview — [`docs/current/product-overview.md`](docs/current/product-overview.md)
- Milestones — [`docs/milestones/`](docs/milestones/)
- Decisions (ADRs) — [`docs/decisions/`](docs/decisions/)
- Contributing — [`CONTRIBUTING.md`](CONTRIBUTING.md)

## License

[MIT](LICENSE)
