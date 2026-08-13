# Changelog

What's new in Lumen Apeiron (formerly Chaos Master). Concise highlights for
each release; the full developer history lives in `dev.changelog.md`.

## [0.9.9] - 2026-08-02

### Added

- **Benchmark Studio.** Open the Lab from the bottom toolbar or visit
  `/benchmarks` to compare the real WebGPU flame pipeline with repeatable,
  paired A/B runs. Choose example, recent, uploaded, or freshly generated
  flames; control the renderer, reconstruction filter, random sequence,
  initialization and workload; then inspect confidence intervals and raw
  samples or export JSON, CSV, and a shareable result card. Variation authors
  can also compare the built-in implementation with validated custom WGSL.
- **Home.** A front page for the app: a curated wall of flames, a row of
  animated pieces, a walkthrough of one flame being built step by step, and
  cards that open the tool each piece shows off. Nothing here is a screenshot —
  every flame renders live on your GPU, and falls back to a captured image when
  it can't. Click a flame to take its camera (drag to pan, scroll or pinch to
  zoom), double-click to open it in the editor. Reach it any time from the
  welcome screen, and reload straight back into it — Home has its own address.
  The Explore cards demonstrate what they describe rather than sitting still:
  the randomizer rolls a flame and steers it, and breeding crosses two flames
  and plays through their children, one for each crossover mode.

- **Audio presets that do something.** The wiring presets now drive the
  settings that visibly change the picture, and three of them are built from
  the flame you have loaded — re-weighting its own transforms, variation
  weights and affines, which is what actually makes a fractal move. A
  Randomize button sits with the mappings for a fresh wiring any time.
- **Ancestry as a family tree.** A Pedigree view puts a flame's parents above
  it and its children below, alongside the existing generations view.

### Fixed

- **The microphone works on the site.** Live mic input for audio-reactive
  flames and sonification was blocked outright on lumenapeiron.com — the
  browser never even asked for permission. It worked locally, which is why it
  went unnoticed.
- **Sonification's drums.** The percussive model was silent on every flame.
- **Sound stops when you close its panel**, unless you ask it to keep playing.
- **Loading a song tells you what it's doing.** The progress bar now reflects
  the real analysis pass instead of sitting at nothing, and a track can be
  played and scrubbed as soon as it decodes — you no longer wait for the whole
  analysis, or have to leave live preview switched on, just to hear it.
- **3D flames keep their tools.** Breeding, evolution, the population
  simulator, ancestry, diff, audio-reactive, sonification and the gallery were
  all hidden whenever a 3D flame was loaded. Breeding a 3D flame also found no
  partners to offer, so picking a second parent did nothing at all.

## [0.9.8] - 2026-07-24

### Added

- **Usage analytics.** Anonymous signals about which features get used. Your
  flames stay yours — share links and flame data are never sent.

### Changed

- **Notifications.** Messages now appear top-right and stack instead of
  replacing each other. Questions, like the auto-save prompt, wait for your
  answer instead of disappearing on their own.

### Fixed

- **iPhone/iPad rendering.** Loading a flame no longer stalls on a blank
  canvas until you touch the camera, and no longer flips between the old and
  new flame while it sharpens. Opening and closing dialogs no longer resets
  the image.

## [0.9.7] - 2026-07-16

### Added

- **Lumen Apeiron.** New name, new home — the app lives at
  [lumenapeiron.com](https://lumenapeiron.com) (about pages at
  about.lumenapeiron.com). Chaos Master lives on as the sub-brand on the
  welcome screen and social cards. Shared links now render proper Open Graph
  cards, and the site ships a real SEO baseline (canonical, meta description,
  sitemap, robots).
- **Audio flames.** Make the flame dance to music: wire frequency bands,
  energy, beats and onsets to any parameter — render settings, affines,
  transform properties, variation weights — with attack/release smoothing.
  Comes with a full-screen node-graph wiring editor (presets, randomize,
  undo/redo, JSON copy/import), waveform scrubbing, mic or file input, and
  audio-synced video export.
- **Sonification.** The reverse direction: the flame's own structure
  generates real-time audio, turning the fractal into an instrument.
- **Flame genetics.** Breed two flames into offspring with five crossover
  modes (including Smart, which pairs transforms by dominant variation);
  evolve lineages generation by generation in the Evolution Chamber; or let
  the autonomous Population Simulator score and evolve whole populations with
  selectable strategies. Every breeding is recorded in a persistent Ancestry
  Tree, and a structural Diff view compares any two flames. The randomizer
  gains a Mutation Lab with fine-grained rate controls.
- **Flame Gallery.** One place to browse everything: search by name, filter
  by variation tags, and pick from curated examples, animations, recents, and
  your own Bred & Evolved flames.
- **Render dialog, animation-aware.** For animated flames the preview shows
  which timeline frame it captured (with a one-click Sync), and the settings
  sliders are labeled with the frame they reflect.

### Changed

- **Cleaner toolbar.** The feature launchers are grouped into Audio and
  Genetics pull-up menus next to Blend/Morph/Gallery, and the bar pans
  horizontally on narrow screens so nothing is out of reach on phones.
