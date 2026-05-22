# @workspace/ai

The shared LLM foundation for Industrial Coding Coach. It wraps the official
**Anthropic SDK** in a thin, reviewable, server-side client that M4
(Recommendation Engine), M5 (Stack Explainer), and M8 (Diff Review) build their
bounded LLM calls on.

This package **operationalizes [ADR 0005](../../docs/decisions/0005-llm-integration-and-langchain-scope.md)**
— core LLM features call the Anthropic SDK directly as bounded
prompt → structured-output calls. It is not an agent framework and not
LangChain (those are scoped to M6). It records no architecture decision of its
own.

## Setup

The client reads one environment variable, **server-side only**:

```bash
# .env  (git-ignored — see .env.example)
ANTHROPIC_API_KEY=sk-ant-...
```

- **Server-side only.** Never import this package into a client component. The
  API key and the Anthropic SDK must never reach the browser.
- **No key?** The app still runs and CI still passes — LLM-backed features
  surface a typed `missing_api_key` failure instead of crashing.

The Anthropic SDK install is recorded in
[`docs/setup/anthropic-sdk.md`](../../docs/setup/anthropic-sdk.md).

## Usage

```ts
import { createLlmClient } from "@workspace/ai/client"

const client = createLlmClient()

const result = await client.complete({
  system: "You are a coding coach. Be concise.",
  cacheSystem: true, // prompt-cache the system prompt across calls
  messages: [{ role: "user", content: "Explain why this repo uses Drizzle." }],
})

if (result.ok) {
  console.log(result.data.content) // Anthropic content blocks
  console.log(result.data.usage) // token usage
} else {
  // Typed, never thrown for an expected boundary failure.
  console.error(result.error.kind, result.error.message)
}
```

`complete()` returns a discriminated `LlmResult<LlmResponse>` — callers narrow
on `result.ok`; expected boundary failures are returned, not thrown.

### Request options (`LlmRequest`)

| Field | Purpose |
|---|---|
| `messages` | Conversation messages (required) |
| `system` | System prompt |
| `cacheSystem` | Prompt-cache the system prompt (ephemeral breakpoint) |
| `model` | Override the model (default: `claude-sonnet-4-6`) |
| `maxTokens` | Override the output cap (default: `2048`) |
| `tools` / `toolChoice` | Tool use — also how structured output is elicited |

### Typed errors

`LlmError` carries a `kind` discriminator: `missing_api_key`, `auth_failed`,
`rate_limited`, `timeout`, `api_error`, `network_error`. SDK errors are mapped
by `mapAnthropicError`. This mirrors the `packages/db/src/github` error model.

## Testing LLM-backed code (CI-safe)

Never call the live API in tests. Inject a mock transport from
`@workspace/ai/testing` — the client wrapper takes a transport so the SDK can be
swapped out:

```ts
import { createLlmClient } from "@workspace/ai/client"
import { createMockTransport } from "@workspace/ai/testing"

const client = createLlmClient(
  createMockTransport({ replies: [{ text: "a coached explanation" }] }),
)

const result = await client.complete({
  messages: [{ role: "user", content: "hi" }],
})
// result.ok === true — no API key, no network call.
```

- `createMockTransport({ replies })` — scripted replies, consumed in order; the
  last repeats. `{ throws }` — reject every call, to exercise error mapping.
- `transport.calls` — every `createMessage` param, for assertions.
- `mockMessage()` — build an Anthropic `Message` from shorthand.

The whole suite runs with **no `ANTHROPIC_API_KEY`** and makes **zero live
calls** — that is the CI contract.

## Module map

| Module | Export path | Contents |
|---|---|---|
| `client.ts` | `@workspace/ai/client` | `createLlmClient`, `LlmRequest`, `LlmResponse` |
| `config.ts` | `@workspace/ai/config` | `getAnthropicApiKey`, `hasAnthropicApiKey` |
| `errors.ts` | `@workspace/ai/errors` | `LlmError`, `LlmResult`, `mapAnthropicError` |
| `testing.ts` | `@workspace/ai/testing` | `createMockTransport`, `mockMessage` |
| `transport.ts`, `model.ts` | `@workspace/ai` | `LlmTransport`, `DEFAULT_MODEL` |

## References

- [ADR 0005 — LLM Integration Architecture & LangChain Scope](../../docs/decisions/0005-llm-integration-and-langchain-scope.md)
- [Setup note — Anthropic SDK](../../docs/setup/anthropic-sdk.md)
- [Official Anthropic TypeScript SDK docs](https://platform.claude.com/docs/en/api/sdks/typescript)
