# Code health — Lumen Apeiron (Chaos Master)

Re-measured 2026-09-23 at `9fc08078` (main after #108). The first audit ran on
2026-09-10 at `a5c2f26f`, against a baseline of `v0.9.11` (`5dbde563`); its
numbers stay in the tables below for comparison, and every "now" number names
the command that produced it.

**Every number in this document is produced by a command you can re-run.** That
is the point: a report whose claims cannot be re-derived is a snapshot of one
afternoon's opinion, and it starts rotting the moment it is committed.

```bash
pnpm metrics          # sizes, test counts, header comments, coverage if measured
pnpm metrics:check    # ratchet: fails if a tracked number regressed
pnpm arch             # import cycles, orphans and core purity, by rule (Node 22, 24 or 26+)
pnpm test:coverage    # writes the coverage summaries that `pnpm metrics` reads
pnpm docs:cite        # every file:line citation in the docs still names its symbol
pnpm verify:webgpu    # headed browser pass on real hardware
```

**Where they run.** `pnpm docs:index:check`, `pnpm metrics:check` and
`pnpm arch` run in CI in the `health` job, on every pull request, on pushes to
main and on a manual `workflow_dispatch` (pull requests since 2026-09-24), in a
job of their own so a ratchet failure can never mask a test failure.
`pnpm docs:cite` runs in its own `citations` job, because a citation goes stale
in the change that moves the code ([CONVENTIONS.md](CONVENTIONS.md) §9).
`pnpm test:coverage` and `pnpm verify:webgpu` are local-only by design — see
[METRICS.md](METRICS.md) §3.

`pnpm arch` joined the `health` job in WP3 (#116, 2026-09-23). It stayed out
while it was red on two import cycles (`flame/mutationOperators.ts <->
flame/randomize.ts` and `commands/types.ts <-> recorder/types.ts`), because a
check that is red on the day it lands teaches everyone to ignore it. WP1 (#114)
broke both cycles and WP2 (#115) deleted the 8 orphans in §3, so it reports no
violations at all, and `no-orphans` is now an error rather than a warning: a
new orphan fails the job. It needs Node 22, 24 or 26+ (the job pins 24).

Which tests run where, and why a green pull request is not a promise that main
stays green, is in [packages/app/TESTING.md](../../packages/app/TESTING.md).

---

## 1. Gate status

The full gate, run locally on 2026-09-23 at `9fc08078`. **Everything passes.**

| Step                               | `a5c2f26f` (2026-09-10) | `9fc08078` (2026-09-23)                                                                                |
| ---------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                        | 0 errors, 51 warnings   | 0 errors, 79 warnings                                                                                  |
| `pnpm typecheck`                   | clean                   | clean                                                                                                  |
| `pnpm fmt`                         | clean                   | clean                                                                                                  |
| `pnpm validate-wgsl`               | clean                   | clean                                                                                                  |
| `pnpm test`                        | 228 files, 2,529 tests  | 353 files, **4,029 passed, 12 skipped**, plus 14 script tests                                          |
| `pnpm --filter chaos-master build` | succeeds                | succeeds                                                                                               |
| `pnpm test:e2e:ci`                 | 8 smoke tests           | 41 tests in 11 `*.ci.spec.ts` files (listed, run in CI on main); 43 in 12 once the timeline spec joins |

`pnpm test` splits as core 16 files (204 passed, 8 skipped), mobile-runtime 3
files (23), the app 334 files (3,802 passed, 4 skipped), and the app's
`node --test` scripts (14). The e2e count comes from
`playwright test --list --project=chromium-ci`; the suite itself was not run
locally for this report, and the last CI run on main passed it.

This matters for how you read the rest of the document. Nothing in the first
audit was found by a failing check: every defect in [BUGS.md](BUGS.md) was
something the entire gate was blind to.

## 2. Size

`pnpm metrics`, over `packages/`, tests excluded. The script counts a file's
lines by splitting it on `\n`, which is one more than `wc -l` for a file that
ends in a newline; the first audit counted as `wc -l` does. Counted that way,
`9fc08078` has 193,585 source lines and a mean of 167, and the `v0.9.11` column
gains the bands the audit left blank (61, 36 and 17 files over 500, 800 and
1,200 lines): `git grep -c '' <rev> -- 'packages/**/*.ts' 'packages/**/*.tsx'`,
tests excluded.

| Metric                     |                   `v0.9.11` |                             `a5c2f26f` |                             `9fc08078` |
| -------------------------- | --------------------------: | -------------------------------------: | -------------------------------------: |
| Source files (excl. tests) |                         958 |                                  1,055 |                                  1,157 |
| Source lines               |                     163,963 |                                174,489 |                                194,742 |
| Mean file size             |                         171 |                                    166 |                                    168 |
| Files > 500 LOC            |                          61 |                                     67 |                                     69 |
| Files > 800 LOC            |                          36 |                                     34 |                                     33 |
| Files > 1,200 LOC          |                          17 |                                     16 |                                     16 |
| Largest source file        | 7,928 (`MainWorkspace.tsx`) | 5,713 (`flame/examples/animations.ts`) | 5,713 (`flame/examples/animations.ts`) |
| Largest logic file         |                           — |                                      — |            4,546 (`MainWorkspace.tsx`) |

The first refactor range (`v0.9.11..a5c2f26f`) **grew the codebase by 10,526
lines**. That is not damning on its own — extracting a function costs a
signature, an import and a file header — but it is the honest frame for "we
decomposed things". The 19,096 lines since, counted the same way, are mostly
features: the native shell (#94-#96), glide and scripted export (#99-#104) and
the fractal explorer (#108).

"Largest logic file" is `largest_logic_file_loc`, a ratchet since WP3 (#116):
the largest file that is not at least 80% literal data, which is why it skips
`animations.ts` (92% literal). `MainWorkspace.tsx` is also pinned exactly by
`mainWorkspaceSize.test.ts` ([CONVENTIONS.md](CONVENTIONS.md) §6).

### The ten largest files

`pnpm metrics`, "Largest files".

| File                                                                |   LOC | At `a5c2f26f` |
| ------------------------------------------------------------------- | ----: | ------------: |
| `packages/app/src/flame/examples/animations.ts`                     | 5,713 |         5,713 |
| `packages/app/src/MainWorkspace.tsx`                                | 4,546 |         4,134 |
| `packages/app/src/pages/Benchmarks/BenchmarksPage.tsx`              | 2,786 |         2,801 |
| `packages/app/src/utils/timeline.ts`                                | 2,187 |         2,086 |
| `packages/app/src/flame/variations/docs/content.general.ts`         | 1,894 |         1,894 |
| `packages/app/src/flame/variations/docs/content.general2.ts`        | 1,751 |         1,751 |
| `packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx` | 1,644 |         1,644 |
| `packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx`   | 1,458 |         1,371 |
| `packages/app/src/components/LoadFlameModal/LoadFlameModal.tsx`     | 1,381 |         1,357 |
| `packages/app/src/recorder/replayVideo.ts`                          | 1,349 |             — |

`animations.ts` and the two `content.general*.ts` files are data, not logic.
`ArenaOverlay.tsx`, fifth at 2,010 lines in the first audit, is 811 now: its
views moved into `components/ArenaOverlay/` (`0d264a2c`). `MainWorkspace.tsx` is the one real
hotspot: it grew 412 lines after the audit and is now held by a ratchet.

## 3. Architecture

`pnpm arch` on Node 24, with `tsconfig.depcruise.json` resolving `@/`:
**1,309 modules, 5,537 dependencies, no violations.**

| Rule                 | `a5c2f26f`   | `9fc08078`                           |
| -------------------- | ------------ | ------------------------------------ |
| `no-circular`        | 0            | **0**, an error                      |
| `core-stays-pure`    | 0 reported   | 0 reported, an error — but see below |
| `no-orphans`         | 8, a warning | **0**, an error                      |
| `no-deprecated-core` | 0            | **0**, an error                      |

The first audit's 1,195 modules and zero cycles were right for `a5c2f26f`. The
two cycles named above arrived afterwards, while `pnpm arch` was not in CI:
`flame/mutationOperators.ts` with #86 (2026-09-20) and the edge from
`recorder/types.ts` back to `commands/types.ts` with #105 (2026-09-23). WP1
(#114) broke both, and WP3 (#116) made the `health` job fail on the next one.

**`core-stays-pure` cannot see an npm package.** `.dependency-cruiser.cjs`
excludes every path matching `node_modules` from the graph, so the rule's
`solid-js|typegpu|@webgpu` alternatives never meet a resolved module; only an
import of `packages/app` could trip it. With that exclude narrowed (a probe
config, not committed), the same run reports 5 errors: `@chaos-master/core`
imports `typegpu` in `math/affineTransform.ts`, `math/affineTransform3D.ts` and
(type-only) `utils/schemaUtil.ts`. It holds no DOM or Solid import. The config
is not changed here; it is reported as a defect.

The 8 orphans were `utils/{usePointer,range,randomVec4u,isDefined,getPreferredColorScheme,enumerate}.ts`,
`contexts/MobileContext.tsx` and `App.integration.mock.tsx`: pre-existing dead
code, not something the refactor introduced. All 8 had zero importers and WP2
(#115) deleted them; `App.integration.mock.tsx` was dead too, not the false
positive it was once taken for.

> Read the `arch` caveat in [MISTAKES.md](MISTAKES.md) before trusting a future
> run: configured against the wrong tsconfig, this tool reports zero cycles on a
> graph with most of its edges missing.

## 4. Tests

| Metric                            | `a5c2f26f`                      | `9fc08078`                                 | Command                                   |
| --------------------------------- | ------------------------------- | ------------------------------------------ | ----------------------------------------- |
| Test files (vitest)               | 232 (app 227, core 2)           | 353 (app 334, core 16, mobile-runtime 3)   | `pnpm test`                               |
| Tests executed                    | 2,529                           | 4,029 passed, 12 skipped                   | `pnpm test`                               |
| Playwright specs                  | 13 (only `smoke.spec.ts` in CI) | 21: 11 `*.ci.spec.ts` in CI, 10 local-only | `ls tests/*.spec.ts`                      |
| App line coverage                 | 46.4%                           | 53.22%                                     | `pnpm test:coverage`                      |
| App statement coverage            | 43.61%                          | 50.83%                                     | `pnpm test:coverage`                      |
| App function coverage             | **35.19%**                      | 44.54%                                     | `pnpm test:coverage`                      |
| App branch coverage               | 46.29%                          | 50.58%                                     | `pnpm test:coverage`                      |
| Core lines / functions / branches | not measured                    | 84.89% / 87.16% / 76.14%                   | `pnpm test:coverage`                      |
| **Audit mutation probes caught**  | **0 of 6**                      | **6 of 6**                                 | the probes in [TESTING.md](TESTING.md) §1 |

`pnpm metrics` counts tests statically and reports 356 test files and 3,166
`it(`/`test(` calls; those are the ratchet's numbers, not the suite's. Function
coverage still sits 9 points below line coverage: a lot of code is reached
incidentally through a few entry points rather than exercised directly.

The mutation result is the number that matters. In the first audit six
deliberate behaviour-changing edits across six subsystems left every suite
green. #93 added a test that catches each one, and on 2026-09-23 each probe was
applied again at `9fc08078`: every one turned its test file red. **Treat
coverage percentages in this repo as evidence that a line executed, and nothing
more** — the probes are what showed the difference.

In the first audit's range, **11,395 of 15,812 added non-test lines (72%) had no
sibling test file**, and not one of its 27 added test files predated the code it
covered: the Phase 0 safety net the refactor plan opened with was never built.
It was built afterwards, in #92 ([TESTING.md](TESTING.md) §2).

## 5. Lint

`pnpm lint --format json`: 0 errors, 79 warnings. 46 are `complexity`
(threshold 20); 33 are `security/*`, 28 of them
`security/detect-non-literal-fs-filename` in Node scripts.

Worst offenders:

| Function                  | Complexity | File                                                          | At `a5c2f26f` |
| ------------------------- | ---------: | ------------------------------------------------------------- | ------------: |
| `planGlide`               |         73 | `packages/app/src/flame/glide/plan.ts`                        |             — |
| `writeGlidePath`          |         55 | `packages/app/src/flame/glide/sample.ts`                      |             — |
| `forTripCount`            |         44 | `packages/app/src/flame/variations/custom/runtimeCompiler.ts` |             — |
| `commandPut`              |         39 | `packages/app/scripts/gallery-admin.mjs`                      |            39 |
| (arrow function)          |         39 | `packages/app/src/flame/transformFunction3D.ts`               |             — |
| `validateBenchmarkResult` |         34 | `packages/app/src/benchmarks/validation.ts`                   |            34 |
| `commandSequence`         |         31 | `packages/app/scripts/gallery-admin.mjs`                      |            31 |
| `asMutationOptions`       |         30 | `packages/app/src/commands/builtins/generate.ts`              |            30 |
| `flameComplexityError`    |         27 | `packages/core/src/schema/flameSchema.ts`                     |            27 |

The five the first audit named are all still there at the same complexity.
`planGlide` and `writeGlidePath` came with the glide work (#100-#104);
simplifying `planGlide` is WP7 of the refactor plan
([REFACTOR-PLAN.md](REFACTOR-PLAN.md)).

## 6. Bundle

`pnpm --filter chaos-master build`, then the sizes of `packages/app/dist`:
every `.js` under `assets/`, and the scripts `index.html` loads or preloads.

| Metric                                        | `v0.9.11` | `a5c2f26f` | `9fc08078` |
| --------------------------------------------- | --------: | ---------: | ---------: |
| JS chunks                                     |       422 |        451 |        544 |
| Total JS                                      |   6.62 MB |    6.79 MB |    7.28 MB |
| Eager payload (`index.html` entry + preloads) |     34 KB |      34 KB |    38.4 KB |

Chunk composition changed in the first range — `App` went 1,459 KB → 331 KB,
and new `ancestry` (1,625 KB) and `MainWorkspace` (844 KB) chunks appeared.
Now `App` is 117 KB, `MainWorkspace` 668 KB and `ancestry` 4 KB. **Whether the
startup goal was met still cannot be answered from chunk sizes**; it needs a
runtime measurement of what the first route actually pulls.

The code-splitting defect the first audit confirmed is fixed: `DiffViewModal`
and `AudioWiringModal` (1,644 lines) were each pinned into an eager chunk by a
static import beside a `lazy()` one. #90 fixed both (`2efd73fc`); they build as
chunks of their own (6 KB and 64 KB), the build prints no
`dynamic import will not move module into another chunk` warning, and since
WP3 `lazyBoundaries.test.ts` fails any change that defeats a lazy boundary
again.

## 7. Runtime, on real hardware

Not re-run for this report: `pnpm verify:webgpu` drives a headed browser on a
real GPU. The first audit's run, against an AMD RDNA-4 adapter (not
swiftshader), at `a5c2f26f`:

- Routes `/`, `/arcade`, `/benchmarks`: **zero console errors**.
- Viewports 1920x1080, 1024x768, 768x1024, 390x844: zero console errors. Canvas
  counts 3 / 1 / 1 / 1 — the touch layouts were not double-mounting previews.
- Three Solid "never be disposed" warnings on every route and every viewport,
  all from the module-scope memos in `stores/workspaceLayoutStore.ts`. #90
  fixed them (`b17c7b6e`) and added `moduleScopeComputations.test.ts`, which
  fails on any new module-scope computation; it passes at `9fc08078`.

## 8. Documentation

| Metric                                    | `a5c2f26f`           | `9fc08078`             | Command                                            |
| ----------------------------------------- | -------------------- | ---------------------- | -------------------------------------------------- |
| Source files with a header comment        | 71 of 1,055 (**7%**) | 158 of 1,157 (**14%**) | `pnpm metrics` (`missing_header_comment`: 999)     |
| Index entry points with no header comment | 94 of 239            | 154 of 180             | `_(no header comment)_` in [INDEX.md](INDEX.md) §3 |
| Living docs whose citations all hold      | not measured         | all of them            | `pnpm docs:cite`                                   |

The index rows are not comparable across the two audits: the generator stopped
borrowing a declaration's doc comment for a file with no header, so a file now
shows as undescribed until it opens with one. Header comments are still the
cheapest large improvement available: `pnpm docs:index` builds the module map
from them, and 86% of the tree cannot be described in [INDEX.md](INDEX.md) at
all. `missing_header_comment` is a ratchet, so a new file without one fails
`pnpm metrics:check` on main.

## 9. Where the risk is concentrated

The first audit's ranking, and where each item stands at `9fc08078`:

1. **`packages/core/src/schema/migrateFlameTypes.ts`** — 189 lines that run
   inside every `validateFlame*` call and mutate every flame entering the app
   in place; zero tests at `a5c2f26f`. **Characterized** in #92 (`b2025ea6`,
   `migrateFlameTypes.test.ts`); core's line coverage is 84.89%.
2. **The keyframe short-circuit in `useWorkspaceTimelineBinding.ts`** — written
   for 7 camera paths, applied to every parameter path, so editing a keyframed
   transform slider silently discarded the edit. **Fixed** in #90 (`abd83151`),
   with tests that a keyframe never shadows a live edit.
3. **A legacy `max-width: 768px` block in `App.module.css`** that overrode
   `.tabletLayout` across the 680–768px band. **Fixed** in #90 (`7062e1f2`);
   the layout classification was rebuilt again in #95.
4. **Beats mode never loaded a bundled track**, and the mapping tool disabled
   audio reactivity as its last act. **Fixed** in #90 (`f1b74bb9`, `af2c4ee8`).
5. **The ten hooks extracted from `MainWorkspace`** — one had an executing
   test, and it did not cover the branch that is the hook's purpose. **Partly
   addressed**: `useWorkspaceTimelineBinding`, `AnimationGen`, `Autosave`,
   `Replay` (its export step) and `Shortcuts` now have executing tests (#90,
   #96, #106, #110); `Arena`, `ArtDirector`, `Camera`, `Commands` and `Palette`
   still have none. This is the open item, and the MainWorkspace split (WP5)
   will add more hooks to the list.
