# Fractal Explorer — deep-zoom Mandelbrot and Julia sets on WebGPU

Status: plan, 2026-09-23. Branch `feat/mandelbrot-explorer`.

This plan answers three questions and then specifies what gets built:

1. How far can the existing chaos-game (IFS) renderer zoom, and can it draw
   the Mandelbrot or Julia sets at all?
2. Can we instead render the actual escape-time formula on the GPU, and how
   deep can it go before floating point destroys the image?
3. What was the "constant framerate, any depth" zoomer a Reddit user
   remembered, and which techniques really make deep zoom cheap?

The short answers: the IFS renderer tops out around 50–100x zoom (sample
starvation, long before f32 matters) and can only ever draw Julia _boundaries_;
a dedicated escape-time explorer built on **perturbation + rebasing + bilinear
approximation with extended-exponent deltas** has no floating-point wall at
all, and its practical limit (~1e1000 in a browser) is the cost of one
arbitrary-precision reference orbit on the CPU.

---

## 1. The IFS game: what it can and cannot do

### 1.1 Zoom limits of the chaos-game renderer

Measured from the code, not guessed (1920x1080 canvas):

| Limit                  | Where                                                     | Zoom where it bites                               |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Product clamp          | `MAX_CAMERA_ZOOM_VALUE = 500` (`core/schema/flameSchema`) | 500                                               |
| Sample starvation      | share of samples in view ~ `zoom^-D`, `D <= 2`            | quality 0.95 at 50x, **0.55 at 500x** (noisy)     |
| f32 point quantization | `vec2f` positions, ulp 1.2e-7 near \|x\| ~ 1              | ~1e4 (moire from ~3e3)                            |
| f32 camera             | `createPosition` is `vec2f`, `Math.fround` even on CPU    | ~1e4, translation cancels at `zoom*\|c\|*3e-5` px |

Flam3 already scales its sample target with `zoom^2`
(`bucketProbabilityInv = H^2 zoom^2 / 4`), but the quality cap (~3.6e11 samples
at 1080p) is reached near 100x. So in the IFS game "deep zoom" means **at most
~100x**. Raising the clamp would only show noise.

### 1.2 Julia sets: yes, as an IFS (boundary only)

A Julia set `J_c` is the attractor of the two-map inverse IFS
`z -> +-sqrt(z - c)`. Picking the branch at random _is_ the chaos game — the
Inverse Iteration Method. This app can already express it exactly: a single
xform with pre-affine translation `-c` and the `julia` variation at weight 1
(`juliaVar` computes `+-sqrt(z)` with a random branch). For the Douady rabbit
(`c = -0.123 + 0.745i`):

```ts
preAffine:  { a: 1, b: 0, c: 0.123, d: 0, e: 1, f: -0.745 },  // z - c
postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
variations: { [vid('julia_sqrt')]: { type: 'juliaVar', weight: 1 } },
```