- **Population Simulator wears the new brand** — glassy gradient cards,
  brand sliders and chips; the pilot for a broader visual refresh.
- **Export preview matches reality.** The Render Flame preview now renders
  with the same density-estimation filter as the canvas and the export jobs,
  so what you see is what you get.
- **TypeGPU 0.11** under the hood, with camera/IFS NaN hardening.

### Fixed

- Audio mapping sliders track pointer drags instead of only responding to
  clicks.
- Breeding gallery tiles are keyboard-accessible.
- Population Simulator: pause/resume no longer discards a bred generation,
  timers clean up on close, and simulator runs no longer flood the ancestry
  store.
- Ancestry tree re-rooting works when clicking nodes, and recorded flames are
  immutable snapshots (they no longer change when you keep editing).

## [0.9.6] - 2026-07-03

### Added

- **Curve editor: Ctrl+wheel zooms the value axis** around the cursor, for
  precise vertical keyframe moves. The zoomed range sticks, like after a drag.
- **Click a track to select it.** Clicking a lane or its name highlights the
  track, points the curve editor (when open) at it, and aims keyboard inserts
  (I) at it — no need to hunt for a keyframe diamond.

### Changed

- **One-row timeline header.** Zoom −/%/+, Fit, Seek and Curve moved up into
  the header, grouped into labeled clusters (playback, settings, View, Keys)
  with clearer tooltips. The keyframe inspector appears only while a keyframe
  is selected, and the dope sheet sits flush with the header — more height for
  your tracks.

### Fixed

- **The ruler arrowhead and the playhead line can no longer drift apart**
  after resizing or zooming the timeline — both panes stay locked to the same
  scroll offset (clicking Fit was the old workaround). Also fixed diamonds
  sitting off the ruler's frame axis on narrow screens.
- **Transform and color handle drags animate live.** With track-changes (or
  Auto mode) on while viewing a timeline frame, drags used to freeze the
  fractal until ~0.3 s after release; keyframes now record continuously during
  the drag (still one undo step), so the IFS follows your pointer.

## [0.9.5] - 2026-07-02

### Fixed

- **Undo/redo overhaul.** Ctrl+Z now reverts your last action — whatever it
  was. Flame edits and timeline keyframes used to live in two separate
  histories that undid out of order; they now share one chronological order,
  and the toolbar buttons match the shortcuts.
- **Undo covers what it used to miss**: "New transform", "Add variation",
  "Add symmetry" and dice rolls revert correctly; timeline settings (FPS,
  frames, speed, loop style) are undoable; and keyframe undos update the
  rendered flame immediately.
- **One action = one undo step.** Generators, presets, value scrubs, camera
  drags and animation exports no longer flood the history with dozens of
  entries per click or drag.
- **Undo stays inside your flame.** Loading or starting a new flame can no
  longer resurrect the previous flame's keyframes, and Ctrl+Z while typing in
  number/search fields edits the text instead of undoing the app.
- **Palettes and blends are part of your flame now**: applying or removing
  them is undoable, and both survive saving, sharing, and loading.
- **Deleting a custom variation is safe(r)**: the app warns when the current
  flame still uses it, and an Undo toast brings it back.

## [0.9.4] - 2026-07-02

### Added

- **Track changes diamond** on the affine editor and color wheel: while it's
  on, every edit — handle drags, scrubs, typed values, dice rolls — records a
  keyframe at the current frame, including the _first_ one (unlike Auto mode).
  Animating becomes: turn on the diamond, move things, step frames, repeat.
- **New Flame button**: one click resets to a clean 2D/3D starter. Undo brings
  the old flame back, and unsaved work is stashed into Recent flames first.
- **Animate button** in the timeline header jumps straight to the sidebar's
  animation generator — replacing the old one-shot "Gen" randomizer.
- **Your work is never silently lost.** Closing or reloading the tab
  auto-saves unsaved changes (with their animation) to Recent flames, with
  optional periodic auto-save (configurable under Data Management) and a
  one-time save/export reminder.
- **3D variation browser** now shows the same Affine Editor panel as 2D.

### Changed

- **The selected transform always renders on top** — and receives the click —
  even in a stack of overlapping handles.

### Fixed

- Recording keyframes while scrubbing no longer floods the timeline's undo
  history, and Auto/track-changes recording stops once animation mode is off
  (no more invisible "ghost" keyframes).

## [0.9.3] - 2026-06-27

### Added

- **Graceful WebGPU fallback.** If WebGPU is unavailable or the GPU crashes
  mid-session, the app stays usable instead of going blank: previews show a
  clear placeholder with a support link, and the rest of the studio keeps
  working.

### Fixed

- **The variation gallery no longer runs out of GPU memory while scrolling.**
  Live previews are bounded and freed off-screen, cutting a large gallery from
  ~1.6 GB of GPU memory to a few hundred MB and removing the "Out of memory"
  crash (notably on Firefox / Linux / AMD).
- **Firefox gallery layout**: tiles no longer squeeze, collapse, or hide
  behind the scrollbar.
- On a GPU device loss, render loops stop cleanly and the app falls back to
  the usable shell within a few seconds instead of hanging.

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
