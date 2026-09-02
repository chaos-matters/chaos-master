import '@/commands/builtins'
import { batch, createEffect, createMemo, createSignal, ErrorBoundary, For, onCleanup, onMount, Show, Suspense, untrack, } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { Dynamic } from 'solid-js/web'
import { vec2f, vec3f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { executeCommand, executeReplayCommand, preflightReplayCommand, } from '@/commands/registry'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useToast } from '@/contexts/ToastContext'
import { setActiveTab, workspaceIsVisible } from '@/lib/activeTab'
import { trackAppInit } from '@/lib/telemetry'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import { useShortcutManager } from '@/shortcuts'
import { createDragHandler } from '@/utils/createDragHandler'
import { recordEntries, recordKeys } from '@/utils/record'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import ui from './App.module.css'
import { AffineEditor } from './components/AffineEditor/AffineEditor'
import { AncestryTreeModal } from './components/AncestryTreeModal/AncestryTreeModal'
import { ArenaOverlay } from './components/ArenaOverlay'
import { AudioReactivePanel } from './components/AudioReactivePanel/AudioReactivePanel'
import { createShowBenchmark } from './components/BenchmarkModal/BenchmarkModal'
import { BlendFlameGallery } from './components/BlendFlameGallery/BlendFlameGallery'
import { BreedGallery } from './components/BreedGallery/BreedGallery'
import { Button } from './components/Button/Button'
import { Checkbox } from './components/Checkbox/Checkbox'
import { CollapsibleCard } from './components/CollapsibleCard/CollapsibleCard'
import { ColorPicker } from './components/ColorPicker/ColorPicker'
import { Card } from './components/ControlCard/ControlCard'
import { ConfirmDeleteVariationModal } from './components/CustomVariationEditor/ConfirmDeleteVariationModal'
import { createShowCustomVariationEditor } from './components/CustomVariationEditor/CustomVariationEditor'
import { DebugOverlay } from './components/DebugOverlay'
import { DiceButton } from './components/DiceButton/DiceButton'
import { DiffViewContent, DiffViewModal, } from './components/DiffViewModal/DiffViewModal'
import diffUi from './components/DiffViewModal/DiffViewModal.module.css'
import { DirectorOverlay } from './components/DirectorOverlay'
import { createDiscordShareModal } from './components/DiscordShareModal/DiscordShareModal'
import { createShowDocumentation } from './components/DocumentationModal/DocumentationModal'
import { Dropzone } from './components/Dropzone/Dropzone'
import { EvolutionChamber } from './components/EvolutionChamber/EvolutionChamber'
import { ExportActions } from './components/ExportJobs/ExportActions'
import { ExportJobHost } from './components/ExportJobs/ExportJobHost'
import { ExportJobTracker } from './components/ExportJobs/ExportJobTracker'
import { createExportPngDialog } from './components/ExportPngDialog/ExportPngDialog'
import { ColorEditor } from './components/FlameColorEditor/ColorEditor'
import { handleColor } from './components/FlameColorEditor/FlameColorEditor'
import { FlameRandomizerCard } from './components/FlameRandomizerCard/FlameRandomizerCard'
import { FloatingActions } from './components/FloatingActions/FloatingActions'
import { createShowHelp } from './components/HelpModal/HelpModal'
import { createImportVariationsModal } from './components/ImportVariationsModal/ImportVariationsModal'
import { ConfirmOverwriteRecentModal } from './components/LoadFlameModal/ConfirmOverwriteRecentModal'
import { createLoadFlame } from './components/LoadFlameModal/LoadFlameModal'
import { createLogoFaviconGenerator } from './components/LogoFaviconGenerator/LogoFaviconGenerator'
import { createMigrationModal } from './components/Migration/Migration'
import { useRequestModal } from './components/Modal/ModalContext'
import { OrientationGizmo } from './components/OrientationGizmo/OrientationGizmo'
import { PaletteSelector } from './components/PaletteSelector/PaletteSelector'
import { PopulationSimulator } from './components/PopulationSimulator/PopulationSimulator'
import { ProgressBar } from './components/ProgressBar/ProgressBar'
import { getPresetFromQuality, qualityPresets, } from './components/Quality/QualityPresets'
import { QuickVariationPicker } from './components/QuickVariationPicker/QuickVariationPicker'
import { recorderExportPending, recorderTaskPending, recorderVisible, } from './components/SessionRecorder/recorderUi'
import { SessionRecorderDock } from './components/SessionRecorder/SessionRecorderDock'
import { createShareLinkModal } from './components/ShareLinkModal/ShareLinkModal'
import { createShareVariationLinkModal, createShareVariationLoadModal, } from './components/ShareVariationModal/ShareVariationModal'
import { AngleEditor } from './components/Sliders/ParametricEditors/AngleEditor'
import { ScrubInput } from './components/Sliders/ScrubInput'
import { Slider } from './components/Sliders/Slider'
import { SoftwareVersion } from './components/SoftwareVersion/SoftwareVersion'
import { SonificationPanel } from './components/SonificationPanel/SonificationPanel'
import { SpotlightTour } from './components/SpotlightTour/SpotlightTour'
import { KeyframeDiamond } from './components/Timeline/KeyframeDiamond'
import { smartRandomAnimation } from './components/Timeline/presets'
import { TimelineSection } from './components/Timeline/TimelineSection'
import { createVariationSelector } from './components/VariationSelector/VariationSelector'
import { ViewControls } from './components/ViewControls/ViewControls'
import { ChangeHistoryContextProvider } from './contexts/ChangeHistoryContext'
import { useCompactMode } from './contexts/CompactModeContext'
import { useTheme } from './contexts/ThemeContext'
import { TimelineContextProvider } from './contexts/TimelineContext'
import { DEFAULT_POINT_COUNT, DEFAULT_QUALITY, DEFAULT_RENDER_INTERVAL_MS, DEFAULT_RESOLUTION, IS_DEV, } from './defaults'
import { breedFlames } from './flame/breedFlame'
import { colorInitModeToImplFn } from './flame/colorInitMode'
import { drawModeToImplFn } from './flame/drawMode'
import { example1 } from './flame/examples/example1'
import { example34 } from './flame/examples/example34'
import { initExample } from './flame/examples/initExample'
import { initExample3D } from './flame/examples/initExample3D'
import { tid as toTransformId, vid as toVariationId, } from './flame/examples/util'
import { Flam3 } from './flame/Flam3'
import { newDefaultTransform } from './flame/newTransform'
import { pointInitModeToImplFn } from './flame/pointInitMode'
import { pointInitMode3DToImplFn } from './flame/pointInitMode3D'
import { generateRandomFlame, mutateFlame, random01, randomizeAllColors, randomizeVariationParams, randomRange, } from './flame/randomize'
import { accumulatedPointCount, animationExportCancel, animationExportProgress, animationExportRunning, cameraDuringExportEnabled, exportQuality, qualityPointCountLimit, setCurrentQuality, setExportQuality, setForceAnimationExportNow, setQualityPointCountLimit, } from './flame/renderStats'
import { MAX_CAMERA_ZOOM_VALUE, MIN_CAMERA_ZOOM_VALUE, tryValidateFlame, } from './flame/schema/flameSchema'
import { generateTransformId, generateVariationId, } from './flame/transformFunction'
import { allTransformVariations, isAnyParametricVariationType, isVariationType, } from './flame/variations'
import { deleteCustomVariation, duplicateCustomVariation, getCustomVariations, isCustomVariationRegistered, loadCustomVariations, persistSharedVariations, restoreCustomVariation, } from './flame/variations/custom'
import { getNormalizedVariationName, getParamsEditor, getVariationDefault, } from './flame/variations/utils'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BoxArrowRight, Cross, Eye, EyeOff, Menu, Plus, Share, Shuffle, Terminal, } from './icons'
import { AutoCanvas } from './lib/AutoCanvas'
import { affineFocusId, transformColorRandomizeFocusId, transformFocusId, transformVisibilityFocusId, variationParamsFocusId, variationRandomizeFocusId, variationTypeFocusId, variationVisibilityFocusId, } from './recorder/focusIds'
import { breakRecordingCoalescing, cancelSessionRecording, invalidateLastFinishedSession, isSessionRecording, notePreviewStarted, recordedActionCount, recordSyntheticAction, reportDerivedWorkspaceWrite, reportDocumentWrite, reportTimelineTransport, reportUnreplayable, reportUnreplayableOnce, startSessionRecording, stopSessionRecording, withRecordingSuppressed, } from './recorder/recorder'
import { applyReplayAudioWiring, canEnableReplayAudio, sessionMayEnableSonification, } from './recorder/replay'
import { captureReplayInterfaceVideo } from './recorder/replayInterfaceVideo'
import { captureTransformColors, paletteRestoreColorsAfterReplayCommand, runPaletteRestoreTransition, } from './recorder/replayPaletteState'
import { normalizeReplayPresentation, replaySideStateChanged, } from './recorder/replaySideState'
import { createReplayVideoJobSpec, replayVideoFileName, } from './recorder/replayVideo'
import { snapshotOrigin, snapshotOriginLabel } from './recorder/snapshotOrigin'
import { applySonificationSnapshot, closeAuthoredSonificationPanel, shouldRevealSonificationAfterReplay, shouldStopHiddenSonification, SONIFICATION_SNAPSHOT_VERSION, } from './recorder/sonificationState'
import { createRecorderAwareTimeline, runTimelineSnapshotMutation, } from './recorder/timelineActions'
import { createAnimationExport } from './utils/animationExport'
import { createAudioAnalyzer } from './utils/audioAnalysis'
import { autosaveIntervalMin, autosaveRecents, saveReminderDismissed, setAutosaveRecents, setSaveReminderDismissed, } from './utils/autosaveSettings'
import { downloadBlob } from './utils/blob'
import { deepClone } from './utils/clone'
import { createStoreHistory } from './utils/createStoreHistory'
import { sendFlameToDiscord } from './utils/discordWebhook'
import { enqueueAnimationJob, enqueueImageJob } from './utils/exportJobs'
import { addFlameDataToPng } from './utils/flameInPng'
import { hardwareTierToPreset } from './utils/hardwareTier'
import { compressJsonQueryParam } from './utils/jsonQueryParam'
import { persistentSignal } from './utils/persistentSignal'
import { addRandomizerHistoryEntry, clearRandomizerHistory, loadRandomizerHistoryEntries, MAX_RANDOMIZER_HISTORY_LIMIT, } from './utils/randomizerHistoryDB'
import { buildReadableIds } from './utils/readableIds'
import { getOldestRecentFlame, saveRecentFlame, upsertRecentFlame, } from './utils/recentFlames'
import { storeImportedSession, storeSession } from './utils/sessionsDB'
import { createShareLink, deriveOgMeta, uploadOgPreview, } from './utils/shareLink'
import { sum } from './utils/sum'
import { createTimelineState, defaultConfig as defaultTimelineConfig, resolveKeyframeValue, } from './utils/timeline'
import { sortedTransformEntries } from './utils/transformOrder'
import { createUndoRouter } from './utils/undoRouting'
import { useAppDragAndDrop } from './utils/useAppDragAndDrop'
import { useAudioReactive } from './utils/useAudioReactive'
import { useKeyboardShortcuts } from './utils/useKeyboardShortcuts'
import { useSonification } from './utils/useSonification'
import { registerWebMcpTools } from './webmcp/registerWebMcp'
import type { Setter } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { Vec3 } from 'wgpu-matrix'
import type { AudioMapping } from './components/AudioReactivePanel/AudioReactivePanel'
import type { QualityPreset } from './components/Quality/QualityPresets'
import type { QuickPickerMode } from './components/QuickVariationPicker/QuickVariationPicker'
import type { TourContext } from './components/SpotlightTour/tourTypes'
import type { Palette } from './flame/colorMap'
import type { PointInitMode } from './flame/pointInitMode'
import type { GenerateRandomFlameConfig, MutateFlameOptions, } from './flame/randomize'
import type { AudioWiringSnapshot } from './flame/schema/audioWiring'
import type { FlameDescriptor, TransformId, VariationId, } from './flame/schema/flameSchema'
import type { TimelineSnapshot } from './flame/schema/timeline'
import type { Dims } from './flame/variationRegistry'
import type { TransformVariationType } from './flame/variations'
import type { CustomVariationDef } from './flame/variations/custom/types'
import type { TransformVariationType3D } from './flame/variations3D'
import type { ReplayAffineMode, ReplayAffineTab, ReplayColorView, ReplayFocusPreparationHandler, } from './recorder/focusPreparation'
import type { SessionStartExtras } from './recorder/recorder'
import type { ReplayTarget } from './recorder/replay'
import type { ReplayVideoExportRequest } from './recorder/replayInterfaceVideo'
import type { ReplayNonFlameSideState, ReplayPresentationSnapshot, } from './recorder/replaySideState'
import type { RecordedSession } from './recorder/schema'
import type { SnapshotOrigin } from './recorder/snapshotOrigin'
import type { SonificationSnapshot } from './recorder/sonificationState'
import type { AnimationExportConfig } from './utils/animationExport'
import type { AudioAnalyzer, LiveAudioAnalyzer } from './utils/audioAnalysis'
import type { HistoryPreviewOwner } from './utils/createStoreHistory'
import type { ExportDimensions } from './utils/exportDimensions'
import type { HardwareTier } from './utils/hardwareTier'
import type { SharePayload } from './utils/jsonQueryParam'
import type { RandomizerHistoryEntry } from './utils/randomizerHistoryDB'
import type { SonificationConfig } from './utils/sonification'
import type { EasingCurve, KeyframeInterpolation, TimelineTrack, } from './utils/timeline'
import type { CommandContext } from '@/commands/types'

const EDGE_FADE_COLOR = {
  light: vec4f(0.96, 0.96, 0.96, 0.7),
  dark: vec4f(0, 0, 0, 0.6),
}

function formatPercent(x: number) {
  if (x === 1) {
    return `100 %`
  }
  return `${(x * 100).toFixed(1)} %`
}

export type ExportImageInfo = {
  /** True when the canvas holds a final color-graded image at the requested
   *  quality limit, i.e. it is safe to capture the canvas for an export. */
  finalImageReady: boolean
}

export type ExportImageType = (
  canvas: HTMLCanvasElement,
  info?: ExportImageInfo,
) => void

export type AppProps = {
  /**
   * Decoded shared payload. `importedCustomVariations` /
   * `alreadyOwnedCustomVariations` are runtime-only (set by the share-load path
   * in App.tsx, never serialized): respectively the custom variations
   * re-validated and registered transiently (offered to save via the consent
   * prompt), and the ones whose code already matches the user's saved library.
   */
  flameFromQuery?: SharePayload & {
    importedCustomVariations?: CustomVariationDef[]
    alreadyOwnedCustomVariations?: CustomVariationDef[]
  }
  /**
   * A single custom variation shared via a `?cv=` link, already re-validated and
   * transiently registered by App.tsx. `alreadyOwned` is true when the code
   * matches one already in the user's library. Runtime-only (never serialized).
   */
  sharedVariationFromQuery?: {
    def: CustomVariationDef
    alreadyOwned: boolean
  }
  flameFromWelcome?: () => FlameDescriptor | undefined
  welcomeTracks?: () => TimelineTrack[] | undefined
  /**
   * One-shot request from a Home "Explore" card: open the tool this flame was
   * curated to demonstrate, not just the flame. The value is the row's
   * `gallery_items.capability` — see `openCapability` below for the mapping and
   * for which capabilities have no sensible programmatic open. Consumed and
   * cleared in the same effect that consumes `flameFromWelcome`.
   */
  capabilityFromHome?: () => string | undefined
  resetFlameFromWelcome?: () => void
  hardwareTier?: HardwareTier | null
  onHardwareTierChange?: (tier: HardwareTier) => void
  /** When true (driven by the `?benchmark` query param), open the benchmark
   *  dialog on mount so the user lands one click from running it. */
  autoOpenBenchmark?: boolean
  /** When true (`?benchmark=auto`), also start the run automatically. */
  autoStartBenchmark?: boolean
}

export function extractFlameVariationTypes(
  descriptor: FlameDescriptor,
): TransformVariationType[] {
  const result: TransformVariationType[] = []
  for (const transform of Object.values(descriptor.transforms)) {
    for (const variation of Object.values(transform.variations)) {
      result.push(variation.type)
    }
  }
  return result
}

/**
 * Viewport width at/above which the workspace lays out "wide": the timeline
 * strip starts open and the sidebar is not auto-hidden. Mirrors the
 * `max-width: 768px` media query the mobile layout listens on.
 */
const WIDE_LAYOUT_MIN_WIDTH = 769
const isWideLayout = () => window.innerWidth >= WIDE_LAYOUT_MIN_WIDTH

/**
 * Animation starts enabled — a flame with no tracks renders identically either
 * way, and the timeline's affordances are visible from the start.
 *
 * Named because `resetWorkspaceForHandoff` has to restore exactly this: a flame
 * opened from Home second must land in the state it would have landed in first.
 */
const DEFAULT_ANIMATION_ENABLED = true

