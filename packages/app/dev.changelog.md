# Changelog (developer / detailed)

Full, granular change history with per-patch detail and internal notes. This is
the developer reference and is NOT shown in the app. The concise, user-facing
changelog surfaced in the About panel lives in `CHANGELOG.md`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

A Home tab backed by a D1 content database — live WebGPU flames rather than
screenshots, bounded by the existing visibility/compute gating — plus the
poster-capture pipeline and admin flow that curate it, and a `wrangler dev`
custom-build fix that had been OOM-killing developer workstations.

### Added

- **Gallery content database** (`migrations/0001..0004`, `worker/index.ts`,
  `lib/galleryContent.ts`): D1 holds the FlameDescriptor spec itself, not
  images — `gallery_items` (section, slug, capability, dimensions, transform
  count, animation tracks), `poster_key` + the timeline frame the poster was
  captured at (so an animated row can freeze back to the exact pose), a
  `home_config` table for the tour, and a generated-once `sequence` column for
  the curated roll-then-steer walkthrough. `GET /api/gallery` lists rows
  WITHOUT the descriptor; `GET /api/gallery/:slug` fetches it on demand, so
  Home never pulls every flame up front.
- **Home tab** (`components/Home/`): the AABAAA layout — left rail, full-bleed
  hero, editorial-span gallery, motion row, "Made here" portal, capability
  cards. Plates mount a live `Flam3` only once settled in view and freeze back
  to their poster on convergence; `HomeFlame` holds the gating,
  `homePlayback.ts` the one page-wide playback budget, `portalScript.ts` the
  tour. Posters are the fallback wherever WebGPU is unavailable.
- **Poster capture + gallery admin** (`scripts/`, companyReportViewer console):
  capture runs on the local GPU and uploads the D1 row and R2 poster in one
  click; drag-and-drop curation, local/dev/prod targets, publish/unpublish.
- **Plate camera** (`components/Home/HomeFlame.tsx`): a selected plate swaps
  its static preview camera for the app's own `WheelZoomCamera2D` /
  `WheelZoomCamera3D` — pan, orbit, wheel zoom and pinch are the SAME code the
  workspace uses, not a second implementation. Per-flame clamps (zoom
  0.4-3x, orbit radius 0.5-1.6x, pan ±1.6 world units) keep a steered plate
  framed; the signal bundles are rebuilt on the engage edge, so releasing
  resets the camera without a separate reset path that could drift.
- **Click-vs-drag disambiguation** (`components/Home/plateGesture.ts` + 20
  tests): a plate is now a two-step control, because "the pointer went up here"
  stopped meaning "open this" once plates carried a camera. A DOM-free state
  machine over `{clientX, clientY}` + an injected clock decides drag (>5px) vs
  press (>500ms) vs tap, and pairs taps into a double-click (400ms / 24px slop)
  itself rather than listening for the browser's `dblclick`, which fires after
  `click` and would make every open follow a select. Keyboard opens directly on
  Enter/Space — no drag ambiguity there.
  Two defects found by testing the wiring rather than reading it:
  - **The camera was unreachable.** `WheelZoomCamera*` listens on the CANVAS
    (`props.eventTarget ?? canvas`), which is `pointer-events: none` so an
    unselected plate stays a single click target — mounted, listening, and
    unhittable. Dragging did nothing at all. A selected plate's canvas now
    takes pointer events, plus `touch-action: none` so a finger pans the flame
    instead of scrolling Home out from under it.
  - **...and then the gesture starved.** `createDragHandler` calls
    `stopImmediatePropagation()` on pointerdown and pointerup — it must, or a
    workspace drag would double as a click on whatever is underneath. The
    canvas is the event target, so the tile's bubble-phase handlers never ran:
    panning worked and double-click did nothing. The tile listens in the
    CAPTURE phase now (document -> tile -> canvas), so it sees every sequence
    before anything downstream can take it away.
