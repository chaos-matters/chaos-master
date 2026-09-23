# Remediation plan — from the 2026-09-10 audit

Ordered backlog produced by the audit of `v0.9.11..a5c2f26f` (11 fork PRs,
#73-#83). Evidence for every item is in [BUGS.md](BUGS.md),
[CODE-HEALTH.md](CODE-HEALTH.md) and [TESTING.md](TESTING.md).

Ordering principle: **defects that silently corrupt user data or silently
discard user input come first; then the safety net that should have existed
before the refactor; then the unfinished contract; then hygiene.** Line counts
are not a ranking signal.

Each item states its acceptance criterion. An item is not done until that is
demonstrably true.

**Status, 2026-09-23.** Stages 1, 2 and 3 are done: #90, #91, #92, #93 and #87,
merged 2026-09-20. What was left of Stages 4 and 5 is folded into the refactor
plan that now orders all remaining work; see
[Stages 4 and 5](#stages-4-and-5--folded-into-the-refactor-plan) at the end.
The stage bodies below are kept as the record of what each stage asked for.
Their file and line references describe the tree at `a5c2f26f`, the audited
commit, and are pinned to it ([CONVENTIONS.md](CONVENTIONS.md) §9).

## Executable plans

Each stage has a task-by-task plan with the actual test code, the actual fix,
and acceptance criteria — written for someone with no context for this codebase.

| Stage                          | Plan                                                                                                                  | Status                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1 — confirmed defects          | [stage1-defects](../superpowers/plans/2026-09-10-audit-remediation-stage1-defects.md)                                 | **Done**: #90, merge `520cd16d`                                   |
| — motion blur (split out)      | [offscreen-export-motion-blur](../superpowers/plans/2026-09-11-offscreen-export-motion-blur.md)                       | **Done**: #91, merge `683f9177`                                   |
| 2 — characterization net       | [stage2-characterization-net](../superpowers/plans/2026-09-11-audit-remediation-stage2-characterization-net.md)       | **Done**: #92, merge `75f53619`                                   |
| 3 — measurable test quality    | [stage3-test-harness](../superpowers/plans/2026-09-11-audit-remediation-stage3-test-harness.md)                       | **Done**: #93, merge `a98c3876`; items 2 and 3 in #87, `fb3b1089` |
| 4 and 5 — contract and hygiene | [stages4-5-contract-and-hygiene](../superpowers/plans/2026-09-11-audit-remediation-stages4-5-contract-and-hygiene.md) | Superseded by the refactor plan; see the end of this document     |

The dated plans are historical: they describe the tree they were written
against.

---

<!-- cite-check: pinned a5c2f26f -->

## Stage 1 — Confirmed defects that reach the user

These are verified, reproducible, and every one of them passes the full CI gate
today.

**Task-by-task implementation steps for this whole stage:**
[../superpowers/plans/2026-09-10-audit-remediation-stage1-defects.md](../superpowers/plans/2026-09-10-audit-remediation-stage1-defects.md).
It carries the exact code, the failing test for each fix, and the manual
tablet-verification protocol to run with the user.

### 1.0 Degenerate pinch gestures write NaN into the camera — HIGH

**Done** in #90: `5c88d855` (the pinch guard) and `376cb80f` (the schema rejects infinite camera values).

`packages/app/src/utils/createPinchHandler.ts:18`, consumed unguarded at
`packages/app/src/lib/WheelZoomCamera3D.tsx:355`

This is the root cause behind two commits in this range titled "fix tablet
exporter". `createPinchHandler` computes the pinch distance as `hypot()` of the
two touch deltas with no zero guard. `WheelZoomCamera2D` was hardened against
that by `0d239a45`; `WheelZoomCamera3D` never was, and divides by it directly.
Two coincident touches — what a fast two-finger tap reports — give `NaN` or
`Infinity`, and `Math.min`/`Math.max` **propagate NaN**, so the orbit clamp does
not rescue the value. The two halves then fail differently. `0/0` gives a
`NaN` radius, which breaks the live render and, once `JSON.stringify` turns it
into `null`, makes the saved flame fail to reload. `d/0` gives `Infinity`, the
radius collapses to `MIN_ORBIT_RADIUS`, and that finite value validates cleanly
and is persisted into autosave, share links and session recordings. (valibot
1.2.0's `v.number()` rejects `NaN` but accepts `±Infinity` — measured, not
assumed; an earlier draft of this audit had it backwards.)

The export failure was patched downstream twice — once in `ExportJobHost`, once
in `Flam3` — leaving the corruption itself in place.

**Fix.** Guard centrally in `createPinchHandler` so no consumer can forget, give
`WheelZoomCamera3D` the same explicit checks as its 2D twin, and make the camera
schema fields reject `±Infinity` as well as `NaN`.

**Acceptance.** A unit test driving two coincident touches and asserting the
radius stays finite, plus the manual tablet protocol in the plan — run against
`main` first, to confirm the bug reproduces before the fix.

### 1.1 Keyframe short-circuit swallows slider edits — HIGH

**Done** in #90: `abd83151`.

`packages/app/src/hooks/useWorkspaceTimelineBinding.ts:87`

`getFlameCameraSetting` consults `getTimelineCameraKeyframeValue` for **every**
parameter path. Before the extraction the short-circuit was written out longhand
in exactly seven camera cases, and `camera.rotation` deliberately had none.
Because `addKeyframeImpl` writes the resolved value back into the flame, a
slider on a keyframed transform does not merely fail to record — it visibly
snaps back on every pointermove.

**Fix.** Look up `CAMERA_GETTERS[path]` first and only consult the timeline for
paths that are in it, preserving the `camera.rotation` exclusion.

**Acceptance.** A test in `useWorkspaceTimelineBinding.test.ts` that keyframes
`transform.<id>.probability`, sets `isDrivingView() === true` with the playhead
on that frame, writes 0.9, and asserts `getFlameValue` returns 0.9. It must fail
before the fix. Note the existing test file hard-codes `isDrivingView` and
`hasKeyframeAtFrame` to `false` in every case, which is why this shipped.

### 1.2 Tablet split layout collapses across 680-768px — HIGH

**Done** in #90: `7062e1f2`. The layout classification was rebuilt again in #95.

`packages/app/src/App.module.css:21`

A pre-existing `max-width: 768px` block overrides `.tabletLayout`, so every
device in the 680-768px band gets the wrong chrome: iPad Mini 6 portrait
(744px), older iPads at 768, many Android tablets, and any desktop window
dragged narrow.

**Fix.** Give `.phoneLayout` / `.tabletLayout` precedence over the legacy
breakpoint block, either by ordering or by excluding them from it.

**Acceptance.** A breakpoint table spec asserting exactly one chrome renders at
each of 679, 680, 744, 768 and 769px.

### 1.3 Beats mode never loads a track — HIGH

**Done** in #90: `f1b74bb9` and `af2c4ee8`.

`packages/app/src/webmcp/tools/arcadeBeats.ts:333`

There is no seam that fetches and decodes a bundled track, and
`arcade_set_audio_mapping` disables audio reactivity as its final act. The tools
return `{ok: true}`, the session saves, and nothing is audio-reactive. The mode
does not work.

**Fix.** Add `audio.loadTrack(track)` to the facade (fetch via
`fetchBundledTrackBuffer`, decode, set `audioBuffer` + `audioTrackName`), call it
from `arcade_start_beats`, and stop the mapping tool from disabling reactivity.

**Acceptance.** An end-to-end test driving the documented tool sequence and
asserting a decoded buffer is loaded and reactivity is enabled at the end.

### 1.4 Randomize / Smart Animation are not recorded — MEDIUM

**Done** in #90: `b6838992`.

`packages/app/src/MainWorkspace.tsx:2412` — `useWorkspaceAnimationGen` was handed
`timeline` instead of `recorderTimeline`. Both presets use `Math.random()`, so
without a snapshot the action cannot replay.

**Fix.** Pass `recorderTimeline`. **Acceptance.** A recorder test asserting a
snapshot with origin `timeline.random` is emitted.

### 1.5 Director sessions overwrite each other's ratings — MEDIUM

**Done** in #90: `404db62a`.

`packages/app/src/arcade/tasteStore.ts:164` — records keyed by
`(generation, candidateIndex)` only, so a new session at generation 1 overwrites
the old one. **Fix.** Add a session id to the key. **Acceptance.** A test rating
across two sessions and asserting `totalRatings` is the sum.

### 1.6 Motion blur silently dropped on offscreen export — MEDIUM

**Done** in #91, merge `683f9177`: the offscreen path accumulates sub-frames.

`packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx:1267` — the
offscreen path ignores the sub-sampling setting; output is byte-identical to
blur-off. **Fix.** Wire sub-frame accumulation into the offscreen driver, or
disable the control on that path and say why. Silently ignoring the setting is
the one unacceptable option.

### 1.7 PR-preview origin is indexable — MEDIUM

**Done** in #90: `c37f8aae`.

`packages/app/src/worker/middleware/reviewHost.ts:17` — PR #79 covered
`dev.lumenapeiron.com` and `about.dev.lumenapeiron.com` but not the
`*.workers.dev` preview, whose URL is posted on every public PR.

**Fix.** Add the preview host to the review-host match. **Acceptance.** A worker
test asserting `Allow: /` is never served from a non-production origin.

### 1.8 Three module-scope memos leak on every load — MEDIUM

**Done** in #90: `b17c7b6e`. Instead of a smoke-spec console check, `5eb10f1e` added `moduleScopeComputations.test.ts`, which fails on the pattern statically.

`packages/app/src/stores/workspaceLayoutStore.ts:114` (`isPhone`), `:120`
(`isTablet`) and `:126` (`isTouchLayout`) are `createMemo` at module scope. Solid warns
they will never be disposed, three times per page load, on every route and
viewport.

**Fix.** Wrap in an explicit `createRoot`, or move into the store factory.

**Acceptance.** `pnpm verify:webgpu` reports zero Solid warnings. Then extend
`tests/smoke.spec.ts` — which today filters console **errors** only — to fail on
this warning class, so it cannot come back.

---

## Stage 2 — The safety net that was skipped

**Done** in #92, merge `75f53619`: all five items below, each run on both `v0.9.11` and `HEAD`. No regression from the refactor turned up; the golden round trip found pre-existing export losses ([TESTING.md](TESTING.md) §2).

Phase 0 of `docs/REFACTOR_AND_IMPROVEMENT_STRATEGY.md` promised characterization
tests over "schema boundaries, flame serialization, affine math" **before** any
refactoring. None were written. Not one of the 27 test files added in this range
predates the code it covers.

**Do this before starting any further refactor phase.** The strongest form is a
commit that adds only tests, then is verified to pass on **both `v0.9.11` and
`HEAD`** — any assertion that passes on the tag and fails on `HEAD` is a
regression that already shipped and nobody noticed.

| Item                                          | Where                                                                      | Why it is first                                                                                                                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrateFlameVariationTypes` characterization | `packages/core/src/schema/migrateFlameTypes.test.ts`                       | 189 lines, zero tests, runs inside every `validateFlame*` call and mutates every flame entering the app in place. A wrong map entry silently renders the user's saved artwork as a different fractal. |
| Golden `.flame` XML round-trip corpus         | `packages/app/src/flame/flameXml.golden.test.ts` + 5-8 checked-in fixtures | The "flame serialization" half of Phase 0.                                                                                                                                                            |
| `validateFlame` boundary table                | `packages/core/src/schema/flameSchema.boundaries.test.ts`                  | The "schema boundaries" half. Every `MAX_*` at limit and limit+1.                                                                                                                                     |
| `packages/core/src/math` characterization     | `affineTransform{,3D}.test.ts`, `affine3DView.test.ts`, `easing.test.ts`   | 252 lines of affine and easing maths with no test in the package that owns it.                                                                                                                        |
| Share-link codec round-trip                   | `packages/app/src/utils/jsonQueryParam.test.ts`                            | Currently checks a transform count; needs deep equality plus a golden encoding.                                                                                                                       |

**Fixtures must not contain real personal data.** Generate them from the format,
or hand-write obviously fake values.

---

## Stage 3 — Make test quality measurable

**Done.** Items 1 and 4-7 in #93, merge `a98c3876`; items 2 and 3 in #87, merge `fb3b1089`. The CI Playwright project is named `chromium-ci`, not `chromium-degraded`. All six mutants are caught, re-verified at `9fc08078` ([TESTING.md](TESTING.md) §1).

The audit ran six mutation probes across six subsystems. **All six survived.**
Until that changes, no coverage number in this repo means anything.

1. **Kill the six known-surviving mutants.** Each one names the exact one-line
   edit and the exact test file that should have gone red — see
   [TESTING.md](TESTING.md) §1. For each: write the assertion that catches it,
   verify it fails with the mutation applied, revert, confirm it passes.
2. **Coverage ratchet.** `pnpm metrics:check` already tracks
   `coverage_lines_pct` / `functions` / `branches` against the frozen baseline
   and CI now runs it. Extend coverage to `packages/core`, which holds the
   highest-risk untested code in the repo.
3. **Move coverage config out of CLI flags** into `test.coverage` in the vitest
   configs, so an IDE run and a CI run measure the same thing.
4. **Split Playwright** into a CI-safe `chromium-degraded` project matching
   `*.ci.spec.ts` and the existing local swiftshader project. Point
   `test:e2e:ci` at the former. This is the lever that makes the currently
   unenforced specs actually run.
5. **Ban green skips.** `tests/documentation.spec.ts:20` skips on a selector that
   stopped matching _during this range_, so it reports success while testing
   nothing. Fix it, and make an unexpected skip a failure.
6. **Gate `packages/landing` in CI.** Zero tests is a defensible choice; zero
   typecheck and zero build is not — neither is in the root `typecheck` or the
   CI build step.
7. **Derive the `uiCoverageRatchet` allowlist** rather than hand-maintaining it.
   It was widened twice, each time inside the commit that made widening
   necessary.

<!-- cite-check: live -->

---

## Stages 4 and 5 — folded into the refactor plan

Stages 4 and 5 were never run as stages. Some of their items were done on the
way, and a refactor plan that orders all remaining structural work took over
the rest in September 2026.

Done since the audit:

- **The two defeated lazy boundaries** (`DiffViewModal`, `AudioWiringModal`):
  fixed in #90 (`2efd73fc`); `lazyBoundaries.test.ts` holds it since #116.
- **The 8 orphan modules** reported by `pnpm arch`: deleted in #115, merge
  `14ca80ea`. `no-orphans` is an error in CI since #116.
- **Core twins**: three of the app's copies of core modules (`utils/easing.ts`,
  `utils/record.ts`, `utils/schemaUtil.ts`) re-export core since #115.
- **`TabletSplitLayout.tsx`**, dead code with a passing test: deleted in #95
  when the tablet layout was rebuilt.
- **Header comments**: `missing_header_comment` is a ratchet, so no new file
  lands without one; 999 of 1,157 files still have none.
- **The strategy document's baseline table**: corrected in WP4 (#118).

Still open, and now owned by the refactor plan, in this order:

1. **WP4** — this docs truth pass and the citation checker (#118).
2. **WP8** — command worlds.
3. **M1** — milestone.
4. **WP5.0-5.19** — the `MainWorkspace.tsx` split (4,546 lines against a target
   of about 1,500), with milestones M2 and M3 along the way. It takes in
   `WorkspaceModalsHost.tsx`, which still renders none of the modals it was
   created for.
5. **WP9** — one key router.
6. **WP6 PR A** — the `utils/timeline.ts` split.
7. **WP7** — `planGlide`, the most complex function in the tree (73).
8. **M4** — milestone.
9. **WP6 PR B**.

Not scheduled in that plan: measuring what the first route pulls at runtime
(the eager payload is 38.4 KB, [CODE-HEALTH.md](CODE-HEALTH.md) §6), the
non-discriminating assertions (four were fixed in #115), and the complexity
offenders other than `planGlide` (CODE-HEALTH.md §5).
