# Deferred Refactor Plan (2026-07)

Roadmap for the lower-priority §4–§6 items from `docs/audit_bugs_tests_2026-07.md`
that were intentionally **not** bundled into the bug-fix / quick-cleanup PRs.
Each workstream below is meant to land as **its own branch/PR**, rebased on
`main`.

## Implementation status (branch `claude/refactor-plan`)

The smaller refactors — Tier 1 (A–E), the decided Tier 2 items (F, G, I), Tier 4
(K, L), and the safe subset of H — have been implemented on this branch, one
commit each:

- **A** — `rgbToOklab` deduped (reused from `flam3PaletteParser`).
- **B** — generic Dexie capped-history factory + `fake-indexeddb` dev dep.
- **C** — shared big-endian byte helpers (`utils/binaryReader.ts`) for PNG/MP4.
- **D** — `randomize.ts` internal dedup (variation/affine/weight helpers).
- **E** — tour-step selector + `beforeShow` factory (`tours/stepFactory.ts`).
- **F** — `colors.ts` reduced to the one used export (dead ColorMap removed).
- **G** — required contexts throw via `useContextSafe`; the deliberate no-op
  fallbacks (KeyframeTarget/CompactMode/ChangeHistory/Mobile) are documented as
  intentional graceful degradation for standalone/preview/export usage.
- **I** — `ifsPipeline3D.run()` surfaces dispatch errors (parity with 2D).
- **K** — `@solidjs/testing-library` added; the two placeholder tests rewritten
  to render the real components.
- **L** — `flameSchema` render-settings boundary tests.
- **H (partial)** — the byte-identical `select(v, 1e-9, v === 0.0)` divide-guard
  cluster (29 sites) consolidated into `variations/safeMath.ts#safeDenom`, with
  `ifsPipeline.resolveAll.test.ts` (all 446 variations resolve to WGSL) as the
  safety net. **Deferred:** the broader `safeDiv`/`safeSqrt`/`safeAcos` helpers
  and standardizing the remaining heterogeneous epsilons (`1.0e-10`, `1e-20`,
  bare `EPS`/`EPS_TINY`) — that changes rendered output (different epsilons /
  adding domain clamps) and needs a maintainer call.

Not started (bigger stuff): Tier 3 god-file splits (J1–J5, incl. MainWorkspace).

## Ground rules for every PR in this plan

- **One workstream per PR.** No mixing unrelated refactors in a branch.
- **Pure refactors preserve behavior.** Extractions move code without changing
  what it does; the diff should be reviewable as "same logic, new location".
- **Verification per PR:** `pnpm typecheck && pnpm lint && pnpm fmt && pnpm test`
  green, plus `pnpm --filter chaos-master run build`. For anything touching a
  render/GPU path or a large component, also run the app (`/run`) and the CI
  smoke suite, since those areas have little unit coverage.
- **Add characterization tests _before_ risky moves** where feasible, so the
  refactor is anchored by a passing test on both sides.
- **Rebase merge**, commits authored by the maintainer, no tooling footers.

## Tiering & suggested order

| Tier | Theme                                   | Risk    | Do when                                                                           |
| ---- | --------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| 1    | Self-contained dedup (A–E)              | low     | first — safe momentum, shrinks duplication before the big splits                  |
| 2    | Consolidations needing a decision (F–I) | medium  | after Tier 1; F & G need a maintainer call first                                  |
| 3    | God-file splits (J1–J5)                 | high    | after the test-infra enabler (Tier 4-K); smallest files first, MainWorkspace last |
| 4    | Test infrastructure (K–L)               | low–med | K early (unblocks safe god-file splits); L anytime                                |

Recommended sequence: **Tier 1 → 4-K → 2 → 3 (J1→J5) → 4-L opportunistically.**

---

## Tier 1 — Self-contained dedup (low risk)

### A. Dedup `rgbToOklab`

- **Current:** `flame/palettes.ts:31` has a private `rgbToOklab`; `flame/flam3PaletteParser.ts:170` exports an identical one (used elsewhere). Same matrices/constants → correctness fixes can't diverge.
- **Approach:** delete the private copy in `palettes.ts`, import the exported one from `flam3PaletteParser`. First confirm the two bodies are byte-identical and that `palettes.ts → flam3PaletteParser` introduces no import cycle (if it does, hoist `rgbToOklab` into a small `flame/colorSpace.ts` and have both import it).
- **Verify:** unit tests (both already exercised via `flameXml.test.ts`); typecheck.
- **Size:** XS. **PR:** `refactor/dedup-rgb-to-oklab`.

### B. Generic Dexie "capped history table" factory