- **Breed sequences** (`scripts/derive-sequence.entry.ts`,
  `scripts/gallery-sequence.mjs`): `--mode breed` derives a row's sequence with
  the app's own `breedFlames` — the row's flame is parent A, a freshly rolled
  flame is parent B, each entry a child of the two, cycling the crossover mode
  per child. Parent B is emitted first: a breed sequence that never shows the
  second parent is indistinguishable from mutation. `cap-genetics` plays a walk
  now instead of resting on a still it could not justify. No schema or player
  change — migration 0004 already specified that nothing knows how long a path
  is.
- **`gallery-admin sequence`** (`scripts/gallery-admin.mjs`): curated sequences
  were terminal-only, because the console's wrapper always execs
  `gallery-admin.mjs` and a sibling script is unreachable from there. The new
  subcommand COMPOSES `gallery-sequence.mjs` (the same way `capture` composes
  the poster pipeline) rather than duplicating the one piece of tooling that has
  to run app TypeScript. The wrapper is a pass-through, so the console reaches
  it with no dotfiles change — only buttons to wire.

### Changed

- **Home art direction** (`HomeTab.module.css`): Home now carries its own
  scoped palette rather than following the app theme, matching the Benchmark
  Studio language — near-black ground, hairline borders, ambient warm/cool
  radials, ember (`#ff7448`) as the accent. A gallery is a dark room: the same
  posters read as washed-out thumbnails on a light surface, and committing to
  one palette keeps the full-bleed hero framed identically regardless of a
  theme setting nobody chose for this page. The nine `[data-theme='dark']`
  overrides are gone with it.

### Fixed

- **`wrangler dev` OOM-killed the workstation** (`packages/app/wrangler.jsonc`,
  `packages/app/package.json`): both envs declared `build.command`, and
  wrangler runs a custom build for `dev` as well as `deploy`, re-running it on
  every change under `watch_dir` — which defaults to `./src`, the whole app.
  The documented dev setup (`vite.config.ts`) is vite on :5173 proxying `/api`
  and `/discord` to wrangler on :8787, so during development NOTHING reads the
  bundle wrangler produced — vite serves the app. Every file save therefore
  started a full `vite build --mode development` (~1.5 GB, ~1 min) whose output
  was discarded, and wrangler neither queues nor cancels them: an editing
  session stacked dozens concurrently until earlyoom started killing processes
  (observed four times, once at ~60 GB RSS). Removed from both envs; deploys
  build explicitly instead (`deploy:dev`/`deploy:prod`, and CI's existing
  "Build app" + "Verify build output" steps). Verified: `wrangler dev` boots
  and three source-file touches produce zero builds.
- **Hero flashed white on scroll** (`HomeFlame.tsx`): mounting was gated on
  _settled_ visibility per `gallery_preview_layout` §3 — correct for STARTING a
  canvas, wrong for STOPPING one. Because the scrolling signal is global, every
  scroll anywhere tore down the canvas of every live plate and rebuilt it
  ~180ms later from zero. Ordinary plates had already frozen to their posters
  so nobody saw it; the hero never freezes, so it re-accumulated from scratch
  and showed the washed-out first batch each time. Mounting is now latched:
  settled visibility starts a canvas, only leaving the near-window stops it.
  Reveal is also thresholded (25% progress) and latched, so a camera pan cannot
  drop an already-revealed plate back under the threshold and fade the poster
  in over the render the user is steering.
- **Audio loading reported nothing, and playback was hostage to it**
  (`AudioReactivePanel.tsx`, `MainWorkspace.tsx`, `utils/useAudioReactive.ts`).
  Three causes, all separate: `isAnalyzing` compared `fileAnalyzer() === null`
  against a signal holding `undefined`, so the memo was ALWAYS false and the
  "Analyzing audio…" overlay it gates had never once rendered; that overlay's
  bar was hard-wired to `beatProgress`, which stays 0 for the whole analysis, so
  it would have shown 0% anyway; and `createAudioAnalyzer` already accepted an
  `onProgress(current, total)` that nobody passed. Now wired, throttled to whole
  percents — the callback fires once per FRAME, ~32k times for 18 minutes at
  30fps, so publishing every call would cost more than the analysis. Separately,
  `useAudioReactive` ran `fullCleanup()` (closing the AudioContext) whenever
  `audioEnabled` went false and returned early when the analyzer was missing —
  so the transport died with live preview, and the play button was inert during
  analysis. Transport is no longer gated on either; only the feature→parameter
  mapping is. Mic mode stays gated, deliberately: a file has something to
  audition, an open capture is all cost and a privacy surprise.
