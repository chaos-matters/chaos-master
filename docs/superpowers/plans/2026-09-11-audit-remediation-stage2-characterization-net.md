# Stage 2: the retroactive characterization net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 0 safety net that the 2026-07 refactor strategy promised and never delivered, and use it to find regressions that already shipped.

**Architecture:** Tests only — no production code changes. Every test here must pass on **both** `v0.9.11` and current `main`. That bidirectional check is the whole point: an assertion that passes on the tag and fails on `main` has found a regression nobody noticed, and an assertion that fails on both was written wrong.

**Tech Stack:** vitest, valibot, TypeGPU.

**Spec:** [docs/agent/TESTING.md](../../agent/TESTING.md) §2, [docs/agent/REFACTOR-PLAN.md](../../agent/REFACTOR-PLAN.md) Stage 2.

**Do this before any further refactor phase.** Stage 1 fixes known defects; this is what stops the next refactor introducing unknown ones.

## Global Constraints

- **Never push to `upstream`.** **No Claude attribution.** **No emojis.**
- **Run `pnpm check`** from the repo root before declaring work finished.
- **Fixtures must never contain real personal data.** Generate them from the format, or hand-write obviously fake values. This applies to any flame metadata that could carry a name or an email.
- A test that was never seen red has not been written.

---

## The bidirectional check

Every task below ends with this. It is the technique that turns a test-writing chore into an audit.

```bash
# From a scratch worktree so the main one is untouched:
git worktree add ~/.cache/cm-phase0/v0911 v0.9.11
cd ~/.cache/cm-phase0/v0911 && pnpm install --frozen-lockfile
# Copy ONLY the new test file across, then:
pnpm --filter chaos-master exec vitest run <the test file>
```

Three outcomes, three different meanings:

| On `v0.9.11` | On `main` | Meaning                                                                                                                            |
| ------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| PASS         | PASS      | Behaviour preserved. The net is now in place.                                                                                      |
| PASS         | **FAIL**  | **A regression shipped in this range.** Stop, record it in `docs/agent/BUGS.md`, and fix the code — not the test.                  |
| FAIL         | PASS      | The test encodes post-refactor behaviour. Decide whether that change was intended; if it was, say so in the test's header comment. |
| FAIL         | FAIL      | The test is wrong. Fix the test.                                                                                                   |

If a module did not exist at `v0.9.11` (much of `packages/core`), test the pre-extraction location instead — `git show v0.9.11:packages/app/src/flame/...` will tell you where it lived.

---

## Task 1: `migrateFlameVariationTypes` — the highest-risk untested code in the repo

189 lines, zero tests, called from four sites in `flameSchema.ts` so it runs inside `validateFlame`, `validateFlame3D`, `tryValidateFlame` and `validateFlameWithErrors`. It mutates **in place** every flame that enters the app: autosave, share links, `.flame` imports, gallery rows, the worker's Discord payload validation. A wrong entry in its migration map does not throw — it silently renders the user's saved artwork as a different fractal.

**Files:**

- Test: `packages/core/src/schema/migrateFlameTypes.test.ts` (create)
- Modify: nothing, unless the tests find a defect.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { VARIATION_TYPE_MIGRATIONS, migrateFlameVariationTypes, } from './migrateFlameTypes'
import { validateFlame } from './flameSchema'

describe('VARIATION_TYPE_MIGRATIONS', () => {
  it('maps every legacy name onto a variation that actually exists', async () => {
    // A typo in a map value is invisible at runtime: the flame validates and
    // renders as something else. This is the assertion that catches it.
    const registry = await import('@/flame/variations')
    const known = new Set(
      Object.keys(registry.allVariations ?? registry.default ?? {}),
    )
    const missing = Object.entries(VARIATION_TYPE_MIGRATIONS)
      .filter(([, to]) => !known.has(to))
      .map(([from, to]) => `${from} -> ${to}`)
    expect(missing).toEqual([])
  })
})

