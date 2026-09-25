# Agent index — Lumen Apeiron (Chaos Master)

Map of a SolidJS + WebGPU/TypeGPU codebase, written for coding agents.
**Read this before grepping.** It exists so you can jump straight to the right
file instead of rediscovering the architecture every session.

- **Tables below are generated** by `node scripts/gen-agent-index.mjs` from the
  filesystem and from each file's leading comment block. Never hand-edit inside
  `BEGIN:GENERATED` markers — your edit will be overwritten.
- **Prose outside the markers is hand-written** and is the valuable part:
  invariants, gotchas, and the mistakes that have actually cost time.
- If a module's blurb reads `(no header comment)`, the fix is to add a header
  comment to that file, not to describe it here.
- **No counts, on purpose.** The tables carry no file or line totals and are
  sorted by name, so a row changes only when its own module or file does, and
  branches stop conflicting on this file. For sizes, run `pnpm metrics` (totals
  and the largest files) or `wc -l`.

---

## 1. Orientation

| Layer              | Lives in                                        | Rule of thumb                                   |
| ------------------ | ----------------------------------------------- | ----------------------------------------------- |
| App shell          | `packages/app/src/App.tsx`                      | Boot, routing, providers.                       |
| Workspace          | `packages/app/src/MainWorkspace.tsx` + `hooks/` | The studio surface. Still oversized.            |
| Flame engine       | `packages/app/src/flame/`                       | Variations, IFS pipeline, WGSL codegen, XML.    |
| Pure logic         | `packages/core/src/`                            | No DOM, no WebGPU, no Solid. Testable anywhere. |
| Agent tool surface | `packages/app/src/webmcp/`                      | LLM-callable tools. Validate every input.       |
| Backend            | `packages/app/src/worker/`                      | Cloudflare Worker routes and middleware.        |
| Marketing site     | `packages/landing/`                             | Astro. Separate release train (`vX.Y.Z-web`).   |

<!-- BEGIN:GENERATED packages -->
<!-- prettier-ignore-start -->
| Directory | Package name |
|---|---|
| `packages/app` | `chaos-master` |
| `packages/core` | `@chaos-master/core` |
| `packages/landing` | `@chaos-master/landing` |
| `packages/mobile` | `@chaos-master/mobile` |
| `packages/mobile-runtime` | `@chaos-master/mobile-runtime` |
<!-- prettier-ignore-end -->
<!-- END:GENERATED packages -->

---

## 2. Guardrails — non-negotiable

1. **Never push to `upstream`.** `chaos-matters/chaos-master` is frozen and its
   push URL is disabled locally. Feature branches go to `origin` (the fork).
2. **No Claude attribution anywhere** — no `Co-Authored-By`, no "Generated
   with", in commits, PR bodies, or any other artifact.
3. **No emojis** in code, UI, logs, commits, or PR text. Use an SVG icon
   component from the project's icon set.
4. **Run `pnpm check` before declaring code finished.** `lint:fix` and `fmt:fix`
   rewrite files, so run it from the repo root and re-read what changed.
5. **CI is the authority on typecheck.** A green local `pnpm typecheck` is not
   trustworthy: valibot's `InferOutput` widens nondeterministically. Fix at the
   call sites; do not chase it locally.
6. **Never verify WebGPU through `playwright test`.** `playwright.config.ts`
   forces swiftshader, which produces fake device-loss crashes. Use a
   standalone headed-Chrome script with `--class=agent-browser`, the way
   `packages/app/scripts/capture-readme-screenshots.mjs` does.

---

## 3. Module map

<!-- BEGIN:GENERATED module-map -->

#### Flame engine (`packages/app/src/flame/`) — variations, pipeline, serialization

<!-- prettier-ignore-start -->
| Module | Entry point | What it is |
|---|---|---|
| `clash` | [choreographer.ts](../../packages/app/src/flame/clash/choreographer.ts) | The scripted 12-second bout of the Flame Clash preview: the intro, one hit, a beam clash, the Devour finisher and the victory, as a pure... |
| `examples` | [index.ts](../../packages/app/src/flame/examples/index.ts) | _(no header comment)_ |
| `glide` | [index.ts](../../packages/app/src/flame/glide/index.ts) | _(no header comment)_ |
| `renderDrivers` | [index.ts](../../packages/app/src/flame/renderDrivers/index.ts) | _(no header comment)_ |
| `schema` | [flameSchema.ts](../../packages/app/src/flame/schema/flameSchema.ts) | _(no header comment)_ |
| `variations` | [index.ts](../../packages/app/src/flame/variations/parametric/index.ts) | _(no header comment)_ |
| `variations3D` | [index.ts](../../packages/app/src/flame/variations3D/index.ts) | _(no header comment)_ |
<!-- prettier-ignore-end -->

#### Components (`packages/app/src/components/`) — UI surfaces

