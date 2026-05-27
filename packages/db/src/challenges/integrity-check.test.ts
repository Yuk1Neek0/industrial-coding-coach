// Tests for the M9 file-reference integrity check (Issue #141).
//
// Pure tests — no DB, no SDK, no network. The validator only reads
// `projectMap.keyFileMap[].path`, so the fixtures are tiny synthetic maps
// and candidates. Mirrors the test posture of the M6 integrity check
// (`../mapper/project-maps.test.ts`).
//
// The five PRD-mandated cases (141.md acceptance criteria):
//   1. a valid challenge with every reference in the M6 map passes.
//   2. a challenge with one out-of-scope reference outside the map is rejected.
//   3. a challenge that names an adjacent-but-unmapped file is rejected (R8 —
//      no adjacent-file inference, even when the file exists in the snapshot).
//   4. a grading output with a fabricated file reference (per-criterion or
//      feedback prose) is rejected.
//   5. an empty / minimal project map is handled gracefully (no crash, no
//      false pass).
//
// Plus shape-correctness tests for prose-path extraction so the regex stays
// honest as the module is reused by #142 and #143.

import { describe, expect, it } from "vitest"

import type { ProjectMapFile } from "../schema"
import {
  type CandidateChallenge,
  type CandidateGrading,
  type ProjectMapView,
  verifyChallengeIntegrity,
} from "./integrity-check"

/** A small synthetic M6 project map naming three files. */
const keyFileMap: ProjectMapFile[] = [
  { path: "apps/web/app/page.tsx", role: "Home page." },
  { path: "apps/web/app/actions.ts", role: "Server actions for the page." },
  { path: "packages/db/src/schema.ts", role: "Database schema." },
]

const projectMap: ProjectMapView = { keyFileMap }

/** A valid challenge whose references are all in the M6 map. */
const validChallenge: CandidateChallenge = {
  kind: "challenge",
  inScope: ["apps/web/app/page.tsx"],
  outOfScope: ["packages/db/src/schema.ts"],
  acceptanceCriteria: [
    {
      id: "describes-render-path",
      description:
        "The user explains that rendering happens in the home page component.",
      paths: ["apps/web/app/page.tsx"],
    },
    {
      id: "no-server-action-changes",
      description: "The user leaves server actions alone.",
      paths: ["apps/web/app/actions.ts"],
    },
  ],
}

describe("verifyChallengeIntegrity — valid challenge", () => {
  it("passes a challenge whose every reference is in the M6 map", () => {
    const result = verifyChallengeIntegrity(validChallenge, projectMap)
    expect(result.ok).toBe(true)
    expect(result.unresolved).toEqual([])
  })

  it("passes a minimal challenge with empty sets and no criteria", () => {
    const result = verifyChallengeIntegrity(
      { kind: "challenge", inScope: [], outOfScope: [] },
      projectMap,
    )
    expect(result.ok).toBe(true)
    expect(result.unresolved).toEqual([])
  })

  it("passes a criterion with no `paths` field", () => {
    const result = verifyChallengeIntegrity(
      {
        kind: "challenge",
        inScope: [],
        outOfScope: [],
        acceptanceCriteria: [
          { id: "conceptual", description: "The user explains the layer." },
        ],
      },
      projectMap,
    )
    expect(result.ok).toBe(true)
  })
})

