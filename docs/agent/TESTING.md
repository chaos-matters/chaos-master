# Test strategy — Lumen Apeiron (Chaos Master)

Audience: contributors and agents. Scope: the whole test estate — at
`9fc08078` (2026-09-23), 353 vitest files with 4,029 passing tests (`pnpm test`),
21 Playwright specs of which 11 run in CI, and one Cloudflare Worker. At the
first audit (`a5c2f26f`, 2026-09-10) it was 232 files, 2,529 tests and 13
specs.

Derived from a file-by-file audit of the `v0.9.11..a5c2f26f` range
(2026-09-10), **including six deliberate mutations of production code** — the
only honest way to answer "would this test go red if the feature broke". Where
this document states a number, it names the command or the PR behind it.

---

## 1. The headline number

**In the first audit, six mutation probes were run. Six survived. Zero were
caught.** #93 added a test for each, and on 2026-09-23 every probe was applied
again at `9fc08078`: **all six are caught now.**

| Mutation                                                                                           | Suite that should have caught it                  | `a5c2f26f` | `9fc08078`     |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------- | -------------- |
| `timeline.ts` — flip which keyframe owns a segment's interpolation mode                            | `utils/timeline.test.ts`                          | 86 passed  | 1 of 93 failed |
| `scoreClashRound.ts` — invert the tie deadband so every draw resolves to A                         | `webmcp/tools/flameToolsModular.test.ts`          | 12 passed  | 1 of 13 failed |
| `audioAnalysis.ts` — drop the `sensitivity` factor from `mappingToVal`                             | `utils/audioAnalysisMappings.test.ts`             | 9 passed   | 1 of 10 failed |
| `recorder/schema.ts` — **delete** the monotonic-timestamp guard                                    | `recorder/recorder.test.ts`                       | 75 passed  | 1 of 91 failed |
| `useWorkspaceTimelineBinding.ts` — change the `camera3D.phi` fallback from the equator to the pole | `hooks/useWorkspaceTimelineBinding.test.ts`       | 5 passed   | 1 of 16 failed |
| `benchmarkResultBuilder.ts` — weaken the lit-pixel guard by one                                    | `pages/Benchmarks/benchmarkResultBuilder.test.ts` | 15 passed  | 1 of 16 failed |

Line coverage was 46.4% then and is 53.22% now (`pnpm test:coverage`). On the
paths the first range refactored, that number was close to decorative: the
lines executed, and nothing asserted on what they produced. Treat "it's
covered" as an unproven claim in this repo until someone has mutated the
function and watched the test go red.

Reproduce with the table: each row names the one-line edit and the one test
file. The method is cheap: change the line on purpose, run that file, revert.

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
exposure are still lost on export. Those four are pinned as plain tests of
today's wrong value, so a fix turns its test red (`05e51be8`; see
[BUGS.md](BUGS.md)).

## 3. Where the untested risk actually is

The first audit's ranking, by what breaks silently rather than by line count,
and where each item stands at `9fc08078`:

1. **`packages/core/src/schema/migrateFlameTypes.ts`** — runs inside
   `validateFlame`, `validateFlame3D`, `tryValidateFlame` and
   `validateFlameWithErrors`, and mutates in place every flame that enters the
   app: autosave, share links, `.flame` imports, gallery rows. A wrong entry in
   its migration map does not throw — it silently renders the user's saved
   artwork as a different fractal. Zero tests then; **characterized in #92**
   (`migrateFlameTypes.test.ts`).
2. **`packages/core/src/math/`** — affine and easing maths with no test in the
   package that owns it. **Pinned by value in #92**: `affineTransform.test.ts`,
   `affineTransform3D.test.ts`, `affine3DView.test.ts` and `easing.test.ts` now
   live in core.
3. **`hooks/useWorkspaceReplay.ts`** — replay, audio restore and video export
   (608 lines then, 643 now), guarded only by
   `recorder/uiCoverageRatchet.test.ts`, which walks its AST without executing
   a line. **Partly addressed**: `useWorkspaceReplay.exportStep.test.ts` (#110)
   executes the hook for its export and render steps. Whether the restore
   order is covered was not re-audited.
4. **The other nine hooks extracted from `MainWorkspace`** —
   `useWorkspaceTimelineBinding` was the only one with an executing test, and
   it did not cover the keyframe-override branch. **Partly addressed**: that
   branch is tested since #90, and `AnimationGen`, `Autosave` and `Shortcuts`
   have executing tests (#90, #96, #106); `Arena`, `ArtDirector`, `Camera`,
   `Commands` and `Palette` still have none.

## 4. What runs, and where

```bash
pnpm test            # core, mobile-runtime and app vitest, plus the node --test script suites
pnpm test:pr         # the same, with the app suite scoped to what a branch touched
pnpm test:coverage   # app and core vitest with v8 coverage -> coverage-audit/
pnpm test:e2e        # every Playwright project, against a production build (local)
pnpm test:e2e:ci     # the chromium-ci project: every tests/*.ci.spec.ts
pnpm verify:webgpu   # standalone headed Chrome against an already running server
```

Today CI runs lint, typecheck, the tests (`pnpm test:pr` on a pull request,
`pnpm test` on main), both builds and `pnpm test:e2e:ci` in the `build` job;
the citation check in its own `citations` job; and on main only, the ratchets
in the `health` job. [packages/app/TESTING.md](../../packages/app/TESTING.md)
has the whole split. When this section was first written, CI ran only
`tests/smoke.spec.ts` for e2e; the two updates below record how that changed.

> **Update, 2026-09-21.** Two corrections. The generated-index check and the
> metrics ratchet were never in CI when this was written; they are now, in a
> `health` job that runs on main and on a manual dispatch only. Coverage is
> still not in CI at all. And "tests" now means different things in the two
> places: a pull request runs core and mobile-runtime in full plus the app
> suite scoped to what it touched, while main runs everything. The full split,
> and the trade-off it accepts, is in
> [packages/app/TESTING.md](../../packages/app/TESTING.md).

**A Playwright spec outside the CI project is effectively unenforced.** At
the first audit three specs were actively misleading:

- a5c2f26f `tests/documentation.spec.ts:20` called `test.skip(!docsVisible, ...)` gated on
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
> tests in six specs still failed under swiftshader; they stayed in the local
> `chromium` project and remain unenforced.

At `9fc08078` the CI project holds 41 tests in 11 specs and the local project
50 tests in 10 specs (`playwright test --list`). The timeline spec then moved
from the local project to CI as `tests/timeline.ci.spec.ts`, rewritten for the
timeline the app has now: 43 tests in 12 specs in CI, 32 in 9 locally.

## 5. Rules for writing a test here

1. **Never assert against a mock you control.** `expect(vi.fn()).toBeDefined()`
   and comparing a constant to itself both pass forever. 117 of the 735
   assertions added in the audited range (16%) were non-discriminating.
2. **Pin values, not bounds.** `expect(score).toBeGreaterThan(0)` survives
   almost any mutation. `expect(score).toBe(0.42)` does not.
3. **Colocate unit tests** as `*.test.ts(x)` next to the code. `tests/` is for
   Playwright only.
4. **Put pure logic in `packages/core` and test it there.** It is the part of
   the tree that needs no DOM and no Solid to run. It holds 16 test files
   against the app's 334 (2 against 226 at the first audit).
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
  the module-scope memos in `stores/workspaceLayoutStore.ts`. Fixed in #90;
  `moduleScopeComputations.test.ts` keeps them out. See [BUGS.md](BUGS.md).