<!-- prettier-ignore-start -->
| Module | Entry point | What it is |
|---|---|---|
| `AboutPanel` | [Changelog.tsx](../../packages/app/src/components/AboutPanel/Changelog.tsx) | _(no header comment)_ |
| `AffineEditor` | [AffineEditor.tsx](../../packages/app/src/components/AffineEditor/AffineEditor.tsx) | _(no header comment)_ |
| `AncestryTreeModal` | [AncestryTreeModal.tsx](../../packages/app/src/components/AncestryTreeModal/AncestryTreeModal.tsx) | _(no header comment)_ |
| `Arcade` | [ArcadeModePanel.tsx](../../packages/app/src/components/Arcade/ArcadeModePanel.tsx) | _(no header comment)_ |
| `ArenaOverlay` | [ArenaResultsView.tsx](../../packages/app/src/components/ArenaOverlay/ArenaResultsView.tsx) | _(no header comment)_ |
| `AudioReactivePanel` | [AudioReactivePanel.tsx](../../packages/app/src/components/AudioReactivePanel/AudioReactivePanel.tsx) | _(no header comment)_ |
| `AudioWiringModal` | [AudioWiringModal.tsx](../../packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx) | _(no header comment)_ |
| `BenchmarkButton` | [BenchmarkButton.tsx](../../packages/app/src/components/BenchmarkButton/BenchmarkButton.tsx) | _(no header comment)_ |
| `BenchmarkModal` | [BenchmarkModal.tsx](../../packages/app/src/components/BenchmarkModal/BenchmarkModal.tsx) | _(no header comment)_ |
| `BlendFlameGallery` | [BlendFlameGallery.tsx](../../packages/app/src/components/BlendFlameGallery/BlendFlameGallery.tsx) | _(no header comment)_ |
| `BreedGallery` | [BreedGallery.tsx](../../packages/app/src/components/BreedGallery/BreedGallery.tsx) | _(no header comment)_ |
| `Button` | [ButtonGroup.tsx](../../packages/app/src/components/Button/ButtonGroup.tsx) | _(no header comment)_ |
| `CanvasViewport` | [index.ts](../../packages/app/src/components/CanvasViewport/index.ts) | _(no header comment)_ |
| `Checkbox` | [Checkbox.tsx](../../packages/app/src/components/Checkbox/Checkbox.tsx) | _(no header comment)_ |
| `ClashStage` | [ClashStage.tsx](../../packages/app/src/components/ClashStage/ClashStage.tsx) | The Flame Clash stage: one scripted bout between two fighters, on a canvas of its own. |
| `CollapsibleCard` | [CollapsibleCard.tsx](../../packages/app/src/components/CollapsibleCard/CollapsibleCard.tsx) | _(no header comment)_ |
| `ColorMapSelector` | [ColorMapSelector.tsx](../../packages/app/src/components/ColorMapSelector/ColorMapSelector.tsx) | _(no header comment)_ |
| `ColorPicker` | [ColorPicker.tsx](../../packages/app/src/components/ColorPicker/ColorPicker.tsx) | _(no header comment)_ |
| `ConsoleLog` | [ConsoleLog.tsx](../../packages/app/src/components/ConsoleLog/ConsoleLog.tsx) | _(no header comment)_ |
| `ControlCard` | [ControlCard.tsx](../../packages/app/src/components/ControlCard/ControlCard.tsx) | _(no header comment)_ |
| `CustomPaletteEditor` | [CustomPaletteEditor.tsx](../../packages/app/src/components/CustomPaletteEditor/CustomPaletteEditor.tsx) | Interactive custom palette editor. |
| `CustomVariationEditor` | [CustomVariationEditor.tsx](../../packages/app/src/components/CustomVariationEditor/CustomVariationEditor.tsx) | _(no header comment)_ |
| `DataManagement` | [DataManagement.tsx](../../packages/app/src/components/DataManagement/DataManagement.tsx) | _(no header comment)_ |
| `Debug` | [DebugPanel.tsx](../../packages/app/src/components/Debug/DebugPanel.tsx) | _(no header comment)_ |
| `DelayedShow` | [DelayedShow.tsx](../../packages/app/src/components/DelayedShow/DelayedShow.tsx) | _(no header comment)_ |
| `DiceButton` | [DiceButton.tsx](../../packages/app/src/components/DiceButton/DiceButton.tsx) | _(no header comment)_ |
| `DiffViewModal` | [DiffViewModal.tsx](../../packages/app/src/components/DiffViewModal/DiffViewModal.tsx) | _(no header comment)_ |
| `DiscordShareModal` | [DiscordShareModal.tsx](../../packages/app/src/components/DiscordShareModal/DiscordShareModal.tsx) | _(no header comment)_ |
| `DocumentationModal` | [DocumentationModal.tsx](../../packages/app/src/components/DocumentationModal/DocumentationModal.tsx) | _(no header comment)_ |
| `Dropzone` | [Dropzone.tsx](../../packages/app/src/components/Dropzone/Dropzone.tsx) | _(no header comment)_ |
| `Duel` | [DuelChips.tsx](../../packages/app/src/components/Duel/DuelChips.tsx) | _(no header comment)_ |
| `ErrorHandling` | [ErrorHandling.tsx](../../packages/app/src/components/ErrorHandling/ErrorHandling.tsx) | _(no header comment)_ |
| `EvolutionChamber` | [EvolutionChamber.tsx](../../packages/app/src/components/EvolutionChamber/EvolutionChamber.tsx) | _(no header comment)_ |
| `ExportJobs` | [OffscreenAnimationRender.tsx](../../packages/app/src/components/ExportJobs/OffscreenAnimationRender.tsx) | _(no header comment)_ |
| `ExportPngDialog` | [ExportPngDialog.tsx](../../packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx) | _(no header comment)_ |
| `FlameColorEditor` | [FlameColorEditor.tsx](../../packages/app/src/components/FlameColorEditor/FlameColorEditor.tsx) | _(no header comment)_ |
| `FlameRandomizerCard` | [FlameRandomizerCard.tsx](../../packages/app/src/components/FlameRandomizerCard/FlameRandomizerCard.tsx) | _(no header comment)_ |
| `FloatingActions` | [FloatingActions.tsx](../../packages/app/src/components/FloatingActions/FloatingActions.tsx) | _(no header comment)_ |
| `HelpModal` | [HelpModal.tsx](../../packages/app/src/components/HelpModal/HelpModal.tsx) | _(no header comment)_ |
| `Home` | [HomeFlame.tsx](../../packages/app/src/components/Home/HomeFlame.tsx) | _(no header comment)_ |
| `ImportVariationsModal` | [ImportVariationsModal.tsx](../../packages/app/src/components/ImportVariationsModal/ImportVariationsModal.tsx) | _(no header comment)_ |
| `LoadFlameModal` | [LoadFlameModal.tsx](../../packages/app/src/components/LoadFlameModal/LoadFlameModal.tsx) | _(no header comment)_ |
| `LogoFaviconGenerator` | [LogoFaviconGenerator.tsx](../../packages/app/src/components/LogoFaviconGenerator/LogoFaviconGenerator.tsx) | _(no header comment)_ |
| `MathEditor` | [MathEditor.tsx](../../packages/app/src/components/MathEditor/MathEditor.tsx) | _(no header comment)_ |
| `Migration` | [Migration.tsx](../../packages/app/src/components/Migration/Migration.tsx) | _(no header comment)_ |
| `Modal` | [Modal.tsx](../../packages/app/src/components/Modal/Modal.tsx) | _(no header comment)_ |
| `NativeSaveToasts` | [NativeSaveToasts.tsx](../../packages/app/src/components/NativeSaveToasts/NativeSaveToasts.tsx) | _(no header comment)_ |
| `OrientationGizmo` | [OrientationGizmo.tsx](../../packages/app/src/components/OrientationGizmo/OrientationGizmo.tsx) | _(no header comment)_ |
| `PaletteSelector` | [PaletteSelector.tsx](../../packages/app/src/components/PaletteSelector/PaletteSelector.tsx) | _(no header comment)_ |
| `PopulationSimulator` | [PopulationSimulator.tsx](../../packages/app/src/components/PopulationSimulator/PopulationSimulator.tsx) | _(no header comment)_ |
| `ProgressBar` | [ProgressBar.tsx](../../packages/app/src/components/ProgressBar/ProgressBar.tsx) | _(no header comment)_ |
| `PullUpMenu` | [PullUpMenu.tsx](../../packages/app/src/components/PullUpMenu/PullUpMenu.tsx) | _(no header comment)_ |
| `Quality` | [QualityPresets.tsx](../../packages/app/src/components/Quality/QualityPresets.tsx) | _(no header comment)_ |
| `QuestionMark` | [QuestionMark.tsx](../../packages/app/src/components/QuestionMark/QuestionMark.tsx) | _(no header comment)_ |
| `QuickVariationPicker` | [QuickVariationPicker.tsx](../../packages/app/src/components/QuickVariationPicker/QuickVariationPicker.tsx) | _(no header comment)_ |
| `ResetButton` | [ResetButton.tsx](../../packages/app/src/components/ResetButton/ResetButton.tsx) | _(no header comment)_ |
| `SessionRecorder` | [SessionRecorderDock.tsx](../../packages/app/src/components/SessionRecorder/SessionRecorderDock.tsx) | _(no header comment)_ |
| `ShareLinkModal` | [ShareLinkModal.tsx](../../packages/app/src/components/ShareLinkModal/ShareLinkModal.tsx) | _(no header comment)_ |
| `ShareVariationModal` | [ShareVariationModal.tsx](../../packages/app/src/components/ShareVariationModal/ShareVariationModal.tsx) | _(no header comment)_ |
| `Shell` | [ShellBar.tsx](../../packages/app/src/components/Shell/ShellBar.tsx) | _(no header comment)_ |
| `Sliders` | [AngleEditor.tsx](../../packages/app/src/components/Sliders/ParametricEditors/AngleEditor.tsx) | _(no header comment)_ |
| `SoftwareVersion` | [SoftwareVersion.tsx](../../packages/app/src/components/SoftwareVersion/SoftwareVersion.tsx) | _(no header comment)_ |
| `SonificationPanel` | [SonificationPanel.tsx](../../packages/app/src/components/SonificationPanel/SonificationPanel.tsx) | _(no header comment)_ |
| `SpotlightTour` | [SpotlightTour.tsx](../../packages/app/src/components/SpotlightTour/SpotlightTour.tsx) | _(no header comment)_ |
| `StandalonePage` | [StandalonePage.tsx](../../packages/app/src/components/StandalonePage/StandalonePage.tsx) | The provider stack for a page that runs without the editor, such as the Benchmark Lab or the deep-zoom explorer: theme, toasts, the WebGP... |
| `Timeline` | [TimelineSettings.tsx](../../packages/app/src/components/Timeline/TimelineSettings.tsx) | _(no header comment)_ |
| `Toast` | [Toast.tsx](../../packages/app/src/components/Toast/Toast.tsx) | _(no header comment)_ |
| `TouchSurface` | [index.ts](../../packages/app/src/components/TouchSurface/index.ts) | _(no header comment)_ |
| `TutorialModal` | [TutorialModal.tsx](../../packages/app/src/components/TutorialModal/TutorialModal.tsx) | _(no header comment)_ |
| `VariationMultiSelect` | [VariationMultiSelect.tsx](../../packages/app/src/components/VariationMultiSelect/VariationMultiSelect.tsx) | _(no header comment)_ |
| `VariationSelector` | [VariationSelector.tsx](../../packages/app/src/components/VariationSelector/VariationSelector.tsx) | _(no header comment)_ |
| `ViewControls` | [ViewControls.tsx](../../packages/app/src/components/ViewControls/ViewControls.tsx) | _(no header comment)_ |
| `WelcomeScreen` | [WelcomeScreen.tsx](../../packages/app/src/components/WelcomeScreen/WelcomeScreen.tsx) | _(no header comment)_ |
| `WgslEditor` | [index.ts](../../packages/app/src/components/WgslEditor/index.ts) | _(no header comment)_ |
| `WorkspaceBottomBar` | [index.ts](../../packages/app/src/components/WorkspaceBottomBar/index.ts) | _(no header comment)_ |
| `WorkspaceModalsHost` | [index.ts](../../packages/app/src/components/WorkspaceModalsHost/index.ts) | _(no header comment)_ |
| `WorkspaceSidebar` | [index.ts](../../packages/app/src/components/WorkspaceSidebar/index.ts) | _(no header comment)_ |
| `WorkspaceSkeleton` | [index.ts](../../packages/app/src/components/WorkspaceSkeleton/index.ts) | _(no header comment)_ |
<!-- prettier-ignore-end -->

