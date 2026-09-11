# Code health — Lumen Apeiron (Chaos Master)

Audit date: 2026-09-10. Commit `a5c2f26f`. Baseline for comparison: `v0.9.11`
(`5dbde563`).

**Every number in this document is produced by a command you can re-run.** That
is the point: a report whose claims cannot be re-derived is a snapshot of one
afternoon's opinion, and it starts rotting the moment it is committed.

```bash
pnpm metrics          # the table this report is built from
pnpm metrics:check    # ratchet: fails if a tracked number regressed
pnpm arch             # layering violations and import cycles, by rule
pnpm test:coverage    # coverage summary, feeds the metrics table
pnpm verify:webgpu    # headed browser pass on real hardware
```

---

## 1. Gate status

The full CI gate was run locally at `a5c2f26f` on 2026-09-10. **Everything
passes.**

| Step                               | Result                                  |
| ---------------------------------- | --------------------------------------- |
| `pnpm lint`                        | 0 errors, 51 warnings                   |
| `pnpm typecheck`                   | clean                                   |
| `pnpm fmt`                         | clean                                   |
| `pnpm validate-wgsl`               | clean                                   |
| `pnpm test`                        | 228 files, **2,529 tests, all passing** |
| `pnpm --filter chaos-master build` | succeeds                                |
| `pnpm test:e2e:ci`                 | 8 smoke tests passing                   |

This matters for how you read the rest of the document. Nothing here was found
by a failing check. Every defect in [BUGS.md](BUGS.md) is something the entire
existing gate is blind to.

## 2. Size

| Metric                     |                   `v0.9.11` |                             `a5c2f26f` |           Δ |
| -------------------------- | --------------------------: | -------------------------------------: | ----------: |
| Source files (excl. tests) |                         958 |                                  1,055 |         +97 |
| Source lines               |                     163,963 |                                174,489 | **+10,526** |
| Mean file size             |                         171 |                                    166 |          −5 |
| Files > 500 LOC            |                           — |                                     67 |             |
| Files > 800 LOC            |                           — |                                     34 |             |
| Files > 1,200 LOC          |                           — |                                     16 |             |
| Largest source file        | 7,928 (`MainWorkspace.tsx`) | 5,713 (`flame/examples/animations.ts`) |             |

The refactor **grew the codebase by 10,526 lines**. That is not damning on its
own — extracting a function costs a signature, an import and a file header —
but it is the honest frame for "we decomposed things".

### The ten largest files

| File                                                                |   LOC |
| ------------------------------------------------------------------- | ----: |
| `packages/app/src/flame/examples/animations.ts`                     | 5,713 |
| `packages/app/src/MainWorkspace.tsx`                                | 4,134 |
| `packages/app/src/pages/Benchmarks/BenchmarksPage.tsx`              | 2,801 |
| `packages/app/src/utils/timeline.ts`                                | 2,086 |
| `packages/app/src/components/ArenaOverlay.tsx`                      | 2,010 |
| `packages/app/src/flame/variations/docs/content.general.ts`         | 1,894 |
| `packages/app/src/flame/variations/docs/content.general2.ts`        | 1,751 |
| `packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx` | 1,644 |
| `packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx`   | 1,371 |
| `packages/app/src/components/LoadFlameModal/LoadFlameModal.tsx`     | 1,357 |

`animations.ts` and the two `content.general*.ts` files are data, not logic.
`MainWorkspace.tsx` and `ArenaOverlay.tsx` are the real hotspots.

## 3. Architecture

`pnpm arch` on a correctly resolved graph — 1,195 modules, 4,999 dependencies:

| Rule              | Result           |
| ----------------- | ---------------- |
| `no-circular`     | **0 violations** |
| `core-stays-pure` | **0 violations** |
| `no-orphans`      | 8 warnings       |

**Both of PR #73's headline architectural claims hold up.** There are genuinely
no import cycles, and `@chaos-master/core` genuinely contains no DOM, WebGPU or
Solid imports. This is the strongest part of the range.

The 8 orphans are `utils/{usePointer,range,randomVec4u,isDefined,getPreferredColorScheme,enumerate}.ts`,
`contexts/MobileContext.tsx` and `App.integration.mock.tsx` (a test mock, a false
positive). **None of them were touched in this range** — they are pre-existing
dead code, not something the refactor introduced.

> Read the `arch` caveat in [MISTAKES.md](MISTAKES.md) before trusting a future
> run: configured against the wrong tsconfig, this tool reports zero cycles on a
> graph with most of its edges missing.

## 4. Tests