- **3D flames lost most of the toolbar** (`ViewControls.tsx`,
  `BlendFlameGallery.tsx`, `MainWorkspace.tsx`, `flame/breedFlame.ts`): a single
  `<Show when={!props.is3D}>` wrapped Blend, Morph AND everything after them, so
  loading a 3D flame silently removed Audio Reactive, Sonification, Breed,
  Evolve, Simulator, Ancestry, Diff and the Gallery. Only Blend and Morph have a
  reason — they interpolate through the blend pipeline, and `ifsPipeline3D`
  has no blend input at all. The picker also filtered candidates with
  `dimensions !== 3`, so a 3D flame was offered only 2D partners; every one was
  a mismatch, and a mismatch does not degrade — crossover copies whole
  transforms, a 2D transform's affine has no `g`..`l`, and the child fails
  `validateFlame`, which THREW inside BreedGallery's signal initialiser. The
  modal never rendered and the click looked ignored. The picker now matches the
  caller's dimension (morph still asks for 2D), `breedFlames` returns `[]` on a
  mismatch instead of throwing, and the hover preview — which IS the blend
  mechanism — is skipped in 3D rather than changing the name while the picture
  stays still. Two regression tests.
- **Re-staging left a stale sequence** (`scripts/gallery-admin.mjs`): `put`
  upserts a row and deliberately clears `poster_key`/`poster_frame`, because
  both describe the flame being replaced. A curated `sequence` is derived from
  that flame too, and was never added when migration 0004 introduced the
  column — so re-staging left the card opening on the new flame and then
  playing a path belonging to the old one, which reads as a rendering bug
  rather than as stale content. Cleared with the rest now, warned about
  explicitly, and the `next` hints carry the regenerate command. `ROW_COLUMNS`
  also reports `has_sequence` (presence, not the flames), so the console can
  show which rows play a walk.
- **Workspace hand-off** (`MainWorkspace.tsx`): opening a gallery flame resets
  panels, live modulation and the timeline first, so leftover exposure/vibrancy
  tracks stop modulating the new descriptor every frame ("too bright"), and no
  dialog stays open across the hand-off.

## [0.9.8] - 2026-07-24

iOS/macOS WebKit rendering correctness (render-loop stall recovery, spurious
resize rebuilds, stale-swapchain flicker), first-party GA4 telemetry for the
conversion funnel, a toast/notification overhaul (top-right, stacked, sticky
questions), and post-rebrand deploy cleanup.

### Added

- **GA4 telemetry** (`lib/telemetry.ts`, `index.tsx`, `MainWorkspace.tsx`,
  `utils/shareLink.ts`, `DiscordShareModal/`, `worker/index.ts`): gtag
  bootstrap gated on `VITE_GA_ID` (committed default in `.env`); events
  `app_init` (with `webgpu_supported`), `flame_shortened`,
  `og_preview_generated`, `flame_shared_discord`. `e2e:serve` blanks
  `VITE_GA_ID` at build time so local/CI Playwright runs never load gtag or
  emit real events, and `initTelemetry` bails on localhost so development
  sessions stay out of the property (deployed dev still reports — separate it
  by hostname in GA).
  Two defects found in review and fixed before release:
  - **CSP allowlist** — the Worker's `Content-Security-Policy` did not include
    `googletagmanager.com` (`script-src`) or `*.google-analytics.com`
    (`connect-src`/`img-src`). Since `run_worker_first` routes `/` through the
    Worker, the loader was refused in production and _no event would ever have
    been recorded_; only the static landing reported.
  - **`page_location` scrubbing** — GA4's default page_view sends the full
    href. The app puts user content and capability tokens in the query
    (`?flame=` encoded flame + timeline, `?cv=` user-authored WGSL, `?s=` the
    short id that resolves to a stored payload), so every shared link opened
    would have handed Google enough to reopen the flame. Now reported as
    origin + pathname. Fixing the CSP without this would have switched the
    leak on.

### Fixed

