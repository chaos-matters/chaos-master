# flam3 Density Estimation Implementation Plan

## Background

Scott Draves' flam3 paper (Section C: "High resolution and density estimation") describes a technique that produces smooth, high-quality renders by making each sample contribute roughly equal visual weight regardless of local sampling density.

### How flam3 works

1. **Per-sample density estimation** — Track a spatial histogram of where samples land during the chaos game
2. **Adaptive filter kernel per sample** — Each sample is splatted with a Gaussian/spline kernel whose radius is inversely proportional to local density:
   - High density → small kernel (sharp detail preserved)
   - Low density → large kernel (fills gaps, reduces noise)
3. **Formula**: `filter_radius = K / sqrt(local_density)` where K is a quality parameter
4. **Result**: Both dense cores and sparse tails render with balanced brightness and clarity

### What we currently have

| Aspect | flam3 | Ours |
|--------|-------|------|
| Filter timing | During/post accumulation | Post-process only |
| Kernel | Variable-width per-pixel | Fixed 5x5 spatial blur |
| Radius formula | `K / sqrt(density)` | `sqrt(count)` weight blend |
| Density source | Spatial histogram | Bucket count (same pixel) |

Our `blurPipeline.ts` does a fixed-neighborhood average weighted by count similarity. It approximates the flam3 result but isn't theoretically equivalent — it can't widen the kernel enough for very sparse regions without also blurring boundaries.

## Proposed implementation: Post-process variable-width filter

flam3's reference implementation actually computes density as a post-process over accumulated buckets (not at splat time). We'll do the same — this avoids changing the IFS compute pipeline.

### Architecture

```
IFS accumulation → Density estimation pass → Separable Gaussian blur (variable width) → Color grading
     (existing)          (NEW)                        (NEW)                              (existing)
```

### Phase 1: Density estimation compute pass

**New file**: `packages/app/src/flame/densityEstimationPipeline.ts`

A compute shader that reads the accumulation buffer and estimates local density at each pixel:

```
// For each pixel, compute local sample density using a spatial histogram
// over a coarse grid (e.g., 16x16 pixel blocks)
const blockSum = sum over neighboring blocks
const localDensity = max(blockSum / blockArea, 1.0)

// Compute filter sigma: wider kernel for sparse regions
const sigma = K / sqrt(localDensity)  // K = quality parameter
// Clamp sigma to [0.5, maxRadius] pixels
```

Output: a `FilterParams` buffer (one per pixel) containing `sigma` (filter width).

Alternative simpler approach: use the bucket count directly as a density proxy (since count IS samples per pixel). The spatial histogram averaging over blocks just smooths the density estimate to avoid discontinuities.

### Phase 2: Variable-width separable Gaussian blur

**New file**: `packages/app/src/flame/adaptiveBlurPipeline.ts`

Two-pass separable Gaussian with per-pixel sigma:

- **Horizontal pass**: For each pixel, sample `floor(sigma * 3)` neighbors left/right weighted by `exp(-dx² / (2 * sigma²))`, normalize by sum of weights
- **Vertical pass**: Same but vertical on the horizontal pass output

This replaces the current `blurPipeline.ts` entirely when enabled.

Optimization: use a summed-area table approach if performance is an issue, or precompute Gaussian weights into a lookup texture.

### Phase 3: Integration

**File**: `packages/app/src/flame/Flam3.tsx`

- Replace `runBlur()` call with `runDensityEstimation()` + `runAdaptiveBlur()`
- Add a `densityEstimationQuality` uniform (maps to K in the sigma formula)
- Keep `adaptiveFilterEnabled` as the toggle — it now uses the new pipeline instead of the old one

### Phase 4: Quality slider

**File**: `packages/app/src/App.tsx`

Add a quality slider for the density estimation (filter kernel quality):
- Lower values = wider blurs = smoother but softer
- Higher values = tighter blurs = sharper but noisier
- Default: balanced middle ground

## Data flow

```
accumulationBuffer (Bucket[])
    │
    ▼
densityEstimationPipeline (compute)
    │  reads: accumulationBuffer
    │  writes: filterParamsBuffer (one f32 sigma per pixel)
    │
    ▼
adaptiveBlurPipeline (compute, 2 passes)
    │  reads: accumulationBuffer, filterParamsBuffer
    │  writes: postprocessBuffer (Bucket[])
    │  pass 1: horizontal Gaussian with per-pixel sigma → tempBuffer
    │  pass 2: vertical Gaussian with per-pixel sigma → postprocessBuffer
    │
    ▼
colorGradingPipeline (render)
    │  reads: postprocessBuffer (same as today when adaptiveFilterEnabled)
    │  (unchanged)
```

## Performance considerations

- The separable Gaussian at max sigma ~8px needs ~25 samples per pixel per pass ≈ 50 samples total per pixel
- At 1920x1080 = ~2M pixels, that's ~100M texture reads per frame
- Should be well within budget for a compute shader on modern GPUs
- For lower-end GPUs, cap max sigma, reduce to single-pass, or fall back to the current fixed 5x5 blur

## Files to modify

| File | Change |
|------|--------|
| `packages/app/src/flame/densityEstimationPipeline.ts` | **NEW** — Compute shader to estimate per-pixel filter sigma |
| `packages/app/src/flame/adaptiveBlurPipeline.ts` | **NEW** — Two-pass separable Gaussian with variable sigma |
| `packages/app/src/flame/types.ts` | Add `FilterParams` struct (sigma: f32) |
| `packages/app/src/flame/Flam3.tsx` | Wire new pipelines, replace `runBlur()` |
| `packages/app/src/App.tsx` | Add density estimation quality slider to sidebar |

## Verification

1. Render a flame at high quality with the new filter enabled
2. Compare side-by-side with the old fixed blur: sparse regions should be noticeably smoother, dense regions equally sharp
3. Profile GPU timings — the new filter should be within 2-3ms at 1080p
4. Verify the filter degrades gracefully at the quality extremes (no artifacts at min/max sigma)
