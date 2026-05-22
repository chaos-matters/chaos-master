# Tonemapping Fix Plan — Match flam3 Reference

## Problem

Our current color grading shader (`colorGrading.ts`) produces images with:
- Weak depth/contrast at high skip iterations
- Palette coloring (vibrancy) has minimal visible effect
- Exposure doesn't map linearly to flam3's brightness
- Colors look flat compared to reference flam3 renders of the same genome

Root cause: Our single-pass fragment shader deviates from flam3's multi-pass pipeline
in several fundamental ways.

## flam3 Reference Pipeline (from rect.c + palettes.c)

### Step 1: Bucket Accumulation (IFS iteration)

Points are scattered into a 2D histogram. Each bucket is `short[4]`: `[R, G, B, count]`.
The R/G/B channels are accumulated color values (not averaged), and count is
accumulated alpha/opacity.

### Step 2: Log-Density Tone Mapping (rect.c:140)

```
ls = filter_coef * (k1 * log(1.0 + c[3] * k2)) / c[3]
```

Where:
- `k1 = (contrast * brightness * PREFILTER_WHITE * 268.0 * batch_filter) / 256`
- `k2 = (oversample² * nbatches) / (contrast * area * WHITE_LEVEL * sample_density * sumfilt)`
- `PREFILTER_WHITE = 255`
- `sample_density` = quality (points per pixel)
- `area` = `image_width * image_height / (ppux * ppuy)` (world-space area)

Each bucket's color channels are scaled by `ls`, producing a log-mapped color value.
This is additive — buckets from multiple sub-batches are summed into an `abucket` accumulator.

### Step 3: Density Estimation Filter (rect.c:78-174)

For each output pixel, sum counts over a `ss×ss` neighborhood (oversample kernel).
The summed count `f_select` is mapped through a curve:
```
f_select_int = DE_THRESH + floor(pow(f_select - DE_THRESH, estimator_curve))
```
This index selects a filter kernel with specific width and coefficients.

The filter convolves the tone-mapped buckets from Step 2 using the selected kernel's
coefficients, producing the final `abucket` accumulator.

### Step 4: Gamma + Vibrancy + Final Output (rect.c:1067-1245)

After all sub-batches, the `abucket` accumulator is processed:

```
g = 1.0 / mean_gamma          // gamma correction exponent
alpha = flam3_calc_alpha(density/255, g, linrange)
ls = vibrancy * 256 * alpha / density
newrgb = flam3_calc_newrgb(t, ls, highlight_power)   // color with highlight protection

For each channel:
  a = newrgb[i] + (1.0 - vibrancy) * 256 * pow(t[i]/255, g)
  a += (1.0 - alpha) * background[i]
  clamp(a, 0, 255)
```

**flam3_calc_alpha** (palettes.c:274):
```
if density < linrange:
  frac = density / linrange
  alpha = (1-frac) * density * (linrange^g / linrange) + frac * density^g
else:
  alpha = density^g
```

**flam3_calc_newrgb** (palettes.c:292):
If any channel exceeds 255 after `ls` scaling:
- Reduce `ls` to bring the brightest channel to exactly 255
- Reduce saturation in HSV space by `pow(newls/ls, highlight_power)`
This prevents hue shift in saturated pixels.

### Step 5: Spatial Filter (rect.c:1137-1160)

A final convolution over the output with a spatial filter kernel, producing the
image pixels.

## Our Current Pipeline (colorGrading.ts)

Single-pass fragment shader:
1. Read `tex = accumulationBuffer[xy]`
2. `count = tex.count * FIXED_POINT_MULTIPLIER_INV`
3. `texColorAb = (color.a, color.b) / count` — averaged color
4. `adjustedCount = count * avgPointCountPerBucketInv * 0.1`
5. `density = clamp(log(adjustedCount + 1), 0, 1)`
6. Palette lookup from log-density via nearest-neighbor
7. `finalAb = mix(texColorAb, paletteAb, vibrancyBlend)`
8. `value = exposure * pow(log(adjustedCount + 1), 0.4545)`
9. OKLab → RGB conversion
10. Alpha blend with background

## Key Differences