- **iOS render-loop stall + console errors**
  (`utils/createAnimationFrame.ts` + new tests): the GPU-queue hold
  (`onSubmittedWorkDone`) slot is now released on resolve _and_ reject, with a
  2s per-hold timeout for holds that never settle (hung queue on iOS WebKit) —
  the `framesPending` cap can no longer wedge the loop after 3 frames
  ("blank until you touch the camera"). Stall diagnostics throttled to the
  first + every 60th occurrence.
- **Spurious same-size rebuilds** (`utils/useElementSize.ts`): identical
  width/height/physical-px updates from `ResizeObserver` reflows (iOS modal
  open/close, safe-area/URL-bar shifts) are skipped, so `outputTextures` no
  longer reallocates every WebGPU buffer and accumulation no longer resets
  without a real size change.
- **Stale-swapchain flicker on flame load** (`flame/Flam3.tsx`,
  `utils/platform.ts`): a present pump re-blits the color-graded accumulation
  every frame while a flame is still accumulating, so iOS WebKit never
  composites a stale buffer between the throttled IFS presents. Gated to
  Apple WebKit (`navigator.vendor`), the main canvas, a finite
  `renderInterval`, and non-export frames — review showed an ungated pump
  costs real throughput everywhere else: a re-blit is a full-screen
  color-grading pass in the same queue, and with `TRACK_PERFORMANCE` off the
  wall-latency estimator folds it into `ifsMs`, shrinking the iteration count
  and slowing accumulation on Blink/Gecko. The `renderInterval === Infinity`
  clause matters most: that state means a modal gallery has deliberately taken
  the GPU and the accumulation buffer is frozen, so an ungated pump re-blit an
  identical image at 60Hz against the very previews the pause exists to feed. Plus `rafLoop?.redraw()` guard, `DEBUG_MODE`-gated
  renderTick bail diagnostics, and an Infinity→finite `renderInterval` redraw
  kick after modal-driven pauses. On-device verified (iPhone 13 Pro, iOS 26.x).

### Changed

- **Toast overhaul** (`contexts/ToastContext.tsx` + tests,
  `components/Toast/Toast.tsx`, `App.tsx`, `MainWorkspace.tsx`,
  `components/ExportJobs/ExportJobTracker.tsx`, `App.module.css`): one global
  `ToastHost` fixed top-right at z-index 100000, above every normal-layer
  overlay (side panels 200-301, debug 10000, export hover overlays 99999) —
  previously the only renderer was an inline div in MainWorkspace that sat
  _under_ those, dropped the action buttons (`Toast.tsx` was dead code), and
  carried a 3.2s CSS fade that killed even 15s toasts. It does **not** clear an
  open `<dialog>`: `Modal.tsx` uses `showModal()`, so dialogs sit in the top
  layer and mark the rest of the document inert — toasts fired from inside one
  (HelpModal hardware detect, DataManagement backup, ShareLinkModal,
  CustomVariationEditor) wait until it closes, exactly as before.
  Toasts now stack (cap 4, duplicates restart their timer) instead of
  replacing each other, and `'sticky'` toasts have no timer at all — the
  autosave consent prompt now waits for Yes/No instead of vanishing
  unanswered. Eviction prefers plain toasts over ones carrying actions (the
  custom-variation delete offers Undo as its only recovery path) and falls
  through to the oldest of any kind so the column stays bounded even if every
  slot is sticky; `'sticky'` with no actions degrades to a timed toast rather
  than stranding an undismissable one. Store API is `untrack`ed so a
  `showToast` inside a caller's effect can't subscribe to the toast list (that
  subscription made timer-driven removals re-run the effect and resurrect the
  toast forever — pinned by a regression test).
  Surface adopts the `hover-preview-badge` material (translucent tinted oklch,
  hairline border, `blur(10px)`, shared `cubic-bezier(0.22, 1, 0.36, 1)`) so it
  reads as part of the app over a live fractal instead of a generic snackbar;
  the blur is legibility over arbitrary canvas colour, not decoration. The
  earlier 3px accent left-border is gone — it was also dead in the default dark
  theme, where `[data-theme='dark'] .toast` (0,2,0) outspecified
  `.toast-actionable` (0,1,0). `ExportJobTracker` now publishes its measured
  height as `--toast-stack-offset` so the toast column stops covering its
  collapse control and Download buttons in the shared top-right corner.
  Verified in-browser end to end against the deployed preview build:
  placement, layering (`elementFromPoint`), stickiness past the old timers,
  Yes persisting `editor/autosave-recents`, plain toasts auto-hiding.
