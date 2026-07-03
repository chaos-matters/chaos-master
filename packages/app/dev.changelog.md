# Changelog (developer / detailed)

Full, granular change history with per-patch detail and internal notes. This is
the developer reference and is NOT shown in the app. The concise, user-facing
changelog surfaced in the About panel lives in `CHANGELOG.md`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.6] - 2026-07-03

Timeline UX batch: playhead/ruler desync fix, single-row grouped header,
curve value-axis zoom, and live keyframing for affine/color handle drags.

### Added

- **Curve editor value-axis zoom** (`CurveEditor.tsx`): a non-passive `wheel`
  listener on the curve lane handles Ctrl/Cmd+wheel by rescaling the sticky
  value range around the value under the cursor (`span * exp(deltaY * 0.002)`,
  clamped to [1e-6, 1e9]). `stopPropagation` keeps the workspace's Ctrl+wheel
  panel-resize from firing on the same gesture; Alt+wheel (frame zoom) and
  plain wheel (scroll) are untouched.

### Changed

- **Single-row timeline header** (`TimelineSection.tsx` + module CSS): the
  dope sheet's zoom toolbar row is dissolved into the header, which now reads
  as bordered "aisles" — playback (transport + frame counter), settings
  (FPS/frames/speed/loop), View (zoom −/%/+, Fit, Seek, Curve; labeled), and
  Keys (Auto, Del; labeled) — via new `.headerGroup`/`.headerGroupLabel`/
  `.viewBtn` styles (labels hidden ≤480px). `seekOnSelect`/`showCurve` state
  lifted from `DopeSheet` to `TimelineSection` (same persisted key); the zoom
  controls stay in `DopeSheet` (they need its refs) and are exposed upward via
  a `registerViewApi` callback (`DopeSheetViewApi`), cleared on unmount so a
  collapsed timeline hides the View group. `KeyframeInspector` renders only
  while a keyframe is selected instead of holding an empty 32px placeholder
  row. All `data-testid`/`data-tour-target` hooks preserved.
- **Affine/color drags keyframe per pointer-move** (`AffineEditor.tsx`,
  `FlameColorEditor.tsx`): handle drags now call `keyframeEditedParams` after
  every `setTransform`/`setColor` — the same contract as the sliders (Auto
  re-records animated params; the track-changes diamond records anything,
  creating first keyframes) — with `breakUndoCoalescing()` on gesture end so a
  whole drag stays one timeline-undo step. The drag-end
  `createGestureKeyframer` (300 ms debounce) is removed from
  `keyframeOnChange.ts` along with both call sites. The final-transform handle
  now passes `keyframePathBase="finalTransform"` so it participates too.
  Rationale: while the timeline holds a frame (`isDrivingView`),
  `applyTimelineToFlame` overrides tracked params every render — deferring the
  keyframe write to a drag-end debounce froze the rendered IFS for the whole
  drag, then snapped it to the end state.

### Fixed

- **Ruler/tracks playhead desync on panel resize** (`useZoomGestures.ts`): the
  seek-ruler lane and the tracks area are separate horizontal scrollers, and
  any `frameWidth` change (zoom buttons, Alt+wheel, pinch, or the panel resize
  handle driving `containerHeight`) let the browser clamp each `scrollLeft`
  independently — shifting the ruler arrowhead off the tracks playhead until a
  Fit/zoom-out reset both. A new effect re-anchors on every `frameWidth`
  change: the frame at the lane's left edge is kept stable (`scrollLeft *
