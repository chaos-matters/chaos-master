# Changelog

What's new in Chaos Master. Concise highlights for each release; the full
developer history lives in `dev.changelog.md`.

## [0.9.5] - 2026-07-02

### Fixed

- **Undo now reverts your last action — whatever it was.** The app kept two separate undo histories (flame edits and timeline keyframes); Ctrl+Z used to unwind every keyframe change before any flame edit became reachable, while the toolbar Undo button only ever touched flame edits. Both now share one chronological order, the buttons match Ctrl+Z exactly, and their enabled state reflects everything undoable. Redo replays in the order things happened, and making a new edit after undoing clears redo everywhere.
- **Undoing "New transform", "Add variation", and "Add symmetry" works.** A long-standing engine bug ran the change twice under the hood, so undo silently did nothing and redo duplicated the transform. Dice rolls also redo to exactly the values you saw.
- **One action = one undo step.** Randomize/Smart animation, the Colors generator, and animation presets used to record one undo entry per keyframe (dozens per click); value scrubs, the camera orientation gizmo, and 3D wheel-zoom recorded one per pointer-move. All are now single steps.
- **Undo no longer leaks across flames.** Loading a flame, starting a new one, or switching 2D/3D previously kept the old flame's keyframe history alive — Ctrl+Z could dump a previous flame's animation tracks onto the new one.
- **Ctrl+Z while typing in number or search fields** (timeline FPS/frames, export size, variation search) now edits the text as expected instead of triggering an app undo behind your back.
- Exporting an animation no longer floods undo history with one entry per rendered frame, and 3D auto-exposure no longer fights undo after camera zooms.
- **Keyframe undos are visible**: undoing a keyframe edit now updates the rendered flame immediately (previously the canvas could keep the old value until you played the timeline).
- **Timeline settings are undoable** — FPS, frame count, speed, loop and loop style (including Seamless quietly extending the timeline) all revert with Ctrl+Z.
- **Palettes and blends are part of your flame now**: applying/removing a palette and picking/adjusting/clearing a blend flame are all undoable, and both survive saving, sharing, and loading.
- **Deleting a custom variation is safe(r)**: the app warns when the current flame uses it, and every delete shows an Undo toast that brings the variation back.

## [0.9.4] - 2026-07-02

### Added

- **Track changes diamond.** A shiny diamond on the affine editor and color wheel (and in their list views): while it's on, every edit records a keyframe at the current frame — dragging a transform handle, scaling/rotating, scrubbing a value, typing a number, or rolling a dice. Unlike the timeline's Auto mode it also creates the _first_ keyframe, so animating is just: turn on the diamond, move things, step frames, move again.
- **New Flame button** in the floating actions bar: one click resets to a clean starter flame (2D or 3D, matching your mode). No confirmation needed — undo brings the previous flame back, and unsaved work (including its animation) is stashed into Recent flames first.
- **Animate button** in the timeline header opens the sidebar's animation generator (Flame Randomizer → Animation Settings) and scrolls straight to it — replacing the old one-shot "Gen" randomizer and its "Subtle" toggle.
- **Your work is never silently lost.** Closing or reloading the tab with unsaved changes now saves the flame (with its animation) into Recent flames automatically — no prompt. Optional periodic auto-save (asked once via a small toast; configurable under Data Management: on/off + 1/2/5/10 min) keeps one auto-updating entry per editing session. Loading another flame, switching 2D/3D, or starting a new flame stashes unsaved work first. A one-time reminder after a few minutes of editing points to save/export/share, with a "Don't show again".
- **3D variation browser** now shows the same Affine Editor panel the 2D browser has, so you can position a variation's transform while previewing it.

### Changed

- **The selected transform always renders on top.** Overlapping handles used to hide the selected transform behind later-added ones; the selected handle now paints above the stack and receives the click. Scale/rotate edges also always paint _below_ center dots, so one transform's edges can no longer cover another's grab point.

### Fixed

- Clicking stacked transform handles (e.g. several at the origin) now selects and moves the **selected/targeted** transform instead of whichever was added last.
- Recording keyframes while scrubbing no longer floods the timeline's undo history — one undo reverts the whole scrub, and the history is bounded.
- Auto/track-changes recording only happens while animation mode is on — no invisible "ghost" keyframes after leaving animation mode.

## [0.9.3] - 2026-06-27

### Added

- **Graceful WebGPU fallback.** If WebGPU isn't available — an unsupported browser, or a GPU driver that crashes mid-session — the app stays usable instead of going blank or freezing. Every fractal preview shows a clear "WebGPU preview unavailable" placeholder with a link to check your browser/device support, while the rest of the studio (sidebar, About, Help, docs, settings) keeps working.

### Fixed

- **The variation gallery no longer runs out of GPU memory while scrolling.** Live previews are now bounded and freed as they scroll off-screen, thumbnail detail is capped to a sane level, a per-preview GPU buffer leak is fixed, and each variation's shader is compiled once instead of repeatedly — together cutting a large gallery from ~1.6 GB of GPU memory to a few hundred MB and removing the "Out of memory" crash (notably on Firefox / Linux / AMD).
- **Firefox: the variation-picker gallery no longer squeezes, collapses, or hides tiles behind the scrollbar.** Preview tiles use a fixed 16:9 aspect ratio with a height floor — so even a GPU device-loss reflow can't collapse them into a pile of overlapping labels — and both galleries reserve their scrollbar gutter so tiles never slide under the Firefox scrollbar.
- On a GPU device loss, render loops now stop immediately (no console error flood), and the app falls back to the usable shell within a few seconds instead of hanging when a reload can't re-acquire the GPU.

## [0.9.2] - 2026-06-26

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
