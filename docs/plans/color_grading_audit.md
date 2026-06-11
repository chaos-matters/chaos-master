STATUS: IMPLEMENTED

# Color Grading and Compute Pipeline Audit

This report outlines the findings from the audit of the color grading (`colorGrading.ts`) and compute (`ifsPipeline.ts`) pipelines, addressing mathematical correctness, parameter behavior, and specific user questions regarding exposure, contrast, and highlight roll-off.

## 1. Exposure and Contrast Duplication

**User Question:** "When using estimator curve, highlight power, vibrancy, gamma, contrast (exposure, is it duplicate for contrast or not?)"

**Finding:** Yes, historically, exposure and contrast were **exact mathematical duplicates**. 
In the previous implementation:
```typescript
const tonemapped = mul(mul(uniforms.exposure, uniforms.contrast), logDensity)
```
Because they were multiplied together before acting on the logarithmic density, adjusting `exposure` had the exact same mathematical effect as adjusting `contrast`.

**Resolution (Breaking Change):** 
I have updated the math so they work differently, as requested.
*   **Exposure:** Now acts as a true exposure multiplier on the **linear** point count *before* the logarithm is applied (`adjustedCount * exposure`). This linearly scales the amount of "light" collected by the bucket.
*   **Contrast:** Now acts as a multiplier on the **logarithmic** density (`logDensity * contrast`). Mathematically, multiplying a log value is equivalent to applying a power curve (`x^contrast`) to the linear density, which correctly shifts the structural contrast without uniformly blowing out the image.

## 2. Highlight Power (Highlight Roll-off) Bug

**Finding:** The `highlightPower` feature (which is meant to gracefully desaturate areas of the flame that exceed maximum brightness, preserving structural detail instead of clipping to white) was completely non-functional due to a clamping error.

In the previous implementation:
```typescript
const value = clamp(pow(saturate(tonemapped), ...), 0, 2)
```
The `saturate()` function clamped the tonemapped value to a maximum of `1.0` *before* gamma correction. Because the value could never exceed `1.0`, the out-of-gamut detection logic (`maxChan > 1.0`) never triggered, and `excess` was always `0`.

**Resolution:** 
I removed the `saturate()` wrapper, replacing it with `max(tonemapped, 0)` to prevent undefined `pow` behavior on negative numbers. The value is now allowed to organically exceed `1.0` and hit the outer `clamp(..., 0, 2)`. The highlight desaturation logic now functions correctly, gracefully rolling off extreme highlights based on the `highlightPower` uniform.

## 3. Vibrancy and Gamma

**Finding:** Both `vibrancy` and `gamma` were implemented correctly and needed no changes.
*   **Vibrancy:** Acts as a direct saturation multiplier on the OkLab `a` and `b` chroma channels (`finalAb = finalAb * vibrancy`), which is a mathematically sound way to boost saturation without shifting perceived lightness.
*   **Gamma:** Applies the standard power curve `pow(value, 1/gamma)`.

## 4. Compute Pipeline (`ifsPipeline.ts`)

**Finding:** The core compute pipeline is mathematically sound. 
*   It correctly dispatches `pointCountPerBatch / (64 * 64)` workgroups.
*   The fixed-point accumulation (`BUCKET_FIXED_POINT_MULTIPLIER`) correctly maps floating-point color and density into 32-bit atomic integers without race conditions or overflow.
*   The `AutoCanvas` coordinate mapping to clip space and screen space is completely standard.

## Summary of Changes

1.  **Fixed Hardware Tier Throttle:** Fixed the CSS of the benchmark container (`opacity: 0` -> `opacity: 0.01`, `1x1` -> `10x10`) to prevent Chromium from throttling `requestAnimationFrame` to 1 FPS for hidden elements. This was causing high-end GPUs to falsely score as `low`.
2.  **Fixed Performance Fallback Throttle:** Changed the `Math.max` clamp in `createTimestampQuery.ts` fallback from `0.1ms` to `0.001ms`. The `0.1ms` clamp artificially limited the dynamic workload scaler on high-refresh-rate monitors when `TRACK_PERFORMANCE` was disabled.
3.  **Color Grading Math Corrections:** 
    *   Separated `exposure` (linear multiplier) and `contrast` (logarithmic multiplier).
    *   Fixed highlight roll-off by removing premature saturation of HDR values.