#### Pages (`packages/app/src/pages/`) — route-level shells

<!-- prettier-ignore-start -->
| Module | Entry point | What it is |
|---|---|---|
| `Benchmarks` | [BenchmarksPage.tsx](../../packages/app/src/pages/Benchmarks/BenchmarksPage.tsx) | _(no header comment)_ |
| `Clash` | [ClashPage.tsx](../../packages/app/src/pages/Clash/ClashPage.tsx) | The Flame Clash preview page (`/clash`): two fighters, one scripted bout. |
| `FractalExplorer` | [FractalExplorerPage.tsx](../../packages/app/src/pages/FractalExplorer/FractalExplorerPage.tsx) | The deep-zoom explorer page: a full-bleed canvas, a heads-up readout and a settings panel. |
<!-- prettier-ignore-end -->

#### Cloudflare Worker (`packages/app/src/worker/`) — backend routes

<!-- prettier-ignore-start -->
| Module | Entry point | What it is |
|---|---|---|
| `middleware` | [rateLimit.ts](../../packages/app/src/worker/middleware/rateLimit.ts) | _(no header comment)_ |
| `routes` | [discord.ts](../../packages/app/src/worker/routes/discord.ts) | _(no header comment)_ |
<!-- prettier-ignore-end -->

#### WebMCP (`packages/app/src/webmcp/`) — agent-callable tool surface