| Aspect | flam3 | Ours | Impact |
|--------|-------|------|--------|
| Tone curve | `k1 * log(1 + count*k2) / count` | `pow(log(count_norm + 1), 0.4545)` | Different shape |
| k2 normalization | Accounts for quality, area, oversample | `avgPointCountPerBucketInv * 0.1` | Wrong scaling |
| Gamma | Adjustable (from `gamma` param) | Hardcoded `0.4545` (γ=2.2) | No user control |
| Highlight protection | HSV saturation reduction | None | Clipped brights |
| DE filter | Full multi-pass kernel | None | Softness missing |
| Vibrancy channels | Blends R, G, B independently | Blends only a,b (OKLab chroma) | Incorrect blending |
| Brightness value | Separate from color chroma | OKLab `L` channel | OKLab correct but different |
| Spatial filter | Convolution after tonemapping | None | Jagged edges |
| skipIters effect | Reduces effective sample_density (k2 normalizes) | Only affects IFS loop | Loss of contrast at high skip |
| Batch accumulation | Temporal + batch filters | Single batch | No temporal smoothing |

## Fix Plan

### Phase 1: Add `contrast` and `highlight_power` Parameters

No schema changes needed — these exist in flam3 genomes. Just pass them through to
the shader.

**File**: `flameSchema.ts` — add `contrast: number` and `highlightPower: number` to
RendererSettings (or use existing gam_lin_thresh / gamma fields).

### Phase 2: Rewrite k1/k2 Normalization in Flam3.tsx

**File**: `Flam3.tsx`, in the section where color grading uniforms are computed:

```ts
// Compute area in world-space units
const scale = Math.pow(2, flame.renderSettings.camera.zoom)
const ppux = flame.renderSettings.resolution * scale
const area = (flame.renderSettings.width * flame.renderSettings.height) / (ppux * ppux)

// Match flam3's k2 formula
const k2 = (oversample² * nbatches) /
  (contrast * area * WHITE_LEVEL * quality * temporalFilterSum)
const k1 = (contrast * brightness * 255 * 268) / 256
```

Pass k1 and k2 as uniforms to the shader.

### Phase 3: Rewrite Fragment Shader Tonemapping

**File**: `colorGrading.ts`:

Replace the single-step value formula with flam3's multi-step pipeline:

```wgsl
// Read bucket
let c = vec4f(f32(tex.count), texColorAb) * FIXED_POINT_INV

// Log-density tonemapping
let ls = uniforms.k1 * log(1.0 + c.w * uniforms.k2) / c.w
let tonemapped = vec4f(c.xyz * ls, c.w * ls)

// Add to accumulator (or just use directly for single-pass)
// Gamma
let g = 1.0 / uniforms.gamma
let density = tonemapped.w / 255.0
var alpha = 0.0
if density < linrange:
  let frac = density / linrange
  alpha = (1-frac) * density * (linrange^g / linrange) + frac * density^g
else:
  alpha = density^g

let ls2 = uniforms.vibrancy * 256.0 * alpha / density
```

### Phase 4: Add Highlight Power Protection

In the fragment shader, after computing the vibrancy-scaled color:

```wgsl
// If any channel > 255, reduce ls and desaturate
if max(tonemapped.xyz) > 255.0:
  let newls = 255.0 / maxChannel
  let lsratio = pow(newls / ls, highlight_power)
  // reduce saturation by lsratio in HSV
```

### Phase 5: Add Sample-Density Feedback for skipIters

In `Flam3.tsx`, scale `quality` by effective point yield when skipIters is high.
Each iteration skips `skipIters` warmup points — this reduces actual bucket density.
The k2 formula should account for this:

```ts
const effectiveQuality = quality / (1 + skipIters * 0.1)
```

Or track actual average points hitting buckets and pass that ratio to k2.

### Phase 6: Re-enable palette speed/phase Parameters

Wire `palettePhase` and `paletteSpeed` through to the shader properly so the
density-to-palette mapping is controllable.

### Phase 7: Add Spatial Filter (Optional, GPU-friendly)

A simple 3×3 or 5×5 box filter or gaussian kernel applied after tonemapping
would smooth jagged edges. This should be toggleable (Performance vs Quality).

## Verification

1. Render example flames side-by-side with reference flam3 renders at same
   quality/brightness/gamma settings
2. Test skipIters=1 vs skipIters=50 — contrast should remain similar
3. Test vibrancy at 0, 0.5, 1.0 — visible difference across range
4. Test highlight power with very bright flames — hue shifts prevented
5. Performance: fragment shader complexity increase should be modest
   (few extra multiply-adds, one extra log)

## Implementation Order

| # | Phase | Effort Estimate |
|---|-------|-----------------|
| 1 | Add contrast/highlight_power to schema | Small |
| 2 | Rewrite k1/k2 normalization | Medium |
| 3 | Rewrite fragment shader tonemapping | Large |
| 4 | Add highlight power protection | Medium |
| 5 | skipIters sample-density feedback | Small |
| 6 | Wire palette speed/phase | Medium |
| 7 | Spatial filter (optional) | Medium |
