# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.3] - 2026-06-13

### Added

- **Rich link-sharing previews (Open Graph)**: shared flame links now produce a social preview card on Discord, Slack, X, Facebook and LinkedIn that shows the actual rendered flame. When you create a share link the app renders the flame, downscales it, embeds the flame descriptor into the PNG, and stores it on Cloudflare R2 (content-addressed by the payload hash); the Worker serves the image and injects `og:` / `twitter:` meta tags for both `?s=` short links and `?flame=` long links. Downloading the preview image lets you load the flame straight back into the app. Runs entirely on the Cloudflare free tier.

## [0.9.2] - 2026-06-13

### Added

- **Request-benchmark deep link**: a `?benchmark` query param (also `?benchmark=1` / `?benchmark=true`) skips the welcome screen and opens the benchmark dialog on load, so the app lands one click ("Run Benchmark") from a standardized GPU benchmark. `?benchmark=auto` additionally starts the run automatically; `?benchmark=0` / `?benchmark=false` are treated as off.

## [0.9.1] - 2026-06-13

### Added

- **More 3D variations**: Added 11 new 3D variations — 7 parametric (`rectangles3D`, `splits3D`, `modulus3D`, `separation3D`, `blob3D`, `bent2_3D`, `zScale3D`) and 4 simple (`hemisphere3D`, `scry3D`, `square3D`, `blur3D`) — ported from their 2D counterparts and extended along the z axis.
- **3D starting flame preset**: Added `initExample3D`, a clean single-`linear3D` identity flame, to the example/preset list as a blank-slate 3D starting point.
- **Curated 3D variation previews**: Added tuned `previewFlames3D` overrides (pre-affine, params, exposure and camera) for `pdj3D`, `rectangles3D`, `fan3D` and `sinusoidal3D` so their gallery thumbnails present the variation shape naturally instead of the flat identity default — the 3D analog of the existing 2D `previewFlames` overrides.

### Fixed

- **Variation previews rendered as blank gray blobs**: Preview flames built for the variation selector and quick-picker gallery skipped schema validation after the 3D expansion, leaving render defaults unset. A missing transform `visible` forced the IFS probability to 0 (no shape) and a missing `vibrancy` multiplied chroma by 0 (no color). Previews now show correct, colored variation shapes in both 2D and 3D.
- **Dark halo around 3D variation previews**: the 3D preview thumbnails ran the adaptive density-estimation blur that the 2D thumbnails skip, which smeared the projected cloud's sparse edge into a vignette. The 3D thumbnails now render without it, matching the 2D path.
- **3D parametric variations showed no parameters**: the variation selector and the main-workspace sidebar gated the parameter editor on a 2D-only check (`isParametricVariation`), so 3D parametric variations (e.g. `pdj3D`) exposed no sliders. Both now use a combined 2D/3D parametric check (`isAnyParametricVariationType`).
- **`fan3D` azimuthal seam**: the wedge wrap used `i32()` truncation toward zero instead of `floor`, so azimuths below `-spreadTheta/2` folded the wrong way and left a seam on the −x side. Now uses `floor` for a correct modulo across the full angular range.

### Changed

- **Schema-validated preview flames (2D & 3D)**: Refactored the flame descriptor schema into a shared `makeFlameDescriptorSchema` factory that produces both 2D (`FlameDescriptor`) and 3D (`FlameDescriptor3D`) descriptors. The variation-preview and randomizer flame builders now go through `defineExample`/`defineExample3D` instead of unchecked `as unknown as FlameDescriptor` casts, so every render default is filled consistently.
- **Dimension-aware flame validation**: `validateFlame` now dispatches to the 3D schema when a descriptor declares `dimensions: 3`, preserving 12-parameter 3D affines (`a`–`l`) instead of silently stripping them to a 2D affine on load.
- **Color grading defaults**: Restored the missing `vibrancy` fallback in the color-grading uniform writer to match its sibling fields, hardening against any flame that omits the field.
- **Brighter, closer 3D variation previews**: Raised the 3D preview exposure and pulled the preview camera closer (via `getDefaultFlameByVarType3D`) so 3D variation thumbnails read clearly at gallery size.

## [0.9.0] - 2026-06-12

### Added