<!-- prettier-ignore-start -->
| Module | Entry point | What it is |
|---|---|---|
| `tools` | [index.ts](../../packages/app/src/webmcp/tools/index.ts) | Barrel export for all WebMCP tool definitions. |
<!-- prettier-ignore-end -->

#### Core package (`packages/core/src/`) — pure, dependency-free logic

<!-- prettier-ignore-start -->
| Module | Entry point | What it is |
|---|---|---|
| `deepzoom` | [deepZoomView.ts](../../packages/core/src/deepzoom/deepZoomView.ts) | The deep-zoom camera: a centre with unlimited digits and a magnification held as a power of two. |
| `diff` | [fdiff.ts](../../packages/core/src/diff/fdiff.ts) | _(no header comment)_ |
| `math` | [affine3DView.ts](../../packages/core/src/math/affine3DView.ts) | _(no header comment)_ |
| `schema` | [flameSchema.ts](../../packages/core/src/schema/flameSchema.ts) | _(no header comment)_ |
| `utils` | [prettyPrintValibotErrors.ts](../../packages/core/src/utils/prettyPrintValibotErrors.ts) | _(no header comment)_ |
| `xml` | [flam3PaletteParser.ts](../../packages/core/src/xml/flam3PaletteParser.ts) | _(no header comment)_ |
<!-- prettier-ignore-end -->

#### Arcade (`packages/app/src/arcade/`) — arena, director and beats modes

