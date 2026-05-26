# flam3 vs chaos-master-fp: Comparison Report

## Status: COMPLETED (May 2026)

This report compares our implementation against the original flam3 C codebase by Scott Draves. The flam3 source is available as a git remote:

```bash
git show flam3/master:flam3.c | less          # main renderer
git show flam3/master:flam3.h | less          # header / structs
git show flam3/master:rect.c  | less          # density estimation code
git log flam3/master --oneline                # commit history
```

---

## Symmetry

### How flam3 implements it

Symmetry is **purely structural** -- it adds transforms to the genome. There is no special "symmetry mode" in the renderer. The `int symmetry` field on the genome is just bookkeeping metadata.

**Positive N (Rotational):**
- Adds N-1 rotation transforms, each rotating by `2*PI*k/N`
- `linear` variation only, weight = sum of all other weights
- `color_speed = 0` (critical -- prevents color washing)

**Negative N (Dihedral = rotation + reflection):**
- `-1` = mirror only (reflection across x-axis: `a=-1, e=1`)
- `-N` (N>1) = full dihedral group: N-1 rotations plus a reflection transform

### Our implementation status

| Aspect | flam3 | Ours | Status |
|--------|-------|------|--------|
| N-1 rotation transforms | Yes | Yes | Done |
| `colorSpeed: 0` | Yes | Yes | Done |
| `linear` variation | Yes | Yes | Done |
| Dihedral (reflection) | Negative N | Toggle | Done |
| Weight = sum(others) | Yes | Yes | Done |
| `symmetry` metadata field | Yes | No | Low priority |
| `animate` field | Yes | No | Low priority |
| Collapsible UI group | N/A | Yes | Done |

---

## Density Estimation

### flam3 approach (from `rect.c` and wiki)

1. Accumulate samples into a 2D histogram (buckets)
2. Per-pixel adaptive blur radius: `radius = K * pow(density, -estimator_curve)`
3. Gaussian kernel convolution with per-pixel radius
4. Tone-map using `k1 * log(1 + count * k2)`

Key parameters: `estimator` (max radius), `estimator_minimum` (min radius), `estimator_curve` (exponent, default ~0.5)

### Our approach

1. Same histogram accumulation via IFS compute shader
2. **3x3 neighborhood averaging** of density before computing sigma (improvement)
3. `sigma = qualityK * pow(avgDensity, -estimatorCurve)`, clamped to [0.5, 12]
4. **Separable 2D Gaussian** (H+V passes) -- same math as flam3, O(R) vs O(R^2)

### Comparison

| Aspect | flam3 | Ours | Verdict |
|--------|-------|------|---------|
| Core formula | `K * pow(density, -curve)` | Same | Identical |
| Kernel | Gaussian (non-separable) | Gaussian (separable) | Ours is better perf |
| Density source | Raw pixel count | 3x3 averaged count | Ours is smoother |
| Estimator curve | Configurable | Configurable (0.1-1.0) | Done |
| Min/Max radius | Per-flame params | Hardcoded [0.5, 12] | Future work |
| Color space | RGBA float | OkLab + count (fixed-point) | Different but valid |
| Supersampling | Yes | No | Future work |

**Verdict:** Our density estimation is architecturally faithful to flam3. The core formula is identical. Our separable Gaussian and 3x3 density smoothing are genuine improvements.

---

## Future work

- Expose `estimator_minimum` (min kernel radius) as advanced parameter
- Expose `estimator` (max kernel radius, currently hardcoded to 12)
- Supersampling support
- `animate` metadata on symmetry transforms
- Inline symmetry UX (replace modal with inline stepper)
