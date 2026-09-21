# Test strategy — Lumen Apeiron (Chaos Master)

Audience: contributors and agents. Scope: the whole test estate — 232 vitest
files / 2,529 tests, 13 Playwright specs, one Cloudflare Worker.

Derived from a file-by-file audit of the `v0.9.11..main` range (2026-09-10),
**including six deliberate mutations of production code** — the only honest way
to answer "would this test go red if the feature broke". Where this document
states a number, `pnpm metrics` re-derives it.

---

## 1. The headline number

**Six mutation probes were run. Six survived. Zero were caught.**

| Mutation                                                                                           | Suite that should have caught it                  | Result    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------- |
| `timeline.ts` — flip which keyframe owns a segment's interpolation mode                            | `utils/timeline.test.ts`                          | 86 passed |
| `scoreClashRound.ts` — invert the tie deadband so every draw resolves to A                         | `webmcp/tools/flameToolsModular.test.ts`          | 12 passed |
| `audioAnalysis.ts` — drop the `sensitivity` factor from `mappingToVal`                             | `utils/audioAnalysisMappings.test.ts`             | 9 passed  |
| `recorder/schema.ts` — **delete** the monotonic-timestamp guard                                    | `recorder/recorder.test.ts`                       | 75 passed |
| `useWorkspaceTimelineBinding.ts` — change the `camera3D.phi` fallback from the equator to the pole | `hooks/useWorkspaceTimelineBinding.test.ts`       | 5 passed  |
| `benchmarkResultBuilder.ts` — weaken the lit-pixel guard by one                                    | `pages/Benchmarks/benchmarkResultBuilder.test.ts` | 15 passed |

Line coverage is 46.4%. On the paths this range refactored, that number is
close to decorative: the lines execute, and nothing asserts on what they
produce. Treat "it's covered" as an unproven claim in this repo until someone
has mutated the function and watched the test go red.

Reproduce with the probe list in `docs/agent/REFACTOR-PLAN.md`. The method is
cheap: change one line on purpose, run the one test file, revert.

## 2. Phase 0 was never built

`docs/REFACTOR_AND_IMPROVEMENT_STRATEGY.md` opens with a Phase 0 that promised
characterization tests over "schema boundaries, flame serialization, affine
math" **before** any refactoring.

Not one of the 27 test files added in this range predates the code it covers.
The first commit of the range (`5d35f893`) cut `MainWorkspace.tsx` by 3,654
lines and added zero test files. `flameSchema.test.ts` and `fdiff.test.ts`
arrived in `5747de32` — the same commit that moved the schema into
`packages/core`.

The refactor was carried by tests it **inherited**: `worker/index.test.ts`
(1,024 lines), `recorder.test.ts` (2,019), `utils/timeline.test.ts` (1,088),
`flame/flameXml.test.ts` (637). That is why the worker route split and the
`builtins/flame` decomposition are the safest parts of the range, and why risk
is concentrated exactly where no inherited test existed.

**72% of the added non-test source — 11,395 of 15,812 lines — has no sibling
test file.**

The remedy is a retroactive Phase 0: a commit that adds only tests, which is
then verified to pass on **both** `v0.9.11` and `HEAD`. Any assertion that
passes on the tag and fails on `HEAD` is a regression that already shipped.

