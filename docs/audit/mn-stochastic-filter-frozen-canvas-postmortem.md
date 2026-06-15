# Post-mortem: Mitchell-Netravali (MN) stochastic filter froze the canvas

**Date:** 2026-06-15
**Branch:** `feat/perf-investigation`
**Feature commit:** `a61dde0` — *feat: implement Mitchell-Netravali stochastic filter replacing adaptive blur passes*
**Severity:** High — the feature was unusable; enabling it broke camera interaction and most render settings.
**Status:** Fixed (see "Fixes applied").

---

## Summary

The MN stochastic filter ("MN" toggle in the floating toolbar) was added as a faster
replacement for the two-pass density-estimation + adaptive-blur post-process. When a
user enabled it, the canvas appeared **frozen**: panning/zooming the camera did not move
the fractal, and most sidebar render settings had no visible effect. The only thing that
changed on interaction was overall **brightness**.

The headline symptom ("camera doesn't move the image") was misleading. The camera
projection was always being applied correctly. The real defect was that the **display was
reading a GPU buffer that no longer received any writes** while MN was active, so it
showed a stale frame that was merely being re-scaled by the tone-mapper.

---

## Symptoms

- Toggle **MN** on (with the default settings) → fractal structure stops responding to
  camera pan/zoom.
- Zooming changes overall brightness; panning causes brightness flicker; structure never
  moves.
- Sidebar render settings appear to "do nothing".

## Reproduction

1. Load any 2D IFS flame (default state has the adaptive filter on).
2. Click the **MN** toggle in the floating toolbar.
3. Pan or zoom the camera → image only changes brightness, never moves.

---

## Root cause — display read an unwritten buffer

The renderer keeps two GPU buffers:

- `accumulationBuffer` — where the IFS compute shader splats points (this is where the
  MN-weighted samples land).
- `postprocessBuffer` — where the *density-estimation + adaptive-blur* passes write their
  filtered output.

The color-grading (display) stage chose its source buffer based on **`adaptiveFilterEnabled`
alone** (`packages/app/src/flame/Flam3.tsx`, `colorGradingPipeline` memo):

```js
props.adaptiveFilterEnabled
  ? typedPostprocessBuffer
  : typedAccumulationBuffer,
```

The MN commit made the adaptive-filter passes **skip** whenever MN is on
(`Flam3.tsx`, render tick):

```js
if (props.adaptiveFilterEnabled && !props.stochasticFilterEnabled) {
  runAdaptiveFilter()?.run(pass) // writes postprocessBuffer
}
```

`adaptiveFilterEnabled` **defaults to `true`** (`MainWorkspace.tsx`), and the MN toggle is
independent of it. So the moment a user enabled MN, the system entered the broken state
`adaptiveFilterEnabled && stochasticFilterEnabled`:

1. Color grading still read `postprocessBuffer` (because `adaptiveFilterEnabled` was true).
2. Nothing wrote `postprocessBuffer` anymore (the filter pass was skipped).
3. The MN splats piled into `accumulationBuffer`, which the display now ignored.

`postprocessBuffer` is never cleared in the render tick (only `accumulationBuffer` is), so
it stayed frozen at the last filtered frame.

### Why only brightness changed

Every presented frame re-runs color grading with a fresh normalization scalar:

```js
currentAveragePointCountPerBucketInv =
  (bucketProbabilityInv() / accumulatedPointCount_) * skipItersFactor
```

That scalar changes as points accumulate, and `bucketProbabilityInv` is proportional to
`zoom²`. Applied to the *frozen* `postprocessBuffer` image, it just rescaled it — so
zooming changed brightness, panning (which resets accumulation) flickered brightness, and
the structure never moved. This also explains "render settings do nothing": the whole
display was effectively a static texture multiplied by one varying scalar.

This bug only manifested when **both** `adaptiveFilterEnabled` and
`stochasticFilterEnabled` were true — which is the default the instant MN is toggled on.

---

## Secondary bug — MN accumulation weight was not energy-preserving

In `ifsPipeline.ts` (both the blend and non-blend accumulation paths), the per-sample
weight was:

```js
const accumWeight = mul(mul(wx, wy), mul(mul(filterRadius, filterRadius), 4)) // 4·R²·MN·MN
```

The offset is sampled uniformly over `[-2R, 2R]²` (pdf `= 1/(16R²)`), and the normalized
2D kernel is `MN(dx/R)·MN(dy/R)/R²`. The correct importance-sampling weight — so each
point contributes an **expected total of 1**, matching the non-MN path's `count += 1` and
the tone-mapper that divides by *dispatched* point count — is:

```
weight = kernel / pdf = (MN·MN / R²) · 16R² = 16 · MN · MN   // constant, R-independent
```

The old `4·R²·MN·MN` was both the wrong magnitude (≈1.56× too bright at the default
R = 2.5) **and** wrongly scaled with `R²`, so the "Filter Quality" slider (which feeds the
kernel radius) would have changed brightness quadratically. This was masked by the primary
bug — the display was frozen regardless — and would only have surfaced once the primary
bug was fixed.

---

## Fixes applied

1. **Display reads the live buffer when MN is on** — `Flam3.tsx`, `colorGradingPipeline`
   memo. Source selection is now:
   ```js
   props.adaptiveFilterEnabled && !props.stochasticFilterEnabled
     ? typedPostprocessBuffer
     : typedAccumulationBuffer,
   ```
   Reading `props.stochasticFilterEnabled` here also makes the memo rebuild when the MN
   toggle flips. This single change restores camera interaction and all
   accumulation-affecting settings.

2. **Energy-preserving MN weight** — `ifsPipeline.ts`, both accumulation paths:
   ```js
   const accumWeight = mul(mul(wx, wy), 16)
   ```
   Keeps MN brightness consistent with the non-MN path and decouples brightness from the
   kernel radius / quality slider.

3. **UX: disable settings that have no effect under MN.** The "Estimator Curve" slider
   only drives the (now-bypassed) density-estimation pass, so it is disabled with an
   explanatory tooltip while MN is active. A general `disabled` / `disabledReason` prop was
   added to `Slider` and `ScrubInput` (with dimmed styling) to support this.
   - The "Filter Quality" slider is **left enabled** — under MN it repurposes to control
     the kernel radius, so it still has a real effect.

---

## Verification

- `pnpm typecheck` — pass
- `pnpm validate-wgsl` — pass
- `pnpm exec eslint` on touched files — pass

Manual checks to run in-app:

- Toggle MN on with the adaptive filter on (default): camera pan/zoom moves the fractal and
  structure tracks the camera.
- Compare MN-off vs MN-on brightness on the same flame at default quality — should match
  closely.
- Sweep "Filter Quality" with MN on — kernel softness changes without large brightness
  shifts; "Estimator Curve" is greyed out with a tooltip.

---

## Lessons / follow-ups

- **A toggle that skips a pass must be reconciled with whatever consumes that pass's
  output.** The two predicates — "which pass runs" and "which buffer the display reads" —
  drifted out of sync. Consider deriving the display source from a single source of truth
  (e.g. "which buffer was last written this frame") instead of re-encoding the branch
  condition in two places.
- **New features that bypass existing passes need a state-matrix check.** The
  `adaptiveFilterEnabled × stochasticFilterEnabled` combination (true × true) — the default
  entry point — was never exercised.
- Surfacing settings that silently no-op confuses users; the new `disabled`/`disabledReason`
  Slider support should be reused for any future mode-dependent controls.