export function MainWorkspace(props: AppProps) {
  const { theme, setTheme } = useTheme()
  const { targetedParameter, setTargetedParameter } = useKeyframeTarget()
  let isRandomizingAnimation = false

  createEffect(() => {
    const path = targetedParameter()
    if (path && !isRandomizingAnimation) {
      // Find the element with the matching data-parameter-path
      const el = document.querySelector(`[data-parameter-path="${path}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  })

  const [qualityPreset, setQualityPreset] = createSignal<QualityPreset>(
    props.hardwareTier
      ? hardwareTierToPreset(props.hardwareTier)
      : getPresetFromQuality(DEFAULT_QUALITY),
  )

  createEffect(() => {
    if (props.hardwareTier) {
      setQualityPreset(hardwareTierToPreset(props.hardwareTier))
    }
  })

  const [pixelRatio, setPixelRatio] = createSignal(DEFAULT_RESOLUTION)
  // When set during an export, the main canvas renders at this exact pixel size
  // (resolution + aspect resolved) instead of the viewport-scaled pixelRatio, so
  // the captured image/video matches the chosen export format.
  const [exportDimensions, setExportDimensions] = createSignal<
    ExportDimensions | undefined
  >()
  // Hoist this conditional out of the AutoCanvas JSX prop: a ternary in a prop
  // compiles to a memo that Solid instantiates lazily on first read — and the
  // first read happens inside Flam3's rAF export loop (no owner), which warns
  // "computations created outside a createRoot". Created here it lives in this
  // component's owner. See memory: solid-conditional-prop-memo-leak.
  const canvasPixelRatio = createMemo(() =>
    exportDimensions() ? 1 : pixelRatio(),
  )
  const [onExportImage, setOnExportImage] = createSignal<ExportImageType>()

  // Dev-only: crash injection trigger (renders inside ErrorBoundary)
  const [devCrashTest, setDevCrashTest] = createSignal(false)
  const [adaptiveFilterEnabled, setAdaptiveFilterEnabled] = createSignal(true)
  const [stochasticFilterEnabled, setStochasticFilterEnabled] =
    createSignal(false)
  // Which transform is "selected" — shared across the affine grid, the color
  // picker and the sidebar transform cards so it's clear which one edits target.
  const [selectedTransformId, setSelectedTransformId] = createSignal<
    string | null
  >(null)
  const [replayAffineModeRequest, setReplayAffineModeRequest] = createSignal<{
    mode: ReplayAffineMode
    tab: ReplayAffineTab
    epoch: number
  }>({ mode: 'preAffine', tab: 'grid', epoch: 0 })
  const [replayColorViewRequest, setReplayColorViewRequest] = createSignal<{
    view: ReplayColorView
    epoch: number
  }>({ view: 'grid', epoch: 0 })
  const [affineCardOpen, setAffineCardOpen] = createSignal(true)
  const [colorCardOpen, setColorCardOpen] = createSignal(true)
  const [metadataCardOpen, setMetadataCardOpen] = createSignal(false)
  const [paletteCardOpen, setPaletteCardOpen] = createSignal(false)
  const [renderCardOpen, setRenderCardOpen] = createSignal(true)
  const [floatingActionsCollapsed, setFloatingActionsCollapsed] =
    createSignal(false)
  const [timelineCollapsed, setTimelineCollapsed] = createSignal(false)
  // Toggle: clicking the already-selected transform clears the selection
  // (deselect-all → nothing dimmed). Canvas handles only ever *set* (drag-safe).
  const toggleSelectedTransform = (tid: string) =>
    setSelectedTransformId((prev) => (prev === tid ? null : tid))
  // Per-transform collapsed state drives the (controlled) transform cards, so the
  // sidebar toolbar toggle can collapse-all / expand-all based on actual state:
  // if any card is open it collapses all, otherwise it expands all.
  const [collapsedTransforms, setCollapsedTransforms] = createSignal<
    Set<string>
  >(new Set())
  const visibleTransformTids = () =>
    sortedTransformEntries(recordEntries(flameDescriptor.transforms))
      .filter(([tid]) => !tid.startsWith('_sym__'))
      .map(([tid]) => tid)
  const anyTransformOpen = () =>
    visibleTransformTids().some((tid) => !collapsedTransforms().has(tid))

  function toggleCollapseAllTransforms() {
    setCollapsedTransforms(
      anyTransformOpen() ? new Set(visibleTransformTids()) : new Set<string>(),
    )
  }

  function toggleTransformCollapsed(tid: string) {
    setCollapsedTransforms((prev) => {
      const next = new Set(prev)
      if (next.has(tid)) next.delete(tid)
      else next.add(tid)
      return next
    })
  }

  // Browser tab title: "Lumen Apeiron — <flame name>" when the flame is named,
  // otherwise just "Lumen Apeiron".
  createEffect(() => {
    const name = flameDescriptor.metadata?.name?.trim()

    document.title =
      name && name.toLowerCase() !== 'unknown'
        ? `Lumen Apeiron — ${name}`
        : 'Lumen Apeiron'
  })

  const [animationEnabled, setAnimationEnabled] = createSignal(
    DEFAULT_ANIMATION_ENABLED,
  )
  const [hideDiceButtons, setHideDiceButtons] = createSignal(false)
  // True while a randomize/mutate run is in flight, so the buttons disable and
  // rapid clicks can't pile up concurrent runs (history thumbnail capture).
  const [isRandomizing, setIsRandomizing] = createSignal(false)
  const { showToast } = useToast()
  const SIDEBAR_RESIZABLE = false
  const { isCompact, setCompact } = useCompactMode()
  const [showSidebar, setShowSidebar] = createSignal(true)

  const [directorOpen, setDirectorOpen] = createSignal(false)
  const [directorState, setDirectorState] = createSignal<{
    generation: number
    candidates: {
      fitness?: number
      flame?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
    }[]
  } | null>(null)

  const _requestModal = useRequestModal()

  const selectCandidate = (index: number) => {
    const s = directorState()
    if (s && s.candidates[index]?.flame) {
      const candidateFlame = s.candidates[index].flame
      setFlameDescriptor(
        () => deepClone(candidateFlame),
        `Art Director: Candidate ${index + 1}`,
      )
      showToast(`Art Director: Loaded candidate ${index + 1} into workspace.`)
    }
  }

  const [showArena, setShowArena] = createSignal(false)
  const [arenaP1Stats, setArenaP1Stats] = createSignal<{
    name?: string
    type?: string
    powerLevel?: number
    flame?: FlameDescriptor
    metrics?: {
      complexity?: number
      chaosLevel?: number
      symmetryScore?: number
      energyIntensity?: number
    }
  } | null>(null)
  const [arenaP2Stats, setArenaP2Stats] = createSignal<{
    name?: string
    type?: string
    powerLevel?: number
    flame?: FlameDescriptor
    metrics?: {
      complexity?: number
      chaosLevel?: number
      symmetryScore?: number
      energyIntensity?: number
    }
  } | null>(null)

  let isDirectorModalOpen = false

  function openArtDirectorUI() {
    if (isDirectorModalOpen) return
    isDirectorModalOpen = true
    const s = directorState()
    if (!s || s.candidates.length === 0) {
      const current = deepClone(flameDescriptor)
      const presets = ['Subtle', 'Moderate', 'Chaotic', 'Structural'] as const
      const candidates = presets.map((_, i) => {
        const mutated = mutateFlame(
          current,
          {
            strength: 0.2 + i * 0.1,
            minTransforms: 2,
            maxTransforms: 6,
            minVariations: 1,
            maxVariations: 3,
            allowedVariations: [],
            dimensions: current.renderSettings.dimensions ?? 2,
          },
          {
            mutateAffine: true,
            affineMode: 'smart',
            mutateVariations: 'modify',
            mutateColors: true,
          },
        )
        return {
          fitness: 0.82 + (i % 3) * 0.05,
          flame: mutated,
        }
      })
      setDirectorState({
        generation: 1,
        candidates,
      })
    }
    setDirectorOpen(true)
    void _requestModal({
      content: ({ respond }) => (
        <DirectorOverlay
          director={{
            open: directorOpen,
            setOpen: setDirectorOpen,
            state: directorState,
            setState: setDirectorState,
            selectCandidate,
          }}
          hardwareTier={props.hardwareTier}
          respond={() => {
            isDirectorModalOpen = false
            setDirectorOpen(false)
            respond()
          }}
        />
      ),
    }).finally(() => {
      isDirectorModalOpen = false
      setDirectorOpen(false)
    })
  }

  let isArenaModalOpen = false

  function openFlameClashUI() {
    if (isArenaModalOpen) return
    isArenaModalOpen = true
    const p1 = arenaP1Stats()
    const p2 = arenaP2Stats()
    if (!p1 || !p2) {
      const current = deepClone(flameDescriptor)
      const opponent = mutateFlame(
        current,
        {
          strength: 0.45,
          minTransforms: 2,
          maxTransforms: 6,
          minVariations: 1,
          maxVariations: 3,
          allowedVariations: [],
          dimensions: current.renderSettings.dimensions ?? 2,
        },
        {
          mutateAffine: true,
          affineMode: 'smart',
          mutateVariations: 'all',
          mutateColors: true,
        },
      )
      const p1Stats = calculateFlameStats(current)
      const p2Stats = calculateFlameStats(opponent)
      setArenaP1Stats({
        name: current.metadata?.name || 'Cyan Guardian',
        type: p1Stats.type,
        powerLevel: p1Stats.powerLevel,
        flame: current,
        metrics: p1Stats.metrics,
      })
      setArenaP2Stats({
        name: 'Crimson Nemesis',
        type: p2Stats.type,
        powerLevel: p2Stats.powerLevel,
        flame: opponent,
        metrics: p2Stats.metrics,
      })
    }
    setShowArena(true)
    isArenaModalOpen = true
  }

  createEffect(() => {
    if (!showArena()) {
      isArenaModalOpen = false
    }
  })

  createEffect(() => {
    if (directorOpen() && !isDirectorModalOpen) {
      openArtDirectorUI()
    }
  })

  createEffect(() => {
    if (showArena() && !isArenaModalOpen) {
      openFlameClashUI()
    }
  })

  const [sidebarDiffView, setSidebarDiffView] = createSignal<{
    flameA: FlameDescriptor
    flameB: FlameDescriptor
  } | null>(null)
  const [sidebarHidden, setSidebarHidden] = createSignal(!isWideLayout())
  // Flame Randomizer card open state is controlled here so the Timeline
  // "Animate" button can reveal it; the epoch bump also forces its Animation
  // Settings section open.
  const [randomizerOpen, setRandomizerOpen] = createSignal(false)
  const [randomizerAnimEpoch, setRandomizerAnimEpoch] = createSignal(0)
  const [sidebarLayoutMode, setSidebarLayoutMode] = persistentSignal<
    'compact' | 'wide'
  >('sidebar-layout-mode', 'wide')
  const sidebarWidth = createMemo(() =>
    sidebarLayoutMode() === 'wide' ? 26 : 21,
  )
  const setSidebarWidth = () => {} // Drag resize disabled
  let sidebarRef: HTMLDivElement | undefined
  let sidebarScrollRef: HTMLDivElement | undefined
  let randomizerCardRef: HTMLDivElement | undefined
  let savedScrollTop = 0
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [sidebarEl, setSidebarEl] = createSignal<HTMLDivElement | undefined>()
  const floatingLeft = () => {
    const rootFontSize = parseFloat(
      // eslint-disable-next-line no-restricted-globals
      getComputedStyle(document.documentElement).fontSize,
    )
    return sidebarWidth() * rootFontSize + 8
  }
  const floatingTop = () => 8
  const [isMobile, setIsMobile] = createSignal(window.innerWidth < 769)
  createEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    if (mq.matches) setCompact(true)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      if (e.matches) setCompact(true)
      // A responsive layout change is authored only while recording. During
      // replay it is presentation, so let the replay-preservation policy keep
      // generated audio stable instead of injecting a live Disable action.
      if (e.matches) {
        if (isSessionRecording()) hideMobileSidebarAsAuthoredAction()
        else setSidebarHidden(true)
      }
    }
    mq.addEventListener('change', handler)
    return () => {
      mq.removeEventListener('change', handler)
    }
  })
  // Hide timeline by default on mobile -- users can toggle it back on
  const [showTimeline, setShowTimeline] = createSignal(isWideLayout())
  // The session currently open for replay (M4), if any. Lives here rather than
  // in the dock because dropping a .steps.json opens one too.
  const [replaySession, setReplaySession] = createSignal<RecordedSession>()
  const [externalSessionLibraryRevision, setExternalSessionLibraryRevision] =
    createSignal(0)
  const [recorderReplayPresentation, setRecorderReplayPresentation] =
    createSignal({ playing: false, timelineTargeted: false })
  const openReplaySession = (session: RecordedSession | undefined) => {
    if (recorderTaskPending()) {
      showToast(
        recorderExportPending()
          ? 'Wait for the replay video recording to finish before changing replays'
          : 'Wait for the caption save to finish before changing replays',
      )
      return
    }
    if (session !== undefined && isSessionRecording()) {
      showToast('Stop or discard the current recording before opening a replay')
      return
    }
    setReplaySession(session)
  }
  const importReplaySession = async (
    session: RecordedSession,
    sourceFile: File,
  ) => {
    try {
      const result = await storeImportedSession(session, sourceFile.name)
      if (result.added) {
        setExternalSessionLibraryRevision((revision) => revision + 1)
        showToast(`Imported "${result.name}" to Recordings`, 3500)
      } else {
        showToast(`"${result.name}" is already in Recordings`, 3500)
      }
    } catch (error: unknown) {
      console.warn('[recorder] could not store dropped session', error)
      showToast('Could not save the imported replay to Recordings', 5000)
    }
    openReplaySession(session)
  }
  // Colors as they were before the first palette apply — lets Unselect
  // restore the "natural" colors. UI stash only; undo handles the rest.
  const [prePaletteColors, setPrePaletteColors] = createSignal<
    Record<string, { x: number; y: number }>
  >({})
  const [flameDescriptor, setFlameDescriptor, history] = createStoreHistory(
    createStore(
      deepClone(
        props.flameFromWelcome?.() ?? props.flameFromQuery?.flame ?? example1,
      ),
    ),
    // The main flame history joins the app-wide undo journal so Ctrl+Z can
    // arbitrate chronologically against the timeline's undo stack. The
    // session recorder listens to every pushed entry to flag edits that
    // bypassed the command registry (its coverage ratchet), and to the
    // gesture boundary so a drag records as one step rather than hundreds.
    {
      journal: true,
      onEntryPushed: reportDocumentWrite,
      onPreviewStarted: notePreviewStarted,
    },
  )

  const withPaletteRestoreTransition = (
    after: Record<string, { x: number; y: number }>,
    description: string,
    writeDocument: () => void,
  ) => {
    runPaletteRestoreTransition(
      history,
      prePaletteColors(),
      after,
      (colors) => setPrePaletteColors(colors),
      description,
      writeDocument,
    )
  }

  /**
   * File/gallery loads are document boundaries in the live editor, but a
   * recorder still needs a self-contained action that can reproduce the
   * resulting document. Keep one replacement-style history entry and log the
   * exact descriptor it produced, mirroring the 2D/3D switch path below.
   */
  const replaceLoadedFlame = (
    next: FlameDescriptor,
    label = 'Load flame',
    origin?: SnapshotOrigin,
  ) => {
    const flame = deepClone(next)
    const description = snapshotOriginLabel(origin) ?? label
    // A different document cannot inherit another flame's pre-palette stash.
    // If the loaded flame already carries a palette, its earlier natural
    // colours are unknowable; Unselect safely keeps its current colours. The
    // history side effects restore the outgoing provenance if this load is
    // undone and clear it again on redo.
    withRecordingSuppressed(() => {
      withPaletteRestoreTransition({}, description, () => {
        setFlameDescriptor(() => flame, description)
      })
    })
    recordSyntheticAction(
      'flame.load',
      origin === undefined
        ? [deepClone(flame), description]
        : [deepClone(flame), description, {}, origin],
      description,
    )
  }
  // Palette selection is part of the flame document (renderSettings.palette):
  // applying/removing one is a single undoable history entry, and the palette
  // travels with saves/shares. These accessors derive the UI/render views.
  const selectedPalette = createMemo<Palette | undefined>(() => {
    const stored = flameDescriptor.renderSettings.palette
    if (!stored) return undefined
    return {
      id: stored.id,
      name: stored.name,
      entries: stored.entries.map((entry) => ({ ...entry })),
      source: 'imported',
    }
  })
  const selectedPaletteId = () =>
    flameDescriptor.renderSettings.palette?.id ?? ''
  // Blend composition is part of the flame document too (renderSettings
  // .blendFlame / .blendWeight): picking, adjusting, or clearing a blend is
  // one undoable history entry each, and the composition survives
  // save/share/load. The stored blend flame is plain data, re-validated on
  // read so a hand-edited file can't hand the renderer an invalid flame.
  const blendFlame = createMemo<FlameDescriptor | undefined>(() => {
    const stored = flameDescriptor.renderSettings.blendFlame
    if (stored === undefined) return undefined
    return tryValidateFlame(stored)
  })
  const blendWeight = () => flameDescriptor.renderSettings.blendWeight ?? 0
  const setBlendFlame = (flame: FlameDescriptor | undefined) => {
    executeCommand('flame.setBlendFlame', cmdContext, flame ?? null)
  }
  const setBlendWeight = (weight: number) => {
    executeCommand('flame.setBlendWeight', cmdContext, weight)
  }
  if (IS_DEV) {
    console.info('[share:app] store initialized', {
      source: props.flameFromWelcome?.()
        ? 'welcome'
        : props.flameFromQuery?.flame
          ? 'query'
          : 'default',
      transformCount: recordKeys(flameDescriptor.transforms).length,
      firstColor: Object.values(flameDescriptor.transforms)[0]?.color,
      queryFlamePresent: !!props.flameFromQuery?.flame,
      queryAnimPresent: !!props.flameFromQuery?.animation,
    })
  }
  /**
   * A capability handed over by a Home "Explore" card, waiting to be applied.
   *
   * Held here rather than acted on in the effect below for the same reason
   * `loadedAnimation` is: the functions that open the panels are declared much
   * further down (they need the panel signals), and the hand-off arrives before
   * the flame has finished landing. A separate effect drains it.
   */
  const [pendingCapability, setPendingCapability] = createSignal<string>()

  createEffect(() => {
    const newFlame = props.flameFromWelcome?.()
    if (newFlame !== undefined) {
      // Home overlays this still-mounted workspace. Replacing its document
      // mid-take would be an unbounded workspace hand-off rather than a
      // semantic editor step, so fail closed and keep the recorded session
      // internally replayable.
      if (isSessionRecording()) {
        props.resetFlameFromWelcome?.()
        showToast('Stop or discard the recording before opening a Home flame')
        return
      }
      const outgoingPaletteRestoreColors = deepClone(prePaletteColors())
      // Order is load-bearing. `flushDirtyToRecents` reads the OUTGOING flame
      // and its tracks, so it has to run before the reset drops them —
      // otherwise a hand-off would silently destroy unsaved work.
      flushDirtyToRecents()
      // Then a clean slate, THEN this flame's own state. Every hand-off starts
      // from the same baseline, so the second flame you open from Home looks
      // exactly like the first one would have. See resetWorkspaceForHandoff for
      // what was leaking and why.
      resetWorkspaceForHandoff()
      runPaletteRestoreTransition(
        history,
        outgoingPaletteRestoreColors,
        {},
        (colors) => {
          setPrePaletteColors(colors)
        },
        'Load Home flame',
        () => {
          setFlameDescriptor(() => deepClone(newFlame), 'Load Home flame')
        },
      )
      // Read BEFORE resetFlameFromWelcome() clears the whole hand-off.
      const capability = props.capabilityFromHome?.()
      if (capability !== undefined) {
        setPendingCapability(capability)
      }
      // Load animation tracks if the welcome selection includes them
      const tracks = props.welcomeTracks?.()
      if (IS_DEV) {
        console.info('[welcome] flame selected, tracks:', {
          hasTracks: !!tracks,
          trackCount: tracks?.length ?? 0,
          trackPaths: tracks?.map((t) => t.parameterPath) ?? [],
        })
      }
      if (tracks && tracks.length > 0) {
        setLoadedAnimation({
          flame: deepClone(newFlame),
          tracks: tracks.map((t) => ({
            ...t,
            keyframes: t.keyframes.map((kf) => ({ ...kf })),
          })),
        })
      }
      props.resetFlameFromWelcome?.()
      // A welcome pick is a fresh starting point for dirty tracking.
      markLoadedBaseline()
    }
  })

  const symTransforms = createMemo(() =>
    sortedTransformEntries(recordEntries(flameDescriptor.transforms)).filter(
      ([tid]) => tid.startsWith('_sym__'),
    ),
  )

  // Stable ID list for <For> -- only changes when transforms are added/removed,
  // not when their values change, so dragging angle editors stays fluid.
  const symTransformIds = createMemo(() => symTransforms().map(([tid]) => tid))
  const [symmetryCardOpen, setSymmetryCardOpen] = createSignal(true)
  createEffect(() => {
    if (symTransforms().length === 0) setSymmetryCardOpen(true)
  })

  const currentSymType = createMemo(() => {
    const syms = symTransforms() || []
    return syms.some(
      ([, t]) =>
        t?.preAffine?.a === -1 &&
        t.preAffine.d === 0 &&
        t.preAffine.b === 0 &&
        t.preAffine.e === 1,
    )
      ? 'dihedral'
      : 'rotational'
  })

  const currentSymFolds = createMemo(() => {
    const isDihedral = currentSymType() === 'dihedral'
    const syms = symTransforms() || []
    return isDihedral ? syms.length : syms.length + 1
  })

  const applySymmetry = (
    n: number,
    type: 'rotational' | 'dihedral',
    origin: 'add' | 'type' | 'folds' = 'add',
  ) => {
    executeCommand(
      'flame.applySymmetry',
      cmdContext,
      n,
      type,
      undefined,
      origin,
    )
  }

  const totalProbability = createMemo(() =>
    sum(Object.values(flameDescriptor.transforms).map((f) => f.probability)),
  )
  let loadModalOrigin: SnapshotOrigin | undefined
  const {
    loadModalIsOpen,
    showLoadFlameModal: showLoadFlameModalBase,
    loadedAnimation,
    setLoadedAnimation,
    clearLoadedAnimation,
  } = createLoadFlame(
    {
      replace: (next, label) => {
        replaceLoadedFlame(next, label, loadModalOrigin)
      },
    },
    () => flameDescriptor.renderSettings.dimensions ?? 2,
  )

  /** Attach a stable source to value-pinned modal loads without coupling the
   * generic load dialog to recorder internals. The modal stack is serialized,
   * so this provenance slot is owned by one request until it settles. */
  const showLoadFlameModal = (mode: 'load' | 'gallery' = 'load') => {
    const origin = snapshotOrigin(
      mode === 'gallery' ? 'flame.gallery' : 'flame.file',
    )
    loadModalOrigin = origin
    return showLoadFlameModalBase(mode).finally(() => {
      if (loadModalOrigin === origin) loadModalOrigin = undefined
    })
  }

  const [showBlendGallery, setShowBlendGallery] = createSignal(false)
  // Whether the blend-flame gallery is being used to set a static blend or to
  // set up a morph animation (animated blendWeight). Branches the gallery's
  // onSelect handler.
  const [blendIntent, setBlendIntent] = createSignal<
    'blend' | 'morph' | 'breed' | 'evolve' | 'diff'
  >('blend')

  // Audio-reactive panel state
  const [showAudioPanel, setShowAudioPanel] = createSignal(false)
  /**
   * Does the track keep playing once the audio panel is closed?
   *
   * OFF by default, deliberately: audio coming from a panel that is no longer
   * on screen has no visible cause and no obvious way to stop it — the user is
   * left hunting for which pane is making noise. Opt in when you actually want
   * to keep listening while working on the flame.
   */
  const [keepAudioPlayingWhenClosed, setKeepAudioPlayingWhenClosed] =
    createSignal(false)
  const [audioBuffer, setAudioBuffer] = createSignal<AudioBuffer | undefined>(
    undefined,
  )
  const [audioEnabled, setAudioEnabled] = createSignal(false)
  const [audioMapping, setAudioMapping] = createSignal<AudioMapping>({
    preset: 'pulse',
    mappings: [
      {
        audioFeature: 'bass',
        target: { kind: 'renderSetting', param: 'vibrancy' },
        sensitivity: 1,
        range: [0.3, 1.5],
      },
      {
        audioFeature: 'beat',
        target: { kind: 'renderSetting', param: 'palettePhase' },
        sensitivity: 1,
        range: [0, 3.14],
      },
    ],
  })
  const [audioSource, setAudioSource] = createSignal<'file' | 'mic'>('file')
  // Named, not carried: a recorded session can say which track it was wired
  // against, but an AudioBuffer can never ride in a `.steps.json`.
  const [audioTrackName, setAudioTrackName] = createSignal<string>()
  const [liveAnalyzer, setLiveAnalyzer] = createSignal<
    LiveAudioAnalyzer | undefined
  >(undefined)
  const [playbackPaused, setPlaybackPaused] = createSignal(false)
  const [seekTarget, setSeekTarget] = createSignal<number | null>(null)
  const [playbackTime, setPlaybackTime] = createSignal(0)
  // Replay owns a deterministic document transaction. File and microphone
  // clocks may keep running, but neither may write 30fps modulation into that
  // transaction or leave silent writes behind after Undo.
  const [replaySuspendsAudioModulation, setReplaySuspendsAudioModulation] =
    createSignal(false)
  const [replayDefersReactiveEffects, setReplayDefersReactiveEffects] =
    createSignal(false)
  let replayDeferredEffectsDepth = 0
  const withReplayDeferredEffects = <T,>(fn: () => T): T => {
    replayDeferredEffectsDepth++
    if (replayDeferredEffectsDepth === 1) {
      setReplayDefersReactiveEffects(true)
    }
    try {
      return fn()
    } finally {
      replayDeferredEffectsDepth--
      if (replayDeferredEffectsDepth === 0) {
        setReplayDefersReactiveEffects(false)
      }
    }
  }
  // Follow-cam may temporarily replace the Sonification panel with the UI
  // owned by the current replay step. That is presentation, not an authored
  // stop, so the hidden-panel safety effect must wait for the replay batch to
  // settle before deciding whether to silence the output.
  const [
    replayPreservesSonificationOutput,
    setReplayPreservesSonificationOutput,
  ] = createSignal(false)
  const [fileAnalyzer, setFileAnalyzer] = createSignal<
    AudioAnalyzer | undefined
  >(undefined)
  /**
   * How far the post-decode analysis pass has got, 0-1, or null when idle.
   *
   * The panel used to show a single "Loading..." that covered ONLY the decode,
   * then went quiet for the whole analysis — which on an 18-minute track is the
   * long part. The panel looked idle and unresponsive while the work that
   * actually takes the minute was running.
   */
  const [analysisProgress, setAnalysisProgress] = createSignal<number | null>(
    null,
  )

  // Reset playback state when switching between file and mic
  createEffect(() => {
    const _src = audioSource()
    setPlaybackPaused(false)
    setPlaybackTime(0)
    setSeekTarget(null)
  })

  // Derive transform list for audio mapping target selectors
  const transformInfos = createMemo(() => {
    const txs = flameDescriptor.transforms
    return Object.entries(txs).map(([id, tx], i) => {
      const variations = Object.entries(tx.variations ?? {}).map(
        ([vid, v]) => ({
          id: vid,
          type: (v as { type: string }).type,
        }),
      )
      return {
        id,
        index: i,
        label: `Tx ${i}: ${id.split('_')[0]?.slice(0, 12) ?? id.slice(0, 12)}`,
        variations,
      }
    })
  })

  // Sonification state
  const [showSonificationPanel, setShowSonificationPanel] = createSignal(false)
  const [sonificationEnabled, setSonificationEnabled] = createSignal(false)
  const audioPanelVisible = () =>
    showAudioPanel() && showSidebar() && (!isMobile() || !sidebarHidden())
  const sonificationPanelVisible = () =>
    showSonificationPanel() &&
    showSidebar() &&
    (!isMobile() || !sidebarHidden())

  /*
   * Closing a sound panel silences it, unless the user opted out.
   *
   * Keyed off each panel's visibility rather than bolted onto its `onClose`,
   * because a panel also disappears when the sidebar closes, when the other
   * panel takes its place, and on the gallery hand-off reset. Audio still
   * playing after any of those is a sound with no visible source and no
   * obvious stop button — the user is left hunting for which pane is making
   * noise. Sonification matters more here, not less: it generates audio
   * continuously from the flame, so every edit keeps feeding it.
   *
   * The file transport is only PAUSED — buffer, analysis and position all
   * survive, so reopening resumes instead of reloading.
   */
  createEffect(() => {
    if (audioPanelVisible() || keepAudioPlayingWhenClosed()) {
      return
    }
    if (!untrack(playbackPaused)) {
      setPlaybackPaused(true)
    }
  })
  createEffect(() => {
    if (
      shouldStopHiddenSonification({
        enabled: sonificationEnabled(),
        panelVisible: sonificationPanelVisible(),
        keepPlayingWhenClosed: keepAudioPlayingWhenClosed(),
        replayPreservesOutput: replayPreservesSonificationOutput(),
      })
    ) {
      setSonificationEnabled(false)
    }
  })
  const [sonificationConfig, setSonificationConfig] =
    createSignal<SonificationConfig>({
      model: 'orchestral',
      volume: 0.3,
      updateRate: 20,
      scale: 'pentatonicMajor',
      voiceCount: 8,
      harmonicDensity: 1.0,
      triggerRate: 4,
      spatialSpread: 0.7,
      reverbMix: 0.3,
    })

  const captureSonificationSnapshot = (): SonificationSnapshot => ({
    version: SONIFICATION_SNAPSHOT_VERSION,
    enabled: sonificationEnabled(),
    config: deepClone(sonificationConfig()),
  })

  const revealSonificationPanel = () => {
    setShowSidebar(true)
    setSidebarHidden(false)
    setSidebarDiffView(null)
    setShowBlendGallery(false)
    setShowAudioPanel(false)
    setShowSonificationPanel(true)
  }

  /** Explicitly enabling generated audio is authored intent. Keep its stop
   *  control visible even for instant replay, which has no follow-cam pass. */
  const setAuthoredSonificationEnabled = (enabled: boolean) => {
    batch(() => {
      if (enabled) revealSonificationPanel()
      setSonificationEnabled(enabled)
    })
  }

  const loadSonificationSnapshot = (
    snapshot: SonificationSnapshot,
    revealEnabled = true,
  ) => {
    batch(() => {
      applySonificationSnapshot(snapshot, {
        setConfig: setSonificationConfig,
        setEnabled: setSonificationEnabled,
      })
      // The panel-close safety effect intentionally silences hidden audio.
      // Reveal a recorded live output so loading the session does not
      // immediately turn its authored enabled state back off.
      if (snapshot.enabled && revealEnabled) {
        revealSonificationPanel()
      }
    })
  }

  /** User-driven panel hand-offs are authored output changes. Dispatch the
   *  stop before hiding so the visibility safety effect remains only a
   *  fallback for system/reset paths and cannot make recording miss it. */
  function closeSonificationPanelAsAuthoredAction() {
    closeAuthoredSonificationPanel({
      shouldDisable: () =>
        sonificationEnabled() && !keepAudioPlayingWhenClosed(),
      disable: () => {
        executeCommand('sonification.setEnabled', cmdContext, false)
      },
      hide: () => setShowSonificationPanel(false),
    })
  }

  /** Turning Keep Playing off can itself hide the only live sonification
   * output. Record that user-authored stop before changing the preference so
   * the visibility safety effect remains a raw/system fallback only. */
  function setKeepPlayingWhenClosedAsAuthoredAction(keep: boolean) {
    if (!keep && sonificationEnabled() && !sonificationPanelVisible()) {
      executeCommand('sonification.setEnabled', cmdContext, false)
    }
    setKeepAudioPlayingWhenClosed(keep)
  }

  function toggleSidebarAsAuthoredAction() {
    if (showSidebar()) {
      closeSonificationPanelAsAuthoredAction()
      executeCommand('sidebar.close', cmdContext)
    } else {
      executeCommand('sidebar.open', cmdContext)
    }
  }

  function hideMobileSidebarAsAuthoredAction() {
    if (sidebarHidden()) return
    closeSonificationPanelAsAuthoredAction()
    setSidebarHidden(true)
  }

  function toggleMobileSidebarAsAuthoredAction() {
    if (sidebarHidden()) {
      setSidebarHidden(false)
    } else {
      hideMobileSidebarAsAuthoredAction()
    }
  }

  function pickBlendFlame() {
    setBlendIntent('blend')
    setShowAudioPanel(false)
    closeSonificationPanelAsAuthoredAction()
    setShowSidebar(true)
    setShowBlendGallery(true)
  }

  function pickMorphFlame() {
    setBlendIntent('morph')
    setShowAudioPanel(false)
    closeSonificationPanelAsAuthoredAction()
    setShowSidebar(true)
    setShowBlendGallery(true)
  }

  function pickBreedFlame() {
    setBlendIntent('breed')
    setShowAudioPanel(false)
    closeSonificationPanelAsAuthoredAction()
    setShowSidebar(true)
    setShowBlendGallery(true)
  }

  function pickEvolveFlame() {
    setBlendIntent('evolve')
    setShowAudioPanel(false)
    closeSonificationPanelAsAuthoredAction()
    setShowSidebar(true)
    setShowBlendGallery(true)
  }

  function pickDiffFlame() {
    setBlendIntent('diff')
    setShowAudioPanel(false)
    closeSonificationPanelAsAuthoredAction()
    setShowSidebar(true)
    setShowBlendGallery(true)
  }

  function openDiffView(flameA: FlameDescriptor, flameB: FlameDescriptor) {
    closeSonificationPanelAsAuthoredAction()
    setSidebarDiffView({ flameA: deepClone(flameA), flameB: deepClone(flameB) })
    setShowSidebar(true)
  }

  /** Opens DiffViewModal on top of the current modal stack — used when
   *  compare/diff is triggered from within an already-open modal so the
   *  diff doesn't render behind the ::backdrop. */
  function openDiffAsModal(flameA: FlameDescriptor, flameB: FlameDescriptor) {
    void _requestModal({
      content: ({ respond }) => (
        <DiffViewModal
          flameA={deepClone(flameA)}
          flameB={deepClone(flameB)}
          respond={respond}
        />
      ),
    })
  }

  /** Close the sidebar diff panel and return to editor view. */
  function closeSidebarDiff() {
    setSidebarDiffView(null)
  }

  function pickGalleryFlame() {
    // The gallery is a mode of the Load Flame dialog: same tiles and chrome,
    // plus search, variation tags, and the Bred & Evolved section.
    void showLoadFlameModal('gallery')
  }

  function pickSimulatorFlame() {
    void _requestModal({
      content: ({ respond }) => (
        <PopulationSimulator
          flame={flameDescriptor}
          hardwareTier={props.hardwareTier}
          onApply={(flame) => {
            if (blendFlame())
              showToast(
                'Blend is still active — the loaded flame will look mixed',
                4000,
              )
            executeFlameLoad(
              flame,
              undefined,
              snapshotOrigin('flame.simulator'),
            )
          }}
          respond={respond}
        />
      ),
    })
  }

  function pickAncestryFlame() {
    void _requestModal({
      content: ({ respond }) => (
        <AncestryTreeModal
          flame={flameDescriptor}
          hardwareTier={props.hardwareTier}
          onApply={(flame) => {
            if (blendFlame())
              showToast(
                'Blend is still active — the loaded flame will look mixed',
                4000,
              )
            executeFlameLoad(flame, undefined, snapshotOrigin('flame.ancestry'))
          }}
          onCompare={openDiffAsModal}
          respond={respond}
        />
      ),
    })
  }

  /**
   * Set up an animated morph from the current flame (A) into `endFlame` (B).
   * Reuses the Blend pipeline: B becomes the blend flame and `blendWeight` is
   * keyframed 1 (pure A) → 0 (pure B) across the timeline, so playback
   * cross-dissolves A into B. Combine with "Seamless Loop" for an A→B→A cycle.
   */
  function setupMorph(endFlame: FlameDescriptor) {
    // One flame-history entry for the composition (blend flame + weight)...
    executeCommand('flame.setupMorph', cmdContext, endFlame)
    const cfg = timeline.config()
    // ...and one timeline undo step for the keyframes (remove + both adds).
    runTimelineSnapshotMutation(
      recorderTimeline,
      snapshotOrigin('timeline.morph'),
      () => {
        timeline.removeAllKeyframesForPath('blendWeight')
        timeline.addKeyframe('blendWeight', cfg.startFrame, 1, 'easeInOut')
        timeline.setKeyframeValue('blendWeight', cfg.endFrame, 0, 'easeInOut')
      },
    )
    executeCommand('timeline.setAnimationEnabled', cmdContext, true)
    executeCommand('view.setShowTimeline', cmdContext, true)
    recorderTimeline.goToFrame(cfg.startFrame)
    showToast('Morph ready — press Play to animate A → B', 3500)
  }

  /**
   * How long a candidate must stay hovered before its child is rendered.
   *
   * Slightly longer than the gallery's own 120ms clear delay: a child has a
   * different transform structure from its parent, so showing one rebuilds the
   * IFS pipeline, and sweeping the pointer down a list must not do that once
   * per tile.
   */
  const BREED_PREVIEW_DELAY_MS = 220

  // Hover preview: temporarily set blend flame at 40% weight. Silent writes —
  // a transient hover must not create history entries or clobber redo.
  let prevBlendFlame: FlameDescriptor | undefined
  let prevBlendWeight = 0
  let blendPreviewActive = false

  /**
   * The child generated for whichever candidate is hovered, so clicking opens
   * the gallery on the flame you were actually looking at rather than nine
   * unrelated ones.
   */
  const [breedPreviewChild, setBreedPreviewChild] = createSignal<
    FlameDescriptor | undefined
  >(undefined)
  /** The workspace flame as it was before a breed preview replaced it. */
  let breedPreviewRestore: FlameDescriptor | undefined
  let breedPreviewTimer: ReturnType<typeof setTimeout> | undefined

  function writeDescriptor(next: FlameDescriptor) {
    const value = deepClone(next)
    history.setSilently((draft) => {
      draft.version = value.version
      draft.metadata = value.metadata
      draft.renderSettings = value.renderSettings
      draft.transforms = value.transforms
    })
  }

  function endBreedPreview() {
    clearTimeout(breedPreviewTimer)
    breedPreviewTimer = undefined
    setBreedPreviewChild(undefined)
    if (breedPreviewRestore !== undefined) {
      writeDescriptor(breedPreviewRestore)
      breedPreviewRestore = undefined
    }
  }

  /**
   * Hovering a candidate while breeding shows an actual CHILD of the two
   * flames, not a 40% blend of them.
   *
   * A blend is the wrong thing to show here twice over: it is not what
   * breeding produces, and it cannot render at all in 3D — `ifsPipeline3D`
   * has no blend input, so the old preview changed the hovered NAME while the
   * picture sat still. A real child works in both dimensions, because
   * `breedFlames` carries `variations3D`.
   *
   * Debounced, and this matters: a child has a different transform STRUCTURE
   * from its parent, so applying one rebuilds the IFS pipeline. Sweeping the
   * pointer across a list must not rebuild once per tile.
   */
  function previewBreedChild(flame: FlameDescriptor) {
    clearTimeout(breedPreviewTimer)
    breedPreviewTimer = setTimeout(() => {
      const parentA = breedPreviewRestore ?? unwrap(flameDescriptor)
      const [child] = breedFlames(parentA, flame, {
        count: 1,
        crossoverMode: 'uniform',
        mutationStrength: 0.1,
      })
      if (child === undefined) {
        return
      }
      // Snapshot once per hover run, not per tile: the restore target is the
      // flame the user arrived with, never a previously previewed child.
      breedPreviewRestore ??= deepClone(unwrap(flameDescriptor))
      setBreedPreviewChild(child)
      writeDescriptor(child)
    }, BREED_PREVIEW_DELAY_MS)
  }

  function handlePreviewBlend(flame: FlameDescriptor | null) {
    if (blendIntent() === 'breed') {
      if (flame) {
        previewBreedChild(flame)
      } else {
        endBreedPreview()
      }
      return
    }
    // The hover preview IS the blend mechanism, and blending is 2D-only:
    // `ifsPipeline3D.update()` takes a single flame — it has no blend input at
    // all, so `renderSettings.blendFlame` is silently ignored in 3D. Writing it
    // anyway changed the hovered NAME while the picture stayed put, which reads
    // as a broken preview rather than an unsupported one. Skip it instead.
    if (flame && (flame.renderSettings.dimensions ?? 2) === 3) {
      return
    }
    if (flame) {
      if (!blendPreviewActive) {
        prevBlendFlame = blendFlame()
        prevBlendWeight = blendWeight()
        blendPreviewActive = true
      }
      history.setSilently((draft) => {
        draft.renderSettings.blendFlame = deepClone(flame)
        draft.renderSettings.blendWeight = 0.4
      })
    } else if (blendPreviewActive) {
      const restore = prevBlendFlame
      const restoreWeight = prevBlendWeight
      history.setSilently((draft) => {
        if (restore === undefined) delete draft.renderSettings.blendFlame
        else draft.renderSettings.blendFlame = deepClone(restore)
        draft.renderSettings.blendWeight = restoreWeight
      })
      prevBlendFlame = undefined
      blendPreviewActive = false
    }
  }

  /*
   * The catch-all for the breed preview.
   *
   * A preview replaces the workspace flame with a child, so every route out of
   * the picker has to put it back. The gallery's own `onClose` does, but it is
   * not the only way out — the hand-off reset, Escape and the sidebar toggles
   * all clear `showBlendGallery` directly, and any of them would otherwise
   * leave the child installed as the user's flame with no history entry
   * explaining where it came from. Keying off the visibility itself covers
   * every path, present and future.
   */
  createEffect(() => {
    if (!showBlendGallery()) {
      endBreedPreview()
    }
  })

  const [hoveredBlendName, setHoveredBlendName] = createSignal<string | null>(
    null,
  )

  const { showVariationSelector, varSelectorModalIsOpen } =
    createVariationSelector(history, props.hardwareTier)

  const { showCustomVariationEditor, customVariationEditorIsOpen } =
    createShowCustomVariationEditor()

  const isAnyModalOpen = () =>
    loadModalIsOpen() ||
    varSelectorModalIsOpen() ||
    exportModalIsOpen() ||
    customVariationEditorIsOpen()

  // Quick variation picker state
  const [quickPickerMode, setQuickPickerMode] =
    persistentSignal<QuickPickerMode>('quick-picker-mode', 'list')
  type QuickPickState = {
    tid: TransformId
    vid: VariationId
    type: TransformVariationType | TransformVariationType3D
  } | null
  const [quickPickState, setQuickPickState] = createSignal<QuickPickState>(null)
  const [hoveredVariationType, setHoveredVariationType] = createSignal<
    TransformVariationType | TransformVariationType3D | null
  >(null)
  const [hoveredCustomVarDef, setHoveredCustomVarDef] =
    createSignal<CustomVariationDef | null>(null)

  // Trigger for refreshing the custom variations list (incremented on delete/duplicate/modal close)
  const [customVarsVersion, setCustomVarsVersion] = createSignal(0)
  const customVariationsList = createMemo(() => {
    void customVarsVersion()
    return getCustomVariations()
  })

  // Status of a variation type for the per-transform list badge: 'none' for
  // built-ins, 'available' for a live custom variation, 'unavailable' for one a
  // flame still references after it was deleted from the library (or never
  // imported). Reads customVarsVersion so the badge re-evaluates on delete/import.
  function customStatus(type: string): 'none' | 'available' | 'unavailable' {
    if (!type.startsWith('custom_')) return 'none'
    void customVarsVersion()
    return isCustomVariationRegistered(type) ? 'available' : 'unavailable'
  }

  // Close the quick variation picker when its target transform/variation no
  // longer exists in the current flame — i.e. the flame was switched or toggled
  // 2D<->3D (both replace the flame with different transforms). The picker's ids
  // are meaningless for another flame; previewing a stale id produced NaN affine
  // matrices (the SVG `<g>` transform error) and invalid WebGPU textures.
  createEffect(() => {
    const state = quickPickState()
    if (
      state !== null &&
      flameDescriptor.transforms[state.tid]?.variations[state.vid] === undefined
    ) {
      setQuickPickState(null)
    }
  })

  // Compute a temporary flame with the hovered variation swapped in.
  // Falls back to the real flameDescriptor when nothing is hovered.
  const effectiveFlame = createMemo<FlameDescriptor>(() => {
    // Custom variation hover — add a new transform on top
    const hoveredCV = hoveredCustomVarDef()
    if (hoveredCV) {
      try {
        const clone: FlameDescriptor = deepClone(flameDescriptor)
        const transform = newDefaultTransform()
        transform.variations = {
          [generateVariationId()]: {
            type: hoveredCV.id,
            weight: 1,
            visible: true,
          },
        }
        clone.transforms[generateTransformId()] = transform
        return clone
      } catch {
        return flameDescriptor
      }
    }

    const hovered = hoveredVariationType()
    const state = quickPickState()
    if (!hovered || !state) return flameDescriptor
    try {
      const clone: FlameDescriptor = deepClone(flameDescriptor)
      const existingVar = clone.transforms[state.tid]?.variations[state.vid]
      if (existingVar) {
        clone.transforms[state.tid]!.variations[state.vid] = deepClone(
          getVariationDefault(hovered, existingVar.weight),
        )
      }
      return clone
    } catch {
      return flameDescriptor
    }
  })

  const finalRenderInterval = () =>
    // Home covers the workspace while it is showing, so the canvas has nothing
    // to display — pause it exactly as an open modal does rather than paying
    // for frames nobody sees. An export still wins: those run to completion in
    // the background whichever tab is in front.
    isAnyModalOpen() || (!workspaceIsVisible() && !onExportImage())
      ? Infinity
      : onExportImage()
        ? 0
        : DEFAULT_RENDER_INTERVAL_MS

  const resolvedBlendWeight = createMemo(() => {
    if (
      blendFlame() &&
      timeline.animationEnabled() &&
      timeline.tracks().length > 0
    ) {
      const val = timeline.resolveValueAtPath(
        'blendWeight',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return blendWeight()
  })

  const handlePaletteSelect = (palette: Palette) => {
    // If no palette was selected before, save the current "natural" colors.
    // Switching palettes preserves that first snapshot.
    const nextRestoreColors =
      selectedPaletteId() === ''
        ? captureTransformColors(flameDescriptor)
        : prePaletteColors()

    // ONE history entry: transform colors AND the palette itself (it lives in
    // renderSettings.palette), so a single undo fully reverts the apply —
    // previously the palette identity sat in signals and undo half-reverted
    // (colors back, palette grading still on). Palette provenance travels in
    // the same entry's undo/redo effects, so Unselect remains correct after
    // either history direction.
    withPaletteRestoreTransition(nextRestoreColors, 'Apply Palette', () => {
      executeCommand('flame.applyPalette', cmdContext, palette)
    })
  }

  const handlePaletteUnselect = () => {
    // One undoable entry: restore pre-palette colors + drop the palette. The
    // colors come from a UI signal, so they are passed as an argument —
    // nothing outside the document can be reconstructed on replay.
    const restoreColors = prePaletteColors()
    withPaletteRestoreTransition({}, 'Remove Palette', () => {
      executeCommand('flame.removePalette', cmdContext, restoreColors)
    })
  }

  // Shared by the toolbar Benchmark button and the `?benchmark` auto-open.
  const showBenchmark = createShowBenchmark()

  const showDocumentation = createShowDocumentation({
    hardwareTier: () => props.hardwareTier ?? null,
  })

  onMount(() => {
    // A recording is module-global and outlives this component, so one that
    // is already running belongs to a PREVIOUS workspace instance — this
    // mount brought a fresh store and a fresh document with it. Anything
    // recorded from here on would replay against the wrong initial flame, so
    // say so instead of letting the log claim fidelity it lost.
    if (isSessionRecording()) {
      reportUnreplayable(
        'Workspace remounted — the recording started against a different document',
      )
    }
    trackAppInit(Boolean(window.navigator?.gpu))
    loadCustomVariations()
    setCustomVarsVersion((v) => v + 1)
    void loadRandomizerHistoryEntries(MAX_RANDOMIZER_HISTORY_LIMIT).then(
      setRandomizerHistory,
    )
    if (props.autoOpenBenchmark) {
      void showBenchmark({ autoStart: props.autoStartBenchmark })
    }
    if (IS_DEV) {
      console.info('[share:app] onMount', {
        hasQueryFlame: !!props.flameFromQuery?.flame,
        hasWelcomeFlame: !!props.flameFromWelcome?.(),
        selectedPaletteId: selectedPaletteId(),
      })
    }

    // Esc clears the transform selection (deselect-all → nothing dimmed).
    const handleSelectionKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTransformId() !== null) {
        setSelectedTransformId(null)
      }
    }
    window.addEventListener('keydown', handleSelectionKeyDown)
    onCleanup(() => {
      window.removeEventListener('keydown', handleSelectionKeyDown)
    })
  })

  // The camera setters keep Solid's Setter contract (a value OR an updater),
  // but resolve it against the CURRENT state before dispatching, so the
  // command — and therefore the recorded action — carries a concrete value.
  // Every camera gesture is bracketed by startPreview/commit in
  // WheelZoomCamera2D/3D, so a whole pan or orbit folds into one recorded
  // step, matching the single undo entry it already produced.
  const setFlameZoom: Setter<number> = (value) => {
    const current = flameDescriptor.renderSettings.camera.zoom
    const next = clamp(
      typeof value === 'function' ? value(current) : value,
      MIN_CAMERA_ZOOM_VALUE,
      MAX_CAMERA_ZOOM_VALUE,
    )
    setRenderSetting('camera.zoom', next)
    return flameDescriptor.renderSettings.camera.zoom
  }
  const setFlamePosition: Setter<v2f> = (value) => {
    const current = vec2f(...flameDescriptor.renderSettings.camera.position)
    const next = typeof value === 'function' ? value(current) : value
    setRenderSetting('camera.position', [next.x, next.y])
    return flameDescriptor.renderSettings.camera.position
  }

  // Build a Setter<number> for a uniform camera3D scalar: detach the held-frame
  // preview (Blender-like), apply the value/updater into the store, return the
  // result. theta/phi/radius/fov/roll were byte-for-byte identical modulo the
  // field; zoom (clamped), position (vec2) and target3D (vec3) stay bespoke.
  function makeCamera3DSetter(
    field: 'theta' | 'phi' | 'radius' | 'fov' | 'roll',
  ): Setter<number> {
    return (value) => {
      const current = flameDescriptor.renderSettings.camera3D[field]
      const next =
        typeof value === 'function'
          ? (value as (p: number) => number)(current)
          : value
      setRenderSetting(`camera3D.${field}`, next)
      return flameDescriptor.renderSettings.camera3D[field]
    }
  }
  const setFlameTheta = makeCamera3DSetter('theta')
  const setFlamePhi = makeCamera3DSetter('phi')
  const setFlameRadius = makeCamera3DSetter('radius')
  // 3D auto-exposure: drive the real Exposure value from the camera zoom so the
  // slider visibly tracks it. exposure = base + strength*log(radius/refRadius),
  // neutral at the radius where the toggle was enabled. The exposure read is
  // untracked so manual edits between zooms aren't immediately reverted.
  // The target is a pure derivation of the camera/auto-exposure settings, so it
  // lives in a memo; the effect's only job is to write it back (reading the
  // current exposure untracked so it never re-subscribes to its own output).
  const autoExposureTarget = createMemo<number | null>(() => {
    const rs = flameDescriptor.renderSettings
    if (!rs.autoExposure3D || (rs.dimensions ?? 2) !== 3) return null
    const radius = rs.camera3D?.radius ?? 0
    const ref = rs.autoExposure3DRefRadius
    if (radius <= 0 || ref <= 0) return null
    return (
      rs.autoExposure3DBase + rs.autoExposure3DStrength * Math.log(radius / ref)
    )
  })
  createEffect(() => {
    const target = autoExposureTarget()
    if (target === null) return
    const current = untrack(() => flameDescriptor.renderSettings.exposure)
    if (Math.abs(target - current) > 1e-4) {
      // Silent: this is a derived follower of the camera radius. Recording it
      // injected a fresh history entry whenever an undo reverted the radius
      // (effects run after the undo completes) — destroying redo and making
      // undo fight the user.
      history.setSilently((draft) => {
        draft.renderSettings.exposure = target
      })
    }
  })
  const setFlameTarget3D = (value: Vec3 | ((prev: Vec3) => Vec3)) => {
    const current = new Float32Array(
      flameDescriptor.renderSettings.camera3D.target,
    )
    const newTarget = typeof value === 'function' ? value(current) : value
    setRenderSetting('camera3D.target', [
      newTarget[0] ?? 0,
      newTarget[1] ?? 0,
      newTarget[2] ?? 0,
    ])
    return new Float32Array(flameDescriptor.renderSettings.camera3D.target)
  }
  const setFlameFov = makeCamera3DSetter('fov')
  const setFlameRoll = makeCamera3DSetter('roll')

  // First-person "fly" navigation for 3D flames. Session-only (you don't want
  // to reopen the app mid-flight); the movement speed is remembered.
  const [flyMode, setFlyMode] = createSignal(false)
  const flySpeed = persistentSignal('camera3D/fly-speed', 1)

  const effectiveTheta = () => {
    if (timeline.isDrivingView()) {
      const val = timeline.resolveValueAtPath(
        'camera3D.theta',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.theta
  }
  const effectivePhi = () => {
    if (timeline.isDrivingView()) {
      const val = timeline.resolveValueAtPath(
        'camera3D.phi',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.phi
  }
  const effectiveRadius = () => {
    if (timeline.isDrivingView()) {
      const val = timeline.resolveValueAtPath(
        'camera3D.radius',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.radius
  }
  const effectiveTarget3D = () => {
    // Array properties are not easily animatable yet, so just use descriptor
    return new Float32Array(flameDescriptor.renderSettings.camera3D.target)
  }
  const effectiveRoll = () => {
    if (timeline.isDrivingView()) {
      const val = timeline.resolveValueAtPath(
        'camera3D.roll',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.roll
  }
  const effectiveFov = () => {
    if (timeline.isDrivingView()) {
      const val = timeline.resolveValueAtPath(
        'camera3D.fov',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera3D.fov
  }

  // Per-mode flame memory: the dimension toggle stashes the active flame and
  // restores the one last used in the target mode, so 2D work is never lost
  // by exploring 3D (and vice versa). First entry into 3D loads a starter.
  // The animation tracks are stashed alongside, because keyframe paths are
  // dimension-specific (transform ids, camera vs camera3D, affine a–f vs a–l)
  // and carrying them across a 2D↔3D switch would orphan them.
  let stashedFlame2D: FlameDescriptor | undefined
  let stashedFlame3D: FlameDescriptor | undefined
  let stashedTracks2D: TimelineTrack[] | undefined
  let stashedTracks3D: TimelineTrack[] | undefined

  createEffect(() => {
    const progress = animationExportProgress()
    if (animationExportRunning() && progress) {
      if (!timeline.isPlaying()) {
        timeline.setCurrentFrame(progress.currentTimelineFrame)
      }
    }
  })

  const onDrop = useAppDragAndDrop(
    {
      replace: (next, label) => {
        replaceLoadedFlame(next, label, snapshotOrigin('flame.file'))
      },
    },
    setLoadedAnimation,
    importReplaySession,
  )

  const timeline = createTimelineState()
  const captureTimelineSnapshot = (): TimelineSnapshot => ({
    config: deepClone(timeline.config()),
    currentFrame: timeline.currentFrame(),
    animationEnabled: animationEnabled(),
    autoKeyframe: timeline.autoKeyframe(),
    previewHeld: timeline.previewHeld(),
    tracks: deepClone(timeline.tracks()),
  })
  // One chronological undo across flame history + timeline snapshots —
  // Ctrl+Z/Ctrl+Y and the toolbar buttons all route through this.
  const undoRouter = createUndoRouter(history, timeline)

  // Audio-reactive loop: plays audio through AudioContext, drives
  // renderSettings at 30fps synced to playback time.
  useAudioReactive(
    audioEnabled,
    audioBuffer,
    audioMapping,
    (write) => {
      reportDerivedWorkspaceWrite()
      reportUnreplayableOnce(
        'live-audio-modulation',
        'Live audio modulation changed the flame without embedding the audio source',
      )
      history.setSilently(write)
    },
    liveAnalyzer,
    audioSource,
    playbackPaused,
    seekTarget,
    setPlaybackTime,
    fileAnalyzer,
    replaySuspendsAudioModulation,
  )

  // Sonification loop: synthesizes audio in real-time from flame structure.
  const sonificationLifecycle = useSonification(
    sonificationEnabled,
    sonificationConfig,
    flameDescriptor,
    replayDefersReactiveEffects,
  )

  /**
   * Capture the current flame as a downscaled PNG for OG link previews.
   *
   * Drives the same async export loop as the PNG export — via `setExportQuality`
   * at the *current* quality, so the on-screen canvas is unchanged. Unlike the
   * rAF loop, that loop renders even a fully settled flame and keeps running in
   * background tabs, so the capture reliably produces a frame (the earlier
   * hook-only path could time out and silently drop the preview). Captures the
   * clean, quality-graded image, then scales it down (aspect preserved).
   */
  async function captureOgImageBlob(maxDim = 1000): Promise<Blob | null> {
    const rawBlob = await new Promise<Blob | null>((resolve) => {
      let settled = false
      const finish = (b: Blob | null) => {
        if (settled) return
        settled = true
        setOnExportImage(undefined)
        setExportQuality(undefined)
        resolve(b)
      }
      // Best-effort with a generous safety net — never hang the share flow.
      const timer = setTimeout(() => {
        finish(null)
      }, 20000)
      setOnExportImage(
        () =>
          (canvas: HTMLCanvasElement, info?: { finalImageReady: boolean }) => {
            // Wait for the export driver's clean, quality-graded frame.
            if (info?.finalImageReady !== true) return
            clearTimeout(timer)
            canvas.toBlob(
              (b) => {
                finish(b)
              },
              'image/png',
              1,
            )
          },
      )
      // Same render path as PNG export; current quality keeps the canvas as-is.
      setExportQuality(qualityPresets[qualityPreset()])
    })
    if (!rawBlob) return null

    const url = URL.createObjectURL(rawBlob)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image()
        im.onload = () => {
          resolve(im)
        }
        im.onerror = reject
        im.src = url
      })
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const offscreen = document.createElement('canvas')
      offscreen.width = w
      offscreen.height = h
      const ctx = offscreen.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      const downscaled = await new Promise<Blob | null>((resolve) => {
        offscreen.toBlob((b) => {
          resolve(b)
        }, 'image/png')
      })
      if (!downscaled) return null

      // Embed the flame descriptor into the PNG (deflate-compressed zTXt chunk,
      // a few KB) so anyone who opens the shared link or downloads the preview
      // image can load it straight back into the app — same as Discord sharing.
      const tracks = timeline.tracks()
      const config = timeline.config()
      const hasAnimation = tracks.some((track) => track.keyframes.length > 0)
      const payload = hasAnimation
        ? { flame: flameDescriptor, animation: { tracks, config } }
        : flameDescriptor
      const encoded = await compressJsonQueryParam(payload)
      const pngBytes = new Uint8Array(await downscaled.arrayBuffer())
      return addFlameDataToPng(encoded, pngBytes)
    } catch {
      return null
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const { showShareLinkModal } = createShareLinkModal(
    flameDescriptor,
    () => timeline.tracks(),
    () => timeline.config(),
    captureOgImageBlob,
  )

  const { showDiscordShareModal } = createDiscordShareModal()

  const { showImportVariationsModal } = createImportVariationsModal()

  const { showShareVariationLinkModal } = createShareVariationLinkModal()

  const { showShareVariationLoadModal } = createShareVariationLoadModal()

  const { showMigrationModal } = createMigrationModal((flame) => {
    replaceLoadedFlame(flame, 'Load migrated flame')
  })

  /** Waits until the canvas backing-store size stops changing (the resize is
   *  reactive and may be debounced) so export dimensions read a settled size. */
  async function waitForStableCanvasSize(
    canvas: HTMLCanvasElement,
    timeoutMs = 2000,
  ) {
    const startMs = Date.now()
    let lastWidth = -1
    let lastHeight = -1
    while (Date.now() - startMs < timeoutMs) {
      await new Promise<void>((resolve) =>
        setTimeout(() => {
          resolve()
        }, 60),
      )
      if (canvas.width === lastWidth && canvas.height === lastHeight) return
      lastWidth = canvas.width
      lastHeight = canvas.height
    }
  }

  async function startAnimationExport(
    config: AnimationExportConfig,
    _placeholderCanvas: HTMLCanvasElement,
  ) {
    const canvas = document.querySelector<HTMLCanvasElement>(`.${ui.canvas}`)
    if (!canvas) {
      showToast('Canvas not found')
      return
    }

    // True high-resolution export: render the canvas backing store at the exact
    // export dimensions (resolution + aspect) for the duration of the export,
    // instead of bitmap-upscaling the viewport canvas (which only interpolated
    // pixels and produced soft output).
    setExportDimensions({ width: config.width, height: config.height })
    await waitForStableCanvasSize(canvas)

    // The canvas already renders at the export dimensions.
    const { promise } = createAnimationExport(
      config,
      canvas,
      timeline,
      flameDescriptor,
      // Silent writer: the export applies animated state once PER FRAME —
      // recording it buried the user's real edits under hundreds of
      // per-frame history entries (uncapped stack).
      history.setSilently,
      setOnExportImage,
    )

    promise
      .then((blob) => {
        if (blob.size === 0) return // cancelled
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'animation.mp4'
        a.click()
        URL.revokeObjectURL(url)
        showToast('Animation exported')
      })

      .catch((err: unknown) => {
        console.error('Animation export failed:', err)
        showToast('Animation export failed')
      })
      .finally(() => {
        setExportDimensions(undefined)
      })
  }

  const { showExportPngDialog, quickExport, exportModalIsOpen } =
    createExportPngDialog(
      flameDescriptor,
      () => timeline,
      pixelRatio,
      setPixelRatio,
      setOnExportImage,
      (patch) => {
        executeCommand('flame.setMetadata', cmdContext, patch)
      },
      () => selectedPalette(),
      () => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          `.${ui.canvas}`,
        )
        if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
          return canvas.clientWidth / canvas.clientHeight
        }
        return window.innerWidth / window.innerHeight
      },
      enqueueImageJob,
      enqueueAnimationJob,
      startAnimationExport,
      () => blendFlame(),
      () => resolvedBlendWeight(),
      () => audioBuffer(),
      () => audioMapping().mappings,
    )

  async function shareToDiscord() {
    // Step 1: Capture the current flame at its current resolution to prevent flickering/resizing
    const rawBlob = await new Promise<Blob | null>((resolve) => {
      setOnExportImage(() => (canvas: HTMLCanvasElement) => {
        setOnExportImage(undefined)
        canvas.toBlob(
          (b) => {
            resolve(b)
          },
          'image/png',
          1,
        )
      })
    })

    if (!rawBlob) {
      showToast('Failed to capture flame image')
      return
    }

    // Step 2: Embed flame data into the PNG so it can be loaded back
    const tracks = timeline.tracks()
    const config = timeline.config()
    const hasAnimation = tracks.some((track) => track.keyframes.length > 0)
    const payload = hasAnimation
      ? { flame: flameDescriptor, animation: { tracks, config } }
      : flameDescriptor
    const encoded = await compressJsonQueryParam(payload)
    let pngBytes = new Uint8Array(await rawBlob.arrayBuffer())
    pngBytes = new Uint8Array(
      await addFlameDataToPng(encoded, pngBytes).arrayBuffer(),
    )
    const blob = new Blob([pngBytes], { type: 'image/png' })

    // Step 3: Show the modal — it drives the send (with Turnstile) and offers a
    // manual download / copy-link fallback if the direct post fails.
    const previewUrl = URL.createObjectURL(blob)

    // Build a proper share link via the same path as the Share Link modal
    // (short `?s=` link when available, inline `?flame=` link otherwise) so the
    // fallback "Copy share link" is instant and correct. Runs in parallel; the
    // OG preview upload is best-effort so the copied link shows a rich card.
    const sharePromise = createShareLink({
      flame: flameDescriptor,
      animation: hasAnimation ? { tracks, config } : undefined,
    })
    void sharePromise.then(async ({ encoded: shareEncoded }) => {
      const ogBlob = await captureOgImageBlob()
      if (!ogBlob) return
      const { title, description } = deriveOgMeta(flameDescriptor)
      void uploadOgPreview({
        encoded: shareEncoded,
        blob: ogBlob,
        title,
        description,
      })
    })

    const shared = await showDiscordShareModal({
      previewUrl,
      initialMetadata: flameDescriptor.metadata,
      onShare: (meta, token) => sendFlameToDiscord(blob, meta, token),
      onDownload: () => {
        downloadBlob(blob, 'flame.png')
      },
      onCopyLink: async () => {
        try {
          const { primaryUrl } = await sharePromise
          await globalThis.navigator.clipboard.writeText(primaryUrl)
          return true
        } catch {
          return false
        }
      },
      discordUrl: '/discord',
    })
    URL.revokeObjectURL(previewUrl)
    if (shared) showToast('Shared to Discord')
  }

  const { showLogoFaviconGenerator } = createLogoFaviconGenerator(
    flameDescriptor,
    () => selectedPalette(),
    (flame) => {
      replaceLoadedFlame(flame, 'Load generated logo')
    },
  )

  const [randomizerHistory, setRandomizerHistory] = createSignal<
    RandomizerHistoryEntry[]
  >([])

  const [selectedHistoryTimestamp, setSelectedHistoryTimestamp] =
    createSignal<number>(0)

  const handleClearHistory = async () => {
    await clearRandomizerHistory()
    setRandomizerHistory([])
  }

  function captureMainThumbnail(size: number): Promise<string | null> {
    const canvas = document.querySelector<HTMLCanvasElement>(`.${ui.canvas}`)
    if (canvas === null) return Promise.resolve(null)
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob === null) {
          resolve(null)
          return
        }
        const url = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => {
          const offscreen = document.createElement('canvas')
          offscreen.width = size
          offscreen.height = size
          const ctx = offscreen.getContext('2d')!
          ctx.drawImage(img, 0, 0, size, size)
          URL.revokeObjectURL(url)
          resolve(offscreen.toDataURL('image/png'))
        }
        img.onerror = () => {
          URL.revokeObjectURL(url)
          resolve(null)
        }
        img.src = url
      }, 'image/png')
    })
  }

  type RandomizeSettings = {
    skipIters: boolean
    skipItersRange?: [number, number]
    exposure: boolean
    exposureRange?: [number, number]
    contrast: boolean
    contrastRange?: [number, number]
    gamma: boolean
    gammaRange?: [number, number]
    highlightPower: boolean
    highlightPowerRange?: [number, number]
    vibrancy: boolean
    vibrancyRange?: [number, number]
  }
  // Apply the randomizer's per-field "randomize this setting" toggles onto a
  // render-settings object. Extracted so Generate and Mutate share one source
  // of truth — the two copies were byte-identical and would silently drift.
  const applyRandomizeSettings = (
    rs: FlameDescriptor['renderSettings'],
    s: RandomizeSettings,
  ): void => {
    if (s.skipIters) {
      const r = s.skipItersRange ?? [5, 30]
      rs.skipIters = Math.floor(randomRange(r[0], r[1] + 1))
    }
    if (s.exposure) {
      const r = s.exposureRange ?? [-2, 2]
      rs.exposure = randomRange(r[0], r[1])
    }
    if (s.contrast) {
      const r = s.contrastRange ?? [0.5, 4.0]
      rs.contrast = randomRange(r[0], r[1])
    }
    if (s.gamma) {
      const r = s.gammaRange ?? [1.0, 3.5]
      rs.gamma = randomRange(r[0], r[1])
    }
    if (s.highlightPower) {
      const r = s.highlightPowerRange ?? [0.1, 0.9]
      rs.highlightPower = randomRange(r[0], r[1])
    }
    if (s.vibrancy) {
      const r = s.vibrancyRange ?? [0.2, 0.8]
      rs.vibrancy = randomRange(r[0], r[1])
    }
  }
  const runGenerateFlame = async (
    config: GenerateRandomFlameConfig,
    randomizeSettings: RandomizeSettings,
    recordHistory: boolean,
  ) => {
    if (recordHistory) {
      const thumb = await captureMainThumbnail(128)
      if (thumb) {
        const entry: RandomizerHistoryEntry = {
          flame: deepClone(flameDescriptor),
          thumbnail: thumb,
          timestamp: Date.now(),
        }
        const updated = await addRandomizerHistoryEntry(
          entry,
          MAX_RANDOMIZER_HISTORY_LIMIT,
        )
        setRandomizerHistory(updated)
      }
    }

    setSelectedHistoryTimestamp(0)

    const newFlame = generateRandomFlame(config)
    const prevRs = flameDescriptor.renderSettings
    const rs = deepClone(prevRs)

    applyRandomizeSettings(rs, randomizeSettings)

    newFlame.renderSettings = rs
    // Recorded as a load carrying the finished flame. The seeded
    // flame.randomize command would read better in a log, but this handler
    // also runs applyRandomizeSettings over the render settings with ambient
    // randomness; carrying the result keeps replay exact until that is
    // seeded too.
    executeFlameLoad(
      newFlame,
      'Randomize Flame',
      snapshotOrigin('flame.randomize'),
    )
  }

  const runMutateFlame = async (
    config: GenerateRandomFlameConfig,
    randomizeSettings: RandomizeSettings,
    mutationSettings: MutateFlameOptions,
    recordHistory: boolean,
  ) => {
    if (recordHistory) {
      const thumb = await captureMainThumbnail(128)
      if (thumb) {
        const entry: RandomizerHistoryEntry = {
          flame: deepClone(flameDescriptor),
          thumbnail: thumb,
          timestamp: Date.now(),
        }
        const updated = await addRandomizerHistoryEntry(
          entry,
          MAX_RANDOMIZER_HISTORY_LIMIT,
        )
        setRandomizerHistory(updated)
      }
    }

    setSelectedHistoryTimestamp(0)

    const mutatedFlame = mutateFlame(flameDescriptor, config, mutationSettings)
    const prevRs = flameDescriptor.renderSettings
    const rs = deepClone(prevRs)

    applyRandomizeSettings(rs, randomizeSettings)

    mutatedFlame.renderSettings = rs
    // Same reasoning as Randomize above.
    executeFlameLoad(
      mutatedFlame,
      'Mutate Flame',
      snapshotOrigin('flame.mutate'),
    )
  }

  // Keep the randomizer card visually fixed across a flame swap. Changing the
  // transform count reflows the sidebar (affine/colour list rows + transform
  // cards), which would otherwise shove the Generate button up/down under the
  // cursor. Measure the card before, correct scrollTop once the DOM has settled.
  const anchorSidebarToRandomizer = (): (() => void) => {
    if (!sidebarScrollRef || !randomizerCardRef) return () => {}
    const before = randomizerCardRef.getBoundingClientRect().top
    return () => {
      requestAnimationFrame(() => {
        if (!sidebarScrollRef || !randomizerCardRef) return
        sidebarScrollRef.scrollTop +=
          randomizerCardRef.getBoundingClientRect().top - before
      })
    }
  }

  /**
   * Reveal the sidebar (it may be closed, auto-hidden on mobile, covered by the
   * blend gallery / quick variation picker, or showing a diff), open the Flame
   * Randomizer card and scroll it into view.
   *
   * `expandAnimation` additionally opens the card's Animation Settings section —
   * what the timeline's "Animate" button wants, and what Home's Randomizer card
   * does NOT (it is advertising the generator, not the animation generator).
   * Overlay dismissal must happen BEFORE the epoch bump: mounting the card
   * swallows the current epoch as its initial value, so a bump-then-mount order
   * would lose the expansion.
   */
  const openRandomizerCard = ({
    expandAnimation = false,
    preserveSonificationOutput = false,
  } = {}) => {
    setShowSidebar(true)
    setSidebarHidden(false)
    setSidebarDiffView(null)
    setShowBlendGallery(false)
    setShowAudioPanel(false)
    if (preserveSonificationOutput) {
      setShowSonificationPanel(false)
    } else {
      closeSonificationPanelAsAuthoredAction()
    }
    setQuickPickState(null)
    setRandomizerOpen(true)
    if (expandAnimation) {
      setRandomizerAnimEpoch((e) => e + 1)
    }
    setTimeout(() => {
      randomizerCardRef?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  // Timeline "Animate" button.
  const openAnimationGenerator = () => {
    openRandomizerCard({ expandAnimation: true })
  }

  /**
   * Show the sidebar and clear whatever is currently covering it.
   *
   * Every sidebar panel below lives behind the same chain of `Show`s
   * (diff view > blend gallery > audio > sonification > the editor), so opening
   * one means closing the others as well as un-hiding the sidebar itself — a
   * hand-off that only set its own flag would silently do nothing on mobile, or
   * with a diff open.
   */
  const revealSidebar = () => {
    setShowSidebar(true)
    setSidebarHidden(false)
    setSidebarDiffView(null)
    setShowBlendGallery(false)
    setShowAudioPanel(false)
    setShowSonificationPanel(false)
  }

  /**
   * Put the workspace back to the state a fresh session would be in, so a flame
   * handed over from Home (or the welcome screen) lands the same way whether it
   * is the first one opened or the fifth.
   *
   * The workspace stays MOUNTED behind Home — that is deliberate (App.tsx: the
   * editor keeps its state and its canvas size), but it means every hand-off
   * inherits whatever the previous one left behind. Nothing here was reset,
   * and the results were exactly the three things users reported:
   *
   *  - **panels left open.** `openCapability` opens a panel and nothing ever
   *    closes it, so the Audio card opened by one Explore flame was still
   *    covering the sidebar for the next, unrelated one.
   *  - **animation running on a still flame.** The hand-off only ever LOADED
   *    tracks (`tracks.length > 0`); it never cleared them. So the previous
   *    flame's timeline was still there, still playing, on a flame that has no
   *    animation of its own.
   *  - **"too bright".** Same cause, one step further: while the timeline is
   *    driving the view, `applyTimelineToFlame` writes the old flame's keyframed
   *    values — vibrancy, exposure, brightness — onto the new descriptor every
   *    frame. A leftover exposure track reads exactly as a washed-out flame.
   *
   * One reset for all of them rather than a clear per symptom: the next symptom
   * is then a line in this function, not a new bug. It restores the DECLARED
   * defaults (`DEFAULT_ANIMATION_ENABLED`, `isWideLayout()`) rather than
   * plausible-looking values, because "identical to opening it first" is the
   * actual requirement — and layout state changes the canvas size, so an
   * approximation would render a visibly different flame.
   *
   * Not reset: the flame document itself (the caller replaces it wholesale, and
   * that covers palette/blend/morph/exposure, which all live in
   * `renderSettings`), and anything the user owns across documents — theme,
   * quality preset, sidebar layout, autosave preference.
   */
  const resetWorkspaceForHandoff = () => {
    // ── Overlays and panels ────────────────────────────────────────────────
    // Everything `openCapability`/`revealSidebar` can open, plus the pickers a
    // previous session could have left covering the sidebar.
    setShowSidebar(true)
    setSidebarHidden(!isWideLayout())
    setSidebarDiffView(null)
    setShowBlendGallery(false)
    setBlendIntent('blend')
    setQuickPickState(null)
    setRandomizerOpen(false)
    setShowAudioPanel(false)
    setShowSonificationPanel(false)

    // ── Live modulation ────────────────────────────────────────────────────
    // Both loops write render settings continuously while enabled, so left on
    // they keep driving the NEXT flame — the audio one through
    // `setFlameDescriptor` itself.
    setAudioEnabled(false)
    setSonificationEnabled(false)

    // ── Timeline ───────────────────────────────────────────────────────────
    // Order matters: pause before dropping the tracks so the playback interval
    // cannot advance a frame against an empty timeline, and clear `previewHeld`
    // AFTER `setCurrentFrame` — `goToFrame` deliberately sets it, which would
    // leave the canvas "holding" frame 0 of nothing.
    timeline.pause()
    timeline.setIsScrubbing(false)
    timeline.setConfig(defaultTimelineConfig())
    timeline.setCurrentFrame(0)
    timeline.loadTracks([])
    timeline.setPreviewHeld(false)
    timeline.setAnimationEnabled(DEFAULT_ANIMATION_ENABLED)
    setAnimationEnabled(DEFAULT_ANIMATION_ENABLED)
    setShowTimeline(isWideLayout())

    // ── Per-document stashes and modes ─────────────────────────────────────
    // In-memory state that belongs to the flame being replaced: the pre-palette
    // colours Unselect restores, the randomizer-history highlight, and 3D fly
    // mode (session-only, and meaningless on a flame you have not flown).
    setPrePaletteColors({})
    setSelectedHistoryTimestamp(0)
    setFlyMode(false)
  }

  /**
   * Open the tool a Home "Explore" card advertises. The names are the
   * `capability` values gallery-admin accepts (scripts/gallery-admin.mjs).
   *
   * Each one lands on the same surface its own toolbar entry does, so there is
   * one behaviour to maintain rather than a parallel Home-only path:
   *
   *  - `animation`    — the timeline, with animation enabled. An animated row
   *                     also loads its tracks and starts playing through the
   *                     `loadedAnimation` effect, which is the same thing the
   *                     Load Flame modal does.
   *  - `randomizer`   — the Flame Randomizer card, opened and scrolled to.
   *  - `genetics`     — Breed: the Genetics pull-up menu itself cannot be opened
   *                     programmatically (PullUpMenu owns a private `open`
   *                     signal), so this calls what its first entry calls and
   *                     lands the user on "pick the second parent", which is
   *                     where breeding actually starts.
   *  - `audio`        — the Audio Reactive panel.
   *  - `sonification` — the Sonification panel.
   */
  const openCapability = (capability: string) => {
    switch (capability) {
      case 'animation':
        setAnimationEnabled(true)
        setShowTimeline(true)
        return
      case 'randomizer':
        openRandomizerCard()
        return
      case 'genetics':
        revealSidebar()
        pickBreedFlame()
        return
      case 'audio':
        revealSidebar()
        setShowAudioPanel(true)
        return
      case 'sonification':
        revealSidebar()
        setShowSonificationPanel(true)
        return
      default:
        // Content can be newer than this build: gallery_items.capability is a
        // free-text column and gallery-admin only WARNS about an unknown value.
        // Opening the flame alone is the right degradation.
        console.warn(`No tool mapped for capability "${capability}"`)
    }
  }

  // Drain the Home hand-off once the flame it came with has landed.
  createEffect(() => {
    const capability = pendingCapability()
    if (capability === undefined) {
      return
    }
    setPendingCapability(undefined)
    openCapability(capability)
  })

  // Guard randomize/mutate so a slow run (history thumbnail capture + render)
  // can't be re-triggered until it finishes — rapid clicks would otherwise pile
  // up concurrent captures and lag the UI. Mirrors the logo/favicon generator.
  const handleGenerateFlame = async (
    ...args: Parameters<typeof runGenerateFlame>
  ) => {
    if (isRandomizing()) return
    setIsRandomizing(true)
    const releaseAnchor = anchorSidebarToRandomizer()
    try {
      await runGenerateFlame(...args)
    } finally {
      setIsRandomizing(false)
      releaseAnchor()
    }
  }

  const handleMutateFlame = async (
    ...args: Parameters<typeof runMutateFlame>
  ) => {
    if (isRandomizing()) return
    setIsRandomizing(true)
    const releaseAnchor = anchorSidebarToRandomizer()
    try {
      await runMutateFlame(...args)
    } finally {
      setIsRandomizing(false)
      releaseAnchor()
    }
  }

  const handleUpdateRenderSettings = (
    settings: Partial<FlameDescriptor['renderSettings']>,
  ) => {
    executeCommand(
      'flame.updateRenderSettings',
      cmdContext,
      settings,
      'randomizer',
    )
  }

  // Deleting a custom variation the CURRENT flame uses breaks its rendering,
  // and the library lives outside the flame's undo history — so confirm when
  // referenced, and always offer recovery through the toast's Undo action.
  const handleDeleteCustomVariation = async (def: CustomVariationDef) => {
    const usedByFlame = Object.values(flameDescriptor.transforms).some(
      (transform) =>
        Object.values(transform.variations).some(
          (variation) => variation.type === def.id,
        ),
    )
    if (usedByFlame) {
      const confirmed = await _requestModal<boolean>({
        content: ({ respond }) => (
          <ConfirmDeleteVariationModal name={def.name} respond={respond} />
        ),
      })
      if (!confirmed) return
    }
    deleteCustomVariation(def.id)
    setCustomVarsVersion((v) => v + 1)
    showToast(`Deleted custom variation "${def.name}"`, 10000, [
      {
        label: 'Undo',
        onClick: () => {
          if (restoreCustomVariation(def)) {
            setCustomVarsVersion((v) => v + 1)
            showToast(`Restored "${def.name}"`)
          } else {
            showToast(`Could not restore "${def.name}"`)
          }
        },
      },
    ])
  }

  const handleLoadHistory = (entry: RandomizerHistoryEntry) => {
    setSelectedHistoryTimestamp(entry.timestamp)
    // Loading a history entry is a fresh starting point: keep unsaved work
    // recoverable and don't autosave the untouched loaded flame.
    flushDirtyToRecents()
    executeFlameLoad(
      entry.flame,
      'Load History Flame',
      snapshotOrigin('flame.history'),
    )
    markLoadedBaseline()
  }

  const handleRandomizeAnimation = (
    presetIds: string[],
    clearFirst: boolean,
  ) => {
    if (presetIds.length === 0) return

    isRandomizingAnimation = true
    try {
      // One click = one undo step, regardless of how many keyframes the
      // selected presets write (previously each addKeyframe pushed its own
      // snapshot — dozens of Ctrl+Z to revert, and enough to overflow the
      // undo cap and lose the pre-click animation entirely).
      runTimelineSnapshotMutation(
        recorderTimeline,
        snapshotOrigin('timeline.random', presetIds.join(', ')),
        () => {
          randomizeAnimationTracks(presetIds, clearFirst)
        },
      )
      executeCommand('view.setShowTimeline', cmdContext, true)
    } finally {
      setTimeout(() => {
        isRandomizingAnimation = false
      }, 200)
    }
  }

  const randomizeAnimationTracks = (
    presetIds: string[],
    clearFirst: boolean,
  ) => {
    {
      if (clearFirst) timeline.clearAllTracks()

      const start = timeline.config().startFrame
      const end = timeline.config().endFrame
      const mid = Math.floor((start + end) / 2)

      const addLoopingTrack = (
        paramPath: string,
        startVal: number,
        minPerturb: number,
        maxPerturb: number,
        easing: EasingCurve = 'easeInOut',
      ) => {
        const perturb =
          randomRange(minPerturb, maxPerturb) * (Math.random() > 0.5 ? 1 : -1)
        const midVal = startVal + perturb
        timeline.addKeyframe(paramPath, start, startVal, easing)
        timeline.addKeyframe(paramPath, mid, midVal, easing)
        timeline.addKeyframe(paramPath, end, startVal, easing)
      }

      const addContinuousTrack = (
        paramPath: string,
        startVal: number,
        delta: number,
      ) => {
        timeline.addKeyframe(paramPath, start, startVal, 'linear')
        timeline.addKeyframe(paramPath, end, startVal + delta, 'linear')
      }

      for (const preset of presetIds) {
        if (preset === 'pan') {
          const camX = flameDescriptor.renderSettings.camera?.position?.[0] ?? 0
          const camY = flameDescriptor.renderSettings.camera?.position?.[1] ?? 0
          addLoopingTrack('camera.x', camX, 0.1, 0.4)
          addLoopingTrack('camera.y', camY, 0.1, 0.4)
        } else if (preset === 'zoom') {
          const zoom = flameDescriptor.renderSettings.camera?.zoom ?? 1
          addLoopingTrack('camera.zoom', zoom, zoom * 0.15, zoom * 0.4)
        } else if (preset === 'rot') {
          const rot = flameDescriptor.renderSettings.camera?.rotation ?? 0
          const dir = Math.random() > 0.5 ? 1 : -1
          addContinuousTrack('camera.rotation', rot, dir * 2 * Math.PI)
        } else if (preset === 'color') {
          const phase = flameDescriptor.renderSettings.palettePhase ?? 0
          const dir = Math.random() > 0.5 ? 1 : -1
          addContinuousTrack('palettePhase', phase, dir * randomRange(1, 3))
        } else if (preset === 'transformColor') {
          // Drift each transform's OkLab (a, b) color coordinate in a loop —
          // animates the per-transform colors (the color scrub inputs), distinct
          // from palette cycling above.
          for (const [tid, t] of Object.entries(flameDescriptor.transforms)) {
            addLoopingTrack(`transform.${tid}.color.x`, t.color.x, 0.1, 0.3)
            addLoopingTrack(`transform.${tid}.color.y`, t.color.y, 0.1, 0.3)
          }
        } else if (preset === 'vibrancy') {
          const vib = flameDescriptor.renderSettings.vibrancy ?? 0.5
          const minPert = vib > 0.5 ? -0.3 : 0.1
          const maxPert = vib > 0.5 ? -0.1 : 0.3
          addLoopingTrack('vibrancy', vib, minPert, maxPert)
        } else if (preset === 'orbit') {
          const theta = flameDescriptor.renderSettings.camera3D?.theta ?? 0
          const phi =
            flameDescriptor.renderSettings.camera3D?.phi ?? Math.PI / 2
          const radius = flameDescriptor.renderSettings.camera3D?.radius ?? 5

          addContinuousTrack('camera3D.theta', theta, 2 * Math.PI)
          addLoopingTrack('camera3D.phi', phi, 0.1, 0.3)
          addLoopingTrack(
            'camera3D.radius',
            radius,
            radius * 0.1,
            radius * 0.25,
          )
        } else if (preset === 'finalTransform') {
          const q1 = Math.floor(start + (end - start) * 0.25)
          const q3 = Math.floor(start + (end - start) * 0.75)
          const dir = Math.random() > 0.5 ? 1 : -1

          // Rotate the final transform a full turn. The affine matrix is
          // [[a, b], [d, e]] (c, f are translation), so rotation by θ is
          // a = e = cos θ, b = -sin θ, d = sin θ (`dir` flips the spin).
          // θ steps 0,90,180,270,360 → cos: 1,0,-1,0,1  sin: 0,1,0,-1,0
          timeline.addKeyframe('finalTransform.a', start, 1, 'linear')
          timeline.addKeyframe('finalTransform.a', q1, 0, 'linear')
          timeline.addKeyframe('finalTransform.a', mid, -1, 'linear')
          timeline.addKeyframe('finalTransform.a', q3, 0, 'linear')
          timeline.addKeyframe('finalTransform.a', end, 1, 'linear')

          timeline.addKeyframe('finalTransform.e', start, 1, 'linear')
          timeline.addKeyframe('finalTransform.e', q1, 0, 'linear')
          timeline.addKeyframe('finalTransform.e', mid, -1, 'linear')
          timeline.addKeyframe('finalTransform.e', q3, 0, 'linear')
          timeline.addKeyframe('finalTransform.e', end, 1, 'linear')

          timeline.addKeyframe('finalTransform.b', start, 0, 'linear')
          timeline.addKeyframe('finalTransform.b', q1, -dir, 'linear')
          timeline.addKeyframe('finalTransform.b', mid, 0, 'linear')
          timeline.addKeyframe('finalTransform.b', q3, dir, 'linear')
          timeline.addKeyframe('finalTransform.b', end, 0, 'linear')

          timeline.addKeyframe('finalTransform.d', start, 0, 'linear')
          timeline.addKeyframe('finalTransform.d', q1, dir, 'linear')
          timeline.addKeyframe('finalTransform.d', mid, 0, 'linear')
          timeline.addKeyframe('finalTransform.d', q3, -dir, 'linear')
          timeline.addKeyframe('finalTransform.d', end, 0, 'linear')
        }
      }

      // The workspace signal drives rendering/FloatingActions; the raw
      // timeline signal is captured by the deterministic result snapshot.
      // Keep both coherent before runWithSingleUndo takes that snapshot.
      timeline.setAnimationEnabled(true)
      setAnimationEnabled(true)
    }
  }

  // Smart animation: apply a random curated preset from each category for a full
  // multi-aspect loop (vs the selected-items random tracks above). Honors the
  // same clear-first toggle.
  const handleSmartAnimation = (clearFirst: boolean) => {
    isRandomizingAnimation = true
    try {
      // One click = one undo step (see handleRandomizeAnimation).
      runTimelineSnapshotMutation(
        recorderTimeline,
        snapshotOrigin('timeline.smart'),
        () => {
          if (clearFirst) timeline.clearAllTracks()
          smartRandomAnimation(flameDescriptor, timeline)
          timeline.setAnimationEnabled(true)
          setAnimationEnabled(true)
        },
      )
      executeCommand('view.setShowTimeline', cmdContext, true)
    } finally {
      setTimeout(() => {
        isRandomizingAnimation = false
      }, 200)
    }
  }

  const runTourCommand: { fn?: (id: string, ...args: unknown[]) => void } = {}

  /** Active animateValue loops -- each entry snaps to its end value when called. */
  const activeAnimations = new Set<() => void>()

  const tourContext: TourContext = {
    setSidebarOpen: setShowSidebar,
    sidebarOpen: showSidebar,
    setTimelineOpen: setShowTimeline,
    timelineOpen: showTimeline,
    setAnimationEnabled,
    animationEnabled,
    openModal: (name) => {
      if (timeline.isPlaying()) timeline.pause()
      switch (name) {
        case 'loadFlame':
          void showLoadFlameModal()
          break
        case 'exportPng':
          void showExportPngDialog()
          break
        case 'shareLink':
          void showShareLinkModal()
          break
      }
    },
    closeCurrentModal: () => {},
    scrollToTarget: (selector) => {
      document
        .querySelector(selector)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    executeCommand: (id, ...args) => {
      console.info(
        '[tourContext:executeCommand]',
        id,
        'args:',
        ...args,
        'fn:',
        !!runTourCommand.fn,
      )
      runTourCommand.fn?.(id, ...args)
    },
    animateValue: (start, end, durationMs, onUpdate) => {
      let cancelled = false
      const startTime = window.performance.now()

      function loop(currentTime: number) {
        if (cancelled) return
        const elapsed = currentTime - startTime
        if (elapsed >= durationMs) {
          onUpdate(end)
          activeAnimations.delete(finish)
          return
        }
        // Smooth ease-out cubic
        const t = Math.min(1, elapsed / durationMs)
        const eased = 1 - Math.pow(1 - t, 3)
        onUpdate(start + (end - start) * eased)
        requestAnimationFrame(loop)
      }

      function finish() {
        if (!cancelled) {
          cancelled = true
          onUpdate(end)
        }
        activeAnimations.delete(finish)
      }

      activeAnimations.add(finish)
      requestAnimationFrame(loop)
      return finish
    },
    finishAllAnimations: () => {
      // Snap every running animation to its end value
      for (const finish of activeAnimations) {
        finish()
      }
      activeAnimations.clear()
    },
    snapshotFlame: () => {
      return deepClone(flameDescriptor)
    },
    restoreFlame: (snapshot: unknown) => {
      // Use history.replace() which calls the raw setStore(reconcile(value))
      // directly. We cannot use setFlameDescriptor(reconcile(...)) because
      // setFlameDescriptor is a HistorySetter that wraps calls in
      // produceWithPatches (structurajs draft proxy), and reconcile expects
      // a SolidJS store proxy -- mixing the two causes "node.$ is not a
      // function".
      history.replace(snapshot as FlameDescriptor, 'tour:restore')
    },
  }

  const readableIds = createMemo(() =>
    buildReadableIds(flameDescriptor.transforms),
  )

  // Sync animation enabled state into timeline so diamonds can gate on it
  createEffect(() => {
    const enabled = animationEnabled()
    if (IS_DEV) {
      console.info(
        '[anim] sync effect: setting timeline.animationEnabled →',
        enabled,
      )
    }
    timeline.setAnimationEnabled(enabled)
  })

  // Apply animation tracks when loaded from the LoadFlame modal
  createEffect(() => {
    const anim = loadedAnimation()
    if (!anim) return
    const beforeTimeline = JSON.stringify(captureTimelineSnapshot())
    const beforeShowTimeline = showTimeline()
    const showTimelineAfterLoad = anim.tracks.length > 0

    // Keep live load-boundary semantics, then log one deterministic result
    // snapshot instead of the raw setter sequence (and instead of rerunning
    // any generator that may have produced these tracks).
    withRecordingSuppressed(() => {
      if (anim.tracks.length === 0) {
        // Plain flame loaded — clear animation state
        if (IS_DEV) console.info('[anim] clearing tracks — plain flame loaded')
        timeline.loadTracks([])
        timeline.setIsPlaying(false)
        timeline.setAnimationEnabled(false)
        setAnimationEnabled(false)
        setShowTimeline(false)
      } else {
        if (IS_DEV) {
          console.info(
            '[anim] loading animation with',
            anim.tracks.length,
            'tracks:',
            anim.tracks.map((t) => t.parameterPath),
          )
        }
        timeline.loadTracks(anim.tracks)
        timeline.setAnimationEnabled(true)
        setAnimationEnabled(true)
        setShowTimeline(true)
        timeline.setConfig({ ...timeline.config(), loop: true })
        timeline.goToFrame(0)
        timeline.play()
      }
    })

    if (anim.tracks.length > 0) {
      reportTimelineTransport(
        'Loaded animation autoplay is wall-clock transport and is not replayed',
      )
    }

    const afterTimeline = captureTimelineSnapshot()
    if (JSON.stringify(afterTimeline) !== beforeTimeline) {
      const origin =
        anim.tracks.length > 0
          ? snapshotOrigin('timeline.load')
          : snapshotOrigin('timeline.clear')
      recordSyntheticAction(
        'timeline.loadTimeline',
        [afterTimeline, origin],
        snapshotOriginLabel(origin) ?? 'Update animation',
      )
    }
    if (showTimelineAfterLoad !== beforeShowTimeline) {
      recordSyntheticAction(
        'view.setShowTimeline',
        [showTimelineAfterLoad],
        showTimelineAfterLoad ? 'Show timeline' : 'Hide timeline',
      )
    }

    if (anim.tracks.length > 0) {
      showToast(
        `Animation loaded: ${anim.tracks.length} track${anim.tracks.length !== 1 ? 's' : ''} — ${anim.tracks.length * 2} keyframes`,
        3500,
      )
    }
    // Clear the signal so re-selecting the same animation triggers again
    clearLoadedAnimation()
    // A load is a fresh starting point, not an edit — reset dirty tracking.
    markLoadedBaseline()
  })

  // ── Autosave & save-awareness ──────────────────────────────────────────
  // Baseline JSON of the last loaded/saved state; the flame is "dirty" when
  // the current state differs. Loads reset the baseline (and the editing
  // clock), so untouched examples are never autosaved; any edit diverges.
  // Every fresh starting point also rotates the autosave id, so a new
  // load/flame can never clobber the previous flame's autosave entry.
  const newAutosaveId = () =>
    `autosave-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  let autosaveSessionId = newAutosaveId()
  const autosaveSnapshot = () =>
    JSON.stringify({ flame: flameDescriptor, tracks: timeline.tracks() })
  let autosaveBaseline = autosaveSnapshot()
  let editingSince: number | null = null
  let lastAutosaveAt = 0
  let reminderShown = false
  let autosavePromptShown = false

  const isFlameDirty = () => autosaveSnapshot() !== autosaveBaseline
  const markSavedBaseline = () => {
    autosaveBaseline = autosaveSnapshot()
  }
  const markLoadedBaseline = () => {
    autosaveBaseline = autosaveSnapshot()
    editingSince = null
    autosaveSessionId = newAutosaveId()
  }

  const autosaveNow = () => {
    const saved = upsertRecentFlame(
      autosaveSessionId,
      flameDescriptor,
      undefined,
      timeline.tracks(),
    )
    // A failed write (quota, private mode) must not mark the flame clean —
    // the pagehide fallback would then skip it and the work would vanish.
    if (!saved) return
    lastAutosaveAt = Date.now()
    markSavedBaseline()
  }

  // Flush outgoing dirty work before the flame gets replaced (load, New
  // Flame, 2D/3D switch): the replace resets the baseline, after which the
  // pagehide safety net no longer sees the old state as dirty.
  const flushDirtyToRecents = () => {
    if (isFlameDirty()) autosaveNow()
  }

  // Reload/close/freeze with unsaved changes: persist silently — no prompt,
  // the work just shows up in Recent flames. Also saves on bfcache freezes
  // (`persisted`): frozen pages are routinely evicted without another
  // pagehide, and the upsert is idempotent when the page is restored.
  // Independent of the periodic-autosave setting.
  const saveOnPagehide = () => {
    flushDirtyToRecents()
  }
  window.addEventListener('pagehide', saveOnPagehide)
  onCleanup(() => {
    window.removeEventListener('pagehide', saveOnPagehide)
  })

  const AUTOSAVE_POLL_MS = 30_000
  const REMINDER_AFTER_MS = 5 * 60_000
  const autosavePoll = setInterval(() => {
    const dirty = isFlameDirty()
    if (dirty && editingSince === null) editingSince = Date.now()

    // First time an edit would be autosaved: ask once, remember the answer.
    if (dirty && autosaveRecents() === 'unset' && !autosavePromptShown) {
      autosavePromptShown = true
      // Sticky: a question must wait for an answer, never auto-hide.
      showToast('Auto-save your flames to Recents while you edit?', 'sticky', [
        {
          label: 'Yes',
          onClick: () => {
            setAutosaveRecents('on')
            flushDirtyToRecents()
          },
        },
        { label: 'No', onClick: () => setAutosaveRecents('off') },
      ])
      return
    }

    if (dirty && autosaveRecents() === 'on') {
      const intervalMs = Math.max(1, autosaveIntervalMin()) * 60_000
      if (Date.now() - lastAutosaveAt >= intervalMs) autosaveNow()
    }

    // Gentle one-time pointer to saving/exporting after sustained editing.
    if (
      !reminderShown &&
      !saveReminderDismissed() &&
      editingSince !== null &&
      Date.now() - editingSince >= REMINDER_AFTER_MS
    ) {
      reminderShown = true
      showToast(
        'Enjoying this flame? Save it for later, export a PNG, or share a link from the actions bar.',
        12000,
        [
          {
            label: "Don't show again",
            onClick: () => setSaveReminderDismissed(true),
          },
        ],
      )
    }
  }, AUTOSAVE_POLL_MS)
  onCleanup(() => {
    clearInterval(autosavePoll)
  })

  // Apply flame and animation from shared URL (fires once when resource resolves)
  let queryApplied = false
  createEffect(() => {
    const data = props.flameFromQuery
    if (!data || queryApplied) return
    queryApplied = true

    if (IS_DEV) console.info('[share] applying flame from shared URL')
    history.replace(deepClone(data.flame))

    if (data.animation && data.animation.tracks.length > 0) {
      if (IS_DEV) {
        console.info(
          '[anim] loading shared animation:',
          data.animation.tracks.length,
          'tracks',
        )
      }
      timeline.loadTracks(data.animation.tracks)
      timeline.setAnimationEnabled(true)
      setAnimationEnabled(true)
      timeline.setConfig({
        ...timeline.config(),
        ...data.animation.config,
      })
      timeline.goToFrame(0)
      timeline.play()
    }
    // A shared link is a fresh starting point for dirty tracking.
    markLoadedBaseline()

    // Offer to save any custom variations the link brought in. They are already
    // registered (transiently) so the flame renders; this only asks which to
    // persist into the recipient's library. Variations whose code the user
    // already has are surfaced as "already in your library" (not re-saved).
    const imported = data.importedCustomVariations ?? []
    const alreadyOwned = data.alreadyOwnedCustomVariations ?? []
    if (imported.length > 0) {
      void (async () => {
        const selectedIds = await showImportVariationsModal(
          imported,
          alreadyOwned,
        )
        if (selectedIds && selectedIds.length > 0) {
          persistSharedVariations(selectedIds)
          setCustomVarsVersion((v) => v + 1)
          showToast(
            `Saved ${selectedIds.length} custom variation${selectedIds.length === 1 ? '' : 's'} to your library`,
          )
        }
      })()
    } else if (alreadyOwned.length > 0) {
      showToast(
        `${alreadyOwned.length} custom variation${alreadyOwned.length === 1 ? '' : 's'} from this flame ${alreadyOwned.length === 1 ? 'is' : 'are'} already in your library`,
      )
    }
  })

  // A single custom variation arrived via a `?cv=` link: preview it and offer to
  // save (fires once when the resource resolves).
  let sharedVariationApplied = false
  createEffect(() => {
    const sv = props.sharedVariationFromQuery
    if (!sv || sharedVariationApplied) return
    sharedVariationApplied = true
    void (async () => {
      const save = await showShareVariationLoadModal(sv.def, sv.alreadyOwned)
      if (save && !sv.alreadyOwned) {
        persistSharedVariations([sv.def.id])
        setCustomVarsVersion((v) => v + 1)
        showToast(`Saved "${sv.def.name}" to your library`)
      }
    })()
  })

  function getFlameValue(
    path: string,
  ):
    | number
    | string
    | [number, number, number]
    | [number, number, number, number]
    | null {
    const fd = flameDescriptor
    switch (path) {
      case 'exposure':
        return fd.renderSettings.exposure
      case 'skipIters':
        return fd.renderSettings.skipIters
      case 'plotsPerChain':
        return fd.renderSettings.plotsPerChain
      case 'vibrancy':
        return fd.renderSettings.vibrancy
      case 'contrast':
        return fd.renderSettings.contrast ?? 1
      case 'gamma':
        return fd.renderSettings.gamma ?? 2.2
      case 'highlightPower':
        return fd.renderSettings.highlightPower ?? 1
      case 'drawMode':
        return fd.renderSettings.drawMode
      case 'colorInitMode':
        return fd.renderSettings.colorInitMode
      case 'pointInitMode':
        return fd.renderSettings.pointInitMode
      case 'densityEstimationQuality':
        return fd.renderSettings.densityEstimationQuality ?? 0.8
      case 'estimatorCurve':
        return fd.renderSettings.estimatorCurve ?? 0.5
      case 'paletteMode':
        return fd.renderSettings.paletteMode ?? 0
      case 'palettePhase':
        return fd.renderSettings.palettePhase ?? 0
      case 'paletteSpeed':
        return fd.renderSettings.paletteSpeed ?? 1
      case 'backgroundColor':
        return fd.renderSettings.backgroundColor ?? [0, 0, 0]
      case 'edgeFadeColor':
        return fd.renderSettings.edgeFadeColor ?? [0, 0, 0, 0]
      case 'camera.x':
        if (timeline.isDrivingView()) {
          if (
            timeline.hasKeyframeAtFrame('camera.x', timeline.currentFrame())
          ) {
            const xTrack = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera.x')
            if (xTrack) {
              const val = resolveKeyframeValue(
                xTrack.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera?.position[0] ?? 0
      case 'camera.y':
        if (timeline.isDrivingView()) {
          if (
            timeline.hasKeyframeAtFrame('camera.y', timeline.currentFrame())
          ) {
            const yTrack = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera.y')
            if (yTrack) {
              const val = resolveKeyframeValue(
                yTrack.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera?.position[1] ?? 0
      case 'camera.zoom':
        if (timeline.isDrivingView()) {
          if (
            timeline.hasKeyframeAtFrame('camera.zoom', timeline.currentFrame())
          ) {
            const zoomTrack = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera.zoom')
            if (zoomTrack) {
              const val = resolveKeyframeValue(
                zoomTrack.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera?.zoom ?? 1
      case 'camera.rotation':
        return (
          ((fd.renderSettings.camera as Record<string, unknown> | undefined)
            ?.rotation as number | undefined) ?? 0
        )
      case 'camera3D.theta':
        if (timeline.isDrivingView()) {
          if (
            timeline.hasKeyframeAtFrame(
              'camera3D.theta',
              timeline.currentFrame(),
            )
          ) {
            const track = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera3D.theta')
            if (track) {
              const val = resolveKeyframeValue(
                track.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera3D?.theta ?? 0
      case 'camera3D.phi':
        if (timeline.isDrivingView()) {
          if (
            timeline.hasKeyframeAtFrame('camera3D.phi', timeline.currentFrame())
          ) {
            const track = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera3D.phi')
            if (track) {
              const val = resolveKeyframeValue(
                track.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera3D?.phi ?? Math.PI / 2
      case 'camera3D.radius':
        if (timeline.isDrivingView()) {
          if (
            timeline.hasKeyframeAtFrame(
              'camera3D.radius',
              timeline.currentFrame(),
            )
          ) {
            const track = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera3D.radius')
            if (track) {
              const val = resolveKeyframeValue(
                track.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera3D?.radius ?? 5
      case 'camera3D.fov':
        if (timeline.isDrivingView()) {
          if (
            timeline.hasKeyframeAtFrame('camera3D.fov', timeline.currentFrame())
          ) {
            const track = timeline
              .tracks()
              .find((t) => t.parameterPath === 'camera3D.fov')
            if (track) {
              const val = resolveKeyframeValue(
                track.keyframes,
                timeline.currentFrame(),
              )
              if (val !== null && typeof val === 'number') return val
            }
          }
        }
        return fd.renderSettings.camera3D?.fov ?? 60
      case 'blendWeight':
        return blendWeight()
      default:
        break
    }
    // Handle transform paths: transform.{tid}.{prop} or transform.{tid}.{sub}.{key}
    const parts = path.split('.')
    if (parts[0] === 'transform') {
      const transforms = fd.transforms as Record<string, unknown>
      if (parts.length === 3 && parts[2] === 'probability') {
        return (
          (
            transforms[parts[1]!] as {
              probability?: number
              colorSpeed?: number
              color?: Record<string, number>
              preAffine?: Record<string, number>
              postAffine?: Record<string, number>
              variations?: Record<string, { weight?: number }>
            }
          )?.probability ?? null
        )
      }
      if (parts.length === 3 && parts[2] === 'colorSpeed') {
        return (
          (
            transforms[parts[1]!] as {
              probability?: number
              colorSpeed?: number
              color?: Record<string, number>
              preAffine?: Record<string, number>
              postAffine?: Record<string, number>
              variations?: Record<string, { weight?: number }>
            }
          )?.colorSpeed ?? 0.4
        )
      }
      if (
        parts.length === 4 &&
        (parts[2] === 'preAffine' || parts[2] === 'postAffine')
      ) {
        const affine = (
          transforms[parts[1]!] as {
            probability?: number
            colorSpeed?: number
            color?: Record<string, number>
            preAffine?: Record<string, number>
            postAffine?: Record<string, number>
            variations?: Record<string, { weight?: number }>
          }
        )?.[parts[2]]
        if (affine && parts[3]! in affine) {
          return affine[parts[3]!] as number
        }
      }
      if (parts.length === 4 && parts[2] === 'color') {
        const color = (
          transforms[parts[1]!] as {
            probability?: number
            colorSpeed?: number
            color?: Record<string, number>
            preAffine?: Record<string, number>
            postAffine?: Record<string, number>
            variations?: Record<string, { weight?: number }>
          }
        )?.color
        if (color && parts[3]! in color) {
          return color[parts[3]!] ?? null
        }
      }
      return null
    }
    // Handle transform variation parameter: {transformId}.{variationId}.{paramName}
    if (parts.length === 3) {
      const [transformId, variationId, paramName] = parts as [
        string,
        string,
        string,
      ]

      const transform = (
        fd.transforms as Record<
          string,
          any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        >
      )[transformId] as
        | {
            variations?: Record<
              string,
              { type: string; params?: Record<string, number> }
            >
          }
        | undefined
      const variation = transform?.variations?.[variationId]
      if (variation) {
        if (variation.params) {
          const val = variation.params[paramName]
          if (val !== undefined) return val
        } else if (isAnyParametricVariationType(variation.type)) {
          // Params not initialized yet — fall back to defaults
          const vType = variation.type
          const vDef = (allTransformVariations as Record<string, unknown>)[
            vType
          ] as { paramDefaults: Record<string, number> } | undefined
          if (vDef && paramName in vDef.paramDefaults) {
            const d = vDef.paramDefaults[paramName]
            if (d !== undefined) return d
          }
        }
      }
    }
    // Handle transform variation weight: {transformId}.{variationId}
    if (
      parts.length === 2 &&
      parts[0] !== 'transform' &&
      parts[0] !== 'camera'
    ) {
      const [transformId, variationId] = parts as [string, string]

      const variation = (
        fd.transforms as Record<
          string,
          any /* eslint-disable-line @typescript-eslint/no-explicit-any */
        >
      )[transformId]?.variations?.[variationId] as
        | { weight?: number }
        | undefined
      if (variation?.weight !== undefined) return variation.weight
    }
    return null
  }
  timeline.setValueResolver(getFlameValue)

  function setFlameValue(
    path: string,
    value:
      | number
      | string
      | [number, number, number]
      | [number, number, number, number],
  ) {
    // Silent: this is the timeline's write-through (recording, playback
    // holds, and undo/redo write-back). The timeline undo stack owns these
    // changes — recording them in flame history double-counted every
    // preset keyframe at the current frame and would turn timeline undo
    // write-backs into fresh flame entries.
    history.setSilently((draft) => {
      switch (path) {
        case 'blendWeight':
          draft.renderSettings.blendWeight = value as number
          break
        case 'exposure':
          draft.renderSettings.exposure = value as number
          break
        case 'skipIters':
          draft.renderSettings.skipIters = value as number
          break
        case 'plotsPerChain':
          draft.renderSettings.plotsPerChain = value as number
          break
        case 'vibrancy':
          draft.renderSettings.vibrancy = value as number
          break
        case 'contrast':
          draft.renderSettings.contrast = value as number
          break
        case 'gamma':
          draft.renderSettings.gamma = value as number
          break
        case 'highlightPower':
          draft.renderSettings.highlightPower = value as number
          break
        case 'drawMode':
          draft.renderSettings.drawMode = value as 'light' | 'paint'
          break
        case 'colorInitMode':
          draft.renderSettings.colorInitMode = value as
            | 'colorInitZero'
            | 'colorInitPosition'
          break
        case 'pointInitMode':
          draft.renderSettings.pointInitMode = value as PointInitMode
          break
        case 'densityEstimationQuality':
          draft.renderSettings.densityEstimationQuality = value as number
          break
        case 'estimatorCurve':
          draft.renderSettings.estimatorCurve = value as number
          break
        case 'paletteMode':
          draft.renderSettings.paletteMode = value as number
          break
        case 'palettePhase':
          draft.renderSettings.palettePhase = value as number
          break
        case 'paletteSpeed':
          draft.renderSettings.paletteSpeed = value as number
          break
        case 'backgroundColor':
          if (Array.isArray(value)) {
            draft.renderSettings.backgroundColor = value as [
              number,
              number,
              number,
            ]
          }
          break
        case 'edgeFadeColor':
          if (Array.isArray(value)) {
            draft.renderSettings.edgeFadeColor = value as [
              number,
              number,
              number,
              number,
            ]
          }
          break
        case 'camera.x':
          if (draft.renderSettings.camera) {
            draft.renderSettings.camera.position[0] = value as number
          }
          break
        case 'camera.y':
          if (draft.renderSettings.camera) {
            draft.renderSettings.camera.position[1] = value as number
          }
          break
        case 'camera.zoom':
          if (draft.renderSettings.camera) {
            draft.renderSettings.camera.zoom = value as number
          }
          break
        case 'camera.rotation':
          ;(draft.renderSettings.camera as
            | Record<string, unknown>
            | undefined)!.rotation = value
          break
        case 'camera3D.theta':
          if (draft.renderSettings.camera3D) {
            draft.renderSettings.camera3D.theta = value as number
          }
          break
        case 'camera3D.phi':
          if (draft.renderSettings.camera3D) {
            draft.renderSettings.camera3D.phi = value as number
          }
          break
        case 'camera3D.radius':
          if (draft.renderSettings.camera3D) {
            draft.renderSettings.camera3D.radius = value as number
          }
          break
        case 'camera3D.fov':
          if (draft.renderSettings.camera3D) {
            draft.renderSettings.camera3D.fov = value as number
          }
          break
        default: {
          const parts = path.split('.')
          if (parts[0] === 'transform') {
            const transforms = draft.transforms as Record<string, unknown>
            if (parts.length === 3 && parts[2] === 'probability') {
              if (transforms[parts[1]!]) {
                ;(
                  transforms[parts[1]!] as {
                    probability?: number
                    colorSpeed?: number
                    color?: Record<string, number>
                    preAffine?: Record<string, number>
                    postAffine?: Record<string, number>
                    variations?: Record<string, { weight?: number }>
                  }
                ).probability = value as number
              }
            } else if (parts.length === 3 && parts[2] === 'colorSpeed') {
              if (transforms[parts[1]!]) {
                ;(
                  transforms[parts[1]!] as {
                    probability?: number
                    colorSpeed?: number
                    color?: Record<string, number>
                    preAffine?: Record<string, number>
                    postAffine?: Record<string, number>
                    variations?: Record<string, { weight?: number }>
                  }
                ).colorSpeed = value as number
              }
            } else if (
              parts.length === 4 &&
              (parts[2] === 'preAffine' || parts[2] === 'postAffine')
            ) {
              const affine = (
                transforms[parts[1]!] as {
                  probability?: number
                  colorSpeed?: number
                  color?: Record<string, number>
                  preAffine?: Record<string, number>
                  postAffine?: Record<string, number>
                  variations?: Record<string, { weight?: number }>
                }
              )?.[parts[2]]
              if (affine && parts[3]! in affine) {
                affine[parts[3]!] = value as number
              }
            } else if (parts.length === 4 && parts[2] === 'color') {
              const color = (
                transforms[parts[1]!] as {
                  probability?: number
                  colorSpeed?: number
                  color?: Record<string, number>
                  preAffine?: Record<string, number>
                  postAffine?: Record<string, number>
                  variations?: Record<string, { weight?: number }>
                }
              )?.color
              if (color && parts[3]! in color) {
                color[parts[3]!] = value as number
              }
            }
          } else if (parts.length === 3) {
            const [transformId, variationId, paramName] = parts as [
              string,
              string,
              string,
            ]

            const transform = (
              draft.transforms as Record<
                string,
                any /* eslint-disable-line @typescript-eslint/no-explicit-any */
              >
            )[transformId] as
              | {
                  variations?: Record<
                    string,
                    { type: string; params?: Record<string, number> }
                  >
                }
              | undefined
            const variation = transform?.variations?.[variationId]
            if (variation?.params) {
              variation.params[paramName] = value as number
            }
          } else if (parts.length === 2 && parts[0] !== 'camera') {
            const [transformId, variationId] = parts as [string, string]

            const transform = (draft.transforms as Record<string, unknown>)[
              transformId
            ] as
              | {
                  variations?: Record<string, { weight?: number }>
                }
              | undefined
            const variation = transform?.variations?.[variationId]
            if (variation) {
              variation.weight = value as number
            }
          }
          break
        }
      }
    })
  }
  timeline.setValueWriter(setFlameValue)

  // Effective camera values: read from timeline whenever animation is enabled
  // so the camera follows keyframes during playback, seeking, and when stopped.
  const animatingCamera = () => timeline.isDrivingView()

  const effectiveZoom = createMemo(() => {
    if (animatingCamera()) {
      const val = timeline.resolveValueAtPath(
        'camera.zoom',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera.zoom
  })

  const effectivePosition = createMemo(() => {
    const base = flameDescriptor.renderSettings.camera.position
    if (animatingCamera()) {
      const frame = timeline.currentFrame()
      // Resolve each axis independently — presets like Pan Left only keyframe
      // one axis, so requiring both tracks would freeze the camera.
      const xVal = timeline.resolveValueAtPath('camera.x', frame)
      const yVal = timeline.resolveValueAtPath('camera.y', frame)
      const x = typeof xVal === 'number' ? xVal : base[0]
      const y = typeof yVal === 'number' ? yVal : base[1]
      return vec2f(x, y)
    }
    return vec2f(...base)
  })

  useKeyboardShortcuts({
    Escape: () => {
      if (sidebarDiffView()) {
        closeSidebarDiff()
        return true
      }
      // Let browser/dialog handle Escape when no sidebar diff is open
    },
    KeyF: () => {
      if ('startViewTransition' in document) {
        document.startViewTransition(toggleSidebarAsAuthoredAction)
      } else {
        toggleSidebarAsAuthoredAction()
      }
      return true
    },
    KeyZ: (ev) => {
      if (animationExportRunning()) return false
      if (ev.metaKey || ev.ctrlKey) {
        // Chronological across flame history + timeline (see undoRouting.ts);
        // the toolbar Undo/Redo buttons route through the same arbiter.
        // Routed through the command registry so a session recording sees
        // the undo; guarded so a no-op never lands in the log.
        if (ev.shiftKey ? !undoRouter.canRedo() : !undoRouter.canUndo()) {
          return false
        }
        executeCommand(
          ev.shiftKey ? 'history.redo' : 'history.undo',
          cmdContext,
        )
        return true
      }
    },
    KeyY: (ev) => {
      if (animationExportRunning()) return false
      if (ev.metaKey || ev.ctrlKey) {
        if (!undoRouter.canRedo()) return false
        executeCommand('history.redo', cmdContext)
        return true
      }
    },
    KeyD: (ev) => {
      // Plain "D" pans the 3D camera right (WASD), so the theme toggle lives
      // on Ctrl/Cmd+D to avoid the conflict.
      if (!(ev.ctrlKey || ev.metaKey)) return false
      if (animationExportRunning()) return false
      const toggleTheme = () => {
        setTheme(theme() === 'dark' ? 'light' : 'dark')
      }
      if ('startViewTransition' in document) {
        document.startViewTransition(toggleTheme)
      } else {
        toggleTheme()
      }
      return true
    },
    KeyI: (ev) => {
      if (animationExportRunning()) return false
      if (ev.altKey) {
        const path = targetedParameter()
        if (path) {
          recorderTimeline.removeKeyframe(path, timeline.currentFrame())
        }
      } else {
        const path = targetedParameter()
        if (path) {
          recorderTimeline.addKeyframeAtCurrentFrame(path)
        }
      }
      return true
    },
    Space: () => {
      if (animationExportRunning()) return false
      if (!showTimeline()) return
      if (!animationEnabled()) {
        executeCommand('timeline.setAnimationEnabled', cmdContext, true)
      }
      recorderTimeline.togglePlay()
      return true
    },
  })

  const timelineDuration = () => timeline.config().endFrame
  const setTimelineDuration = (
    value: number | ((previous: number) => number),
    coalesceId?: string,
  ): number => {
    const newDuration =
      typeof value === 'function' ? value(timeline.config().endFrame) : value
    timeline.updateConfigUndoable({ endFrame: newDuration }, coalesceId)
    return newDuration
  }

  /**
   * The same snapshot the recorder dock passes as `startExtras`, shared with
   * the `ctx.recorder.start` seam so an agent-started take records the same
   * side state as a human-started one. Wall-clock playback is not authored
   * session state and is deliberately absent.
   */
  function captureRecorderStartExtras(): SessionStartExtras {
    return {
      timeline: cmdContext.timeline.edit?.snapshot(),
      audio: cmdContext.audio?.snapshot(),
      sonification: captureSonificationSnapshot(),
      view: {
        qualityPreset: qualityPreset(),
        pixelRatio: pixelRatio() as 1 | 0.5 | 0.25,
        adaptiveFilter: adaptiveFilterEnabled(),
        stochasticFilter: stochasticFilterEnabled(),
        flyMode: flyMode(),
        showTimeline: showTimeline(),
        sidebarOpen: showSidebar(),
        paletteRestoreColors: deepClone(prePaletteColors()),
      },
    }
  }

  // Command context: bridges registered commands to app signals
  const cmdContext: CommandContext = {
    beforeCommand: () => {
      history.takeOverOwnedPreview()
    },
    flameDescriptor: () => flameDescriptor,
    setFlameDescriptor,
    paletteRestoreColors: prePaletteColors,
    blendFlame,
    setBlendFlame,
    blendWeight,
    setBlendWeight,
    pixelRatio,
    setPixelRatio,
    zoom: effectiveZoom,
    setZoom: setFlameZoom,
    position: effectivePosition,
    setPosition: setFlamePosition,
    sidebar: {
      open: showSidebar,
      setOpen: setShowSidebar,
    },

    director: {
      open: directorOpen,
      setOpen: setDirectorOpen,
      state: directorState,
      setState: setDirectorState,
      selectCandidate,
    },
    arena: {
      open: showArena,
      setOpen: setShowArena,
      player1Stats: arenaP1Stats,
      setPlayer1Stats: setArenaP1Stats,
      player2Stats: arenaP2Stats,
      setPlayer2Stats: setArenaP2Stats,
      selectFighter: (player: 1 | 2) => {
        const fighter = player === 1 ? arenaP1Stats() : arenaP2Stats()
        if (fighter?.flame) {
          setFlameDescriptor(
            () => deepClone(fighter.flame!),
            `Arena: ${fighter.name ?? `Player ${player}`}`,
          )
          showToast(
            `Arena: Loaded ${fighter.name ?? `Player ${player}`} into editor.`,
          )
        }
      },
    },
    timeline: {
      tracks: timeline.tracks,
      setTracks: timeline.setTracks,
      animationEnabled,
      setAnimationEnabled,
      duration: timelineDuration,
      setDuration: setTimelineDuration,
      currentFrame: timeline.currentFrame,
      setCurrentFrame: (value) => {
        const frame =
          typeof value === 'function' ? value(timeline.currentFrame()) : value
        timeline.goToFrame(frame)
        return timeline.currentFrame()
      },
      setPreviewHeld: timeline.setPreviewHeld,
      play: timeline.play,
      setLoop: (loop) => {
        timeline.updateConfigUndoable({ loop })
      },
      setFps: (fps, coalesceId) => {
        timeline.updateConfigUndoable({ fps }, coalesceId)
      },
      setAutoFps: (autoFps) => {
        timeline.updateConfigUndoable({ autoFps })
      },
      setTimeScale: (timeScale, coalesceId) => {
        timeline.updateConfigUndoable({ timeScale }, coalesceId)
      },
      addKeyframe: (path, frame, value, easing, interp) => {
        timeline.addKeyframe(
          path,
          frame,
          value,
          easing as EasingCurve | undefined,
          interp as KeyframeInterpolation | undefined,
        )
      },
      edit: {
        removeKeyframe: timeline.removeKeyframe,
        setKeyframeValue: (path, frame, value, easing, interp) => {
          timeline.setKeyframeValue(
            path,
            frame,
            value,
            easing as EasingCurve | undefined,
            interp as KeyframeInterpolation | undefined,
          )
        },
        setKeyframeInterp: (path, frame, interp) => {
          timeline.setKeyframeInterp(
            path,
            frame,
            interp as KeyframeInterpolation,
          )
        },
        moveKeyframe: timeline.moveKeyframe,
        relocateKeyframe: timeline.relocateKeyframe,
        addKeyframeValuesAtFrame: timeline.addKeyframeValuesAtFrame,
        removeTrack: timeline.removeTrack,
        clearTracks: timeline.clearAllTracks,
        setLoopMode: timeline.setLoopMode,
        setAutoKeyframe: (on) => {
          timeline.setAutoKeyframe(on)
        },
        snapshot: () => ({
          config: deepClone(timeline.config()),
          currentFrame: timeline.currentFrame(),
          animationEnabled: animationEnabled(),
          autoKeyframe: timeline.autoKeyframe(),
          previewHeld: timeline.previewHeld(),
          tracks: deepClone(timeline.tracks()),
        }),
        load: (data) => {
          timeline.loadTracks(data.tracks)
          timeline.setConfig(data.config)
          if (data.currentFrame !== undefined) {
            timeline.setCurrentFrame(data.currentFrame)
          }
          if (data.animationEnabled !== undefined) {
            setAnimationEnabled(data.animationEnabled)
          }
          if (data.autoKeyframe !== undefined) {
            timeline.setAutoKeyframe(data.autoKeyframe)
          }
          if (data.previewHeld !== undefined) {
            timeline.setPreviewHeld(data.previewHeld)
          }
        },
      },
    },
    audio: {
      snapshot: () => ({
        mapping: deepClone(audioMapping()),
        enabled: audioEnabled(),
        source: audioSource(),
        trackName: audioTrackName(),
      }),
      setMapping: setAudioMapping,
      setEnabled: setAudioEnabled,
      setSource: setAudioSource,
      canEnable: (required) =>
        canEnableReplayAudio(required, {
          hasFileBuffer: audioBuffer() !== undefined,
          currentTrackName: audioTrackName(),
          hasLiveAnalyzer: liveAnalyzer() !== undefined,
        }),
    },
    sonification: {
      snapshot: captureSonificationSnapshot,
      setConfig: setSonificationConfig,
      setEnabled: setAuthoredSonificationEnabled,
    },
    view: {
      setQualityPreset,
      setAdaptiveFilter: setAdaptiveFilterEnabled,
      setStochasticFilter: setStochasticFilterEnabled,
      setFlyMode,
      setShowTimeline,
    },
    camera: {
      center: () => {
        setFlameZoom(1)
        setFlamePosition(vec2f(0, 0))
      },
    },
    modal: {
      open: (name: string) => {
        if (name === 'exportPng') void showExportPngDialog()
        if (name === 'exportAnimation') void showExportPngDialog('animation')
      },
    },
    history: {
      undo: undoRouter.undoLast,
      redo: undoRouter.redoLast,
      peekUndoTarget: undoRouter.peekUndoTarget,
      peekRedoTarget: undoRouter.peekRedoTarget,
    },
    // The recorder as the Arcade pilot drives it. Starting a take from a tool
    // must be indistinguishable from pressing Record in the dock, hence the
    // shared extras closure and the same "freeze wall-clock playback" step.
    recorder: {
      isRecording: isSessionRecording,
      start: () => {
        const result = startSessionRecording(
          flameDescriptor,
          captureRecorderStartExtras(),
        )
        if (result.ok && timeline.isPlaying()) {
          withRecordingSuppressed(() => {
            timeline.pause()
          })
        }
        return result
      },
      stop: stopSessionRecording,
      cancel: cancelSessionRecording,
      save: async (session, name) => {
        await storeSession(session, name)
        setExternalSessionLibraryRevision((revision) => revision + 1)
      },
      openReplay: openReplaySession,
      actionCount: recordedActionCount,
    },
    arcade: {
      openHub: (mode) => {
        setActiveTab('arcade', mode)
      },
      closeHub: () => {
        setActiveTab('workspace')
      },
      toast: (text) => {
        showToast(text, 3500)
      },
      qualityPreset: () => qualityPreset(),
    },
  }

  // WebMCP: register tools so LLMs can read/mutate flame state via the
  // browser's ModelContext API (ChatGPT in-app browser, Chrome flag, etc.).
  const cleanupWebMcp = registerWebMcpTools(cmdContext)
  onCleanup(cleanupWebMcp)

  /**
   * Whole-document command loads are undoable edits (randomize, genetics,
   * history, New Flame). A loaded document has no trustworthy pre-palette
   * provenance, so clear it atomically with the flame and restore the
   * outgoing provenance only when this same history entry is undone.
   */
  const executeFlameLoad = (
    flame: FlameDescriptor,
    label?: string,
    origin?: SnapshotOrigin,
  ) => {
    const description = snapshotOriginLabel(origin) ?? label ?? 'Load Flame'
    withPaletteRestoreTransition({}, description, () => {
      if (origin !== undefined) {
        executeCommand('flame.load', cmdContext, flame, description, {}, origin)
      } else if (label === undefined) {
        executeCommand('flame.load', cmdContext, flame)
      } else {
        executeCommand('flame.load', cmdContext, flame, label)
      }
    })
  }

  const recorderTimeline = createRecorderAwareTimeline(
    timeline,
    (id, ...args) => {
      executeCommand(id, cmdContext, ...args)
    },
    () => {
      history.takeOverOwnedPreview()
    },
  )
  useShortcutManager(cmdContext)

  /**
   * Every render-settings control goes through the registry, so a recording
   * captures it as a replayable step (semantic-recorder-plan, M3). The path
   * is the same one the control already declares as `dataParameterPath` and
   * the timeline uses for keyframes.
   */
  const setRenderSetting = (path: string, value: unknown) => {
    executeCommand('flame.setRenderSetting', cmdContext, path, value)
  }

  /** Several render settings applied as one edit — used where a control
   *  derives a small batch (the auto-exposure re-base) rather than moving a
   *  single parameter. */
  const setRenderSettings = (
    patch: Partial<FlameDescriptor['renderSettings']>,
  ) => {
    executeCommand('flame.updateRenderSettings', cmdContext, patch, 'render')
  }

  /**
   * Where a replayed session writes (M4). `loadInitial` goes through the
   * SETTER rather than `history.replace`, because replace pushes its own
   * entry and would escape the batch — the batch is what makes a whole
   * replayed run a single undo step the viewer can take back in one go.
   */
  type ReplaySideState = ReplayNonFlameSideState & {
    /**
     * Timeline keyframe commands intentionally write their current-frame
     * value into the flame through `history.setSilently`. Patches cannot see
     * those writes, so replay's undo side effect carries an exact document
     * snapshot alongside the timeline/audio/view state.
     */
    flame: FlameDescriptor
  }

  const captureReplayPresentation = (): ReplayPresentationSnapshot => {
    const affine = replayAffineModeRequest()
    const diffView = sidebarDiffView()
    return {
      sidebarHidden: sidebarHidden(),
      selectedTransformId: selectedTransformId(),
      collapsedTransformIds: Array.from(collapsedTransforms()).sort(),
      timelineCollapsed: timelineCollapsed(),
      sidebarDiffView: diffView === null ? null : deepClone(diffView),
      showBlendGallery: showBlendGallery(),
      showAudioPanel: showAudioPanel(),
      showSonificationPanel: showSonificationPanel(),
      quickPickState: quickPickState(),
      hoveredVariationType: hoveredVariationType(),
      affineCardOpen: affineCardOpen(),
      colorCardOpen: colorCardOpen(),
      metadataCardOpen: metadataCardOpen(),
      paletteCardOpen: paletteCardOpen(),
      prePaletteColors: deepClone(prePaletteColors()),
      renderCardOpen: renderCardOpen(),
      floatingActionsCollapsed: floatingActionsCollapsed(),
      affineMode: affine.mode,
      affineTab: affine.tab,
      colorView: replayColorViewRequest().view,
    }
  }

  const captureReplayNonFlameSideState = (
    presentation = captureReplayPresentation(),
  ): ReplayNonFlameSideState => ({
    timeline: {
      config: deepClone(timeline.config()),
      currentFrame: timeline.currentFrame(),
      animationEnabled: animationEnabled(),
      autoKeyframe: timeline.autoKeyframe(),
      previewHeld: timeline.previewHeld(),
      tracks: deepClone(timeline.tracks()),
    },
    audio: {
      mapping: deepClone(audioMapping()),
      enabled: audioEnabled(),
      source: audioSource(),
      trackName: audioTrackName(),
    },
    sonification: captureSonificationSnapshot(),
    view: {
      qualityPreset: qualityPreset(),
      pixelRatio: pixelRatio() as 1 | 0.5 | 0.25,
      adaptiveFilter: adaptiveFilterEnabled(),
      stochasticFilter: stochasticFilterEnabled(),
      flyMode: flyMode(),
      showTimeline: showTimeline(),
      sidebarOpen: showSidebar(),
    },
    presentation,
  })

  const captureReplaySideState = (
    presentation = captureReplayPresentation(),
  ): ReplaySideState => ({
    flame: deepClone(flameDescriptor),
    ...captureReplayNonFlameSideState(presentation),
  })

  const applyReplayAudioState = (audio: AudioWiringSnapshot) => {
    // A session records wiring, never file bytes or microphone permission.
    // Keep the workspace's actual resource identity and only re-enable the
    // wiring when that same resource is still present. In particular, redo
    // must not relabel B.wav as the A.wav captured by an earlier replay.
    applyReplayAudioWiring(
      audio,
      {
        hasFileBuffer: audioBuffer() !== undefined,
        currentTrackName: audioTrackName(),
        hasLiveAnalyzer: liveAnalyzer() !== undefined,
      },
      {
        setMapping: setAudioMapping,
        setSource: setAudioSource,
        setEnabled: setAudioEnabled,
      },
    )
  }

  const restoreReplaySideState = (state: ReplaySideState) => {
    timeline.setTracks(() => deepClone(state.timeline.tracks))
    timeline.setConfig(deepClone(state.timeline.config))
    if (state.timeline.currentFrame !== undefined) {
      timeline.setCurrentFrame(state.timeline.currentFrame)
    }
    if (state.timeline.animationEnabled !== undefined) {
      setAnimationEnabled(state.timeline.animationEnabled)
    }
    if (state.timeline.autoKeyframe !== undefined) {
      timeline.setAutoKeyframe(state.timeline.autoKeyframe)
    }
    if (state.timeline.previewHeld !== undefined) {
      timeline.setPreviewHeld(state.timeline.previewHeld)
    }
    applyReplayAudioState(state.audio)
    if (state.view.qualityPreset in qualityPresets) {
      setQualityPreset(state.view.qualityPreset as QualityPreset)
    }
    if (state.view.pixelRatio !== undefined) {
      setPixelRatio(state.view.pixelRatio)
    }
    setAdaptiveFilterEnabled(state.view.adaptiveFilter)
    setStochasticFilterEnabled(state.view.stochasticFilter)
    setFlyMode(state.view.flyMode)
    setShowTimeline(state.view.showTimeline)
    setShowSidebar(state.view.sidebarOpen)
    // Last writer wins: restoring the exact snapshot after timeline/view
    // signals prevents their derived silent writers from leaving a replayed
    // current-frame value behind after undo.
    history.replaceSilently(state.flame)

    const presentation = normalizeReplayPresentation(
      state.presentation,
      state.flame,
    )
    setSidebarHidden(presentation.sidebarHidden)
    setSelectedTransformId(presentation.selectedTransformId)
    setCollapsedTransforms(new Set(presentation.collapsedTransformIds))
    setTimelineCollapsed(presentation.timelineCollapsed)
    setSidebarDiffView(
      presentation.sidebarDiffView === null
        ? null
        : deepClone(presentation.sidebarDiffView),
    )
    setShowBlendGallery(presentation.showBlendGallery)
    setShowAudioPanel(presentation.showAudioPanel)
    setShowSonificationPanel(presentation.showSonificationPanel)
    setQuickPickState(
      presentation.quickPickState === null
        ? null
        : {
            tid: presentation.quickPickState.tid as TransformId,
            vid: presentation.quickPickState.vid as VariationId,
            type: presentation.quickPickState.type,
          },
    )
    setHoveredVariationType(presentation.hoveredVariationType)
    setAffineCardOpen(presentation.affineCardOpen)
    setColorCardOpen(presentation.colorCardOpen)
    setMetadataCardOpen(presentation.metadataCardOpen)
    setPaletteCardOpen(presentation.paletteCardOpen)
    setPrePaletteColors(deepClone(presentation.prePaletteColors))
    setRenderCardOpen(presentation.renderCardOpen)
    setFloatingActionsCollapsed(presentation.floatingActionsCollapsed)
    setReplayAffineModeRequest((previous) => ({
      mode: presentation.affineMode,
      tab: presentation.affineTab,
      epoch: previous.epoch + 1,
    }))
    setReplayColorViewRequest((previous) => ({
      view: presentation.colorView,
      epoch: previous.epoch + 1,
    }))
    loadSonificationSnapshot(state.sonification, false)
  }

  let replayBatchStart: ReplaySideState | undefined
  let replayPreviewOwner: HistoryPreviewOwner | undefined
  let replayPresentationBeforePrepare: ReplayPresentationSnapshot | undefined

  const prepareReplayFocus: ReplayFocusPreparationHandler = (preparation) => {
    if (preparation.timeline) {
      setShowTimeline(true)
      if (preparation.timeline.expand) setTimelineCollapsed(false)
    }
    if (preparation.sidebar) {
      revealSidebar()
      setQuickPickState(null)
      setHoveredVariationType(null)
      if (preparation.audioPanel) setShowAudioPanel(true)
      if (preparation.sonificationPanel) {
        revealSonificationPanel()
      }
    }

    if (preparation.clearTransformSelection) {
      setSelectedTransformId(null)
    } else if (preparation.transform) {
      const transformId = preparation.transform.id
      setSelectedTransformId(transformId)
      setCollapsedTransforms((previous) => {
        if (!previous.has(transformId)) return previous
        const next = new Set(previous)
        next.delete(transformId)
        return next
      })
    }

    if (preparation.editorSurface === 'affine') {
      setAffineCardOpen(true)
    } else if (preparation.editorSurface === 'color') {
      setColorCardOpen(true)
    } else if (preparation.editorSurface === 'metadata') {
      setMetadataCardOpen(true)
    } else if (preparation.editorSurface === 'palette') {
      setPaletteCardOpen(true)
    } else if (preparation.editorSurface === 'render') {
      setRenderCardOpen(true)
    } else if (preparation.editorSurface === 'randomizer') {
      const expandAnimation = [
        'ui:random-animation',
        'ui:smart-animation',
        'ui:animation-colors',
        'ui:animation-presets',
        'ui:animation-clear',
      ].includes(preparation.spotlightFocus ?? '')
      openRandomizerCard({
        expandAnimation,
        // Replay preparation may reveal controls, but must never author a
        // sonification-disable command or take ownership from replay.
        preserveSonificationOutput: true,
      })
    }
    if (preparation.symmetryCard) {
      setSymmetryCardOpen(true)
    }
    if (preparation.floatingActions) setFloatingActionsCollapsed(false)

    if (preparation.colorView) {
      setReplayColorViewRequest((previous) => ({
        view: preparation.colorView!,
        epoch: previous.epoch + 1,
      }))
    }

    if (preparation.affineMode || preparation.affineTab) {
      setReplayAffineModeRequest((previous) => ({
        mode: preparation.affineMode ?? previous.mode,
        tab: preparation.affineTab ?? 'grid',
        epoch: previous.epoch + 1,
      }))
    }
  }

  const replayTarget: ReplayTarget = {
    primeEffects: (session) => {
      if (sessionMayEnableSonification(session)) {
        sonificationLifecycle.prime()
      }
    },
    prepare: () => {
      // Keep the presentation from before gallery cleanup. A hover may have
      // installed a temporary document preview, so the flame baseline itself
      // is captured later, after that preview has been cleared.
      replayPresentationBeforePrepare = captureReplayPresentation()
      // Gallery hover previews are intentionally silent document swaps. End
      // them before the replay transaction captures its undo baseline; if the
      // gallery were closed later by `prepareReplayFocus`, its restore snapshot
      // could overwrite the session's freshly loaded initial flame.
      handlePreviewBlend(null)
      setHoveredBlendName(null)
      setShowBlendGallery(false)
    },
    loadInitial: (flame) => {
      // The session's initial document is a hard provenance boundary. Never
      // let Unselect restore colours stashed for the viewer's previous flame.
      setPrePaletteColors({})
      setFlameDescriptor(() => deepClone(flame), 'Replay: initial state')
    },
    // Only called when the session carries them, so replaying an older
    // recording leaves the viewer's own animation and audio wiring alone.
    loadTimeline: (data) => {
      timeline.loadTracks(data.tracks)
      timeline.setConfig(data.config)
      if (data.currentFrame !== undefined) {
        timeline.setCurrentFrame(data.currentFrame)
      }
      if (data.animationEnabled !== undefined) {
        setAnimationEnabled(data.animationEnabled)
      }
      if (data.autoKeyframe !== undefined) {
        timeline.setAutoKeyframe(data.autoKeyframe)
      }
      if (data.previewHeld !== undefined) {
        timeline.setPreviewHeld(data.previewHeld)
      }
    },
    loadAudio: (audio) => {
      // `audioTrackName` describes the resource actually loaded in this
      // workspace. A session cannot supply bytes, so never relabel B.wav as
      // the A.wav it requires or run the wrong track under the saved mapping.
      applyReplayAudioState(audio)
    },
    loadSonification: loadSonificationSnapshot,
    loadView: (view) => {
      if (view.qualityPreset in qualityPresets) {
        setQualityPreset(view.qualityPreset as QualityPreset)
      }
      if (view.pixelRatio !== undefined) setPixelRatio(view.pixelRatio)
      setAdaptiveFilterEnabled(view.adaptiveFilter)
      setStochasticFilterEnabled(view.stochasticFilter)
      setFlyMode(view.flyMode)
      setShowTimeline(view.showTimeline)
      setShowSidebar(view.sidebarOpen)
      setPrePaletteColors(deepClone(view.paletteRestoreColors ?? {}))
    },
    execute: (id, args) => {
      const currentPaletteColors = prePaletteColors()
      // Derive this before executing: applyPalette replaces the colours whose
      // exact values the later live Unselect action must restore.
      const nextPaletteColors = paletteRestoreColorsAfterReplayCommand(
        id,
        args,
        flameDescriptor,
        currentPaletteColors,
      )
      const accepted = executeReplayCommand(id, cmdContext, ...args)
      if (accepted && nextPaletteColors !== currentPaletteColors) {
        setPrePaletteColors(nextPaletteColors)
      }
      return accepted
    },
    preflight: preflightReplayCommand,
    beginBatch: (onTakeover) => {
      invalidateLastFinishedSession()
      setReplaySuspendsAudioModulation(true)
      setReplayPreservesSonificationOutput(true)
      replayBatchStart = captureReplaySideState(replayPresentationBeforePrepare)
      replayPresentationBeforePrepare = undefined
      // Transport is wall-clock state, not authored replay state. Freeze it
      // before loading the session so frames cannot advance underneath the
      // deterministic action sequence; undo never restarts playback.
      if (timeline.isPlaying()) timeline.pause()
      timeline.beginTransientHistory()
      replayPreviewOwner = history.startOwnedPreview('Replay', onTakeover)
    },
    withBatchWrite: (fn) => {
      const owner = replayPreviewOwner
      if (owner === undefined) return fn()
      return history.withPreviewOwner(owner, fn)
    },
    withDeferredEffects: withReplayDeferredEffects,
    endBatch: () => {
      const owner = replayPreviewOwner
      replayPreviewOwner = undefined
      const before = replayBatchStart
      // A presentation-only follow-cam hide must not become an authored stop.
      // Once the batch settles, make enabled output reachable again unless
      // the local keep-playing preference explicitly permits hidden sound.
      if (
        shouldRevealSonificationAfterReplay({
          enabled: sonificationEnabled(),
          panelVisible: sonificationPanelVisible(),
          keepPlayingWhenClosed: keepAudioPlayingWhenClosed(),
        })
      ) {
        revealSonificationPanel()
      }
      setReplayPreservesSonificationOutput(false)
      const afterSideState = before
        ? captureReplayNonFlameSideState()
        : undefined
      replayBatchStart = undefined
      replayPresentationBeforePrepare = undefined
      timeline.endTransientHistory()
      setReplaySuspendsAudioModulation(false)
      if (owner === undefined) return
      const sideStateChanged =
        before !== undefined &&
        afterSideState !== undefined &&
        replaySideStateChanged(before, afterSideState)
      withRecordingSuppressed(() => {
        if (sideStateChanged && before && afterSideState) {
          const after: ReplaySideState = {
            flame: deepClone(flameDescriptor),
            ...afterSideState,
          }
          history.commitOwnedPreview(owner, {
            force: true,
            undoEffect: () => {
              restoreReplaySideState(before)
            },
            redoEffect: () => {
              restoreReplaySideState(after)
            },
          })
        } else {
          history.commitOwnedPreview(owner)
        }
      })
    },
  }

  const exportReplayVideo = async (request: ReplayVideoExportRequest) => {
    try {
      if (request.mode === 'artwork') {
        enqueueAnimationJob(
          createReplayVideoJobSpec(request.session, request.playbackSpeed),
        )
        showToast('Artwork replay added to Exports', 3500)
        return
      }

      const result = await captureReplayInterfaceVideo(request)
      downloadBlob(
        result.blob,
        `${replayVideoFileName(request.session, 'interface')}.${result.extension}`,
      )
      showToast(
        result.extension === 'mp4'
          ? 'Full-interface replay downloaded'
          : 'Full-interface replay downloaded as WebM (MP4 encoding is unavailable in this browser)',
        5000,
      )
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Could not export replay video'
      showToast(message, 5000)
      throw error
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runTourCommand.fn = (id, ...args: any[]) => {
    executeCommand(id, cmdContext, ...args)
  }

  const startTimelineDrag = createDragHandler((initEvent) => {
    const handle = initEvent.currentTarget as HTMLElement
    const container = handle.parentElement
    if (!container) return
    const startY = initEvent.clientY
    const startHeight = container.offsetHeight

    function setHeight(px: number) {
      // Cap matches the CSS max-height (55vh desktop, 45vh on mobile) so the
      // handle and the rendered panel height stay in sync.
      const maxPx = window.innerHeight * (isMobile() ? 0.45 : 0.55)
      const clamped = Math.max(100, Math.min(maxPx, px))
      container!.style.setProperty('--timeline-height', `${clamped}px`)
    }

    return {
      onPointerMove(event) {
        const dy = startY - event.clientY
        setHeight(startHeight + dy)
      },
    }
  })

  const startSidebarDrag = createDragHandler((_initEvent) => {
    const sidebar = sidebarRef
    if (!sidebar) return

    return {
      onPointerMove() {
        setSidebarWidth()
      },
    }
  })

  return (
    <ChangeHistoryContextProvider value={history}>
      <TimelineContextProvider value={recorderTimeline}>
        <Dropzone class={ui.layout} onDrop={onDrop}>
          <>
            <div
              class={ui.canvasContainer}
              data-tour-target="canvas"
              classList={{ [ui.fullscreen as string]: !showSidebar() }}
              onClick={() => {
                // Tap canvas to close sidebar on mobile
                if (isMobile()) hideMobileSidebarAsAuthoredAction()
              }}
            >
              <Show when={isMobile()}>
                <button
                  class={ui.sidebarToggle}
                  data-replay-region="dim"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleMobileSidebarAsAuthoredAction()
                  }}
                  aria-label="Toggle sidebar"
                >
                  <Menu />
                </button>
              </Show>
              {/* Text alternative for the WebGPU canvas (WCAG 1.1.1): a name
                  via aria-label plus a live, screen-reader-only description of
                  the current flame (a pixel-accurate alt is impossible for
                  generative art, so describe its structure instead). */}
              <p id="flame-canvas-desc" class="sr-only" aria-live="polite">
                {(() => {
                  const name = flameDescriptor.metadata?.name?.trim()
                  const count = Object.keys(
                    flameDescriptor.transforms ?? {},
                  ).length
                  const label =
                    name && name.toLowerCase() !== 'unknown'
                      ? name
                      : 'Untitled flame'
                  return `${label}: ${count} transform${count === 1 ? '' : 's'}.`
                })()}
              </p>
              <AutoCanvas
                class={ui.canvas}
                data-replay-region="canvas"
                role="img"
                ariaLabel="Fractal flame preview"
                ariaDescribedby="flame-canvas-desc"
                pixelRatio={canvasPixelRatio()}
                fixedResolution={exportDimensions()}
              >
                <Suspense>
                  <ErrorBoundary
                    fallback={(err) => (
                      <div
                        style={{
                          color: 'red',
                          display: 'flex',
                          'align-items': 'center',
                          'justify-content': 'center',
                          height: '100%',
                          'text-align': 'center',
                          padding: '20px',
                          'flex-direction': 'column',
                          gap: '1rem',
                        }}
                      >
                        <p>
                          Failed to render flame. The flame or animation data
                          might be invalid or incompatible.
                        </p>
                        <p>
                          <code>{String(err)}</code>
                        </p>
                        <Button
                          onClick={() => {
                            window.location.reload()
                          }}
                        >
                          Reload Page
                        </Button>
                      </div>
                    )}
                  >
                    <Show
                      when={effectiveFlame().renderSettings.dimensions === 3}
                      fallback={
                        <WheelZoomCamera2D
                          zoom={[effectiveZoom, setFlameZoom]}
                          position={[effectivePosition, setFlamePosition]}
                          interactive={() =>
                            !timeline.isPlaying() &&
                            (!animationExportRunning() ||
                              cameraDuringExportEnabled())
                          }
                        >
                          <Flam3
                            quality={
                              exportQuality() ?? qualityPresets[qualityPreset()]
                            }
                            pointCountPerBatch={DEFAULT_POINT_COUNT}
                            isExportRenderer
                            adaptiveFilterEnabled={adaptiveFilterEnabled()}
                            stochasticFilterEnabled={stochasticFilterEnabled()}
                            animationEnabled={animationEnabled()}
                            flameDescriptor={effectiveFlame()}
                            renderInterval={finalRenderInterval()}
                            onExportImage={onExportImage()}
                            edgeFadeColor={
                              showSidebar()
                                ? EDGE_FADE_COLOR[theme()]
                                : vec4f(0)
                            }
                            setCurrentQuality={(fn) =>
                              setCurrentQuality(() => fn)
                            }
                            setQualityPointCountLimit={(fn) =>
                              setQualityPointCountLimit(() => fn)
                            }
                            palette={() => selectedPalette()}
                            blendFlame={blendFlame()}
                            blendWeight={resolvedBlendWeight()}
                          />
                        </WheelZoomCamera2D>
                      }
                    >
                      <WheelZoomCamera3D
                        theta={[effectiveTheta, setFlameTheta]}
                        phi={[effectivePhi, setFlamePhi]}
                        radius={[effectiveRadius, setFlameRadius]}
                        target={[effectiveTarget3D, setFlameTarget3D]}
                        fov={[effectiveFov, setFlameFov]}
                        roll={[effectiveRoll, setFlameRoll]}
                        flyMode={flyMode}
                        flySpeed={flySpeed}
                        interactive={() =>
                          !timeline.isPlaying() &&
                          (!animationExportRunning() ||
                            cameraDuringExportEnabled())
                        }
                      >
                        <Flam3
                          quality={
                            exportQuality() ?? qualityPresets[qualityPreset()]
                          }
                          pointCountPerBatch={DEFAULT_POINT_COUNT}
                          isExportRenderer
                          adaptiveFilterEnabled={adaptiveFilterEnabled()}
                          animationEnabled={animationEnabled()}
                          flameDescriptor={effectiveFlame()}
                          renderInterval={finalRenderInterval()}
                          onExportImage={onExportImage()}
                          edgeFadeColor={
                            showSidebar() ? EDGE_FADE_COLOR[theme()] : vec4f(0)
                          }
                          setCurrentQuality={(fn) =>
                            setCurrentQuality(() => fn)
                          }
                          setQualityPointCountLimit={(fn) =>
                            setQualityPointCountLimit(() => fn)
                          }
                          palette={() => selectedPalette()}
                          blendFlame={blendFlame()}
                          blendWeight={resolvedBlendWeight()}
                        />
                      </WheelZoomCamera3D>
                    </Show>
                  </ErrorBoundary>
                </Suspense>
              </AutoCanvas>
              <Show when={hoveredVariationType()} keyed>
                {(hv) => (
                  <div class={ui.hoverPreviewBadge}>
                    Previewing: {getNormalizedVariationName(hv)}
                  </div>
                )}
              </Show>
              <Show when={hoveredCustomVarDef()} keyed>
                {(cv) => (
                  <div class={ui.hoverPreviewBadge}>
                    Previewing custom: {cv.name}
                  </div>
                )}
              </Show>
              <Show when={hoveredBlendName()} keyed>
                {(name) => (
                  <div class={ui.hoverPreviewBadge}>Blending with {name}</div>
                )}
              </Show>
              <ProgressBar />
              <ExportJobHost />
              <ExportJobTracker />
              <div class={ui.bottomBar} data-replay-region="dim">
                {/* In the bottom bar's normal flow rather than floating over
                    the canvas — the draggable FloatingActions widget is fixed
                    at z-index 200 and would sit on top of it, swallowing its
                    clicks. Was dev-gated while replay did not exist; now that
                    it does, and a log states its own fidelity via the
                    unnamed-write count, there is nothing to hide behind a
                    build flag. */}
                {/* Stays mounted while a recording is running whatever the
                    toolbar toggle says — hiding the only Stop button mid-take
                    would strand the recording. */}
                <Show when={recorderVisible() || isSessionRecording()}>
                  <SessionRecorderDock
                    flameDescriptor={flameDescriptor}
                    startExtras={captureRecorderStartExtras}
                    onRecordingStarted={() => {
                      // Freeze wall-clock playback only after the recorder
                      // accepts the snapshot. A rejected start must leave the
                      // viewer exactly as it was. This is recorder plumbing,
                      // not an authored transport step in the new take.
                      if (timeline.isPlaying()) {
                        withRecordingSuppressed(() => {
                          timeline.pause()
                        })
                      }
                    }}
                    target={replayTarget}
                    onPrepareAction={prepareReplayFocus}
                    session={replaySession()}
                    onSessionChange={openReplaySession}
                    libraryRevision={externalSessionLibraryRevision()}
                    onExportVideo={exportReplayVideo}
                    onReplayPresentationChange={setRecorderReplayPresentation}
                    busy={animationExportRunning() || timeline.isPlaying()}
                    replayBlocked={animationExportRunning()}
                  />
                </Show>
                <Show when={effectiveFlame().renderSettings.dimensions === 3}>
                  <OrientationGizmo
                    theta={[effectiveTheta, setFlameTheta]}
                    phi={[effectivePhi, setFlamePhi]}
                  />
                </Show>
                <div
                  class={ui.viewControlsWrapper}
                  data-tour-target="view-controls"
                  style={{
                    'pointer-events':
                      animationExportRunning() || timeline.isPlaying()
                        ? 'none'
                        : 'auto',
                    opacity:
                      animationExportRunning() || timeline.isPlaying()
                        ? 0.5
                        : 1,
                  }}
                >
                  <ViewControls
                    zoom={effectiveZoom()}
                    setZoom={setFlameZoom}
                    position={effectivePosition()}
                    setPosition={setFlamePosition}
                    pixelRatio={pixelRatio()}
                    setPixelRatio={(ratio) => {
                      const next =
                        typeof ratio === 'function'
                          ? ratio(pixelRatio())
                          : ratio
                      executeCommand('view.setPixelRatio', cmdContext, next)
                      return next
                    }}
                    controlsDisabled={timeline.isPlaying()}
                    onUndo={() => {
                      executeCommand('history.undo', cmdContext)
                    }}
                    onRedo={() => {
                      executeCommand('history.redo', cmdContext)
                    }}
                    canUndo={undoRouter.canUndo}
                    canRedo={undoRouter.canRedo}
                    blendFlame={blendFlame()}
                    blendWeight={resolvedBlendWeight()}
                    onPickBlendFlame={pickBlendFlame}
                    onMorphFlame={pickMorphFlame}
                    onBreedFlame={pickBreedFlame}
                    onEvolveFlame={pickEvolveFlame}
                    onSimulatorFlame={pickSimulatorFlame}
                    onDiffFlame={pickDiffFlame}
                    onAncestryFlame={pickAncestryFlame}
                    onGalleryFlame={pickGalleryFlame}
                    onArtDirector={openArtDirectorUI}
                    onFlameClash={openFlameClashUI}
                    onClearBlendFlame={() => {
                      setBlendFlame(undefined)
                    }}
                    onBlendWeightChange={setBlendWeight}
                    is3D={effectiveFlame().renderSettings.dimensions === 3}
                    flameName={flameDescriptor.metadata?.name}
                    theta={effectiveTheta()}
                    phi={effectivePhi()}
                    radius={effectiveRadius()}
                    fov={effectiveFov()}
                    setTheta={setFlameTheta}
                    setPhi={setFlamePhi}
                    setRadius={setFlameRadius}
                    setFov={setFlameFov}
                    flyMode={flyMode()}
                    flySpeed={flySpeed[0]()}
                    setFlySpeed={flySpeed[1]}
                    onAudioReactive={() => {
                      setShowBlendGallery(false)
                      closeSonificationPanelAsAuthoredAction()
                      setShowAudioPanel(true)
                    }}
                    onSonification={() => {
                      setShowBlendGallery(false)
                      setShowAudioPanel(false)
                      setShowSonificationPanel(true)
                    }}
                  />
                </div>
                <Show when={showTimeline()}>
                  <div
                    class={ui.timelineContainer}
                    // During playback (and animation export) the timeline is
                    // dimmed + locked so the canvas/animation reads cleanly.
                    // Playback additionally tags itself so ONLY the transport bar
                    // stays clickable (to pause) — see [data-playback-locked] in
                    // TimelineSection.module.css. Animation export stays fully
                    // locked so a stray click can't start playback mid-render
                    // (#8). Image export now runs offscreen (background job) and
                    // does NOT lock the workspace.
                    data-playback-locked={
                      timeline.isPlaying() && !animationExportRunning()
                        ? 'true'
                        : undefined
                    }
                    data-replay-region={
                      recorderReplayPresentation().playing &&
                      !recorderReplayPresentation().timelineTargeted
                        ? 'recessed'
                        : undefined
                    }
                    style={{
                      'pointer-events':
                        animationExportRunning() || timeline.isPlaying()
                          ? 'none'
                          : 'auto',
                      opacity:
                        animationExportRunning() || timeline.isPlaying()
                          ? 0.5
                          : recorderReplayPresentation().playing &&
                              !recorderReplayPresentation().timelineTargeted
                            ? 0.1
                            : 1,
                    }}
                    onWheel={(ev) => {
                      if (!ev.ctrlKey && !ev.metaKey) return
                      ev.preventDefault()
                      const delta = -ev.deltaY * 0.5
                      const container = ev.currentTarget as HTMLElement
                      const currentHeight = container.offsetHeight
                      const newHeight = Math.max(
                        100,
                        Math.min(
                          window.innerHeight * (isMobile() ? 0.45 : 0.55),
                          currentHeight + delta,
                        ),
                      )
                      container.style.setProperty(
                        '--timeline-height',
                        `${newHeight}px`,
                      )
                    }}
                  >
                    <div
                      class={ui.timelineResizeHandle}
                      onPointerDown={startTimelineDrag}
                      title="Resize timeline"
                    />
                    <TimelineSection
                      formatTrackLabel={readableIds().formatTrackPath}
                      flameDescriptor={flameDescriptor}
                      collapsed={timelineCollapsed}
                      setCollapsed={setTimelineCollapsed}
                      onOpenAnimationGenerator={openAnimationGenerator}
                      onSetAutoKeyframe={(enabled) => {
                        executeCommand(
                          'timeline.setAutoKeyframe',
                          cmdContext,
                          enabled,
                        )
                      }}
                    />
                  </div>
                </Show>
              </div>
            </div>
          </>
          <DebugOverlay
            animationEnabled={animationEnabled()}
            flameDescriptor={flameDescriptor}
          />

          <Show when={showSidebar()}>
            <div
              class={ui.sidebar}
              data-replay-region="dim"
              classList={{
                [ui.sidebarLocked as string]: timeline.isPlaying(),
                [ui.sidebarHidden as string]: sidebarHidden(),
              }}
              style={{ '--sidebar-width': `${sidebarWidth()}rem` }}
              data-tour-target="sidebar"
              ref={(el) => {
                sidebarRef = el
                setSidebarEl(el)
              }}
            >
              {SIDEBAR_RESIZABLE && (
                <div
                  class={ui.sidebarResizeHandle}
                  onPointerDown={startSidebarDrag}
                />
              )}
              <Show when={timeline.isPlaying() || animationExportRunning()}>
                <div
                  class={ui.playbackOverlay}
                  classList={{
                    [ui.exportOverlay as string]: animationExportRunning(),
                  }}
                  onClick={() => {
                    if (timeline.isPlaying()) {
                      recorderTimeline.togglePlay()
                    }
                  }}
                >
                  <span class={ui.playbackOverlayText}>
                    {animationExportRunning()
                      ? 'Rendering animation...'
                      : 'Tap to stop animation'}
                  </span>
                  <Show when={animationExportRunning()}>
                    {/* Stop the click from bubbling to the overlay's
                        tap-to-stop-playback handler. */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      <ExportActions
                        variant="overlay"
                        stopLabel="Stop & Save"
                        stopTitle="Stop after current frame and save"
                        onStop={() => setForceAnimationExportNow(true)}
                        cancelTitle="Cancel and discard"
                        onCancel={() => {
                          const cancelFn = animationExportCancel()
                          if (cancelFn) cancelFn()
                        }}
                      />
                    </div>
                  </Show>
                </div>
              </Show>
              <Show when={isMobile()}>
                <div class={ui.sidebarCloseRow}>
                  <button
                    class={ui.sidebarCloseBtn}
                    onClick={hideMobileSidebarAsAuthoredAction}
                    aria-label="Collapse sidebar"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18">
                      <path
                        fill="currentColor"
                        d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"
                      />
                    </svg>
                  </button>
                </div>
              </Show>
              <div class={ui.sidebarScroll} ref={sidebarScrollRef}>
                <Show
                  when={sidebarDiffView()}
                  keyed
                  fallback={
                    <Show
                      when={
                        showBlendGallery() ||
                        showAudioPanel() ||
                        showSonificationPanel()
                      }
                      fallback={
                        <>
                          <Show when={quickPickState()} keyed>
                            {(state) => (
                              <QuickVariationPicker
                                currentType={
                                  flameDescriptor.transforms[state.tid]
                                    ?.variations[state.vid]?.type ?? state.type
                                }
                                dims={
                                  (flameDescriptor.renderSettings.dimensions ??
                                    2) as Dims
                                }
                                hardwareTier={props.hardwareTier}
                                pointInitMode={
                                  flameDescriptor.renderSettings.pointInitMode
                                }
                                onSelect={(newType) => {
                                  // The new descriptor is built here and
                                  // recorded whole, so replay lands on the
                                  // same variation without re-deriving it.
                                  const existingVar =
                                    flameDescriptor.transforms[state.tid]
                                      ?.variations[state.vid]
                                  if (!existingVar) return
                                  executeCommand(
                                    'flame.setVariation',
                                    cmdContext,
                                    state.tid,
                                    state.vid,
                                    deepClone(
                                      getVariationDefault(
                                        newType,
                                        existingVar.weight,
                                      ),
                                    ),
                                    'type',
                                  )
                                }}
                                onClose={() => {
                                  // Save scroll position before the Show block unmounts
                                  savedScrollTop =
                                    sidebarScrollRef?.scrollTop ?? 0
                                  setHoveredVariationType(null)
                                  setQuickPickState(null)
                                  // Restore after Solid re-renders the normal sidebar
                                  queueMicrotask(() => {
                                    if (sidebarScrollRef) {
                                      sidebarScrollRef.scrollTop =
                                        savedScrollTop
                                    }
                                  })
                                }}
                                onHoverType={(type) =>
                                  setHoveredVariationType(type)
                                }
                                onHoverClear={() =>
                                  setHoveredVariationType(null)
                                }
                                mode={quickPickerMode()}
                                onModeChange={setQuickPickerMode}
                                onOpenFullSelector={() => {
                                  console.info(
                                    '[QuickVariationPicker] onOpenFullSelector — opening full VariationSelector',
                                    { tid: state.tid, vid: state.vid },
                                  )
                                  const currentVar =
                                    flameDescriptor.transforms[state.tid]
                                      ?.variations[state.vid]
                                  if (!currentVar) return
                                  // Close quick picker first so modal stacking works
                                  setQuickPickState(null)
                                  queueMicrotask(() => {
                                    showVariationSelector(
                                      deepClone(currentVar),
                                      deepClone(flameDescriptor),
                                      state.tid,
                                      state.vid,
                                      {
                                        setFlameTheta,
                                        setFlamePhi,
                                        setFlameRadius,
                                        setFlameTarget3D,
                                        setFlameFov,
                                      },
                                    )
                                      .then((newValue) => {
                                        if (
                                          newValue === undefined ||
                                          !isVariationType(
                                            newValue.variation.type,
                                          )
                                        ) {
                                          return
                                        }
                                        executeCommand(
                                          'flame.applyVariationSelection',
                                          cmdContext,
                                          state.tid,
                                          state.vid,
                                          newValue.transform.preAffine,
                                          newValue.variation,
                                        )
                                      })
                                      .catch((err: unknown) => {
                                        console.warn(
                                          'Cannot load this variation, reason: ',
                                          err,
                                        )
                                      })
                                  })
                                }}
                              />
                            )}
                          </Show>
                          <Show when={!quickPickState()}>
                            <CollapsibleCard
                              title="Affine"
                              open={affineCardOpen()}
                              onToggleOpen={() => {
                                setAffineCardOpen((open) => !open)
                              }}
                            >
                              <AffineEditor
                                class={ui.affineEditor}
                                transforms={flameDescriptor.transforms}
                                setTransforms={(setFn) => {
                                  setFlameDescriptor((draft) => {
                                    setFn(draft.transforms)
                                  })
                                }}
                                setTransformAffine={(
                                  tid,
                                  which,
                                  affine,
                                  origin,
                                ) => {
                                  executeCommand(
                                    'flame.setTransformAffine',
                                    cmdContext,
                                    tid,
                                    which,
                                    affine,
                                    origin,
                                  )
                                }}
                                setAffineCoefficient={(
                                  tid,
                                  which,
                                  key,
                                  value,
                                ) => {
                                  executeCommand(
                                    'flame.setAffine',
                                    cmdContext,
                                    tid,
                                    which,
                                    key,
                                    value,
                                  )
                                }}
                                finalTransform={
                                  flameDescriptor.finalTransform ??
                                  ((flameDescriptor.renderSettings.dimensions ??
                                    2) === 3
                                    ? // 3D identity in the kernel's layout
                                      // (diagonal a,f,k; translation d,h,l)
                                      {
                                        a: 1,
                                        b: 0,
                                        c: 0,
                                        d: 0,
                                        e: 0,
                                        f: 1,
                                        g: 0,
                                        h: 0,
                                        i: 0,
                                        j: 0,
                                        k: 1,
                                        l: 0,
                                      }
                                    : { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 })
                                }
                                setFinalTransform={(affine, origin) => {
                                  executeCommand(
                                    'flame.setFinalTransform',
                                    cmdContext,
                                    affine,
                                    origin,
                                  )
                                }}
                                setFinalAffineCoefficient={(key, value) => {
                                  executeCommand(
                                    'flame.setFinalAffine',
                                    cmdContext,
                                    key,
                                    value,
                                  )
                                }}
                                is3D={
                                  (flameDescriptor.renderSettings.dimensions ??
                                    2) === 3
                                }
                                selectedTransformId={selectedTransformId}
                                setSelectedTransformId={setSelectedTransformId}
                                enableChangeTracking
                                replayModeRequest={replayAffineModeRequest}
                                onEditorStateChange={(state) => {
                                  setReplayAffineModeRequest((previous) =>
                                    previous.mode === state.mode &&
                                    previous.tab === state.tab
                                      ? previous
                                      : {
                                          ...state,
                                          epoch: previous.epoch + 1,
                                        },
                                  )
                                }}
                              />
                            </CollapsibleCard>
                            <CollapsibleCard
                              title="Color"
                              open={colorCardOpen()}
                              onToggleOpen={() => {
                                setColorCardOpen((open) => !open)
                              }}
                            >
                              <div>
                                <ColorEditor
                                  transforms={flameDescriptor.transforms}
                                  setTransforms={(setFn) => {
                                    setFlameDescriptor((draft) => {
                                      setFn(draft.transforms)
                                    })
                                  }}
                                  setTransformColor={(tid, x, y, origin) => {
                                    executeCommand(
                                      'flame.setTransformColor',
                                      cmdContext,
                                      tid,
                                      x,
                                      y,
                                      origin,
                                    )
                                  }}
                                  selectedTransformId={selectedTransformId}
                                  setSelectedTransformId={
                                    setSelectedTransformId
                                  }
                                  enableChangeTracking
                                  replayViewRequest={replayColorViewRequest}
                                  onViewChange={(view) => {
                                    setReplayColorViewRequest((previous) =>
                                      previous.view === view
                                        ? previous
                                        : {
                                            view,
                                            epoch: previous.epoch + 1,
                                          },
                                    )
                                  }}
                                />
                              </div>
                            </CollapsibleCard>
                            <CollapsibleCard
                              title="Palette"
                              open={paletteCardOpen()}
                              onToggleOpen={() => {
                                setPaletteCardOpen((open) => !open)
                              }}
                            >
                              <div data-tour-target="palette-selector">
                                <PaletteSelector
                                  selectedPaletteId={selectedPaletteId()}
                                  onSelect={handlePaletteSelect}
                                  onUnselect={handlePaletteUnselect}
                                />
                              </div>
                            </CollapsibleCard>
                            <Show
                              when={
                                flameDescriptor.renderSettings.dimensions !== 3
                              }
                            >
                              <CollapsibleCard
                                title="Custom Variations"
                                defaultOpen={false}
                              >
                                <For
                                  each={customVariationsList()}
                                  fallback={
                                    <div class={ui.customVarEmpty}>
                                      No custom variations yet
                                    </div>
                                  }
                                >
                                  {(def) => (
                                    <div
                                      class={ui.customVarItem}
                                      onContextMenu={(e) => {
                                        e.preventDefault()
                                      }}
                                      onMouseEnter={() =>
                                        setHoveredCustomVarDef(def)
                                      }
                                      onMouseLeave={() =>
                                        setHoveredCustomVarDef(null)
                                      }
                                      onClick={() => {
                                        void showCustomVariationEditor(
                                          def,
                                        ).then((addedDef) => {
                                          if (addedDef) {
                                            executeCommand(
                                              'flame.addTransform',
                                              cmdContext,
                                              addedDef.id,
                                            )
                                          }
                                          setCustomVarsVersion((v) => v + 1)
                                        })
                                      }}
                                    >
                                      <span class={ui.customVarItemName}>
                                        {def.name}
                                      </span>
                                      <div class={ui.customVarItemActions}>
                                        <button
                                          class={ui.customVarItemBtn}
                                          classList={{
                                            [ui.customVarItemBtnPrimary as string]: true,
                                          }}
                                          title="Add to flame"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setHoveredCustomVarDef(null)
                                            executeCommand(
                                              'flame.addTransform',
                                              cmdContext,
                                              def.id,
                                            )
                                          }}
                                        >
                                          <BoxArrowRight />
                                        </button>
                                        <button
                                          class={ui.customVarItemBtn}
                                          title="Share variation link"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setHoveredCustomVarDef(null)
                                            void showShareVariationLinkModal(
                                              def,
                                            )
                                          }}
                                        >
                                          <Share />
                                        </button>
                                        <button
                                          class={ui.customVarItemBtn}
                                          title="Duplicate"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            duplicateCustomVariation(def.id)
                                            setCustomVarsVersion((v) => v + 1)
                                          }}
                                        >
                                          ⧉
                                        </button>
                                        <button
                                          class={ui.customVarItemBtn}
                                          classList={{
                                            [ui.customVarItemBtnDanger as string]: true,
                                          }}
                                          title="Delete"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            void handleDeleteCustomVariation(
                                              def,
                                            )
                                          }}
                                        >
                                          ×
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </For>
                                <button
                                  class={ui.customVarsButton}
                                  onClick={async () => {
                                    const addedDef =
                                      await showCustomVariationEditor()
                                    if (addedDef) {
                                      executeCommand(
                                        'flame.addTransform',
                                        cmdContext,
                                        addedDef.id,
                                      )
                                    }
                                    setCustomVarsVersion((v) => v + 1)
                                  }}
                                  title="Create a new custom variation"
                                >
                                  <Plus />
                                  <span>Create Variation</span>
                                </button>
                              </CollapsibleCard>
                            </Show>
                            <div
                              ref={randomizerCardRef}
                              data-tour-target="randomizer-card"
                            >
                              <FlameRandomizerCard
                                flame={flameDescriptor}
                                open={randomizerOpen()}
                                onToggleOpen={() =>
                                  setRandomizerOpen((v) => !v)
                                }
                                expandAnimationEpoch={randomizerAnimEpoch()}
                                historyEntries={randomizerHistory()}
                                selectedTimestamp={selectedHistoryTimestamp()}
                                onGenerateFlame={handleGenerateFlame}
                                onMutateFlame={handleMutateFlame}
                                onLoadHistory={handleLoadHistory}
                                onClearHistory={handleClearHistory}
                                onRandomizeAnimation={handleRandomizeAnimation}
                                onSmartAnimation={handleSmartAnimation}
                                onUpdateRenderSettings={
                                  handleUpdateRenderSettings
                                }
                                onApplyCandidate={(flame) => {
                                  if (blendFlame())
                                    showToast(
                                      'Blend is still active — the loaded flame will look mixed',
                                      4000,
                                    )
                                  executeFlameLoad(
                                    flame,
                                    'Apply Random Flame',
                                    snapshotOrigin('flame.random-gallery'),
                                  )
                                }}
                                hardwareTier={props.hardwareTier}
                                isBusy={isRandomizing()}
                              />
                            </div>
                            <div
                              class={ui.transformsToolbar}
                              data-tour-target="transform-list"
                            >
                              <span class={ui.transformsToolbarLabel}>
                                Transforms
                              </span>
                              <span
                                class={ui.transformHeaderAction}
                                role="button"
                                tabindex={0}
                                title={
                                  anyTransformOpen()
                                    ? 'Collapse all transform cards'
                                    : 'Expand all transform cards'
                                }
                                onClick={toggleCollapseAllTransforms}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    toggleCollapseAllTransforms()
                                  }
                                }}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                >
                                  {/* Chevrons-up = collapse all; chevrons-down = expand all */}
                                  <Show
                                    when={anyTransformOpen()}
                                    fallback={
                                      <>
                                        <polyline points="6 5 12 11 18 5" />
                                        <polyline points="6 13 12 19 18 13" />
                                      </>
                                    }
                                  >
                                    <polyline points="18 11 12 5 6 11" />
                                    <polyline points="18 19 12 13 6 19" />
                                  </Show>
                                </svg>
                              </span>
                            </div>
                            <For
                              each={sortedTransformEntries(
                                recordEntries(flameDescriptor.transforms),
                              ).filter(([tid]) => !tid.startsWith('_sym__'))}
                            >
                              {([tid, transform]) => (
                                <CollapsibleCard
                                  title={readableIds().transformLabel[tid]!}
                                  data-focus-id={transformFocusId(tid)}
                                  open={!collapsedTransforms().has(tid)}
                                  onToggleOpen={() => {
                                    toggleTransformCollapsed(tid)
                                  }}
                                  selected={selectedTransformId() === tid}
                                  dimmed={
                                    selectedTransformId() !== null &&
                                    selectedTransformId() !== tid
                                  }
                                  accentColor={handleColor(
                                    theme(),
                                    vec2f(transform.color.x, transform.color.y),
                                  )}
                                  onToggleSelect={() =>
                                    toggleSelectedTransform(tid)
                                  }
                                  headerActions={
                                    <>
                                      <Show when={!hideDiceButtons()}>
                                        <span
                                          class={ui.transformHeaderAction}
                                          data-focus-id={transformColorRandomizeFocusId(
                                            tid,
                                          )}
                                          role="button"
                                          tabindex={0}
                                          title="Randomize transform color"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            // Uniform OkLab hue at a vivid chroma so
                                            // every hue is equally likely (the old
                                            // random in x/y skewed reddish).
                                            const hue = random01() * 2 * Math.PI
                                            const chroma =
                                              0.25 + random01() * 0.15
                                            // The randomness lands in the
                                            // recorded args, so the log needs
                                            // no seed to replay this exactly.
                                            executeCommand(
                                              'flame.setTransformColor',
                                              cmdContext,
                                              tid,
                                              chroma * Math.cos(hue),
                                              chroma * Math.sin(hue),
                                              'card-randomize',
                                            )
                                          }}
                                        >
                                          <Shuffle />
                                        </span>
                                      </Show>
                                      <span
                                        class={ui.transformHeaderAction}
                                        data-focus-id={transformVisibilityFocusId(
                                          tid,
                                        )}
                                        role="button"
                                        tabindex={0}
                                        title={
                                          transform.visible
                                            ? 'Hide transform'
                                            : 'Show transform'
                                        }
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          executeCommand(
                                            'flame.setTransformVisible',
                                            cmdContext,
                                            tid,
                                            !transform.visible,
                                          )
                                        }}
                                      >
                                        {transform.visible ? (
                                          <Eye />
                                        ) : (
                                          <EyeOff />
                                        )}
                                      </span>
                                      <span
                                        class={ui.transformHeaderAction}
                                        role="button"
                                        tabindex={0}
                                        title="Delete transform"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          executeCommand(
                                            'flame.deleteTransform',
                                            cmdContext,
                                            tid,
                                          )
                                        }}
                                      >
                                        <Cross />
                                      </span>
                                    </>
                                  }
                                >
                                  <div class={ui.transformGrid}>
                                    <div
                                      data-tour-target="probability"
                                      classList={{
                                        [ui.transformGridRow as string]: true,
                                        [ui.transformGridFirstRow as string]: true,
                                      }}
                                      onClick={() => {
                                        setTargetedParameter(
                                          `transform.${tid}.probability`,
                                        )
                                      }}
                                    >
                                      <Slider
                                        class={ui.transformGridFirstRow}
                                        label="Probability"
                                        value={transform.probability}
                                        min={0}
                                        max={1}
                                        step={0.001}
                                        onInput={(probability) => {
                                          executeCommand(
                                            'flame.setProbability',
                                            cmdContext,
                                            tid,
                                            probability,
                                          )
                                        }}
                                        formatValue={(value) =>
                                          formatPercent(
                                            value / totalProbability(),
                                          )
                                        }
                                        dataParameterPath={`transform.${tid}.probability`}
                                      />
                                    </div>
                                    <div
                                      classList={{
                                        [ui.transformGridRow as string]: true,
                                      }}
                                      onClick={() => {
                                        setTargetedParameter(
                                          `transform.${tid}.colorSpeed`,
                                        )
                                      }}
                                    >
                                      <Slider
                                        class={ui.transformGridFirstRow}
                                        label="Color Speed"
                                        value={transform.colorSpeed ?? 0.4}
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        onInput={(val) => {
                                          executeCommand(
                                            'flame.setColorSpeed',
                                            cmdContext,
                                            tid,
                                            val,
                                          )
                                        }}
                                        dataParameterPath={`transform.${tid}.colorSpeed`}
                                        data-tour-target="colorSpeed-slider"
                                      />
                                    </div>
                                    <For
                                      each={recordEntries(transform.variations)}
                                    >
                                      {([vid, variation]) => (
                                        <>
                                          <div class={ui.transformGridRow}>
                                            <button
                                              class={ui.variationButton}
                                              data-tour-target="variation-type"
                                              data-focus-id={variationTypeFocusId(
                                                tid,
                                                vid,
                                              )}
                                              value={variation.type}
                                              title={
                                                customStatus(variation.type) ===
                                                'unavailable'
                                                  ? `${getNormalizedVariationName(variation.type)} — custom variation unavailable (deleted from your library)`
                                                  : getNormalizedVariationName(
                                                      variation.type,
                                                    )
                                              }
                                              onClick={() => {
                                                // Auto-open sidebar on mobile so the picker is visible
                                                if (
                                                  isMobile() &&
                                                  sidebarHidden()
                                                ) {
                                                  setSidebarHidden(false)
                                                }
                                                setQuickPickState({
                                                  tid: toTransformId(tid),
                                                  vid: toVariationId(vid),
                                                  type: variation.type,
                                                })
                                              }}
                                              onContextMenu={(e) => {
                                                e.preventDefault()
                                                showVariationSelector(
                                                  deepClone(variation),
                                                  deepClone(flameDescriptor),
                                                  toTransformId(tid),
                                                  toVariationId(vid),
                                                  {
                                                    setFlameTheta,
                                                    setFlamePhi,
                                                    setFlameRadius,
                                                    setFlameTarget3D,
                                                    setFlameFov,
                                                  },
                                                )
                                                  .then((newValue) => {
                                                    if (
                                                      newValue === undefined ||
                                                      !isVariationType(
                                                        newValue.variation.type,
                                                      )
                                                    ) {
                                                      return
                                                    }
                                                    executeCommand(
                                                      'flame.applyVariationSelection',
                                                      cmdContext,
                                                      tid,
                                                      vid,
                                                      newValue.transform
                                                        .preAffine,
                                                      newValue.variation,
                                                    )
                                                  })
                                                  .catch((err: unknown) => {
                                                    console.warn(
                                                      'Cannot load this variation, reason: ',
                                                      err,
                                                    )
                                                  })
                                              }}
                                            >
                                              <div
                                                class={ui.variationButtonText}
                                              >
                                                <Show when={animationEnabled()}>
                                                  <span class={ui.readableId}>
                                                    {
                                                      readableIds()
                                                        .variationLabel[vid]
                                                    }
                                                  </span>
                                                </Show>
                                                <span class={ui.variationName}>
                                                  {getNormalizedVariationName(
                                                    variation.type,
                                                  )}
                                                </span>
                                              </div>
                                              {/* Custom variation marker: accent dot
                                              when live, red when the flame still
                                              references one deleted from the
                                              library. */}
                                              <Show
                                                when={
                                                  customStatus(
                                                    variation.type,
                                                  ) !== 'none'
                                                }
                                              >
                                                <span
                                                  class={ui.customBadge}
                                                  classList={{
                                                    [ui.customBadgeUnavailable as string]:
                                                      customStatus(
                                                        variation.type,
                                                      ) === 'unavailable',
                                                  }}
                                                  title={
                                                    customStatus(
                                                      variation.type,
                                                    ) === 'unavailable'
                                                      ? 'Custom variation — unavailable (deleted from your library)'
                                                      : `Custom Variation ${getNormalizedVariationName(variation.type)}`
                                                  }
                                                />
                                              </Show>
                                            </button>
                                            <div
                                              class={ui.sliderGridWrapper}
                                              classList={{
                                                [ui.parameterTarget as string]: true,
                                              }}
                                              data-tour-target="variation-weight"
                                              onClick={() => {
                                                setTargetedParameter(
                                                  `${tid}.${vid}`,
                                                )
                                              }}
                                            >
                                              <Slider
                                                value={variation.weight}
                                                min={0}
                                                max={1}
                                                step={0.001}
                                                dataParameterPath={`${tid}.${vid}`}
                                                onInput={(weight) => {
                                                  executeCommand(
                                                    'flame.setVariationWeight',
                                                    cmdContext,
                                                    tid,
                                                    vid,
                                                    weight,
                                                  )
                                                }}
                                                formatValue={formatPercent}
                                              />
                                            </div>
                                            <Show when={!hideDiceButtons()}>
                                              <DiceButton
                                                focusId={variationRandomizeFocusId(
                                                  tid,
                                                  vid,
                                                )}
                                                onClick={() => {
                                                  // Rolled here, recorded as
                                                  // the resulting descriptor:
                                                  // replay reproduces it
                                                  // without re-rolling.
                                                  const params =
                                                    randomizeVariationParams(
                                                      variation.type,
                                                    )
                                                  executeCommand(
                                                    'flame.setVariation',
                                                    cmdContext,
                                                    tid,
                                                    vid,
                                                    {
                                                      ...deepClone(variation),
                                                      weight: random01(),
                                                      ...(params
                                                        ? { params }
                                                        : {}),
                                                    },
                                                    'randomize',
                                                  )
                                                }}
                                                title="Randomize variation"
                                              />
                                            </Show>
                                            <button
                                              class={ui.visibilityButton}
                                              data-focus-id={variationVisibilityFocusId(
                                                tid,
                                                vid,
                                              )}
                                              title={
                                                variation.visible
                                                  ? 'Hide variation'
                                                  : 'Show variation'
                                              }
                                              onClick={() => {
                                                executeCommand(
                                                  'flame.setVariationVisible',
                                                  cmdContext,
                                                  tid,
                                                  vid,
                                                  !variation.visible,
                                                )
                                              }}
                                            >
                                              {variation.visible ? (
                                                <Eye />
                                              ) : (
                                                <EyeOff />
                                              )}
                                            </button>
                                            <button
                                              class={ui.deleteVariationButton}
                                              onClick={() => {
                                                executeCommand(
                                                  'flame.deleteVariation',
                                                  cmdContext,
                                                  tid,
                                                  vid,
                                                )
                                              }}
                                            >
                                              <Cross />
                                            </button>
                                          </div>
                                          <Show
                                            when={
                                              isAnyParametricVariationType(
                                                variation.type,
                                              ) && variation
                                            }
                                            keyed
                                          >
                                            {(variation) => (
                                              <div
                                                data-focus-id={variationParamsFocusId(
                                                  tid,
                                                  vid,
                                                )}
                                                classList={{
                                                  [ui.transformGridRow as string]: true,
                                                  [ui.variationParamsRow as string]: true,
                                                  [ui.parameterTarget as string]: true,
                                                }}
                                                onClick={() => {
                                                  setTargetedParameter(
                                                    `${tid}.${vid}`,
                                                  )
                                                }}
                                              >
                                                <Dynamic
                                                  {...getParamsEditor(
                                                    variation,
                                                  )}
                                                  dataParameterPath={`${tid}.${vid}`}
                                                  setValue={(value) => {
                                                    executeCommand(
                                                      'flame.setVariation',
                                                      cmdContext,
                                                      tid,
                                                      vid,
                                                      {
                                                        ...deepClone(variation),
                                                        params: value,
                                                      },
                                                      'params',
                                                    )
                                                  }}
                                                  setParamValue={(
                                                    paramName,
                                                    value,
                                                  ) => {
                                                    executeCommand(
                                                      'flame.setVariationParams',
                                                      cmdContext,
                                                      tid,
                                                      vid,
                                                      paramName,
                                                      value,
                                                    )
                                                  }}
                                                />
                                              </div>
                                            )}
                                          </Show>
                                        </>
                                      )}
                                    </For>

                                    <button
                                      class={ui.addTransformVariationButton}
                                      onClick={() => {
                                        executeCommand(
                                          'flame.addVariation',
                                          cmdContext,
                                          tid,
                                        )
                                      }}
                                    >
                                      <Plus />
                                      Add variation
                                    </button>
                                  </div>
                                </CollapsibleCard>
                              )}
                            </For>
                            <Show
                              when={recordEntries(
                                flameDescriptor.transforms,
                              ).some(([tid]) => tid.startsWith('_sym__'))}
                            >
                              <CollapsibleCard
                                title={`Symmetry (${recordEntries(flameDescriptor.transforms).filter(([tid]) => tid.startsWith('_sym__')).length})`}
                                data-tour-target="symmetry-card"
                                open={symmetryCardOpen()}
                                onToggleOpen={() =>
                                  setSymmetryCardOpen((open) => !open)
                                }
                              >
                                <div class={ui.symPanel}>
                                  <div class={ui.symControls}>
                                    <span class={ui.symControlsLabel}>
                                      Type
                                    </span>
                                    <select
                                      class={ui.select}
                                      data-tour-target="symmetry-type"
                                      value={currentSymType()}
                                      onChange={(e) => {
                                        applySymmetry(
                                          currentSymFolds(),
                                          e.currentTarget.value as
                                            | 'rotational'
                                            | 'dihedral',
                                          'type',
                                        )
                                      }}
                                    >
                                      <option value="rotational">
                                        Rotational
                                      </option>
                                      <option value="dihedral">Dihedral</option>
                                    </select>
                                    <span class={ui.symControlsLabel}>
                                      Folds
                                    </span>
                                    <ScrubInput
                                      label=""
                                      data-tour-target="symmetry-folds"
                                      value={currentSymFolds()}
                                      step={1}
                                      onInput={(val: number) => {
                                        const newN = Math.max(
                                          2,
                                          Math.round(val),
                                        )
                                        if (newN !== currentSymFolds()) {
                                          applySymmetry(
                                            newN,
                                            currentSymType(),
                                            'folds',
                                          )
                                        }
                                      }}
                                    />
                                  </div>

                                  <div class={ui.symGallery}>
                                    <For each={symTransformIds()}>
                                      {(tid) => {
                                        const transform = () =>
                                          flameDescriptor.transforms[tid]!
                                        const preAffine = () =>
                                          transform().preAffine
                                        const isReflection = () => {
                                          const a = preAffine()
                                          return (
                                            a.a === -1 &&
                                            a.d === 0 &&
                                            a.b === 0 &&
                                            a.e === 1
                                          )
                                        }
                                        const angle = () => {
                                          const a = preAffine()
                                          let v = Math.atan2(a.d, a.a)
                                          if (v < 0) v += 2 * Math.PI
                                          return v
                                        }
                                        return (
                                          <div
                                            class={ui.symItem}
                                            classList={{
                                              [ui.symItemHidden as string]:
                                                !transform().visible,
                                            }}
                                          >
                                            <span
                                              class={ui.symBadge}
                                              classList={{
                                                [ui.symBadgeReflection as string]:
                                                  isReflection(),
                                              }}
                                            >
                                              {
                                                readableIds().transformLabel[
                                                  tid
                                                ]
                                              }
                                            </span>
                                            <div
                                              class={ui.symAngle}
                                              data-focus-id={affineFocusId(tid)}
                                            >
                                              <Show
                                                when={!isReflection()}
                                                fallback={
                                                  <span
                                                    style={{
                                                      'font-size': '0.65rem',
                                                      color:
                                                        'var(--neutral-500)',
                                                      'white-space': 'nowrap',
                                                    }}
                                                  >
                                                    Reflection
                                                  </span>
                                                }
                                              >
                                                <AngleEditor
                                                  mode="inline"
                                                  value={angle()}
                                                  dataParameterPath={`transform.${tid}.preAffine.a`}
                                                  keyframePaths={[
                                                    `transform.${tid}.preAffine.a`,
                                                    `transform.${tid}.preAffine.b`,
                                                    `transform.${tid}.preAffine.d`,
                                                    `transform.${tid}.preAffine.e`,
                                                  ]}
                                                  setValue={(newAngle) => {
                                                    const cos =
                                                      Math.cos(newAngle)
                                                    const sin =
                                                      Math.sin(newAngle)
                                                    executeCommand(
                                                      'flame.setTransformAffine',
                                                      cmdContext,
                                                      tid,
                                                      'pre',
                                                      {
                                                        a: cos,
                                                        b: -sin,
                                                        c: 0,
                                                        d: sin,
                                                        e: cos,
                                                        f: 0,
                                                      },
                                                    )
                                                  }}
                                                />
                                              </Show>
                                            </div>
                                            <div class={ui.symActions}>
                                              <button
                                                class={ui.symActionBtn}
                                                data-focus-id={transformVisibilityFocusId(
                                                  tid,
                                                )}
                                                title={
                                                  transform().visible
                                                    ? 'Hide'
                                                    : 'Show'
                                                }
                                                onClick={() => {
                                                  executeCommand(
                                                    'flame.setTransformVisible',
                                                    cmdContext,
                                                    tid,
                                                    !transform().visible,
                                                  )
                                                }}
                                              >
                                                {transform().visible ? (
                                                  <Eye />
                                                ) : (
                                                  <EyeOff />
                                                )}
                                              </button>
                                              <button
                                                class={ui.symActionBtn}
                                                title="Remove"
                                                onClick={() => {
                                                  executeCommand(
                                                    'flame.removeTransform',
                                                    cmdContext,
                                                    tid,
                                                  )
                                                }}
                                              >
                                                <Cross />
                                              </button>
                                            </div>
                                          </div>
                                        )
                                      }}
                                    </For>
                                  </div>
                                </div>
                              </CollapsibleCard>
                            </Show>
                            <Card class={ui.buttonCard}>
                              <button
                                class={ui.addFlameButton}
                                onClick={() => {
                                  executeCommand(
                                    'flame.addTransform',
                                    cmdContext,
                                  )
                                }}
                              >
                                New transform
                              </button>
                              <button
                                class={ui.addFlameButton}
                                data-tour-target="add-symmetry"
                                disabled={symTransforms().length > 0}
                                title={
                                  symTransforms().length > 0
                                    ? 'Symmetry already applied'
                                    : 'Add 3-fold rotational symmetry'
                                }
                                onClick={() => {
                                  applySymmetry(3, 'rotational', 'add')
                                }}
                              >
                                Add symmetry
                              </button>
                              <button
                                class={ui.addFlameButton}
                                onClick={() => {
                                  void showMigrationModal(
                                    structuredClone(
                                      JSON.parse(
                                        JSON.stringify(flameDescriptor),
                                      ),
                                    ),
                                  )
                                }}
                              >
                                Migration
                              </button>
                            </Card>
                            <CollapsibleCard
                              title="Render"
                              open={renderCardOpen()}
                              onToggleOpen={() => {
                                setRenderCardOpen((open) => !open)
                              }}
                            >
                              <Card>
                                {/* -- Tone Mapping -- */}
                                <div class={ui.settingsGroup}>
                                  <span class={ui.settingsGroupLabel}>
                                    Tone Mapping
                                  </span>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('skipIters')
                                    }}
                                  >
                                    <Slider
                                      label="Skip Iterations"
                                      value={
                                        flameDescriptor.renderSettings.skipIters
                                      }
                                      min={0}
                                      max={30}
                                      step={1}
                                      onInput={(newSkipIters) => {
                                        setRenderSetting(
                                          'skipIters',
                                          newSkipIters,
                                        )
                                      }}
                                      formatValue={(value) => value.toString()}
                                      dataParameterPath="skipIters"
                                      data-tour-target="skipIters-slider"
                                    />
                                  </div>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('plotsPerChain')
                                    }}
                                  >
                                    <Slider
                                      label="Point Batch"
                                      data-tour-target="pointBatch-slider"
                                      value={
                                        flameDescriptor.renderSettings
                                          .plotsPerChain
                                      }
                                      min={1}
                                      max={32}
                                      step={1}
                                      onInput={(plotsPerChain) => {
                                        setRenderSetting(
                                          'plotsPerChain',
                                          plotsPerChain,
                                        )
                                      }}
                                      formatValue={(value) => value.toString()}
                                      dataParameterPath="plotsPerChain"
                                    />
                                  </div>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('exposure')
                                    }}
                                  >
                                    <Slider
                                      label="Exposure"
                                      value={
                                        flameDescriptor.renderSettings.exposure
                                      }
                                      min={-8}
                                      max={8}
                                      step={0.001}
                                      onInput={(newExp) => {
                                        {
                                          // With auto-exposure on, a manual
                                          // change re-bases it: this value
                                          // becomes the baseline at the
                                          // current zoom. Computed here so
                                          // the whole re-base records as one
                                          // merge.
                                          const rs =
                                            flameDescriptor.renderSettings
                                          const rebasing =
                                            rs.autoExposure3D &&
                                            (rs.dimensions ?? 2) === 3
                                          setRenderSettings(
                                            rebasing
                                              ? {
                                                  exposure: newExp,
                                                  autoExposure3DBase: newExp,
                                                  autoExposure3DRefRadius:
                                                    rs.camera3D?.radius ?? 5,
                                                }
                                              : { exposure: newExp },
                                          )
                                        }
                                      }}
                                      formatValue={(value) => value.toFixed(2)}
                                      dataParameterPath="exposure"
                                      data-tour-target="exposure-slider"
                                    />
                                  </div>
                                  <Show
                                    when={
                                      flameDescriptor.renderSettings
                                        .dimensions === 3
                                    }
                                  >
                                    <label
                                      data-parameter-path="autoExposure3D"
                                      style={{
                                        // Span both grid columns so the checkbox row
                                        // doesn't consume a value-column cell and
                                        // shift the slider rows out of alignment.
                                        'grid-column': '1 / -1',
                                        display: 'flex',
                                        'align-items': 'center',
                                        gap: '6px',
                                        'font-size': '12px',
                                        cursor: 'pointer',
                                        padding: '2px 4px',
                                      }}
                                    >
                                      <Checkbox
                                        checked={
                                          flameDescriptor.renderSettings
                                            .autoExposure3D
                                        }
                                        onChange={(checked) => {
                                          {
                                            const rs =
                                              flameDescriptor.renderSettings
                                            setRenderSettings(
                                              checked
                                                ? {
                                                    autoExposure3D: true,
                                                    autoExposure3DRefRadius:
                                                      rs.camera3D?.radius ?? 5,
                                                    autoExposure3DBase:
                                                      rs.exposure,
                                                  }
                                                : { autoExposure3D: false },
                                            )
                                          }
                                        }}
                                      />
                                      <span>Auto exposure on zoom</span>
                                    </label>
                                    <Show
                                      when={
                                        flameDescriptor.renderSettings
                                          .autoExposure3D
                                      }
                                    >
                                      <div class={ui.parameterTarget}>
                                        <Slider
                                          label="Auto Strength"
                                          value={
                                            flameDescriptor.renderSettings
                                              .autoExposure3DStrength
                                          }
                                          min={0}
                                          max={3}
                                          step={0.05}
                                          onInput={(strength) => {
                                            setRenderSetting(
                                              'autoExposure3DStrength',
                                              strength,
                                            )
                                          }}
                                          formatValue={(value) =>
                                            value.toFixed(2)
                                          }
                                        />
                                      </div>
                                    </Show>
                                  </Show>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('gamma')
                                    }}
                                  >
                                    <Slider
                                      label="Gamma"
                                      value={
                                        flameDescriptor.renderSettings.gamma
                                      }
                                      min={0.1}
                                      max={8}
                                      step={0.01}
                                      onInput={(newVal) => {
                                        setRenderSetting('gamma', newVal)
                                      }}
                                      formatValue={(value) => value.toFixed(2)}
                                      dataParameterPath="gamma"
                                      data-tour-target="gamma-slider"
                                    />
                                  </div>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('contrast')
                                    }}
                                  >
                                    <Slider
                                      label="Contrast"
                                      value={
                                        flameDescriptor.renderSettings.contrast
                                      }
                                      min={0.01}
                                      max={20}
                                      step={0.01}
                                      onInput={(newVal) => {
                                        setRenderSetting('contrast', newVal)
                                      }}
                                      formatValue={(value) => value.toFixed(2)}
                                      dataParameterPath="contrast"
                                      data-tour-target="contrast-slider"
                                    />
                                  </div>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('vibrancy')
                                    }}
                                  >
                                    <Slider
                                      label="Vibrancy"
                                      value={
                                        flameDescriptor.renderSettings.vibrancy
                                      }
                                      min={0}
                                      max={3}
                                      step={0.05}
                                      onInput={(newVibrancy) => {
                                        setRenderSetting(
                                          'vibrancy',
                                          newVibrancy,
                                        )
                                      }}
                                      formatValue={(value) => value.toFixed(2)}
                                      dataParameterPath="vibrancy"
                                      data-tour-target="vibrancy-slider"
                                    />
                                  </div>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('highlightPower')
                                    }}
                                  >
                                    <Slider
                                      label="Highlight Power"
                                      value={
                                        flameDescriptor.renderSettings
                                          .highlightPower
                                      }
                                      min={0}
                                      max={2}
                                      step={0.01}
                                      onInput={(newVal) => {
                                        setRenderSetting(
                                          'highlightPower',
                                          newVal,
                                        )
                                      }}
                                      formatValue={(value) => value.toFixed(2)}
                                      dataParameterPath="highlightPower"
                                      data-tour-target="highlightPower-slider"
                                    />
                                  </div>
                                  <Show
                                    when={
                                      (flameDescriptor.renderSettings
                                        .dimensions ?? 2) === 3
                                    }
                                  >
                                    <div
                                      class={ui.parameterTarget}
                                      onClick={() => {
                                        setTargetedParameter('depthColorPower')
                                      }}
                                    >
                                      <Slider
                                        label="Depth Coloring"
                                        value={
                                          flameDescriptor.renderSettings
                                            .depthColorPower ?? 0.0
                                        }
                                        min={0}
                                        max={5}
                                        step={0.05}
                                        onInput={(newVal) => {
                                          setRenderSetting(
                                            'depthColorPower',
                                            newVal,
                                          )
                                        }}
                                        formatValue={(value) =>
                                          value.toFixed(2)
                                        }
                                        dataParameterPath="depthColorPower"
                                        data-tour-target="depthColorPower-slider"
                                      />
                                    </div>
                                    <div
                                      class={ui.parameterTarget}
                                      onClick={() => {
                                        setTargetedParameter('lightPower')
                                      }}
                                    >
                                      <Slider
                                        label="Light Power"
                                        value={
                                          flameDescriptor.renderSettings
                                            .lightPower ?? 0.0
                                        }
                                        min={0}
                                        max={1.5}
                                        step={0.01}
                                        onInput={(newVal) => {
                                          setRenderSetting('lightPower', newVal)
                                        }}
                                        formatValue={(value) =>
                                          value.toFixed(2)
                                        }
                                        dataParameterPath="lightPower"
                                        data-tour-target="lightPower-slider"
                                      />
                                    </div>
                                  </Show>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter(
                                        'densityEstimationQuality',
                                      )
                                    }}
                                  >
                                    <Slider
                                      label="Filter Quality"
                                      value={
                                        flameDescriptor.renderSettings
                                          .densityEstimationQuality ?? 0.8
                                      }
                                      min={0}
                                      max={1}
                                      step={0.01}
                                      onInput={(newVal) => {
                                        setRenderSetting(
                                          'densityEstimationQuality',
                                          newVal,
                                        )
                                      }}
                                      formatValue={(value) => value.toFixed(2)}
                                      dataParameterPath="densityEstimationQuality"
                                      data-tour-target="filterQuality-slider"
                                    />
                                  </div>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('estimatorCurve')
                                    }}
                                  >
                                    <Slider
                                      label="Estimator Curve"
                                      value={
                                        flameDescriptor.renderSettings
                                          .estimatorCurve ?? 0.5
                                      }
                                      min={0.1}
                                      max={1}
                                      step={0.05}
                                      onInput={(newVal) => {
                                        setRenderSetting(
                                          'estimatorCurve',
                                          newVal,
                                        )
                                      }}
                                      formatValue={(value) => value.toFixed(2)}
                                      dataParameterPath="estimatorCurve"
                                      data-tour-target="estimatorCurve-slider"
                                      disabled={stochasticFilterEnabled()}
                                      disabledReason="The estimator curve only affects the density-estimation pass, which is bypassed while the Mitchell-Netravali (MN) filter is active. Turn off MN to use it."
                                    />
                                  </div>
                                </div>

                                {/* -- Modes -- */}
                                <div class={ui.settingsGroup}>
                                  <span class={ui.settingsGroupLabel}>
                                    Modes
                                  </span>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('drawMode')
                                    }}
                                  >
                                    <label
                                      class={ui.labeledInput}
                                      data-tour-target="drawMode-select"
                                    >
                                      <span>
                                        <KeyframeDiamond parameterPath="drawMode" />
                                        Draw Mode
                                      </span>
                                      <select
                                        class={ui.select}
                                        value={
                                          flameDescriptor.renderSettings
                                            .drawMode
                                        }
                                        onChange={(ev) => {
                                          const mode = ev.currentTarget.value
                                          const update = () => {
                                            setRenderSetting('drawMode', mode)
                                          }
                                          if (
                                            'startViewTransition' in document
                                          ) {
                                            document.startViewTransition(update)
                                          } else {
                                            update()
                                          }
                                        }}
                                      >
                                        <For
                                          each={recordKeys(drawModeToImplFn)}
                                        >
                                          {(drawMode) => (
                                            <option value={drawMode}>
                                              {drawMode}
                                            </option>
                                          )}
                                        </For>
                                      </select>
                                      <span></span>
                                    </label>
                                  </div>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('colorInitMode')
                                    }}
                                  >
                                    <label
                                      class={ui.labeledInput}
                                      data-tour-target="colorInitMode-select"
                                    >
                                      <span>
                                        <KeyframeDiamond parameterPath="colorInitMode" />
                                        Color Init Mode
                                      </span>
                                      <select
                                        class={ui.select}
                                        value={
                                          flameDescriptor.renderSettings
                                            .colorInitMode
                                        }
                                        onChange={(ev) => {
                                          const mode = ev.currentTarget.value
                                          const update = () => {
                                            setRenderSetting(
                                              'colorInitMode',
                                              mode,
                                            )
                                          }
                                          if (
                                            'startViewTransition' in document
                                          ) {
                                            document.startViewTransition(update)
                                          } else {
                                            update()
                                          }
                                        }}
                                      >
                                        <For
                                          each={recordKeys(
                                            colorInitModeToImplFn,
                                          )}
                                        >
                                          {(colorInitMode) => (
                                            <option value={colorInitMode}>
                                              {colorInitMode}
                                            </option>
                                          )}
                                        </For>
                                      </select>
                                      <span></span>
                                    </label>
                                  </div>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('pointInitMode')
                                    }}
                                  >
                                    <label
                                      class={ui.labeledInput}
                                      data-tour-target="pointInitMode-select"
                                    >
                                      <span>
                                        <KeyframeDiamond parameterPath="pointInitMode" />
                                        Point Init
                                      </span>
                                      <select
                                        class={ui.select}
                                        value={
                                          flameDescriptor.renderSettings
                                            .pointInitMode
                                        }
                                        onChange={(ev) => {
                                          const mode = ev.currentTarget.value
                                          const update = () => {
                                            setRenderSetting(
                                              'pointInitMode',
                                              mode,
                                            )
                                          }
                                          if (
                                            'startViewTransition' in document
                                          ) {
                                            document.startViewTransition(update)
                                          } else {
                                            update()
                                          }
                                        }}
                                      >
                                        <For
                                          each={recordKeys(
                                            (flameDescriptor.renderSettings
                                              .dimensions ?? 2) === 3
                                              ? pointInitMode3DToImplFn
                                              : pointInitModeToImplFn,
                                          )}
                                        >
                                          {(pointInitMode) => (
                                            <option value={pointInitMode}>
                                              {pointInitMode}
                                            </option>
                                          )}
                                        </For>
                                      </select>
                                      <span></span>
                                    </label>
                                  </div>
                                  <div
                                    class={ui.parameterTarget}
                                    onClick={() => {
                                      setTargetedParameter('backgroundColor')
                                    }}
                                  >
                                    <label
                                      class={ui.labeledInput}
                                      data-tour-target="backgroundColor-picker"
                                    >
                                      <span>
                                        <KeyframeDiamond parameterPath="backgroundColor" />
                                        Background Color
                                      </span>
                                      <ColorPicker
                                        value={
                                          flameDescriptor.renderSettings
                                            .backgroundColor
                                            ? vec3f(
                                                ...flameDescriptor
                                                  .renderSettings
                                                  .backgroundColor,
                                              )
                                            : undefined
                                        }
                                        setValue={(newBgColor) => {
                                          setRenderSetting(
                                            'backgroundColor',
                                            newBgColor,
                                          )
                                        }}
                                      />
                                    </label>
                                  </div>
                                  <Show
                                    when={
                                      flameDescriptor.renderSettings
                                        .backgroundColor !== undefined
                                    }
                                    fallback={<span class={ui.noSelect} />}
                                  >
                                    <Button
                                      onClick={() => {
                                        setRenderSetting(
                                          'backgroundColor',
                                          null,
                                        )
                                      }}
                                    >
                                      Auto
                                    </Button>
                                  </Show>
                                </div>

                                {/* -- Palette -- */}
                                <div
                                  style={{ 'grid-column': '1 / -1' }}
                                  title={
                                    selectedPaletteId() === ''
                                      ? 'Select a palette in the gallery to enable these options'
                                      : undefined
                                  }
                                >
                                  <div
                                    class={ui.settingsGroup}
                                    style={{
                                      opacity:
                                        selectedPaletteId() !== '' ? 1 : 0.4,
                                      'pointer-events':
                                        selectedPaletteId() !== ''
                                          ? 'auto'
                                          : 'none',
                                    }}
                                  >
                                    <span class={ui.settingsGroupLabel}>
                                      Palette
                                    </span>
                                    <div
                                      class={ui.parameterTarget}
                                      onClick={() => {
                                        setTargetedParameter('paletteSpeed')
                                      }}
                                    >
                                      <Slider
                                        label="Palette Speed"
                                        value={
                                          flameDescriptor.renderSettings
                                            .paletteSpeed
                                        }
                                        min={0}
                                        max={10}
                                        step={0.1}
                                        onInput={(newVal) => {
                                          setRenderSetting(
                                            'paletteSpeed',
                                            newVal,
                                          )
                                        }}
                                        formatValue={(value) =>
                                          value.toFixed(1)
                                        }
                                        dataParameterPath="paletteSpeed"
                                        data-tour-target="paletteSpeed-slider"
                                      />
                                    </div>
                                    <div
                                      class={ui.parameterTarget}
                                      onClick={() => {
                                        setTargetedParameter('paletteMode')
                                      }}
                                    >
                                      <label
                                        class={ui.labeledInput}
                                        data-tour-target="paletteMode-select"
                                      >
                                        <span>Palette Mode</span>
                                        <select
                                          class={ui.select}
                                          value={
                                            flameDescriptor.renderSettings
                                              .paletteMode ?? 0
                                          }
                                          onChange={(ev) => {
                                            const mode = parseInt(
                                              ev.currentTarget.value,
                                            ) as 0 | 1
                                            setRenderSetting(
                                              'paletteMode',
                                              mode,
                                            )
                                          }}
                                        >
                                          <option value={0}>
                                            Density Shift
                                          </option>
                                          <option value={1}>
                                            Hue Rotation (flam3)
                                          </option>
                                        </select>
                                        <span></span>
                                      </label>
                                    </div>
                                    <div
                                      class={ui.parameterTarget}
                                      onClick={() => {
                                        setTargetedParameter('palettePhase')
                                      }}
                                    >
                                      <Slider
                                        label="Palette Phase"
                                        value={
                                          flameDescriptor.renderSettings
                                            .palettePhase
                                        }
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        onInput={(newVal) => {
                                          setRenderSetting(
                                            'palettePhase',
                                            newVal,
                                          )
                                        }}
                                        formatValue={(value) =>
                                          value.toFixed(2)
                                        }
                                        dataParameterPath="palettePhase"
                                        data-tour-target="palettePhase-slider"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </Card>
                            </CollapsibleCard>
                            <CollapsibleCard
                              title="Metadata"
                              open={metadataCardOpen()}
                              onToggleOpen={() => {
                                setMetadataCardOpen((open) => !open)
                              }}
                              data-tour-target="metadata-card"
                            >
                              <Card>
                                <div
                                  style={{
                                    display: 'flex',
                                    'flex-direction': 'column',
                                    gap: '0.5rem',
                                    width: '100%',
                                    'grid-column': '1 / -1',
                                  }}
                                >
                                  <div>
                                    <label class={ui.metadataLabel}>Name</label>
                                    <input
                                      class={ui.metadataInput}
                                      data-parameter-path="metadata.name"
                                      type="text"
                                      placeholder="Flame Name"
                                      value={
                                        flameDescriptor.metadata?.name ?? ''
                                      }
                                      onInput={(e) => {
                                        executeCommand(
                                          'flame.setMetadata',
                                          cmdContext,
                                          'name',
                                          e.currentTarget.value,
                                        )
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <label class={ui.metadataLabel}>
                                      Description
                                    </label>
                                    <textarea
                                      class={ui.metadataTextarea}
                                      data-parameter-path="metadata.description"
                                      placeholder="Description"
                                      value={
                                        flameDescriptor.metadata?.description ??
                                        ''
                                      }
                                      onInput={(e) => {
                                        executeCommand(
                                          'flame.setMetadata',
                                          cmdContext,
                                          'description',
                                          e.currentTarget.value,
                                        )
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <label class={ui.metadataLabel}>
                                      Author
                                    </label>
                                    <input
                                      class={ui.metadataInput}
                                      data-parameter-path="metadata.author"
                                      type="text"
                                      placeholder="Author"
                                      value={
                                        flameDescriptor.metadata?.author ?? ''
                                      }
                                      onInput={(e) => {
                                        executeCommand(
                                          'flame.setMetadata',
                                          cmdContext,
                                          'author',
                                          e.currentTarget.value,
                                        )
                                      }}
                                    />
                                  </div>
                                </div>
                              </Card>
                            </CollapsibleCard>
                          </Show>
                        </>
                      }
                    >
                      <Show
                        when={showBlendGallery()}
                        fallback={
                          <Show
                            when={showAudioPanel()}
                            fallback={
                              <SonificationPanel
                                onClose={closeSonificationPanelAsAuthoredAction}
                                enabled={sonificationEnabled}
                                onEnabledChange={(enabled) => {
                                  executeCommand(
                                    'sonification.setEnabled',
                                    cmdContext,
                                    enabled,
                                  )
                                }}
                                config={sonificationConfig}
                                onConfigChange={(config, key) => {
                                  executeCommand(
                                    'sonification.setConfig',
                                    cmdContext,
                                    config,
                                    key,
                                  )
                                }}
                                onConfigGestureBoundary={
                                  breakRecordingCoalescing
                                }
                                keepPlayingWhenClosed={
                                  keepAudioPlayingWhenClosed
                                }
                                onKeepPlayingChange={
                                  setKeepPlayingWhenClosedAsAuthoredAction
                                }
                              />
                            }
                          >
                            <AudioReactivePanel
                              onClose={() => setShowAudioPanel(false)}
                              audioBuffer={audioBuffer}
                              onAudioChange={(buf, fileName) => {
                                // File resource signals change before the
                                // synthetic audio snapshot command is emitted.
                                // Take a timed replay over first so its undo
                                // side-state cannot absorb the user's file.
                                history.takeOverOwnedPreview()
                                setAudioBuffer(buf)
                                setAudioTrackName(fileName)
                                setFileAnalyzer(undefined)
                                setAnalysisProgress(null)
                                if (!buf) {
                                  setAudioEnabled(false)
                                } else {
                                  // Report from 0 immediately: the panel has to
                                  // say "analyzing" before the first frame is
                                  // done, or it looks idle for the whole
                                  // scheduling gap on a long file.
                                  setAnalysisProgress(0)
                                  setTimeout(async () => {
                                    // `onProgress` fires once PER FRAME —
                                    // ~32k times for 18 minutes at 30fps. Only
                                    // publish whole percents, or the signal
                                    // write costs more than the analysis.
                                    let lastPercent = -1
                                    const analyzer = await createAudioAnalyzer(
                                      buf,
                                      30,
                                      (current, total) => {
                                        if (total <= 0) return
                                        const percent = Math.floor(
                                          (current / total) * 100,
                                        )
                                        if (percent === lastPercent) return
                                        lastPercent = percent
                                        setAnalysisProgress(percent / 100)
                                      },
                                    )
                                    setFileAnalyzer(analyzer)
                                    setAnalysisProgress(null)
                                  }, 30)
                                }
                                setPlaybackPaused(false)
                                setPlaybackTime(0)
                                setSeekTarget(null)
                                // The file bytes stay local, but the recorder
                                // needs the resulting wiring + resource name
                                // to prevent replay from enabling a different
                                // track that happens to be loaded later.
                                executeCommand(
                                  'audio.applySnapshot',
                                  cmdContext,
                                )
                              }}
                              audioMapping={audioMapping}
                              // Through the registry, so wiring audio to the
                              // flame is a recorded, replayable step rather
                              // than an edit the log never saw.
                              onMappingChange={(mapping) => {
                                executeCommand(
                                  'audio.setMapping',
                                  cmdContext,
                                  mapping,
                                )
                              }}
                              onMappingGestureBoundary={
                                breakRecordingCoalescing
                              }
                              audioEnabled={audioEnabled}
                              onEnabledChange={(enabled) => {
                                executeCommand(
                                  'audio.setEnabled',
                                  cmdContext,
                                  enabled,
                                )
                              }}
                              audioSource={audioSource}
                              onSourceChange={(source) => {
                                executeCommand(
                                  'audio.setSource',
                                  cmdContext,
                                  source,
                                )
                              }}
                              liveAnalyzer={liveAnalyzer}
                              onLiveAnalyzerChange={(analyzer) => {
                                // Microphone permission resolves
                                // asynchronously and publishes the raw
                                // resource before its source command. Keep
                                // that late write out of replay side state.
                                history.takeOverOwnedPreview()
                                setLiveAnalyzer(analyzer)
                              }}
                              playbackPaused={playbackPaused}
                              onPausedChange={(paused) => {
                                history.takeOverOwnedPreview()
                                setPlaybackPaused(paused)
                              }}
                              playbackTime={playbackTime}
                              onSeek={(seconds) => {
                                history.takeOverOwnedPreview()
                                setSeekTarget(seconds)
                              }}
                              fileAnalyzer={fileAnalyzer}
                              analysisProgress={analysisProgress}
                              flameName={flameDescriptor.metadata?.name}
                              keepPlayingWhenClosed={keepAudioPlayingWhenClosed}
                              onKeepPlayingChange={
                                setKeepPlayingWhenClosedAsAuthoredAction
                              }
                              transforms={transformInfos()}
                            />
                          </Show>
                        }
                      >
                        <BlendFlameGallery
                          dimensions={
                            /* Breed and evolve cross transforms, which works in
                               3D — offer same-dimension partners so a 3D flame
                               has someone to pair with. Morph interpolates via
                               the BLEND pipeline, which has no 3D path at all
                               (ifsPipeline3D.update takes one flame), so it
                               stays 2D-only as before. */
                            blendIntent() === 'breed' ||
                            blendIntent() === 'evolve' ||
                            blendIntent() === 'diff'
                              ? (flameDescriptor.renderSettings.dimensions ?? 2)
                              : 2
                          }
                          heading={
                            blendIntent() === 'morph'
                              ? 'Pick End Flame'
                              : blendIntent() === 'breed' ||
                                  blendIntent() === 'evolve'
                                ? 'Pick Second Parent'
                                : blendIntent() === 'diff'
                                  ? 'Pick Flame to Compare'
                                  : 'Pick Blend Flame'
                          }
                          onSelect={(flame) => {
                            prevBlendFlame = undefined
                            if (blendIntent() === 'morph') {
                              setupMorph(flame)
                            } else if (blendIntent() === 'breed') {
                              /* The hover preview REPLACED the workspace flame
                                 with a child. Take the child first, then put
                                 the real flame back — otherwise parentA below
                                 would be the preview, and the gallery would
                                 breed a child with its own parent. */
                              const seed = breedPreviewChild()
                              endBreedPreview()
                              void _requestModal({
                                content: ({ respond }) => (
                                  <BreedGallery
                                    parentA={flameDescriptor}
                                    parentB={deepClone(flame)}
                                    seedChild={seed}
                                    parentInfo={{
                                      nameA:
                                        flameDescriptor.metadata?.name ||
                                        'Current',
                                      nameB: flame.metadata?.name || 'Selected',
                                    }}
                                    hardwareTier={props.hardwareTier}
                                    onApply={(child) => {
                                      if (blendFlame())
                                        showToast(
                                          'Blend is still active — the loaded flame will look mixed',
                                          4000,
                                        )
                                      executeFlameLoad(
                                        child,
                                        'Load Bred Flame',
                                        snapshotOrigin('flame.breed'),
                                      )
                                    }}
                                    onChangeParent={() => {
                                      respond()
                                      pickBreedFlame()
                                    }}
                                    onCompare={openDiffAsModal}
                                    respond={respond}
                                  />
                                ),
                              })
                            } else if (blendIntent() === 'evolve') {
                              void _requestModal({
                                content: ({ respond }) => (
                                  <EvolutionChamber
                                    parentA={flameDescriptor}
                                    parentB={deepClone(flame)}
                                    parentInfo={{
                                      nameA:
                                        flameDescriptor.metadata?.name ||
                                        'Current',
                                      nameB: flame.metadata?.name || 'Selected',
                                    }}
                                    hardwareTier={props.hardwareTier}
                                    onApply={(child) => {
                                      if (blendFlame())
                                        showToast(
                                          'Blend is still active — the loaded flame will look mixed',
                                          4000,
                                        )
                                      executeFlameLoad(
                                        child,
                                        'Load Evolved Flame',
                                        snapshotOrigin('flame.evolve'),
                                      )
                                    }}
                                    onChangeParent={() => {
                                      respond()
                                      pickEvolveFlame()
                                    }}
                                    onCompare={openDiffAsModal}
                                    respond={respond}
                                  />
                                ),
                              })
                            } else if (blendIntent() === 'diff') {
                              openDiffView(flameDescriptor, flame)
                            } else {
                              setBlendFlame(deepClone(flame))
                            }
                            // Single close for every intent branch above.
                            setShowBlendGallery(false)
                          }}
                          onPreviewBlend={handlePreviewBlend}
                          onPreviewName={(name) => setHoveredBlendName(name)}
                          onClose={() => {
                            handlePreviewBlend(null)
                            setHoveredBlendName(null)
                            setShowBlendGallery(false)
                          }}
                        />
                      </Show>
                    </Show>
                  }
                >
                  {(dv) => (
                    <div class={diffUi.panel}>
                      <div class={diffUi.panelHeader}>
                        <button
                          class={diffUi.backBtn}
                          onClick={closeSidebarDiff}
                        >
                          ← Back to Editor
                        </button>
                      </div>
                      <div class={diffUi.panelScroll}>
                        <DiffViewContent
                          flameA={dv.flameA}
                          flameB={dv.flameB}
                        />
                      </div>
                    </div>
                  )}
                </Show>
              </div>
            </div>
          </Show>
          <FloatingActions
            disabled={animationExportRunning()}
            initialLeft={floatingLeft()}
            initialTop={floatingTop()}
            onNewFlame={() => {
              if (timeline.isPlaying()) timeline.pause()
              // Undo restores the flame, but keyframe tracks aren't part of
              // change history — flush unsaved work (flame + animation) to
              // Recents so a reset can't silently destroy anything. Unlike
              // saveRecentFlame, the upsert never declines on a full list.
              flushDirtyToRecents()
              const is3D =
                (flameDescriptor.renderSettings.dimensions ?? 2) === 3
              const flame = deepClone(is3D ? initExample3D : initExample)
              executeFlameLoad(flame, 'New Flame', snapshotOrigin('flame.new'))
              setLoadedAnimation({ flame, tracks: [] })
              showToast('Fresh flame loaded — undo restores the previous one')
            }}
            onLoadFlame={() => {
              if (timeline.isPlaying()) timeline.pause()
              // Loading replaces the flame and resets dirty tracking — flush
              // unsaved work first so it stays recoverable from Recents.
              flushDirtyToRecents()
              void showLoadFlameModal()
            }}
            onSaveForLater={async () => {
              const tracks = timeline.tracks()
              const success = saveRecentFlame(
                flameDescriptor,
                undefined,
                tracks,
                false,
              )
              if (!success) {
                const oldest = getOldestRecentFlame()
                const oldestName = oldest?.name || 'Flame'
                const confirmed = await _requestModal<boolean>({
                  content: ({ respond }) => (
                    <ConfirmOverwriteRecentModal
                      oldestName={oldestName}
                      respond={respond}
                    />
                  ),
                })
                if (confirmed) {
                  saveRecentFlame(flameDescriptor, undefined, tracks, true)
                  markSavedBaseline()
                  showToast(
                    tracks.length > 0
                      ? 'Flame + animation saved (replaced oldest)'
                      : 'Flame saved (replaced oldest)',
                  )
                }
              } else {
                markSavedBaseline()
                showToast(
                  tracks.length > 0
                    ? 'Flame + animation saved for later'
                    : 'Flame saved for later',
                )
              }
            }}
            onRender={() => {
              if (timeline.isPlaying()) timeline.pause()
              executeCommand('export.png', cmdContext)
            }}
            onQuickExport={quickExport}
            onShareLink={() => {
              if (timeline.isPlaying()) timeline.pause()

              void showShareLinkModal()
            }}
            onShareDiscord={shareToDiscord}
            onLogoFavicon={showLogoFaviconGenerator}
            onRandomizeColors={() => {
              executeCommand(
                'flame.setAllTransformColors',
                cmdContext,
                Object.fromEntries(
                  recordEntries(
                    randomizeAllColors(deepClone(flameDescriptor.transforms)),
                  ).map(([tid, t]) => [tid, { x: t.color.x, y: t.color.y }]),
                ),
              )
            }}
            hideDiceButtons={hideDiceButtons}
            setHideDiceButtons={setHideDiceButtons}
            animationEnabled={animationEnabled}
            setAnimationEnabled={(v) => {
              if (IS_DEV) console.info('[anim] floating toggle →', v)
              executeCommand('timeline.setAnimationEnabled', cmdContext, v)
            }}
            showTimeline={showTimeline}
            setShowTimeline={(v) => {
              executeCommand('view.setShowTimeline', cmdContext, v)
            }}
            adaptiveFilterEnabled={adaptiveFilterEnabled}
            setAdaptiveFilterEnabled={(v) => {
              executeCommand('view.setAdaptiveFilter', cmdContext, v)
            }}
            stochasticFilterEnabled={stochasticFilterEnabled}
            setStochasticFilterEnabled={(v) => {
              executeCommand('view.setStochasticFilter', cmdContext, v)
            }}
            isPlaying={() => timeline.isPlaying()}
            togglePlay={() => {
              if (!animationEnabled()) {
                executeCommand('timeline.setAnimationEnabled', cmdContext, true)
              }
              recorderTimeline.togglePlay()
            }}
            qualityPreset={qualityPreset}
            setQualityPreset={(key) => {
              if (IS_DEV) {
                console.info(
                  '[App] setQualityPreset (floating)',
                  `key=${key}`,
                  `current=${qualityPreset()}`,
                )
              }
              executeCommand('view.setQualityPreset', cmdContext, key)
            }}
            accumulatedPointCount={accumulatedPointCount}
            qualityPointCountLimit={qualityPointCountLimit()}
            collapsed={floatingActionsCollapsed}
            setCollapsed={setFloatingActionsCollapsed}
            dimensions={() => flameDescriptor.renderSettings.dimensions ?? 2}
            setDimensions={(v) => {
              const current = flameDescriptor.renderSettings.dimensions ?? 2
              if (v === current) return
              // The stash below is in-memory only — flush unsaved work to
              // Recents first so switch-then-close can't lose it.
              flushDirtyToRecents()
              // Stash the active flame AND its animation tracks under the
              // current dimension; restore the target dimension's own pair so
              // 2D and 3D each keep independent animations.
              if (current === 3) {
                stashedFlame3D = deepClone(flameDescriptor)
                stashedTracks3D = deepClone(timeline.tracks())
              } else {
                stashedFlame2D = deepClone(flameDescriptor)
                stashedTracks2D = deepClone(timeline.tracks())
              }
              // Fly mode only makes sense in 3D.
              if (v !== 3 && flyMode()) {
                executeCommand('view.setFlyMode', cmdContext, false)
              }
              const restored =
                v === 3
                  ? (stashedFlame3D ?? example34)
                  : (stashedFlame2D ?? initExample)
              const restoredTracks = v === 3 ? stashedTracks3D : stashedTracks2D
              // These document-boundary writes are represented by the two
              // synthetic actions below. Suppress their coverage hooks so the
              // recorder does not also flag the same, faithfully represented
              // switch as an unnamed write.
              withRecordingSuppressed(() => {
                withPaletteRestoreTransition({}, `Switch to ${v}D`, () => {
                  setFlameDescriptor(
                    () => deepClone(restored),
                    `Switch to ${v}D`,
                  )
                })
                // Swap the timeline to the target dimension's tracks (empty
                // on first entry — matches the starter flame).
                timeline.loadTracks(restoredTracks ?? [])
              })
              // The switch restores from an in-memory stash, so replaying it
              // as "switch to 3D" would land on the VIEWER's stash, not ours.
              // Log the descriptor and tracks it actually produced instead —
              // those replay exactly. The live path keeps one replacement-
              // style history entry, including its palette provenance.)
              const flameOrigin = snapshotOrigin('flame.dimension', `${v}D`)
              recordSyntheticAction(
                'flame.load',
                [deepClone(restored), `Switch to ${v}D`, {}, flameOrigin],
                snapshotOriginLabel(flameOrigin) ?? `Switch to ${v}D`,
              )
              const timelineOrigin = snapshotOrigin(
                'timeline.dimension',
                `${v}D`,
              )
              recordSyntheticAction(
                'timeline.loadTimeline',
                [
                  {
                    config: deepClone(timeline.config()),
                    tracks: deepClone(restoredTracks ?? []),
                  },
                  timelineOrigin,
                ],
                snapshotOriginLabel(timelineOrigin) ?? `Load ${v}D animation`,
              )
              // Mode switches restore stashed/starter state — not an edit.
              markLoadedBaseline()
            }}
            flyMode={flyMode}
            setFlyMode={(v) => {
              executeCommand('view.setFlyMode', cmdContext, v)
              if (v) {
                showToast(
                  'Fly mode: click to look around · WASD/arrows move · Space/C up/down · Q/E roll · Esc to release',
                )
              }
            }}
            sidebarOpen={showSidebar}
            onToggleSidebar={() => {
              // Same as the 'F' shortcut, so it works without a keyboard.
              if ('startViewTransition' in document) {
                document.startViewTransition(toggleSidebarAsAuthoredAction)
              } else {
                toggleSidebarAsAuthoredAction()
              }
            }}
          />
          <SpotlightTour tourContext={tourContext} />
          <SoftwareVersion
            showBenchmark={() => {
              void showBenchmark()
            }}
            showDocs={() => {
              void showDocumentation()
            }}
            showHelp={createShowHelp(
              quickPickerMode,
              setQuickPickerMode,
              sidebarLayoutMode,
              setSidebarLayoutMode,
              isCompact,
              setCompact,
              theme,
              setTheme,
              IS_DEV ? () => setDevCrashTest(true) : undefined,
              () => props.hardwareTier ?? null,
              props.onHardwareTierChange,
            )}
          />
          <Show when={devCrashTest()}>
            {(() => {
              throw new Error('[DEV] Injected crash from About panel')
            })()}
          </Show>

          <Show when={showArena()}>
            <ArenaOverlay
              arena={{
                open: showArena,
                setOpen: setShowArena,
                player1Stats: arenaP1Stats,
                setPlayer1Stats: setArenaP1Stats,
                player2Stats: arenaP2Stats,
                setPlayer2Stats: setArenaP2Stats,
                selectFighter: (player: 1 | 2) => {
                  const fighter = player === 1 ? arenaP1Stats() : arenaP2Stats()
                  if (fighter?.flame) {
                    setFlameDescriptor(
                      () => deepClone(fighter.flame!),
                      `Arena: ${fighter.name ?? `Player ${player}`}`,
                    )
                    showToast(
                      `Arena: Loaded ${fighter.name ?? `Player ${player}`} into editor.`,
                    )
                  }
                },
              }}
              hardwareTier={props.hardwareTier}
              onClose={() => {
                isArenaModalOpen = false
                setShowArena(false)
              }}
            />
          </Show>
        </Dropzone>
      </TimelineContextProvider>
    </ChangeHistoryContextProvider>
  )
}
