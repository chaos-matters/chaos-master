# Bug hunt — Lumen Apeiron (Chaos Master)

Audit date: 2026-09-10. Range: `v0.9.11` (`5dbde563`) .. `a5c2f26f`
— 39 commits delivered as 11 squash-merged fork PRs, #73 to #83.

Six independent hunts ran in parallel, each with a different lens: workspace
decomposition, arcade and WebMCP, recorder and render driver, timeline and
audio, benchmarks and core, mobile and docs. Each lens's high and medium
findings were then handed to a second agent prompted to **refute** them by
reading the code, defaulting to refuted when unconvinced. One further finding
(`cam3d-pinch-nan`) came from a follow-up investigation into why the tablet
exporter needed fixing twice, and five more from the stage 2 characterization
net and the motion blur work (2026-09-11) -- those carry their lens and the PR
that found or fixed them. Finding 64 came later, from maff's report from the
iOS app (2026-09-23), and is under [Found after the audit](#found-after-the-audit).

Every finding below cites a file and a line and was found by reading code, not
by pattern-matching a linter.

> No script generates this file. The audit's findings were written into it
> once, and it has been edited by hand since. It is listed in
> `.prettierignore` because its body is quoted evidence — code, log lines,
> shell fragments — and prettier rewrites the `*` and `_` in that text as
> markdown emphasis, silently corrupting it.

## How to read the status columns

Each finding carries two statuses: what the audit found it to be, and where it
stands on main now.


| Status | Meaning |
| --- | --- |
| **CONFIRMED** | A second agent independently read the code and could not refute it. Treat as fact. |
| **REFUTED** | The finder was wrong. Kept below so nobody re-reports it. |
| reported | Found and evidenced, but rated low severity and therefore never put through refutation. A lead, not a fact. |

Severity is the **verifier's** corrected rating, which is frequently lower than
the finder's — 21 of the confirmed findings were downgraded to low on review.

The **Now** line under each finding, and the table in
[Status on main](#status-on-main), give its state on main:

| Now | Meaning |
| --- | --- |
| fixed | The defect is gone. The row names the PR and commit, and the test that holds the fix where there is one. |
| open | The defect is still there. A partly fixed finding is open, and its row says which part is left. |
| refuted | The claim does not hold on main: the audit's five refutations, re-read, and one unverified finding that turned out false. |

## Totals

| | Count |
| --- | ---: |
| Findings raised | 64 |
| **Confirmed** | **37** |
| — of which high | 5 |
| — of which medium | 9 |
| — of which low | 23 |
| Refuted | 5 |
| Low, not verified | 21 |
| From a device report | 1 |

The fixes for the high and medium findings were planned task by task in
[../superpowers/plans/2026-09-10-audit-remediation-stage1-defects.md](../superpowers/plans/2026-09-10-audit-remediation-stage1-defects.md),
which landed as #90; later fixes came with #91, #92, #95, #110, #112, #113
and #115.

## Status on main

Where each finding stands on main at `9fc08078` (#108, 2026-09-23), checked
by reading the code at the cited lines and naming the test that holds a fix.
The findings further down keep the words and line numbers they were found
with, pinned to `a5c2f26f`; this table is the part that tracks main. Every
citation in it is checked on every pull request by `pnpm docs:cite`, so a
change that moves or removes the cited code fails CI until the row is
updated. Row 64 was added later, with the pull request that finished its fix.

| Found as | Findings | Fixed | Open | Refuted |
| --- | ---: | ---: | ---: | ---: |
| Confirmed, high | 5 | 5 | 0 | 0 |
| Confirmed, medium | 9 | 6 | 3 | 0 |
| Confirmed, low | 23 | 5 | 18 | 0 |
| Refuted | 5 | 0 | 0 | 5 |
| Low, not verified | 21 | 4 | 16 | 1 |
| Device report | 1 | 1 | 0 | 0 |
| **All** | **64** | **21** | **37** | **6** |

4 of the open findings are partly fixed; the row says which part is left.
"Refuted, still" means the audit's refutation still holds on main.

| # | Finding | Found as | Now | Evidence on main |
| --- | --- | --- | --- | --- |
| 1 | [Keyframe short-circuit widened to every parameter path](#timeline-keyframe-short-circuit-was-widened-from-7-camera-paths-to-every-parameter-path-during-the-getflamevalue-extraction) | confirmed, high | fixed, #90 (`abd83151`) | `packages/app/src/hooks/useWorkspaceTimelineBinding.ts:111` (`KEYFRAME_SHORT_CIRCUIT_PATHS`); tests `packages/app/src/hooks/useWorkspaceTimelineBinding.test.ts:201` "does not let a transform keyframe shadow a live edit to that transform", `:250` "never short-circuits camera.rotation, which had no short-circuit before the extraction" |
| 2 | [`.tabletLayout` overridden by the 768px block](#tabletlayout-is-overridden-by-the-pre-existing-max-width768px-block-collapsing-the-tablet-split-layout-across-the-whole-680-768px-band) | confirmed, high | fixed, #90 (`7062e1f2`) | `packages/app/src/App.module.css:1407` (`.layout:not(.tabletLayout)`). No automated test: checked in headed Chrome across 680-768px in #90. `.phoneLayout` is still overridden there, on purpose |
| 3 | [Beats never loads a bundled track](#beats-mode-never-loads-a-bundled-track-and-arcade_set_audio_mapping-disables-audio-reactivity-as-its-final-act) | confirmed, high | fixed, #90 (`f1b74bb9`, `af2c4ee8`) | `packages/app/src/webmcp/tools/arcadeBeats.ts:124` (`loadBundledTrack`), `:414` (`canEnable`), `packages/app/src/MainWorkspace.tsx:3226` (`fetchBundledTrackBuffer`); tests `packages/app/src/webmcp/tools/arcadeBeats.test.ts:183` "loads the requested bundled track before recording starts", `:257` "says whether the mapping actually left reactivity on" |
| 4 | [3D pinch-zoom NaN camera radius](#3d-pinch-zoom-produces-a-nan-or-infinite-camera-radius-wheelzoomcamera3d-never-got-the-guards-its-2d-twin-received) | confirmed, high | fixed, #90 (`5c88d855`, `376cb80f`, `af2c4ee8`) | `packages/app/src/utils/createPinchHandler.ts:31` (`isUsablePinch`), `packages/app/src/lib/WheelZoomCamera3D.tsx:378` (`Number.isFinite(ratio)`), `packages/core/src/schema/flameSchema.ts:254` (`finiteNumber`); test `packages/app/src/utils/createPinchHandler.test.ts:50` "never starts a pinch from two coincident touches". The 3D guards have no test of their own |
| 5 | [Motion blur never blurred](#motion-blur-never-blurred-on-either-export-path-the-first-sub-frame-took-the-whole-point-budget) | confirmed, high | fixed, #91 (`71dd509b`, `26348360`, `7b1aee27`) | `packages/app/src/flame/Flam3.tsx:981` (`exportTickIterations`), `:841` (`exportOwnsResets`); test `packages/app/src/utils/motionBlur.test.ts:74` "stops a tick at the sub-frame share instead of the whole budget" |
| 6 | [Timeline interpolation copied into core](#the-timelines-interpolation-math-was-copied-into-packagescore-rather-than-moved-the-core-copy-is-byte-identical-exported-from-the-barrel-and-imported-by-nothing) | confirmed, medium | fixed, #115 (`984926e4`) | `packages/app/src/utils/easing.ts:4` (`catmullRom`) re-exports the core copy; test `packages/core/src/math/easing.test.ts:61` "catmullRom passes through p1 at t=0 and p2 at t=1" |
| 7 | [Animation generation skips the recorder](#useworkspaceanimationgen-was-handed-the-raw-timeline-instead-of-recordertimeline-so-randomizesmart-animation-no-longer-emit-a-recorder-snapshot) | confirmed, medium | fixed, #90 (`b6838992`) | `packages/app/src/hooks/useWorkspaceAnimationGen.ts:227` (`recorderTimeline`), `packages/app/src/MainWorkspace.tsx:3588` (`recorderTimeline`); test `packages/app/src/hooks/useWorkspaceAnimationGen.test.ts:46` "records Randomize Animation as one replayable timeline snapshot" |
| 8 | [`sidebarScrollRef` never assigned](#mainworkspaces-sidebarscrollref-and-sidebarref-were-orphaned-by-the-workspacesidebar-extraction-permanently-disabling-the-randomizer-scroll-anchor) | confirmed, medium | open; the `sidebarRef` half was deleted in #115 (`32ab0911`) | `packages/app/src/MainWorkspace.tsx:422` (`sidebarScrollRef`) is declared and never assigned, so the guard at `:2280` (`sidebarScrollRef`) always bails and `:2496` (`anchorSidebarToRandomizer`) does nothing. The sidebar binds a local of its own, `packages/app/src/components/WorkspaceSidebar/WorkspaceSidebar.tsx:252` (`sidebarScrollRef`) |
| 9 | [PR-preview deploy still indexable](#pr-preview-deploy-is-the-one-review-host-79-missed--it-still-serves-allow--plus-productions-sitemap-and-its-url-is-posted-publicly-on-every-pr) | confirmed, medium | fixed, #90 (`c37f8aae`) | `packages/app/src/worker/middleware/reviewHost.ts:31` (`.workers.dev`); test `packages/app/src/worker/index.test.ts:481` "%s marks the SPA noindex" |
| 10 | [Taste records overwrite across sessions](#taste-profile-records-are-keyed-by-generation-candidateindex-only-so-every-new-director-session-overwrites-the-previous-sessions-ratings) | confirmed, medium | fixed, #90 (`404db62a`) | `packages/app/src/arcade/tasteStore.ts:182` (`feedback.sessionId`), `packages/app/src/components/DirectorOverlay.tsx:82` (`sessionId`); test `packages/app/src/arcade/tasteStore.test.ts:92` "keeps ratings from separate Director sessions that reuse generation numbers" |
| 11 | [Offscreen export drops motion blur](#motion-blur-is-silently-discarded-on-the-offscreen-animation-export-path) | confirmed, medium | fixed, #91 (`71dd509b`, `98f80d64`) | `packages/app/src/components/ExportJobs/OffscreenAnimationRender.tsx:99` (`job.motionBlurSamples`), `:524` (`accumulationFraction`); test `packages/app/src/utils/motionBlur.test.ts:35` "hands both export paths the same settings, shutter angle included" |
| 12 | [Five modules copied into core](#five-modules-were-copied-into-core-instead-of-re-exported-leaving-byte-identical-twins-two-of-the-copies-are-dead) | confirmed, medium | open; four of the five settled in #115 (`984926e4`) | easing, record and schemaUtil now re-export core, and the app copy of prettyPrintValibotErrors is deleted. Left: `packages/core/src/xml/flam3PaletteParser.ts:3` (`flam3CalcAlpha`) duplicates `packages/app/src/flame/flam3PaletteParser.ts:29` (`flam3CalcAlpha`), and the core copy is reachable only through the barrel, `packages/core/src/index.ts:15` (`flam3PaletteParser`). The two have drifted apart, so it is a clone now, not a byte-identical twin |
| 13 | [`.flame` skipIters does not round-trip](#exported-flame-files-re-import-with-a-different-skipiters-the-export-formula-is-not-the-inverse-of-the-import) | confirmed, medium | fixed, #92 (`18b15327`) | `packages/app/src/flame/flameXml.ts:873` (`skipIters`); test `packages/app/src/flame/flameXml.test.ts:325` "round-trips every skipIters value exactly" |
| 14 | [`.flame` export loses transform chroma](#exporting-a-flame-loses-its-transform-colour-chroma-only-an-angle-derived-colour-index-is-written-no-palette) | confirmed, medium | open | `packages/app/src/flame/flameXml.ts:908` (`Math.atan2`); pinned as a known loss by `packages/app/src/flame/flameXml.golden.test.ts:79` "loses transform colour chroma from an embedded palette", a plain test since `05e51be8` (#92) |
| 15 | [Variation-weight targets keyed by type](#variation-weight-targets-are-keyed-by-variation-type-so-two-same-type-variations-in-one-transform-collide-on-both-the-write-target-and-the-smoothing-state-key) | confirmed, low | open | `packages/app/src/utils/audioAnalysis.ts:843` (`tgt.variationType`), `:566` (`target.variationType`), `packages/app/src/utils/audioWiringPresets.ts:186` (`variation.type`) |
| 16 | [Variation-weight mappings turned live](#pr-82-silently-turned-every-variation-weight-audio-mapping-from-inert-to-live-inside-a-commit-labelled-a-refactor) | confirmed, low | open | `packages/app/src/utils/audioAnalysis.ts:846` (`weight = val`) writes the weight unbounded; the CHANGELOG still has no entry for the change |
| 17 | [Clash choreography rewrite untested](#the-890-line-clash-choreography-rewrite--the-part-of-pr-80-with-real-sign-inversion-risk--got-zero-new-tests-the-two-existing-tests-assert-track-paths-never-keyframe-values) | confirmed, low | open | `packages/app/src/flame/flameClashChoreography.test.ts:124` "generates 3D combat tracks with orbital camera, transform translation, and exposure flashes" still checks track paths only (`:146` (`toContain`)); the sign choice at `packages/app/src/flame/flameClashChoreography.ts:111` (`isP1`) is pinned by nothing |
| 18 | [Lazy modal factories cache a rejection](#lazy-modal-factories-cache-a-rejected-import-promise-and-every-call-site-discards-the-rejection-with-void) | confirmed, low | open | `packages/app/src/components/WorkspaceModalsHost/lazyModals.ts:26` (`instancePromise`) neither catches nor resets, and every call site still discards the rejection, as at `packages/app/src/MainWorkspace.tsx:3780` (`showBenchmark`) |
| 19 | [Layout store memos at module scope](#workspacelayoutstore-creates-three-creatememo-computations-at-module-scope-outside-any-createroot-or-owner) | confirmed, low | fixed, #90 (`b17c7b6e`); duplicate listeners gone in #95 (`d7b4af3b`) | `packages/app/src/stores/workspaceLayoutStore.ts:190` (`createRoot`); guard `packages/app/src/moduleScopeComputations.test.ts:33` "creates no computation outside an owner at import time". `isPhone` now derives from `packages/app/src/stores/workspaceLayoutStore.ts:200` (`layoutClass`), and `packages/app/src/MainWorkspace.tsx:427` (`matchMedia`) keeps only the 768px query |
| 20 | [`isPhone` and friends have no owner](#isphoneistabletistouchlayout-are-creatememo-calls-at-module-scope-with-no-owner--the-codebases-only-three) | confirmed, low | fixed, #90 (`b17c7b6e`) | `packages/app/src/stores/workspaceLayoutStore.ts:190` (`createRoot`); test `packages/app/src/stores/workspaceLayoutStore.test.ts:253` "creates its module-level memos inside a root, so Solid does not warn". Not done from the suggested fix: the store interface still lists the three globals as instance fields, `packages/app/src/stores/workspaceLayoutStore.ts:90` (`isPhone`) |
| 21 | [Horizontal scroll drag latches `isDown`](#createhorizontalscrolldrag-never-sees-pointerup-released-outside-the-rail-leaving-isdown-latched-so-a-later-hover-scrolls-the-gallery) | confirmed, low | open | `packages/app/src/utils/createHorizontalScrollDrag.ts:123` (`handlePointerUp`), `:71` (`isDown`); its callers are now `packages/app/src/components/TouchSurface/TouchControlSurface.tsx:97` and `packages/app/src/components/ViewControls/ViewControls.tsx:79` (`createHorizontalScrollDrag`) |
| 22 | [Touch drawer ignores `onSonification`](#advancedtoolsdrawer-accepts-and-ignores-onsonification-so-sonification-is-unreachable-from-the-touch-drawer-despite-mainworkspace-fully-wiring-it) | confirmed, low | open | `packages/app/src/components/TouchSurface/AdvancedToolsDrawer.tsx:12` (`onSonification`) is declared and never read, though `packages/app/src/MainWorkspace.tsx:4057` (`onSonification`) passes it; `packages/app/src/components/TouchSurface/AdvancedToolsDrawer.tsx:15` (`onShare`) is unread too |
| 23 | [`TabletSplitLayout` has no caller](#tabletsplitlayout-has-a-unit-test-and-a-barrel-export-but-no-production-caller--a-second-unreachable-tablet-layout) | confirmed, low | fixed, #95 (`c5039165`), which deleted it with its barrel entry, test and CSS | Leftovers beside it: `packages/app/src/components/TouchSurface/types.ts:42` (`AdvancedDrawerItem`) has no user, `packages/app/src/components/TouchSurface/types.ts:7` (`TouchSurfaceMode`) types a prop nothing reads, and `packages/app/src/components/TouchSurface/TouchSurface.module.css:365` (`quickPicksHeader`), `:373` (`quickPicksStrip`) are unused classes |
| 24 | [`llms.txt` names three Arcade modes](#llmstxt-names-three-arcade-modes-with-tools-six-shipped-three-of-them-in-the-two-prs-merged-before-it) | confirmed, low | open | `packages/app/public/llms.txt:46` (`Teach, Cinema and Duel`) is unchanged, and the tool-count test does not read `llms.txt` |
| 25 | [`BEATS_ALLOWED` names unregistered commands](#beats_allowed-advertises-four-command-ids-that-are-not-registered-and-describeallowedcommands-passes-them-through-unchecked) | confirmed, low | fixed, #113 (`8dab3d52`) | `packages/app/src/arcade/topics.ts:305` (`BEATS_ALLOWED`); test `packages/app/src/arcade/topics.test.ts:31` "names only registered commands, in every Arcade allow-list". `describeAllowedCommands` still passes ids through unchecked at run time, `packages/app/src/arcade/commandHints.ts:121` (`ids.push(entry)`); the test is what holds the lists honest |
| 26 | [`arena_start_clash` ignores `rounds`](#arena_start_clash-documents-and-accepts-a-rounds-parameter-that-the-only-implementation-of-startclash-discards) | confirmed, low | open | `packages/app/src/webmcp/tools/arenaStartClash.ts:94` (`raw.rounds`); `packages/app/src/components/ArenaOverlay.tsx:470` (`startClash`) reads only the stance and still hard-codes `:524` (`rounds: 3`) |
| 27 | [Taste and stats skip transforms without `visible`](#extractflametastefeatures-and-calculategroundedstats-skip-every-transform-whose-visible-field-is-absent-which-is-the-normal-shape-of-an-agent-supplied-flame) | confirmed, low | open | `packages/app/src/arcade/tasteStore.ts:108` (`t.visible`), `packages/app/src/flame/stats.ts:368` (`t.visible`); `packages/app/src/webmcp/tools/arcadeDirector.ts:201` (`extractFlameTasteFeatures`) runs on the unparsed flame |
| 28 | [`ensureCamera` fabricates a camera3D](#ensurecamera-fabricates-a-camera3d-with-fields-that-do-not-exist-in-camera3dobjschema-and-omits-thetaphiradiusroll) | confirmed, low | open | `packages/app/src/components/ArenaOverlay.tsx:45` (`ensureCamera`), `:54` (`position: [0, 0, -5]`), reached from `:716` (`p1PreviewFlame`) |
| 29 | [Video export skips the queue fence](#animationreplay-video-export-captures-the-canvas-without-awaiting-the-queue-fence-that-the-png-export-path-now-awaits) | confirmed, low | open | `packages/app/src/components/ExportJobs/OffscreenAnimationRender.tsx:496` (`finalImageReady`) goes straight to `:498` (`captureAndAdvance`) with no fence, while the PNG path awaits one at `packages/app/src/components/ExportJobs/ExportJobHost.tsx:196` (`info?.fence`). The capture itself changed in #99 (`2e0768cc`) to `packages/app/src/components/ExportJobs/OffscreenAnimationRender.tsx:305` (`toBlob`); the missing fence did not |
| 30 | [Core hard-codes the mode enums](#core-hard-codes-the-mode-enums-the-app-derives-from-its-gpu-implementation-maps-splitting-the-schemas-source-of-truth) | confirmed, low | open | `packages/core/src/schema/modes.ts:9` (`PointInitMode`); the app derives its own at `packages/app/src/flame/pointInitMode.ts:203` (`allPointInitModes`) and `packages/app/src/flame/drawMode.ts:27` (`drawModeToImplFn`), and no test compares the two |
| 31 | [`prettyPrintValibotErrors.ts` orphaned](#packagesappsrcutilsprettyprintvaliboterrorsts-is-orphaned---zero-importers-after-the-extraction) | confirmed, low | fixed, #115 (`984926e4`), which deleted the file | The core copy is the only one, used at `packages/core/src/schema/flameSchema.ts:5` (`prettyPrintValibotErrors`) |
| 32 | [Worker helpers widened to exports](#worker-decomposition-widened-24-module-private-helpers-into-public-exports-that-nothing-imports) | confirmed, low | open | Spot check, each still exported with no importer: `packages/app/src/worker/routes/discord.ts:15` (`sanitizeDiscordText`), `:26` (`buildDiscordContent`), `:80` (`stageCommunityShowcase`), `packages/app/src/worker/routes/gallery.ts:38` (`withGalleryColumnsFallback`), `:85` (`parseSequence`), `packages/app/src/worker/routes/og.ts:78` (`injectMeta`) |
| 33 | [Core carries a TypeGPU shader function](#the-pure-core-package-contains-a-typegpu-shader-function-and-pulls-typegpu-into-the-cloudflare-workers-import-graph) | confirmed, low | open | `packages/core/src/math/affineTransform.ts:30` (`transformAffine`), exported from `packages/core/src/index.ts:3` (`affineTransform`), and reaching the worker through `packages/app/src/worker/routes/discord.ts:1` (`tryValidateFlame`); typegpu is still a runtime dependency of core, `packages/core/package.json:28` (`typegpu`) |
| 34 | [BenchmarksPage split made no module boundary](#the-benchmarkspage-decomposition-created-no-module-boundary-2868---2800-lines-every-new-subcomponent-in-the-same-file) | confirmed, low | open | `packages/app/src/pages/Benchmarks/BenchmarksPage.tsx:598` (`CompletedRunCard`), `:923` (`BenchmarkRunSection`) are still in the one file |
| 35 | [`benchmarkRunnerUtils.ts` has no tests](#benchmarkrunnerutilsts---the-extracted-sample-record-and-schedule-logic---has-no-tests-though-the-commit-claims-comprehensive-coverage) | confirmed, low | open | `packages/app/src/pages/Benchmarks/benchmarkRunnerUtils.ts:127` (`createBenchmarkSampleRecord`), `:81` (`createBenchmarkScheduleForRuntimes`); its only importer is BenchmarksPage, and no test imports it |
| 36 | [Dark background exports as 1](#a-very-dark-background-channel-exports-as-1-and-re-imports-at-full-intensity) | confirmed, low | open | `packages/app/src/flame/flameXml.ts:876` (`Math.round(v * 255)`), import at `:471` (`bgColor`); pinned by `packages/app/src/flame/flameXml.golden.test.ts:101` "brings a very dark background channel back at full intensity" |
| 37 | [Exposure rounded to a brightness step](#exposure-is-rounded-to-a-whole-flam3-brightness-step-on-export) | confirmed, low | open | `packages/app/src/flame/flameXml.ts:868` (`Math.pow`), import at `:487` (`brightness`); pinned by `packages/app/src/flame/flameXml.golden.test.ts:109` "rounds exposure to a whole brightness step" |
| 38 | [`chaos-morph` targets `linear`](#the-built-in-chaos-morph-wiring-preset-targets-variation-type-linear-which-no-variation-in-the-registry-is-called) | refuted | refuted, still | The string at `packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx:327` (`variationType`) lives only in the fallback `:526` (`DEFAULT_PRESETS`), and the one mount always passes presets, `packages/app/src/components/AudioReactivePanel/AudioReactivePanel.tsx:1249` (`wiringPresets`) |
| 39 | [Docs gallery lost its GPU cost cap](#documentation-gallerys-gpu-cost-cap-was-deleted-with-its-justifying-comment-raising-each-of-148-live-previews-to-84x-the-pixels-at-ultra-tier-quality) | refuted | refuted, still | `packages/app/src/components/VariationSelector/VariationSelector.tsx:263` (`settledVisible`), `packages/app/src/components/DocumentationModal/VariationDocsTab.tsx:234` (`ComputeGate`), `packages/app/src/contexts/ComputeGateContext.tsx:12` (`isVisible`) |
| 40 | [ArenaOverlay never unregisters](#arenaoverlay-registers-arenastartclashgamestate-on-mount-and-never-unregisters-them-so-a-re-opened-arena-runs-the-disposed-instance-and-leaves-the-staged-clash-in-the-users-document) | refuted | refuted, still | `packages/app/src/components/ArenaOverlay.tsx:470` (`startClash`), `:488` (`onCleanup`); the open flag is a plain signal, `packages/app/src/hooks/useWorkspaceArena.ts:27` (`createSignal`), and `packages/app/src/webmcp/tools/arenaStartClash.ts:81` (`setOpen`) remounts before `:92` (`startClash`) |
| 41 | [Export fence timeout breaks one-in-flight](#export-drivers-2s-fence-timeout-abandons-the-pending-submission-and-submits-the-next-chunk-anyway-breaking-its-own-one-chunk-in-flight-invariant) | refuted | refuted, still | `packages/app/src/flame/renderDrivers/createExportRenderDriver.ts:150` (`gpuReady`); test `packages/app/src/flame/renderDrivers/renderDrivers.test.ts:150` "catches and suppresses fence rejection gracefully" |
| 42 | [Core imports the whole valibot namespace](#core-imports-the-whole-valibot-namespace-bypassing-the-apps-deliberately-curated-valibot-re-export) | refuted | refuted, still | `packages/core/src/schema/flameSchema.ts:1` (`valibot`); `packages/core/package.json:29` (`valibot`) pins the same version as `packages/app/package.json:52` (`valibot`) |
| 43 | [`applyTransformField` dropped its length guards](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/app/src/utils/timeline.ts:2020` (`parts`), `:2066` (`applyTransformField`); `packages/core/src/schema/timeline.ts:31` (`segments`) |
| 44 | [Two `TimelineConfig` defaults](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/core/src/schema/timeline.ts:259` (`defaultTimelineConfig`) has no time scale; `packages/app/src/utils/timeline.ts:374` (`defaultConfig`) has one, `packages/app/src/MainWorkspace.tsx:122` (`defaultTimelineConfig`) imports the name, and `packages/app/src/recorder/replayVideo.ts:181` (`timeScale`) reads it |
| 45 | [`applyTracksToFlame` positional arguments](#reported-low-severity-not-independently-verified) | low, not verified | open (readability) | `packages/app/src/utils/timeline.ts:2146` (`applyCameraTracks`), `:1861` (`applyTrackNumber`) |
| 46 | [Escape clears both drag signals](#reported-low-severity-not-independently-verified) | low, not verified | refuted on reading | `packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx:734` (`setDragFromTarget`) and `:742` (`setDragFrom`) already clear each other, so only one is ever set and clearing both is clearing that one; `:873` (`dragFromTarget`) |
| 47 | [Variation getter returns a default](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/app/src/hooks/useWorkspaceTimelineBinding.ts:179` (`params`) falls through to `:186` (`paramDefaults`); no test either way, and the new behaviour is arguably the better one |
| 48 | [Hardware-tier fix papers over the pattern](#reported-low-severity-not-independently-verified) | low, not verified | open (latent) | `packages/app/src/hooks/useWorkspaceArtDirector.tsx:20` (`hardwareTier`) still accepts a raw value, unwrapped at `:110` (`hardwareTier`); the only caller passes an accessor, `packages/app/src/MainWorkspace.tsx:540` (`hardwareTier`). The second half of the claim, other hooks capturing props eagerly, does not hold |
| 49 | [Touch surface props nobody reads](#reported-low-severity-not-independently-verified) | low, not verified | open; #112 (`bf7744ad`) removed `onSnapshot` | `packages/app/src/components/TouchSurface/types.ts:12` (`mode`), `:21` (`onUndo`), `:25` (`onPickGallery`), still forwarded by `packages/app/src/components/TouchSurface/TabletInspectorDeck.tsx:205` (`onUndo`); the removal is held by `packages/app/src/components/TouchSurface/TouchSurface.test.tsx:261` "takes no save handler of its own" |
| 50 | [Touch gallery builds two observers per tile](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/app/src/components/TouchSurface/TouchControlSurface.tsx:94` (`createSharedIntersectionObserver`), `:356` (`VariationPreview`) passes no visibility, so `packages/app/src/components/VariationSelector/VariationSelector.tsx:188` (`useIntersectionObserver`) builds a second observer; the pattern to copy is at `:995` (`nearViewport`) |
| 51 | [ExportJobTracker never cancels its frame](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/app/src/components/ExportJobs/ExportJobTracker.tsx:38` (`requestAnimationFrame`), `:34` (`removeProperty`) |
| 52 | [Touch fallback dispatches `flame.quickExport`](#reported-low-severity-not-independently-verified) | low, not verified | fixed, #95 (`65aecfb2`) and #110 (`18b44918`) | `packages/app/src/components/TouchSurface/TabletInspectorDeck.tsx:27` (`onSnapshot`) is required, with no fallback dispatch; test `packages/app/src/commands/dispatchedCommandIds.test.ts:36` "are all registered" |
| 53 | [Champion card image never times out](#reported-low-severity-not-independently-verified) | low, not verified | fixed, #90 (`b940415b`) | `packages/app/src/components/ArenaOverlay/championCardCanvas.ts:86` (`Promise.race`); test `packages/app/src/components/ArenaOverlay/championCardCanvas.test.ts:174` "gives up instead of hanging when the canvas never delivers a blob" |
| 54 | [Bundled-track helpers and manifest unused](#reported-low-severity-not-independently-verified) | low, not verified | open; #90 (`f1b74bb9`) gave `fetchBundledTrackBuffer` its caller | `packages/app/src/arcade/bundledTracks.ts:38` (`getBundledTrack`) has no caller, and `packages/app/scripts/generate-tracks.mjs:194` (`writeFileSync`) writes a `tracks.json` manifest nothing reads |
| 55 | [Arena `gameState` written, never read](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/app/src/components/ArenaOverlay.tsx:469` (`gameState`), `packages/app/src/commands/types.ts:134` (`gameState`) |
| 56 | [Two `resolveSeed`, two `mulberry32`](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/app/src/webmcp/tools/randomizeFlame.ts:78` (`resolveSeed`), `packages/app/src/webmcp/tools/mutateFlame.ts:54` (`resolveSeed`), `packages/app/src/flame/stats.ts:63` (`mulberry32`), `packages/app/src/webmcp/tools/scoreClashRound.ts:4` (`mulberry32`) |
| 57 | [`simulateClash` inputs unbounded](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/app/src/webmcp/tools/simulateClash.ts:201` (`raw.rounds`), `:203` (`raw.separation`), loop at `:238` (`rounds`) |
| 58 | [Blur sub-frames past the limit add nothing](#reported-low-severity-not-independently-verified) | low, not verified | fixed, #91 (`26348360`, `7b1aee27`) | `packages/app/src/utils/animationExport.ts:189` (`setExportAccumulationFraction`), `packages/app/src/flame/Flam3.tsx:981` (`exportTickIterations`); test `packages/app/src/utils/motionBlur.test.ts:74` "stops a tick at the sub-frame share instead of the whole budget" |
| 59 | [`shutterAngle` never set](#reported-low-severity-not-independently-verified) | low, not verified | fixed, #91 (`98f80d64`) | `packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx:1377` (`motionBlurSettings`), `packages/app/src/utils/motionBlur.ts:25` (`shutterAngle`); test `packages/app/src/utils/motionBlur.test.ts:35` "hands both export paths the same settings, shutter angle included" |
| 60 | [`focusHintFor` resolves prototype keys](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/app/src/recorder/focus.ts:174` (`Object.freeze`), `:476` (`STATIC_COMMAND_HINTS`) |
| 61 | [Export loop has no test coverage](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/app/src/flame/renderDrivers/renderDrivers.test.ts:75` "starts with initial iterations and provides wake handle" creates the driver disabled (`:77` (`createSignal`)), so the loop at `packages/app/src/flame/renderDrivers/createExportRenderDriver.ts:183` (`disposed`) never runs under test |
| 62 | [Present-pump gate lost its comment](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/app/src/flame/renderDrivers/createInteractiveRenderDriver.ts:72` (`isExportRenderer`); the old comment is in Flam3.tsx before `38130d81` |
| 63 | [`CompletedRunCard` captures `props.run`](#reported-low-severity-not-independently-verified) | low, not verified | open | `packages/app/src/pages/Benchmarks/BenchmarksPage.tsx:599` (`props.run`); harmless inside its `<For>` today |
| 64 | [A dialog pick stays hidden on iOS](#a-flame-picked-from-a-dialog-stayed-hidden-behind-the-previous-one-on-ios-until-the-canvas-was-touched) | device report | fixed, #122 (`a37f4b88`, `14545b77`) and #131 (`9895189f`) | `packages/app/src/lib/viewTransition.ts:36` (`isAppleWebKit`), `packages/app/src/flame/renderDrivers/createInteractiveRenderDriver.ts:85` (`transitionsSettled`); test `packages/app/src/flame/renderDrivers/viewTransitionPresent.test.tsx:363` "on Apple WebKit, is on screen with no view transition and no snapshot", test `packages/app/src/flame/renderDrivers/viewTransitionPresent.test.tsx:372` "where a view transition runs anyway, is on screen once it has faded out" |

---

<!-- cite-check: pinned a5c2f26f -->

## Confirmed — high

### Timeline keyframe short-circuit was widened from 7 camera paths to EVERY parameter path during the getFlameValue extraction

`packages/app/src/hooks/useWorkspaceTimelineBinding.ts:87` — **high** · behaviour-change · introduced by #78 (88070311) · lens: MainWorkspace decomposition and workspace hooks

**Now:** fixed in #90 (`abd83151`). See [Status on main](#status-on-main).

**Evidence.** BEFORE (MainWorkspace.tsx at 88070311^, lines 3057-3369): getFlameValue was a switch. The 'if timeline.isDrivingView() && hasKeyframeAtFrame(...) -> resolveKeyframeValue' short-circuit was written out longhand inside exactly seven cases: camera.x, camera.y, camera.zoom, camera3D.theta, camera3D.phi, camera3D.radius, camera3D.fov. 'camera.rotation' deliberately did NOT have it, and every transform/variation path fell through the switch's `default:` straight to the live flame store.

AFTER (useWorkspaceTimelineBinding.ts:87-96):
```
function getFlameCameraSetting(rs, path, timeline) {
  const kf = getTimelineCameraKeyframeValue(timeline, path)   // <- runs for ANY path
  if (kf !== null) return kf
  const getter = CAMERA_GETTERS[path]
  return getter ? getter(rs) : undefined
}
```
and getFlameValue (line 380-390) calls it for every path that is not in RENDER_GETTERS, BEFORE getFlameTransformSetting / getFlameVariationSetting:
```
const cameraVal = getFlameCameraSetting(fd.renderSettings, path, timeline)
if (cameraVal !== undefined) return cameraVal
const parts = path.split('.')
const transformVal = getFlameTransformSetting(fd.transforms, parts)
```
getTimelineCameraKeyframeValue (line 35-45) does `timeline.hasKeyframeAtFrame(path, ...)`, and utils/timeline.ts hasKeyframeAtFrame is path-generic (`tracks().find(t => t.parameterPath === parameterPath)`). So a transform, affine or variation-weight path with a keyframe at the current frame now resolves from the keyframe instead of the flame.

This resolver is the one the auto-keyframe path reads: utils/timeline.ts:1517 `addKeyfram

**How it fails.** Animation enabled; a track exists for `transform.t1.probability` with a keyframe at frame 30. User scrubs the playhead to frame 30 (previewHeld -> isDrivingView() true; utils/timeline.ts:703). Sidebar sliders remain live (WorkspaceSidebar only locks on isPlaying()). User drags the probability slider from 0.4 to 0.9 — the store now holds 0.9. keyframeEditedParam fires addKeyframesAtCurrentFrame(['transform.t1.probability']); the resolver sees isDrivingView() && hasKeyframeAtFrame -> returns the OLD keyframe value 0.4 and rewrites the keyframe as 0.4. The edit is silently discarded and the canvas snaps back. Same for transform.t1.preAffine.a, transform.t1.color.x, and variation weights `t1.v1`. Before the refactor the resolver returned the live 0.9.

**Verification.** I tried hard to refute this and could not. The 'before' state is exactly as described: at 88070311^ getFlameValue was a switch whose keyframe short-circuit was written out longhand in seven camera cases only (camera.x 3101-3118, camera.y 3119-3136, camera.zoom 3137-3153, camera3D.theta 3159-3178, camera3D.phi 3179-3195, camera3D.radius 3196-3216, camera3D.fov 3217-3234); 'camera.rotation' (3154-3158) returns the flame value with no short-circuit, and the `default:` branch at 3236 falls straight through to the transform/variation lookups with no timeline consultation at all. The 'after' state is as described: useWorkspaceTimelineBinding.ts:87-96 calls getTimelineCameraKeyframeValue(timeline, path) unconditionally, and getFlameValue at 383-384 runs it for every path that misses RENDER_GETTERS, before the transform and variation lookups. hasKeyframeAtFrame (utils/timeline.ts:1108-1116) is path-generic. I checked the three escape hatches that would have refuted it and all three fail: (a) the sidebar is not locked on this path -- WorkspaceSidebar.tsx:185 sets sidebarLocked only on props.isPlaying(), while isDrivingView (utils/timeline.ts:703) is animationEnabled() && (isPlaying() || isScrubbing() || previewHeld()), and previewHeld latches true on any goToFrame/seek (utils/timeline.ts:1414), so the user can freely edit sliders in that state; (b) autoKeyframe defaults true (utils/time

**Repro.** Unit repro (fastest): in hooks/useWorkspaceTimelineBinding.test.ts build a mock TimelineAccess with isDrivingView: () => true, currentFrame: () => 30, hasKeyframeAtFrame: (p, f) => p === `transform.${tid}.probability` && f === 30, tracks: () => [{ parameterPath: `transform.${tid}.probability`, keyframes: [{ frame: 30, value: 0.4, easing: 'linear' }] }]. Call setFlameValue(`transform.${tid}.probability`, 0.9), then getFlameValue on the same path. Pre-refactor semantics = 0.9; current code returns 0.4. Manual repro: enable animation, keyframe transform.t1.probability at frame 30 (or use the 'rot' preset, which writes camera.rotation -- also newly short-circuited), scrub the playhead onto that frame, then drag the probability slider. The slider snaps back and the keyframe keeps its old value.

**Suggested fix.** Restrict the keyframe short-circuit to the camera paths it was written for. In getFlameValue, look up CAMERA_GETTERS[path] first and only then consult getTimelineCameraKeyframeValue: e.g. `const cameraGetter = CAMERA_GETTERS[path]; if (cameraGetter) { const kf = path === 'camera.rotation' ? null : getTimelineCameraKeyframeValue(timeline, path); return kf ?? cameraGetter(fd.renderSettings) }` — and add a regression test in useWorkspaceTimelineBinding.test.ts that keyframes a transform path, seeks onto it with isDrivingView() true, mutates the flame, and asserts getFlameValue returns the flame value.

### `.tabletLayout` is overridden by the pre-existing max-width:768px block, collapsing the tablet split layout across the whole 680-768px band

`packages/app/src/App.module.css:21` — **high** · behaviour-change · introduced by #77 · lens: Mobile and tablet responsive UI, documentation panel redesig

**Now:** fixed in #90 (`7062e1f2`). See [Status on main](#status-on-main).

**Evidence.** PR #77 added `.tabletLayout { grid-template-columns: 1fr auto; grid-template-rows: 1fr; grid-template-areas: 'viewport inspector' }` at App.module.css:21-25, applied by MainWorkspace.tsx:3264 (`${isTablet() ? ui.tabletLayout : ''}`) alongside `ui.layout`. The pre-existing block at App.module.css:1429-1435 is `@media (max-width: 768px) { .layout { grid-template-columns: 1fr; grid-template-areas: 'viewport' 'viewport-controls' } }`. Both selectors are a single class on the same element — specificity (0,1,0) each; a media query contributes none — so the cascade is decided by source order, and line 1429 is 1,408 lines after line 21. The media rule wins. The element that needs the destroyed area is TouchSurface.module.css:345-346, `.tabletInspectorPane { grid-area: inspector; width: clamp(340px, 35vw, 420px) }`, rendered by TabletInspectorDeck.tsx:29. The tablet band is 680-1024px inclusive (workspaceLayoutStore.ts:19-25), so 680-768 is affected. I confirmed no later rule re-asserts `.tabletLayout`: `grep -n '^\.tabletLayout' App.module.css` returns only line 21.

**How it fails.** Load the app at any viewport width from 680px to 768px inclusive — an iPad Mini 6 in portrait (744 CSS px), an older iPad at 768, several Android tablets in the 720-768 range, or simply a desktop browser window dragged to 700px wide. `isTablet()` returns true, so MainWorkspace mounts `TabletInspectorDeck` and applies `.tabletLayout`, but the grid the deck was written for does not exist: `grid-template-columns` is forced back to a single `1fr` and `grid-template-areas` to `'viewport' / 'viewport-controls'`, which defines no `inspector` area. `grid-area: inspector` then resolves to non-existent line names and the deck falls back to auto-placement, dropping into an implicit full-width row under the canvas instead of sitting as a 340-420px column beside it. The side-by-side split studio the PR is named after does not appear.

**Verification.** I tried hard to refute this and could not. App.module.css:21-25 defines .tabletLayout with grid-template-columns '1fr auto' and grid-template-areas 'viewport inspector'. App.module.css:1429-1435 is `@media (max-width: 768px) { .layout { grid-template-columns: 1fr; grid-template-areas: 'viewport' 'viewport-controls' } }`. Both are single-class selectors, specificity (0,1,0); a media query adds nothing, so source order decides and line 1430 is 1,409 lines later — the media block wins for both properties. `grep -n '^\.tabletLayout' App.module.css` returns only line 21, and TouchSurface.module.css:328 is a DIFFERENT .tabletLayout (flex, used only by the dead TabletSplitLayout), so nothing re-asserts the grid. MainWorkspace.tsx:3264 applies `${ui.layout} ... ${isTablet() ? ui.tabletLayout : ''}` to one element, and MainWorkspace.tsx:3454-3455 mounts TabletInspectorDeck as a direct child of that grid; TabletInspectorDeck.tsx:29 renders `<aside class={ui.tabletInspectorPane}>` and TouchSurface.module.css:345-346 is `grid-area: inspector; width: clamp(340px, 35vw, 420px)`. Per CSS Grid, `grid-area: inspector` with no such named area and no `inspector-start`/`inspector-end` lines falls back to auto placement, so the deck lands in an implicit full-width row under the canvas rather than as a side column. The band really is 680-768 inclusive: workspaceLayoutStore.ts:6-7 set PHONE_MAX_WIDTH

**Repro.** Open the app in a desktop browser and drag the window to 700px (or 768px) wide, or load it on an iPad in portrait. isTablet() is true so TabletInspectorDeck mounts, but computed style on the layout div shows grid-template-columns '1fr' and grid-template-areas '"viewport" "viewport-controls"'; the aside is auto-placed into an implicit row below the canvas at 340px wide instead of sitting beside it. Widen past 768px and the split appears. Equivalent check without a browser: getComputedStyle on the .layout element, or note that no rule after App.module.css:1435 restores grid-template-areas for .tabletLayout.

**Suggested fix.** Give the two explicit layout classes precedence over the legacy breakpoint block, either by moving `.phoneLayout`/`.tabletLayout` after line 1435 or by excluding them from it (`@media (max-width: 768px) { .layout:not(.phoneLayout):not(.tabletLayout) { ... } }`). Longer term, derive the media query from the same source as `PHONE_MAX_WIDTH`/`TABLET_MAX_WIDTH` — a CSS custom property or a generated block — so JS and CSS cannot disagree about where a tablet starts. Note the phone path has the same collision (`.phoneLayout` at line 15 loses its single-area grid below 768px); it is currently benign only because the bottom bar is not mounted on phones.

### Beats mode never loads a bundled track, and arcade_set_audio_mapping disables audio reactivity as its final act

`packages/app/src/webmcp/tools/arcadeBeats.ts:333` — **high** · behaviour-change · introduced by #75 (60361cd5 feat(arcade): implement beats mode, bundled audio tracks, and webmcp...) · lens: Arcade modes

**Now:** fixed in #90 (`f1b74bb9`, `af2c4ee8`). See [Status on main](#status-on-main).

**Evidence.** arcadeBeats.ts:332-349 builds `newSnapshot = { mapping, enabled: true, source: currentSnapshot.source ?? 'file', trackName: currentSnapshot.trackName ?? 'Ember Drift' }` and dispatches `executeCommand('audio.applySnapshot', ctx, newSnapshot)`. That command (packages/app/src/commands/builtins/audio.ts:74) computes `const mayEnable = snapshot.enabled && audio.canEnable(snapshot)`, then unconditionally calls `audio.setEnabled(false)` before re-enabling only when mayEnable. The live `canEnable` is `canEnableReplayAudio` (`packages/app/src/recorder/replay.ts:44-49`, `currentTrackName`), which returns true for a file source only when `resources.hasFileBuffer && audio.trackName === resources.currentTrackName`. MainWorkspace.tsx:2971-2976 supplies `hasFileBuffer: audioBuffer() !== undefined` and `currentTrackName: audioTrackName()`. The ONLY writer of those two signals is the manual file picker in WorkspaceSidebar.tsx:435-436 (`props.setAudioBuffer(buf); props.setAudioTrackName(fileName)`). Nothing loads a bundled track: `fetchBundledTrackBuffer` (arcade/bundledTracks.ts:42) has zero callers in src (grep over packages/*/src returns only its own definition), and the CommandContext audio facade (commands/types.ts:188-200) has no load/track member at all. So with no user-loaded file, hasFileBuffer is false, currentTrackName is undefined, mayEnable is false, and the mapping lands with audio disabled — undoing the `ctx.audio.setEnabled(true)` that arcade_start_beats performed at arcadeBeats.ts:139. The unit test misses this because the mock hard-codes `canEnable: vi.fn(() => true)` and `trackName: 'Ember Dri

**How it fails.** User opens the Arcade hub, picks Beats mode, chooses the "Cyber Pulse" chip, pastes the prompt into an agent. The agent calls arcade_start_beats, arcade_get_audio_catalog, then arcade_set_audio_mapping with a valid mappings array. The tool returns `{ok: true, appliedCount: N}` and the session is saved by arcade_end_beats — but audioEnabled is false and no audio buffer exists, so the flame never reacts to anything. The picked track only ever reaches beatsPromptCard(selectedTrack().name, ...) as prompt text (components/Arcade/ArcadeModePanel.tsx:159).

**Verification.** Every link in the chain checks out.

- `packages/app/src/arcade/bundledTracks.ts:38` (`getBundledTrack`) and `:42` (`fetchBundledTrackBuffer`) have ZERO call sites. A repo-wide grep for `fetchBundledTrackBuffer|getBundledTrack|BUNDLED_TRACKS` returns only their own definitions plus `components/Arcade/ArcadeModePanel.tsx:2,131,337`, which uses `BUNDLED_TRACKS` purely to render chips and to feed `beatsPromptCard(selectedTrack().name, ...)` at line 159. The track chip is prompt text and nothing else.
- The only writers of `audioBuffer`/`audioTrackName` are `MainWorkspace.tsx:3584-3585` (`setAudioTrackName`) -> `WorkspaceSidebar.tsx:435-436`, fed by `AudioReactivePanel.tsx:446` (`props.onAudioChange(buffer, file.name)`), which is reached only from `handleFile` (a manual file pick or drop, `AudioReactivePanel.tsx:439-453`). There is no URL/fetch path into it.
- `MainWorkspace.tsx:2971-2976` supplies `hasFileBuffer: audioBuffer() !== undefined` and `currentTrackName: audioTrackName()` to `canEnableReplayAudio` (`recorder/replay.ts:38-49`), which for a file source requires `hasFileBuffer && audio.trackName === resources.currentTrackName`.
- `commands/builtins/audio.ts:73-80`: `const mayEnable = snapshot.enabled && audio.canEnable(snapshot)` then unconditional `audio.setEnabled(false)` and re-enable only if `mayEnable`. So `arcadeBeats.ts:332-349` genuinely ends with audio disabled, undoing `ctx.audio.setEn

**Repro.** Fresh session, no audio ever loaded. Open the Arcade hub -> Beats -> pick any track chip -> paste the prompt. Agent calls arcade_start_beats (returns activeTrack: 'Ember Drift'), arcade_get_audio_catalog, arcade_set_audio_mapping with valid mappings. Tool returns {ok: true, appliedCount: N}. Then read the workspace: audioEnabled() is false and audioBuffer() is undefined, so no modulation ever runs. Instrument: breakpoint on commands/builtins/audio.ts:74 and observe mayEnable === false. In a unit test the mock hides it — replace webmcp/testUtils.ts:157 with `canEnable: vi.fn((s) => s.source === 'file' && s.trackName === 'Ember Drift' && hasBuffer)` where hasBuffer is false, and arcadeBeats.test.ts's mapping test still reports ok.

**Suggested fix.** Add a track-loading seam to the audio facade (e.g. `audio.loadTrack(track: BundledTrack)`) that fetches via fetchBundledTrackBuffer, decodes it, and sets audioBuffer + audioTrackName; call it from arcade_start_beats with the resolved activeTrack before setEnabled(true), and set `newSnapshot.trackName` to that same name so canEnable's identity check passes. Until then, arcade_set_audio_mapping should detect `!audio.canEnable(newSnapshot)` and return an explicit error telling the agent to ask the user to load audio, rather than reporting ok while silently disabling. Also drop `canEnable: () => true` from testUtils in favour of a mock that models hasFileBuffer.

### 3D pinch-zoom produces a NaN or infinite camera radius: WheelZoomCamera3D never got the guards its 2D twin received

`packages/app/src/lib/WheelZoomCamera3D.tsx:355` — **high** · correctness · introduced by #77 (0d239a45 hardened 2D and the export boundary, not 3D) · lens: Mobile and tablet responsive UI

**Now:** fixed in #90 (`5c88d855`, `376cb80f`, `af2c4ee8`). See [Status on main](#status-on-main).

**Evidence.** WheelZoomCamera2D.tsx:173-200 guards initEvent.distance, grabPosition, event.distance, prevDistance and the computed pinchRatio -- all added by commit 0d239a45, whose message reads "Sanitize camera zoom and position against NaN/infinite values from touch gestures". WheelZoomCamera3D.tsx:348-360 has none of them: `let prevDistance = initEvent.distance` is unguarded and `const ratio = event.distance / prevDistance` is used directly. createPinchHandler.ts:18 computes distance as hypot() of the two touch deltas with no zero guard, so two coincident touches give 0. Verified numerically: ratio NaN gives Math.max(MIN, Math.min(MAX, r/NaN)) === NaN, because Math.min and Math.max propagate NaN, so the clamp does not rescue it; ratio Infinity collapses radius to MIN_ORBIT_RADIUS. `git log -S "Number.isFinite" -- packages/app/src/lib/WheelZoomCamera3D.tsx` returns nothing: the 3D pinch has never been hardened.

**How it fails.** On a touch device, pinch a 3D flame such that the two touch points momentarily coincide, or the platform reports both at the same coordinate for one frame -- a fast two-finger tap does this. prevDistance becomes 0 and the orbit ratio becomes NaN (0/0) or Infinity (d/0). The two halves fail differently, and this was initially reported wrongly, so it is worth stating precisely. Measured against valibot 1.2.0: v.number() REJECTS NaN ("Invalid type: Expected number but received NaN") but ACCEPTS Infinity and -Infinity, because both are typeof number. So the NaN path does not silently persist -- it breaks the live render and, once JSON.stringify turns NaN into null, makes the saved flame fail to reload. The Infinity path is the one that persists silently: radius collapses to MIN_ORBIT_RADIUS, validates cleanly, and is written into autosave, share links and session recordings. Either way the export of that flame is wrong, which is what the two "fix tablet exporter" commits were patching downstream in ExportJobHost and Flam3.

**Verification.** Root cause located by following the defensive-guard trail across three layers. Numerically proven that Math.min and Math.max propagate NaN; git history confirms 0d239a45 hardened 2D and the export boundary while leaving 3D untouched. CORRECTION: an earlier version of this finding claimed valibot accepts NaN and therefore persisted the corruption silently. That was wrong and was caught while writing the regression test -- v.number() rejects NaN and accepts Infinity, so it is the Infinity path that persists. The defect and its fix are unchanged; only the persistence mechanism was misdescribed.

**Repro.** Unit: drive the pinch handler with two touches at identical coordinates and assert camera3D.radius stays finite. Manual: on the Android tablet, open a 3D flame, two-finger tap the canvas, then export a PNG.

**Suggested fix.** Guard centrally in createPinchHandler so no consumer can forget, give WheelZoomCamera3D the same explicit checks as its 2D twin, and add a finite-checked number schema for the unbounded camera fields -- the bounded ones such as zoom are already safe because a maxValue check rejects Infinity.

### Motion blur never blurred, on either export path: the first sub-frame took the whole point budget

`packages/app/src/flame/Flam3.tsx:958` — **high** · correctness · introduced by #78 · lens: stage 2 characterization net and export verification

**Now:** fixed in #91 (`71dd509b`, `26348360`, `7b1aee27`). See [Status on main](#status-on-main).

**Evidence.** The export driver sizes a tick to reach the whole quality point limit at once (estimateIterations, export branch). Instrumented at 1080p, the first onExportImage of every frame already reported 32.0M points against a 29.16M limit. Offscreen, each flame change additionally reset accumulation through the fingerprint effect.

**How it fails.** With Motion Blur at 8x or 16x, sub-frames 1..N-1 stepped through a buffer that accepted no more points, so the export was identical to blur off -- offscreen and on the main canvas. On the main canvas two more faults hid behind it: the timeline reset effect wiped the buffer on every sub-frame whenever the timeline drove the view (the default after loading an animated flame), and the first tick of each frame read the previous frame's point total, which skipped the frame's first sub-frames. The audit had judged the main-canvas path correct from reading its code.

**Verification.** Measured at the encoder boundary in headed Chrome. Offscreen (PR #91): identical to blur off until Flam3 gained accumulationFraction and exportFrameKey; after, sharpness fell 17-21%. Main canvas, timeline holding a frame: blur 8x as sharp as blur off (4.48 vs 4.17) on the first PR #91 head; after gating the timeline reset on exportOwnsResets and resetting at frame setup, 34-36% softer (2.76 vs 4.17). FIXED in PR #91.

**Suggested fix.** Fixed in PR #91.


---

## Confirmed — medium

### The timeline's interpolation math was copied into packages/core rather than moved; the core copy is byte-identical, exported from the barrel, and imported by nothing

`packages/core/src/math/easing.ts:1` — **medium** · duplication · introduced by #73 · lens: Timeline engine and audio analysis modulation

**Now:** fixed in #115 (`984926e4`). See [Status on main](#status-on-main).

**Evidence.** `md5sum` of lines 2-78 of `packages/core/src/math/easing.ts` and `packages/app/src/utils/easing.ts` are both `43392d0ac4356f30f709f05cf336fd96` — the two files differ only in line 1 (`import type { EasingCurve } from '../schema/timeline'` vs `from '@chaos-master/core'`). That is 77 duplicated lines covering `lerp`, `applyEasing` (all six curves), `bounce`, `elastic`, `clamp` and `catmullRom`. `packages/core/src/index.ts:5` re-exports the core copy. Grepping `catmullRom` across packages/app, packages/core and packages/worker returns only `packages/app/src/utils/easing.ts:62` (the definition), `packages/app/src/utils/timeline.ts:3` (which imports from `./easing`, the app copy), `timeline.test.ts:2`, and the core definition itself — nothing imports the core one. Same for `applyEasing` and `lerp`. So the actual spline used by `interpolateNumberKeyframe` (utils/timeline.ts:503) and `interpolateArrayKeyframe` (utils/timeline.ts:532) is the app copy, and the core copy is dead weight.

**How it fails.** Someone fixes a spline artefact by adjusting the Catmull-Rom tangent in `packages/core/src/math/easing.ts` — the file that the strategy document says owns 'interpolation math', and the one a worker or CLI consumer would naturally import. Nothing in the app changes, because `packages/app/src/utils/timeline.ts:3` still imports `applyEasing, catmullRom, clamp` from `./easing`. Every rendered animation keeps the old curve while the tests over the core copy pass, and the divergence is invisible until a second consumer of `@chaos-master/core` renders the same timeline and produces different frames.

**Verification.** Verified end to end, and the strategy-document angle the finder gestured at is stronger than they made it.

- Byte-identical apart from the import line: `tail -n +2 packages/core/src/math/easing.ts | md5sum` and the same over packages/app/src/utils/easing.ts both give 43392d0ac4356f30f709f05cf336fd96. Line 1 differs only in `from '../schema/timeline'` vs `from '@chaos-master/core'`. 77 duplicated lines: lerp, applyEasing (all six curves), bounce, elastic, clamp, catmullRom.
- The core copy is exported from the barrel (packages/core/src/index.ts:5 `export * from './math/easing'`) and imported by nothing. Grepping applyEasing/catmullRom/lerp/clamp across packages/app/src, packages/core/src and packages/worker: the only importers are packages/app/src/utils/timeline.ts:3 (`from './easing'`), timeline.test.ts:2, SpotlightTour.tsx:4 and CustomPaletteEditor.tsx:17 (both `from '@/utils/easing'`). Nothing in packages/core consumes its own copy either.
- So the spline actually used by interpolateNumberKeyframe (utils/timeline.ts:503) and interpolateArrayKeyframe (utils/timeline.ts:532) is the app copy.
- Introduced inside the audit range: `git log --diff-filter=A -- packages/core/src/math/easing.ts` = 5747de32 'refactor(core): extract @chaos-master/core pure monorepo package', and `git merge-base --is-ancestor v0.9.11 5747de32` confirms it is after the tag.
- Against the contract: docs/REFACTOR_AND_

**Repro.** Edit the Catmull-Rom tangent in packages/core/src/math/easing.ts:62-77 (say scale the tangent term by 0.5) and render any spline-interpolated timeline in the app. Frames are byte-identical, because utils/timeline.ts:3 imports catmullRom from './easing'. Conversely, `pnpm --filter @chaos-master/core test` (or any future worker/CLI consumer importing from '@chaos-master/core') exercises the modified copy and would report the change as applied.

**Suggested fix.** Delete `packages/app/src/utils/easing.ts` and point `packages/app/src/utils/timeline.ts:3`, `CustomPaletteEditor.tsx:17` and `SpotlightTour.tsx:4` at `@chaos-master/core` — the app package already depends on it (`packages/app/src/flame/schema/timeline.ts` is nothing but a re-export barrel of core, so the precedent exists). If the app copy must stay for bundling reasons, make it a re-export rather than a second implementation.

### useWorkspaceAnimationGen was handed the raw timeline instead of recorderTimeline, so Randomize/Smart Animation no longer emit a recorder snapshot

`packages/app/src/MainWorkspace.tsx:2412` — **medium** · behaviour-change · introduced by #78 (88070311) · lens: MainWorkspace decomposition and workspace hooks

**Now:** fixed in #90 (`b6838992`). See [Status on main](#status-on-main).

**Evidence.** BEFORE (MainWorkspace.tsx at 88070311^): handleRandomizeAnimation line 2603 and handleSmartAnimation line 2747 both called `runTimelineSnapshotMutation(recorderTimeline, ...)`. `grep -n recorderTimeline` on that file returns exactly lines 1320, 1330, 2603, 2747, 3966, 3984, 4478, 4773, 5196 — 2603/2747 are those two handlers.

AFTER: MainWorkspace.tsx:2411-2412 calls `useWorkspaceAnimationGen({ timeline, ... })` — the raw timeline — and hooks/useWorkspaceAnimationGen.ts:217-219 and 241-243 pass it straight into `runTimelineSnapshotMutation(timeline, snapshotOrigin('timeline.random'|'timeline.smart'), ...)`. `grep -n recorderTimeline MainWorkspace.tsx` now returns 1140, 1150, 3084, 3102, 3262, 3557, 3980 — the two animation handlers are gone from that list.

recorder/timelineActions.ts:28-34:
```
const recorderAware = timeline as Partial<RecorderAwareTimeline>
const run = recorderAware[RECORDER_SNAPSHOT_MUTATION]
return run === undefined ? timeline.runWithSingleUndo(mutate) : run(origin, mutate)
```
Only the facade built by createRecorderAwareTimeline carries that symbol (timelineActions.ts:143). The raw timeline does not, so the call silently degrades to runWithSingleUndo and skips recordSnapshotMutation's `invalidateLastFinishedSession()` + `recordSyntheticAction('timeline.loadTimeline', [after, origin], label)` (timelineActions.ts:99-107), and the withRecordingSuppressed wrapper around the raw write.

The extraction could not have kept recorderTimeline as written: the hook is called at line 2411 but `const recorderTimeline` is not declared until line 3084 (TDZ). The argum

**How it fails.** Start a session recording, click Randomize Animation (or Smart Animation) in the Flame Randomizer card, stop the recording, then replay it. The preset appliers use Math.random() (useWorkspaceAnimationGen.ts:35, 76, 87, 142), so the generated tracks are non-deterministic; the value-pinned `timeline.loadTimeline` synthetic action that used to capture them is never recorded. Replay reproduces a different animation (or none). The stale-session invalidation is also skipped, so a session finished before the click is not marked stale.

**Verification.** The mechanical claim checks out exactly. `git show 88070311^:.../MainWorkspace.tsx | grep -n recorderTimeline` returns 1320, 1330, 2603, 2747, 3966, 3984, 4478, 4773, 5196; lines 2603 and 2747 are inside handleRandomizeAnimation and handleSmartAnimation, both passing recorderTimeline to runTimelineSnapshotMutation. The same grep on HEAD returns 1140, 1150, 3084, 3102, 3262, 3557, 3980 -- neither handler survives. MainWorkspace.tsx:2411-2412 passes `timeline`, which is the raw createTimelineState from line 1548 (recorderTimeline is not constructed until line 3084, so the swap was forced by ordering, as the finder says). useWorkspaceAnimationGen.ts:217-219 and 241-243 hand that raw object to runTimelineSnapshotMutation, and recorder/timelineActions.ts:29-33 keys entirely off the RECORDER_SNAPSHOT_MUTATION symbol, which only the facade carries (line 143). So the call degrades to raw.runWithSingleUndo and skips beforeMutation (history.takeOverOwnedPreview, MainWorkspace.tsx:3089-3091), invalidateLastFinishedSession, and the value-pinned recordSyntheticAction('timeline.loadTimeline', [after, origin]) at timelineActions.ts:99-108. I separately diffed the preset appliers (useWorkspaceAnimationGen.ts:53-196 vs 88070311^:2617-2734) and they are behaviour-equivalent, so this wrapper swap is the only regression in that extraction. Where I disagree with the finder is severity: this degrade

**Repro.** Start a session recording, open the Flame Randomizer card, click Randomize Animation (or Smart Animation), stop and replay. The generated tracks are Math.random()-driven (useWorkspaceAnimationGen.ts:35, 76, 87, 142) and no timeline.loadTimeline synthetic action is emitted, so replay does not reproduce the animation. Cheaper deterministic check: spy on recordSyntheticAction and assert it fires once after handleRandomizeAnimation -- it does not. A previously finished session also is no longer marked stale (invalidateLastFinishedSession skipped).

**Suggested fix.** Pass the recorder-aware timeline lazily: add `getRecorderTimeline: () => TimelineState` to UseWorkspaceAnimationGenParams, have MainWorkspace supply `getRecorderTimeline: () => recorderTimeline` (safe because it is only read at click time), and call `runTimelineSnapshotMutation(getRecorderTimeline(), ...)` while keeping the raw `timeline` for the addKeyframe writes, exactly as the pre-refactor code did.

### MainWorkspace's sidebarScrollRef and sidebarRef were orphaned by the WorkspaceSidebar extraction, permanently disabling the randomizer scroll anchor

`packages/app/src/MainWorkspace.tsx:2110` — **medium** · dead-code · introduced by #73 (5d35f893) · lens: MainWorkspace decomposition and workspace hooks

**Now:** open; the `sidebarRef` half was deleted in #115 (`32ab0911`). See [Status on main](#status-on-main).

**Evidence.** At v0.9.11 the sidebar JSX lived in MainWorkspace and bound both refs: line 5199-5202 `ref={(el) => { sidebarRef = el; setSidebarEl(el) }}` and line 5267 `<div class={ui.sidebarScroll} ref={sidebarScrollRef}>`.

After 5d35f893 that JSX is in components/WorkspaceSidebar/WorkspaceSidebar.tsx, which declares its OWN locals (line 176 `let sidebarScrollRef`, line 256 `<div class={ui.sidebarScroll} ref={sidebarScrollRef}>`) and whose root ref callback (line 192-194) only calls `props.setSidebarEl(el)` — it never writes back to MainWorkspace.

MainWorkspace.tsx still declares `let sidebarRef` (line 387) and `let sidebarScrollRef` (line 388). `grep -n 'sidebarScrollRef\|sidebarRef' MainWorkspace.tsx` returns only 387, 388, 2110, 2114, 2115, 3250 — every one a read, no assignment. Both are therefore permanently `undefined`.

Consequently MainWorkspace.tsx:2109-2119:
```
const anchorSidebarToRandomizer = (): (() => void) => {
  if (!sidebarScrollRef || !randomizerCardRef) return () => {}
```
always takes the early return. randomizerCardRef IS still wired (MainWorkspace.tsx:3768-3770 -> RandomizerSection.tsx:41 `<div ref={props.randomizerCardRef}>`), so the guard fails purely on the orphaned scroll ref. The anchor is invoked from handleGenerateFlame (line 2326) and handleMutateFlame (line 2340). The layout store's `sidebarEl` signal that replaced it (stores/workspaceLayoutStore.ts:152, 195) has no reader anywhere in the app.

Separately, startSidebarDrag (line 3249-3251 `const sidebar = sidebarRef; if (!sidebar) return`) is now also permanently inert, though `setSidebarWidth = () => {

**How it fails.** Open the Flame Randomizer card, scroll so the Generate button is under the cursor, click Generate on a flame whose transform count differs from the current one. The sidebar reflows (affine rows + transform cards) and the Generate button jumps under the cursor — exactly what the comment at MainWorkspace.tsx:2105-2108 says the anchor prevents. Repeated clicks now land on whatever control slid into that position.

**Verification.** Verified line by line. `grep -n 'sidebarScrollRef|sidebarRef' packages/app/src/MainWorkspace.tsx` returns 387, 388, 2110, 2111, 2114, 2115, 2116, 3250 -- two declarations and six reads, zero assignments. At v0.9.11 the same file bound them (line 5201 `sidebarRef = el`, line 5267 `<div class={ui.sidebarScroll} ref={sidebarScrollRef}>`), and Solid's JSX transform compiles an identifier `ref` on a local `let` into an assignment, so they were live then. That JSX now lives in components/WorkspaceSidebar/WorkspaceSidebar.tsx with its own local `let sidebarScrollRef` (line 176) bound at line 256; the component's root ref callback (192-194) only forwards to props.setSidebarEl and never writes back. So anchorSidebarToRandomizer (MainWorkspace.tsx:2109-2119) always takes the `if (!sidebarScrollRef || !randomizerCardRef) return () => {}` early return -- and it fails purely on the scroll ref, because randomizerCardRef IS still wired (MainWorkspace.tsx:3768-3770 -> RandomizerSection.tsx). Both call sites (2326 and 2340, in handleGenerateFlame/handleMutateFlame) therefore get a no-op release function. startSidebarDrag (3249-3251) is likewise permanently inert. I checked whether the behaviour survived elsewhere in the sidebar: the diff-view scroll save/restore that also used the old ref WAS ported correctly (WorkspaceSidebar.tsx:177, 305, 309-310), so the randomizer anchor is the single casua

**Repro.** Open the Flame Randomizer card, scroll so the Generate button sits under the cursor, and click Generate on a flame whose transform count differs from the current one. The sidebar reflows and the Generate button moves under the cursor -- exactly what the comment at MainWorkspace.tsx:2105-2108 says the anchor prevents. Statically verifiable without running the app: sidebarScrollRef has no assignment anywhere in MainWorkspace.tsx, so the guard at line 2110 is unconditionally true.

**Suggested fix.** Give the scroll container an owner-visible handle: add `setSidebarScrollEl?: (el: HTMLDivElement) => void` to WorkspaceSidebarProps, call it from the ref at WorkspaceSidebar.tsx:256, and have anchorSidebarToRandomizer read that element (or reuse the already-plumbed but unread `sidebarEl` store signal). Then delete the now-meaningless `let sidebarRef` / `let sidebarScrollRef` in MainWorkspace and the dead startSidebarDrag body.

### PR-preview deploy is the one review host #79 missed — it still serves Allow: / plus production's sitemap, and its URL is posted publicly on every PR

`packages/app/src/worker/middleware/reviewHost.ts:17` — **medium** · security · introduced by #79 · lens: Mobile and tablet responsive UI, documentation panel redesig

**Now:** fixed in #90 (`c37f8aae`). See [Status on main](#status-on-main).

**Evidence.** `isReviewHost` is exact equality against a single constant: `REVIEW_HOST = 'dev.lumenapeiron.com'` (line 14), `return url.hostname === REVIEW_HOST` (line 17). The default export in worker/index.ts:112-114 short-circuits to the plain `withSecurityHeaders` path for anything else. But packages/app/wrangler.jsonc declares a THIRD environment, `preview` (lines 150-188), with a worker name of `chaos-master-preview` and NO `routes` block — unlike `prod` (line 42, `lumenapeiron.com`) and `dev` (line 95, `dev.lumenapeiron.com`) — so it publishes to `chaos-master-preview.<account-subdomain>.workers.dev`. .github/workflows/deploy.yml:146-155 runs `deploy --env preview` on every `pull_request` event, and :158-170 then posts .github/workflows/pr-deployment-table.md as a PR comment containing that URL as a markdown link. packages/app/public/robots.txt is exactly `User-agent: *` / `Allow: /` / `Sitemap: https://lumenapeiron.com/sitemap.xml`, and `assets.run_worker_first: ["/*", "!/assets/*"]` (packages/app/wrangler.jsonc:30) means the worker does see /robots.txt on that host and falls straight through to `env.ASSETS.fetch(request)` (worker/index.ts:105). The commit message for f2b78e42 states the goal as "keep the review deploys out of search" and names only two hosts.

**How it fails.** Open any PR against the repo. CI deploys the full production build to https://chaos-master-preview.<subdomain>.workers.dev and posts that URL in a comment on a public GitHub PR page, which is itself crawled. A crawler follows the link, requests /robots.txt, is told `Allow: /`, and is handed `Sitemap: https://lumenapeiron.com/sitemap.xml` — production's complete URL list, served from a duplicate origin. No `X-Robots-Tag` is sent because `isReviewHost` returned false. This is precisely the failure the PR describes for dev.lumenapeiron.com ("worse than passive: it is a duplicate origin with a map attached"), left in place on the only one of the three hosts whose URL is publicly linked.

**Verification.** Every structural claim checks out. packages/app/src/worker/middleware/reviewHost.ts:14-18 is exact equality against the single constant 'dev.lumenapeiron.com'; packages/app/src/worker/index.ts:112-114 short-circuits everything else to the plain withSecurityHeaders path, so no X-Robots-Tag and no substitute robots.txt. packages/app/wrangler.jsonc:149-186 declares env.preview with name 'chaos-master-preview' and no routes block (prod has lumenapeiron.com at :42, dev has dev.lumenapeiron.com), so it publishes on workers.dev. .github/workflows/deploy.yml:146-155 deploys --env preview on pull_request and :158+ posts .github/workflows/pr-deployment-table.md, whose only rows are a markdown link to PREVIEW_URL. packages/app/public/robots.txt is 'User-agent: * / Allow: / / Sitemap: https://lumenapeiron.com/sitemap.xml' with no meta robots anywhere in index.html, and assets.run_worker_first ['/*','!/assets/*'] (packages/app/wrangler.jsonc:30) means the worker does see /robots.txt and falls through to env.ASSETS.fetch. The sibling landing package solved exactly this with an env flag (packages/landing/src/pages/robots.txt.ts:16 PUBLIC_REVIEW_DEPLOY + the noindex meta in Base.astro), and packages/app/wrangler.jsonc:153 already declares vars.ENVIRONMENT='preview' which NO worker code reads (grep for ENVIRONMENT in src/worker returns nothing) — the discriminator the fix needs is already sitting in the config, unused. 

**Repro.** Open a PR against chaos-matters/chaos-master with CLOUDFLARE_API_TOKEN present. The Build & Deploy App job runs `deploy --env preview` and comments the chaos-master-preview.<subdomain>.workers.dev link on the public PR page. `curl -sI https://chaos-master-preview.<subdomain>.workers.dev/` shows no X-Robots-Tag header; `curl -s .../robots.txt` returns the production file verbatim including the lumenapeiron.com sitemap line. The same two curls against dev.lumenapeiron.com return `X-Robots-Tag: noindex, nofollow` and `Disallow: /`.

**Suggested fix.** Widen the predicate instead of listing hostnames: treat anything that is not the production origin as a review host, e.g. `const PRODUCTION_HOST = 'lumenapeiron.com'; export function isReviewHost(url: URL): boolean { return url.hostname !== PRODUCTION_HOST }`. That fails safe — a new preview or staging origin is covered the day it exists — and keeps the existing four tests passing. Add a fifth test pinning a `*.workers.dev` hostname to Disallow + X-Robots-Tag.

### Taste-profile records are keyed by (generation, candidateIndex) only, so every new Director session overwrites the previous session's ratings

`packages/app/src/arcade/tasteStore.ts:164` — **medium** · correctness · introduced by #74 (e4c5afc4 feat(arcade): implement evolutionary art director mode and webmcp tools) · lens: Arcade modes

**Now:** fixed in #90 (`404db62a`). See [Status on main](#status-on-main).

**Evidence.** recordCandidateFeedback builds `const id = `cand-${feedback.generation}-${feedback.candidateIndex}`` (`tasteStore.ts:164`, `feedback.generation`) and then `const existingIndex = ratings.findIndex(r => r.id === id)` overwrites in place (166,173-177). `generation` comes from the tool caller: directorPropose reads `generation` from the agent's input and stores `generation: generation || 1` (`webmcp/tools/arcadeDirector.ts:130`, `generation`), and DirectorOverlay passes `generation: s.generation` into recordCandidateFeedback (components/DirectorOverlay.tsx:82,127). Every fresh Director session starts its agent at generation 1, so `cand-1-0` .. `cand-1-N` from a session yesterday are silently replaced by today's. There is no session id, no timestamp component, and no seed/flame hash in the key — only `timestamp` is stored as a field (170), never used for identity. MAX_RATINGS_HISTORY = 100 (55) is therefore never the binding limit; the distinct-key count is.

**How it fails.** A user rates 6 candidates across generations 1-3 on Monday (18 records). On Tuesday a new Director session starts at generation 1 and they rate 6 more. director_get_taste_profile then reports totalRatings = 18, not 36, and Monday's generation-1 and generation-2 preferences have been destroyed — the tool's own description promises a profile 'derived across sessions'.

**Verification.** Read and confirmed. `tasteStore.ts:164` builds `const id = `cand-${feedback.generation}-${feedback.candidateIndex}``; `:166` finds by that id and `:173-177` overwrites in place. `RatedCandidate` (29-39) carries `timestamp` but it is only ever written (`:170`) and read for nothing — `deriveTasteProfile` (186-296) never touches it. There is no session id, no seed, no content hash.

The generation value really does restart: `arcadeDirector.ts:114-132` takes `generation` straight from the agent's input and stores `generation: generation || 1`, and every Director prompt card starts an agent at generation 1. `DirectorOverlay.tsx:81-89` and `:122-131` (`recordCandidateFeedback`, from `toggleReaction` and `toggleTag`) both pass `generation: s.generation, candidateIndex: index`, so Tuesday's `cand-1-0` overwrites Monday's.

The `MAX_RATINGS_HISTORY = 100` observation is also right: `saveRatings` (148-155) slices to the last 100, but the distinct-key count is what binds first.

Severity medium stands. It is a soft advisory feature, but `director_get_taste_profile`'s own description at `arcadeDirector.ts:230-231` promises a profile "derived across sessions", and the store silently destroys exactly the cross-session data it advertises. The fix is genuinely one segment in the key.

**Repro.** In devtools: clearTasteStore(); then simulate session A — recordCandidateFeedback({generation:1, candidateIndex:0, reaction:'like', ...}) through candidateIndex 5; deriveTasteProfile().totalRatings === 6. Then simulate session B with the same generation 1 and indices 0..5 but different features; deriveTasteProfile().totalRatings is still 6, and session A's features are gone from localStorage key 'chaos-master:taste-ratings'. Expected: 12.

**Suggested fix.** Include a session identifier in the id (mint a `sessionId` when director.setState first opens a generation and store it on the record), or key on a content hash of the candidate flame. Since RatedCandidate already carries `timestamp`, the minimal fix is `cand-${sessionId}-${generation}-${candidateIndex}` with sessionId persisted alongside the director state.

### Motion blur is silently discarded on the offscreen animation export path

`packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx:1267` — **medium** · dead-code · introduced by #? (commit 94a6241c, Phase 6.2) · lens: Recorder, replay, export loop and render driver

**Now:** fixed in #91 (`71dd509b`, `98f80d64`). See [Status on main](#status-on-main).

**Evidence.** 94a6241c added `motionBlurSamples` / `shutterAngle` to AnimationExportConfig (packages/app/src/utils/animationExport.ts:37,39) and to the job spec (packages/app/src/utils/exportJobs.ts:84-85), and implemented sub-frame accumulation only in createAnimationExport (animationExport.ts:176-253). The dialog passes `motionBlurSamples: motionBlurSamples()` down BOTH branches: line 1267 into `enqueueAnimationJob` (the `if (animationOffscreen())` branch at line 1247) and line 1290 into the main-canvas AnimationExportConfig. `grep -rn motionBlurSamples packages/app/src` returns no hit inside packages/app/src/components/ExportJobs/OffscreenAnimationRender.tsx — the component that actually renders queued animation jobs — so `job.motionBlurSamples` is never read. The Motion Blur <select> (ExportPngDialog.tsx:849-863) is not disabled and shows no warning when the offscreen checkbox (line 927) is on.

**How it fails.** User ticks the offscreen/background export checkbox, selects "Cinematic (16x sub-sampling)" from the Motion Blur dropdown, and exports. The job renders with no sub-frame accumulation at all; the output is byte-identical to Motion Blur = Off, with no message telling the user the setting was ignored.

**Verification.** Verified in full and I could not find a path that saves it. packages/app/src/utils/exportJobs.ts:84-85 declares motionBlurSamples/shutterAngle on AnimationJobSpec; enqueueAnimationJob spreads the whole spec into the store (exportJobs.ts:152-175), so the value is stored on the job. packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx:1247 is the offscreen branch and :1267 passes motionBlurSamples into it; :1290 passes it to the main-canvas AnimationExportConfig. `grep -rn 'motionBlurSamples|shutterAngle' packages/app/src` returns 21 hits and NOT ONE is in components/ExportJobs/OffscreenAnimationRender.tsx — I also read that file end to end (473 lines); job.motionBlurSamples is never read. Sub-frame accumulation exists only in utils/animationExport.ts:176-254 (applySubFrame at :181-211, the accumulate-into-the-same-buffer gate at :242-254), which is the main-canvas path only.

I checked the two things that could have refuted it and both fail. (a) The control is not gated: the Motion Blur <select> at ExportPngDialog.tsx:849-863 carries no disabled state and no hint, while the very next control, 'Keep camera during export' at :935-943, IS greyed via `classList={{ [ui.disabled]: props.animationOffscreen }}` for exactly this condition — the precedent is three lines away and was not applied. (b) It is not dead-by-default-only: both `export/motion-blur-samples` (:1126-1129, 

**Repro.** In the export dialog choose the Animation tab, tick 'Render in background (offscreen)' (ExportPngDialog.tsx:926), set Motion Blur to 'Cinematic (16x sub-sampling)' (:861), export, and export the same range again with the offscreen box unticked. The main-canvas MP4 shows sub-frame smearing on any moving keyframed parameter; the offscreen MP4 is identical to Motion Blur = Off. Statically: set a breakpoint or console.log on job.motionBlurSamples inside OffscreenAnimationRender.tsx and observe there is no such read to place one on.

**Suggested fix.** Either implement sub-frame accumulation in OffscreenAnimationRender (advance perFrameFlame across motionBlurSamples sub-offsets before capturing, exactly as animationExport.ts:181-212 does) or disable the Motion Blur control with an explanatory hint whenever animationOffscreen() is true, and drop motionBlurSamples/shutterAngle from AnimationJobSpec so the type stops advertising support that does not exist.

### Five modules were copied into core instead of re-exported, leaving byte-identical twins (two of the copies are dead)

`packages/core/src/math/easing.ts:7` — **medium** · duplication · introduced by #73 (5747de32) · lens: Benchmark lab, command registry, @chaos-master/core extracti

**Now:** open; four of the five settled in #115 (`984926e4`). See [Status on main](#status-on-main).

**Evidence.** The extraction used two different strategies. Schema/affine/diff modules were correctly converted to thin shims - packages/app/src/flame/fdiff.ts is 6 lines of `export { diffFlames, ... } from '@chaos-master/core'`, affineTranform.ts is 5 lines, migrateFlameTypes.ts is 1 line. But five utility modules were COPIED. Verified with md5sum + difflib (not `diff`, which this shell rewrites): packages/app/src/utils/record.ts and packages/core/src/utils/record.ts have the same md5 (2026b7c1...); app/src/utils/easing.ts vs core/src/math/easing.ts differ only in the import path of `EasingCurve` - lerp/applyEasing/bounce/elastic/clamp/catmullRom are character-identical; app/src/utils/schemaUtil.ts vs core/src/utils/schemaUtil.ts differ only in import paths; core/src/xml/flam3PaletteParser.ts is a 62-line SUBSET copy of the app's 282-line packages/app/src/flame/flam3PaletteParser.ts (PREFILTER_WHITE, flam3CalcAlpha, rgbToOklab duplicated verbatim). Reachability: nothing anywhere imports applyEasing/catmullRom/rgbToOklab/flam3CalcAlpha/structToSchema from '@chaos-master/core' (grep across packages), so core's easing.ts, xml/flam3PaletteParser.ts and utils/schemaUtil.ts are dead weight behind `export *` in core/src/index.ts, while record.ts and clone.ts are live in BOTH copies (73 app files import '@/utils/clone', and core/src/schema/flameSchema.ts:4 imports its own '../utils/clone'), so the app bundle carries both.

**How it fails.** A bug fix to the Catmull-Rom tangent or to flam3CalcAlpha's gamma handling is applied to whichever copy the developer greps to first. Timeline keyframe interpolation (packages/app/src/utils/timeline.ts:3 imports from './easing') and .flame palette import (packages/app/src/flame/palettes.ts:10 imports from './flam3PaletteParser') keep the old behaviour, while anything routed through @chaos-master/core gets the new one - and because the core copies are currently unreferenced, a fix landed there is silently a no-op.

**Verification.** Mostly right, with one claim I refute outright.

Verified duplication: `md5sum` gives packages/app/src/utils/record.ts and packages/core/src/utils/record.ts the identical hash 2026b7c10b82e12bd3a81cf7cdf6d16e. difflib shows app/src/utils/easing.ts vs core/src/math/easing.ts differ on line 1 only (the EasingCurve import path) — 78 lines each, applyEasing/catmullRom/lerp/bounce/elastic/clamp character-identical. app/src/utils/schemaUtil.ts vs core/src/utils/schemaUtil.ts differ on their two import lines only. core/src/xml/flam3PaletteParser.ts is 62 lines against the app's 281. And the dead-code claim holds: a repo-wide grep for applyEasing / catmullRom / rgbToOklab / flam3CalcAlpha / structToSchema returns only the two definition sites plus app-internal consumers (utils/timeline.ts:3, flame/flameXml.ts:2). Nothing imports those three core modules; they are reachable only through `export *` in core/src/index.ts. So core/src/math/easing.ts, core/src/utils/schemaUtil.ts and core/src/xml/flam3PaletteParser.ts are dead on arrival, and the fork risk on the Catmull-Rom tangent and the flam3 gamma is real.

REFUTED sub-claim: 'clone.ts ... live in BOTH copies ... so the app bundle carries both'. They are not copies. app/src/utils/clone.ts exports `deepClone`, which calls `trackDeep` to touch every property so Solid registers dependencies and then `unwrap(data)` from 'solid-js/store'. co

**Repro.** `md5sum packages/app/src/utils/record.ts packages/core/src/utils/record.ts` — identical. Then edit `catmullRom` in packages/core/src/math/easing.ts:62 (say, change the 0.5 coefficient) and run the app's timeline tests: packages/app/src/utils/timeline.test.ts:2 imports from './easing', so every test still passes and every keyframe still interpolates identically. The edit is unobservable because nothing imports core's copy.

**Suggested fix.** Delete core/src/math/easing.ts, core/src/utils/schemaUtil.ts and core/src/xml/flam3PaletteParser.ts (or move the app's callers onto them and make the app files shims, the way fdiff.ts/affineTranform.ts were done). For clone.ts and record.ts, keep one implementation in core and turn the app's files into `export * from '@chaos-master/core'` shims.

### Exported .flame files re-import with a different skipIters: the export formula is not the inverse of the import

`packages/app/src/flame/flameXml.ts:870` — **medium** · correctness · introduced by pre-v0.9.11 · lens: stage 2 characterization net and export verification

**Now:** fixed in #92 (`18b15327`). See [Status on main](#status-on-main).

**Evidence.** Import maps quality to skipIters as round(50 - quality / 3) (flameXml.ts:489). Export wrote quality as round(50 - skipIters * 3) (flameXml.ts:870), which is not its inverse.

**How it fails.** skipIters 17 exports as quality -1 and re-imports as 30 (clamped). Every golden .flame fixture lost its skipIters on a round trip, so any exported flame re-imported with a different warm-up.

**Verification.** Reproduced by the golden .flame corpus and by a round-trip test over every value 0..30; fails identically on v0.9.11, so it predates the refactor. FIXED in PR #92 (export now writes 3 * (50 - skipIters)).

**Suggested fix.** Fixed: export quality = 3 * (50 - skipIters).

### Exporting a flame loses its transform colour chroma: only an angle-derived colour index is written, no palette

`packages/app/src/flame/flameXml.ts:905` — **medium** · data-loss · introduced by pre-v0.9.11 · lens: stage 2 characterization net and export verification

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** exportFlameXml derives colour="..." from atan2(color.y, color.x) and writes no <palette>. Import, finding no palette, rebuilds each transform colour at a fixed 0.3 chroma from that index.

**How it fails.** A flame imported with an embedded palette, exported and re-imported, comes back desaturated: transform colour (0.80, 0.67) returns as (0.23, 0.19) -- same hue angle, chroma forced to 0.3.

**Verification.** Pinned as it.fails in flameXml.golden.test.ts (PR #92); fails identically on v0.9.11. Not a regression.

**Suggested fix.** Export a 256-entry palette that reproduces each transform colour at its index, so import samples it back.


---

## Confirmed — low

### Variation-weight targets are keyed by variation TYPE, so two same-type variations in one transform collide on both the write target and the smoothing-state key

`packages/app/src/utils/audioAnalysis.ts:837` — **low** · behaviour-change · introduced by #82 · lens: Timeline engine and audio analysis modulation

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** PR #82 added a fallback that did not exist before. Before (9901fc5c^, `applyAudioMappingsToFlame`): `const v = vars[tgt.variationType]`. After (audioAnalysis.ts:837-841): `const v = vars[tgt.variationType] ?? Object.values(vars).find((candidate) => candidate.type === tgt.variationType)`. `variations` is a `v.record(VariationId, BaseVariationDescriptor)` (packages/core/src/schema/flameSchema.ts:392) keyed by UUID, e.g. `variations: { '44890d73_...': { type: 'cliffordVar', weight: 1 } }` (packages/app/src/flame/examples/cliffordCsch2.ts:32), so the direct lookup never matched and the `find` is what now does the work. But the target model still identifies a variation only by `.type`: `TargetNode.tsx:122` emits one target per variation with `variationType: v.type`, `audioWiringPresets.ts:178` (`t.variations.slice(0, 2)`) emits one per variation with no type dedupe, and `flameTargetKey` (audioAnalysis.ts:559) returns `tx.${transformIdx}.var.${variationType}.weight`. `flame.addVariation` (packages/app/src/commands/builtins/flame/variationCommands.ts:86) rejects only a duplicate variation *id*, never a duplicate type, so a transform holding two `linearVar` entries is legal and reachable.

**How it fails.** Transform 0 holds two variations of the same type: `{ v0: {type:'linearVar', weight:1}, v1: {type:'linearVar', weight:0.3} }`. Open the wiring modal: TargetNode lists two identically-labelled 'T0 / linearVar weight' rows. Wire the first to `bass` and the second to `presence`. On every tick `Object.values(vars).find(c => c.type === 'linearVar')` returns `v0` for both mappings, so `v1.weight` never moves, and `flameTargetKey` returns the same string `tx.0.var.linearVar.weight` for both, so the two mappings share one `{smoothed, lastApplied}` entry: the presence mapping reads the bass mapping's `smoothed` as its envelope `prev`, and its dirty check compares against the bass mapping's `lastApplied`, so it is usually skipped entirely (`checkTargetDirty` returns false, audioAnalysis.ts:729). Net effect: one of the two wires is silently inert and the other's envelope is corrupted by cross-talk.

**Repro.** Load a 2D flame, open the transforms sidebar, click 'Add variation' twice on transform 0 (TransformsSection.tsx:557 -> flame.addVariation with no type -> two linearVar entries under distinct UUIDs). Open the audio wiring modal and pick the 'morph' preset. buildFlamePreset('morph', transforms) (audioWiringPresets.ts:176-191) emits two entries both targeting {kind:'variationWeight', transformIdx:0, variationType:'linearVar'} on different bands. Play audio: only the first variation's weight moves (Object.values(vars).find at audioAnalysis.ts:839 returns it for both), and both entries write/read the single smoothingState slot 'tx.0.var.linearVar.weight'. NOT reproducible by dragging two wires in the modal - doConnect (AudioWiringModal.tsx:649) filters the earlier mapping out first.

**Suggested fix.** Carry the variation id, not the type, in the target: `TransformInfo.variations` already exposes `{ id, type }` (audioAnalysis.ts:583). Add `variationId` to the `variationWeight` FlameTarget, prefer it in `applyVariationWeightTarget` (keeping the type `find` only as a migration fallback for targets persisted without an id), and include it in `flameTargetKey` so the smoothing state stops aliasing.

### PR #82 silently turned every variation-weight audio mapping from inert to live inside a commit labelled a refactor

`packages/app/src/utils/audioAnalysis.ts:838` — **low** · behaviour-change · introduced by #82 · lens: Timeline engine and audio analysis modulation

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** Same line as above. The commit message for 9901fc5c is 'refactor: modularize audio analysis modulation and wiring shortcuts (Phase 10)' and lists no behaviour change; the diff (`git show 9901fc5c -- packages/app/src/utils/audioAnalysis.ts`) is otherwise a pure code move — `computeSmoothedEnvelope`, `checkTargetDirty`, `applyRenderSettingTarget`, `applyTransformAffineTarget`, `applyTransformPropertyTarget`, `applyFinalAffineTarget`, `dispatchAudioTargetMapping` are all faithful extractions (I compared each branch against the original if/else chain; the only other divergence, `(attackMs ?? 0) > 0 || (releaseMs ?? 0) > 0` becoming `attackMs <= 0 && releaseMs <= 0`, is equivalent for every value the schema admits, since `packages/core/src/schema/audioWiring.ts:76` pipes both through `v.finite()` and `v.minValue(0)`). The one real semantic change is the `Object.values(vars).find(...)` fallback, and the new test that pins it (`audioAnalysisMappings.test.ts:180 'modulates variation weights on existing variations'`, asserting `linearVar?.weight` toBe 3.5 against a fixture keyed `{ v0: { type: 'linearVar' } }`) shows it was deliberate, not incidental. Note also that unlike render settings (`clampRenderSetting`, audioAnalysis.ts:673) and probability (floored at 0.001, audioAnalysis.ts:812), variation weight is written raw with no bound.

**How it fails.** A user tuned an audio wiring in v0.9.11 with several variation-weight rows in it; those rows did nothing, so they compensated by pushing the sensitivity and range of their remaining probability/affine rows. After upgrading, loading the same saved wiring makes every variation-weight row live at once: variation weights start swinging over the authored range (e.g. the built-in 'morph' preset's `[0, 1.5]`, audioWiringPresets.ts:184) on top of the already-overcompensated rows, and the flame looks materially different from the one they saved. Nothing in the release notes or the commit message explains it.

**Repro.** Deterministic, but not via the finder's scenario. Take any recording whose initialAudio snapshot contains a variationWeight mapping (recorder/schema.ts:215 persists AudioWiringSnapshot; useWorkspaceReplay.ts:273/469 restores it). Replay it on v0.9.11 - the variation weight is constant. Replay the same file on HEAD - the weight now sweeps the authored range. Same input, different frames, no changelog entry. The 'user overcompensated their other rows' story cannot be reproduced at all.

**Suggested fix.** Keep the fix, but land it as its own commit with a `fix(audio):` subject and a changelog line, so a behaviour change is not buried in a decomposition PR — and while there, add the same defensive bound variation weight lacks (a `Math.max(0, ...)` / non-finite guard mirroring `applyTransformPropertyTarget`'s probability floor).

### The 890-line clash-choreography rewrite — the part of PR #80 with real sign-inversion risk — got zero new tests; the two existing tests assert track paths, never keyframe values

`packages/app/src/flame/flameClashChoreography.test.ts:124` — **low** · test-gap · introduced by #80 · lens: Timeline engine and audio analysis modulation

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** PR #80 touched exactly three files (`git show --stat 65ee7401`): flameClashChoreography.ts (+/-890), timeline.test.ts (+306), timeline.ts. All 306 new test lines went to timeline.test.ts (six `applyTracksToFlame` tests at timeline.test.ts:846-1061). `flameClashChoreography.test.ts` was untouched — `git log -- packages/app/src/flame/flameClashChoreography.test.ts` shows its last commit is 20de3a2e, the original feature. Its two tests (lines 124 and 182) are almost entirely `expect(trackPaths).toContain('transform.p1_t0_0.postAffine.d')`-style shape assertions; the only value assertions are `exposureTrack` impact keyframe `toBeGreaterThan(2.0)` and the probability track's `toBeGreaterThan(1.0)` / `toBeLessThan(0.5)`. No test reads a single keyframe value off any `postAffine.d` / `postAffine.c` / `postAffine.h` / `postAffine.l` track. Meanwhile the refactor collapsed two hand-mirrored 60-line blocks into one `computeFighterXPosition(isP1, outcome, winVal, oppVal, drawVal)` helper (flameClashChoreography.ts:66-77) driven by six inline `isP1 ? x : -x` ternaries — twelve sign decisions where the old code had twelve literal constants. I checked all twelve by hand against the pre-refactor P1 and P2 blocks and they are correct, but nothing in the suite would have caught it if they were not.

**How it fails.** Flip one ternary — say `isP1 ? -0.85 : 0.85` to `isP1 ? 0.85 : -0.85` at flameClashChoreography.ts:110 — and both fighters dash to the same side of the arena on a round P2 wins, so they pass through each other instead of colliding. `pnpm test` stays green: both choreography tests only check that `transform.p2_t0_0.postAffine.d` is present in the track list. The bug ships and is caught, if at all, by someone watching a clash replay.

**Repro.** Not reproducible as a user-visible failure; the code is correct. To demonstrate the coverage gap: change flameClashChoreography.ts:110 from `isP1 ? -0.85 : 0.85` to `isP1 ? 0.85 : -0.85` and run the choreography suite. Both tests still pass, because they only assert that 'transform.p1_t0_0.postAffine.d' and 'transform.p2_t0_0.postAffine.d' appear in result.tracks.map(t => t.parameterPath) (lines 145-146), never what those tracks contain.

**Suggested fix.** Add a characterization test that snapshots the four X keyframes per round for one p1 and one p2 transform across the three winner outcomes ('A', 'B', 'draw') — six numbers times three cases pins every ternary in `computeFighterXPosition`. A cheap invariant test helps too: for a round with winner 'A', assert the p1 impact value is positive and the p2 impact value is negative, and that the draw case is the mirror of itself.

### Lazy modal factories cache a rejected import promise and every call site discards the rejection with `void`

`packages/app/src/components/WorkspaceModalsHost/lazyModals.ts:26` — **low** · error-handling · introduced by #73 (5d35f893) · lens: MainWorkspace decomposition and workspace hooks

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** Every factory in lazyModals.ts follows the same shape, e.g. createLazyShowBenchmark (lines 25-33):
```
if (!instancePromise) {
  instancePromise = import('@/components/BenchmarkModal/BenchmarkModal').then(
    (m) => runWithOwner(owner, () => m.createShowBenchmark())!,
  )
}
const fn = await instancePromise
```
There is no `.catch` and no reset of `instancePromise` on failure, so once the dynamic import rejects the memoised rejected promise is returned for the rest of the page's life. The same pattern repeats in createLazyShowDocumentation (44-52), createLazyShowHelp (70-92), createLazyShowCustomVariationEditor (105-117) and the remaining factories in the file.

The call sites all fire-and-forget: MainWorkspace.tsx:4093 `void showBenchmark()`, 4096 `void showDocumentation()`, 4099 `void showHelp()`, 2443 and 3937 `void showShareLinkModal()`, 1436 `void showBenchmark({ autoStart: props.autoStartBenchmark })`. `grep -n 'catch' MainWorkspace.tsx` shows none of these are wrapped.

Before Phase 1.1 these modals were statically imported into the main bundle, so a chunk-load failure was not a reachable state at all — this failure mode is new.

**How it fails.** A user has the app open when a new build is deployed and the old chunk hashes are purged (the standard SPA stale-chunk case), or is on a flaky connection. They click Benchmarks / Docs / Help / Share: the dynamic import rejects, an unhandled promise rejection is logged, the button appears to do nothing, and because the rejected promise is cached every subsequent click also does nothing with no error surfaced. Only a full page reload recovers.

**Repro.** In DevTools go offline (or add a request-blocking rule for the BenchmarkModal chunk) and click Benchmarks: an unhandled rejection logs and nothing opens. Restore the network and click again: still nothing, because `instancePromise` still holds the rejected promise. Only a reload recovers. In production the natural trigger is an open tab after a redeploy purges the old hashed chunk.

**Suggested fix.** On rejection, clear the cache and surface the failure: `instancePromise = import(...).then(...).catch((err) => { instancePromise = null; throw err })`, and have the MainWorkspace call sites use `.catch(() => showToast('Could not load this panel — please reload'))` instead of bare `void`.

### workspaceLayoutStore creates three createMemo computations at module scope, outside any createRoot or owner

`packages/app/src/stores/workspaceLayoutStore.ts:114` — **low** · reactivity · introduced by #79 (1468bbf5), on the store introduced by 06ae45bd · lens: MainWorkspace decomposition and workspace hooks

**Now:** fixed in #90 (`b17c7b6e`); duplicate listeners gone in #95 (`d7b4af3b`). See [Status on main](#status-on-main).

**Evidence.** Lines 114-126 sit at module top level, not inside createWorkspaceLayoutStore (which starts at line 135):
```
export const isPhone = createMemo(() => { ... })
export const isTablet = createMemo(() => { ... })
export const isTouchLayout = createMemo(() => isPhone() || isTablet())
```
The module is pulled in eagerly via the `./stores` barrel (stores/index.ts line 2) which MainWorkspace imports at line 246 usage (`createWorkspaceLayoutStore`), so all three run during ES-module evaluation, when getOwner() is null. That is precisely the condition Solid's dev build reports as "computations created outside a createRoot or render will never be disposed" — the warning this repo has repeatedly chased (memory note solid-conditional-prop-memo-leak). They subscribe permanently to touchLayoutPreference/rawIsPhone/rawIsTablet with no disposal path.

The surrounding module-level side effects have the same problem in the non-reactive direction: lines 105-112 register `mqPhone.addEventListener('change', ...)` and `mqTablet.addEventListener('change', ...)` with no removal, and MainWorkspace.tsx:390-427 registers a second, identical pair of phone/tablet matchMedia listeners writing the same setRawIsPhone/setRawIsTablet signals (that one does have onCleanup). Two independent listener sets now drive the same state.

Also note the memo body at 116-117 is dead: `if (touchLayoutPreference() === 'touch') return rawIsPhone()` is followed by the identical `return rawIsPhone()`.

**How it fails.** Load the app in a dev build: three "computations created outside a createRoot" warnings fire before the first render, which is the signal this codebase uses to detect real ownership leaks — it now cries wolf on every boot, masking genuine instances. Functionally, resizing across the 680px/1024px boundaries runs both the module-level and the MainWorkspace matchMedia handlers, so setRawIsPhone/setRawIsTablet are written twice per breakpoint crossing; and because the module-level listeners are never removed they keep firing after the workspace unmounts (Arcade/Home tab switches).

**Repro.** Run the app in a dev build and read the console before first paint: three 'computations created outside a `createRoot` or `render` will never be disposed' warnings, emitted from solid-js dist/dev.js:789. The dead branch is verifiable by inspection at workspaceLayoutStore.ts:116-117. The duplicate-listener half cannot be reproduced as a user-visible failure -- I tried, and equal-value signal writes are deduped by Solid's default equality.

**Suggested fix.** Wrap the three memos in a single `createRoot(() => ({ isPhone, isTablet, isTouchLayout }))` at module scope so they have an explicit owner, delete the duplicated phone/tablet matchMedia block from MainWorkspace.tsx:390-427 (keeping only the `(max-width: 768px)` isMobile handler) or, better, move all three media queries into the store's root and drop the module-level listeners. Collapse the dead `'touch'` branch in isPhone.

### isPhone/isTablet/isTouchLayout are createMemo calls at module scope with no owner — the codebase's only three

`packages/app/src/stores/workspaceLayoutStore.ts:114` — **low** · reactivity · introduced by #77 · lens: Mobile and tablet responsive UI, documentation panel redesig

**Now:** fixed in #90 (`b17c7b6e`). See [Status on main](#status-on-main).

**Evidence.** Lines 114, 120 and 126 are `export const isPhone = createMemo(...)`, `export const isTablet = createMemo(...)` and `export const isTouchLayout = createMemo(() => isPhone() || isTablet())`, all at module top level with no enclosing `createRoot`. `grep -rn '^export const .* = createMemo\|^const .* = createMemo' packages/app/src` returns exactly these three lines and nothing else — every other memo in the app is inside a component or a factory. solid-js 1.9.11's dev build warns unconditionally in `createComputation`: node_modules/.pnpm/solid-js@1.9.11/node_modules/solid-js/dist/dev.js:789 reads `if (Owner === null) console.warn("computations created outside a `createRoot` or `render` will never be disposed")`. The module is imported at boot by MainWorkspace.tsx:253, Toast.tsx:1 and ExportJobTracker.tsx:2, so the warnings fire on every page load. Lines 105-112 add two `matchMedia` change listeners at the same scope, also never removed. Compounding this, `createWorkspaceLayoutStore()` (line 135) returns these module globals as fields (lines 183-187) beside genuinely per-instance signals, so the factory's return type gives no hint that three of its members are process-wide singletons.

**How it fails.** Boot the app in dev and the console carries three `computations created outside a createRoot or render will never be disposed` warnings before any user interaction — the exact diagnostic the project's own notes flag as the signature of an ownership bug, now emitted by healthy code, which trains readers to ignore it when a real leak appears. The smoke gate does not catch it: tests/smoke.spec.ts:195-204 filters `consoleErrors` only. Functionally, any test or harness that calls `createWorkspaceLayoutStore()` twice gets two stores that silently share phone/tablet state, and a `createRoot(dispose => ...)` in workspaceLayoutStore.test.ts:7 disposes nothing of these three because they were created at import time, outside the root.

**Repro.** Run the dev server and open the console before touching anything: three 'computations created outside a `createRoot` or `render` will never be disposed' lines appear at boot. Confirmable statically: no createRoot encloses lines 114-126, and the only importers (MainWorkspace.tsx:31, Toast.tsx:4, ExportJobTracker.tsx:2) are module-scope imports evaluated before render(). There is no runtime misbehaviour to reproduce.

**Suggested fix.** Wrap the module-level reactive setup in `createRoot(() => { ... })` and export the memos from inside it — the singleton lifetime is intentional, so an explicit permanent root both silences the warning and documents that intent. The `matchMedia` listeners belong in the same root with `onCleanup`. Then either move these three out of the `WorkspaceLayoutStore` interface entirely (they are globals, not instance state) or add a comment on the interface saying so.

### createHorizontalScrollDrag never sees pointerup released outside the rail, leaving isDown latched so a later hover scrolls the gallery

`packages/app/src/utils/createHorizontalScrollDrag.ts:91` — **low** · error-handling · introduced by #77 · lens: Mobile and tablet responsive UI, documentation panel redesig

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** All six listeners are bound to the element only (lines 120-125): `el.addEventListener('pointerdown'|'pointermove'|'pointerup'|'pointercancel'|'wheel'|'click')`. There is no window/document fallback and no `pointerleave` handler. `handlePointerDown` (line 55) sets `isDown = true` unconditionally for a non-touch primary button. `setPointerCapture` — the only thing that would retarget a stray pointerup back to `el` — is called at line 80 but ONLY inside `if (!hasDragged && Math.abs(dx) > threshold)` (line 73), i.e. after the pointer has already moved more than 4px, and it is wrapped in try/catch that swallows failure (lines 79-83). `handlePointerUp` (line 91) is therefore never reached when the button is released off-element before the threshold is crossed, and nothing else clears `isDown`. `handlePointerMove` (line 70) gates only on `if (!isDown) return`; it never checks `e.buttons`. Both live callers pass a `draggingClass` and rely on this: TouchControlSurface.tsx:91 for the variation carousel, TouchHUD.tsx:45 for the controls rail.

**How it fails.** With a mouse (the code deliberately skips `pointerType === 'touch'`), press the left button on a variation tile in the touch gallery, move 1-3px — under the 4px threshold, so no pointer capture is taken — then move the cursor off the carousel and release. `handlePointerUp` never fires because the pointerup lands on another element, and `isDown` stays true with `startX`/`startScrollLeft` frozen at the press position. Later, move the cursor back over the carousel with no button held: `handlePointerMove` runs, `isDown` is still true, `dx` now exceeds 4px, so `hasDragged` flips, the `isDragging` class is added, `preventDefault()` is called and `el.scrollLeft` is yanked to `startScrollLeft - dx`. The gallery scrolls on hover and swallows the next click via `handleClickCapture` (line 113).

**Repro.** With a mouse on a desktop-width window, press and hold the left button on a tile in the touch variation carousel or the TouchHUD controls rail, move the cursor straight up or down out of the rail (keeping horizontal travel under 4px), and release outside it. No pointerup reaches el, so isDown stays true. Now move the cursor back over the rail with no button held: as soon as |clientX - startX| exceeds 4, the isDragging class appears and el.scrollLeft jumps to startScrollLeft - dx, and the next click on a tile is swallowed.

**Suggested fix.** Bind the release path to the window rather than the element — `window.addEventListener('pointerup'|'pointercancel', handlePointerUp)` in the same effect, removed in the existing onCleanup — or set pointer capture in `handlePointerDown` instead of waiting for the threshold. A cheap belt-and-braces addition is `if (e.buttons === 0) { isDown = false; return }` at the top of `handlePointerMove`. While there, the 60ms `setTimeout` at line 106 is not cleared in onCleanup.

### AdvancedToolsDrawer accepts and ignores onSonification, so Sonification is unreachable from the touch drawer despite MainWorkspace fully wiring it

`packages/app/src/components/TouchSurface/AdvancedToolsDrawer.tsx:12` — **low** · dead-code · introduced by #77 · lens: Mobile and tablet responsive UI, documentation panel redesig

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** `AdvancedToolsDrawerProps` declares `onSonification?: () => void` (line 12) and `onShare?: () => void` (line 15). The `tools()` array (lines 34-125) builds seven cards — flame-gallery, switch-desktop, art-director, arena-clash, genetics-breeding, audio-reactive, timeline-animation, high-res-export — and references `props.onPickGallery`, `props.onSwitchToDesktop`, `props.onArtDirector`, `props.onFlameClash`, `props.onBreed`, `props.onAudio`, `props.onTimelineToggle`, `props.onExportPng`. Neither `props.onSonification` nor `props.onShare` appears anywhere in the file body (`grep -n 'onSonification\|onShare' AdvancedToolsDrawer.tsx` returns only the two interface lines). MainWorkspace.tsx:3511-3520 nevertheless passes a complete, non-trivial `onSonification` handler that switches the layout preference to desktop, shows a toast ("Switched to Desktop Layout for Sonification"), closes the blend gallery, closes the audio panel and calls `setShowSonificationPanel(true)` — the same shape as the `onAudio` handler at :3504 which does get a card.

**How it fails.** On a phone or tablet, tap More → Advanced Tools. The drawer lists Audio Reactive & Beats, Timeline & Keyframes, Breeding & Genetics and the rest, but there is no Sonification card. A touch user cannot reach the sonification panel from the drawer at all, even though MainWorkspace built and passed a handler specifically for it. The handler is unreachable code that typechecks, so nothing flags it; a reader of MainWorkspace reasonably concludes the feature is available on touch.

**Repro.** Load the app at a phone or tablet width, tap More -> Advanced Tools, and read the drawer: eight cards, no Sonification. Statically: `grep -n 'onSonification' packages/app/src/components/TouchSurface/AdvancedToolsDrawer.tsx` returns only line 12, the interface declaration, while MainWorkspace.tsx:3511 passes a live closure to it.

**Suggested fix.** Add the missing card to `tools()` alongside audio-reactive (`id: 'sonification'`, MusicNote or a dedicated icon, `action: () => { props.onSonification?.(); props.onClose() }`), or delete `onSonification` from the interface and the handler from MainWorkspace.tsx:3511 if the omission was deliberate. `onShare` is passed by nobody and used by nobody — delete it.

### TabletSplitLayout has a unit test and a barrel export but no production caller — a second, unreachable tablet layout

`packages/app/src/components/TouchSurface/TabletSplitLayout.tsx:5` — **low** · dead-code · introduced by #77 · lens: Mobile and tablet responsive UI, documentation panel redesig

**Now:** fixed in #95 (`c5039165`), which deleted it with its barrel entry, test and CSS. See [Status on main](#status-on-main).

**Evidence.** `grep -rn 'TabletSplitLayout' packages/app/src` returns only four files, all inside components/TouchSurface: the definition, the barrel (`TouchSurface/index.ts:5`), the types file, and TouchSurface.test.tsx (import at :5, `describe` at :229, render at :234). MainWorkspace mounts `TabletInspectorDeck` directly (MainWorkspace.tsx:3455) inside `<Show when={isTablet()}>`, never the split layout. The component's own container classes are consequently dead too: TouchSurface.module.css `.tabletLayout` (line 328) and `.tabletCanvasPane` (line 337) are referenced only from TabletSplitLayout.tsx:7-8. Note that `.tabletLayout` is also the name of the LIVE tablet grid class in App.module.css:21 — two different rules, two different files, same name, one unreachable. `TabletSplitLayoutProps` (`TouchSurface/types.ts:38-52`) is dead with it. Same directory, same PR: `AdvancedDrawerItem` (`TouchSurface/types.ts:55`) is exported and referenced nowhere — AdvancedToolsDrawer builds an inline object shape carrying an extra `highlight` field the declared type does not have. `TouchSurfaceMode` (`TouchSurface/types.ts:7`) exists only to type the ignored `mode` prop. Four CSS classes in the new 1,103-line stylesheet are unreferenced from any .tsx: `.hudTitle` (line 60), `.hudTitleIcon` (line 93), `.quickPicksHeader` (line 634), `.quickPicksStrip` (line 642).

**How it fails.** No runtime failure — this is maintenance cost that actively misleads. The passing test suite at TouchSurface.test.tsx:229 makes `TabletSplitLayout` look like live, exercised code, so a future reader changing tablet layout will reasonably edit it, watch the test stay green, and ship nothing. The duplicate `.tabletLayout` class name across two CSS modules means a grep for the tablet grid returns the dead rule first. And because the dead component is what carries the split-pane CSS, the real tablet layout depends entirely on App.module.css — which is where finding #2's override lives.

**Repro.** Not reproducible at runtime by design. Static: `grep -rn 'TabletSplitLayout' packages/app/src` yields four files, none of them MainWorkspace.tsx; `grep -n 'mode' packages/app/src/components/TouchSurface/TouchControlSurface.tsx` yields nothing. Behavioural proof of the deadness: delete TabletSplitLayout.tsx plus its describe block and the tablet layout is unchanged.

**Suggested fix.** Delete TabletSplitLayout.tsx, its barrel export, `TabletSplitLayoutProps`, its `describe` block, and the `.tabletLayout`/`.tabletCanvasPane` rules in TouchSurface.module.css — or wire it into MainWorkspace in place of the bare `TabletInspectorDeck` if the split container was the intent. Delete `AdvancedDrawerItem`, and the four orphan CSS classes.

### llms.txt names three Arcade modes with tools; six shipped, three of them in the two PRs merged before it

`packages/app/public/llms.txt:46` — **low** · behaviour-change · introduced by #79 · lens: Mobile and tablet responsive UI, documentation panel redesig

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** `packages/app/public/llms.txt:46` states "Teach, Cinema and Duel are the Arcade modes with tools today." PR #79 merged 2026-09-09. PRs #74 (beats mode, merged 2026-09-07), #75 (art director mode, 2026-09-07) and #76 (arena mode, 2026-09-07) all merged before it and all shipped WebMCP tools: packages/app/src/webmcp/tools/ now contains arcadeBeats.ts (12.3K, with arcadeBeats.test.ts), arcadeDirector.ts (7.3K, with arcadeDirector.test.ts), openArtDirector.ts, openArena.ts, arenaStartClash.ts, arenaGetStats.ts, arenaCommentate.ts, arenaArchetypes.ts, simulateClash.ts, scoreClashRound.ts and animateClash.ts, alongside the arcadeTeach.ts / arcadeCinema.ts / arcadeDuel.ts the sentence does mention. The surrounding document is otherwise carefully hedged ("a separately attested server executor does not exist yet") and its own preamble sets the standard: "this file is where a crawler can learn what it does".

**How it fails.** An assistant fetches https://lumenapeiron.com/llms.txt — the file's entire purpose — and is told authoritatively that Beats, Art Director and Arena either do not exist or have no agent tools. It then tells a user that Lumen Apeiron cannot drive the arena or the art director from an agent, or omits half the Arcade when summarising the product. The file is the one artefact in the repo explicitly published as ground truth for machines, and there is nothing in CI that compares its claims to webmcp/tools/index.ts, so the drift is silent and will widen with every new mode.

**Repro.** `sed -n '46p' packages/app/public/llms.txt` says three modes; `sed -n '13,19p' packages/app/src/lib/activeTab.ts` lists six; `grep -n 'arcadeStartBeats\|directorPropose\|arenaStartClash' packages/app/src/webmcp/tools/index.ts` shows all three of the unnamed modes registered in allTools. Behaviourally: fetch https://lumenapeiron.com/llms.txt and ask any assistant which Arcade modes an agent can drive; it will name three of six.

**Suggested fix.** Update line 46 to name all six modes, and prefer a formulation that does not enumerate ("every Arcade mode exposes WebMCP tools") so the sentence cannot go stale again. Better still, add a check to the existing webmcp/tools/toolCount.test.ts that asserts each registered arcade mode appears in public/llms.txt, so the file fails the suite when a mode is added.

### BEATS_ALLOWED advertises four command ids that are not registered, and describeAllowedCommands passes them through unchecked

`packages/app/src/arcade/topics.ts:273` — **low** · correctness · introduced by #75 (60361cd5) · lens: Arcade modes

**Now:** fixed in #113 (`8dab3d52`). See [Status on main](#status-on-main).

**Evidence.** BEATS_ALLOWED (topics.ts:270-282) lists 'audio.setPreset' (273), 'audio.addMapping' (275), 'audio.removeMapping' (276), 'audio.clearMappings' (277). Extracting every registered id from packages/app/src/commands/builtins (87 ids total) shows only `audio.setMapping`, `audio.setEnabled`, `audio.setSource` and `audio.applySnapshot` exist — the four above are absent. arcadeBeats.ts:124,151 feeds this list straight into `describeAllowedCommands(allowed)`, and that function (arcade/commandHints.ts:105-114) only expands entries ending in '.' against getAllCommands(); every other entry is pushed verbatim with no registry membership check, so the phantom ids are returned to the agent in the `allowedCommands` field of arcade_start_beats.

**How it fails.** An agent starts a Beats session, reads `allowedCommands` from the tool result, and calls `execute_command` with 'audio.addMapping' to add a single mapping row (the natural incremental workflow the names suggest). The registry has no such command, so the call is rejected; the agent burns steps against the 30-step BEATS_STEP_BUDGET rediscovering that only audio.applySnapshot/audio.setMapping exist.

**Repro.** Start a Beats session and read `allowedCommands` from the arcade_start_beats result — the four phantom ids are present. Then `execute_command({commandId: 'audio.addMapping', args: [...]})`: it fails in preflightLiveCommand with an unknown-command error, and `pilotStepsRemaining()` is unchanged. Deterministic unit check: `expect(describeAllowedCommands([...BEATS_ALLOWED]).map(s => s.split(' ')[0]).filter(id => !getAllCommands().some(c => c.id === id))).toEqual([])` fails with the four ids.

**Suggested fix.** Either register the four commands, or delete them from BEATS_ALLOWED. Independently, make describeAllowedCommands drop (or throw in dev on) ids that getAllCommands() does not contain, so an allow-list typo can never be advertised to an agent again — the same class of bug would silently hit every future mode. Fixed in PR #113: the four ids are removed, and a test holds every Arcade allow-list to the registered commands.

### arena_start_clash documents and accepts a `rounds` parameter that the only implementation of startClash discards

`packages/app/src/webmcp/tools/arenaStartClash.ts:94` — **low** · correctness · introduced by #76 (84a3315b / 3b42ddda) · lens: Arcade modes

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** arenaStartClash.ts:32-35 declares `rounds: { type: 'integer', description: 'Number of battle rounds to contest. Default is 3.' }` and line 92-95 forwards it: `await arena.startClash({ stance: raw.stance, rounds: raw.rounds ?? 3 })`. The facade type in commands/types.ts:118-121 also carries `rounds?: number`. The single implementation, ArenaOverlay.tsx:835-844, reads only `opts?.stance` and then calls `runSimulation()` with no arguments; runSimulation hard-codes `rounds: 3` in its simulateClash.execute call (ArenaOverlay.tsx:889). MainWorkspace's placeholder initialStartClash (MainWorkspace.tsx:2786-2810) likewise forwards `opts` only to the real implementation, which drops it.

**How it fails.** An agent calls `arena_start_clash({ opponentArchetype: 'void_stalker', rounds: 5 })` to stage a best-of-five. The tool returns `{success: true}` with a 3-round combat result; the timeline is keyframed for 3 rounds. The agent has no way to detect that its parameter was ignored, and any narration it writes about round 4 and 5 is fabricated.

**Repro.** arena_start_clash({ opponentArchetype: 'void_stalker', rounds: 5 }) -> result.combat.rounds.length === 3, and the timeline receives 90 frames rather than 150. Unit-level: mount ArenaOverlay with the test harness in ArenaOverlay.test.tsx:169, call mockArena.startClash({ stance: 'balanced', rounds: 7 }), and assert on the simulateClash spy's `rounds` argument — it is 3.

**Suggested fix.** Thread the option through: `props.arena.startClash = (opts) => { ...; return new Promise(resolve => runSimulation(resolve, opts?.rounds)) }` and have runSimulation take a `rounds` argument (clamped to, say, 1..10) that it passes to simulateClash.execute instead of the literal 3. If rounds is deliberately fixed, remove it from the tool's inputSchema and from the CommandContext type so the contract stops lying.

### extractFlameTasteFeatures and calculateGroundedStats skip every transform whose `visible` field is absent, which is the normal shape of an agent-supplied flame

`packages/app/src/arcade/tasteStore.ts:101` — **low** · correctness · introduced by #74 (e4c5afc4) · lens: Arcade modes

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** tasteStore.ts:100-108 iterates transforms with `if (!t.visible) continue` before collecting variation categories, and derivePaletteTemperature does the same at line 72. flame/stats.ts:368 repeats the pattern inside calculateGroundedStats. The schema materialises the default — `visible: v.optional(v.boolean(), true)` at packages/core/src/schema/flameSchema.ts:236 — but only for a flame that has been through v.parse. Director candidates never are: directorPropose takes `candidates` straight off the tool input (`const { generation, candidates, steeringPrompt } = input as {...}`, webmcp/tools/arcadeDirector.ts:114-120), normalizeCandidates only replaces a flame when transforms are missing entirely (14-48), and directorGetFeedback then calls `extractFlameTasteFeatures(cand.flame)` on the raw object (193). The sibling helper in the same feature uses the opposite convention — calculateStructuralSymmetry filters on `(t.visible ?? true)` (webmcp/tools/scoreFlame.ts, calculateStructuralSymmetry) — so the two disagree on the same flame.

**How it fails.** An agent calls director_propose with four candidate FlameDescriptors it composed as plain JSON (no `visible` key, which is legal — the schema defaults it). The user likes two. director_get_feedback returns `features.variationCategories: []` and `paletteTemperature: 'balanced'` for every candidate, and director_get_taste_profile subsequently reports `preferredCategories: []` with the summary line 'likes symmetry ~0/10, complexity ~…'. The taste engine's headline output is empty for exactly the input path it was built for.

**Repro.** In a unit test: const raw = { transforms: { t1: { probability: 1, preAffine: {...}, postAffine: {...}, color: {x:0.1,y:0}, variations: { v1: { type: 'sphericalVar', weight: 1 } } } }, renderSettings: { camera: { zoom: 1, position: [0,0] } } } — note no `visible` anywhere. extractFlameTasteFeatures(raw as FlameDescriptor) returns variationCategories: [] and paletteTemperature: 'balanced', while extractFlameTasteFeatures({...raw, transforms: { t1: { ...raw.transforms.t1, visible: true } }}) returns the real category. Reproducing it through the UI is not possible — every UI path validates first.

**Suggested fix.** Use `(t.visible ?? true)` in tasteStore.ts:72 and :101 and in flame/stats.ts:368, matching calculateStructuralSymmetry. Better: run agent-supplied candidate flames through `v.parse(FlameDescriptor, ...)` inside normalizeCandidates so defaults are materialised once and every downstream consumer sees a canonical descriptor.

### ensureCamera fabricates a camera3D with fields that do not exist in Camera3DObjSchema and omits theta/phi/radius/roll

`packages/app/src/components/ArenaOverlay.tsx:443` — **low** · correctness · introduced by #76 (84a3315b / 20de3a2e) · lens: Arcade modes

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** ArenaOverlay.tsx:443-448 fills a missing camera3D with `{ position: [0, 0, -5], target: [0, 0, 0], up: [0, 1, 0], fov: 45 }`. Camera3DObjSchema (packages/core/src/schema/flameSchema.ts) is `v.object({ theta, phi, radius, target, fov, roll })` — there is no `position` and no `up`, and four of its six members are missing from the literal. Every other producer in this same feature uses the real shape: createClashFlame.ts:253-260 emits `camera3D: { theta, phi, radius, target, fov, roll }`, and getFlame.ts's formatSummarizedCamera3D reads theta/phi/radius/target/fov/roll. The malformed object is returned by p1PreviewFlame/p2PreviewFlame (ArenaOverlay.tsx:492-497) and handed to VariationPreview as `flame={f()}` at 1205 and 1727.

**How it fails.** A fighter flame is loaded into a slot from the gallery (openGalleryForFighter, ArenaOverlay.tsx:715) or synced from the editor with `renderSettings.dimensions === 3` but no explicit camera3D block. ensureCamera returns a descriptor whose camera3D has undefined theta, phi, radius and roll and two junk keys, so the 3D fighter preview is framed from a garbage/NaN orbital camera rather than the intended default, while the card's fallback text never shows because `when={p1PreviewFlame()}` is truthy.

**Repro.** open_arena({ player1Stats: {...}, player2Stats: {...}, player1Flame: { transforms: {...}, renderSettings: { dimensions: 3, camera: { zoom: 1, position: [0,0] } } } }) — camera3D deliberately omitted. The Player 1 fighter card renders an empty canvas. Confirm by breakpointing lib/Camera3D.tsx:68-72 and observing position === Float32Array [NaN, NaN, NaN]. Not reproducible via the gallery or Sync Active — both deliver validated descriptors that always carry camera3D.

**Suggested fix.** Import `camera3DDefault` from the core schema and use `camera3D: rs.camera3D ?? camera3DDefault`; likewise use `cameraDefault` for the 2D branch rather than an inline literal. That also removes the risk of the two shapes drifting again.

### Animation/replay video export captures the canvas without awaiting the queue fence that the PNG export path now awaits

`packages/app/src/components/ExportJobs/OffscreenAnimationRender.tsx:346` — **low** · behaviour-change · introduced by #78 (commit 492b2a22) · lens: Recorder, replay, export loop and render driver

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** 492b2a22 added `fence: latestQueueFence` to BOTH export-callback sites in Flam3 (packages/app/src/flame/Flam3.tsx:1102 in handleNoWorkTick and Flam3.tsx:1170 in handlePostSubmit) and declared it on ExportImageInfo (packages/app/src/flame/exportImageType.ts:6). Only one of the two consumers was wired: ExportJobHost.tsx:174-176 now does `if (info?.fence) { await info.fence }` before `finalize(canvas)`. OffscreenAnimationRender.tsx — the animation and replay-video job — never reads `info.fence`; handleExport (line 375) gates only on `info?.finalImageReady !== true` (line 395) and then calls `captureAndAdvance`, which does `await globalThis.createImageBitmap(canvas, ...)` at line 346 (and line 279 for the replay path). Flam3.handlePostSubmit fires that callback in the same task as `device.queue.submit(...)` (Flam3.tsx:1231) and immediately after `latestQueueFence = device.queue.onSubmittedWorkDone()` (Flam3.tsx:1150), so at callback time the color-grading pass is submitted but not complete. The commit message for 492b2a22 states its purpose as "Fix tablet export failures by avoiding WebKit canvas backbuffer recycling", i.e. exactly this class of bug.

**How it fails.** On iOS/iPadOS WebKit, run Export > Animation (or Export replay video, mode 'artwork') at a resolution large enough that the final color-grading pass has not completed when finalImageReady is reported. createImageBitmap(canvas) at OffscreenAnimationRender.tsx:346 snapshots the recycled/previous backbuffer, so the encoded MP4 contains a stale or partially accumulated frame. The same input exported as a still PNG is correct, because ExportJobHost.tsx:174 awaits the fence.

**Repro.** Cannot be reproduced on Chromium or Firefox: createImageBitmap(canvas) is required to reflect submitted GPU work, so the frame is correct with or without the await. Platform-conditional repro on iOS/iPadOS Safari: enqueue Export > Animation with 'Render in background (offscreen)' ticked at a resolution where the color-grading pass has real latency, and compare frame N of the MP4 against a still PNG export of timeline frame N (the PNG path awaits at ExportJobHost.tsx:174). A duplicated/previous frame in the video with a correct PNG confirms it. Static confirmation without a device: OffscreenAnimationRender.tsx has zero occurrences of `fence` (grep), while ExportJobHost.tsx:174 has one.

**Suggested fix.** Thread the fence through the same way as the PNG path: capture `info?.fence` in handleExport and `await` it at the top of captureAndAdvance / captureReplayStateRuns before the first createImageBitmap. e.g. change handleExport to `void captureAndAdvance(canvas, info?.fence)` and start the function with `if (fence) await fence`.

### Core hard-codes the mode enums the app derives from its GPU implementation maps, splitting the schema's source of truth

`packages/core/src/schema/modes.ts:3` — **low** · behaviour-change · introduced by #73 (5747de32) · lens: Benchmark lab, command registry, @chaos-master/core extracti

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** Before the extraction, packages/app/src/flame/schema/flameSchema.ts imported the three mode schemas from the modules that own the GPU implementations: `import { ColorInitMode } from '../colorInitMode'` / `'../drawMode'` / `'../pointInitMode'` (verified in the v0.9.11 tree, lines 9-11), and each of those defines the schema DERIVED from its implementation map: `export const ColorInitMode = v.picklist(recordKeys(colorInitModeToImplFn))` (colorInitMode.ts:28), `export const DrawMode = v.picklist(recordKeys(drawModeToImplFn))` (drawMode.ts:27), `export const PointInitMode = v.picklist(recordKeys(allPointInitModes))` (pointInitMode.ts:203, where allPointInitModes = {...pointInitModeToImplFn, ...pointInitMode3DToImplFn}). The extracted core replaced all three with hand-written literal lists in packages/core/src/schema/modes.ts (19 point-init strings typed out by hand), and core/src/schema/flameSchema.ts:8 now validates against those. The app still keeps and uses its derived versions (ifsPipeline.ts:19, commands/builtins/renderSettings.ts:3, VariationSelector.tsx:50, BenchmarksPage.tsx:28). I diffed the two sets programmatically: they are currently identical (19/19, 2/2, 2/2), so there is no user-visible bug today - the defect is that the invariant that used to be mechanical is now manual, with no test asserting the two lists agree.

**How it fails.** Add a point-init mode: register `pointInitSunflower` in `pointInitModeToImplFn` (packages/app/src/flame/pointInitMode.ts) with its shader fn. The app's picklist and the UI pick it up automatically, the renderer dispatches it, and `flame.setRenderSetting('pointInitMode','pointInitSunflower')` passes the command-registry replay policy. But `tryValidateFlame` (core) now rejects the whole descriptor because core/schema/modes.ts still lists 19 names - so loading a saved .flame, opening a share link, or POSTing to /api/share-discord (worker/routes/discord.ts:1 imports tryValidateFlame from core) silently fails with `undefined`/HTTP 400 rather than an error naming the mode. The same happens for a new draw mode or color-init mode.

**Repro.** Cannot reproduce a runtime failure: I diffed the sets and they agree 19/19, 2/2, 2/2. To reproduce the hazard for drawMode (the unguarded axis): add `dissolve: dissolveMode` to `drawModeToImplFn` (packages/app/src/flame/drawMode.ts:22). The app picklist and the `flame.setRenderSetting` allow-list (commands/builtins/renderSettings.ts:48) accept it; `tryValidateFlame` in core rejects the descriptor, so POST /api/share-discord (worker/routes/discord.ts:1) 400s and a saved .flame will not reload. Typecheck stays green because useWorkspaceTimelineBinding.ts:214 casts to the literal `'light' | 'paint'` rather than to the derived type.

**Suggested fix.** Invert the dependency: keep the enums as the single derived source. Either move the implementation-map key lists into core (e.g. core exports the string tuples, the app builds its impl maps keyed by them and a `satisfies Record<PointInitMode, Fn>` check enforces completeness), or, at minimum, add a unit test in packages/app that asserts `recordKeys(allPointInitModes)` equals the core picklist options, and likewise for DrawMode/ColorInitMode.

### packages/app/src/utils/prettyPrintValibotErrors.ts is orphaned - zero importers after the extraction

`packages/app/src/utils/prettyPrintValibotErrors.ts:3` — **low** · dead-code · introduced by #73 (5747de32) · lens: Benchmark lab, command registry, @chaos-master/core extracti

**Now:** fixed in #115 (`984926e4`), which deleted the file. See [Status on main](#status-on-main).

**Evidence.** At v0.9.11 this module had exactly one consumer, the import at v0.9.11, commit 84ae0286 `packages/app/src/flame/schema/flameSchema.ts:2`: `import { prettyPrintValibotErrors, processValibotErrors, } from '@/utils/prettyPrintValibotErrors'`, used at lines 462 and 509 of that file. The extraction copied the module to packages/core/src/utils/prettyPrintValibotErrors.ts (identical except `ReturnType<typeof flatten>` becoming `ReturnType<typeof v.flatten>`) and pointed core's flameSchema at the copy, but did not delete the app's file. `grep -rn 'prettyPrintValibotErrors\|processValibotErrors' packages/app/src` now returns only the file's own definitions - it has no importer anywhere in the repo.

**How it fails.** Not a runtime failure: it is 42 lines of unreachable code that still gets typechecked, linted and formatted on every run, and a developer improving valibot error messages will reasonably edit this file (it is the one under `@/utils/` where every other app util lives) and see no effect on the validation errors the UI actually shows, which come from core's copy.

**Repro.** `grep -rn 'prettyPrintValibotErrors' packages/app/src` prints only lines 3 and 28 of the file itself. Deleting packages/app/src/utils/prettyPrintValibotErrors.ts breaks no import and changes no output.

**Suggested fix.** Delete packages/app/src/utils/prettyPrintValibotErrors.ts.

### Worker decomposition widened 24 module-private helpers into public exports that nothing imports

`packages/app/src/worker/routes/discord.ts:15` — **low** · refactor-quality · introduced by #73 (77551b95, f2b78e42) · lens: Benchmark lab, command registry, @chaos-master/core extracti

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** The move itself is faithful - a multiset line-diff of the old 1,288-line worker/index.ts against index.ts+utils.ts+types.ts+routes/*+middleware/* at 77551b95 shows the only new lines are function signatures and dispatch calls, and the only removed lines are declarations that gained `export`. That last part is the problem: helpers that were deliberately private are now public with zero consumers. Old `function sanitizeDiscordText` (v0.9.11, commit 84ae0286 `packages/app/src/worker/index.ts:292`) -> `export function sanitizeDiscordText` (routes/discord.ts:15); `function buildDiscordContent` (old:303) -> export (discord.ts:26); `async function stageCommunityShowcase` (old:411) -> export (discord.ts:80); `function parseSequence` (old:196) -> export (routes/gallery.ts:85); `async function injectMeta` (old:618) -> export (routes/og.ts:78); `const baseHandler` (old:653) -> `export const baseHandler` (`worker/index.ts:13`). A repo-wide scan for references outside the defining file found 24 such exports unused: 6 in discord.ts, 9 in gallery.ts (incl. the GALLERY_*_COLUMNS / LEGACY_* / MISSING_* SQL fragments and withGalleryColumnsFallback), 3 in og.ts, 4 in securityHeaders.ts, REVIEW_HOST, and baseHandler. gallery.ts exports 15 symbols of which only 6 are consumed. The same pattern is in the command registry: commands/builtins/flame/helpers.ts:40 MAX_PALETTE_ENTRIES, :319 MAX_SYMMETRY_FOLDS and SymmetryControlOrigin are exported (and re-exported again through flame/index.ts `export * from './helpers'` and the flame.ts shim) with no consumer.

**How it fails.** The SQL column-list constants and withGalleryColumnsFallback are now part of the module's public surface, so a future edit cannot rely on 'only this file uses it' and the D1 fallback query strings can be reused from a route that has different column expectations. More immediately, no unused-export tooling can distinguish these from real API, so genuinely dead code (e.g. og.ts's resolveOgCard/buildMetaTags if handleMetaInject is ever rewritten) will never be reported.

**Repro.** Not reproducible as a failure. Verifiable as stated: for each symbol, `grep -rn '\bsanitizeDiscordText\b' packages | grep -v routes/discord.ts` returns nothing, while `grep -n sanitizeDiscordText packages/app/src/worker/routes/discord.ts` returns the definition at :15 and four call sites at :119-122.

**Suggested fix.** Drop `export` from every helper that has no cross-module consumer (keep only the handleX/checkX/withX entry points plus what index.test.ts actually imports), and export the constants from types.ts if two routes really need them.

### The "pure" core package contains a TypeGPU shader function and pulls typegpu into the Cloudflare Worker's import graph

`packages/core/src/math/affineTransform.ts:30` — **low** · refactor-quality · introduced by #73 (5747de32) · lens: Benchmark lab, command registry, @chaos-master/core extracti

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** core/src/math/affineTransform.ts:1-2 imports `{ tgpu }` from 'typegpu' and `{ f32, struct, vec2f }` from 'typegpu/data', and line 30 defines `export const transformAffine = tgpu.fn([AffineParams, vec2f], vec2f)((T, p) => ...)` - a WGSL-generating shader function evaluated at module scope. Same in `core/src/math/affineTransform3D.ts:1-2` (`tgpu`), plus a `typegpu/data` type import in utils/schemaUtil.ts. `typegpu: 0.12.0` is a runtime `dependency` in packages/core/package.json. core/src/index.ts:3-4 re-exports both modules, and packages/app/src/worker/routes/discord.ts:1 does `import { tryValidateFlame, tryValidateTimelineSnapshot } from '@chaos-master/core'` - i.e. the barrel - while packages/app/wrangler.jsonc:32 points `main` straight at src/worker/index.ts. The strategy's target topology puts Core strictly beneath Renderer ("Core --> Renderer", "Pure TS: Schemas, Math, XML, Diff") and Phase 5 asks for a layer the worker and CLI can import cleanly. Core is DOM-free and Solid-free (verified: no globalThis/navigator/document/solid-js anywhere in packages/core/src), but it is not GPU-free. Honest caveat: the pre-refactor worker imported @/flame/schema/flameSchema, which already reached the app's affineTranform.ts and therefore typegpu, so this is an unfixed boundary rather than a new regression.

**How it fails.** A workerd deploy evaluates tgpu.fn shader-builder code at cold start for a runtime that has no GPU, and any future typegpu major that touches module-load behaviour (or drops a workerd-incompatible global) breaks the share/OG/gallery endpoints even though none of them render anything. It also blocks the stated goal of extracting @chaos-master/worker, since the worker cannot depend on core without depending on the renderer stack.

**Repro.** Not reproducible as a failure — workerd evaluates the tgpu.fn builder fine. Verifiable: `git show v0.9.11:packages/app/src/worker/index.ts | head -1` shows the old worker already importing the app schema that pulls in typegpu, so a before/after bundle comparison shows no new dependency.

**Suggested fix.** Split the WGSL half out: keep AffineParamsSchema (valibot) in core and move `AffineParams` (the typegpu struct) and `transformAffine`/`transformAffine3D` into the app/renderer layer, or into a `@chaos-master/core/gpu` subpath that the barrel does not re-export, so `import { tryValidateFlame } from '@chaos-master/core'` cannot reach typegpu.

### The BenchmarksPage "decomposition" created no module boundary: 2,868 -> 2,800 lines, every new subcomponent in the same file

`packages/app/src/pages/Benchmarks/BenchmarksPage.tsx:529` — **low** · refactor-quality · introduced by #83 (a5c2f26f) · lens: Benchmark lab, command registry, @chaos-master/core extracti

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** a5c2f26f's message says "Decompose BenchmarksPage into modular SolidJS subcomponents" and the stat line reads 1442 changed lines. The four extracted components - BenchmarkHeader (:529), BenchmarkHero (:577), CompletedRunCard (:613), BenchmarkHistoryList (:877), BenchmarkRunSection (:938) - were all defined in BenchmarksPage.tsx itself. Measured: `git show a5c2f26f^:...BenchmarksPage.tsx | wc -l` = 2868, current file = 2800. Net effect on the file the strategy calls out by name is -68 lines. By contrast the same commit did create real modules for the non-JSX logic (benchmarkResultBuilder.ts 129 lines, benchmarkRunnerUtils.ts 152 lines), and those extractions are clean - a token-level diff of the old inline result card against CompletedRunCard shows only Prettier reflow and dropped trailing commas, and the run-section props conversion is a correct De Morgan transform (old `disabled={!running() && (gpuStatus()!=='ready' || sources===0 || (custom && !compatible))}` -> `canRun={running() || (ready && count>0 && (!custom || compatible))}` with `disabled={!props.canRun}`).

**How it fails.** No runtime failure. The stated goal - the file being tractable to edit, and the components being reusable/testable - is unmet: BenchmarksPage.tsx is still the second-largest .tsx in the app, none of the five components can be imported or unit-tested from outside, and HMR still reloads the whole 2,800-line module on any edit.

**Repro.** `git show a5c2f26f^:packages/app/src/pages/Benchmarks/BenchmarksPage.tsx | wc -l` → 2868; `wc -l packages/app/src/pages/Benchmarks/BenchmarksPage.tsx` → 2800. `grep -rn 'BenchmarkRunSection\|CompletedRunCard' packages/app/src | grep -v BenchmarksPage.tsx` returns nothing — no external importer, and nothing to unit-test against.

**Suggested fix.** Move the five components into packages/app/src/pages/Benchmarks/components/*.tsx (they take plain readonly props and have no closure over page state - BenchmarkHeader, BenchmarkHero, BenchmarkHistoryList and BenchmarkRunSection move verbatim; CompletedRunCard needs only formatRate/formatCount/formatSignedPercent/correctnessLabel/BENCHMARK_DIAL imported alongside).

### benchmarkRunnerUtils.ts - the extracted sample-record and schedule logic - has no tests, though the commit claims comprehensive coverage

`packages/app/src/pages/Benchmarks/benchmarkRunnerUtils.ts:127` — **low** · test-gap · introduced by #83 (a5c2f26f) · lens: Benchmark lab, command registry, @chaos-master/core extracti

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** a5c2f26f's message says "Add comprehensive Vitest unit tests in benchmarkResultBuilder.test.ts" and it does: 353 lines covering signatureLooksRendered, evaluateComparisonSignatures, buildBenchmarkDeviceReport, resolveBenchmarkMetadata and buildBenchmarkResult, and I verified that builder is a faithful move of the old inline buildResult. The other extracted file got nothing - `ls packages/app/src/pages/Benchmarks/ | grep test` returns only benchmarkResultBuilder.test.ts. benchmarkRunnerUtils.ts holds the four functions closest to the measurement contract: createBenchmarkSampleRecord (:127) stamps schemaVersion, phase/pairIndex/orderInPair, `timingMode: 'queue-fenced-wall-clock'`, elapsedMs, completedWork and throughput onto every sample; createBenchmarkScheduleForRuntimes (:81) chooses balanced-pair vs single-candidate scheduling off `runtimes.length === 2`; buildBenchmarkCompilationRecords (:104) attributes compilation time with `customLabEnabled && index === 1`; validateBenchmarkRunPreconditions (:23) gates the run. All four are pure and take plain data.

**How it fails.** A later edit swaps createBenchmarkSampleRecord's `completedWork: params.points` and `throughput: params.pointsPerSecond`, or flips orderInPair, and every gate stays green: the app's suite never calls the function, and buildBenchmarkResult's tests feed it hand-built samples. The lab then publishes and exports statistically well-formed results measuring the wrong quantity - exactly the failure mode a benchmark must not have.

**Repro.** Swap lines 144-145 of packages/app/src/pages/Benchmarks/benchmarkRunnerUtils.ts and run a benchmark: buildBenchmarkResult returns `status: 'invalid'` with a `metric-mismatch` issue on every sample, because validation.ts:560 computes |throughput - completedWork/(elapsedMs/1000)| / derived > 0.005. The result is visibly rejected in the lab UI, not silently published. `ls packages/app/src/pages/Benchmarks/*.test.ts` confirms the missing file.

**Suggested fix.** Add benchmarkRunnerUtils.test.ts: a table test over validateBenchmarkRunPreconditions' five branches, an assertion that createBenchmarkScheduleForRuntimes picks createBalancedComparisonSchedule at exactly length 2 and passes warmupPairs/measuredPairs through unswapped, and a round-trip asserting createBenchmarkSampleRecord copies entry.sequence/phase/pairIndex/orderInPair/blockOrder and points->completedWork / pointsPerSecond->throughput.

### A very dark background channel exports as 1 and re-imports at full intensity

`packages/app/src/flame/flameXml.ts:872` — **low** · correctness · introduced by pre-v0.9.11 · lens: stage 2 characterization net and export verification

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** Export rounds each background channel to 0-255 (flameXml.ts:872); import reads any channel of 1 or less as the 0-1 scale (flameXml.ts:470).

**How it fails.** backgroundColor [0.004, 0, 0] exports as "1 0 0" and re-imports as [1, 0, 0]: a near-black background becomes pure red. Channels that are not a multiple of 1/255 are also quantized (0.1 -> 0.10196).

**Suggested fix.** Decide the scale per colour, not per channel, or export 0-1 floats and read them back as such.

### Exposure is rounded to a whole flam3 brightness step on export

`packages/app/src/flame/flameXml.ts:866` — **low** · data-loss · introduced by pre-v0.9.11 · lens: stage 2 characterization net and export verification

**Now:** open. See [Status on main](#status-on-main).

**Evidence.** brightness = round(2 ** (exposure / 1.5)) (flameXml.ts:866); import maps it back with log2(brightness) * 1.5.

**How it fails.** An exposure of 1.0 exports as brightness 2 and re-imports as 1.5.

**Suggested fix.** Write brightness with decimals; flam3 readers accept floats.


---

## Refuted — do not re-report

### The built-in 'chaos-morph' wiring preset targets variation type 'linear', which no variation in the registry is called

`packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx:327` — raised as medium, **refuted**.

**Now:** still refuted. See [Status on main](#status-on-main).

**Why it is not a defect.** The typo is real; the bug is unreachable, because the entire DEFAULT_PRESETS table is dead code.

AudioWiringModal.tsx:526 is `const presets = () => props.presets ?? DEFAULT_PRESETS`. `presets` is optional on the prop type (line 480) - but the component has exactly one instantiation in the whole tree, AudioReactivePanel.tsx:1238-1252, and it ALWAYS passes `presets={wiringPresets()}`. wiringPresets (AudioReactivePanel.tsx:541-550) is a createMemo that builds `{...RENDER_PRESETS}` plus the flame presets and returns an object unconditionally - it can never be undefined. There is no AudioWiringModal test file and no other caller (grep for 'AudioWiringModal' outside its own directory returns only that one import + one JSX site). So `props.presets ?? DEFAULT_PRESETS` never takes the right branch, and the preset list the user actually sees (rendered from presets() at line 1176, selected at 1332

### Documentation gallery's GPU cost cap was deleted with its justifying comment, raising each of ~148 live previews to 8.4x the pixels at ultra-tier quality

`packages/app/src/components/DocumentationModal/VariationDocsTab.tsx:128` — raised as medium, **refuted**.

**Now:** still refuted. See [Status on main](#status-on-main).

**Why it is not a defect.** The diff is quoted accurately (I read `git show 220f836f -- .../VariationDocsTab.tsx`: PREVIEW_TIER_CAP='mid', PREVIEW_RESOLUTION 160x110 and capPreviewTier were removed; VariationDocsTab.tsx:40-48 and :128-133 replaced them), but the failure scenario is materially wrong and the framing does not survive the surrounding code. (a) 'each of ~148 live previews allocates a 384x264 WebGPU canvas' is false. VariationSelector.tsx:258-263 gates mounting on `allowed() || settledVisible() || renderStatus()==='done'`, and settledVisible (:203) requires the tile to be on-screen and not mid-scroll; off-screen tiles never allocate anything. Concurrency on top of that is COMPUTE_GATE_CAPACITY = 2 (defaults.ts:131-133) with computeGatePriority returning 0 for not-visible or done (ComputeGateContext.tsx:11-15). VariationSelector.tsx:265-299 snapshots to a static poster and unmounts the canvas. The file's 

### ArenaOverlay registers arena.startClash/gameState on mount and never unregisters them, so a re-opened arena runs the disposed instance and leaves the staged clash in the user's document

`packages/app/src/components/ArenaOverlay.tsx:835` — raised as high, **refuted**.

**Now:** still refuted. See [Status on main](#status-on-main).

**Why it is not a defect.** The facts about the code are right; the causal claim is wrong.

True: `ArenaOverlay.tsx:832-851` mutates the shared context (`props.arena.gameState = gameState` at 834, `props.arena.startClash = ...` at 835) and `onCleanup` at 853-856 only does `clearAllTimers()` + `restoreWorkspace()`, never restoring the previous values. `runSimulation` does hard-code `rounds: 3` at 889 and does stage the clash into the live document via `animateClash.execute` at 902-911, setting `wasClashStaged = true` at 912.

False: the assertion that `arena.setOpen(true)` in `arenaStartClash.ts:80-82` "cannot mount instance #2 before the `await arena.startClash(...)` on line 92 in the same tick." `showArena` is a plain `createSignal(false)` (`hooks/useWorkspaceArena.ts:27`), passed as `showArena={showArena}` and `arena={cmdContext.arena!}` (`MainWorkspace.tsx:4122-4123`). Calling a Solid setter from outside any bat

### Export driver's 2s fence timeout abandons the pending submission and submits the next chunk anyway, breaking its own one-chunk-in-flight invariant

`packages/app/src/flame/renderDrivers/createExportRenderDriver.ts:21` — raised as medium, **refuted**.

**Now:** still refuted. See [Status on main](#status-on-main).

**Why it is not a defect.** The mechanical description is accurate but the defect it is built on does not hold, and half the cited evidence is refuted by the code's own design.

What is true: createExportRenderDriver.ts:14-43 races the fence against a 2000 ms setTimeout (renderDriverTypes.ts:11) and resolves on timeout; v0.9.11 (commit 84ae0286 Flam3.tsx:1376-1381) did `try { await latestQueueFence } catch { break }`; the gpuReady check is at createExportRenderDriver.ts:210-212, before the await at :214; the docblock at :136-137 still claims 'at most one chunk is in flight'.

What is refuted:
1. 'Swallows rejection and continues instead of breaking' is not a defect. The rationale is written at :27-31 and it is correct: the createEffect at :150 reads `options.gpuReady()` inside its tracking scope, so a genuine device loss re-runs the effect, fires onCleanup at :153-156 (disposed = true) and ends the loop. Independently, Flam3's valid

### Core imports the whole valibot namespace, bypassing the app's deliberately curated @/valibot re-export

`packages/core/src/schema/flameSchema.ts:1` — raised as medium, **refuted**.

**Now:** still refuted. See [Status on main](#status-on-main).

**Why it is not a defect.** The observations are accurate — packages/app/src/valibot.ts opens with 'We re-export only things we use to keep the bundle small', 23 app files import from '@/valibot', the only `from 'valibot'` in packages/app/src is valibot.ts itself, and all eight core schema/math modules import valibot directly. But none of that adds up to a defect.

Core is a separate published package with its own `valibot: 1.2.0` dependency. It cannot import `@/valibot` — that is a Vite path alias for packages/app/src, and honouring it would make core depend on the app, inverting the exact layering the extraction existed to establish. The finder's suggested fix concedes this by proposing the barrel move into core, which is a refactor preference, not a bug report.

The stated harm does not exist either. Both packages pin valibot 1.2.0 and `readlink -f packages/app/node_modules/valibot packages/core/node_modules/val


---

## Reported, low severity, not independently verified

Rated low by the finder and so never put through refutation. Check before acting.

- `packages/app/src/utils/timeline.ts:1913` — applyTransformField dropped the parts.length guards the original path dispatch had, so over-long transform paths now write where they used to be ignored _(behaviour-change, #80)_ **Now:** open.
- `packages/core/src/schema/timeline.ts:259` — Two TimelineConfig defaults with different shapes are aliased to the same identifier in the same codebase _(duplication, #73)_ **Now:** open.
- `packages/app/src/utils/timeline.ts:1760` — applyTracksToFlame's decomposition threads (trackMap, frame, loop) through every helper and all ~34 call sites, trading one readable closure for positional-argument noise _(refactor-quality, #80)_ **Now:** open (readability).
- `packages/app/src/components/AudioWiringModal/AudioWiringModal.tsx:862` — Escape now clears both drag signals where it used to clear only the one that was active _(behaviour-change, #82)_ **Now:** refuted on reading.
- `packages/app/src/hooks/useWorkspaceTimelineBinding.ts:159` — Extracted variation getter now returns a paramDefault where the original returned null for a partially-populated params record _(behaviour-change, #78 (88070311))_ **Now:** open.
- `packages/app/src/hooks/useWorkspaceArtDirector.tsx:19` — The hardware-tier reactivity fix papers over the pattern rather than removing it — the param still accepts a raw value and other hooks still capture props eagerly _(reactivity, #78 fix commit c643fa86)_ **Now:** open (latent).
- `packages/app/src/components/TouchSurface/types.ts:12` — Seven props are declared, forwarded by both parents, and read by none of TouchControlSurface _(dead-code, #77)_ **Now:** open; #112 (`bf7744ad`) removed `onSnapshot`.
- `packages/app/src/components/TouchSurface/TouchControlSurface.tsx:348` — Touch gallery builds a shared IntersectionObserver, then lets every mounted preview create a second one _(duplication, #77)_ **Now:** open.
- `packages/app/src/components/ExportJobs/ExportJobTracker.tsx:36` — ExportJobTracker's requestAnimationFrame is never cancelled, so a stale toast offset is re-applied after the last job finishes _(memory-leak, #77)_ **Now:** open.
- `packages/app/src/components/TouchSurface/TouchHUD.tsx:56` — Two touch components fall back to dispatching 'flame.quickExport', which is not a registered command _(correctness, #77)_ **Now:** fixed, #95 (`65aecfb2`) and #110 (`18b44918`).
- `packages/app/src/components/ArenaOverlay.tsx:125` — getVictorImage returns promises with no timeout, so a stalled image leaves the champion-card export button permanently in its exporting state _(error-handling, #76 (84a3315b))_ **Now:** fixed, #90 (`b940415b`).
- `packages/app/src/arcade/bundledTracks.ts:38` — getBundledTrack and fetchBundledTrackBuffer have no callers, and public/audio/tracks.json duplicates the same manifest with no reader _(dead-code, #75 (60361cd5))_ **Now:** open; #90 (`f1b74bb9`) gave `fetchBundledTrackBuffer` its caller.
- `packages/app/src/components/ArenaOverlay.tsx:834` — props.arena.gameState is written on mount but read by nothing _(dead-code, #76 (84a3315b))_ **Now:** open.
- `packages/app/src/webmcp/tools/randomizeFlame.ts:78` — The Phase 9 decomposition produced two byte-identical resolveSeed helpers and left two copies of mulberry32 _(duplication, #81 (30dcb934))_ **Now:** open.
- `packages/app/src/webmcp/tools/simulateClash.ts:201` — parseSimulateClashInput, the validation seam Phase 9 introduced, leaves rounds/separation unbounded on an agent-callable synchronous tool _(error-handling, #81 (30dcb934))_ **Now:** open.
- `packages/app/src/utils/animationExport.ts:243` — Motion-blur sub-frames past the quality limit contribute zero samples, collapsing 8x/16x blur to a few effective sub-frames _(correctness, #? (commit 94a6241c, Phase 6.2))_ **Now:** fixed, #91 (`26348360`, `7b1aee27`).
- `packages/app/src/utils/animationExport.ts:39` — shutterAngle is declared on two public config types but no caller ever sets it _(dead-code, #? (commit 94a6241c))_ **Now:** fixed, #91 (`98f80d64`).
- `packages/app/src/recorder/focus.ts:470` — focusHintFor's new lookup table resolves inherited Object.prototype keys, so a non-registry command id can return a function typed as string _(type-safety, #83 (commit d3d249b6))_ **Now:** open.
- `packages/app/src/flame/renderDrivers/renderDrivers.test.ts:77` — The extracted export loop has zero test coverage; the driver test never enables the driver _(test-gap, #78 (38130d81) / e5a60c52)_ **Now:** open.
- `packages/app/src/flame/renderDrivers/createInteractiveRenderDriver.ts:53` — The WebKit present pump's five-clause gate lost the comment explaining why each clause exists, including the counter-intuitive isExportRenderer term _(refactor-quality, #78 (commit 38130d81))_ **Now:** open.
- `packages/app/src/pages/Benchmarks/BenchmarksPage.tsx:614` — CompletedRunCard captures props.run into a local at component setup _(reactivity, #83 (a5c2f26f))_ **Now:** open.


---

## What the verifiers said the hunters missed

**Skeptic / refutation pass on the "Timeline engine and audio .** Five things in this area the finder should have caught.

1. DEFAULT_PRESETS is 319 lines of dead code, and they were reading inside it. AudioWiringModal.tsx:41-359 is never evaluated: line 526 is `props.presets ?? DEFAULT_PRESETS`, and the component's sole instantiation (AudioReactivePanel.tsx:1238-1252) always passes `presets={wiringPresets()}`, a createMemo (AudioReactivePanel.tsx:541-550) that unconditionally returns an object. There is no test file for the modal and no second caller. The finder stopped at one wrong string literal on line 327 and filed a correctness bug, when the finding sitting under their cursor was ~7% of a 48KB component being unreachable - exactly what the audit brief asks for under "modules extracted but never imported / re-exported barrels nothing consumes".

2. They never read doConnect, which is the function that decides whether finding #1 is reachable. AudioWiringModal.tsx:638-650 filters `next` by flameTargetKey before pushing, so the modal cannot hold two mappings with the same key and the finder's entire hand-wiring repro is dead on arrival. The reach

**Skeptic / refutation pass on "MainWorkspace decomposition an.** Five things the finder should have caught, all in files they demonstrably read:

1. A SECOND behaviour break inside the very function their finding 1 is about, and it is the same class of defect. packages/app/src/hooks/useWorkspaceTimelineBinding.ts:158-171 turned an `else if` into two sequential `if`s. Original (MainWorkspace.tsx at 88070311^:3319-3334): `if (variation.params) { const val = variation.params[paramName]; if (val !== undefined) return val } else if (isAnyParametricVariationType(variation.type)) { ...paramDefaults... }`. Current: `if (variation.params && variation.params[paramName] !== undefined) return ...` followed by an UNGUARDED `if (isAnyParametricVariationType(variation.type)) { ...paramDefaults... }`. So a parametric variation whose `params` object exists but lacks `paramName` used to fall through and return `null`; it now returns the schema default. That matters because utils/timeline.ts:1517-1518 (`const value = valueResolverFn(path); if (value !== null) writes.push(...)`) treats `null` as "skip this path" -- the refactor silently converts "do not create a keyf

**Skeptical re-audit of PRs #77/#79.** Five things in this exact area that the finder walked past.

(1) THE REAL VERSION OF FINDING #4, and it is in the mobile PR. packages/app/src/components/TouchSurface/TouchControlSurface.tsx:348-353 renders `<VariationPreview version={1} isSelected={active()} name={varType} flame={f} />` with NO `hardwareTier` and NO `resolution`. Both omissions take the worst branch: VariationSelector.tsx:181 is `props.hardwareTier ? hardwareTierToQuality[props.hardwareTier] : 0.99`, so every touch tile chases the ULTRA quality target and :213 gives `doneAt = Math.min(0.98, 0.99) = 0.98`; and VariationSelector.tsx:342 falls back to `props.resolution ?? { width: 256, height: 144 }` = 36,864 px per tile. TouchControlSurface.tsx:135-140 slices the gallery to 36 tiles. So the phone gallery — the weakest hardware in the product, and the whole point of PR #77 — runs each tile at a higher pixel count AND a higher convergence target than the docs tab's low tier (192x132, quality 0.75) that the finder attacked. The docs tab at least threads a tier through; the touch gallery threads nothing. Fixing this is one

**Skeptical re-review of "Recorder, replay, export loop and re.** The finder's scope explicitly named packages/app/src/recorder/ (recorder.ts, replayVideo.ts, focus.ts, schema.ts, snapshotOrigin.ts) and produced zero findings there, while the largest behavioural diff in the whole scope lives in focus.ts (+189/-144 in d3d249b6). It contains a real, reachable crash that the refactor introduced.

1. HIGH - Prototype-chain lookup crash in packages/app/src/recorder/focus.ts:174 / :470. d3d249b6 replaced the old exhaustive `switch (commandId) { ... default: return undefined }` (v0.9.11, commit 84ae0286 focus.ts:181-437) with `const STATIC_COMMAND_HINTS: Readonly<Record<string, string>> = Object.freeze({ ... })` at :174 and a bare index lookup at :470-473: `const staticHint = STATIC_COMMAND_HINTS[commandId]; if (staticHint !== undefined) return staticHint`. Object.freeze on an object literal leaves Object.prototype in the chain, so `STATIC_COMMAND_HINTS['constructor']` returns the Object constructor and `['toString']`, `['valueOf']`, `['hasOwnProperty']`, `['isPrototypeOf']`, `['propertyIsEnumerable']`, `['toLocaleString']` all return functions — never undefined — and eac

**Skeptic / refutation pass over "Arcade modes.** Six things in this area that the finder had in front of them and did not report.

1. `packages/app/src/webmcp/tools/openArtDirector.ts` is a one-line dead barrel: `export { directorPropose, openArtDirector } from './arcadeDirector'`. Nothing imports it — `tools/index.ts:11` imports both symbols directly from `./arcadeDirector`, and a repo-wide grep for `openArtDirector` finds no importer of this path. This is exactly the "re-exported barrels nothing consumes" category the decomposition was supposed to avoid.

2. Dead exports plus ~1.9 MB of dead payload in the Beats feature. The finder used "fetchBundledTrackBuffer has zero callers" as evidence for finding #1 but never named it as a defect in its own right: `arcade/bundledTracks.ts:38` (`getBundledTrack`) and `:42` (`fetchBundledTrackBuffer`) are both uncalled, and `packages/app/public/audio/` ships `ember-drift.wav` (1.0 MB), `cyber-pulse.wav` (861 KB) and `tracks.json` (512 B) that no source file references. Coverage bears it out — `coverage-audit/coverage-summary.json` reports bundledTracks.ts at 0% function coverage.

3. `ArenaOv

**Skeptical re-review of PRs #73/#83 — @chaos-master/core extr.** Five things in this area the finder should have caught.

1. **The worker decomposition dropped 74% of its comments, and the finder's method could not see it.** They assert "the only new lines are function signatures and dispatch calls, and the only removed lines are declarations that gained `export`." That is false. I counted comment lines in `v0.9.11:packages/app/src/worker/index.ts` against the whole post-split tree (index.ts + types.ts + utils.ts + routes/* + middleware/*, excluding tests): 261 comment lines before, 140 after, 193 distinct comment lines lost. Two of the losses are cross-file invariants that now exist nowhere: `packages/app/src/worker/types.ts:36` `GALLERY_SECTIONS` lost "Mirrors the CHECK constraint in migrations/0001_gallery_content.sql — keep the two in step", and `packages/app/src/worker/routes/gallery.ts:5` `MISSING_TABLE` lost the paragraph explaining that the same regex lives in `scripts/gallery-targets.mjs` and is what decides whether the deploy tooling offers to run migrations. In a repo whose comments carry this much operational knowledge, that is a bigge

---

<!-- cite-check: live -->

## Found after the audit

### A flame picked from a dialog stayed hidden behind the previous one on iOS until the canvas was touched

`packages/app/src/lib/viewTransition.ts:36` (`isAppleWebKit`) — **high** · correctness · reported by maff from the TestFlight app, 2026-09-23 · present since `8e026b9e` (2025-05) and in `mobile-v0.9.12` · lens: device report, WebKit source and a real-GPU emulator

**Now:** fixed in #122 (`a37f4b88`, `14545b77`) and #131 (`9895189f`). See [Status on main](#status-on-main).

**Evidence.** Closing any dialog ran a root view transition (`Modal.tsx:101-110` (`respond`)). While one runs, WebKit snapshots the page on every frame, and painting a WebGPU canvas into a snapshot presents its swap chain without choosing what the canvas displays (GPUCanvasContextCocoa::surfaceBufferToImageBuffer, WebKit `49480340a1`, the code in Safari 26 and iOS 26); the display preparation after the frame presents once more. The renderer and the WebKit present pump stop at the quality limit, which a phone reaches inside the 250 ms fade, so nothing presented after it.

**How it fails.** On iOS, in the app and in Safari, a flame picked in Load Flame, Recents or the gallery flickered during the fade, then left the previous flame, or a buffer never drawn, on screen until a touch on the canvas drew again. Chrome and Android never showed it.

**Verification.** `viewTransitionPresent.test.tsx` drives the real Modal and render driver against a model of WebKit's canvas presentation and frame order, and an emulator of the same ran on production builds in real-GPU Chrome. Before #122 the pick ended on the previous flame, or at the high preset on a buffer never drawn. After #122 it ended on the new one, with 16 or 17 snapshot presents during the fade. After #131 no view transition runs on Apple WebKit (`utils/platform.test.ts` covers iOS and macOS Safari and the iOS app's WKWebView), and the pick, the sidebar toggle and the theme switch land with no snapshot and no stale buffer.

**Suggested fix.** Fixed in #122, which presents once after each view transition ends, and #131, which runs none on Apple WebKit.
