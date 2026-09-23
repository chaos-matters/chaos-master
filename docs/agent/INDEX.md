# Agent index — Lumen Apeiron (Chaos Master)

Map of a ~174k-LOC SolidJS + WebGPU/TypeGPU codebase, written for coding agents.
**Read this before grepping.** It exists so you can jump straight to the right
file instead of rediscovering the architecture every session.

- **Tables below are generated** by `node scripts/gen-agent-index.mjs` from the
  filesystem and from each file's leading comment block. Never hand-edit inside
  `BEGIN:GENERATED` markers — your edit will be overwritten.
- **Prose outside the markers is hand-written** and is the valuable part:
  invariants, gotchas, and the mistakes that have actually cost time.
- If a module's blurb reads `(no header comment)`, the fix is to add a header
  comment to that file, not to describe it here.

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

| Directory                 | Package name                   | Source files | LOC    |
| ------------------------- | ------------------------------ | ------------ | ------ |
| `packages/app`            | `chaos-master`                 | 1084         | 184.2k |
| `packages/landing`        | `@chaos-master/landing`        | 20           | 2.5k   |
| `packages/core`           | `@chaos-master/core`           | 17           | 1.9k   |
| `packages/mobile-runtime` | `@chaos-master/mobile-runtime` | 7            | 600    |
| `packages/mobile`         | `@chaos-master/mobile`         | 1            | 50     |

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

| Module          | Entry point                                                             | LOC   | What it is            |
| --------------- | ----------------------------------------------------------------------- | ----- | --------------------- |
| `variations`    | [index.ts](../../packages/app/src/flame/variations/parametric/index.ts) | 33.6k | _(no header comment)_ |
| `examples`      | [index.ts](../../packages/app/src/flame/examples/index.ts)              | 12.7k | _(no header comment)_ |
| `glide`         | [index.ts](../../packages/app/src/flame/glide/index.ts)                 | 2.8k  | _(no header comment)_ |
| `renderDrivers` | [index.ts](../../packages/app/src/flame/renderDrivers/index.ts)         | 400   | _(no header comment)_ |
| `schema`        | [flameSchema.ts](../../packages/app/src/flame/schema/flameSchema.ts)    | 100   | _(no header comment)_ |
| `variations3D`  | [index.ts](../../packages/app/src/flame/variations3D/index.ts)          | 50    | _(no header comment)_ |

#### Components (`packages/app/src/components/`) — UI surfaces

