# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.8] - 2026-05-30

### Changed

- **HDR Highlight Power**: Uncapped luminance clamping to allow true HDR highlights to bloom. `highlightPower` now elegantly rolls-off bright cores into white rather than producing harsh clipping bands.
- **Exposure and Contrast**: Decoupled exposure and contrast math. Exposure now acts as a pre-log multiplier simulating linear light gathering, while contrast scales the post-log density curve. Note: This breaks backwards compatibility with previously saved exposure/contrast states as they are no longer mathematical duplicates.
- **Palette Colors**: Palette gradient mapping now dynamically shifts in response to Exposure and Contrast adjustments.

### Fixed

- **Top-left Rendering Artifact**: Fixed a visual defect where NaN particle coordinates from math explosions would incorrectly accumulate at pixel (0,0).

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