- **Current:** `utils/logoHistoryDB.ts` (43 lines) and `utils/randomizerHistoryDB.ts` (47 lines) are near-identical: one-table Dexie DB (`id, timestamp`) with `loadXEntries` / `addXEntry` (add + prune to max + return truncated) / `clearX`.
- **Approach:** add `utils/createHistoryDB.ts` — `createHistoryDB<T>(dbName, storeName, defaultMax)` returning `{ load, add, clear }`. Re-implement both modules as thin wrappers keeping their exact current export names/signatures (so no call-site churn).
- **Risk note:** IndexedDB isn't exercisable under the current vitest env (no fake-indexeddb). Either (a) add `fake-indexeddb` as a devDep and write a real round-trip/prune test, or (b) ship the refactor verified by typecheck + manual smoke. Prefer (a) — the prune-ordering logic is exactly what a factory could regress silently.
- **Size:** S. **PR:** `refactor/history-db-factory` (bundle the `fake-indexeddb` devDep + test if going route (a)).

### C. Shared binary-container read helpers

- **Current:** `utils/flameInPng.ts` (PNG chunks) and `utils/flameInMp4.ts` (MP4 boxes) each hand-roll 4-char-tag reads and big-endian uint32 math; `flameInMp4`'s `findBox` bounds-checks, `flameInPng` historically did not (root cause of audit bug #1's blind spot).
- **Approach:** add `utils/binaryReader.ts` with `read4CC(view, offset)` and `readUint32BE`/`writeUint32BE`, plus a bounds-checked chunk/box walk helper. Migrate both files to it so the bounds check is shared, not per-file.
- **Verify:** extend `flameInPng.test.ts` (added in the bug-fix PR) with a truncated-buffer case; add an `flameInMp4` round-trip/truncation test.
- **Size:** S–M. **PR:** `refactor/binary-reader-helpers`.

### D. `randomize.ts` internal dedup

- **Current (727 lines):** the "pick parametric variation + randomize params" block is duplicated (~2 sites), the `isVariationType3D`/`isParametricVariationType` dimension ternary repeats 5+ times, and the `totalWeight > 0` normalization guard is copy-pasted 3×. (The `paramSigma` helper from the bug-fix PR already removed one class of duplication.)
- **Approach:** extract `pickAndRandomizeParametric(...)`, a `dimOf(type)` helper, and `normalizeWeights(transforms)`; route all sites through them. Pure logic, no behavior change.
- **Verify:** `randomize.test.ts` (extend with a `mutateFlame` weight-sum invariant — currently a gap) + `generateRandomFlame` validity.
- **Size:** M. **PR:** `refactor/randomize-dedup`.

### E. Tour-step boilerplate factory

- **Current:** the 6-part step pattern (target → title → description → `scrollToTarget` → delay → `animateValue`/`executeCommand`) repeats 25+ times across `tours/*.ts`, with per-file duplicate timing constants (`ANIMATION_GRACE_MS` vs `GRACE_MS`/`SLOW_MS`, differing values for the same concept).
- **Approach:** add `tours/stepFactory.ts` with a `sliderStep({...})` / `animatedStep(...)` builder and a single shared timing-constants module; migrate the creation tours onto it.
- **Risk note:** tours are only covered by the smoke/e2e layer. Keep the factory output structurally identical to the current step objects; diff-review one tour fully before mass-applying.
- **Size:** M. **PR:** `refactor/tour-step-factory`.

---

## Tier 2 — Consolidations needing a decision (medium risk)

### F. Unify `colorMap.ts` vs `colors.ts` `ColorMap` — **needs maintainer decision**

- **Current:** two parallel, incompatible types both named `ColorMap`: `colorMap.ts` (entries-based: `ColorMapEntry[]`, `applyColorMapToFlame`, its own `defaultColorMaps`) and `colors.ts` (different shape, `applyColorMap`/`applyColorMapById`, its own `defaultColorMaps` with overlapping names but different values). ~12 files import from one or the other.
- **Decision needed:** which is the source of truth, and are the differing preset values intentional? This isn't a mechanical refactor — merging them changes real data.
- **Approach (once decided):** pick the canonical module, write an adapter for the other's API, migrate importers in small batches, add a test asserting the presets are internally consistent, then delete the loser.
- **Size:** M–L. **PR(s):** `refactor/unify-colormap` (possibly split by importer batch). **Blocker:** the decision.

### G. Standardize context "missing provider" fallback — **needs maintainer decision**

- **Current:** four strategies coexist across `contexts/*.tsx`: throw via `useContextSafe`, manual throw, silent no-op object, and a baked-in default. Behavior is unpredictable per context.
- **Decision needed:** the desired default policy (throw-by-default is the common React/Solid convention; some contexts may intentionally want a no-op).
- **Approach (once decided):** adopt one helper (e.g. `useContextSafe`) as the default, convert the manual-throw and silent ones, and leave documented exceptions with a comment explaining why. This is behavioral — a context that currently no-ops would start throwing, so each conversion needs a quick check of consumers.
- **Size:** M. **PR:** `refactor/context-fallback-policy`.

### H. Consolidate epsilon guards across variation files