| Module                  | Entry point                                                                                                    | LOC  | What it is                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Timeline`              | [TimelineSettings.tsx](../../packages/app/src/components/Timeline/TimelineSettings.tsx)                        | 4.2k | _(no header comment)_                                                                                                                        |
| `Home`                  | [HomeFlame.tsx](../../packages/app/src/components/Home/HomeFlame.tsx)                                          | 4.1k | _(no header comment)_                                                                                                                        |
| `AudioWiringModal`      | [AudioWiringModal.tsx](../../packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx)                | 4.0k | _(no header comment)_                                                                                                                        |
| `Duel`                  | [DuelChips.tsx](../../packages/app/src/components/Duel/DuelChips.tsx)                                          | 3.2k | Pointer intent, so a cursor crossing the top edge does not detonate a panel.                                                                 |
| `SessionRecorder`       | [SessionRecorderDock.tsx](../../packages/app/src/components/SessionRecorder/SessionRecorderDock.tsx)           | 2.9k | _(no header comment)_                                                                                                                        |
| `WorkspaceSidebar`      | [index.ts](../../packages/app/src/components/WorkspaceSidebar/index.ts)                                        | 2.4k | _(no header comment)_                                                                                                                        |
| `ExportPngDialog`       | [ExportPngDialog.tsx](../../packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx)                   | 2.1k | _(no header comment)_                                                                                                                        |
| `FlameRandomizerCard`   | [FlameRandomizerCard.tsx](../../packages/app/src/components/FlameRandomizerCard/FlameRandomizerCard.tsx)       | 2.0k | _(no header comment)_                                                                                                                        |
| `TouchSurface`          | [index.ts](../../packages/app/src/components/TouchSurface/index.ts)                                            | 1.8k | _(no header comment)_                                                                                                                        |
| `LoadFlameModal`        | [LoadFlameModal.tsx](../../packages/app/src/components/LoadFlameModal/LoadFlameModal.tsx)                      | 1.6k | The timeline the animation was authored at, where the source has one (a stored entry, an imported file).                                     |
| `AffineEditor`          | [AffineEditor.tsx](../../packages/app/src/components/AffineEditor/AffineEditor.tsx)                            | 1.4k | _(no header comment)_                                                                                                                        |
| `Arcade`                | [ArcadeModePanel.tsx](../../packages/app/src/components/Arcade/ArcadeModePanel.tsx)                            | 1.4k | _(no header comment)_                                                                                                                        |
| `AudioReactivePanel`    | [AudioReactivePanel.tsx](../../packages/app/src/components/AudioReactivePanel/AudioReactivePanel.tsx)          | 1.4k | Attack time in ms — how fast the value rises (0 = instant).                                                                                  |
| `ArenaOverlay`          | [ArenaResultsView.tsx](../../packages/app/src/components/ArenaOverlay/ArenaResultsView.tsx)                    | 1.3k | _(no header comment)_                                                                                                                        |
| `LogoFaviconGenerator`  | [LogoFaviconGenerator.tsx](../../packages/app/src/components/LogoFaviconGenerator/LogoFaviconGenerator.tsx)    | 1.3k | _(no header comment)_                                                                                                                        |
| `VariationSelector`     | [VariationSelector.tsx](../../packages/app/src/components/VariationSelector/VariationSelector.tsx)             | 1.3k | _(no header comment)_                                                                                                                        |
| `ExportJobs`            | [OffscreenAnimationRender.tsx](../../packages/app/src/components/ExportJobs/OffscreenAnimationRender.tsx)      | 1.2k | A read-only Signal whose getter is reactive — interactive cameras are off, so the setter is never called.                                    |
| `DocumentationModal`    | [DocumentationModal.tsx](../../packages/app/src/components/DocumentationModal/DocumentationModal.tsx)          | 1.1k | Factory mirroring `createShowHelp`: call once during render (so it can read the modal context), returns a launcher for the documentation...  |
| `Sliders`               | [AngleEditor.tsx](../../packages/app/src/components/Sliders/ParametricEditors/AngleEditor.tsx)                 | 1.0k | _(no header comment)_                                                                                                                        |
| `PopulationSimulator`   | [PopulationSimulator.tsx](../../packages/app/src/components/PopulationSimulator/PopulationSimulator.tsx)       | 900  | _(no header comment)_                                                                                                                        |
| `BenchmarkModal`        | [BenchmarkModal.tsx](../../packages/app/src/components/BenchmarkModal/BenchmarkModal.tsx)                      | 850  | _(no header comment)_                                                                                                                        |
| `CustomVariationEditor` | [CustomVariationEditor.tsx](../../packages/app/src/components/CustomVariationEditor/CustomVariationEditor.tsx) | 850  | _(no header comment)_                                                                                                                        |
| `FloatingActions`       | [FloatingActions.tsx](../../packages/app/src/components/FloatingActions/FloatingActions.tsx)                   | 750  | _(no header comment)_                                                                                                                        |
| `Migration`             | [Migration.tsx](../../packages/app/src/components/Migration/Migration.tsx)                                     | 750  | _(no header comment)_                                                                                                                        |
| `HelpModal`             | [HelpModal.tsx](../../packages/app/src/components/HelpModal/HelpModal.tsx)                                     | 700  | _(no header comment)_                                                                                                                        |
| `FlameColorEditor`      | [FlameColorEditor.tsx](../../packages/app/src/components/FlameColorEditor/FlameColorEditor.tsx)                | 650  | _(no header comment)_                                                                                                                        |
| `Shell`                 | [ShellBar.tsx](../../packages/app/src/components/Shell/ShellBar.tsx)                                           | 650  | How long the capsule stays expanded once the finger has left it.                                                                             |
| `SpotlightTour`         | [SpotlightTour.tsx](../../packages/app/src/components/SpotlightTour/SpotlightTour.tsx)                         | 650  | _(no header comment)_                                                                                                                        |
| `WgslEditor`            | [index.ts](../../packages/app/src/components/WgslEditor/index.ts)                                              | 650  | _(no header comment)_                                                                                                                        |
| `QuickVariationPicker`  | [QuickVariationPicker.tsx](../../packages/app/src/components/QuickVariationPicker/QuickVariationPicker.tsx)    | 550  | rootMargin for the gallery preview IntersectionObserver — preloads the rows just beyond the scroll viewport so a tile isn't blank the ins... |
| `WelcomeScreen`         | [WelcomeScreen.tsx](../../packages/app/src/components/WelcomeScreen/WelcomeScreen.tsx)                         | 550  | _(no header comment)_                                                                                                                        |
| `EvolutionChamber`      | [EvolutionChamber.tsx](../../packages/app/src/components/EvolutionChamber/EvolutionChamber.tsx)                | 500  | _(no header comment)_                                                                                                                        |
| `AncestryTreeModal`     | [AncestryTreeModal.tsx](../../packages/app/src/components/AncestryTreeModal/AncestryTreeModal.tsx)             | 450  | Horizontal ancestry tree modal.                                                                                                              |
| `CustomPaletteEditor`   | [CustomPaletteEditor.tsx](../../packages/app/src/components/CustomPaletteEditor/CustomPaletteEditor.tsx)       | 450  | Interactive custom palette editor.                                                                                                           |
| `ViewControls`          | [ViewControls.tsx](../../packages/app/src/components/ViewControls/ViewControls.tsx)                            | 450  | _(no header comment)_                                                                                                                        |
| `BreedGallery`          | [BreedGallery.tsx](../../packages/app/src/components/BreedGallery/BreedGallery.tsx)                            | 400  | _(no header comment)_                                                                                                                        |
| `DataManagement`        | [DataManagement.tsx](../../packages/app/src/components/DataManagement/DataManagement.tsx)                      | 400  | _(no header comment)_                                                                                                                        |
| `DiscordShareModal`     | [DiscordShareModal.tsx](../../packages/app/src/components/DiscordShareModal/DiscordShareModal.tsx)             | 400  | _(no header comment)_                                                                                                                        |
| `WorkspaceModalsHost`   | [index.ts](../../packages/app/src/components/WorkspaceModalsHost/index.ts)                                     | 400  | _(no header comment)_                                                                                                                        |
| `BlendFlameGallery`     | [BlendFlameGallery.tsx](../../packages/app/src/components/BlendFlameGallery/BlendFlameGallery.tsx)             | 350  | _(no header comment)_                                                                                                                        |
| `SonificationPanel`     | [SonificationPanel.tsx](../../packages/app/src/components/SonificationPanel/SonificationPanel.tsx)             | 350  | _(no header comment)_                                                                                                                        |
| `CanvasViewport`        | [index.ts](../../packages/app/src/components/CanvasViewport/index.ts)                                          | 300  | _(no header comment)_                                                                                                                        |
| `ErrorHandling`         | [ErrorHandling.tsx](../../packages/app/src/components/ErrorHandling/ErrorHandling.tsx)                         | 300  | _(no header comment)_                                                                                                                        |
| `WorkspaceBottomBar`    | [index.ts](../../packages/app/src/components/WorkspaceBottomBar/index.ts)                                      | 300  | _(no header comment)_                                                                                                                        |
| `MathEditor`            | [MathEditor.tsx](../../packages/app/src/components/MathEditor/MathEditor.tsx)                                  | 250  | _(no header comment)_                                                                                                                        |
| `Modal`                 | [Modal.tsx](../../packages/app/src/components/Modal/Modal.tsx)                                                 | 250  | Allows the subtree to request modals in async code for the purpose of user input.                                                            |
| `PaletteSelector`       | [PaletteSelector.tsx](../../packages/app/src/components/PaletteSelector/PaletteSelector.tsx)                   | 250  | _(no header comment)_                                                                                                                        |
| `ShareLinkModal`        | [ShareLinkModal.tsx](../../packages/app/src/components/ShareLinkModal/ShareLinkModal.tsx)                      | 250  | _(no header comment)_                                                                                                                        |
| `SoftwareVersion`       | [SoftwareVersion.tsx](../../packages/app/src/components/SoftwareVersion/SoftwareVersion.tsx)                   | 250  | _(no header comment)_                                                                                                                        |
| `AboutPanel`            | [Changelog.tsx](../../packages/app/src/components/AboutPanel/Changelog.tsx)                                    | 200  | _(no header comment)_                                                                                                                        |
| `DiffViewModal`         | [DiffViewModal.tsx](../../packages/app/src/components/DiffViewModal/DiffViewModal.tsx)                         | 200  | _(no header comment)_                                                                                                                        |
| `OrientationGizmo`      | [OrientationGizmo.tsx](../../packages/app/src/components/OrientationGizmo/OrientationGizmo.tsx)                | 200  | _(no header comment)_                                                                                                                        |
| `ShareVariationModal`   | [ShareVariationModal.tsx](../../packages/app/src/components/ShareVariationModal/ShareVariationModal.tsx)       | 200  | _(no header comment)_                                                                                                                        |
| `VariationMultiSelect`  | [VariationMultiSelect.tsx](../../packages/app/src/components/VariationMultiSelect/VariationMultiSelect.tsx)    | 200  | _(no header comment)_                                                                                                                        |
| `ConsoleLog`            | [ConsoleLog.tsx](../../packages/app/src/components/ConsoleLog/ConsoleLog.tsx)                                  | 150  | _(no header comment)_                                                                                                                        |
| `ImportVariationsModal` | [ImportVariationsModal.tsx](../../packages/app/src/components/ImportVariationsModal/ImportVariationsModal.tsx) | 150  | _(no header comment)_                                                                                                                        |
| `PullUpMenu`            | [PullUpMenu.tsx](../../packages/app/src/components/PullUpMenu/PullUpMenu.tsx)                                  | 150  | Toolbar button that opens a compact menu ABOVE itself (a pull-up), used to group the view-controls feature launchers without eating toolb... |
| `Quality`               | [QualityPresets.tsx](../../packages/app/src/components/Quality/QualityPresets.tsx)                             | 150  | Stable pill definitions for all quality presets — reusable across callers.                                                                   |
| `TutorialModal`         | [TutorialModal.tsx](../../packages/app/src/components/TutorialModal/TutorialModal.tsx)                         | 150  | _(no header comment)_                                                                                                                        |
| `CollapsibleCard`       | [CollapsibleCard.tsx](../../packages/app/src/components/CollapsibleCard/CollapsibleCard.tsx)                   | 100  | _(no header comment)_                                                                                                                        |
| `Dropzone`              | [Dropzone.tsx](../../packages/app/src/components/Dropzone/Dropzone.tsx)                                        | 100  | _(no header comment)_                                                                                                                        |
| `ProgressBar`           | [ProgressBar.tsx](../../packages/app/src/components/ProgressBar/ProgressBar.tsx)                               | 100  | Bottom-center progress overlay for ANIMATION export (which still renders on the main canvas).                                                |
| `BenchmarkButton`       | [BenchmarkButton.tsx](../../packages/app/src/components/BenchmarkButton/BenchmarkButton.tsx)                   | 50   | _(no header comment)_                                                                                                                        |
| `Button`                | [ButtonGroup.tsx](../../packages/app/src/components/Button/ButtonGroup.tsx)                                    | 50   | _(no header comment)_                                                                                                                        |
| `Checkbox`              | [Checkbox.tsx](../../packages/app/src/components/Checkbox/Checkbox.tsx)                                        | 50   | _(no header comment)_                                                                                                                        |
| `ColorMapSelector`      | [ColorMapSelector.tsx](../../packages/app/src/components/ColorMapSelector/ColorMapSelector.tsx)                | 50   | _(no header comment)_                                                                                                                        |
| `ColorPicker`           | [ColorPicker.tsx](../../packages/app/src/components/ColorPicker/ColorPicker.tsx)                               | 50   | _(no header comment)_                                                                                                                        |
| `ControlCard`           | [ControlCard.tsx](../../packages/app/src/components/ControlCard/ControlCard.tsx)                               | 50   | _(no header comment)_                                                                                                                        |
| `Debug`                 | [DebugPanel.tsx](../../packages/app/src/components/Debug/DebugPanel.tsx)                                       | 50   | _(no header comment)_                                                                                                                        |
| `DelayedShow`           | [DelayedShow.tsx](../../packages/app/src/components/DelayedShow/DelayedShow.tsx)                               | 50   | Delays showing the component by a certain amount                                                                                             |
| `DiceButton`            | [DiceButton.tsx](../../packages/app/src/components/DiceButton/DiceButton.tsx)                                  | 50   | _(no header comment)_                                                                                                                        |
| `NativeSaveToasts`      | [NativeSaveToasts.tsx](../../packages/app/src/components/NativeSaveToasts/NativeSaveToasts.tsx)                | 50   | lib/nativeSave runs outside any component, so it cannot reach the toast column on its own.                                                   |
| `QuestionMark`          | [QuestionMark.tsx](../../packages/app/src/components/QuestionMark/QuestionMark.tsx)                            | 50   | _(no header comment)_                                                                                                                        |
| `ResetButton`           | [ResetButton.tsx](../../packages/app/src/components/ResetButton/ResetButton.tsx)                               | 50   | _(no header comment)_                                                                                                                        |
| `Toast`                 | [Toast.tsx](../../packages/app/src/components/Toast/Toast.tsx)                                                 | 50   | Global toast column: fixed top-right on desktop, and top-left on touch/tablet layouts so it never covers the inspector deck on the right.    |
| `WorkspaceSkeleton`     | [index.ts](../../packages/app/src/components/WorkspaceSkeleton/index.ts)                                       | 50   | _(no header comment)_                                                                                                                        |

#### Pages (`packages/app/src/pages/`) — route-level shells

| Module       | Entry point                                                                      | LOC  | What it is            |
| ------------ | -------------------------------------------------------------------------------- | ---- | --------------------- |
| `Benchmarks` | [BenchmarksPage.tsx](../../packages/app/src/pages/Benchmarks/BenchmarksPage.tsx) | 3.7k | _(no header comment)_ |

#### Cloudflare Worker (`packages/app/src/worker/`) — backend routes

| Module       | Entry point                                                           | LOC | What it is                                                                                                                                   |
| ------------ | --------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes`     | [discord.ts](../../packages/app/src/worker/routes/discord.ts)         | 850 | Reduce a share title/author to inert plain text before it goes into the public channel: drop links, strip Discord markdown / mention / li... |
| `middleware` | [rateLimit.ts](../../packages/app/src/worker/middleware/rateLimit.ts) | 250 | Rate-limit the write endpoints per IP.                                                                                                       |

