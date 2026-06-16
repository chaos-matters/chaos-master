# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/), and the project uses
semantic versioning.

## [0.9.5]

### Performance

- Restructured the chaos-game loop to **plot every iteration after warmup**
  (env `VITE_PLOTS_PER_CHAIN`), raising measured throughput on the reference
  flame from ~5 B/s to ~17 B/s (~3.4×).
- Persist per-chain state across dispatches so the warmup/fuse is paid once per
  settle instead of every dispatch.
- Clamp hot accumulation buckets to prevent atomic overflow (garbage/dark
  pixels) in the brightest regions.
- Benchmark renders at 1024² so saturation no longer inflates the reported M/s.

### Added

- **Point Batch** render setting + slider (timeline-animatable): 16 (default)
  keeps the throughput optimization; 1 restores the classic behaviour where
  **Skip Iterations** fully controls the plotted convergence (raw → converged).
- **3D auto-exposure**: a toggle + strength slider next to Exposure that damps
  exposure as you zoom in, so 3D flames don't blow out at close range.
- **Mitchell–Netravali stochastic resampling filter** (2D + 3D), toggled from
  the action widget (now a kernel-curve icon).
- **Transform selection**: a header colour swatch selects/deselects a transform,
  Esc clears, and the non-selected transforms dim — across the affine grid,
  colour picker, sidebar cards, and the affine/colour scrub list views.
- Colour editor **grid/list toggle** and a **timeline-animatable per-transform
  colour** scrub view; randomizer can animate per-transform colours.
- Export image/PNG modal preview now shows the **blended flame**, matching the
  exported result.
- Benchmark: small/medium/large flame selector, 10B/50B/100B achievement
  badges, and download-as-PNG.
- Periodic chain re-seed (env `VITE_PERSIST_RESEED_INTERVAL`) to keep sampling
  stationary.

### Changed

- Action-widget row regrouped with subtle faded dividers
  (`[animation, timeline] | [MN, adaptive blur] | [3D, fly] | randomizers`),
  with clearer tooltips and matching first-row dividers.
- **Randomize transform colour** now draws a uniform OkLab hue, so every hue is
  equally likely (was biased toward red/orange and often out of gamut).
- Variation previews: brighter exposure/gamma floor, env-driven sampling for
  crisper thumbnails, and tuned previews for the math, corners, and circus
  variations.

### Fixed

- **Progressive darkening** of slow-mixing (few-transform) flames as points
  accumulate — chains drifting off the invariant measure under persistence are
  now bounded by the periodic re-seed.
- **3D final transform** collapsing the flame into a "pancake" when its affine
  handle was dragged (2D-identity default + 2D→3D coefficient promotion).
- Variation previews rendering with **no colour**, **contracting / losing shape**
  during accumulation, and several rendering **dark / invisible**.
- Quick-variation gallery **losing all preview thumbnails** when a category
  filter was applied.
- Colour editor: wheel-handle NaN guard on view toggle, grid/list toggle
  positioning, and floating-toolbar cleanup in the list views.
- Use-after-destroy when signalling the accumulated point count after submit.