<!-- prettier-ignore-start -->
| File | What it is |
|---|---|
| [affineControls.ts](../../packages/app/src/arcade/affineControls.ts) | _(no header comment)_ |
| [animatablePaths.ts](../../packages/app/src/arcade/animatablePaths.ts) | _(no header comment)_ |
| [commandHints.ts](../../packages/app/src/arcade/commandHints.ts) | _(no header comment)_ |
| [duel.ts](../../packages/app/src/arcade/duel.ts) | _(no header comment)_ |
| [duelActions.ts](../../packages/app/src/arcade/duelActions.ts) | _(no header comment)_ |
| [duelHud.ts](../../packages/app/src/arcade/duelHud.ts) | _(no header comment)_ |
| [duelJudge.ts](../../packages/app/src/arcade/duelJudge.ts) | _(no header comment)_ |
| [interruptedSession.ts](../../packages/app/src/arcade/interruptedSession.ts) | An Arcade session a page reload or a GPU failure cut short, remembered so the agent is told instead of editing the viewer's flame. |
| [lockKeyGate.ts](../../packages/app/src/arcade/lockKeyGate.ts) | The screen lock's key gate: while the pilot owns the keyboard, no key listener of the page hears a key. |
| [pilot.ts](../../packages/app/src/arcade/pilot.ts) | _(no header comment)_ |
| [pilotActions.ts](../../packages/app/src/arcade/pilotActions.ts) | _(no header comment)_ |
| [tasteStore.ts](../../packages/app/src/arcade/tasteStore.ts) | Persistent taste profile store and flame feature extraction for Evolutionary Art Director. |
| [topics.ts](../../packages/app/src/arcade/topics.ts) | _(no header comment)_ |
<!-- prettier-ignore-end -->

#### Workspace hooks (`packages/app/src/hooks/`)

<!-- prettier-ignore-start -->
| File | What it is |
|---|---|
| [useWorkspaceAnimationGen.ts](../../packages/app/src/hooks/useWorkspaceAnimationGen.ts) | _(no header comment)_ |
| [useWorkspaceArena.ts](../../packages/app/src/hooks/useWorkspaceArena.ts) | _(no header comment)_ |
| [useWorkspaceArtDirector.tsx](../../packages/app/src/hooks/useWorkspaceArtDirector.tsx) | _(no header comment)_ |
| [useWorkspaceAutosave.ts](../../packages/app/src/hooks/useWorkspaceAutosave.ts) | _(no header comment)_ |
| [useWorkspaceBlendPick.ts](../../packages/app/src/hooks/useWorkspaceBlendPick.ts) | The partner gallery's hover preview, and the pick that commits a partner. |
| [useWorkspaceCamera.ts](../../packages/app/src/hooks/useWorkspaceCamera.ts) | _(no header comment)_ |
| [useWorkspaceReplay.ts](../../packages/app/src/hooks/useWorkspaceReplay.ts) | _(no header comment)_ |
| [useWorkspaceShortcuts.ts](../../packages/app/src/hooks/useWorkspaceShortcuts.ts) | _(no header comment)_ |
| [useWorkspaceTimelineBinding.ts](../../packages/app/src/hooks/useWorkspaceTimelineBinding.ts) | _(no header comment)_ |
<!-- prettier-ignore-end -->

#### Recorder (`packages/app/src/recorder/`) — deterministic capture and replay

<!-- prettier-ignore-start -->
| File | What it is |
|---|---|
| [documentWriteHook.ts](../../packages/app/src/recorder/documentWriteHook.ts) | A leaf seam between document owners and the recorder. |
| [focus.ts](../../packages/app/src/recorder/focus.ts) | Follow-cam hints: **what to look at** while a step runs, never **where**. |
| [focusPreparation.ts](../../packages/app/src/recorder/focusPreparation.ts) | _(no header comment)_ |
| [glide.ts](../../packages/app/src/recorder/glide.ts) | How long a replayed step's transition lasts. |
| [player.ts](../../packages/app/src/recorder/player.ts) | _(no header comment)_ |
| [playerPlayWindows.ts](../../packages/app/src/recorder/playerPlayWindows.ts) | The replay player's half of a play window (recorder/playWindows.ts): across a gap the take spent playing, wait the take's own time, run a... |
| [playWindowPace.ts](../../packages/app/src/recorder/playWindowPace.ts) | The pace a replay plays a take's play windows at (recorder/playWindows.ts). |
| [playWindows.ts](../../packages/app/src/recorder/playWindows.ts) | Play windows: the stretches of a take in which its timeline was playing. |
| [recorder.ts](../../packages/app/src/recorder/recorder.ts) | _(no header comment)_ |
| [replay.ts](../../packages/app/src/recorder/replay.ts) | _(no header comment)_ |
| [replayInterfaceVideo.ts](../../packages/app/src/recorder/replayInterfaceVideo.ts) | _(no header comment)_ |
| [replaySideState.ts](../../packages/app/src/recorder/replaySideState.ts) | _(no header comment)_ |
| [replayVideo.ts](../../packages/app/src/recorder/replayVideo.ts) | Register every command a session may contain before building the isolated replay world. |
| [schema.ts](../../packages/app/src/recorder/schema.ts) | _(no header comment)_ |
| [snapshotOrigin.ts](../../packages/app/src/recorder/snapshotOrigin.ts) | Why a value-pinned snapshot exists. |
| [sonificationState.ts](../../packages/app/src/recorder/sonificationState.ts) | _(no header comment)_ |
| [timelineActions.ts](../../packages/app/src/recorder/timelineActions.ts) | _(no header comment)_ |
| [types.ts](../../packages/app/src/recorder/types.ts) | The session recorder's public types, apart from the module that implements them: what a recording starts from, what a command must expose... |
| [uncapturedSteps.ts](../../packages/app/src/recorder/uncapturedSteps.ts) | The steps a take could not record, by name. |
<!-- prettier-ignore-end -->