describe('migrateFlameVariationTypes', () => {
  it('renames a legacy 2D variation and preserves its weight and params', () => {
    const flame = legacyFlameWith({
      type: 'horseshoe',
      weight: 0.75,
      params: { spread: 2 },
    })
    const out = validateFlame(flame)
    const v = firstVariationOf(out)
    expect(v.type).toBe('horseshoeVar')
    expect(v.weight).toBe(0.75)
    expect(v.params).toEqual({ spread: 2 })
  })

  it('is a fixed point: migrating an already-migrated flame changes nothing', () => {
    const once = validateFlame(legacyFlameWith({ type: 'horseshoe' }))
    const twice = validateFlame(structuredClone(once))
    expect(twice).toEqual(once)
  })

  it('passes an unknown variation type through untouched rather than dropping it', () => {
    const out = validateFlame(
      legacyFlameWith({ type: 'notAVariationAnyone HasHeardOf' }),
    )
    expect(firstVariationOf(out).type).toBe('notAVariationAnyone HasHeardOf')
  })

  it('widens a 6-key 2D affine to 3D with identity in g..l, not zeros', () => {
    const out = validateFlame(
      legacy3DFlameWithPreAffine({ a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }),
    )
    const pre = firstTransformOf(out).preAffine
    expect(pre.g).toBe(0)
    expect(pre.h).toBe(0)
    expect(pre.i).toBe(1)
    for (const k of ['g', 'h', 'i', 'j', 'k', 'l'])
      expect(pre[k]).toBeTypeOf('number')
  })
})
```

Write `legacyFlameWith`, `legacy3DFlameWithPreAffine`, `firstVariationOf` and `firstTransformOf` as small local helpers in the same file. Derive the identity expectation for `g..l` from `migrateAffine2Dto3D` itself, not from a guess — read it first.

- [ ] **Step 2: Run it; expect FAIL** — `pnpm --filter @chaos-master/core exec vitest run src/schema/migrateFlameTypes.test.ts`
- [ ] **Step 3: Make it pass.** If the registry assertion fails, you have found a real defect: record it in `docs/agent/BUGS.md` and fix the map. Otherwise the tests should pass as written; the value is the net, not a fix.
- [ ] **Step 4: Run the bidirectional check** against `v0.9.11`. At the tag this code lived at `packages/app/src/flame/schema/migrateFlameTypes.ts`; adjust the import.
- [ ] **Step 5: Commit** — `test(core): characterize the flame variation migration that rewrites every saved flame`.

---

## Task 2: Golden `.flame` XML round-trip corpus

The "flame serialization" half of Phase 0. `flameXml.test.ts` (637 lines, inherited) covers parsing; nothing pins that a real file survives a full round trip byte-for-byte.

**Files:**

- Create: `packages/app/src/flame/__fixtures__/*.flame` (5-8 files)
- Test: `packages/app/src/flame/flameXml.golden.test.ts` (create)

- [ ] **Step 1: Assemble the corpus.** Cover: a plain 2D flame, a 3D flame, one with a custom palette, one with a final transform, one with post-affine, one with a legacy variation name, and one with an xform count above 10. **Author these from the format, not from the user's own saved gallery** — a fixture taken from a real export carries whatever metadata was in it.
- [ ] **Step 2: Write the failing test** — for each fixture: `parse -> validateFlame -> serialize -> parse` and assert the second parse deep-equals the first. Assert on the parsed structure rather than the XML string, so insignificant attribute ordering does not cause false failures.
- [ ] **Step 3: Run it; expect at least one FAIL.** A corpus this size usually finds one lossy field on the first try. If everything passes immediately, add a fixture that exercises something rarer — motion blur settings, a symmetry group, a palette with fewer than 256 entries.
- [ ] **Step 4: Fix what it finds, or record it.** A lossy round trip is a real defect: it silently degrades saved artwork.
- [ ] **Step 5: Bidirectional check.**
- [ ] **Step 6: Commit** — `test(flame): golden .flame round-trip corpus`.

---

## Task 3: `validateFlame` boundary table

The "schema boundaries" half. `flameSchema.test.ts` has 5 `it`s for a 541-line schema.

**Files:**

- Test: `packages/core/src/schema/flameSchema.boundaries.test.ts` (create)

- [ ] **Step 1: Enumerate the limits.** `grep -n 'MAX_\|MIN_' packages/core/src/schema/flameSchema.ts`.
- [ ] **Step 2: Write a table-driven test** asserting each limit accepts its boundary value and rejects boundary+1, and that rejection produces a useful error rather than a silent clamp. Include the non-finite cases from Stage 1 Task 2 if that has landed.
- [ ] **Step 3: Run it; expect FAIL on at least one bound** — schemas of this size usually have one limit that clamps where it should reject, or is off by one.
- [ ] **Step 4: Record or fix.** **Do not loosen a bound to make a test pass** without saying why in the commit message.
- [ ] **Step 5: Bidirectional check. Step 6: Commit** — `test(core): boundary table for validateFlame`.

---

## Task 4: `packages/core/src/math` — 252 lines with no test in its own package

`affineTransform.ts` (35), `affineTransform3D.ts` (45), `affine3DView.ts` (94), `easing.ts` (78). The only surviving coverage reaches through a 5-line re-export shim from the app side, by coincidence rather than design.

**Files:**

- Test: `packages/core/src/math/affineTransform.test.ts`, `affineTransform3D.test.ts`, `affine3DView.test.ts`, `easing.test.ts` (all create)

- [ ] **Step 1: Write value-pinned tests, not bound checks.** For the 3D affines: identity, pure translate, 90-degree rotation about each axis, and one composed `pre * post`, each with exact expected output vectors. For `easing`: every curve returns exactly 0 at t=0 and exactly 1 at t=1, and is monotonic across 20 samples. `expect(x).toBeGreaterThan(0)` survives almost any mutation; `expect(x).toBe(0.42)` does not.
- [ ] **Step 2: Run; expect FAIL. Step 3: Implement nothing — these should pass. Step 4: Bidirectional check.**
- [ ] **Step 5: Prove the tests bite.** Apply one mutation by hand — swap two coefficients in `affineTransform3D` — and confirm a test goes red. Revert. If nothing goes red, the assertions are not specific enough; this is the whole lesson of the six surviving mutants.
- [ ] **Step 6: Commit** — `test(core): pin the affine and easing maths by value`.

---

## Task 5: Share-link codec round trip

`jsonQueryParam.test.ts` currently asserts a transform _count_ survives encoding. A count survives almost any corruption.

**Files:**

- Test: `packages/app/src/utils/jsonQueryParam.test.ts` (rewrite the round-trip case)

- [ ] **Step 1: Replace the count assertion with deep equality** over a full flame, plus one golden encoded string checked in, so a change to the encoding is visible as a diff rather than silently re-encoding.
- [ ] **Step 2: Run; expect the golden case to FAIL until you paste the real value in.** Generate it, read it, and only then check it in.
- [ ] **Step 3: Bidirectional check.** This one matters: a share link created before the refactor must still open. If the golden string from `v0.9.11` does not decode on `main`, **every share link ever posted is broken** and that is a release blocker.
- [ ] **Step 4: Commit** — `test(share): deep round-trip and a golden encoding for share links`.

---

## Task 6: Report what the net found

**Files:**

- Modify: `docs/agent/BUGS.md`, `docs/agent/TESTING.md`

- [ ] **Step 1: Record every PASS-on-tag / FAIL-on-main result** as a confirmed regression in `BUGS.md`, with the test that proves it.
- [ ] **Step 2: Update `TESTING.md` §2** to say the net now exists, with the real coverage numbers from `pnpm test:coverage`.
- [ ] **Step 3: Re-freeze the metrics baseline** — `pnpm metrics:update` — and say in the commit message that it moved because tests were added.
- [ ] **Step 4: Commit** — `docs(agent): record what the characterization net found`.

---

## Self-review notes

- **This plan deliberately contains no production fixes.** If a task finds a defect, record it and fix it in its own commit, so the net and the fix are separately reviewable.
- **The bidirectional check is the deliverable**, not the test count. A hundred tests that only ever ran against `main` would restate current behaviour without auditing it.
- **Cleanup:** remove the `~/.cache/cm-phase0` worktree when done (`git worktree remove`), and note that `/tmp` is tmpfs on this machine, so it is the wrong place for it.