#### WebMCP (`packages/app/src/webmcp/`) — agent-callable tool surface

| Module  | Entry point                                              | LOC  | What it is                                     |
| ------- | -------------------------------------------------------- | ---- | ---------------------------------------------- |
| `tools` | [index.ts](../../packages/app/src/webmcp/tools/index.ts) | 5.6k | Barrel export for all WebMCP tool definitions. |

#### Core package (`packages/core/src/`) — pure, dependency-free logic

| Module   | Entry point                                                                              | LOC  | What it is                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema` | [flameSchema.ts](../../packages/core/src/schema/flameSchema.ts)                          | 1.1k | `v.number()` rejects NaN but ACCEPTS Infinity and -Infinity, because both are `typeof 'number'`.                                              |
| `diff`   | [fdiff.ts](../../packages/core/src/diff/fdiff.ts)                                        | 300  | 0–1 overall transform similarity \*/ similarity: number affineSimilarity: number colorSimilarity: number variationSimilarity: number } exp... |
| `math`   | [affine3DView.ts](../../packages/core/src/math/affine3DView.ts)                          | 250  | The fixed isometric projection the affine handles are drawn on.                                                                               |
| `utils`  | [prettyPrintValibotErrors.ts](../../packages/core/src/utils/prettyPrintValibotErrors.ts) | 100  | _(no header comment)_                                                                                                                         |
| `xml`    | [flam3PaletteParser.ts](../../packages/core/src/xml/flam3PaletteParser.ts)               | 50   | RGB to OkLab conversion (D65 illuminant).                                                                                                     |

#### Arcade (`packages/app/src/arcade/`) — arena, director and beats modes

| File                                                                   | LOC | What it is                                                                                                                                   |
| ---------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [topics.ts](../../packages/app/src/arcade/topics.ts)                   | 500 | Commands every Arcade mode may use.                                                                                                          |
| [animatablePaths.ts](../../packages/app/src/arcade/animatablePaths.ts) | 350 | Read the live value behind one `TIMELINE_PARAMETERS` path.                                                                                   |
| [tasteStore.ts](../../packages/app/src/arcade/tasteStore.ts)           | 350 | Persistent taste profile store and flame feature extraction for Evolutionary Art Director.                                                   |
| [duel.ts](../../packages/app/src/arcade/duel.ts)                       | 250 | A duel, as one module-global state — the same shape as `arcade/pilot.ts`, and for the same reason: the tools that start it, the stage tha... |
| [duelActions.ts](../../packages/app/src/arcade/duelActions.ts)         | 250 | The one way a duel starts, whoever is in the other seat.                                                                                     |
| [duelJudge.ts](../../packages/app/src/arcade/duelJudge.ts)             | 200 | How a duel is decided.                                                                                                                       |
| [pilot.ts](../../packages/app/src/arcade/pilot.ts)                     | 200 | "An agent is driving the editor" as one module-global state, the same way `webmcp/contextBridge.ts` holds the command context: the tools,... |
| [affineControls.ts](../../packages/app/src/arcade/affineControls.ts)   | 150 | An affine as six things a person can reason about.                                                                                           |
| [commandHints.ts](../../packages/app/src/arcade/commandHints.ts)       | 150 | Argument shapes for the commands an Arcade mode allows.                                                                                      |
| [duelHud.ts](../../packages/app/src/arcade/duelHud.ts)                 | 100 | Everything a duel HUD draws, derived once.                                                                                                   |
| [pilotActions.ts](../../packages/app/src/arcade/pilotActions.ts)       | 100 | What to tell an agent that has run out of steps.                                                                                             |

#### Workspace hooks (`packages/app/src/hooks/`)

| File                                                                                          | LOC | What it is                                                                |
| --------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------- |
| [useWorkspaceReplay.ts](../../packages/app/src/hooks/useWorkspaceReplay.ts)                   | 650 | _(no header comment)_                                                     |
| [useWorkspaceAutosave.ts](../../packages/app/src/hooks/useWorkspaceAutosave.ts)               | 500 | What one pause write did.                                                 |
| [useWorkspaceTimelineBinding.ts](../../packages/app/src/hooks/useWorkspaceTimelineBinding.ts) | 450 | _(no header comment)_                                                     |
| [useWorkspaceBlendPick.ts](../../packages/app/src/hooks/useWorkspaceBlendPick.ts)             | 300 | The partner gallery's hover preview, and the pick that commits a partner. |
| [useWorkspaceAnimationGen.ts](../../packages/app/src/hooks/useWorkspaceAnimationGen.ts)       | 250 | _(no header comment)_                                                     |
| [useWorkspaceCamera.ts](../../packages/app/src/hooks/useWorkspaceCamera.ts)                   | 200 | _(no header comment)_                                                     |
| [useWorkspaceArena.ts](../../packages/app/src/hooks/useWorkspaceArena.ts)                     | 150 | _(no header comment)_                                                     |
| [useWorkspaceArtDirector.tsx](../../packages/app/src/hooks/useWorkspaceArtDirector.tsx)       | 150 | _(no header comment)_                                                     |
| [useWorkspaceShortcuts.ts](../../packages/app/src/hooks/useWorkspaceShortcuts.ts)             | 150 | _(no header comment)_                                                     |

#### Recorder (`packages/app/src/recorder/`) — deterministic capture and replay

| File                                                                               | LOC  | What it is                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [replayVideo.ts](../../packages/app/src/recorder/replayVideo.ts)                   | 1.3k | Register every command a session may contain before building the isolated replay world.                                                      |
| [recorder.ts](../../packages/app/src/recorder/recorder.ts)                         | 1.2k | The session recorder: turns an editing session into a `.steps.json` log of registered-command invocations (see schema.ts for why intents,... |
| [player.ts](../../packages/app/src/recorder/player.ts)                             | 700  | Timed playback of a recorded session (semantic-recorder-plan, M4).                                                                           |
| [focus.ts](../../packages/app/src/recorder/focus.ts)                               | 500  | Follow-cam hints: **what to look at** while a step runs, never **where**.                                                                    |
| [focusPreparation.ts](../../packages/app/src/recorder/focusPreparation.ts)         | 500  | UI state that must be ready before the follow-cam resolves an action's DOM target.                                                           |
| [schema.ts](../../packages/app/src/recorder/schema.ts)                             | 500  | The `.steps.json` session format — version 1.                                                                                                |
| [replayInterfaceVideo.ts](../../packages/app/src/recorder/replayInterfaceVideo.ts) | 450  | Full-interface capture keeps the viewport aspect ratio, but caps the long edge and pixel count so a 4K/5K monitor cannot create an unboun... |
| [timelineActions.ts](../../packages/app/src/recorder/timelineActions.ts)           | 450  | A timeline whose compound edits reach the session recorder.                                                                                  |
| [replay.ts](../../packages/app/src/recorder/replay.ts)                             | 250  | Whether replay may need browser user activation for generated audio.                                                                         |
| [playWindowPace.ts](../../packages/app/src/recorder/playWindowPace.ts)             | 200  | The pace a replay plays a take's play windows at (recorder/playWindows.ts).                                                                  |
| [snapshotOrigin.ts](../../packages/app/src/recorder/snapshotOrigin.ts)             | 200  | Why a value-pinned snapshot exists.                                                                                                          |
| [uncapturedSteps.ts](../../packages/app/src/recorder/uncapturedSteps.ts)           | 200  | The steps a take could not record, by name.                                                                                                  |
| [playerPlayWindows.ts](../../packages/app/src/recorder/playerPlayWindows.ts)       | 150  | The replay player's half of a play window (recorder/playWindows.ts): across a gap the take spent playing, wait the take's own time, run a... |
| [playWindows.ts](../../packages/app/src/recorder/playWindows.ts)                   | 150  | Play windows: the stretches of a take in which its timeline was playing.                                                                     |
| [sonificationState.ts](../../packages/app/src/recorder/sonificationState.ts)       | 150  | Sonification is authored output state, but it is not part of the flame document.                                                             |
| [documentWriteHook.ts](../../packages/app/src/recorder/documentWriteHook.ts)       | 100  | A leaf seam between document owners and the recorder.                                                                                        |
| [replaySideState.ts](../../packages/app/src/recorder/replaySideState.ts)           | 100  | Editor-only state that follow-cam may change while revealing a target.                                                                       |
| [types.ts](../../packages/app/src/recorder/types.ts)                               | 100  | The session recorder's public types, apart from the module that implements them: what a recording starts from, what a command must expose... |

#### Benchmarks (`packages/app/src/benchmarks/`)

| File                                                                   | LOC  | What it is                                                                                                                                  |
| ---------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [validation.ts](../../packages/app/src/benchmarks/validation.ts)       | 1.2k | _(no header comment)_                                                                                                                       |
| [rng.ts](../../packages/app/src/benchmarks/rng.ts)                     | 450  | _(no header comment)_                                                                                                                       |
| [model.ts](../../packages/app/src/benchmarks/model.ts)                 | 350  | _(no header comment)_                                                                                                                       |
| [statistics.ts](../../packages/app/src/benchmarks/statistics.ts)       | 350  | Relative band around parity used to call a result practically equivalent.                                                                   |
| [flameSources.ts](../../packages/app/src/benchmarks/flameSources.ts)   | 250  | Stable non-cryptographic digest for local flame identity.                                                                                   |
| [export.ts](../../packages/app/src/benchmarks/export.ts)               | 200  | Long-form sample export: one row per raw sample with the immutable manifest identity and comparison summary repeated for straightforward... |
| [resultStore.ts](../../packages/app/src/benchmarks/resultStore.ts)     | 200  | _(no header comment)_                                                                                                                       |
| [schedule.ts](../../packages/app/src/benchmarks/schedule.ts)           | 150  | Produces paired blocks in an alternating AB/BA order.                                                                                       |
| [testFixtures.ts](../../packages/app/src/benchmarks/testFixtures.ts)   | 150  | _(no header comment)_                                                                                                                       |
| [upload.ts](../../packages/app/src/benchmarks/upload.ts)               | 150  | Parses a benchmark flame without touching editor state or registering an embedded XML palette.                                              |
| [resultSummary.ts](../../packages/app/src/benchmarks/resultSummary.ts) | 100  | Derives paired comparison evidence from raw valid measured samples.                                                                         |

#### Command registry (`packages/app/src/commands/`)

| File                                                       | LOC | What it is                                                                     |
| ---------------------------------------------------------- | --- | ------------------------------------------------------------------------------ |
| [registry.ts](../../packages/app/src/commands/registry.ts) | 650 | Explicit signatures for commands whose arguments are small scalar/data shapes. |
| [types.ts](../../packages/app/src/commands/types.ts)       | 400 | _(no header comment)_                                                          |

#### Stores (`packages/app/src/stores/`) — global reactive state

| File                                                                                   | LOC | What it is                         |
| -------------------------------------------------------------------------------------- | --- | ---------------------------------- |
| [workspaceLayoutStore.ts](../../packages/app/src/stores/workspaceLayoutStore.ts)       | 300 | The screen's short edge in CSS px. |
| [console-store.ts](../../packages/app/src/stores/console-store.ts)                     | 100 | eslint-disable no-console \*/      |
| [workspaceSelectionStore.ts](../../packages/app/src/stores/workspaceSelectionStore.ts) | 100 | _(no header comment)_              |
| [index.ts](../../packages/app/src/stores/index.ts)                                     | 50  | _(no header comment)_              |
| [workspaceExportStore.ts](../../packages/app/src/stores/workspaceExportStore.ts)       | 50  | _(no header comment)_              |

#### Utilities (`packages/app/src/utils/`, 200+ LOC)

| File                                                                        | LOC  | What it is                                                                                                                                   |
| --------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [timeline.ts](../../packages/app/src/utils/timeline.ts)                     | 2.2k | Expandable mapping of variation types to their available parameters.                                                                         |
| [audioAnalysis.ts](../../packages/app/src/utils/audioAnalysis.ts)           | 1.0k | Decode encoded audio bytes -- a fetched or uploaded file -- into a buffer.                                                                   |
| [sonification.ts](../../packages/app/src/utils/sonification.ts)             | 800  | _(no header comment)_                                                                                                                        |
| [flameImport.ts](../../packages/app/src/utils/flameImport.ts)               | 650  | Effectively "all" — every store is capped well below this.                                                                                   |
| [videoEncoder.ts](../../packages/app/src/utils/videoEncoder.ts)             | 550  | Offline-export default bitrate: ~0.12 bits per pixel per frame, clamped to a sane range.                                                     |
| [animationExport.ts](../../packages/app/src/utils/animationExport.ts)       | 450  | _(no header comment)_                                                                                                                        |
| [audioExport.ts](../../packages/app/src/utils/audioExport.ts)               | 450  | _(no header comment)_                                                                                                                        |
| [createStoreHistory.ts](../../packages/app/src/utils/createStoreHistory.ts) | 450  | Undo and redo for a Solid store, kept as patches rather than snapshots.                                                                      |
| [exportJobs.ts](../../packages/app/src/utils/exportJobs.ts)                 | 400  | Whether steps glide into place, and how long for.                                                                                            |
| [jsonQueryParam.ts](../../packages/app/src/utils/jsonQueryParam.ts)         | 400  | Decompress and JSON-parse, with no assumption about the shape.                                                                               |
| [mathToWgsl.ts](../../packages/app/src/utils/mathToWgsl.ts)                 | 400  | Translate a math-notation expression (LaTeX-like) into a WGSL function body.                                                                 |
| [recentFlames.ts](../../packages/app/src/utils/recentFlames.ts)             | 400  | What a write to Recents did.                                                                                                                 |
| [useAudioReactive.ts](../../packages/app/src/utils/useAudioReactive.ts)     | 350  | Hand this frame's settled mapping values to the render-time overlay, or `undefined` to take the overlay down.                                |
| [audioWiringPresets.ts](../../packages/app/src/utils/audioWiringPresets.ts) | 300  | What an audio-reactive preset actually wires.                                                                                                |
| [serializeLogArgs.ts](../../packages/app/src/utils/serializeLogArgs.ts)     | 300  | Caps applied to every serialized console entry.                                                                                              |
| [exportRequests.ts](../../packages/app/src/utils/exportRequests.ts)         | 250  | Scripted export requests: the narrow, JSON-shaped options a script or an agent sends to `export.renderImage` / `export.renderAnimation`,...  |
| [flameInMp4.ts](../../packages/app/src/utils/flameInMp4.ts)                 | 250  | ASCII type tag of the box at `offset` (the 4 bytes after the size field).                                                                    |
| [flameInPng.ts](../../packages/app/src/utils/flameInPng.ts)                 | 250  | Second zTXt keyword: the recorded session that produced the flame, so a dropped PNG can offer "replay this creation" as well as "load thi... |

#### Library (`packages/app/src/lib/`, 200+ LOC)

| File                                                                      | LOC | What it is                                                      |
| ------------------------------------------------------------------------- | --- | --------------------------------------------------------------- |
| [WheelZoomCamera3D.tsx](../../packages/app/src/lib/WheelZoomCamera3D.tsx) | 650 | Whether a key press is the focused control's, not the camera's. |
| [galleryContent.ts](../../packages/app/src/lib/galleryContent.ts)         | 300 | Client for the Home tab's content API (see worker/index.ts).    |
| [pauseSave.ts](../../packages/app/src/lib/pauseSave.ts)                   | 300 | The save the native app makes on its way to the background.     |
| [WebgpuAdapter.ts](../../packages/app/src/lib/WebgpuAdapter.ts)           | 250 | _(no header comment)_                                           |
| [WheelZoomCamera2D.tsx](../../packages/app/src/lib/WheelZoomCamera2D.tsx) | 250 | _(no header comment)_                                           |

#### Application root (`packages/app/src/*.tsx`)

| File                                                                        | LOC  | What it is                                               |
| --------------------------------------------------------------------------- | ---- | -------------------------------------------------------- |
| [MainWorkspace.tsx](../../packages/app/src/MainWorkspace.tsx)               | 4.6k | _(no header comment)_                                    |
| [App.tsx](../../packages/app/src/App.tsx)                                   | 500  | _(no header comment)_                                    |
| [defaults.ts](../../packages/app/src/defaults.ts)                           | 150  | _(no header comment)_                                    |
| [App.integration.mock.tsx](../../packages/app/src/App.integration.mock.tsx) | 100  | Mock file for App integration tests.                     |
| [index.tsx](../../packages/app/src/index.tsx)                               | 50   | @refresh reload \*/                                      |
| [valibot.ts](../../packages/app/src/valibot.ts)                             | 50   | We re-export only things we use to keep the bundle small |
| [version.ts](../../packages/app/src/version.ts)                             | 50   | The CI run that built this bundle, '' outside CI.        |
| [vitest.setup.ts](../../packages/app/src/vitest.setup.ts)                   | 50   | Vitest test setup file.                                  |