describe("verifyChallengeIntegrity — challenge rejections", () => {
  it("rejects an in-scope reference not named by the M6 map", () => {
    const result = verifyChallengeIntegrity(
      {
        ...validChallenge,
        inScope: ["apps/web/app/page.tsx", "apps/web/app/ghost.tsx"],
      },
      projectMap,
    )
    expect(result.ok).toBe(false)
    expect(result.unresolved).toEqual([
      { origin: "inScope", path: "apps/web/app/ghost.tsx" },
    ])
  })

  it("rejects an out-of-scope reference not named by the M6 map", () => {
    const result = verifyChallengeIntegrity(
      {
        ...validChallenge,
        outOfScope: ["apps/web/app/fictional-config.ts"],
      },
      projectMap,
    )
    expect(result.ok).toBe(false)
    expect(result.unresolved).toEqual([
      { origin: "outOfScope", path: "apps/web/app/fictional-config.ts" },
    ])
  })

  it(
    "rejects an adjacent-but-unmapped file (R8: no adjacent-file inference, " +
      "even though `page.test.tsx` likely exists next to `page.tsx`)",
    () => {
      const result = verifyChallengeIntegrity(
        {
          ...validChallenge,
          inScope: [
            "apps/web/app/page.tsx",
            // The "test file next to the mapped file" inference is exactly
            // what R8 / FR-3 forbids — even if this file exists in the
            // snapshot, the M6 project map did not name it.
            "apps/web/app/page.test.tsx",
          ],
        },
        projectMap,
      )
      expect(result.ok).toBe(false)
      expect(result.unresolved).toEqual([
        { origin: "inScope", path: "apps/web/app/page.test.tsx" },
      ])
    },
  )

  it("rejects an adjacent index-barrel inference", () => {
    const result = verifyChallengeIntegrity(
      {
        ...validChallenge,
        inScope: ["apps/web/app/page.tsx", "apps/web/app/index.ts"],
      },
      projectMap,
    )
    expect(result.ok).toBe(false)
    expect(result.unresolved).toEqual([
      { origin: "inScope", path: "apps/web/app/index.ts" },
    ])
  })

  it("rejects an adjacent type-file inference", () => {
    const result = verifyChallengeIntegrity(
      {
        ...validChallenge,
        inScope: ["packages/db/src/schema.ts", "packages/db/src/schema.d.ts"],
      },
      projectMap,
    )
    expect(result.ok).toBe(false)
    expect(result.unresolved).toEqual([
      { origin: "inScope", path: "packages/db/src/schema.d.ts" },
    ])
  })

  it("rejects an unmapped path in an acceptance criterion and names the criterion", () => {
    const result = verifyChallengeIntegrity(
      {
        ...validChallenge,
        acceptanceCriteria: [
          {
            id: "wrong-path",
            description: "Cites a file the map did not name.",
            paths: ["apps/web/app/missing.ts"],
          },
        ],
      },
      projectMap,
    )
    expect(result.ok).toBe(false)
    expect(result.unresolved).toEqual([
      {
        origin: "acceptanceCriterion",
        path: "apps/web/app/missing.ts",
        criterionId: "wrong-path",
      },
    ])
  })

  it("reports every unresolved reference, not just the first", () => {
    const result = verifyChallengeIntegrity(
      {
        kind: "challenge",
        inScope: ["nope/a.ts", "nope/b.ts"],
        outOfScope: ["nope/c.ts"],
      },
      projectMap,
    )
    expect(result.ok).toBe(false)
    expect(result.unresolved).toHaveLength(3)
    expect(result.unresolved.map((u) => u.path)).toEqual([
      "nope/a.ts",
      "nope/b.ts",
      "nope/c.ts",
    ])
  })
})