- **3D Fractal Flame Rendering**: Implemented a WebGPU-based 3D rendering pipeline for IFS fractal flames.
- **3D Example Gallery**: Added new architectural 3D examples (Examples 32-44) and 6 3D animated preset loops.
- **Smooth 3D Controls**: Added instant key-loop panning (W/A/S/D and arrows) for smooth 3D camera navigation.
- **Performance Cap**: Integrated dynamic rendering caps (capping active frames to 8 iterations) during viewport orbiting, panning, and timeline playback to keep interactions responsive.

### Changed

- **Directional Lighting Shadow Model**: Refactored `lightFactor` calculations in the shader to use saturated interpolation, preventing negative scaling and harsh black creases when `lightPower > 1.0`.
- **Smoother Shading Normals**: Lowered normal estimation `zScale` from 150.0 to 100.0 to reduce noise artifacts.

### Fixed

- **WebGPU Memory Leaks**: Solved a critical VRAM leak and crash by untracking animated timeline frames during blur pipeline checks and implementing cleanups for WebGPU pipeline buffers.
- **Adaptive Blur Depth**: Restored Z-depth copying in the adaptive blur pipeline so that depth coloring and directional lighting apply correctly to blurred frames.
- **Blend Gallery Exclusion**: Excluded 3D flames from the 2D blending view.

## [0.8.9] - 2026-06-11

### Added

- **Custom Variation Editor**: Integrated a CodeMirror 6 custom code editor with live WGSL compilation and AST arity verification.
- **LaTeX Math Mode**: Added Math Mode to transpile LaTeX equations to WGSL with MathJAX equation typesetting previews.
- **Math Mode Tutorial**: Added a step-by-step interactive tutorial modal with clickable indicator dots and scrollable, responsive layouts.
- **Hardware Benchmark Suite**: Introduced an off-screen WebGPU performance benchmark, console telemetry, leaderboard panel, and a "Copy as Image" result card exporter.
- **Added Variations**: Integrated pre-blur, post-rotate, post-spherical, post-spinZ, and a wide array of new simple variations.

### Changed

- **Variation Refactor**: Refactored variation categories to better organize and manage flame parametric variations.
- **Animation Exposure**: Scaled up default exposure levels by +1.5 across all timeline animation examples for a brighter default experience.
- Silenced verbose timeline rendering logs to reduce console clutter.
- **Export Progress UI**: The progress bar now displays an explicit "Encoding Video..." status and prevents cancellation during the critical muxing finalization phase.
- **Hardware Tier Benchmark**: Fixed a bug where Chromium would aggressively throttle the benchmark's `requestAnimationFrame` to 1 FPS because the off-screen canvas was `opacity: 0` and 1x1 pixels. The container is now `10x10` pixels with `opacity: 0.01` to ensure high-end GPUs can run at maximum frame rates.
- **Dynamic Iteration Scaler**: Changed the timing fallback clamp from `0.1ms` to `0.001ms`. High-refresh-rate monitors without native WebGPU timestamp support will no longer artificially bottleneck the compute workload. Fixed a severe mathematical dead-zone in the scaler where `Math.floor()` would permanently trap the iterations at `1` if the browser's fixed overhead was greater than the target budget (by switching to `Math.round()`).
- **Benchmark Stability**: The benchmark frame budget is now bounded to 50ms (~20 FPS) instead of aggressively freezing the browser. This gracefully achieves 100% GPU saturation without triggering Timeout Detection and Recovery (TDR) crashes on weak tablet GPUs.

### Fixed

- **WebGPU Memory Limits**: Animation export at 4x upscale no longer crashes due to `Out of Memory` errors. The WebGPU adapter now explicitly requests the hardware's maximum supported buffer sizes (e.g., 2GB) rather than defaulting to the baseline 256MB.
- **Encoder Fail-Fast**: Fixed a bug where asynchronous video encoder failures (such as Firefox refusing massive 8K resolutions) were swallowed silently, causing the app to needlessly process all frames before crashing at the end. The pipeline now halts immediately on encoder failure.
- **Highlight Roll-off**: Fixed a bug where `highlightPower` did nothing because the tone-mapped value was prematurely saturated before gamma correction. Highlights can now naturally exceed `1.0` and be gracefully desaturated.
- **VRAM Lifecycle Race Condition**: Fixed a bug where `Flam3.tsx` unmounting would trigger buffer destruction while a GPU command was still in flight, causing VRAM accumulation/leaks and console errors.
- **Blend Flame Clear Button**: Fixed the CSS for the 'clear blend flame' (x) button to be properly visible in the UI.