Caveats: the weight must be exactly 1 (otherwise it inverts `(z/w)^2 + c`,
a different set); IIM samples by harmonic measure, so cusps are starved
(Saupe's Modified IIM fixes that [30]); and it draws `J_c`, never the filled
set or its interior colouring. Zoom is bounded exactly as in §1.1.

### 1.3 The Mandelbrot set: no

`M` is a set in _parameter_ space. It is not the attractor of any IFS, so the
chaos game cannot draw it. What does fit the chaos-game architecture is the
**Buddhabrot** (a density plot of escaping orbits): a dedicated compute pass
that `atomicAdd`s orbit points into the existing `AtomicBucket` accumulation
buffer would reuse the whole density-estimation and colour-grading pipeline.
Custom WGSL variations cannot do it (no RNG, no per-chain `c`, one point per
step, no rejection). That is a separate feature (§8, later phases).

**Conclusion:** the explorer gets its own escape-time pipeline.

---

## 2. Where floating point breaks, per technique

Pixel spacing for a 1920 px view spanning 3 units at zoom 1 is
`rho = 1.56e-3 / zoom`. A method breaks where `rho` drops below what it can
resolve.

| Method                                       | Hard wall | Practical     | Limited by                                     |
| -------------------------------------------- | --------- | ------------- | ---------------------------------------------- |
| f32 direct iteration                         | 1.3e4     | 1e3–1e4       | 24-bit mantissa                                |
| double-single (f32 pair, ~48 bits)           | 2.2e11    | 1e10          | breaks under Metal fast-math / FMA contraction |
| CPU f64                                      | 7e12      | 1e13          | 53 bits                                        |
| Perturbation, f32 deltas, max-norm tests     | 1.3e35    | ~1e30         | WGSL may flush below 2^-126                    |
| Perturbation, f32 deltas, **squared** norms  | 1.4e16    | —             | `\|d\|^2` underflows at `\|d\|` ~ 1e-19        |
| **Perturbation, rescaled / floatexp deltas** | **none**  | 1e300–1e1000+ | reference orbit cost, iterations, memory       |

Double-single is ruled out: WGSL lets implementations reassociate and fuse,
Dawn compiles Metal with relaxed math, and Joldes–Muller–Popescu show the
cheap double-word addition has no error bound under cancellation — exactly
what `x^2 - y^2 + c` does [20][21][22][23]. Perturbation needs no error-free
transforms, so compiler freedom cannot break it.

---

## 3. The Reddit question: which app, and what actually carries forward

> A FractInt-era app that zoomed and panned at a constant framerate at any
> depth, "carrying the calculation start and endpoint forward".

- **Most likely XaoS** (1996, Jan Hubicka and Thomas Marsh) [1][2]. It keeps
  only the previous frame, stores one coordinate per row and per column,
  solves a linear-time dynamic program to reuse old rows/columns that land
  within ~4 pixel steps, and spends a fixed per-frame budget on the most
  important missing rows (the zoom centre first). Its authors report 120 fps
  at 320x200 on a 120 MHz Pentium, computing ~0.24% new pixels per frame.
  That is the "carry forward" memory. The "no FPU" detail fits FractInt
  (integer maths from 1988) better than XaoS, which uses `long double` [3][5].
- XaoS reuses work **across frames in screen space**; it does not make a pixel
  cheaper, so it still hits the `long double` wall near 1e16.
- The techniques that carry the calculation forward **in depth** reuse one
  high-precision orbit for every pixel:
  - **Perturbation** (K.I. Martin, 2013) [7]: iterate each pixel as a small
    difference `delta` from one reference orbit `Z`; `delta` needs no precision
    beyond the hardware's.
  - **Series approximation** (2013) [7]: skip the first N iterations with a
    polynomial in `delta_c`. Being replaced — no rigorous stopping rule, and it
    only skips a prefix.
  - **Rebasing** (Zhuoran, 2021) [9]: when the pixel orbit gets closer to 0
    than to the reference, restart the reference from iteration 0. This removes
    perturbation "glitches" with a _single_ reference.
  - **Bilinear approximation, BLA** (Zhuoran 2021, Heiland-Allen 2022)
    [11][12]: a table of affine maps that each skip `2^j` iterations while the
    delta is small enough. Deep views need ~1e5–1e7 iterations; BLA turns most
    of them into a handful of table lookups.
- The modern answer to "constant framerate at any depth" is both: reproject
  the old frame XaoS-style while perturbation + BLA refine the new one.

---

## 4. The algorithm

Notation: capitals are the high-precision reference, lower case the per-pixel
delta. Reference: `Z_0 = 0`, `Z_{m+1} = Z_m^2 + C`. Pixel parameter
`C + dc`, orbit value `z = Z_m + d`.

### 4.1 Perturbation with rebasing [7][9][12]

Each step:

1. `d <- 2 Z_m d + d^2 + dc`, `m <- m + 1`, `n <- n + 1`.
2. `z = Z_m + d`. If `|z| > R`, the pixel escaped at `n`.
3. If `|z| < |d|` **or** `m` is the reference's last index: `d <- z`, `m <- 0`.

Exact because `Z_0 = 0`, so the rebased delta is the pixel value itself and
`dc` is unchanged.

**Julia sets** (`c` fixed, pixel `z_0 = W + w`): the first reference is the
orbit of the view centre `W`, `d_0 = w`, and the recurrence has no `dc` term.
Rebasing needs a reference that starts at 0, so Julia carries a **second,
critical orbit** `K_0 = 0, K_{m+1} = K_m^2 + c`; the first rebase switches the
pixel to `K` for good (Heiland-Allen's multi-reference rule [11], derived for
Julia). For the Mandelbrot set both roles are the same orbit.

### 4.2 Bilinear approximation [11][12]

`d_{m+l} = A_{m,l} d_m + B_{m,l} dc`, valid while `|d_m| < R_{m,l}`.

- Single step: `A = 2 Z_m`, `B = 1` (Julia `B = 0`),
  `R = max(0, eps |A| - |B| |dc|max / |A|)`, `eps = 2^-24`.
- Merge `x` then `y`: `A = A_y A_x`, `B = A_y B_x + B_y`,
  `R = max(0, min(R_x, (R_y - |B_x| |dc|max) / |A_x|))`.
- Level `j` holds entries starting at `m = s + k 2^j` (`s = 1` for orbits that
  start at the critical point, `0` for a Julia centre orbit). Lookup at `m`:
  from level `ctz(m - s)` down, take the first entry with `|d| < R` and
  `n + l <= maxIter`; else one perturbation step. `R` shrinks with level, so a
  descending search finds the largest valid skip.
- `A`, `B`, `R` leave the f32 range at depth: all three are stored with an
  extended exponent. `R` depends on `|dc|max`, so a table built for a wider
  view is still valid (conservative) when zooming in; zooming out needs a
  rebuild, and BLA is disabled until it arrives.
- The radius is a heuristic by its author's own account, so BLA output is
  regression-tested against plain perturbation and against exact BigInt
  iteration (§6).

### 4.3 Numbers: rescaled deltas, floatexp where it matters

The GPU has f32 only. Each pixel stores `d = w * 2^e` with `w` an f32 pair and
`e` an i32 (Heiland-Allen's rescaling [10]):

- Normal step, in units of `2^e`: `w <- 2 Z w + ldexp(w*w, e) + ldexp(dc, dce - e)`.
  With `e = 0` this is _exactly_ plain f32 perturbation, so shallow views pay
  nothing; `e` only moves when `|w|` leaves `[2^-20, 2^20]`.
- Where `|Z_m| < 2^-60` (the reference passing near 0 — a minibrot nucleus at
  depth) the step switches to a full floatexp step, because `Z` itself is below
  f32 range. The reference is therefore stored as floatexp
  (`vec2f` mantissa + `i32` exponent, 16 bytes).
- Every comparison is made in the delta's own scale (`zs = ldexp(Z, Ze - e) + w`
  vs `w`), never on squared absolute magnitudes, which underflow at 1e-19.
- The per-pixel derivative `D = dz/dpixel` (for distance-estimate shading) is
  floatexp too: `D' = 2 z D + rho` (Julia: `D_0 = rho`, `D' = 2 z D`).

### 4.4 The reference orbit (CPU, Web Worker)

- BigInt fixed point with `ceil(log2 zoom) + log2(pixels) + 64` fraction bits;
  the view centre is a decimal string, so no digit is ever lost.
- Measured in V8 [research §4]: 0.21 us/iteration at 256 bits, 0.89 at 1024,
  8.8 at 4096. A 1e6-iteration reference costs ~0.4 s at 1e100, ~1 s at
  1e300, ~9 s at 1e1000 — hence a worker, sliced so a moved view cancels it.
- A reference serves while the view centre is within 1024 px of it and it
  has 64 guard bits for the current depth (it is made with 8 octaves of zoom
  to spare). Past that, it _stands in_ while the next one is computed: down
  to 32 guard bits (the kernel mirror agrees with exact iteration at 16 and
  fails at 8), and step by step, without its BLA table, once the view zooms
  out past the table's radius (`standIn` in `referencePlan.ts`).

### 4.5 Never crash the GPU

- **Time-sliced progressive iteration.** Per-pixel state (32 bytes: `w`, `D`,
  both exponents, `m` + orbit + status, `n`) persists in a storage buffer.
  Each dispatch advances every unfinished pixel by at most `K` steps (a BLA
  jump counts as one). `K` adapts to a ~10 ms frame budget from wall-clock
  frame time — the Flam3 budget idiom; timestamp queries stay off (they cause
  device loss on RDNA4).
- Windows TDR is 2 s and Chrome's GPU watchdog ~10 s [24][25]; a bounded
  dispatch never approaches either.
- An atomic counter of still-iterating pixels is read back; at zero the loop
  goes idle and the GPU does nothing.
- Device loss is already handled app-wide (`gpuStatus`, reload-only recovery).

### 4.6 Display

- **XaoS-style reprojection:** a colour pass writes a packed-RGBA display
  buffer; pixels still iterating show the previous display buffer resampled
  under the new view transform, so pan and zoom are instant and detail fills
  in.
- Separate colour pass: smooth iteration `nu = n - log2(ln|z| / ln R)` with
  `R = 2^8` [28], cyclic palette from the app's own flame palettes (OkLab a/b;
  lightness from the colour cycle and shading), optional distance-estimate
  slope shading (`DE_px = 2|z| ln|z| / |D|`). Recolouring never re-iterates
  the picture itself.