ratio`) and the same value — clamped to the smaller of the two scroll
  ranges — is written to both panes; the ruler wrapper's own scroll is pinned
  to 0. `useScrollSync` swaps its broken re-entrancy flag (programmatic
  scrolls fire their events asynchronously, so the flag never covered the
  echo) for idempotent value-guarded writes.
- **Responsive track-name column no longer skews alignment**
  (`useTrackNameWidth.ts`): CSS shrank `.trackName` to 100px/80px under
  768px/480px while every JS offset (ruler spacer, tracks-playhead `left`,
  curve gutter, auto-fit math) used the 130px constant, shifting diamonds off
  the ruler's frame axis on tablets. The width is now a single reactive
  `matchMedia` signal consumed by the cells and all offset math; the CSS
  media-query width overrides are gone.

Undo/redo overhaul, driven by a full audit of both undo systems (flame
change-history + timeline snapshots). Each area landed as its own commit with
a dedicated test suite; undo behavior is now locked in by ~50 unit tests
(`createStoreHistory.test.ts`, `timelineUndo.test.ts`, `undoRouting.test.ts`).

### Fixed

- **`createStoreHistory.set()` ran mutation callbacks twice** (once through
  `produceWithPatches` for patches, once through solid's `produce` for the
  store). Any non-deterministic callback desynced store from history:
  "New transform"/"Add variation"/"Add symmetry" mint UUIDs inside setters, so
  undo was a silent no-op and redo duplicated transforms; dice rolls recorded
  values never shown. The store now reconciles the `produceWithPatches` result
  — callbacks run exactly once. Stack payloads are deep-cloned in (and results
  cloned out on undo/redo), fixing reference-aliasing where later store edits
  silently rewrote history entries and corrupted redo.
- **Timeline undo lifecycle**: `loadTracks` clears both stacks + the coalescing
  key (a load is a document boundary — Ctrl+Z used to restore the previous
  flame's tracks onto the new flame, orphaned transform ids and all).
  `addKeyframesAtCurrentFrame(paths, {coalesce})` records grouped multi-path
  writes as ONE entry with per-gesture coalescing (the symmetry-rotation knob
  pushed 4 snapshots per pointer-move — ~600/drag, evicting the whole capped
  history; it now uses AngleEditor's new `keyframePaths` prop).
  `runWithSingleUndo()` groups bulk ops: Randomize/Smart animation, Colors,
  preset pills and morph setup were one entry PER KEYFRAME (20-120/click).
  Gesture ends + playhead moves break coalescing; `removeKeyframe`/
  `removeAllKeyframesForPath` no-op guards stop junk entries wiping redo.
- **Cross-system routing** (`utils/undoJournal.ts` + `utils/undoRouting.ts`):
  entries in both systems carry a shared recency seq; Ctrl+Z/Ctrl+Shift+Z/
  Ctrl+Y and the toolbar buttons all route through one arbiter — undo reverts
  the LAST action wherever recorded, redo replays forward in original order,
  and a new edit in either system invalidates redo in both. Previously Ctrl+Z
  drained the entire timeline stack first (the first press after a recorded
  drag looked like a no-op) while the buttons only drove flame history.
  Journal participation is opt-in; the variation browser's preview histories
  stay isolated. Timeline stacks got a version signal so button states are
  reactive.
- **Writer batching/silencing**: ScrubInput scrubs wrap in preview/commit
  (was one history entry per pointer-move — camera theta/phi/R/FOV, affine +
  colour lists, symmetry folds); OrientationGizmo batches drag-orbit and the
  axis-snap rAF ease (~70 entries per axis click); the 3D wheel-zoom commit
  timer is tracked/cleared (stale timers committed previews mid-gesture; 2D
  gets the same drag/pinch takeover cancellation). New
  `ChangeHistory.setSilently()` for automated writers: animation export wrote
  one entry per exported frame; the 3D auto-exposure follower re-recorded
  exposure after every radius undo, destroying redo.
- **Ctrl+Z in text-entry inputs**: the two keyboard dispatchers each carried a
  copy of the active-input guard and only one had the text-entry input types
  (number/search/...). Extracted to `shortcuts/activeInputGuard.ts` and
  shared — typing in timeline FPS/frames, export dimensions or variation
  search no longer triggers app undo.

### Follow-up pass — the audit's remaining gaps, closed

- **Timeline undo writes values back.** `timelineUndo`/`timelineRedo` now push
  each surviving changed track's value at the current frame back through the
  flame writer (removed tracks stay untouched — their flame edit is its own
  history entry), so keyframe undos are visible even when the timeline isn't
  driving the view. `setFlameValue` (the timeline's writer) became silent —
  recording it double-counted preset keyframes and would have turned
  write-backs into fresh flame entries.
- **Timeline config is undoable.** Undo entries snapshot config alongside
  tracks; `updateConfigUndoable(partial, coalesceId?)` records user edits
  (fps/frames/speed scrubs coalesce per gesture; loop/auto-fps toggles are
  single steps); `setLoopMode` is undoable including seamless's `endFrame`
  extension, with an idempotence guard. Load/system syncs keep raw
  `setConfig`. +5 tests.
- **Palette selection lives in the flame** (`renderSettings.palette`,
  optional schema field, entries embedded): apply/remove is ONE history entry
  covering colors + palette (no more half-reverts leaving grading on), and
  the palette survives save/share/load. +1 schema test.
- **Blend composition lives in the flame** (`renderSettings.blendFlame` as
  re-validated plain data + `.blendWeight`): pick/adjust/clear/morph-setup
  are ordinary history entries — the "Remove blend flame" X is no longer an
  unrecoverable click — and blends survive save/share/load. Gallery hover
  previews write silently. +1 schema test.
- **Custom-variation deletes are guarded and recoverable**: deleting a
  variation the current flame uses asks for confirmation
  (ConfirmDeleteVariationModal), and every delete offers a 10s toast Undo
  that re-registers the variation under its original id
  (`restoreCustomVariation`). The library is app-level state, so recovery
  goes through the toast rather than Ctrl+Z.

## [0.9.4] - 2026-07-02

### Added

- **Track-changes diamond (keyframe on change).** New global persisted opt-in (`editor/keyframe-on-change`, default off; replaces `keyframeOnRandomize` / the "Keyframe on randomize" checkbox). While on, every edit records keyframes at the current frame — including the _first_ keyframe, unlike the timeline's Auto mode (which is unchanged and composes with it). Wired through shared helpers in `utils/keyframeOnChange.ts`: `keyframeEditedParam` (ScrubInput scrubs + typed commits, Slider, AngleEditor), `keyframeChangedParams` (affine/color dice), and `createGestureKeyframer` (affine graph drags — 2D translate `c,f`, scale/rotate `a,b,d,e`, 3D translate `d,h`, per-axis `a,e,i`/`b,f,j`/`c,g,k` — and color-wheel drags, debounced 300 ms with full paths captured per gesture and flush-on-unmount). All recording is gated on `timeline.animationEnabled()` so a persisted ON state can't write ghost keyframes outside animation mode. UI: `TrackChangesDiamond` (gradient gem, per-instance SVG ids) overlays the affine + color canvases and heads both list editors; `enableChangeTracking` threads from `MainWorkspace` so preview-flame editors (variation modal) stay inert.
- **New Flame** button (`FloatingActions`, plus icon): `history.replace` to `initExample`/`initExample3D` per current dimension (undoable), plain-load path via `setLoadedAnimation({tracks: []})`; unsaved work (flame + tracks) is flushed to Recents first since tracks aren't in change history.
- **Timeline "Animate" button** (Sparkle icon) replaces the one-shot `Gen` + `Subtle` (removed: `randomizeParams`, `buildParamPool`, `subtleBlend`, `randomValueForPath`; `randomizeColorsParams` lost its `subtle` param). It opens the sidebar Flame Randomizer with its Animation Settings section expanded and scrolls to it — `FlameRandomizerCard` is now controlled (`open`/`onToggleOpen` + `expandAnimationEpoch`), and `openAnimationGenerator` also dismisses the blend gallery / quick-pick overlays (ordering matters: overlays close before the epoch bump so a remount can't swallow the expansion).
- **Autosave & save-awareness.** Dirty tracking via a baseline JSON snapshot (flame + tracks) reset on loads (LoadFlame modal, drag-drop, welcome pick, shared link, randomizer-history load, 2D/3D switch) and saves; each starting point rotates a per-session autosave id so sessions can't clobber each other's entry. Silent save-to-Recents on `pagehide` (incl. bfcache freezes) whenever dirty — independent of the periodic setting. Periodic autosave: first dirty tick asks once via an action toast (Yes/No persisted in `editor/autosave-recents`), then upserts one entry per session on a configurable interval (`Data Management` card: enabled + 1/2/5/10 min pills). Outgoing dirty work is also flushed before any load/new/mode-switch replaces the flame. `upsertRecentFlame` reports write failures (quota) so a failed save never marks the flame clean, and rewrites use structural-only validation so a schema regression can't mass-drop stored flames. One-time 5-minute save/export reminder with a persisted "Don't show again". Toasts support action buttons (`ToastAction`), dismiss-before-run.
- **3D variation browser affine panel**: removed the `dims() !== 3` gate in `VariationSelector` — `AffineEditor`/`AffineListEditor` already handle 12-coef 3D affines.

### Changed

- **Handle layering & stacked-handle picking.** `createSelectedLastEntries` (new util) orders transform entries with the selected id last while preserving tuple identity, so `<For>` _moves_ rows instead of recreating them — the selected handle paints on top, natively receives stacked clicks, and an in-flight select-on-press drag survives the reorder (`createDragHandler` aborts on unmount). Applied to the affine editor and color wheel. The affine editor additionally renders each transform in two passes (`part: 'box' | 'center'`): all scale/rotate boxes paint below all center dots, so one transform's edges can never cover another's grab point; dimmed (non-selected) grips keep `pointer-events: none`.
- Timeline undo hardening: `undoStack` capped at 100 snapshots and continuous same-param/same-frame re-records (auto-keyframe / track-changes during a scrub) coalesce into a single undo entry (`lastKeyframeUndo` run-tracking, broken by any other push/undo/redo).

### Fixed

- Sidebar tour copy updated for the diamond (was describing the removed "Keyframe on randomize" checkbox).
- Plain-flame drag-drop now routes through `setLoadedAnimation({tracks: []})` like the modal, clearing stale timeline tracks and resetting dirty tracking.

## [0.9.3] - 2026-06-27

### Added

- **Graceful WebGPU fallback / degraded shell.** When WebGPU is unavailable or the device is lost mid-session, the app degrades instead of going blank or hanging: a `gpuStatus` signal (`lib/gpuStatus.ts`) drives a degraded `RootContext`, `AutoCanvas` gates every surface behind a `PreviewPoster` ("WebGPU preview unavailable" + a support link), and a WebGPU init timeout guarantees the resource resolves so the shell always mounts. `WebgpuAdapter` listens for `uncapturederror`/device-loss and flips the status; render loops halt immediately on loss (no console spiral); recovery is reload-only. `pagehideCleanup` frees GPU resources on teardown (flag-gated experiment, default off).
- **Debug panel GPU stats.** The perf panel now shows live gallery-preview count and tracked GPU-buffer MiB, surfaced as signals from `vramLog.ts` (cheap `+=` per alloc/free; console tracing still gated on `VITE_DEBUG_VRAM`). Lets you watch the gallery's preview gating keep canvases bounded without console spam.
- **GPU-enabled e2e suite** (`packages/app/e2e/variation-gallery.gpu.spec.ts`, local-only). Real-GPU regression cover: gallery memory stays bounded under fast/sweep scrolling, closing the picker frees previews, parametric edits re-render their tile. Reusable helpers in `e2e/helpers/gallery.ts`. The `*.gpu.spec.ts` suffix keeps these out of CI (`playwright.config.ts` `testIgnore`) and into the headed `chromium-gpu` project (`playwright.resilience.config.ts`).

### Changed

- **Variation-gallery previews are visibility-gated and scroll-debounced.** A single shared `IntersectionObserver` rooted on the scroll container (`createSharedIntersectionObserver` in `utils/useIntersectionObserver.ts`) mounts a tile's live preview only while it's within — or near (`rootMargin`) — the gallery viewport, replacing the time-based `DelayedShow` that mounted all ~800. A global debounced `isScrolling` signal (`utils/isScrolling.ts`) defers mounting until ~180ms after the last scroll, so fast/jerky scrolling no longer spawns hundreds of half-rendered canvases. Live canvases stay bounded to the on-screen window (~20-30) instead of climbing into the tens of GB; `ComputeGate` still throttles concurrent renders, and each `VariationPreview` snapshots to a static `<img>` and frees its canvas when done.
- **Gallery VRAM bounds.** Thumbnail point count capped; compiled IFS compute pipeline cached per `(root, signature)` instead of recompiled per preview.

### Fixed

- **Firefox: gallery tiles no longer squeeze, collapse, or overlap.** Tiles size via the `padding-bottom: 56.25%` trick, **not** `aspect-ratio` — a grid item sized only by `aspect-ratio` with absolutely-positioned children doesn't size its auto grid row, so tiles overflowed and overlapped (~40%) in both engines. A `min-height` floor (safe with the global `border-box`) means even a GPU device-loss reflow that drops the resolved percentage padding to ~0 can't collapse a tile into a pile of stacked labels.
- **Firefox: gallery scrollbar no longer overlaps the last column.** `scrollbar-gutter: stable` is a no-op under Firefox overlay scrollbars (Linux/GTK), so `VariationSelector`'s gallery reserves a real `padding-right` gutter, which clears the bar for both overlay and classic scrollbars.
- **Main IFS point-count readout no longer clobbered by gallery previews.** Global point-count writes were gated on `!props.onAccumulatedPointCount`, which neither the main renderer nor `VariationPreview` passes; previews overwrote the main readout when a picker was open. Gated on `isExportRenderer` (the main workspace renderer) instead, matching `renderTimings`.
- **Live-preview count and VRAM ledger could drift negative.** The count is now set-membership by a per-preview token (idempotent — a cleanup without its matching mount can't push it below zero), and `Flam3` frees the exact byte count it allocated (`pointCountPerBatch` is reactive and can differ by free time).
- **Editing a parametric variation re-renders its gallery tile.** A per-item version bump (`paramRev`) discards that tile's cached snapshot when its sliders change, so the edited tile goes live and re-renders to quality (previously only the right-side preview updated).
- **Per-preview GPU buffer leak** (`pointPositions`/`pointColors` were never destroyed on unmount — ~24MB each at 1e6 points); legible posters, labelled GPU resources, gated editor loops, hushed teardown noise.

## [0.9.2] - 2026-06-26

### Added

- **Share flames with embedded custom variations**: `SharePayload` gained an optional `customVariations` field; `ShareLinkModal` has an "Include N custom variations" toggle (on by default when the flame references any), collected via `collectFlameCustomVariations`. On load, every embedded variation is re-validated through the same allowlist compiler as locally-authored code (`importSharedVariations`) — never trusted as-is — and registered _transiently_ (in-memory, not persisted). A consent modal (`ImportVariationsModal`) lets the recipient pick which to save via toggleable pills (select-all, scrolls when many). Variations whose WGSL already matches one in the library are detected by content and surfaced under "Already in your library" (the flame is remapped to the existing copy, never overwritten); id collisions are re-keyed.
- **Share a single custom variation** via a self-contained `?cv=` link (`encodeVariationShareUrl` / `decodeVariationShare`, inline deflate+base64, no shortener). A per-item Share action in the Custom Variations sidebar and a Share button in the Custom Variation Editor tab bar (disabled until the variation compiles) both open the link modal. Opening a `?cv=` link decodes + re-validates the variation and shows a load modal (`ShareVariationModal`) with a live GPU preview before saving; when the variation is already owned it shows "Close" instead of "Save to library".
- **Custom-variation marker** in the per-transform variation list: an accent dot for live custom variations, red when the flame references one deleted from the library (`isCustomVariationRegistered`, reactive via `customVarsVersion`), with a "Custom Variation &lt;name&gt;" tooltip on the dot.
- **Dev flag `VITE_SKIP_WELCOME`**: when `true` (set it in `.env.local`), skips the welcome screen on startup — and with it the on-startup hardware-tier detection that lives inside it — falling back to the 'high' tier. Off by default; for local dev and for driving the app with Playwright/agents.

### Changed

- **`getNormalizedVariationName`** now returns a custom variation's human name (from the registry) for `custom_*` ids, so the variation browser, transform chips, quick picker, docs and search all show the name instead of the opaque `custom_<uuid>` id (falls back to the id if the def isn't registered).
- **Custom-variation previews** (the editor preview and the shared-variation load preview) now mirror the VariationSelector gallery settings — exposure floored to 1.3, gamma 5.0, gaussian-disk point init, colorSpeed 0 — extracted to a shared `makeCustomVariationPreviewFlame`; they previously rendered much darker than the gallery.
- **Loop guard** in `compileCustomVariationCode` (runs before transpile, for every custom variation — local or shared): only statically-counted `for` loops pass; `while`/`do-while` and dynamic-bound `for` are rejected with a hint. Caps: per-loop iterations (1024), nesting depth (3), combined iterations along any nested path (4096), loop count per variation (16). A 16 KB source-length cap bounds untrusted parse/compile cost.
- **flam3 XML export** omits custom variations (no flam3/Apophysis equivalent); a transform left with none falls back to `linear="1"`, and the "Copy flam3 XML" action toasts how many were dropped.

### Fixed

- **Math Mode tutorial** (`TutorialModal`): the injected MathJax SVG was run through DOMPurify, which strips the `<svg>` wrapper, `viewBox` and glyph `<defs>`, collapsing each equation to a thin rule line. The markdown shell is now sanitized first and the trusted MathJax SVG injected into the placeholders afterward (never through DOMPurify); `svg.fontCache='none'` makes each SVG self-contained; math glyphs use `color: inherit`.
- **Inline math in table cells**: `renderMarkdown` swapped inline `\(...\)` math for an empty `<mathinline>` element before running `marked`, which escapes such an element's opening tag inside GFM table cells — leaking a literal `<mathinline id="0">` onto the page (e.g. the Exponential & Logarithmic tutorial page). Inline placeholders are now an inert alphanumeric text token that `marked` passes through verbatim.
- **Editor tab-bar buttons**: the Share and "?" buttons no longer sit flush against each other (6px gap; WGSL/Math tabs stay joined).

### Security

- Custom-variation code arriving via a shared flame or a `?cv=` link is re-validated through the exact same allowlist compiler as locally-authored code (acorn AST parse → tinyest → banned-name denylist → `Object.hasOwn` builtin allowlist → arity → typegpu → sandboxed GPU WGSL) — the payload's claims are never trusted, and shared variations are registered transiently rather than silently persisted. The loop guard and 16 KB length cap bound untrusted parse/compile/GPU cost.

## [0.9.1] - 2026-06-25

### Added

- **Variation documentation**: a docs "pill" in the variation browser opens an in-app reference for every variation. Parameter types and ranges are derived from the editors themselves; each entry shows its math formula and the generated WGSL for both 2D and 3D variations, alongside IFS-pipeline and API guides. Documentation/formulas were backfilled across the full set — 87 simple (non-parametric) variations, ~200 general-group parametric variations, all 43 3D variations, and the post/pre/crop/cut/blur/dc transforms — including a fix for over-escaped backslashes in 12 3D formulas.
- **Home-page link** in the Help/About hero icon row: a new stroke-style `Globe` icon (`icons/globe.svg`, registered in `icons/index.ts`) links to `https://about.chaos-master.com`, opened in a new tab. Placed first in the row, ahead of the Ko-fi / GitHub / Discord links.