- **Deploy cleanup** (`wrangler.jsonc`): legacy `chaos-master.com` routes
  dropped after the zone redirect cutover.

## [0.9.7] - 2026-07-16

The Lumen Apeiron release: full rebrand (product + domains + SEO/OG), the
audio-reactive/sonification suite, the flame-genetics suite (breeding,
evolution, population simulator, ancestry, diff), a toolbar/gallery/export UX
polish pass, and a batch of correctness fixes surfaced by review.

### Added

- **Rebrand + SEO** (`index.html`, `worker/index.ts`, `wrangler.jsonc` x2,
  landing): product renamed Lumen Apeiron; routes moved to `lumenapeiron.com` /
  `dev.lumenapeiron.com` / `about(.dev).lumenapeiron.com` with the legacy prod
  custom domains kept bound until the zone redirect flips (comments mark the
  cleanup spots). Worker names and KV/R2 bindings unchanged on purpose (same
  workers keep secrets + stored OG images). Marker-wrapped default OG block in
  `index.html` that the Worker swaps per-share (no duplicate `og:*`), default
  OG cover for shares without an uploaded preview, `robots.txt` + `sitemap.xml`
  for both sites, branded 2400x1260 `og-cover.jpg` regenerated via
  `packages/landing/scripts/generate-og-cover.mjs`.
- **Audio-reactive flames** (`utils/audioAnalysis.ts`, `AudioReactivePanel/`,
  `AudioWiringModal/` + `NodeGraphView`, `utils/audioExport.ts`): mic/file
  analysis (frequency bands, RMS, centroid, flatness, beat/onset), mappings to
  render settings / affines / transform properties / variation weights with
  attack/release envelopes, presets + randomize, full-screen node-graph wiring
  editor with undo/redo, waveform seek, audio-synced MP4 export. Sonification
  engine renders the flame structure as real-time audio.
- **Flame genetics** (`flame/breedFlame.ts`, `flame/fitness.ts`,
  `flame/fdiff.ts`, `flame/ancestry.ts` + `ancestryDb.ts`, `BreedGallery/`,
  `EvolutionChamber/`, `PopulationSimulator/`, `AncestryTreeModal/`,
  `DiffViewModal/`): five crossover strategies (uniform/weighted/shuffle/
  alternate/smart), per-strategy child assembly with param/color cross-breeding
  and light mutation; Evolution Chamber generational history; autonomous GA
  simulator (truncation/tournament/roulette selection, elitism, fitness =
  variation diversity + weight balance + OkLab color spread + structural
  complexity); IndexedDB-backed ancestry with debounced writes; structural
  diff (greedy transform matching + render-settings comparison). Mutation Lab
  rate controls in the randomizer (`MUTATION_PRESETS`, per-kind rates).
- **Gallery mode of the Load dialog** (`LoadFlameModal.tsx`): search,
  variation-tag cloud derived from the flames (top 18 by count), Bred &
  Evolved section fed from the ancestry store; Gallery… toolbar button opens
  it. The placeholder-XML `FlameGallery` component and `flameGalleryData.ts`
  are removed.
- **PullUpMenu** (`components/PullUpMenu/`): portal-based upward menu used to
  group the toolbar's Audio and Genetics launchers; the view-controls bar pans
  horizontally on narrow viewports.
- **Export dialog frame awareness** (`ExportPngDialog.tsx`): "Frame N/M" chip
  - Sync (re-snapshots the preview from the timeline, keeping metadata edits)
    and an "@ frame N" hint on the render-setting sliders.

### Changed

- **TypeGPU 0.11** (`chore(deps)`) with strict-eq NaN guards in TGSL
  (`ifsPipeline*.ts`) and camera NaN/Inf hardening; `eslint-plugin-typegpu`.