describe("verifyChallengeIntegrity — grading rejections (FR-6)", () => {
  it("passes a grading output whose every reference is in the M6 map", () => {
    const grading: CandidateGrading = {
      kind: "grading",
      perCriterion: [
        {
          criterionId: "describes-render-path",
          verdict: "passed",
          paths: ["apps/web/app/page.tsx"],
        },
      ],
      feedback:
        "Good — the user correctly identifies apps/web/app/page.tsx as the " +
        "render entry point and leaves apps/web/app/actions.ts alone.",
    }
    const result = verifyChallengeIntegrity(grading, projectMap)
    expect(result.ok).toBe(true)
    expect(result.unresolved).toEqual([])
  })

  it("rejects a per-criterion result that names a fabricated file", () => {
    const grading: CandidateGrading = {
      kind: "grading",
      perCriterion: [
        {
          criterionId: "describes-render-path",
          verdict: "partial",
          // The grader claimed the user cited a path that the M6 map does
          // not name — this is the FR-6 "fabricated file reference" failure
          // mode and the candidate must be rejected.
          paths: ["apps/web/app/imaginary.tsx"],
        },
      ],
    }
    const result = verifyChallengeIntegrity(grading, projectMap)
    expect(result.ok).toBe(false)
    expect(result.unresolved).toEqual([
      {
        origin: "perCriterion",
        path: "apps/web/app/imaginary.tsx",
        criterionId: "describes-render-path",
      },
    ])
  })

  it("rejects a fabricated file mentioned in feedback prose", () => {
    const grading: CandidateGrading = {
      kind: "grading",
      perCriterion: [],
      feedback:
        "The user pointed to apps/web/app/page.tsx, but missed " +
        "apps/web/app/loader.ts — that's where the data is fetched.",
    }
    const result = verifyChallengeIntegrity(grading, projectMap)
    expect(result.ok).toBe(false)
    expect(result.unresolved).toEqual([
      { origin: "feedback", path: "apps/web/app/loader.ts" },
    ])
  })

  it("strips backticks and trailing punctuation when extracting prose paths", () => {
    const grading: CandidateGrading = {
      kind: "grading",
      perCriterion: [],
      // The path in backticks is mapped; the comma-trailing one is not.
      feedback:
        "The user touched `apps/web/app/page.tsx`, which is right, but also " +
        "called out apps/web/app/imagined.tsx, which the map does not list.",
    }
    const result = verifyChallengeIntegrity(grading, projectMap)
    expect(result.ok).toBe(false)
    expect(result.unresolved).toEqual([
      { origin: "feedback", path: "apps/web/app/imagined.tsx" },
    ])
  })

  it("ignores URL-shaped tokens in feedback prose", () => {
    const grading: CandidateGrading = {
      kind: "grading",
      perCriterion: [],
      // A URL has `://` and is not a file reference — must not trip the check.
      feedback:
        "See https://nextjs.org/docs for the routing model. The user " +
        "correctly cited apps/web/app/page.tsx.",
    }
    const result = verifyChallengeIntegrity(grading, projectMap)
    expect(result.ok).toBe(true)
  })

  it("ignores plain prose with no path-shaped tokens", () => {
    const grading: CandidateGrading = {
      kind: "grading",
      perCriterion: [],
      feedback:
        "The user demonstrates a solid understanding of the rendering layer.",
    }
    const result = verifyChallengeIntegrity(grading, projectMap)
    expect(result.ok).toBe(true)
  })

  it("does not flag a prose path that the M6 map *does* name", () => {
    const grading: CandidateGrading = {
      kind: "grading",
      perCriterion: [],
      feedback:
        "The user correctly identifies packages/db/src/schema.ts as the " +
        "schema source.",
    }
    const result = verifyChallengeIntegrity(grading, projectMap)
    expect(result.ok).toBe(true)
  })

  it("reports every unresolved reference across per-criterion and feedback", () => {
    const grading: CandidateGrading = {
      kind: "grading",
      perCriterion: [
        {
          criterionId: "c1",
          verdict: "missed",
          paths: ["nope/a.ts", "nope/b.ts"],
        },
      ],
      feedback: "Also see nope/c.ts for the bug.",
    }
    const result = verifyChallengeIntegrity(grading, projectMap)
    expect(result.ok).toBe(false)
    expect(result.unresolved).toHaveLength(3)
    expect(result.unresolved.map((u) => u.path).sort()).toEqual([
      "nope/a.ts",
      "nope/b.ts",
      "nope/c.ts",
    ])
  })
})

describe("verifyChallengeIntegrity — empty / minimal map", () => {
  it("handles an empty M6 project map without crashing", () => {
    const emptyMap: ProjectMapView = { keyFileMap: [] }
    // A challenge with no references is trivially valid even against an
    // empty map — there is nothing to validate.
    expect(
      verifyChallengeIntegrity(
        { kind: "challenge", inScope: [], outOfScope: [] },
        emptyMap,
      ),
    ).toEqual({ ok: true, unresolved: [] })
    // A challenge that names anything against an empty map fails — there is
    // no M6-named file for the reference to resolve to.
    const failing = verifyChallengeIntegrity(
      { kind: "challenge", inScope: ["apps/web/app/page.tsx"], outOfScope: [] },
      emptyMap,
    )
    expect(failing.ok).toBe(false)
    expect(failing.unresolved).toEqual([
      { origin: "inScope", path: "apps/web/app/page.tsx" },
    ])
  })

  it("handles a minimal one-file map", () => {
    const minimalMap: ProjectMapView = {
      keyFileMap: [{ path: "apps/web/app/page.tsx", role: "Only file." }],
    }
    const result = verifyChallengeIntegrity(
      {
        kind: "challenge",
        inScope: ["apps/web/app/page.tsx"],
        outOfScope: [],
      },
      minimalMap,
    )
    expect(result.ok).toBe(true)
  })

  it("handles an empty-feedback grading output", () => {
    const result = verifyChallengeIntegrity(
      { kind: "grading", perCriterion: [], feedback: "" },
      projectMap,
    )
    expect(result.ok).toBe(true)
  })
})