## [0.8.8] - 2026-06-10

### Changed

- **HDR Highlight Power**: Uncapped luminance clamping to allow true HDR highlights to bloom. `highlightPower` now elegantly rolls-off bright cores into white rather than producing harsh clipping bands.
- **Exposure and Contrast**: Decoupled exposure and contrast math. Exposure now acts as a pre-log multiplier simulating linear light gathering, while contrast scales the post-log density curve. Note: This breaks backwards compatibility with previously saved exposure/contrast states as they are no longer mathematical duplicates.
- **Palette Colors**: Palette gradient mapping now dynamically shifts in response to Exposure and Contrast adjustments.
- Silenced verbose timeline rendering logs to reduce console clutter.
- **Color Grading Math**: Decoupled exposure and contrast. Exposure now correctly acts as a linear multiplier on bucket density before the logarithmic scale, while Contrast applies a power curve to the log-density.
- **Hardware Tier Benchmark**: Fixed a bug where Chromium would aggressively throttle the benchmark's `requestAnimationFrame` to 1 FPS because the off-screen canvas was `opacity: 0` and 1x1 pixels. The container is now `10x10` pixels with `opacity: 0.01` to ensure high-end GPUs can run at maximum frame rates.
- **Dynamic Iteration Scaler**: Changed the timing fallback clamp from `0.1ms` to `0.001ms`. High-refresh-rate monitors without native WebGPU timestamp support will no longer artificially bottleneck the compute workload. Fixed a severe mathematical dead-zone in the scaler where `Math.floor()` would permanently trap the iterations at `1` if the browser's fixed overhead was greater than the target budget (by switching to `Math.round()`).
- **Benchmark Stability**: The benchmark frame budget is now bounded to 50ms (~20 FPS) instead of aggressively freezing the browser. This gracefully achieves 100% GPU saturation without triggering Timeout Detection and Recovery (TDR) crashes on weak tablet GPUs.

### Fixed

- **WebGPU Memory Limits**: Animation export at 4x upscale no longer crashes due to `Out of Memory` errors. The WebGPU adapter now explicitly requests the hardware's maximum supported buffer sizes (e.g., 2GB) rather than defaulting to the baseline 256MB.
- **Encoder Fail-Fast**: Fixed a bug where asynchronous video encoder failures (such as Firefox refusing massive 8K resolutions) were swallowed silently, causing the app to needlessly process all frames before crashing at the end. The pipeline now halts immediately on encoder failure.
- **Highlight Roll-off**: Fixed a bug where `highlightPower` did nothing because the tone-mapped value was prematurely saturated before gamma correction. Highlights can now naturally exceed `1.0` and be gracefully desaturated.
- **VRAM Lifecycle Race Condition**: Fixed a bug where `Flam3.tsx` unmounting would trigger buffer destruction while a GPU command was still in flight, causing VRAM accumulation/leaks and console errors.
- **Blend Flame Clear Button**: Fixed the CSS for the 'clear blend flame' (x) button to be properly visible in the UI.

## [0.8.7] - 2026-05-29

### Added

- **Guided App Tours**: Implemented an interactive tour system using the Spotlight API to help onboard new users. Includes general App Tour, and specialized step-by-step Creation Tours.
- **Shortened URLs**: Added support for generating shortened sharing URLs for flames.
- **Discord Share Integration**: Added one-click Discord sharing directly from the application.

### Changed

- **Unified Animation Widget**: Merged the Enable Animation and Play/Pause buttons into a single smart toggle in the floating actions widget.
- **Timeline Auto-Hide**: Fully synchronized Timeline UI with Animation Mode. Hiding the Timeline automatically disables Animation Mode and vice versa.
- **Logo/Favicon Generator**: Generator now smartly initializes loaded with the exact flame you currently have on the canvas, instead of a random flame.
- **Command Logging**: `[cmd:execute]` API execution logs are now silenced by default and only emit when `IS_DEV` mode is active, reducing console noise during spotlight tours.

### Fixed

- **Generator Concurrency Bug**: Fixed `[Invalid Texture]` and `[Invalid CommandBuffer]` WebGPU crashes that occurred when rapidly clicking the "Generate Random" button in the Logo/Favicon exporter.

## [0.8.6] - 2026-05-27

### Changed

