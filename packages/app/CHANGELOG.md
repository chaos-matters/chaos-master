# Changelog

What's new in Chaos Master. Concise highlights for each release; the full
developer history lives in `dev.changelog.md`.

## [0.10.0] - 2026-06-26

### Added

- **Share custom variations**: when you share a flame that uses your own math/WGSL variations, the variations now travel inside the link. The recipient's app re-checks the code and shows a live preview before anything is saved, and they can pick which ones to keep.
- **Share a single variation** as its own link — from the Custom Variations list or the new Share button in the variation editor. Opening it shows a preview and a one-click save.
- **Custom marker** on a transform's variations: a small dot flags custom ones, turning red if a flame still references one you've deleted.

### Changed

- Custom variations now show their **name** everywhere — the variation browser, the transform list, and search — instead of an internal id.
- **Brighter custom-variation previews** that match the variation gallery.
- Loops in custom variations must now be **bounded** (a fixed counted `for`); unbounded loops are rejected so a variation can't hang the GPU.
- Custom variations are **left out of flam3 (.flame) XML export** — they have no Apophysis/flam3 equivalent — and you're told when any were omitted.

### Fixed

- **Math Mode tutorial**: equations no longer flash and collapse to a line, and inline math inside tables now renders correctly.

## [0.9.1] - 2026-06-25

### Added

- **Variation documentation**: an in-app reference for every variation — its formula, its parameters (with type and range), and the actual 2D / 3D WGSL — plus IFS and API guides. Open it from the docs pill in the variation browser.
- **Home-page link** to the Chaos Master site from the Help / About panel.

### Changed

- The **Load Flame** dialog now scrolls as one piece — the upload / drop zone is no longer pinned, so the gallery gets more room on phones and tablets.
- Slimmer keyboard-focus outline, tinted to match the app instead of the old chunky purple ring.
- Reordered the transform buttons to **New transform → Add symmetry → Migration**.
- The floating bottom-right controls (Benchmark, Docs, version / About) now sit together on one tidy row.

### Fixed

- The Migration import-warnings list now scrolls instead of overflowing when a file has many warnings.
- The timeline now shows the held frame after you release a scrub, not just the frame number.

## [0.9.0] - 2026-06-20

### Added

- **3D fractal flames** — render, orbit and explore IFS flames in three dimensions.
- **Fly mode**: first-person flight _through_ a 3D flame with WASD / Q / E.
- **Morph** one flame into another along the timeline.
- **Seamless** and **Cycle** loop styles for GIF-style animation without extra keyframes.
- **Smooth keyframes**: Linear, Spline and Constant interpolation, with a **Curve editor**.
- **Smart Animate**: one-click, designed-feeling animation loops.
- **Randomizer gallery**: browse random flames and click to apply, with mutation "breeding".
- **Background exports** that keep running while you edit, at 1K–4K and any aspect ratio.
- New 3D examples, animated presets, and the **Clifford Reverie** flame.

### Changed

- **Much faster rendering**, tunable with the new **Point Batch** setting.
- **Share to Discord** is now bot-protected.

### Fixed

- Sharper, brighter, more reliable variation thumbnails.
- Smoother timeline scrubbing on phones and tablets.
- Many 3D camera, animation and export fixes.

## [0.8.0] - 2026-05-22

### Added

- **Timeline & dope sheet**: keyframe-animate flames over time.
- **Auto-animation generator** for instant smooth loops.
- **Animation export** as image sequences and sprite sheets.
- **Symmetry system** (rotational & dihedral) with keyframable angles.
- **Custom variation editor**: write your own variations in code, with a **LaTeX math mode**.
- **Hardware benchmark** with a shareable result card.
- **Guided in-app tours** for new users.
- One-click **Discord sharing** and **shortened share links**.
- **Adaptive density estimation** for cleaner, smoother flames.

### Changed

- True **HDR highlights** with graceful roll-off.
- Decoupled **exposure** and **contrast** for finer control.

### Fixed

- iOS WebGPU stability and touch support.

## [0.7.0] - 2026-04-10

### Added

- **WebGPU IFS flame generator** core.
- **Affine transform editor** and a **variation selector** with live preview.
- Multiple variations per transform.
- Color modes plus **dark / light themes**.
- **Export to PNG** with the flame embedded in the image.
- **Shareable links** that encode the whole flame in the URL.
- Point-initialization modes (square, disc, Perlin noise).
- In-app changelog viewer.

## [0.6.0] - 2026-02-15

### Changed

- Faster rendering powered by **TypeGPU**.
- Rebuilt the IFS pipeline for scalability.

## [0.5.0] - 2025-12-20

### Added

- Histogram rendering pipeline.
- Quality presets (Low, Medium, High, Ultra).

## [0.4.0] - 2025-11-10

### Added

- Parametric variations.
- Undo / redo history.

## [0.3.0] - 2025-09-25

### Added

- Load a flame by dragging in its PNG.
- Core variation set: linear, sinusoidal, spherical, swirl.

## [0.2.0] - 2025-08-15

### Added

- View controls: zoom, pan, pixel ratio.
- Background color selection.

## [0.1.0] - 2025-07-01

### Added

- First flame generator prototype.
- Basic Solid.js interface.