**Status (2026-09-11): built, in #92.** 101 tests over variation-type
migration, core affine and easing maths, share links (including a link captured
from `v0.9.11`), the `validateFlame` boundary table and a golden `.flame` round
trip, each run on both the tag and `HEAD`. **No regression from the refactor
turned up in those areas.** The golden round trip failed on _both_, which made
its findings pre-existing rather than regressions: `skipIters` did not survive
an export (fixed in #92), and palette chroma, dark background channels and
exposure are still lost on export (pinned as `it.fails`; see
[BUGS.md](BUGS.md)).

## 3. Where the untested risk actually is

Ranked by what breaks silently, not by line count.

1. **`packages/core/src/schema/migrateFlameTypes.ts`** — 189 lines, zero tests,
   called from four sites inside `flameSchema.ts`, so it runs inside
   `validateFlame`, `validateFlame3D`, `tryValidateFlame` and
   `validateFlameWithErrors`. It mutates in place every flame that enters the
   app: autosave, share links, `.flame` imports, gallery rows. A wrong entry in
   its migration map does not throw — it silently renders the user's saved
   artwork as a different fractal.
2. **`packages/core/src/math/`** — 252 lines of affine and easing maths with no
   test in the package that owns it. The app-side survivor
   (`flame/affine3DView.test.ts`) reaches through a 5-line re-export shim by
   coincidence, not by design.
3. **`hooks/useWorkspaceReplay.ts`** — 608 lines of replay, audio restore and
   video export, guarded only by `recorder/uiCoverageRatchet.test.ts`, which
   imports it as `?raw` and walks the AST. It never executes a line, so it
   cannot catch a reordered restore or a wrong `deepClone` boundary.
4. **The other nine hooks extracted from `MainWorkspace`** —
   `useWorkspaceTimelineBinding` is the only one with an executing test, and
   that test does not cover the keyframe-override branch that is the hook's
   entire purpose.

## 4. What runs, and where

```bash
pnpm test            # core + app vitest + script tests
pnpm test:coverage   # app vitest with v8 coverage -> coverage-audit/
pnpm test:e2e        # the full Playwright suite (local only)
pnpm test:e2e:ci     # the CI-stable smoke subset
pnpm verify:webgpu   # standalone headed Chrome against a running dev server
```

CI runs lint, typecheck, tests, build, and **only `tests/smoke.spec.ts`** for
e2e.

> **Update, 2026-09-21.** Two corrections. The generated-index check and the
> metrics ratchet were never in CI when this was written; they are now, in a
> `health` job that runs on main and on a manual dispatch only. Coverage is
> still not in CI at all. And "tests" now means different things in the two
> places: a pull request runs core and mobile-runtime in full plus the app
> suite scoped to what it touched, while main runs everything. The full split,
> and the trade-off it accepts, is in
> [packages/app/TESTING.md](../../packages/app/TESTING.md).

**A Playwright spec outside the smoke subset is effectively unenforced.** Three
of the current specs are actively misleading:

- `tests/documentation.spec.ts:20` calls `test.skip(!docsVisible, ...)` gated on
  a `Docs` button. That button existed at `v0.9.11` and the selector no longer
  matches, so the spec **skips green** — it reports success while testing
  nothing. A green skip is worse than no spec.
- One spec fails and nothing watches it.
- One asserts a deep link that no longer resolves.

Fix those before adding new ones.

> **Update, 2026-09-11 (#93).** CI now runs a `chromium-ci` Playwright
> project: every `*.ci.spec.ts`, 27 tests instead of 8, and a skip there fails
> the run unless annotated `intentional-skip`. The three misleading specs turned
> out to be `documentation` (the green skip above), `console-panel` (the version
> pill it clicked now opens a menu, so its dialog never appeared) and `webmcp`
> (a reworded tool message, star ratings that became Like/Dislike, and a close
> button that was already gone). All three are fixed and in the CI project. 20
> tests in six specs still fail under swiftshader; they stay in the local
> `chromium` project and remain unenforced.

## 5. Rules for writing a test here

1. **Never assert against a mock you control.** `expect(vi.fn()).toBeDefined()`
   and comparing a constant to itself both pass forever. 117 of the 735
   assertions added in this range (16%) are non-discriminating.
2. **Pin values, not bounds.** `expect(score).toBeGreaterThan(0)` survives
   almost any mutation. `expect(score).toBe(0.42)` does not.
3. **Colocate unit tests** as `*.test.ts(x)` next to the code. `tests/` is for
   Playwright only.
4. **Put pure logic in `packages/core` and test it there.** It is the only part
   of the tree that needs no DOM, no WebGPU and no Solid to run. It currently
   holds 2 test files against the app's 226 — that ratio is backwards.
5. **A new `it()` in an existing file is not coverage of a new module.** If you
   extracted a function, the test goes red when the extraction is wrong, or the
   extraction is unverified.
6. **Never verify WebGPU with `playwright test`.** The config forces
   swiftshader, which fakes device-loss crashes. Use `pnpm verify:webgpu`.

## 6. Known-good verification, done by hand

Recorded so it is at least repeatable. On 2026-09-10, against a real AMD RDNA-4
adapter (not swiftshader), via `pnpm verify:webgpu`:

- Routes `/`, `/arcade`, `/benchmarks`: **zero console errors**.
- Viewports 1920x1080, 1024x768, 768x1024, 390x844: zero console errors;
  canvas counts 3 / 1 / 1 / 1, so the touch layouts are not double-mounting
  the preview canvases.
- **Three `computations created outside a 'createRoot' or 'render' will never
be disposed` warnings on every route and every viewport**, all three from
  `stores/workspaceLayoutStore.ts` lines 114, 120 and 126. See
  [BUGS.md](BUGS.md).