- **About panel**: Compact mode toggle changed from a stateful toggle to explicit On/Off setter, preventing race conditions.
- **About panel shortcuts layout**: Keyboard shortcut grid on small screens now uses a more compact grid layout instead of stacked columns, with smaller key caps.
- **Welcome screen branding**: Title uses gradient text, tech pills have distinct accent colors (cyan/blue/green), and a new version info button links to the About panel.

### Fixed

- **Duplicate `view-transition-name` error**: Fixed browser error "Unexpected duplicate view-transition-name: modal" that occurred when opening the Changelog from the About panel. Both stacked dialogs shared the same CSS transition name.
- **Escape key closing wrong modal**: Pressing Escape while the Changelog was open on top of the About panel would close the About panel instead. Fixed by wiring the native dialog cancel event to dismiss the topmost modal, and removing the conflicting global keyboard shortcut handler.

## [0.8.5] - 2026-05-27

### Changed

- **Vibrancy Logic**: Decoupled Vibrancy from the Topographical Density map. Vibrancy now acts as a true saturation multiplier for the flame's structural colors, while the topographical palette overlay is kept gracefully bounded.
- **Palette Settings UI**: Palette rendering options (Speed, Phase, Mode) are now visually dimmed and disabled in the sidebar when no palette is selected.
- **Palette Speed Scale**: Adjusted the Palette Speed slider to max out at 10 to encourage smoother gradient mapping (removing the hard schema bound to allow custom scrubbing for power users).
- **UI Theme**: Decoupled UI dark/light theme from the draw mode. Switching draw mode (light/paint) no longer changes the UI appearance. A new "UI Theme" toggle is available in the About panel (General Settings), and the `D` keyboard shortcut now toggles the UI theme. Theme preference is persisted to localStorage.

### Fixed

- **Cyclic Palette Wrapping**: Fixed sharp color banding at gradient boundaries by implementing perfect cyclic interpolation wrap-around for palette sampling in the shader.
- **Background Color**: The user's explicit background color choice is now always respected. Previously, setting white in light draw mode would auto-swap to black.

## [0.8.4] - 2026-05-27

### Changed

- **Variation pill touch preview**: Touch-and-hold on variation pills (list mode) now triggers a live preview on the canvas, matching the gallery mode behavior. Context menu suppressed during long press.

### Fixed

- **Guided tour spotlight**: Consolidated step-change effects to prevent racing between immediate and delayed position measurement. Card positioning now uses actual DOM dimensions instead of hardcoded estimates, preventing the tooltip from overlapping the target on smaller screens.
- **Tour `beforeShow` hooks**: All sidebar and timeline tour steps now ensure their required panel is open before spotlighting, fixing missing targets when panels were toggled between steps.

## [0.8.3] - 2026-05-27

### Changed

- **Render dialog responsive layout**: Image and animation export tabs now stack vertically on small screens with a compact preview pane and scrollable controls.
- **Keyboard shortcuts mobile layout**: Shortcuts in the About panel stack vertically on narrow screens for better readability.
- **Commit SHA badge**: Styled as a green pill in the About panel.

### Fixed

- **Modal height on iOS/mobile**: Changelog and render dialogs no longer collapse to near-zero height on mobile Safari. Replaced flex-based height resolution with explicit viewport-capped max-heights.
- **Modal close button styling**: Synchronized close button design across all modals (Changelog, Render, etc.) with polished icon button style.
- **Keyboard shortcuts collapsing**: Fixed shortcuts grid disappearing on small screens due to flex shrink behavior with `overflow: hidden`.
- **GitHub icon color on iOS**: Fixed icon rendering black instead of inheriting theme color by adding explicit `fill="currentColor"` to the SVG.
- **Changelog fetch path**: Uses `BASE_URL` abstraction instead of hardcoded root path, fixing 404s on non-root deployments.
- **View controls occlusion**: Added padding to avoid overlap with the version tag; horizontal scrolling enabled for touch devices.
- **Unused Button import**: Cleaned up dead import in ModalTitleBar.

## [0.8.2] - 2026-05-27

### Added

- **Mobile floating actions widget**: Double-tap the drag handle to collapse the widget into a compact dot in the top-right corner. Tap the dot to restore. Fully draggable in all directions on touch devices.
- **Copy Device Info**: New button in the About panel copies full GPU and browser metadata (user agent, screen, WebGPU device, VRAM, CPU cores) to clipboard for easy bug reporting.
- **MobileContext**: Shared reactive mobile/touch detection context (`useMobile`) for consistent responsive behavior across components.
- **Guided Tours section**: App Tour, Sidebar Tour, and Timeline Tour buttons added to the About panel.

