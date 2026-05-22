# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-05-22

### Added

- **Timeline & DopeSheet**: A massive new keyframe animation system. Animate flame transforms and variations over time using a non-linear timeline editor.
- **Auto-Animation Generator**: A one-click generative tool to automatically populate timeline tracks with smooth, mathematical interpolations and continuous rotations.
- **Export Animations**: Render animated flames frame-by-frame directly in the browser and export them as image sequences or sprite sheets.
- Advanced resize handles and UI layouts to seamlessly dock the Timeline at the bottom of the viewport.

### Changed

- Replaced old floating action widgets with a unified set of tools that seamlessly integrate the new timeline features.
- Improved Palette Selector UI with softer padding and more elegant interactive elements.

## [0.7.9] - 2026-05-18

### Added

- Point initialization modes for the IFS pipeline: random square, random disc, and Perlin noise, each configurable per-flame.
- Perlin noise variation (`perlinNoise`) in the parametric variation set.
- `GateContext` to cap the number of concurrently running WebGPU flame instances in the variation selector, preventing GPU saturation.
- VRAM usage logging utility (`vramLog`) for GPU memory diagnostics.
- `isDefined` utility helper.
- WebGPU/Firefox crash audit notes in `docs/audit/`.
- Project conventions document in `docs/audit/`.
- `sitemap.xml` for the deployed app.
- Additional built-in example flame (`example8`).

### Changed

- Variation selector now kills preview canvases once a flame reaches high render quality, reducing idle GPU load.
- Preview canvases are limited by an intersection-observer-gated concurrency pool, so off-screen thumbnails do not consume WebGPU resources.
- Point init mode is now surfaced as a selector inside the variation selector previewer.
- `AffineEditor` SVG matrix calculation guarded against non-finite values to prevent `NaN` attribute errors.
- `VariationSelector` reactivity loop fixed: store reads inside side-effects are now wrapped with `untrack`/`void` to prevent `Maximum call stack size exceeded` crashes.
- `ifsPipeline` refactored to decouple uniform updates from pipeline recompilation, reducing VRAM churn on Firefox/Linux AMD (RDNA4).
- Blur and color-grading pipelines hardened against concurrent dispatch during rapid UI interactions.
- `ComputeGate` capacity management updated for more predictable back-pressure behavior.
- `HelpModal` content and layout updated.
- Wrangler and domain configuration updated for dev and prod deployment targets.

### Fixed

- `TypeError: t is not a function` crash caused by redundant `produce()` wrappers around store setters in the variation selector.
- SVG affine transform displaying `NaN` values when camera matrix contained non-finite entries.
- Point init preview failing to update when the initialization mode was toggled, caused by incorrect `untrack` placement in `Flam3.tsx`.
- Lint warnings for declaration-vs-usage shadowing in `AffineEditor` and related components.

## [0.7.8] - 2026-05-17

### Added

- Deployment scripts for dev and prod environments.
- In-app changelog viewer.

## [0.7.0] - 2026-04-10

### Added

- WebGPU based IFS Flame Generator core.
- Affine transform editor.
- Variation selector with real-time preview.
- Support for multiple variations per transform.
- Exposure and skip iterations controls.
- Color initialization modes.
- Dark and light theme support.
- Export to PNG with embedded flame metadata.
- Shareable links with state encoded in URL.

## [0.6.0] - 2026-02-15

### Changed

- Improved rendering performance using TypeGPU.
- Refactored IFS pipeline for better scalability.

## [0.5.0] - 2025-12-20

### Added

- Basic histogram rendering pipeline.
- Quality presets (Low, Medium, High, Ultra).

## [0.4.0] - 2025-11-10

### Added

- Support for parametric variations.
- Undo/Redo history for flame state.

## [0.3.0] - 2025-09-25

### Added

- Drag and drop support for loading flames from PNGs.
- Basic variation set (linear, sinusoidal, spherical, swirl).

## [0.2.0] - 2025-08-15

### Added

- View controls (zoom, pan, pixel ratio).
- Background color selection.

## [0.1.0] - 2025-07-01

### Added

- Initial prototype of the flame generator.
- Basic UI with Solid.js.