### Changed

- **LoadFlameModal**: the subtitle, upload/drop zone, dimension filter and gallery now live inside a single scroll container (`.scrollBody`, renamed from `.galleryScroll`), so the whole modal body scrolls as one unit instead of pinning the upload zone at the top. This frees vertical space for the gallery on small / mobile / tablet viewports. The modal title bar (with the close button) stays fixed.
- **Focus ring** (`styles/index.css`, global `:focus-visible`): introduced a `--focus-ring-color` token (`#6366f1` light / `#818cf8` dark — the app's indigo accent) to replace the hard-coded violet `#7c3aed`, and slimmed the ring from `2px` outline / `2px` offset to `1.5px` / `1px`. Still keyboard-focus only and `!important`, so the WCAG 2.4.7 behavior is preserved.
- **Sidebar add-flame buttons** reordered to `New transform → Add symmetry → Migration` (was `Migration → New transform → Add symmetry`), in `MainWorkspace.tsx`.
- **Bottom-right floating controls** consolidated into one row: the standalone fixed-position `BenchmarkButton` now renders inside `SoftwareVersion`'s `.versionContainer` (ordered Benchmark → Docs → version/About) instead of floating separately at `bottom: 2.75rem`. Dropped its own `position: fixed` and tuned its size to match the Docs / About pill height.

### Fixed

- **Migration**: the import-warnings panel is now height-bounded and scrolls instead of overflowing the modal when an imported file produces many warnings.
- **Timeline**: render the held/seeked frame on scrub release, not just the frame counter.

### Chore

- Bumped the app package version `0.9.0` → `0.9.1` (the in-app version badge reads `version` straight from `package.json` via `src/version.ts`).
- CI (already on `main`): deploy workflows skip on forks via a job-level `github.repository` gate; the eslint job's heap was raised to avoid OOM; workflows run on Node 24.

## [0.9.0] - 2026-06-20

Consolidated production release covering the full `0.9.0`–`0.9.10` development
series (the in-development patch versions were squashed into this single `0.9.0`
entry to match the released app version and tag `v0.9.0`).

### Added

- **Share to Discord** is now bot-protected: a Cloudflare Turnstile check plus per-IP rate limits guard every share. If the post can't go through, a manual fallback lets you download the image (the flame is embedded in the PNG) or copy a share link.
- New built-in example **"Clifford Reverie"** (Clifford attractor woven with csch2_bs, swirl and popcorn).
- **Smart Animate**: a one-click animation generator that combines a curated preset from each category (camera, render, color, affine) into a full, designed-feeling loop — alongside the existing pick-the-aspects **Randomize Animation**.
- A **Clear existing keyframes first** toggle for the animation randomizer (on by default) — turn it off to layer a new animation onto your existing keyframes.
- **Morph**: a **Morph…** action picks an end flame and animates the current flame into it across the timeline (an animated version of Blend), editable like any keyframe track.
- **Loop styles** for the timeline: **Seamless** (plays there-and-back so the last frame flows into the first) and **Cycle** (each animated property wraps on its own timing) — both make a GIF-style loop without adding keyframes. Combine with a morph for an A→B→A loop.
- **Smooth (spline) interpolation**: each keyframe can use **Linear**, **Spline** (smooth Catmull-Rom curve), or **Constant** (stepped), set from the keyframe inspector or by right-clicking a keyframe.
- **Curve editor**: a **Curve** toggle on the dope sheet shows the selected parameter as a value-over-time graph — drag points to change value or retime them, double-click to add, right-click to set easing/interpolation.
- **New animation presets**: Kaleidoscope (spins the final transform — great with Symmetry), Bloom, Shear Sway, and Glow Pulse.
- **Randomizer preview gallery**: browse a page of random-flame previews and click one to apply it, instead of click-spamming Generate. An **Advanced gallery** modal adds bigger previews, a count selector, mutation "breeding", and preview size/brightness controls.
- **Inspect before applying**: a hi-res preview action on each gallery item shows a flame large and at high quality before you load it; gallery thumbnails also render sharper on more capable GPUs.
- **Variation groups in the randomizer**: enable or disable whole categories of variations (General, Blur, …) at once; new flames default to General + Blur.
- **Collapse all transforms**: a sidebar button folds every transform card at once.
- **Benchmark workload badge**: the results view and the shareable image now show which benchmark (Small / Medium / Large) was run.
- **Frame-preview options** in the animation export: preview every Nth frame for a quick overview of long animations, a **Render more** button, and Low / Mid / High quality presets.
- **Background exports**: image and (opt-in) animation exports render in the background, so you can keep editing while they finish. A top-right Exports panel tracks each job with progress, 2D/3D and file-type badges, and frame count, plus **Stop & Save** and **Cancel**.
- **Export resolution & aspect ratio**: pick 1K / 2K / 4K and an aspect ratio (Auto, 1:1, 16:9, 9:16, 4:3) for both image and video exports.
- **Fly-mode roll & free flight**: in 3D fly mode, **Q/E** roll the camera and **Space/C** move up/down, for full six-degrees-of-freedom navigation.
- **Live FPS readout** while playing the timeline in Auto FPS mode.
- **Keyframe on randomize**: an opt-in toggle in the colour and affine editors so a single randomize keyframes every changed value at once.
- **Deselect a transform** by right-clicking (or long-pressing on touch) its affine handle.
- **GPU details on Firefox**: the device panels now show your GPU on Firefox.
- **Point Batch** render setting (animatable): how many points each chain plots per batch — set it to 1 for the classic behaviour.
- **3D auto-exposure**: a toggle and **Strength** slider that keep close-range 3D flames from blowing out as you zoom in.
- **Mitchell–Netravali filter** (2D and 3D) for sharper resampling, toggled from the action widget.
- **Transform selection**: click a transform's colour swatch to select it and dim the rest; `Esc` clears it.
- **Colour editor grid/list views** and animatable per-transform colours — the randomizer can animate colours too, not just the palette.
- **Export preview shows the blended flame**, so it matches the result.
- **Benchmark**: small/medium/large flame selector, achievement badges, and save-as-PNG.
- **Fly mode for 3D flames**: a first-person navigation toggle (action widget, second row, 3D only) that lets you move _through_ the fractal. `W`/`S` fly along the view direction, `A`/`D` strafe, `Q`/`E` descend/ascend. Click the canvas to capture the mouse for first-person look via the **Pointer Lock** API (move to look, `Esc` to release; drag-to-look is the fallback when lock is unavailable). Movement speed is adjustable live by scrolling while flying, and a **Speed** scrub appears in the View Controls next to the camera options.
- **Smart affine mutation mode**: the Flame Randomizer's _Mutate_ now offers **Smart** vs **Full** affine handling. Smart composes the existing affine with random, well-defined rotate / scale / flip / translate operations (2D and 3D), so mutations stay recognisable instead of collapsing the map; Full keeps the previous per-coefficient randomization. The mode is remembered between sessions.
- **Copy full (permanent) share link**: the Share dialog now explains that short `?s=` links expire after 60 days and adds a **Copy full link** action for the self-contained `?flame=` link, which carries all the data inline and never expires.
- **Storage usage & data management (About panel)**: a new _Storage & Data_ section shows how much space each group uses (settings, recent flames, generated history, logo/favicon history) with item counts and a total. A **Danger Zone** offers two separate, confirm-gated actions — clear all settings, or delete all stored flames — each listing exactly how many items and how much space will be recovered.
- **Backup / export all flames as a ZIP**: from the same panel, export a ZIP of your flames as JSON descriptors and/or PNGs with the flame embedded (from the stored history thumbnails). Recent, generated and logo/favicon groups are individually selectable, the export content is switchable (**JSON + PNG / JSON only / PNG only**), and a `manifest.json` records the export. (Built on `fflate`; fresh high-resolution batch renders are a planned follow-up — any flame can already be loaded and re-exported at full quality.)
- **Rich link-sharing previews (Open Graph)**: shared flame links now produce a social preview card on Discord, Slack, X, Facebook and LinkedIn that shows the actual rendered flame. When you create a share link the app renders the flame, downscales it, embeds the flame descriptor into the PNG, and stores it on Cloudflare R2 (content-addressed by the payload hash); the Worker serves the image and injects `og:` / `twitter:` meta tags for both `?s=` short links and `?flame=` long links. Downloading the preview image lets you load the flame straight back into the app. Runs entirely on the Cloudflare free tier.
- **Request-benchmark deep link**: a `?benchmark` query param (also `?benchmark=1` / `?benchmark=true`) skips the welcome screen and opens the benchmark dialog on load, so the app lands one click ("Run Benchmark") from a standardized GPU benchmark. `?benchmark=auto` additionally starts the run automatically; `?benchmark=0` / `?benchmark=false` are treated as off.
- **More 3D variations**: Added 11 new 3D variations — 7 parametric (`rectangles3D`, `splits3D`, `modulus3D`, `separation3D`, `blob3D`, `bent2_3D`, `zScale3D`) and 4 simple (`hemisphere3D`, `scry3D`, `square3D`, `blur3D`) — ported from their 2D counterparts and extended along the z axis.
- **3D starting flame preset**: Added `initExample3D`, a clean single-`linear3D` identity flame, to the example/preset list as a blank-slate 3D starting point.
- **Curated 3D variation previews**: Added tuned `previewFlames3D` overrides (pre-affine, params, exposure and camera) for `pdj3D`, `rectangles3D`, `fan3D` and `sinusoidal3D` so their gallery thumbnails present the variation shape naturally instead of the flat identity default — the 3D analog of the existing 2D `previewFlames` overrides.
- **3D Fractal Flame Rendering**: Implemented a WebGPU-based 3D rendering pipeline for IFS fractal flames.
- **3D Example Gallery**: Added new architectural 3D examples (Examples 32-44) and 6 3D animated preset loops.
- **Smooth 3D Controls**: Added instant key-loop panning (W/A/S/D and arrows) for smooth 3D camera navigation.
- **Performance Cap**: Integrated dynamic rendering caps (capping active frames to 8 iterations) during viewport orbiting, panning, and timeline playback to keep interactions responsive.

### Changed

- **Security**: the Discord webhook is no longer embedded in the app bundle — sharing goes through the Worker, which holds the webhook as a secret. The **Join Discord** invite is likewise served via a `/discord` redirect (kept out of the bundle and rotatable) instead of being hard-coded.
- The variation browser's large preview now renders at full quality on capable (high/ultra) GPUs instead of a heavily throttled mode that looked noisy/over-bright and updated jerkily.
- Palette animation presets are clearer: **Palette Sweep / Palette Bounce / Palette Speed Up / Palette Speed Wave** (was the ambiguous "Phase"/"Speed").
- The **Subtle** randomize toggle now clearly shows when it's on.
- In 3D, the camera **θ (theta)** value is shown wrapped to 0–360° instead of growing without bound.
- **Colour editor**: left-click a wheel handle to select it and click again to deselect (right-click still deselects).
- **One active selection** across the randomizer card — the gallery and recent-history highlights no longer show at the same time.
- **Animation export previews** now match the chosen export **aspect ratio** (including the hover popup), and the preview controls are reorganised into a cleaner settings panel that locks while previews render.
- **Exposure** value in the render settings shows two decimals, so it no longer flickers under 3D auto-exposure.
- **Stable transform order**: transforms stay put — new ones appear at the bottom, and undo restores an item to its original place.
- **Clearer animation button**: a distinct icon and tooltip for each state (enable / pause / disable).
- **Expanded guided tours** covering the timeline, Point Batch, symmetry, randomizer, metadata, 2D/3D and fly mode — with every step landing on the right control.
- **Protected transforms**: editing a selected transform no longer disturbs the others, with clearer affine handle states.
- **Action-widget row regrouped** with clearer tooltips.
- **Randomize transform colour** now picks any hue evenly (it used to lean toward red/orange).
- **Variation thumbnails** are brighter and crisper.
- **3D zoom floor**: orbit zoom is clamped (use fly mode to go closer) so extreme zoom can't blow out brightness.
- **Theme toggle moved from `D` to `Ctrl/Cmd+D`**: plain `D` is part of the 3D camera's WASD pan controls, so it double-fired (panning the camera _and_ flipping the theme). The dark/light toggle now lives on `Ctrl/Cmd+D`, and the 3D camera ignores movement keys pressed with a modifier. The About panel's shortcut list reflects the new binding and gains a dedicated **3D Camera** section documenting orbit (left-drag), pan (right/middle-drag, WASD/arrows) and scroll-to-zoom.
- **Schema-validated preview flames (2D & 3D)**: Refactored the flame descriptor schema into a shared `makeFlameDescriptorSchema` factory that produces both 2D (`FlameDescriptor`) and 3D (`FlameDescriptor3D`) descriptors. The variation-preview and randomizer flame builders now go through `defineExample`/`defineExample3D` instead of unchecked `as unknown as FlameDescriptor` casts, so every render default is filled consistently.
- **Dimension-aware flame validation**: `validateFlame` now dispatches to the 3D schema when a descriptor declares `dimensions: 3`, preserving 12-parameter 3D affines (`a`–`l`) instead of silently stripping them to a 2D affine on load.
- **Color grading defaults**: Restored the missing `vibrancy` fallback in the color-grading uniform writer to match its sibling fields, hardening against any flame that omits the field.
- **Brighter, closer 3D variation previews**: Raised the 3D preview exposure and pulled the preview camera closer (via `getDefaultFlameByVarType3D`) so 3D variation thumbnails read clearly at gallery size.
- **Directional Lighting Shadow Model**: Refactored `lightFactor` calculations in the shader to use saturated interpolation, preventing negative scaling and harsh black creases when `lightPower > 1.0`.
- **Smoother Shading Normals**: Lowered normal estimation `zScale` from 150.0 to 100.0 to reduce noise artifacts.

### Fixed

- **Mitchell-Netravali (MN) filter grain**: the MN sample weight is now clamped to ≥ 0 before the fixed-point cast. Negative kernel lobes cast to `u32` are undefined in WGSL and wrapped to huge values on some GPUs, producing bright speckle grain (worst while panning/zooming, clearing when still). Fixed in both the 2D and 3D pipelines.
- Selecting a variation in the browser no longer over-brightens the preview — the flame keeps its own exposure (variation thumbnails stay bright only for legibility).
- The timeline/dope-sheet **resize handle now works on touch devices** (e.g. iPhone), not just larger screens.
- The dope-sheet **Curve** and **Seek** toggles now reflect their on/off state immediately when tapped.
- **Animation export**: the per-frame point counter no longer reads "0 / 0" for 2D flames, and the finished-export thumbnail shows the real first frame instead of a blank/green rectangle.
- Animated **edge-fade colour** now actually applies during playback/export (the keyframe track was writing to the wrong place).
- **Animation presets**: Scale, Rotate 90°, Drift and the auto-animation spin now move the flame correctly (they used the wrong affine coefficients), and the **Pan** presets actually move the camera during playback.
- **3D fly mode**: mouse-look no longer veers off after you roll the camera, and exiting fly mode re-levels the horizon for orbiting.
- The timeline playhead now spans **all** tracks when scrolled, not just the visible ones.
- Keyframe values display with sane precision instead of a long string of decimals.
- Fixed a shader-compilation error in the **Pixel Flow** variation.
- Custom variations are now categorised correctly.
- Quality-preset buttons highlight on hover instead of dimming.
- The hi-res flame inspect no longer darkens as points accumulate.
- **Timeline scrubbing on tablets** no longer loses the touch and stops partway.
- **Pause stays clickable during playback**, and the dope sheet stays readable while playing.
- **2D and 3D keyframes stay separate** when switching a flame between 2D and 3D.
- **3D export fixes**: 3D flames export correctly, and the orbit "clap" near the poles is gone.
- **Export progress** no longer flickers, and **Stop & Export** can't be double-clicked while a job finalizes.
- **About panel** layout on mobile.
- **More variation thumbnails** render visibly (framing and brightness fixes).
- **Safer flame loading** for older and 3D saved flames.
- Slow-mixing flames no longer darken as they keep rendering.
- The 3D final transform no longer collapses into a flat "pancake" when its handle is dragged.
- Variation thumbnails no longer render colourless, shrinking, or invisible.
- The quick-variation gallery keeps its thumbnails when a category filter is applied.
- Colour editor: handle NaN guard, grid/list toggle placement, and toolbar cleanup.
- **Right/middle-click drag-to-pan in the 3D view did nothing**: the 3D camera routed middle- and right-button drags to its pan handler, but the shared drag helper (`createDragHandler`) silently ignored every button except the left one, so mouse panning never started — only WASD/arrow-key panning worked. The drag helper now takes an optional `button` set, and the 3D camera registers pan on the middle (1) and right (2) buttons while orbit keeps the left button. Right-click still suppresses the context menu over the canvas.
- **3D pan speed was unusable at zoom extremes**: pan distance scaled linearly with the orbit radius, so panning was wildly fast when zoomed far out and crawled when zoomed in close. The radius factor is now clamped to a sane range for both mouse and keyboard panning.
- **`D` could get stuck in 3D camera/fly mode**: `D` is also the theme-shortcut letter, so when a modifier joined a held `D` (or it repeated modified) the camera kept its keyup-less "down" state and drifted. Movement keys pressed with a modifier are now released, and all held keys are dropped when the window loses focus. While flying, movement keys are also claimed in the capture phase so page-level browser extensions (e.g. Vimium's single-key `d`) can't intercept or half-swallow them.
- **Animation-randomizer keyframes flagged as invalid**: the dope sheet's "orphaned track" check used a hand-maintained allowlist that omitted `finalTransform` (and `blendWeight`, `colorInitMode`, background/edge colors, …), so valid keyframes — e.g. the _Final Transform Spin_ preset — were shown red with a "tracking target is missing" warning. The check now derives the set of valid built-in parameters from the authoritative parameter list.
- **Variation previews rendered as blank gray blobs**: Preview flames built for the variation selector and quick-picker gallery skipped schema validation after the 3D expansion, leaving render defaults unset. A missing transform `visible` forced the IFS probability to 0 (no shape) and a missing `vibrancy` multiplied chroma by 0 (no color). Previews now show correct, colored variation shapes in both 2D and 3D.
- **Dark halo around 3D variation previews**: the 3D preview thumbnails ran the adaptive density-estimation blur that the 2D thumbnails skip, which smeared the projected cloud's sparse edge into a vignette. The 3D thumbnails now render without it, matching the 2D path.
- **3D parametric variations showed no parameters**: the variation selector and the main-workspace sidebar gated the parameter editor on a 2D-only check (`isParametricVariation`), so 3D parametric variations (e.g. `pdj3D`) exposed no sliders. Both now use a combined 2D/3D parametric check (`isAnyParametricVariationType`).
- **`fan3D` azimuthal seam**: the wedge wrap used `i32()` truncation toward zero instead of `floor`, so azimuths below `-spreadTheta/2` folded the wrong way and left a seam on the −x side. Now uses `floor` for a correct modulo across the full angular range.
- **WebGPU Memory Leaks**: Solved a critical VRAM leak and crash by untracking animated timeline frames during blur pipeline checks and implementing cleanups for WebGPU pipeline buffers.
- **Adaptive Blur Depth**: Restored Z-depth copying in the adaptive blur pipeline so that depth coloring and directional lighting apply correctly to blurred frames.
- **Blend Gallery Exclusion**: Excluded 3D flames from the 2D blending view.

### Performance

- **~3.4× faster rendering**: flames now resolve much faster (about 5 → 17 billion points/sec on the reference flame) by plotting every iteration after warmup and reusing work between passes. Tune it with the new **Point Batch** setting.
- The brightest regions no longer overflow into dark or garbage pixels.

### Security

- Patched the **esbuild** and **ws** advisories.

### Internal

- Extracted shared share-link and OG-preview helpers (`utils/shareLink.ts`, `utils/blob.ts`) so the Share Link modal and the Discord share build links identically — a short link when available, with graceful fallback to the inline `?flame=` link.
- Local dev: added a `wr-dev` script (`wrangler dev --env dev`); the vite dev server now proxies `/api` and `/discord` to the Worker and fails fast when it isn't running; added a pre-commit hook that auto-formats staged files.
- Dependencies: bumped `wrangler` to 4.103.0 and pinned `undici` to `^7.28.0`, clearing the open security advisories.
- Resolved a long-standing case where local `pnpm typecheck` could pass while CI failed on the same commit: the build output (`dist/`) was being type-checked, which silently widened the validation (valibot) types to `any`. The type-check now excludes build output, strict `noImplicitAny` is enabled, and a pre-push hook keeps local and CI in lockstep.

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