### Changed

- **About panel redesigned**: Compact hero layout with title, icons, and version badges on a single row. Section titles now use small uppercase with accent bars (matching sidebar style). Keyboard shortcuts rendered as realistic keycaps with gradient and shadow. Tour buttons feature accent-bar hover effect.
- **About panel width**: Increased from 30rem to 34rem for a more spacious layout on desktop; still responsive on mobile.
- **GPU info pills**: Two-color pill system -- green for hardware specs (Device, Max Buffer, VRAM), blue for identification (Vendor, Architecture).
- **Branding**: Renamed version display from "Chaos Master" to "CM", removed alpha tag for a cleaner look.
- **Debug panel**: Converted close button to a chevron toggle tab on the panel edge. Starts collapsed by default on small screens. Flex wrapper layout prevents occlusion with timeline controls.
- **Console log viewer**: Constrained width with horizontal scrolling to prevent long log lines from blowing out the About panel.
- **Changelog icon**: Fixed stroke-based SVG rendering (was invisible due to `fill: currentColor` on a stroke-only icon).
- Removed verbose WebGPU/canvas `console.info` debug logs from `WebgpuAdapter.ts` and `AutoCanvas.tsx` that were added during iOS debugging.

### Fixed

- **iOS WebGPU crash**: Fixed canvas context initialization by ensuring the canvas element is attached to the DOM before calling `getContext('webgpu')`, resolving crashes on iOS Safari/WebKit.
- **iOS touch support**: Added touch event handling for dope sheet resize bar and timeline scrubbing.
- **iOS `structuredClone` compatibility**: Replaced `structuredClone` usage with manual cloning for environments where it is unavailable.
- **SolidJS fragment error**: Refactored GPU info grid to use `For` with a data array instead of nested fragments inside elements, which is not valid in SolidJS.
- **Lint errors**: Fixed 7 lint violations (`no-restricted-globals` for `navigator`/`performance`, `no-floating-promises`) across `ConsoleLog.tsx` and `ErrorHandling.tsx`.

## [0.8.1] - 2026-05-26

### Added

- **Symmetry System**: Full symmetry panel with rotational (Cn) and dihedral (Dn) symmetry groups. Compact 2-column gallery shows per-transform angle editors, visibility toggles, and remove buttons.
- **Symmetry Angle Keyframing**: Symmetry transform angles can be keyframed in the timeline. All 4 rotation matrix components (a, b, d, e) are keyframed simultaneously for correct interpolation.
- **AngleEditor inline mode**: New `mode="inline"` renders a self-contained circular knob with degree value overlaid inside the track, used for compact symmetry gallery items.
- **Adaptive Density Estimation**: flam3-style density estimation filter with per-pixel adaptive Gaussian blur. Quality and estimator curve controls exposed as sidebar sliders.

### Changed

- **GPU Pipeline Optimization**: Density estimation uniform updates (quality/curve) now write directly to GPU uniform buffers instead of recreating the entire pipeline on every slider change.
- **Palette buttons restyled**: "Load More" and "Import flam3 Palettes" buttons now use the app's neutral design language with proper dark/light theme support instead of the previous solid-fill style.
- **Symmetry controls layout**: Type dropdown and Folds scrub input now display correctly on their own grid rows. Fixed ScrubInput's `grid-column: 1 / -1` override that prevented it from sitting next to its label.
- Symmetry gallery items use right-aligned action icons (eye/remove) via a `.sym-actions` flex container with `margin-left: auto`.
- Type dropdown font reduced to 0.65rem for visual balance.
- AngleEditor inline track increased to 30px with 0.55rem font for better readability.

### Fixed

- **Paint mode background color**: Switching to paint draw mode now correctly auto-swaps the background to white when the current background is default black (and vice versa). Previously, the auto-swap only triggered when `backgroundColor` was `undefined`, but new flames always had it explicitly set to `[0,0,0]`.
- **"No preview to commit" console warning**: Silenced the benign `console.warn` in `createStoreHistory.commit()` that fired when `pointerUp`/`pointerCancel` events occurred without a matching `startPreview` (e.g., click-without-drag, browser-initiated cancel).
- **AngleEditor fluid dragging**: Fixed angle editors snapping to discrete values instead of continuous rotation by correcting the drag handler's angle calculation.

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