#### Benchmarks (`packages/app/src/benchmarks/`)

<!-- prettier-ignore-start -->
| File | What it is |
|---|---|
| [export.ts](../../packages/app/src/benchmarks/export.ts) | _(no header comment)_ |
| [flameSources.ts](../../packages/app/src/benchmarks/flameSources.ts) | _(no header comment)_ |
| [model.ts](../../packages/app/src/benchmarks/model.ts) | _(no header comment)_ |
| [resultStore.ts](../../packages/app/src/benchmarks/resultStore.ts) | _(no header comment)_ |
| [resultSummary.ts](../../packages/app/src/benchmarks/resultSummary.ts) | _(no header comment)_ |
| [rng.ts](../../packages/app/src/benchmarks/rng.ts) | _(no header comment)_ |
| [schedule.ts](../../packages/app/src/benchmarks/schedule.ts) | _(no header comment)_ |
| [statistics.ts](../../packages/app/src/benchmarks/statistics.ts) | _(no header comment)_ |
| [testFixtures.ts](../../packages/app/src/benchmarks/testFixtures.ts) | _(no header comment)_ |
| [upload.ts](../../packages/app/src/benchmarks/upload.ts) | _(no header comment)_ |
| [validation.ts](../../packages/app/src/benchmarks/validation.ts) | _(no header comment)_ |
<!-- prettier-ignore-end -->

#### Command registry (`packages/app/src/commands/`)

<!-- prettier-ignore-start -->
| File | What it is |
|---|---|
| [registry.ts](../../packages/app/src/commands/registry.ts) | _(no header comment)_ |
| [types.ts](../../packages/app/src/commands/types.ts) | The command system's types: `FlameCommand`, what every registered command declares, and `CommandContext`, the workspace surface a command... |
<!-- prettier-ignore-end -->

#### Stores (`packages/app/src/stores/`) — global reactive state

<!-- prettier-ignore-start -->
| File | What it is |
|---|---|
| [console-store.ts](../../packages/app/src/stores/console-store.ts) | eslint-disable no-console */ |
| [index.ts](../../packages/app/src/stores/index.ts) | _(no header comment)_ |
| [workspaceExportStore.ts](../../packages/app/src/stores/workspaceExportStore.ts) | _(no header comment)_ |
| [workspaceLayoutStore.ts](../../packages/app/src/stores/workspaceLayoutStore.ts) | _(no header comment)_ |
| [workspaceSelectionStore.ts](../../packages/app/src/stores/workspaceSelectionStore.ts) | _(no header comment)_ |
<!-- prettier-ignore-end -->

#### Utilities (`packages/app/src/utils/`, 200+ LOC)

<!-- prettier-ignore-start -->
| File | What it is |
|---|---|
| [animationExport.ts](../../packages/app/src/utils/animationExport.ts) | _(no header comment)_ |
| [audioAnalysis.ts](../../packages/app/src/utils/audioAnalysis.ts) | _(no header comment)_ |
| [audioExport.ts](../../packages/app/src/utils/audioExport.ts) | _(no header comment)_ |
| [audioWiringPresets.ts](../../packages/app/src/utils/audioWiringPresets.ts) | What an audio-reactive preset actually wires. |
| [createStoreHistory.ts](../../packages/app/src/utils/createStoreHistory.ts) | Undo and redo for a Solid store, kept as patches rather than snapshots. |
| [exportJobs.ts](../../packages/app/src/utils/exportJobs.ts) | _(no header comment)_ |
| [exportRequests.ts](../../packages/app/src/utils/exportRequests.ts) | Scripted export requests: the narrow, JSON-shaped options a script or an agent sends to `export.renderImage` / `export.renderAnimation`,... |
| [flameImport.ts](../../packages/app/src/utils/flameImport.ts) | _(no header comment)_ |
| [flameInMp4.ts](../../packages/app/src/utils/flameInMp4.ts) | _(no header comment)_ |
| [flameInPng.ts](../../packages/app/src/utils/flameInPng.ts) | _(no header comment)_ |
| [jsonQueryParam.ts](../../packages/app/src/utils/jsonQueryParam.ts) | _(no header comment)_ |
| [mathToWgsl.ts](../../packages/app/src/utils/mathToWgsl.ts) | Translate a math-notation expression (LaTeX-like) into a WGSL function body. |
| [recentFlames.ts](../../packages/app/src/utils/recentFlames.ts) | _(no header comment)_ |
| [serializeLogArgs.ts](../../packages/app/src/utils/serializeLogArgs.ts) | Caps applied to every serialized console entry. |
| [sonification.ts](../../packages/app/src/utils/sonification.ts) | _(no header comment)_ |
| [timeline.ts](../../packages/app/src/utils/timeline.ts) | _(no header comment)_ |
| [useAudioReactive.ts](../../packages/app/src/utils/useAudioReactive.ts) | _(no header comment)_ |
| [videoEncoder.ts](../../packages/app/src/utils/videoEncoder.ts) | _(no header comment)_ |
<!-- prettier-ignore-end -->