<!-- END:GENERATED module-map -->

---

## 4. Files heavy enough to be a context-budget decision

<!-- BEGIN:GENERATED heavy-files -->

Reading any of these end-to-end costs roughly 1.0k+ lines of context.
Grep for the symbol and read the surrounding range instead.

| File                                                                                                                                                         | LOC  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| [packages/app/src/flame/examples/animations.ts](../../packages/app/src/flame/examples/animations.ts)                                                         | 5.7k |
| [packages/app/src/MainWorkspace.tsx](../../packages/app/src/MainWorkspace.tsx)                                                                               | 4.6k |
| [packages/app/src/pages/Benchmarks/BenchmarksPage.tsx](../../packages/app/src/pages/Benchmarks/BenchmarksPage.tsx)                                           | 2.8k |
| [packages/app/src/utils/timeline.ts](../../packages/app/src/utils/timeline.ts)                                                                               | 2.2k |
| [packages/app/src/flame/variations/docs/content.general.ts](../../packages/app/src/flame/variations/docs/content.general.ts)                                 | 1.9k |
| [packages/app/src/flame/variations/docs/content.general2.ts](../../packages/app/src/flame/variations/docs/content.general2.ts)                               | 1.8k |
| [packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx](../../packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx)                 | 1.6k |
| [packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx](../../packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx)                     | 1.5k |
| [packages/app/src/components/LoadFlameModal/LoadFlameModal.tsx](../../packages/app/src/components/LoadFlameModal/LoadFlameModal.tsx)                         | 1.4k |
| [packages/app/src/components/AudioReactivePanel/AudioReactivePanel.tsx](../../packages/app/src/components/AudioReactivePanel/AudioReactivePanel.tsx)         | 1.3k |
| [packages/app/src/components/FlameRandomizerCard/FlameRandomizerCard.tsx](../../packages/app/src/components/FlameRandomizerCard/FlameRandomizerCard.tsx)     | 1.3k |
| [packages/app/src/components/LogoFaviconGenerator/LogoFaviconGenerator.tsx](../../packages/app/src/components/LogoFaviconGenerator/LogoFaviconGenerator.tsx) | 1.3k |
| [packages/app/src/components/VariationSelector/VariationSelector.tsx](../../packages/app/src/components/VariationSelector/VariationSelector.tsx)             | 1.3k |
| [packages/app/src/flame/Flam3.tsx](../../packages/app/src/flame/Flam3.tsx)                                                                                   | 1.3k |
| [packages/app/src/recorder/replayVideo.ts](../../packages/app/src/recorder/replayVideo.ts)                                                                   | 1.3k |
| [packages/app/src/benchmarks/validation.ts](../../packages/app/src/benchmarks/validation.ts)                                                                 | 1.2k |
| [packages/app/src/components/AffineEditor/AffineEditor.tsx](../../packages/app/src/components/AffineEditor/AffineEditor.tsx)                                 | 1.2k |
| [packages/app/src/components/Home/HomeFlame.tsx](../../packages/app/src/components/Home/HomeFlame.tsx)                                                       | 1.2k |
| [packages/app/src/flame/variations/utils.ts](../../packages/app/src/flame/variations/utils.ts)                                                               | 1.2k |
| [packages/app/src/recorder/recorder.ts](../../packages/app/src/recorder/recorder.ts)                                                                         | 1.2k |
| [packages/app/src/components/AudioWiringModal/NodeGraphView.tsx](../../packages/app/src/components/AudioWiringModal/NodeGraphView.tsx)                       | 1.1k |

