# Density Estimation: Estimator Curve

## Status: IMPLEMENTED

## Background

The density estimation pipeline computes per-pixel blur sigma based on local sample density. The original formula was `sigma = K / sqrt(density)`, which hardcoded the exponent to 0.5.

In flam3, this exponent is configurable via the `estimator_curve` parameter:
```
sigma = K * pow(density, -estimator_curve)
```

When `estimator_curve = 0.5`, this is mathematically identical to `K / sqrt(density)`.

## What was implemented

### 1. GPU shader (`densityEstimationPipeline.ts`)

- Added `estimatorCurve` uniform to the bind group layout
- Changed the sigma formula from `qualityK / sqrt(avgDensity)` to `qualityK * pow(avgDensity, -estimatorCurve)`
- Added `setEstimatorCurve()` method for runtime updates

### 2. Schema (`flameSchema.ts`)

- Added `estimatorCurve` field to `RenderSettings` (default: 0.5, range: 0.1-1.0)

### 3. Pipeline wiring (`Flam3.tsx`)

- Reads `estimatorCurve` from `animatedFlame().renderSettings` and passes it to the pipeline

### 4. UI (`MainWorkspace.tsx`)

- Added "Estimator Curve" slider (0.1-1.0, step 0.05) in the render settings panel
- Supports keyframe animation targeting

### 5. Timeline (`timeline.ts`)

- Added `estimatorCurve` to the `FlameDescriptor` interface and interpolation logic

## Key files

| File | Change |
|------|--------|
| `packages/app/src/flame/densityEstimationPipeline.ts` | Added uniform, changed formula |
| `packages/app/src/flame/schema/flameSchema.ts` | Added schema field |
| `packages/app/src/flame/Flam3.tsx` | Wired to pipeline |
| `packages/app/src/MainWorkspace.tsx` | UI slider + parameter targeting |
| `packages/app/src/utils/timeline.ts` | Type + interpolation |
| `packages/app/src/flame/randomize.ts` | Default for random flames |
| `packages/app/src/flame/cpuFlameRenderer.test.ts` | Test fixtures |

## flam3 comparison

| Aspect | flam3 | Ours | Status |
|--------|-------|------|--------|
| Configurable exponent | `estimator_curve` (default ~0.4-0.6) | `estimatorCurve` (default 0.5) | Done |
| Min/Max kernel radius | `estimator_minimum`, `estimator` | Hardcoded [0.5, 12] | Future |
| 3x3 density smoothing | No (raw pixel count) | Yes | Improvement over flam3 |
| Separable Gaussian | No (2D convolution) | Yes (H+V passes) | Same math, better perf |

## Effect of different curve values

- **0.1**: Very gentle blur falloff. Almost uniform blur everywhere. Good for abstract/soft looks.
- **0.5**: Default. Standard inverse-square-root relationship. Balanced sharpness.
- **1.0**: Aggressive. Sharp detail in dense areas, heavy blur in sparse areas. High contrast.

## Future improvements

- Expose `estimator_minimum` (min kernel radius) as an advanced parameter
- Expose `estimator` (max kernel radius, currently hardcoded to 12)
