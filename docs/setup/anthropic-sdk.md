# Setup Note — Anthropic SDK

Records the official source and installed version of the Anthropic SDK, the
product's LLM client library. The decision to adopt it is **ADR 0005**; this
note records the install facts (per the CLAUDE.md rule: tool installs follow
official docs and the source is recorded).

## Tool

- **Package:** `@anthropic-ai/sdk` (official Anthropic TypeScript/JavaScript SDK)
- **Official docs:** https://platform.claude.com/docs/en/api/sdks/typescript
- **Repository:** https://github.com/anthropics/anthropic-sdk-typescript
- **License:** MIT
- **Installed in:** `packages/ai` (the shared LLM foundation — see ADR 0005)

## Install method (official)

Per the official docs, the SDK is installed with:

```bash
npm install @anthropic-ai/sdk
```

In this pnpm workspace it was installed into the `@workspace/ai` package:

```bash
pnpm --filter @workspace/ai add @anthropic-ai/sdk
```

The exact installed version is pinned in `packages/ai/package.json`
(`dependencies."@anthropic-ai/sdk"`); pnpm records the resolved version in the
workspace lockfile.

## Requirements

- Node.js 20 LTS or later (the monorepo already requires `node >= 20`).
- TypeScript >= 4.9 (the monorepo uses 5.9.x).

## Usage in this project

- The SDK is used **server-side only** — never bundled into client code.
- The API key is read from `ANTHROPIC_API_KEY` via `packages/ai`'s config
  accessor (`getAnthropicApiKey`), not by passing it to the SDK from scattered
  call sites.
- The client wrapper, prompt caching, tool use, structured outputs, and the
  CI-safe mock harness are delivered by the later `llm-foundation` tasks.

## References

- ADR 0005 — LLM Integration Architecture & LangChain Scope
- `docs/tool-radar.md` — Anthropic SDK is in the Adopt ring