<!-- END:GENERATED heavy-files -->

---

## 5. Scripts

<!-- BEGIN:GENERATED scripts -->

| Script                  | Runs                                                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------- | ------------- |
| `pnpm prepare`          | `git config core.hooksPath .githooks                                                                                                                                                                                                            |                   | true`          |
| `pnpm start`            | `pnpm --filter chaos-master start`                                                                                                                                                                                                              |
| `pnpm capture:readme`   | `pnpm --filter chaos-master capture:readme`                                                                                                                                                                                                     |
| `pnpm flam3:compat`     | `pnpm --filter chaos-master flam3:compat`                                                                                                                                                                                                       |
| `pnpm fmt`              | `prettier packages --check`                                                                                                                                                                                                                     |
| `pnpm fmt:fix`          | `prettier packages --write --log-level warn`                                                                                                                                                                                                    |
| `pnpm lint`             | `NODE_OPTIONS="--max-old-space-size=4096" eslint`                                                                                                                                                                                               |
| `pnpm lint:fix`         | `NODE_OPTIONS="--max-old-space-size=4096" eslint --fix`                                                                                                                                                                                         |
| `pnpm typecheck`        | `pnpm --filter @chaos-master/core typecheck && pnpm --filter @chaos-master/mobile-runtime typecheck && NODE_OPTIONS="--max-old-space-size=8192" tsc --noEmit --project packages/app/tsconfig.json && pnpm --filter @chaos-master/landing check` |
| `pnpm validate-wgsl`    | `npx --yes tsx scripts/validate-wgsl-props.ts`                                                                                                                                                                                                  |
| `pnpm check`            | `pnpm typecheck && pnpm lint:fix && pnpm fmt:fix && pnpm validate-wgsl`                                                                                                                                                                         |
| `pnpm docs:index`       | `node scripts/gen-agent-index.mjs`                                                                                                                                                                                                              |
| `pnpm docs:index:check` | `node scripts/gen-agent-index.mjs --check`                                                                                                                                                                                                      |
| `pnpm metrics`          | `node scripts/code-metrics.mjs`                                                                                                                                                                                                                 |
| `pnpm metrics:json`     | `node scripts/code-metrics.mjs --json`                                                                                                                                                                                                          |
| `pnpm metrics:check`    | `node scripts/code-metrics.mjs --check`                                                                                                                                                                                                         |
| `pnpm metrics:update`   | `node scripts/code-metrics.mjs --update`                                                                                                                                                                                                        |
| `pnpm mutation:core`    | `pnpm --filter @chaos-master/core exec stryker run`                                                                                                                                                                                             |
| `pnpm arch`             | `depcruise --config .dependency-cruiser.cjs --output-type err packages/app/src packages/core/src`                                                                                                                                               |
| `pnpm arch:summary`     | `depcruise --config .dependency-cruiser.cjs --output-type err-long packages/app/src packages/core/src`                                                                                                                                          |
| `pnpm verify:webgpu`    | `node scripts/verify-webgpu-headed.mjs`                                                                                                                                                                                                         |
| `pnpm test:coverage`    | `pnpm --filter chaos-master exec vitest run --coverage && pnpm --filter @chaos-master/core exec vitest run --coverage`                                                                                                                          |
| `pnpm test`             | `pnpm --filter @chaos-master/core test && pnpm --filter @chaos-master/mobile-runtime test && pnpm --filter chaos-master exec vitest run && pnpm --filter chaos-master test:scripts`                                                             |
| `pnpm test:changed`     | `node scripts/test-changed.mjs`                                                                                                                                                                                                                 |
| `pnpm test:pr`          | `pnpm --filter @chaos-master/core test && pnpm --filter @chaos-master/mobile-runtime test && pnpm test:changed && pnpm --filter chaos-master test:scripts`                                                                                      |
| `pnpm test:ui`          | `pnpm --filter chaos-master exec vitest --ui`                                                                                                                                                                                                   |
| `pnpm test:watch`       | `pnpm --filter chaos-master exec vitest`                                                                                                                                                                                                        |
| `pnpm test:e2e`         | `playwright test`                                                                                                                                                                                                                               |
| `pnpm test:e2e:ci`      | `playwright test --project=chromium-ci`                                                                                                                                                                                                         |
| `pnpm ci`               | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e:ci`                                                                                                                                                                                  |
| `pnpm lines`            | `cloc packages --exclude-dir=node_modules,dist --by-file-by-lang --not-match-f='(.\*[.]d[.]ts                                                                                                                                                   | ._[.]stories[.]._ | ._[.]test[.]._ | .\*[.]json)'` |
| `pnpm deploy:dev`       | `pnpm --filter chaos-master deploy:dev`                                                                                                                                                                                                         |
| `pnpm deploy:prod`      | `pnpm --filter chaos-master deploy:prod`                                                                                                                                                                                                        |
| `pnpm wr-dev`           | `pnpm --filter chaos-master wr-dev`                                                                                                                                                                                                             |
| `pnpm mobile:build`     | `pnpm --filter chaos-master build:native`                                                                                                                                                                                                       |
| `pnpm mobile:sync`      | `pnpm --filter @chaos-master/mobile sync`                                                                                                                                                                                                       |
| `pnpm mobile:android`   | `pnpm --filter @chaos-master/mobile run:android`                                                                                                                                                                                                |

<!-- END:GENERATED scripts -->