#### Library (`packages/app/src/lib/`, 200+ LOC)

<!-- prettier-ignore-start -->
| File | What it is |
|---|---|
| [galleryContent.ts](../../packages/app/src/lib/galleryContent.ts) | _(no header comment)_ |
| [pauseSave.ts](../../packages/app/src/lib/pauseSave.ts) | _(no header comment)_ |
| [WebgpuAdapter.ts](../../packages/app/src/lib/WebgpuAdapter.ts) | _(no header comment)_ |
| [WheelZoomCamera2D.tsx](../../packages/app/src/lib/WheelZoomCamera2D.tsx) | _(no header comment)_ |
| [WheelZoomCamera3D.tsx](../../packages/app/src/lib/WheelZoomCamera3D.tsx) | _(no header comment)_ |
<!-- prettier-ignore-end -->

#### Application root (`packages/app/src/*.tsx`)

<!-- prettier-ignore-start -->
| File | What it is |
|---|---|
| [App.tsx](../../packages/app/src/App.tsx) | _(no header comment)_ |
| [defaults.ts](../../packages/app/src/defaults.ts) | _(no header comment)_ |
| [index.tsx](../../packages/app/src/index.tsx) | @refresh reload */ |
| [MainWorkspace.tsx](../../packages/app/src/MainWorkspace.tsx) | _(no header comment)_ |
| [valibot.ts](../../packages/app/src/valibot.ts) | We re-export only things we use to keep the bundle small |
| [version.ts](../../packages/app/src/version.ts) | _(no header comment)_ |
| [vitest.setup.ts](../../packages/app/src/vitest.setup.ts) | Vitest test setup file. |
<!-- prettier-ignore-end -->

<!-- END:GENERATED module-map -->

---

## 4. Files heavy enough to be a context-budget decision

<!-- BEGIN:GENERATED heavy-files -->

Each of these is 1,000 lines or more, so reading one end-to-end is a
context-budget decision. Grep for the symbol and read the surrounding range
instead. `wc -l` gives the current size.

<!-- prettier-ignore-start -->
| File |
|---|
| [packages/app/src/benchmarks/validation.ts](../../packages/app/src/benchmarks/validation.ts) |
| [packages/app/src/components/AffineEditor/AffineEditor.tsx](../../packages/app/src/components/AffineEditor/AffineEditor.tsx) |
| [packages/app/src/components/AudioReactivePanel/AudioReactivePanel.tsx](../../packages/app/src/components/AudioReactivePanel/AudioReactivePanel.tsx) |
| [packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx](../../packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx) |
| [packages/app/src/components/AudioWiringModal/NodeGraphView.tsx](../../packages/app/src/components/AudioWiringModal/NodeGraphView.tsx) |
| [packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx](../../packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx) |
| [packages/app/src/components/FlameRandomizerCard/FlameRandomizerCard.tsx](../../packages/app/src/components/FlameRandomizerCard/FlameRandomizerCard.tsx) |
| [packages/app/src/components/Home/HomeFlame.tsx](../../packages/app/src/components/Home/HomeFlame.tsx) |
| [packages/app/src/components/LoadFlameModal/LoadFlameModal.tsx](../../packages/app/src/components/LoadFlameModal/LoadFlameModal.tsx) |
| [packages/app/src/components/LogoFaviconGenerator/LogoFaviconGenerator.tsx](../../packages/app/src/components/LogoFaviconGenerator/LogoFaviconGenerator.tsx) |
| [packages/app/src/components/VariationSelector/VariationSelector.tsx](../../packages/app/src/components/VariationSelector/VariationSelector.tsx) |
| [packages/app/src/flame/examples/animations.ts](../../packages/app/src/flame/examples/animations.ts) |
| [packages/app/src/flame/Flam3.tsx](../../packages/app/src/flame/Flam3.tsx) |
| [packages/app/src/flame/variations/docs/content.general.ts](../../packages/app/src/flame/variations/docs/content.general.ts) |
| [packages/app/src/flame/variations/docs/content.general2.ts](../../packages/app/src/flame/variations/docs/content.general2.ts) |
| [packages/app/src/flame/variations/utils.ts](../../packages/app/src/flame/variations/utils.ts) |
| [packages/app/src/MainWorkspace.tsx](../../packages/app/src/MainWorkspace.tsx) |
| [packages/app/src/pages/Benchmarks/BenchmarksPage.tsx](../../packages/app/src/pages/Benchmarks/BenchmarksPage.tsx) |
| [packages/app/src/recorder/recorder.ts](../../packages/app/src/recorder/recorder.ts) |
| [packages/app/src/recorder/replayVideo.ts](../../packages/app/src/recorder/replayVideo.ts) |
| [packages/app/src/utils/timeline.ts](../../packages/app/src/utils/timeline.ts) |
<!-- prettier-ignore-end -->
<!-- END:GENERATED heavy-files -->