- **Current:** ~15+ variation files hand-roll divide-by-zero / domain guards with 5 different epsilon literals (`1e-6`, `1e-9`, `1e-10`, raw `0.000000001`, and bare `=== 0.0` with no epsilon). Shared `EPS`/`EPS_TINY` exist in `flame/constants.ts` but are mostly bypassed.
- **Approach:** add GPU helpers `safeDiv` / `safeSqrt` / `safeAcos` (`'use gpu'`) in a shared module using the canonical `EPS`, and migrate the offending files. The "q" trig family is the largest cluster.
- **Risk & mitigation:** WGSL codegen — a wrong helper could change render output. **The `variations/mathSanity.test.ts` added in the cleanup PR is the safety net** (finite-output sweep); extend it with near-singularity sample points before migrating. Migrate in small batches (e.g. the "q" family first) and eyeball the rendered output for a couple of affected flames via `/run`.
- **Size:** M (spread over 2–3 PRs by cluster). **PR(s):** `refactor/variation-epsilon-guards-*`.

### I. Align `ifsPipeline` 2D/3D error handling

- **Current:** `ifsPipeline3D.run()` wraps dispatch in try/catch and only logs (silently freezing on repeated errors); `ifsPipeline.run()` has no guard and would throw. Failure modes differ with no stated reason.
- **Decision needed:** which behavior is correct — surface (throw / signal device-lost) or swallow? Given the WebGPU-resilience work already in the repo, surfacing to a device-lost handler is likely right.
- **Approach:** make both paths identical; if surfacing, route through the existing device-lost/resilience handling rather than a bare throw.
- **Risk:** render hot path. Verify via the resilience e2e config locally.
- **Size:** S–M. **PR:** `refactor/ifs-pipeline-error-parity`.

---

## Tier 3 — God-file splits (high risk, do after Tier 4-K)

Shared strategy: these files have little/no unit coverage, so **extraction is the
risk**. Per file: (1) identify cohesive, side-effect-free units (pure helpers,
sub-components with clear props); (2) extract one unit per PR, keeping the public
component's props/behavior identical; (3) verify with typecheck + build + CI smoke

- a manual `/run` of the affected screen after each PR. No logic changes mixed in.

### J1. `LoadFlameModal.tsx` (1029) — start here (smallest, clear seams)

Extract: file I/O + format-sniffing (PNG/MP4/XML) into a `useFlameFileLoader`
hook/util; the animated-preview RAF loop + "animated" badge into a shared
component (the audit noted this is duplicated between `AnimatedPreview` and
`RecentFlameItem`); gallery browsing into a subcomponent. **PRs:** 2–3.

### J2. `ExportPngDialog.tsx` (1231)

Extract: export-queue orchestration + resolution math + blob conversion into
plain modules (unit-testable); keep the dialog as presentation. **PRs:** 2–3.

### J3. `LogoFaviconGenerator.tsx` (1272)

Extract: canvas drawing routines and blob/download I/O into utils (the ICO path
already has `icoEncoder.ts`); keep the component as UI. **PRs:** 2–3.

### J4. `Flam3.tsx` (1264)

Extract: the export-driver loop (~lines 1117-1251) and the render-tick function
into separate modules; isolate the GPU pipeline lifecycle. Highest GPU risk —
do after J1–J3 to build confidence, and lean on the resilience e2e config.
**PRs:** 2–4.

### J5. `MainWorkspace.tsx` (4987) — the big one, most incremental

Per `docs/audit_report.md`: pull out `Sidebar.tsx` (transform list / render
settings), `FloatingToolbar.tsx` (canvas overlay actions), and move the large
state initialization into a dedicated store/context (`useFlameEditorState()`).
Do this over **many small PRs**, one cohesive section at a time, never a big-bang
rewrite. Land only after J1–J4 have proven the extraction workflow.

---

## Tier 4 — Test infrastructure

### K. SolidJS component-render test infra (enabler)

- **Current:** `@solidjs/testing-library` is **not installed**; `TESTING.md`
  notes component rendering in vitest was blocked. Two committed tests are fake:
  `components/DelayedShow/DelayedShow.test.tsx` and
  `contexts/KeyframeTargetContext.test.tsx` never import the real
  component/hook.
- **Approach:** add `@solidjs/testing-library` (+ `@testing-library/jest-dom`)
  as devDeps, wire into `vitest.config.ts` (the solid plugin is already present),
  prove it with one real render test, then rewrite the two fake tests to exercise
  the real units. This enabler also unblocks characterization tests for the Tier 3
  splits.
- **Size:** M. **PR:** `test/solid-render-infra` (+ the two rewrites, or split).

### L. `flameSchema` boundary tests (additive, easy)

- Add boundary/out-of-range tests for the ~15 clamped `RenderSettings` fields
  (exposure, vibrancy, contrast, gamma, zoom, skipIters, paletteMode) and confirm
  the intended behavior for a zero-transform flame. Pure additions.
- **Size:** S. **PR:** `test/flame-schema-boundaries`.

---

## Open decisions blocking specific PRs

1. **F (colorMap/colors):** which module is canonical, and are the differing
   preset values intentional?
2. **G (context fallback):** throw-by-default, or keep some silent no-ops (which)?
3. **I (ifs error handling):** surface errors (device-lost path) or swallow?
4. **B / K:** OK to add devDeps (`fake-indexeddb`, `@solidjs/testing-library`)?

Everything in Tier 1 and Tier 4-L can proceed without any decision.
