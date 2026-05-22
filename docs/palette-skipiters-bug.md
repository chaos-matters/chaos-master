# Palette/SkipIters Depth Bug — Investigation

## Symptom

- At `skipIters = 1`, palette coloring produces visible depth and color variation
  across the image.
- At `skipIters = 20` (default), the image converges to flat two-color appearance —
  bright attractor regions get one palette color, everything else gets another.
- Vibrancy, paletteSpeed, and palettePhase sliders have minimal visible effect,
  especially at higher skip iterations.

## Root Cause

The issue is in three interacting parts of the pipeline:

### 1. IFS Color Accumulation During Skip Iterations

In `ifsPipeline.ts` line 126-132:

```wgsl
let point = Point()
point.position = pointInitMode()
point.color = colorInitMode(point.position)

for (let i = 0; i < insideShaderCount; i += 1) {
  point = executeRandomFlame(point)
}
```

Each call to `executeRandomFlame` applies a random transform that blends color:
`color = mix(point.color, uniforms.color, 0.4)` (transformFunction.ts:76).

With default `colorInitZero`, the color starts at (0,0) and converges toward a
weighted average of transform target colors over ~8-10 iterations. At skipIters=20,
the color is fully converged before the first bucket write — every point landing in
a bucket has essentially the same per-transform color.

With skipIters=1, the color is still close to the initial value when recorded,
giving more color variation across the image even within the same bucket.

### 2. Density Distribution Compression

High skipIters concentrate points more tightly on the attractor. The IFS attractor
has a fractal measure — some regions are visited far more often than others. Skip
iterations amplify this by discarding transient points:

- **skipIters=1**: Points scatter broadly, filling many buckets with low counts.
  Density histogram has a wide, smooth distribution.
- **skipIters=20**: Points converge to the core attractor. Few buckets get very
  high counts, most get few or none. Density histogram is bimodal — very sparse
  or very dense, with little in between.

### 3. Palette Density Mapping Saturates

In `colorGrading.ts` lines 141-163:

```wgsl
const adjustedCount = count * averagePointCountPerBucketInv * 0.1
const logDensity = clamp(log(count + 1), 0, 10)
const paletteScale = 0.02 + paletteSpeed * 0.298
const logDensityNorm = fract(logDensity * paletteScale + palettePhase)
const idx = i32(paletteEntryCount * logDensityNorm)
```

Problems:
- `logDensity` is clamped to [0, 10], but at high skipIters with concentrated
  points, most non-attractor buckets have `count < 1` → logDensity < 0.69
- The `paletteScale` at default (0.5 → 0.169) maps logDensity range [0, 0.69]
  to [0, 0.117] of the palette — using only ~11% of palette entries
- `fract()` wrapping is useless when the range is narrower than 1.0
- `adjustedCount` normalization (`* averagePointCountPerBucketInv * 0.1`) is a
  global average that doesn't compensate for distribution compression

The `paletteSpeed` slider at default 0.5 maps to `paletteScale = 0.169`. Even at
max (10), `paletteScale = 3.0`, which maps logDensity [0, 0.69] to [0, 2.07] —
spanning ~2 palette cycles at most. This is why paletteSpeed changes have minimal
visible effect.

### How flam3 Handles This Differently

flam3's tonemapping (rect.c:140):

```c
ls = filter_coef * (k1 * log(1.0 + c[3] * k2)) / c[3]
```

Where `k2` normalizes by `sample_density`:

```c
k2 = (oversample² * nbatches) /
     (contrast * area * WHITE_LEVEL * sample_density * sumfilt)
```

Key differences:
1. **k2 scales by sample_density** — higher density → smaller k2 → log argument
   stays in a consistent range regardless of point concentration
2. **Division by count** (`/ c[3]`) — the tonemapped value is per-count, not
   per-bucket, so dense buckets don't blow out
3. **Gamma is parameterized** — `g = 1.0 / (gamma / vib_gam_n)` — user controls
   the tone curve shape
4. **flam3_calc_alpha** — blends linear and power-law alpha below linrange,
   preventing the "flat two-color" look at low densities

## Fix Path

The full fix is described in `docs/tonemapping-fix-plan.md`. The specific phases
that address this bug:

| Phase | What It Fixes |
|-------|---------------|
| Phase 2 (k1/k2 normalization) | `averagePointCountPerBucketInv` replaced with flam3's k2 formula that includes quality and area |
| Phase 3 (fragment shader rewrite) | Tone curve becomes `k1*log(1+count*k2)/count` instead of `exposure*pow(log(...), 0.4545)` |
| Phase 5 (skipIters feedback) | Scale effective sample_density by skipIters to maintain consistent brightness |

### Quick Mitigation (Without Full Tonemapping Rewrite)

If the full tonemapping rewrite is deferred, the palette density mapping can be
fixed independently:

**Option A: Histogram-equalize the density**
Instead of a fixed `paletteScale`, remap logDensity so it uniformly covers [0,1]
across the image. This requires a histogram pass (expensive).

**Option B: Auto-scale paletteScale based on density range**
Track min/max logDensity per frame and set `paletteScale = 1.0 / (maxLogDensity - minLogDensity)`.
This ensures the palette always spans the full density range.

**Option C: Wider default paletteScale**
Change the default mapping to:
```wgsl
const paletteScale = 0.05 + paletteSpeed * 0.5
```
This gives a 4× wider range at default, making paletteSpeed changes more visible.

Option C is the simplest and has zero performance cost. It's a one-line change in
`colorGrading.ts` line 153-156.

## Verification

1. Render same genome at skipIters=1, 10, 20, 30 — palette coloring should
   maintain similar depth and variation across all values
2. Vibrancy slider at 0, 0.5, 1.0 should produce visibly different results
3. PaletteSpeed at 0, 5, 10 should cycle through the palette at different rates
4. Compare against reference flam3 render of same genome — visual match

## References

- `docs/tonemapping-fix-plan.md` — full tonemapping comparison and 7-phase fix plan
- flam3 `rect.c` lines 78-174 (DE filter), 140 (log-density), 933-937 (k1/k2)
- flam3 `palettes.c` lines 274-289 (flam3_calc_alpha), 292-348 (flam3_calc_newrgb)
- Our `colorGrading.ts` lines 133-197 (density normalization, palette lookup, exposure)
- Our `Flam3.tsx` lines 63-68 (bucketProbabilityInv), 401-404 (averagePointCountPerBucketInv)