| Metric                     |                                Value |
| -------------------------- | -----------------------------------: |
| Test files                 |     232 (app 227, core 2, landing 0) |
| Tests executed             |                                2,529 |
| Playwright specs           | 13 (only `smoke.spec.ts` runs in CI) |
| Line coverage              |                                46.4% |
| Statement coverage         |                               43.61% |
| Function coverage          |                           **35.19%** |
| Branch coverage            |                               46.29% |
| **Mutation probes killed** |                           **0 of 6** |

Function coverage sitting 11 points below line coverage says a lot of code is
reached incidentally through a few entry points rather than exercised directly.

The mutation result is the number that matters, and it is covered in full in
[TESTING.md](TESTING.md): six deliberate behaviour-changing edits across six
subsystems, every suite stayed green. **Treat coverage percentages in this repo
as evidence that a line executed, and nothing more.**

Of the added non-test source in this range, **11,395 of 15,812 lines (72%) have
no sibling test file**, and not one of the 27 added test files predates the code
it covers — so the Phase 0 safety net the refactor plan opens with was never
built.

## 5. Lint

51 warnings, 0 errors. 47 are `complexity` (threshold 20); 4 are `security/*`.

Worst offenders still over threshold after a range whose commit messages
repeatedly claim complexity reduction:

| Function                  | Complexity | File                                        |
| ------------------------- | ---------: | ------------------------------------------- |
| `commandPut`              |         39 | `packages/app/scripts/gallery-admin.mjs`    |
| `validateBenchmarkResult` |         34 | `packages/app/src/benchmarks/validation.ts` |
| `commandSequence`         |         31 | `packages/app/scripts/gallery-sequence.mjs` |
| `asMutationOptions`       |         30 | (webmcp tool options)                       |
| `flameComplexityError`    |         27 | `packages/core/src/schema/flameSchema.ts`   |

## 6. Bundle

| Metric                                        | `v0.9.11` | `a5c2f26f` |
| --------------------------------------------- | --------: | ---------: |
| JS chunks                                     |       422 |        451 |
| Total JS                                      |   6.62 MB |    6.79 MB |
| Eager payload (`index.html` entry + preloads) |     34 KB |      34 KB |

Chunk composition changed substantially — `App` went 1,459 KB → 331 KB, and new
`ancestry` (1,625 KB) and `MainWorkspace` (844 KB) chunks appeared — but the
eager payload is identical and total JS grew slightly. **Whether Phase 2's
startup goal was met cannot be answered from chunk sizes**; it needs a runtime
measurement of what the first route actually pulls.

One code-splitting defect is confirmed: `MainWorkspace.tsx:38` lazy-loads
`DiffViewModal`, but `WorkspaceSidebar.tsx:5` — created by the same
decomposition commit — imports it statically, so vite keeps it in the main
chunk and says so at build time. `AudioWiringModal` (1,644 lines) has the same
problem via `AudioReactivePanel.tsx:5`.

## 7. Runtime, on real hardware

`pnpm verify:webgpu` against an AMD RDNA-4 adapter (not swiftshader):

- Routes `/`, `/arcade`, `/benchmarks`: **zero console errors**.
- Viewports 1920x1080, 1024x768, 768x1024, 390x844: zero console errors. Canvas
  counts 3 / 1 / 1 / 1 — the touch layouts are not double-mounting previews.
- **Three Solid "never be disposed" warnings on every route and every
  viewport**, all from `stores/workspaceLayoutStore.ts:114,120,126`.

## 8. Documentation

| Metric                                    |                Value |
| ----------------------------------------- | -------------------: |
| Source files with a header comment        | 71 of 1,055 (**7%**) |
| Index entry points with no header comment |            94 of 239 |

This is the cheapest large improvement available. `pnpm docs:index` builds the
module map from these comments, so 93% of the tree cannot be described in
[INDEX.md](INDEX.md) at all.

## 9. Where the risk is concentrated

Ranked, for someone deciding what to work on:

1. **`packages/core/src/schema/migrateFlameTypes.ts`** — 189 lines, zero tests,
   runs inside every `validateFlame*` call, mutates every flame entering the app
   in place. Silent corruption of saved user artwork.
2. **`hooks/useWorkspaceTimelineBinding.ts:87`** — confirmed high: a keyframe
   short-circuit written for 7 camera paths now applies to every parameter path,
   so editing a keyframed transform slider silently discards the edit.
3. **`App.module.css:21`** — confirmed high: a legacy `max-width: 768px` block
   overrides `.tabletLayout` across the whole 680–768px band.
4. **`webmcp/tools/arcadeBeats.ts:333`** — confirmed high: Beats mode never
   loads a bundled track, and the mapping tool disables audio reactivity as its
   last act.
5. **The ten hooks extracted from `MainWorkspace`** — one has an executing test,
   and it does not cover the branch that is the hook's purpose.