---

## 5. Scripts

<!-- BEGIN:GENERATED scripts -->
<!-- prettier-ignore-start -->
| Script | Runs |
|---|---|
| `pnpm prepare` | `git config core.hooksPath .githooks \|\| true` |
| `pnpm start` | `pnpm --filter chaos-master start` |
| `pnpm capture:readme` | `pnpm --filter chaos-master capture:readme` |
| `pnpm flam3:compat` | `pnpm --filter chaos-master flam3:compat` |
| `pnpm fmt` | `prettier packages --check` |
| `pnpm fmt:fix` | `prettier packages --write --log-level warn` |
| `pnpm lint` | `NODE_OPTIONS="--max-old-space-size=4096" eslint` |
| `pnpm lint:fix` | `NODE_OPTIONS="--max-old-space-size=4096" eslint --fix` |
| `pnpm typecheck` | `pnpm --filter @chaos-master/core typecheck && pnpm --filter @chaos-master/mobile-runtime typecheck && NODE_OPTIONS="--max-old-space-size=8192" tsc --noEmit --project packages/app/tsconfig.json && tsc --noEmit --project tests/tsconfig.json && tsc --noEmit --project packages/app/e2e/tsconfig.json && pnpm --filter @chaos-master/landing check` |
| `pnpm validate-wgsl` | `npx --yes tsx scripts/validate-wgsl-props.ts` |
| `pnpm check` | `pnpm typecheck && pnpm lint:fix && pnpm fmt:fix && pnpm validate-wgsl` |
| `pnpm docs:index` | `node scripts/gen-agent-index.mjs` |
| `pnpm docs:index:check` | `node scripts/gen-agent-index.mjs --check` |
| `pnpm docs:cite` | `node scripts/check-doc-citations.mjs` |
| `pnpm metrics` | `node scripts/code-metrics.mjs` |
| `pnpm metrics:json` | `node scripts/code-metrics.mjs --json` |
| `pnpm metrics:check` | `node scripts/code-metrics.mjs --check` |
| `pnpm metrics:update` | `node scripts/code-metrics.mjs --update` |
| `pnpm metrics:caps` | `node scripts/code-metrics.mjs --lower-caps` |
| `pnpm mutation:core` | `pnpm --filter @chaos-master/core exec stryker run` |
| `pnpm arch` | `depcruise --config .dependency-cruiser.cjs --output-type err packages/app/src packages/core/src` |
| `pnpm arch:summary` | `depcruise --config .dependency-cruiser.cjs --output-type err-long packages/app/src packages/core/src` |
| `pnpm verify:webgpu` | `node scripts/verify-webgpu-headed.mjs` |
| `pnpm test:coverage` | `pnpm --filter chaos-master exec vitest run --coverage --testTimeout=30000 && pnpm --filter @chaos-master/core exec vitest run --coverage` |
| `pnpm test` | `pnpm test:packages && pnpm test:app` |
| `pnpm test:app` | `pnpm --filter chaos-master exec vitest run` |
| `pnpm test:packages` | `pnpm --filter @chaos-master/core test && pnpm --filter @chaos-master/mobile-runtime test && pnpm --filter chaos-master test:scripts && pnpm test:scripts` |
| `pnpm test:scripts` | `node --test scripts/*.test.mjs` |
| `pnpm test:changed` | `node scripts/test-changed.mjs` |
| `pnpm test:pr` | `pnpm --filter @chaos-master/core test && pnpm --filter @chaos-master/mobile-runtime test && pnpm test:changed && pnpm --filter chaos-master test:scripts && pnpm test:scripts` |
| `pnpm test:ui` | `pnpm --filter chaos-master exec vitest --ui` |
| `pnpm test:watch` | `pnpm --filter chaos-master exec vitest` |
| `pnpm test:e2e` | `playwright test` |
| `pnpm test:e2e:ci` | `playwright test --project=chromium-ci` |
| `pnpm ci` | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e:ci` |
| `pnpm lines` | `cloc packages --exclude-dir=node_modules,dist --by-file-by-lang --not-match-f='(.*[.]d[.]ts\|.*[.]stories[.].*\|.*[.]test[.].*\|.*[.]json)'` |
| `pnpm deploy:dev` | `pnpm --filter chaos-master deploy:dev` |
| `pnpm deploy:prod` | `pnpm --filter chaos-master deploy:prod` |
| `pnpm wr-dev` | `pnpm --filter chaos-master wr-dev` |
| `pnpm mobile:build` | `pnpm --filter chaos-master build:native` |
| `pnpm mobile:sync` | `pnpm --filter @chaos-master/mobile sync` |
| `pnpm mobile:android` | `pnpm --filter @chaos-master/mobile run:android` |
<!-- prettier-ignore-end -->
<!-- END:GENERATED scripts -->