- Render resolution is capped by a pixel budget (state memory is 32 B/pixel),
  with a quality setting; the present pass upsamples to the canvas.
- **Gamut mapping:** OkLab colours outside sRGB have their chroma reduced by
  bisection (hue and lightness kept) instead of clipping per channel, which
  flattens saturated palettes into primaries.
- **Band limiting:** one colour cycle spans about `P * DE * ln2 / 2` pixels
  (the smooth count's gradient is `2 / (DE ln 2)` per pixel). Below two
  pixels the bands alias into noise, so the colour fades to the palette's
  mean, which is what they average to.
- **Supersampling:** filaments thinner than a pixel still speckle, because
  the dwell jumps between neighbouring pixels in a way no per-pixel estimate
  sees. Once a picture is finished it is refined by jittered passes (R2
  sequence, 8 on Balanced, 16 on Sharp) averaged in linear light in an
  accumulation buffer (4 x f16, 8 B/px). The centre sample's shading inputs
  are kept (16 B/px), so a colour change recolours at once, even
  mid-refinement, and only the supersamples are recomputed, after 300 ms of
  quiet. Each supersample starts from the step budget measured at full load,
  never from the larger one a pass ends on, so no dispatch runs long.

### 4.7 Measured limits we expect

| Depth       | Reference cost (1e5 iter) | Kernel path                        |
| ----------- | ------------------------- | ---------------------------------- |
| < 1e27      | < 30 ms                   | rescaled step with `e = 0` = plain |
| 1e27–1e1000 | 30 ms – 1 s               | rescaled, floatexp near nuclei     |
| > 1e1000    | not offered (clamped)     | —                                  |

The clamp (`MAX_ZOOM_LOG2 = 3320`) is a product decision, not a precision
wall. GMP-in-WASM would move it (§8).

Measured on the branch (1280 x 800, Radeon RDNA 4, headed Chrome, after the
reference orbit; "refined" is the time to all 8 samples):

| View                        | Iterations | Picture | Refined |
| --------------------------- | ---------- | ------- | ------- |
| Home                        | 1 000      | 38 ms   | 146 ms  |
| Seahorse valley, 1e24       | 20 000     | 114 ms  | 0.76 s  |
| Seahorse valley, 1e75       | 40 000     | 214 ms  | 1.47 s  |
| Minibrot nucleus, 1e15      | 30 000     | 105 ms  | 0.68 s  |
| Rabbit Julia, 1e50          | 2 000      | 31 ms   | 73 ms   |
| Airplane Julia, 1e30        | 3 000      | 41 ms   | 175 ms  |
| Mandelbrot, 1e903 and 1e999 | 100 000    | 12 ms   | 31 ms   |

GPU results were compared per pixel against the CPU mirror at every depth
above (200 samples each, at the supersample's own offset): 1 400 of 1 406
agree exactly, and the other six differ by one or two iterations, all within
1/64 of a pixel of the boundary (fused multiply-add and reassociation on the
GPU).

---

## 5. What gets built (this branch)

### 5.1 Pure maths — `packages/core/src/deepzoom/`

| File                | Contents                                                           |
| ------------------- | ------------------------------------------------------------------ |
| `bigFixed.ts`       | BigInt fixed point: exact decimal parse/format, double conversion  |
| `deepZoomView.ts`   | Camera: centre strings + `zoomLog2`; pan, zoom-at-pointer, offsets |
| `referenceOrbit.ts` | Sliced BigInt orbit generator, floatexp output                     |
| `floatExp.ts`       | Floatexp primitives shared by the BLA, the packing and the mirror  |
| `bla.ts`            | BLA table build (floatexp), level layout, GPU packing              |
| `perturbation.ts`   | CPU mirror of the GPU kernel with f32 emulation — the test oracle  |
| `explorerUrl.ts`    | View <-> URL fragment (`#re=..&im=..&z=..`), validated             |
| `referencePlan.ts`  | When a reference serves or stands in; backdrop reprojection        |

All colocated tests; the kernel mirror is checked against exact BigInt
per-pixel iteration at 1e5, 1e25, 1e45 and near a minibrot nucleus, with and
without BLA, for both set kinds.

### 5.2 App — `packages/app/src/pages/FractalExplorer/`

| File                       | Contents                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `FractalExplorerApp.tsx`   | Providers, copied from `BenchmarksApp`                                                                |
| `FractalExplorerPage.tsx`  | Layout: full-bleed canvas, HUD, settings panel, save and share                                        |
| `ExplorerControls.tsx`     | The settings panel                                                                                    |
| `ExplorerRenderer.tsx`     | Inside `AutoCanvas`: frame loop, step budget, references, AA                                          |
| `explorerGpu.ts`           | Pixel state, display ping-pong, command encoding, readback                                            |
| `explorerDisplays.ts`      | The display and backdrop buffers a restart promotes and reuses                                        |
| `explorerOrbitBuffers.ts`  | Orbit and BLA buffers, never past one binding; error scopes                                           |
| `explorerSchedule.ts`      | The frame loop's next action, as a pure function; step timeout                                        |
| `explorerShaders.ts`       | Structs, layouts, the init and iterate passes                                                         |
| `explorerColourShaders.ts` | Colouring (gamut map, band limit, accumulation) and present                                           |
| `orbitUpload.ts`           | Lays both orbits and their BLA tables out in shared buffers                                           |
| `explorerInput.ts`         | Wheel, drag, pinch, double-click, keyboard -> view operations                                         |
| `orbitWorker.ts`           | Web Worker: reference orbits + BLA, cached, superseded or cancelled requests                          |
| `orbitCache.ts`            | The worker's orbit cache, capped by count and bytes, never evicting an orbit the current request uses |
| `orbitClient.ts`           | Worker requests, stale-result dropping, cancel; a worker that failed to load says so                  |
| `explorerLocation.ts`      | Location signal kept in step with the URL fragment                                                    |
| `explorerModes.ts`         | The mode changes and the two view actions, as pure functions of the location                          |
| `explorerPalette.ts`       | App palette -> mirrored OkLab (a, b) lookup table                                                     |
| `JuliaMarker.tsx`          | The split view's point: the Julia constant, dragged on the set                                        |
| `explorerScrub.ts`         | What a sideways drag does to c and to the iteration limit                                             |

Routing: `/explore` (new branch in `index.tsx`, `routing/appPath.ts`, a
trailing-slash redirect in the Cloudflare worker). `PAGE_ROUTES` is the one
list of page routes the build and the worker share, and a static host's
`/explore/index.html` is read as `/explore`. Entry points: the desktop
version menu next to Benchmark Lab, and the shared More menu. View state lives
in the URL **fragment** (never sent to the server or GA).

Controls as built: Mandelbrot / Julia / Both; "Julia set of the view
centre"; the Julia constant; iteration limit (halve, double, or type); the
number fields also scrub when dragged sideways (`utils/createInputScrub.ts`:
c by 0.001/px, the limit doubling every 100 px, Shift ten times finer, a
press without a drag types, and a finger may drift 10 px before a scrub
starts where a mouse or pen may drift 4); palette
(`PaletteSelector`), colour cycle and shift; relief (distance shading);
quality (pixel budget and supersamples); home; copy link; save PNG. Readout:
magnification, progress (Reference while an orbit is on its way, Error once
the picture has stopped). Input: wheel zooms at the pointer,
drag pans, pinch, double-click zooms in (Shift: out), `+`/`-`/arrows. Not
built yet: automatic iteration limit from depth, a BLA toggle, copy
coordinates, `r`/`j` shortcuts.

Split view ("Both", or the HUD toggle): the Mandelbrot set beside the Julia
set of a point, stacked on a portrait screen. The point is a ring on the
Mandelbrot pane; drag it, move it with the arrow keys, or drag with the
right mouse button (or a pen's barrel button) anywhere on the pane, as
maff's thesis version did, and the Julia pane redraws as it moves. Only the
primary button pans, whatever the pointer.

- Each pane is its own `ExplorerRenderer` with its own worker, and each gets
  half the pixel budget, so the split costs what one full view does. The
  Mandelbrot pane's restart key leaves c out, so moving the point never
  restarts it.
- The ring works in CSS pixels from the pane centre through the core's
  `pointAt` and `centerOffsetPixels`, so c is exact at any depth. Off screen,
  the ring waits at the nearest edge.
- The link carries both panes: `split=1`, the Mandelbrot view in
  `re`/`im`/`z`, the point in `cre`/`cim` and the Julia pane's view in
  `jre`/`jim`/`jz`.
- Measured in headed Chrome (RDNA 4, 617 x 900 px per pane, 1000
  iterations): while the point is dragged at 60 Hz, the Julia pane finishes
  a full pass after 37 of 40 moves, 5-9 ms each, and the Mandelbrot pane
  takes no steps.

---

## 6. Verification

- `pnpm check`, core + app vitest.
- Kernel correctness is proven on the CPU mirror, not on the GPU: escape
  counts must match exact BigInt iteration for sampled pixels (tolerance: the
  count may differ by one only for pixels within a pixel of the boundary).
- WebGPU visually via the headed-Chrome script (`pnpm verify:webgpu` with the
  new route), never `playwright test` (swiftshader fakes device loss).
- Manual: zoom to >1e40 at a seahorse-valley point and near a minibrot, check
  no seams, no blocky pixels, no NaN colours, no device loss, idle GPU when
  finished.

## 7. Risks

| Risk                                         | Mitigation                                                 |
| -------------------------------------------- | ---------------------------------------------------------- |
| BLA radius heuristic lets a bad skip through | Tested against exact iteration, CPU mirror and GPU         |
| Backend flushes / fast-math surprise         | No error-free transforms; comparisons in scaled units      |
| 32 B/pixel state on 4K screens               | Pixel budget from device limits; quality setting           |
| Reference orbit slow at 1e1000               | Worker, sliced, cancellable; old reference keeps rendering |
| TypeGPU WGSL-string tracing across modules   | Kernel helpers defined in the one module that uses them    |

## 8. Later phases

1. **Minibrot finder**: period from atom domains, Newton on `z_p(c) = 0` in
   BigInt [29]; also the natural reference for interior-heavy views.
2. **Linked Julia preview**: built as the split view (§5.2), after maff's
   thesis version (`~/Documents/root/1-Projects/fractals-final`,
   `js/initJulia&Mandelbrot.js`).
3. **Buddhabrot in the chaos-game pipeline** (§1.3), and an IIM/MIIM Julia
   example flame (§1.2).
4. Zoom-video export (keyframed `zoomLog2`, reusing the export jobs),
   high-resolution PNG export by tiles.
5. Interior detection by `|dz/dz_1| < 1e-3`, histogram colouring, stripe
   average colouring.
6. GMP-in-WASM reference for depths past 1e1000; WebMCP tools
   (`explorer.goto`, `explorer.zoom`).

## References

1. XaoS Developer's Guide (J. Hubicka) — https://github.com/xaos-project/XaoS/wiki/Developer's-Guide
2. XaoS wiki — https://github.com/xaos-project/XaoS/wiki
3. XaoS `config.h` (`number_t`) — https://github.com/xaos-project/XaoS/blob/master/src/include/config.h
4. Fractint — https://en.wikipedia.org/wiki/Fractint
5. K.I. Martin, "SuperFractalThing Maths" (2013) — https://web.archive.org/web/20140628114658/http://www.superfractalthing.co.nf/sft_maths.pdf
6. Pauldelbrot, perturbation glitch detection (2014) — https://web.archive.org/web/20210507013958/https://www.fractalforums.com/announcements-and-news/pertubation-theory-glitches-improvement/
7. Zhuoran et al., "Another solution to perturbation glitches" (2021) — https://web.archive.org/web/20230125202704/https://fractalforums.org/f/28/t/4360
8. C. Heiland-Allen, "Deep zoom theory and practice" (2021) — https://mathr.co.uk/blog/2021-05-14_deep_zoom_theory_and_practice.html
9. C. Heiland-Allen, "Deep zoom theory and practice (again)" (2022) — https://mathr.co.uk/blog/2022-02-21_deep_zoom_theory_and_practice_again.html
10. C. Heiland-Allen, "Deep Zoom" (2024) — https://mathr.co.uk/web/deep-zoom.html
11. Imagina (Zhuoran, AGPL-3.0) — https://github.com/5E-324/Imagina
12. Kalles Fraktaler 2+ manual — https://mathr.co.uk/kf/kf.html
13. Fraktaler 3 — https://fraktaler.mathr.co.uk/
14. T.J. Dekker, Numer. Math. 18 (1971) — https://doi.org/10.1007/bf01397083
15. A. Thall, SIGGRAPH 2006 — https://doi.org/10.1145/1179622.1179682
16. Joldes, Muller, Popescu, ACM TOMS 44(2) (2017) — https://doi.org/10.1145/3121432
17. WGSL spec, floating-point evaluation, `ldexp`/`frexp` — https://www.w3.org/TR/WGSL/
18. Dawn Metal/D3D12 shader compilation — https://github.com/google/dawn
19. luma.gl, GPU floating-point precision — https://luma.gl/docs/api-guide/shaders/gpu-floating-point-precision
20. Microsoft, TDR — https://learn.microsoft.com/en-us/windows-hardware/drivers/display/timeout-detection-and-recovery
21. B. Jones, WebGPU device loss — https://toji.dev/webgpu-best-practices/device-loss.html
22. Plotting algorithms for the Mandelbrot set — https://en.wikipedia.org/wiki/Plotting_algorithms_for_the_Mandelbrot_set
23. C. Heiland-Allen, practical interior distance rendering (2014) — https://mathr.co.uk/blog/2014-11-02_practical_interior_distance_rendering.html
24. D. Saupe, Physica D 28 (1987), MIIM — https://doi.org/10.1016/0167-2789(87)90024-8

Numbering follows the research notes so the gaps are deliberate. Licences
checked: XaoS GPL-2.0, Imagina / Fraktaler 3 / KF2+ AGPL-3.0 (study only; this
implementation is written from the published equations). mandeljs (MIT) and
FractalFlow (Apache-2.0) are the permissive WebGL/WebGPU prior art.
