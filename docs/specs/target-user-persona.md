# Spec: Target-User Persona & Jobs-to-be-Done

Issue: #22 · Epic: product · Source: `.claude/prds/product.md`

Expands the PRD's user stories (US-1…US-4) into a working persona that anchors
design decisions in M2+.

## Primary persona — "Mia, the job-seeking junior dev"

| | |
|---|---|
| **Stage** | Early-career; bootcamp graduate or self-taught. 0–1 years professional experience. |
| **Situation** | Actively job-hunting for a junior / entry-level dev role. |
| **What she has** | One or two portfolio projects built with heavy AI assistance (Cursor, Claude, v0, Lovable, etc.) — they run and look impressive. |
| **What she lacks** | A real mental model of how those projects work or why they are built the way they are. |
| **Comfort zone** | Can prompt an AI tool, run `npm`/`pnpm`, push to GitHub. |
| **Edge of ability** | Cannot confidently explain, debug, or extend the code the AI produced. |

## Goals

- Pass technical interviews — especially "walk me through your project".
- Have a portfolio she can defend, not just display.
- Genuinely understand her own code so the job (once landed) is survivable.

## Frustrations — the two core pains

1. **"I can't explain my own project."** Asked how it works, she freezes. The
   project on her résumé becomes a trap, not an asset.
2. **"I don't understand the stack."** She can't say why it uses Next.js, what a
   config file does, why the folders are arranged that way, or what an
   alternative choice would change.

Underneath both: AI produced the *code*, never the *understanding* — and she has
never seen how software is actually built in a professional setting.

## Jobs-to-be-Done

- When **prepping for an interview**, I want to understand my project end to end,
  so I can answer "walk me through it" without freezing.
- When **asked about the stack**, I want to know what each tool does and why,
  so I can reason about it instead of guessing.
- When **building my portfolio**, I want a project I can fully defend, so it
  helps my job search instead of exposing me.
- When **learning how real teams work**, I want to see the professional dev
  workflow, so I sound like an engineer, not just an AI operator.

## What Mia can / cannot do today

| Can | Cannot |
|---|---|
| Generate a working app with AI | Explain how the app works |
| Run and deploy it | Debug it when it breaks |
| Name the framework | Justify the stack or structure |
| Describe what the app *does* | Describe how a change flows through it |

## How the product serves Mia

It ingests her existing repo and coaches her to genuine understanding —
explaining the stack in terms of *her* files, visualizing the professional
workflow, checking comprehension at every step, and producing job-market
artifacts (interview Q&A, résumé bullets). Success = she ships a portfolio
project she fully understands and can defend.

## Anti-persona (not the M1 target user)

- Experienced engineers who already understand their stack.
- Users who want the tool to *generate* a project for them.
- Teams looking for project-management tooling (that is CCPM's job).