- **Export preview parity**: the Render Flame preview renders with
  `adaptiveFilterEnabled` like the canvas and the offscreen jobs — with
  `paletteMode 0` the palette index derives from log-density, so the
  unfiltered preview used to shift hues, not just sharpness.
- **Population Simulator brand kit** (`PopulationSimulator.module.css`):
  scoped `--la-*` tokens from the wordmark gradient, gradient-hairline glass
  cards with an iterated-corner motif, brand chips/sliders/progress.
- **Wiring editor JSON flows** (`AudioWiringModal.tsx`, `HeaderBar.tsx`):
  Copy JSON with button-local "Copied" feedback (the overlay sits above the
  toast layer), and an in-modal import panel — clipboard auto-read + validate,
  paste textarea, load-from-file, structural validation.
- Docs: 31 shipped plans/audits archived to `docs/plans/archive/`; roadmap,
  templates, and live docs corrected for the rebrand and shipped features.

### Fixed

- **Audio mapping sliders only responded to clicks** (`AudioReactivePanel`):
  the reference-keyed `<For>` recreated a row's DOM on every `onInput`,
  killing pointer capture mid-drag — now `<Index>` with narrow-friendly
  target helpers.
- **Breeding review batch**: pause/resume no longer discards the already-bred
  generation (shared `runLoop` with `pendingPopulation`); elapsed timer stops
  on pause/unmount; roulette fallback picks the best, not worst; empty
  offspring can't hang the breed loop; simulator breeds no longer flood the
  ancestry store (applied flames register via `ensureNode`); ancestry stores
  deep-cloned snapshots instead of live store references; ancestry tree
  re-rooting no longer snaps back to the workspace flame (`on(() =>
props.flame)`); zero-transform pipelines write `{ _dummy: 0 }` again;
  `uniformCrossover` fills from balance-skipped candidates so skewed parents
  reach the target count; `randomize.ts` re-aligned with main's helper
  refactor with Mutation Lab rates flowing through shared sigma helpers.
- **A11y**: breeding gallery tiles are real buttons (keyboard + focus ring);
  emoji glyphs replaced with SVG icons (new `Lineage` icon).
- Wiring overlay sits above the floating actions widget; audio panel's
  mapping actions row separated from the list.

### Tests

- New suites for `fitness`, `fdiff`, `ancestry` (hash determinism, lineage
  layering, snapshot semantics) and breeding edge cases (smart crossover,
  skewed-parent uniform crossover) — 1072 tests across 53 files.

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
- **Track selection** (`DopeSheet.tsx`): a `selectedTrack` signal lives
  alongside `selectedKeyframe` — lane/name clicks select the track only
  (clearing the keyframe selection, so the inspector stays hidden), diamond
  clicks select both, and `lastAddedKeyframe`/keyframe drags keep them in
  sync. The curve editor graphs `selectedTrack` (its selected-node highlight
  still keys off `selectedKeyframe`), and the keyboard-target effect
  (`setTargetedParameter`/`setSelectedKeyframePath`) follows the track, so a
  lane click aims the I-insert shortcut. A guard effect drops selections
  whose track was removed (context-menu delete, orphan cleanup, flame load).
  The current row is styled via `.trackRowSelected` (accent inset bar +
  tinted name + row wash, overriding the even-row/hover backgrounds).
- **About-panel changelog parser** (`Changelog.tsx`) folds hard-wrapped
  bullet continuation lines into the previous item — it used to keep only
  the first line of each `- ` bullet. The user-facing 0.9.3–0.9.5 entries
  were also condensed to outcome-level highlights; the detail lives here.

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
  row. The dope sheet container lost its floating-card chrome (8px top radius
  and 1px border) and the `.content` wrapper its 4px inset, so the sheet
  joins the header seamlessly and spans the panel edge-to-edge. All
  `data-testid`/`data-tour-target` hooks preserved.
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
  change: the frame at the lane's left edge is kept stable (scrollLeft scales
  by the width ratio) and the same value — clamped to the smaller of the two
  scroll ranges — is written to both panes; the ruler wrapper's own scroll is
  pinned
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

## [0.9.5] - 2026-07-02

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
