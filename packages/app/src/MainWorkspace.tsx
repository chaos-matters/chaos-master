import '@/commands/builtins'
import { batch, createEffect, createMemo, createSignal, lazy, onCleanup, onMount, Show, Suspense, untrack, } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { vec2f } from 'typegpu/data'
import { fetchBundledTrackBuffer } from '@/arcade/bundledTracks'
import { agentDriving } from '@/arcade/pilot'
import { executeCommand } from '@/commands/registry'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useToast } from '@/contexts/ToastContext'
import { setActiveTab, workspaceIsVisible } from '@/lib/activeTab'
import { createBackLayer } from '@/lib/backStack'
import { SHOWCASE_CONSENT_VERSION } from '@/lib/communityShowcase'
import { replaceOpenDocument } from '@/lib/documentLoad'
import { hapticsEnabled, setHapticsEnabled } from '@/lib/haptics'
import { trackAppInit } from '@/lib/telemetry'
import { createDragHandler } from '@/utils/createDragHandler'
import { recordEntries, recordKeys } from '@/utils/record'
import ui from './App.module.css'
import { duelShowing, duelSidebarOpen } from './arcade/duel'
import { CanvasViewport } from './components/CanvasViewport'
import { DebugOverlay } from './components/DebugOverlay'
import { Dropzone } from './components/Dropzone/Dropzone'
import { createExportPngDialog } from './components/ExportPngDialog/ExportPngDialog'
import { FloatingActions } from './components/FloatingActions/FloatingActions'
import { createLoadFlame } from './components/LoadFlameModal/LoadFlameModal'
import { useRequestModal } from './components/Modal/ModalContext'
import { qualityPresets } from './components/Quality/QualityPresets'
import { recorderExportPending, recorderTaskPending, setRecorderCollapsed, setRecorderVisible, } from './components/SessionRecorder/recorderUi'
import { goToDestination, shellDestination, } from './components/Shell/destinations'
import { NavRail } from './components/Shell/NavRail'
import { ShellBar } from './components/Shell/ShellBar'
import { AdvancedToolsDrawer, EditorRail, TabletInspectorDeck, TouchHUD, } from './components/TouchSurface'
import { WorkspaceBottomBar } from './components/WorkspaceBottomBar'
import { createLazyDiscordShareModal, createLazyImportVariationsModal, createLazyLogoFaviconGenerator, createLazyMigrationModal, createLazyShareLinkModal, createLazyShareVariationLinkModal, createLazyShareVariationLoadModal, createLazyShowBenchmark, createLazyShowCustomVariationEditor, createLazyShowDocumentation, createLazyShowHelp, WorkspaceModalsHost, } from './components/WorkspaceModalsHost'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { useWorkspaceAnimationGen, useWorkspaceArena, useWorkspaceArtDirector, useWorkspaceAutosave, useWorkspaceCamera, useWorkspaceCommands, useWorkspacePalette, useWorkspaceReplay, useWorkspaceShortcuts, useWorkspaceTimelineBinding, } from './hooks'
import { createWorkspaceExportStore, createWorkspaceLayoutStore, createWorkspaceSelectionStore, isWideLayout, } from './stores'
import { deckFits, isTouchDevice } from './stores/workspaceLayoutStore'
import type { MoreMenuHandlers } from './components/Shell/moreMenuItems'

const AncestryTreeModal = lazy(() =>
  import('./components/AncestryTreeModal/AncestryTreeModal').then((m) => ({
    default: m.AncestryTreeModal,
  })),
)
const DiffViewModal = lazy(() =>
  import('./components/DiffViewModal/DiffViewModal').then((m) => ({
    default: m.DiffViewModal,
  })),
)
const PopulationSimulator = lazy(() =>
  import('./components/PopulationSimulator/PopulationSimulator').then((m) => ({
    default: m.PopulationSimulator,
  })),
)
const ConfirmDeleteVariationModal = lazy(() =>
  import('./components/CustomVariationEditor/ConfirmDeleteVariationModal').then(
    (m) => ({
      default: m.ConfirmDeleteVariationModal,
    }),
  ),
)
const ConfirmOverwriteRecentModal = lazy(() =>
  import('./components/LoadFlameModal/ConfirmOverwriteRecentModal').then(
    (m) => ({
      default: m.ConfirmOverwriteRecentModal,
    }),
  ),
)
const ConfirmDiscardUnsavedModal = lazy(() =>
  import('./components/LoadFlameModal/ConfirmDiscardUnsavedModal').then(
    (m) => ({
      default: m.ConfirmDiscardUnsavedModal,
    }),
  ),
)
import { createVariationSelector } from './components/VariationSelector/VariationSelector'
import { ChangeHistoryContextProvider } from './contexts/ChangeHistoryContext'
import { useCompactMode } from './contexts/CompactModeContext'
import { useTheme } from './contexts/ThemeContext'
import { TimelineContextProvider } from './contexts/TimelineContext'
import { DEFAULT_RENDER_INTERVAL_MS, IS_DEV } from './defaults'
import { breedFlames } from './flame/breedFlame'
import { example1 } from './flame/examples/example1'
import { example34 } from './flame/examples/example34'
import { initExample } from './flame/examples/initExample'
import { initExample3D } from './flame/examples/initExample3D'
import { newDefaultTransform } from './flame/newTransform'
import { generateRandomFlame, mutateFlame, randomizeAllColors, randomRange, } from './flame/randomize'
import { accumulatedPointCount, animationExportCancel, animationExportProgress, animationExportRunning, qualityPointCountLimit, setExportQuality, setForceAnimationExportNow, } from './flame/renderStats'
import { tryValidateFlame } from './flame/schema/flameSchema'
import { extractFlameUniforms, generateTransformId, generateVariationId, } from './flame/transformFunction'
import { extractFlameUniforms3D } from './flame/transformFunction3D'
import { collectFlameCustomVariations, deleteCustomVariation, duplicateCustomVariation, getCustomVariations, loadCustomVariations, persistSharedVariations, restoreCustomVariation, } from './flame/variations/custom'
import { getVariationDefault } from './flame/variations/utils'
import { installPauseSave } from './lib/pauseSave'
import { IS_NATIVE } from './lib/platform'
import { breakRecordingCoalescing, cancelSessionRecording, invalidateLastFinishedSession, isSessionRecording, notePreviewStarted, recordedActionCount, recordSyntheticAction, reportDocumentWrite, reportTimelineTransport, reportUnreplayable, startSessionRecording, stopSessionRecording, withRecordingSuppressed, } from './recorder/recorder'
import { canEnableReplayAudio } from './recorder/replay'
import { captureTransformColors, runPaletteRestoreTransition, } from './recorder/replayPaletteState'
import { snapshotOrigin, snapshotOriginLabel } from './recorder/snapshotOrigin'
import { applySonificationSnapshot, closeAuthoredSonificationPanel, shouldStopHiddenSonification, SONIFICATION_SNAPSHOT_VERSION, } from './recorder/sonificationState'
import { createRecorderAwareTimeline, runTimelineSnapshotMutation, } from './recorder/timelineActions'
import { BENCHMARKS_PATH } from './routing/appPath'
import { createAnimationExport } from './utils/animationExport'
import { applyAudioTargetValues, createAudioAnalyzer, decodeAudioBytes, } from './utils/audioAnalysis'
import { downloadBlob } from './utils/blob'
import { deepClone } from './utils/clone'
import { createStoreHistory } from './utils/createStoreHistory'
import { sendFlameToDiscord } from './utils/discordWebhook'
import { enqueueAnimationJob, enqueueImageJob } from './utils/exportJobs'
import { sessionForExport, snapshotExportSession, } from './utils/exportPreferences'
import { resolveExportFrameRange } from './utils/exportRequests'
import { addFlameDataToPng } from './utils/flameInPng'
import { hardwareTierToPreset } from './utils/hardwareTier'
import { compressJsonQueryParam } from './utils/jsonQueryParam'
import { addRandomizerHistoryEntry, clearRandomizerHistory, loadRandomizerHistoryEntries, MAX_RANDOMIZER_HISTORY_LIMIT, } from './utils/randomizerHistoryDB'
import { buildReadableIds } from './utils/readableIds'
import { getOldestRecentFlame, saveRecentFlame } from './utils/recentFlames'
import { storeImportedSession, storeSession } from './utils/sessionsDB'
import { createShareLink, deriveOgMeta, uploadOgPreview, } from './utils/shareLink'
import { sum } from './utils/sum'
import { applyTimelineToFlameAtFrame, createTimelineState, defaultConfig as defaultTimelineConfig, } from './utils/timeline'
import { sortedTransformEntries } from './utils/transformOrder'
import { createUndoRouter } from './utils/undoRouting'
import { useAppDragAndDrop } from './utils/useAppDragAndDrop'
import { useAudioReactive } from './utils/useAudioReactive'
import { useSonification } from './utils/useSonification'
import type { AudioMapping } from './components/AudioReactivePanel/AudioReactivePanel'
import type { TourContext } from './components/SpotlightTour/tourTypes'
import type { Palette } from './flame/colorMap'
import type { GenerateRandomFlameConfig, MutateFlameOptions, } from './flame/randomize'
import type { FlameDescriptor } from './flame/schema/flameSchema'
import type { TimelineSnapshot } from './flame/schema/timeline'
import type { TransformVariationType } from './flame/variations'
import type { CustomVariationDef } from './flame/variations/custom/types'
import type { ReplayAffineMode, ReplayAffineTab, ReplayColorView, } from './recorder/focusPreparation'
import type { SessionStartExtras } from './recorder/recorder'
import type { RecordedSession } from './recorder/schema'
import type { SnapshotOrigin } from './recorder/snapshotOrigin'
import type { SonificationSnapshot } from './recorder/sonificationState'
import type { AnimationExportConfig } from './utils/animationExport'
import type { AudioAnalyzer, AudioTargetValue, LiveAudioAnalyzer, } from './utils/audioAnalysis'
import type { HardwareTier } from './utils/hardwareTier'
import type { SharePayload } from './utils/jsonQueryParam'
import type { RandomizerHistoryEntry } from './utils/randomizerHistoryDB'
import type { SonificationConfig } from './utils/sonification'
import type { EasingCurve, KeyframeInterpolation, TimelineConfig, TimelineTrack, } from './utils/timeline'
import type { BundledTrack } from '@/arcade/bundledTracks'
import type { CommandContext } from '@/commands/types'
import type { CommunityShowcaseRequest } from '@/lib/communityShowcase'

export type { ExportImageInfo, ExportImageType } from '@/flame/exportImageType'

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
   * The timeline the seeded flame's animation was authored at, where the
   * seeding has one. A pick that carries none keeps the hand-off reset's
   * defaults.
   */
  welcomeConfig?: () => TimelineConfig | undefined
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
 * Animation starts enabled — a flame with no tracks renders identically either
 * way, and the timeline's affordances are visible from the start.
 *
 * Named because `resetWorkspaceForHandoff` has to restore exactly this: a flame
 * opened from Home second must land in the state it would have landed in first.
 */
const DEFAULT_ANIMATION_ENABLED = true

function resolveInitialFlame(props: AppProps): FlameDescriptor {
  const welcome = props.flameFromWelcome?.()
  if (welcome) {
    const valid = tryValidateFlame(welcome)
    if (valid) return valid
  }
  const query = props.flameFromQuery?.flame
  if (query) {
    const valid = tryValidateFlame(query)
    if (valid) return valid
    console.error(
      '[share] initial flame from query is invalid, falling back to example1',
      query,
    )
  }
  return example1
}

function logStoreInitDev(props: AppProps, flameDescriptor: FlameDescriptor) {
  if (!IS_DEV) return
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

  const layoutStore = createWorkspaceLayoutStore()
  const selectionStore = createWorkspaceSelectionStore()
  const exportStore = createWorkspaceExportStore(props.hardwareTier)

  const {
    touchLayoutPreference,
    setTouchLayoutPreference,
    isMobile,
    setIsMobile,
    isPhone,
    isTablet,
    isTouchLayout,
    sidebarHidden,
    setSidebarHidden,
    showSidebar,
    setShowSidebar,
    sidebarLayoutMode,
    setSidebarLayoutMode,
    sidebarWidth,
    setSidebarEl,
    timelineCollapsed,
    setTimelineCollapsed,
    showTimeline,
    setShowTimeline,
    affineCardOpen,
    setAffineCardOpen,
    colorCardOpen,
    setColorCardOpen,
    metadataCardOpen,
    setMetadataCardOpen,
    paletteCardOpen,
    setPaletteCardOpen,
    renderCardOpen,
    setRenderCardOpen,
    symmetryCardOpen,
    setSymmetryCardOpen,
    randomizerOpen,
    setRandomizerOpen,
    randomizerAnimEpoch,
    setRandomizerAnimEpoch,
    floatingActionsCollapsed,
    setFloatingActionsCollapsed,
    floatingLeft,
    floatingTop,
  } = layoutStore

  const [touchDrawerOpen, setTouchDrawerOpen] = createSignal(false)
  // The drawer is a layer over the editor: back closes it (lib/backStack.ts).
  createBackLayer(
    touchDrawerOpen,
    () => {
      setTouchDrawerOpen(false)
    },
    'advanced tools',
  )
  /** How much of the viewport the rail's sheet covers; 0 while it is at peek. */
  const [railInset, setRailInset] = createSignal(0)
  /** The phone, and a tablet too narrow for the deck, both get the rail. */
  const railLayout = createMemo(() => isPhone() || (isTablet() && !deckFits()))

  const {
    selectedTransformId,
    setSelectedTransformId,
    toggleSelectedTransform,
    collapsedTransforms,
    setCollapsedTransforms,
    toggleTransformCollapsed,
    quickPickState,
    setQuickPickState,
    quickPickerMode,
    setQuickPickerMode,
    hoveredVariationType,
    setHoveredVariationType,
    hoveredCustomVarDef,
    setHoveredCustomVarDef,
    customVarsVersion,
    setCustomVarsVersion,
    customStatus,
  } = selectionStore

  const {
    qualityPreset,
    setQualityPreset,
    pixelRatio,
    setPixelRatio,
    exportDimensions,
    setExportDimensions,
    canvasPixelRatio,
    onExportImage,
    setOnExportImage,
    adaptiveFilterEnabled,
    setAdaptiveFilterEnabled,
    stochasticFilterEnabled,
    setStochasticFilterEnabled,
  } = exportStore

  createEffect(() => {
    if (props.hardwareTier) {
      setQualityPreset(hardwareTierToPreset(props.hardwareTier))
    }
  })

  // Dev-only: crash injection trigger (renders inside ErrorBoundary)
  const [devCrashTest, setDevCrashTest] = createSignal(false)
  const [replayAffineModeRequest, setReplayAffineModeRequest] = createSignal<{
    mode: ReplayAffineMode
    tab: ReplayAffineTab
    epoch: number
  }>({ mode: 'preAffine', tab: 'grid', epoch: 0 })
  const [replayColorViewRequest, setReplayColorViewRequest] = createSignal<{
    view: ReplayColorView
    epoch: number
  }>({ view: 'grid', epoch: 0 })

  const visibleTransformTids = () =>
    sortedTransformEntries(recordEntries(flameDescriptor.transforms))
      .filter(([tid]) => !tid.startsWith('_sym__'))
      .map(([tid]) => tid)
  const anyTransformOpen = () =>
    selectionStore.anyTransformOpen(visibleTransformTids())

  function toggleCollapseAllTransforms() {
    selectionStore.toggleCollapseAllTransforms(visibleTransformTids())
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
  const _requestModal = useRequestModal()

  const [sidebarDiffView, setSidebarDiffView] = createSignal<{
    flameA: FlameDescriptor
    flameB: FlameDescriptor
  } | null>(null)
  const setSidebarWidth = () => {} // Drag resize disabled
  let sidebarRef: HTMLDivElement | undefined
  let sidebarScrollRef: HTMLDivElement | undefined
  let randomizerCardRef: HTMLDivElement | undefined
  createEffect(() => {
    // The phone and tablet classes come from the layout store's one resize
    // listener now; this effect only keeps the sidebar's own breakpoint.
    const mq = window.matchMedia('(max-width: 768px)')

    setIsMobile(mq.matches)
    if (mq.matches || isPhone()) setCompact(true)

    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      if (e.matches) setCompact(true)
      if (e.matches) {
        if (isSessionRecording()) hideMobileSidebarAsAuthoredAction()
        else setSidebarHidden(true)
      }
    }

    mq.addEventListener('change', handler)
    onCleanup(() => {
      mq.removeEventListener('change', handler)
    })
  })
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
  const initialFlame = resolveInitialFlame(props)
  const [flameDescriptor, setFlameDescriptor, history] = createStoreHistory(
    createStore(deepClone(initialFlame)),
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

  const {
    prePaletteColors,
    setPrePaletteColors,
    withPaletteRestoreTransition,
    selectedPalette,
    selectedPaletteId,
  } = useWorkspacePalette({
    flameDescriptor,
    history,
  })

  const {
    directorOpen,
    setDirectorOpen,
    directorState,
    setDirectorState,
    selectCandidate,
    openArtDirectorUI,
  } = useWorkspaceArtDirector({
    flameDescriptor,
    setFlameDescriptor,
    showToast,
    hardwareTier: () => props.hardwareTier,
  })

  const {
    showArena,
    setShowArena,
    arenaP1Stats,
    setArenaP1Stats,
    arenaP2Stats,
    setArenaP2Stats,
    arenaCommentary,
    setArenaCommentary,
    arenaEventBanner,
    setArenaEventBanner,
    arenaStance,
    setArenaStance,
    openFlameClashUI,
  } = useWorkspaceArena({
    flameDescriptor,
    showSidebar,
    setShowSidebar,
    showTimeline,
    setShowTimeline,
  })

  /**
   * File/gallery loads are document boundaries in the live editor, but a
   * recorder still needs a self-contained action that can reproduce the
   * resulting document. Keep one replacement-style history entry and log the
   * exact descriptor it produced, mirroring the 2D/3D switch path below.
   *
   * The flush belongs here, at the one point every document replacement
   * passes through, rather than at the buttons: the desktop's Load did it
   * and the touch layouts' way into the same dialog - the HUD, the rail and
   * the tools drawer all reach it through `pickGalleryFlame` - did not, so
   * opening a flame from Library on a phone dropped whatever was unsaved.
   *
   * Every caller settles the cap question first, with
   * `prepareDocumentReplacement`: the chokepoint's answer to a replacement
   * that skipped it is to refuse, so a call without the gate does not fall
   * back to the old destructive behaviour - it does nothing at all, and the
   * drop or the migration behind it appears to be ignored. A caller that
   * forgets is caught by a guard over this file in lib/documentLoad.test.ts.
   *
   * @returns whether the document was actually replaced.
   */
  const replaceLoadedFlame = (
    next: FlameDescriptor,
    label = 'Load flame',
    origin?: SnapshotOrigin,
  ): boolean => {
    const flame = deepClone(next)
    const description = snapshotOriginLabel(origin) ?? label
    const replaced = replaceOpenDocument({
      // Reads the OUTGOING flame and its tracks, so it has to run before the
      // replacement below drops them (lib/documentLoad.ts).
      flushUnsaved: flushDirtyToRecents,
      // A different document cannot inherit another flame's pre-palette
      // stash. If the loaded flame already carries a palette, its earlier
      // natural colours are unknowable; Unselect safely keeps its current
      // colours. The history side effects restore the outgoing provenance if
      // this load is undone and clear it again on redo.
      replace: () => {
        withRecordingSuppressed(() => {
          withPaletteRestoreTransition({}, description, () => {
            setFlameDescriptor(() => flame, description)
          })
        })
      },
    })
    // A refused replacement opened nothing, so there is no load to record:
    // a `flame.load` for a document that never landed makes a replay apply
    // every action after it to the wrong flame.
    if (!replaced) return false
    // A replacement IS the load boundary, so it is taken here rather than by
    // each caller. Two of the four reached this function and nothing else -
    // an accepted migration and a generated logo - and so took no boundary at
    // all: the session id was never rotated, so the new flame's autosaves
    // overwrote the entry the flush had just written the OUTGOING flame into,
    // and the baseline still described the flame that had left, so the
    // incoming one read as unsaved work from the moment it opened. The other
    // two also seed an animation, whose effect takes a boundary as well -
    // re-taking it there is what picks up the tracks and the timeline that
    // land after this returns (hooks/useWorkspaceAutosave).
    markLoadedBaseline()
    recordSyntheticAction(
      'flame.load',
      origin === undefined
        ? [deepClone(flame), description]
        : [deepClone(flame), description, {}, origin],
      description,
    )
    return true
  }
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
  logStoreInitDev(props, flameDescriptor)
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
      // The hand-off replaces the open document, so whatever is unsaved in
      // it has to reach Recents before the reset below drops it - and at the
      // cap, whether that save may evict the oldest kept flame is the user's
      // question (lib/documentLoad.ts).
      void (async () => {
        if (!(await prepareDocumentReplacement())) {
          // They chose to keep what is open, so the pending selection has to
          // go: nothing re-triggers this effect, and a hand-off left standing
          // would sit there unapplied for the rest of the session.
          props.resetFlameFromWelcome?.()
          return
        }
        // Read after the answer, not before it. Everything this hand-off
        // needs is either live state or a prop accessor, so the only thing
        // that could go stale across the question is the outgoing palette
        // provenance - and taking it here means there is nothing to go
        // stale. The signal is read outside the effect's tracking scope now,
        // which is also what stops a palette edit from replaying a hand-off
        // that has already happened.
        const outgoingPaletteRestoreColors = deepClone(prePaletteColors())
        replaceOpenDocument({
          // Reads the OUTGOING flame and its tracks, so it has to run before
          // the reset drops them (lib/documentLoad.ts).
          flushUnsaved: flushDirtyToRecents,
          // Then a clean slate, THEN this flame's own state. Every hand-off
          // starts from the same baseline, so the second flame you open from
          // Home looks exactly like the first one would have. See
          // resetWorkspaceForHandoff for what was leaking and why.
          replace: () => {
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
          },
        })
        // Read BEFORE resetFlameFromWelcome() clears the whole hand-off.
        const capability = props.capabilityFromHome?.()
        if (capability !== undefined) {
          setPendingCapability(capability)
        }
        // Load animation tracks if the welcome selection includes them
        const tracks = props.welcomeTracks?.()
        const config = props.welcomeConfig?.()
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
            ...(config ? { config } : {}),
          })
        } else if (config) {
          // A flame with no tracks still has a timeline, and the reset above
          // has just replaced it with the default one. Nothing downstream puts
          // a seeded fps and end frame back on this path: setLoadedAnimation
          // is the animation loader, and there is no animation here to load.
          timeline.setConfig({ ...timeline.config(), ...config })
        }
        props.resetFlameFromWelcome?.()
        // Every hand-off is a fresh starting point for dirty tracking: the
        // flame that arrives here came from somewhere the user can reach it
        // again - the welcome grid, a Home card, the Library - so nothing is
        // lost by counting it as loaded, while leaving it dirty made the
        // autosave prompt and the five-minute reminder fire on a launch
        // nobody had touched.
        markLoadedBaseline()
      })()
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
      // Settled once the user has picked, before the dialog's batch drops
      // the open document. A thunk because the autosave that answers this is
      // created further down, after the modal is wired up.
      prepareReplace: () => prepareDocumentReplacement(),
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
  /**
   * The frame of modulation the renderer is layering on right now, or
   * `undefined` when nothing is modulating.
   *
   * Modulation used to be written into the document 30 times a second through
   * `history.setSilently`, which meant that after any audio-reactive playback
   * the user's flame WAS the frame the music stopped on — permanently, with no
   * undo to reach it (those writes were kept out of history deliberately), and
   * with the autosave and the pause write then filing that frame as their
   * work. It is a render-time overlay instead: the document is never touched,
   * so there is nothing to stash when the music starts and nothing to restore
   * when it stops.
   */
  const [audioModulation, setAudioModulation] = createSignal<
    AudioTargetValue[] | undefined
  >(undefined)
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
        <Suspense>
          <DiffViewModal
            flameA={deepClone(flameA)}
            flameB={deepClone(flameB)}
            respond={respond}
          />
        </Suspense>
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
        <Suspense>
          <PopulationSimulator
            flame={flameDescriptor}
            hardwareTier={props.hardwareTier}
            onApply={(flame) => {
              // A document replacement like any other, and it was not going
              // through the chokepoint: applying a simulator result dropped
              // whatever was unsaved in the flame it replaced
              // (lib/documentLoad.ts).
              void (async () => {
                if (!(await prepareDocumentReplacement())) return
                if (blendFlame())
                  showToast(
                    'Blend is still active — the loaded flame will look mixed',
                    4000,
                  )
                replaceOpenDocument({
                  flushUnsaved: flushDirtyToRecents,
                  replace: () => {
                    executeFlameLoad(
                      flame,
                      undefined,
                      snapshotOrigin('flame.simulator'),
                    )
                  },
                })
              })()
            }}
            respond={respond}
          />
        </Suspense>
      ),
    })
  }

  function pickAncestryFlame() {
    void _requestModal({
      content: ({ respond }) => (
        <Suspense>
          <AncestryTreeModal
            flame={flameDescriptor}
            hardwareTier={props.hardwareTier}
            onApply={(flame) => {
              // A document replacement like any other, and it was not going
              // through the chokepoint: applying an ancestry result dropped
              // whatever was unsaved in the flame it replaced
              // (lib/documentLoad.ts).
              void (async () => {
                if (!(await prepareDocumentReplacement())) return
                if (blendFlame())
                  showToast(
                    'Blend is still active — the loaded flame will look mixed',
                    4000,
                  )
                replaceOpenDocument({
                  flushUnsaved: flushDirtyToRecents,
                  replace: () => {
                    executeFlameLoad(
                      flame,
                      undefined,
                      snapshotOrigin('flame.ancestry'),
                    )
                  },
                })
              })()
            }}
            onCompare={openDiffAsModal}
            respond={respond}
          />
        </Suspense>
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
    createLazyShowCustomVariationEditor()

  const isAnyModalOpen = () =>
    loadModalIsOpen() ||
    varSelectorModalIsOpen() ||
    exportModalIsOpen() ||
    customVariationEditorIsOpen()

  const customVariationsList = createMemo(() => {
    void customVarsVersion()
    return getCustomVariations()
  })

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

  /**
   * What the canvas draws: the effective flame with this frame of audio
   * modulation laid over it.
   *
   * Given only to the renderers, never to the editing surfaces, and that
   * split is the whole point. Modulation changes something 30 times a second;
   * handing that to the inspector would mean its memos re-run on every frame
   * (they track `effectiveFlame` as a whole, not the store paths they read)
   * and its sliders would show numbers that are not in the document — the
   * same confusion the document writes created, minus the data loss.
   *
   * `deepClone` reads the whole store, so an edit made while the music plays
   * re-runs this and the next frame is modulated from the edited flame. That
   * is the intent: edits during playback are ordinary edits, and the audio
   * goes on to drive the new flame.
   *
   * With nothing modulating this is `effectiveFlame` itself — the store
   * proxy, when nothing is hovered either — so the renderer keeps its
   * fine-grained tracking and nobody pays for a clone.
   */
  const renderedFlame = createMemo<FlameDescriptor>(() => {
    const base = effectiveFlame()
    const values = audioModulation()
    if (values === undefined || values.length === 0) return base
    try {
      const clone: FlameDescriptor = deepClone(base)
      applyAudioTargetValues(clone, values)
      return clone
    } catch {
      return base
    }
  })

  const finalRenderInterval = () =>
    // Home covers the workspace while it is showing, so the canvas has nothing
    // to display — pause it exactly as an open modal does rather than paying
    // for frames nobody sees. The duel stage covers it the same way and
    // renders the player's flame itself. An export still wins: those run to
    // completion in the background whichever tab is in front.
    isAnyModalOpen() ||
    ((duelShowing() || !workspaceIsVisible()) && !onExportImage())
      ? Infinity
      : onExportImage()
        ? 0
        : DEFAULT_RENDER_INTERVAL_MS

  // Shared by the toolbar Benchmark button and the `?benchmark` auto-open.
  const showBenchmark = createLazyShowBenchmark()

  const showDocumentation = createLazyShowDocumentation({
    hardwareTier: () => props.hardwareTier ?? null,
  })

  const showHelp = createLazyShowHelp(
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
    hapticsEnabled,
    setHapticsEnabled,
  )

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
    if (
      isTouchDevice() &&
      touchLayoutPreference() === 'auto' &&
      !isPhone() &&
      !isTablet()
    ) {
      showToast(
        'Touch device detected: switch to Touch Studio layout?',
        'sticky',
        [
          {
            label: 'Switch to Touch',
            onClick: () => {
              setTouchLayoutPreference('touch')
            },
          },
          {
            label: 'Keep Desktop',
            onClick: () => {
              setTouchLayoutPreference('desktop')
            },
          },
        ],
      )
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
  const {
    setFlameZoom,
    setFlamePosition,
    setFlameTheta,
    setFlamePhi,
    setFlameRadius,
    setFlameTarget3D,
    setFlameFov,
    setFlameRoll,
    flyMode,
    setFlyMode,
    flySpeed,
    effectiveTheta,
    effectivePhi,
    effectiveRadius,
    effectiveTarget3D,
    effectiveRoll,
    effectiveFov,
  } = useWorkspaceCamera({
    flameDescriptor,
    setRenderSetting: (path, value) => {
      setRenderSetting(path, value)
    },
    timeline: {
      isDrivingView: () => timeline.isDrivingView(),
      resolveValueAtPath: (path, frame) =>
        timeline.resolveValueAtPath(path, frame),
      currentFrame: () => timeline.currentFrame(),
    },
    setSilently: (updater) => {
      history.setSilently(updater)
    },
  })

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
      // Settled once the dropped file has been read, before the hook's batch
      // drops the open document - and beside `replace` rather than inside it
      // for the same reason the load dialog does it here: an await from
      // inside that batch would let the animation seed take the load
      // boundary while the outgoing flame was still on screen. A thunk
      // because the autosave that answers this is created further down.
      prepareReplace: () => prepareDocumentReplacement(),
    },
    setLoadedAnimation,
    importReplaySession,
  )

  const timeline = createTimelineState({ seatId: 'player' })

  /*
   * Below `timeline` on purpose, and the guard in
   * src/eagerComputationOrder.test.ts keeps it there.
   *
   * `createMemo` runs its callback once, straight away. From further up this
   * body it read `timeline` before the line above had run, which is a
   * ReferenceError -- hidden for as long as `blendFlame()` was falsy and
   * short-circuited the read. A flame that ARRIVES blended (a share link, a
   * restored draft, a PNG at startup) makes it truthy on that first run, and
   * the component died there: every share link of a blended flame opened the
   * crash screen instead (tests/blend-mount.ci.spec.ts).
   *
   * Its one reader is the canvas further down, so the move costs nothing.
   */
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

  /*
   * Audio-reactive loop: plays audio through AudioContext and publishes one
   * frame of modulation values at 30fps, synced to playback time.
   *
   * It used to write those values into the document through
   * `history.setSilently`, and so had to tell the recorder about a derived
   * write and warn once per take that the take was unreplayable. Neither is
   * true of a publish: the document the recorder captures is the authored one,
   * frame by frame, whatever the music is doing to the canvas.
   */
  useAudioReactive(
    audioEnabled,
    audioBuffer,
    audioMapping,
    (values) => {
      setAudioModulation(values)
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
    // The flame behind the frame this capture keeps. Filled in when that frame
    // lands, because the preview is an image of the canvas: the overlay the
    // audio loop republishes 30 times a second is in those pixels, and the
    // flame the PNG carries has to be the one that drew them.
    let capturedFlame: FlameDescriptor | undefined
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
            capturedFlame = deepClone(renderedFlame())
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
    // No frame, or no flame behind it, means no honest preview to upload.
    if (!rawBlob || !capturedFlame) return null

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
        ? { flame: capturedFlame, animation: { tracks, config } }
        : capturedFlame
      const encoded = await compressJsonQueryParam(payload)
      const pngBytes = new Uint8Array(await downscaled.arrayBuffer())
      return addFlameDataToPng(encoded, pngBytes)
    } catch {
      return null
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const { showShareLinkModal } = createLazyShareLinkModal(
    flameDescriptor,
    () => timeline.tracks(),
    () => timeline.config(),
    captureOgImageBlob,
  )

  const { showDiscordShareModal } = createLazyDiscordShareModal()

  const { showImportVariationsModal } = createLazyImportVariationsModal()

  const { showShareVariationLinkModal } = createLazyShareVariationLinkModal()

  const { showShareVariationLoadModal } = createLazyShareVariationLoadModal()

  const { showMigrationModal } = createLazyMigrationModal(async (flame) => {
    // Accepting a migration replaces the open document like any other load,
    // so the cap question is settled here. Without it the chokepoint refuses
    // the replacement and the modal closes having done nothing.
    if (!(await prepareDocumentReplacement())) return
    if (!replaceLoadedFlame(flame, 'Load migrated flame')) return
    // A migrated flame carries no animation, but it still has a timeline.
    // Without this it opened on the keyframe tracks, frame rate and end frame
    // of the document it replaced, and autosaved there (lib/documentLoad.ts).
    setLoadedAnimation({ flame, tracks: [], config: defaultTimelineConfig() })
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
        downloadBlob(blob, 'animation.mp4')
        // The native app reports where the file went itself.
        if (!IS_NATIVE) {
          showToast('Animation exported')
        }
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
      renderedFlame,
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
    // Freeze one authored document for the entire flow. The capture callback,
    // share-link shortener and consent modal all resolve asynchronously; using
    // the live store again later could pair flame B with flame A's PNG. What
    // is read off this below is the document's own description - its name, and
    // which custom variations it references - never the artifact the post
    // carries, which is `postedFlame`.
    const sharedFlame = deepClone(flameDescriptor)
    const tracks = deepClone(timeline.tracks())
    const config = deepClone(timeline.config())
    const hasAnimation = tracks.some((track) => track.keyframes.length > 0)
    const customVariations = collectFlameCustomVariations(sharedFlame)
    const hasCustomVariationReference = Object.values(
      sharedFlame.transforms,
    ).some((transform) =>
      Object.values(transform.variations).some((variation) =>
        variation.type.startsWith('custom_'),
      ),
    )

    // Step 1: Capture the current flame at its current resolution to prevent
    // flickering/resizing. The pixels come off the LIVE canvas, so the flame
    // that produced them - the open document with this frame of audio
    // modulation over it - is frozen alongside them.
    let capturedFlame: FlameDescriptor | undefined
    const rawBlob = await new Promise<Blob | null>((resolve) => {
      setOnExportImage(() => (canvas: HTMLCanvasElement) => {
        setOnExportImage(undefined)
        capturedFlame = deepClone(renderedFlame())
        canvas.toBlob(
          (b) => {
            resolve(b)
          },
          'image/png',
          1,
        )
      })
    })

    if (!rawBlob || !capturedFlame) {
      showToast('Failed to capture flame image')
      return
    }

    /**
     * One post, one artifact: the flame in the image, in the link beside it,
     * and in the showcase entry the post can become.
     *
     * These used to disagree. The PNG carried the captured frame while the
     * link and the showcase carried the authored document, so while a track
     * played, someone clicking "Copy share link" under the picture got a
     * flame that does not look like it - the same post saying two things.
     *
     * Recents, the autosave and the pause write are untouched by this and
     * keep the authored flame: that is the user's work, and a picture of one
     * frame of it is not something to save over it.
     */
    const postedFlame = capturedFlame

    // Step 2: Embed flame data into the PNG so it can be loaded back
    const animation = hasAnimation ? { tracks, config } : undefined
    const payload =
      hasAnimation || customVariations.length > 0
        ? {
            flame: postedFlame,
            animation,
            customVariations:
              customVariations.length > 0 ? customVariations : undefined,
          }
        : postedFlame
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
      flame: postedFlame,
      animation,
      customVariations:
        customVariations.length > 0 ? customVariations : undefined,
    })
    void sharePromise
      .then(async ({ encoded: shareEncoded }) => {
        const ogBlob = await captureOgImageBlob()
        if (!ogBlob) return
        const { title, description } = deriveOgMeta(sharedFlame)
        void uploadOgPreview({
          encoded: shareEncoded,
          blob: ogBlob,
          title,
          description,
        })
      })
      .catch(() => {
        // The modal still offers the embedded PNG fallback if link creation
        // fails. Avoid leaking a rejected best-effort preview task.
      })

    const shared = await showDiscordShareModal({
      previewUrl,
      initialMetadata: sharedFlame.metadata,
      showcaseEligible: !hasCustomVariationReference,
      showcaseUnavailableReason: hasCustomVariationReference
        ? 'Custom variations are shared to Discord, but cannot enter the Home showcase until their definitions can travel with gallery entries.'
        : undefined,
      onShare: async (meta, token) => {
        const showcase: CommunityShowcaseRequest | undefined =
          meta.submitToShowcase
            ? {
                consent: true,
                consentVersion: SHOWCASE_CONSENT_VERSION,
                flame: postedFlame,
                animation,
                shareUrl: (await sharePromise).primaryUrl,
              }
            : undefined
        return sendFlameToDiscord(blob, meta, token, showcase)
      },
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
    if (shared?.showcaseQueued) {
      showToast('Shared to Discord and submitted for Home review')
    } else if (shared?.showcaseRequested) {
      showToast('Shared to Discord; Home submission could not be staged')
    } else if (shared) {
      showToast('Shared to Discord')
    }
  }

  const { showLogoFaviconGenerator } = createLazyLogoFaviconGenerator(
    flameDescriptor,
    () => selectedPalette(),
    async (flame) => {
      // Same as the migration modal: the generated logo replaces the open
      // document, so the question is asked here or the chokepoint refuses
      // the replacement and the generator appears to load nothing.
      if (!(await prepareDocumentReplacement())) return
      if (!replaceLoadedFlame(flame, 'Load generated logo')) return
      // Same as the migration above: a generated logo has no animation and a
      // timeline of its own, and inherited the previous document's otherwise.
      setLoadedAnimation({ flame, tracks: [], config: defaultTimelineConfig() })
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
          <Suspense>
            <ConfirmDeleteVariationModal name={def.name} respond={respond} />
          </Suspense>
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

  const handleLoadHistory = async (entry: RandomizerHistoryEntry) => {
    // Asked before anything moves, including the highlight: a no means this
    // entry was never opened, so nothing should look as though it was
    // (lib/documentLoad.ts).
    if (!(await prepareDocumentReplacement())) return
    setSelectedHistoryTimestamp(entry.timestamp)
    // Loading a history entry is a fresh starting point: keep unsaved work
    // recoverable and don't autosave the untouched loaded flame.
    replaceOpenDocument({
      flushUnsaved: flushDirtyToRecents,
      replace: () => {
        executeFlameLoad(
          entry.flame,
          'Load History Flame',
          snapshotOrigin('flame.history'),
        )
        markLoadedBaseline()
      },
    })
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
      if (import.meta.env.DEV) {
        console.info(
          '[tourContext:executeCommand]',
          id,
          'args:',
          ...args,
          'fn:',
          !!runTourCommand.fn,
        )
      }
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
      }
      // A load brings the timeline its animation was authored at. Without it
      // the hand-off's reset (30fps, endFrame 90) truncated every longer
      // animation and halved its speed, while the same flame through `?s=`
      // came back intact. Applied outside the branch above because the
      // envelope carries a config whether or not it carries tracks, and
      // inside it the stored fps and end frame of a flame with no animation
      // were read back and then dropped. Loop stays on by default for a
      // loaded animation; a stored config decides for itself.
      if (anim.config || anim.tracks.length > 0) {
        timeline.setConfig({
          ...timeline.config(),
          ...(anim.tracks.length > 0 ? { loop: true } : {}),
          ...anim.config,
        })
      }
      if (anim.tracks.length > 0) {
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

  /**
   * The one question a save at the cap has to have an answer to: Recents is
   * full, so storing this flame means destroying the oldest one the user
   * kept. Asked by the two writes that are allowed to ask - the user's own
   * Save for Later, and the flush at a document replacement, which is the
   * last moment the open document's work exists anywhere
   * (lib/documentLoad.ts).
   */
  const confirmOverwriteOldest = async () => {
    const oldestName = getOldestRecentFlame()?.name || 'Flame'
    return await _requestModal<boolean>({
      content: ({ respond }) => (
        <Suspense>
          <ConfirmOverwriteRecentModal
            oldestName={oldestName}
            respond={respond}
          />
        </Suspense>
      ),
    })
  }

  /**
   * The other way a flush writes nothing: storage refused it, so the open
   * document is not in Recents and going ahead would lose it outright. There
   * is nothing to trade here - no oldest flame to spend - so it is its own
   * question, and the answer that keeps their work is the one a dismissed
   * modal gives (lib/documentLoad.ts).
   */
  const confirmDiscardUnsaved = async () =>
    await _requestModal<boolean>({
      content: ({ respond }) => (
        <Suspense>
          <ConfirmDiscardUnsavedModal respond={respond} />
        </Suspense>
      ),
    })

  // ── Autosave & save-awareness ──────────────────────────────────────────
  const {
    markSavedBaseline,
    markLoadedBaseline,
    flushDirtyToRecents,
    prepareDocumentReplacement,
    saveOnPause,
  } = useWorkspaceAutosave({
    flameDescriptor,
    getTracks: () => timeline.tracks(),
    // The timeline is part of the document: a change to the frame rate or
    // the end frame alone is unsaved work like any other.
    getConfig: () => timeline.config(),
    agentDriving,
    showToast,
    confirmOverwriteOldest,
    confirmDiscardUnsaved,
  })

  /**
   * The user's own save: the one write allowed to replace a flame they kept,
   * because it is the one that asks first.
   *
   * Named and declared here rather than inline on the desktop button, so the
   * touch layouts can offer the same action - the restore notice tells the
   * user to save the flame for later, and on the device that notice is
   * written for there was nothing to tap (components/Shell/moreMenuItems.ts).
   *
   * Nothing here claims more than happened: `full` is the only outcome worth
   * asking about, anything else means the write did not land and the
   * workspace stays dirty so the next boundary tries again.
   */
  const saveFlameForLater = async () => {
    const tracks = timeline.tracks()
    const config = timeline.config()
    const saved = (force: boolean) =>
      saveRecentFlame(flameDescriptor, undefined, tracks, force, config)
    const announce = (replacedOldest: boolean) => {
      markSavedBaseline()
      showToast(
        tracks.length > 0
          ? `Flame + animation saved${replacedOldest ? ' (replaced oldest)' : ' for later'}`
          : `Flame saved${replacedOldest ? ' (replaced oldest)' : ' for later'}`,
      )
    }
    const outcome = saved(false)
    if (outcome === 'saved') {
      announce(false)
      return
    }
    if (outcome === 'refused') {
      showToast('Could not save the flame to Recents', 5000)
      return
    }
    if (!(await confirmOverwriteOldest())) return
    if (saved(true) === 'saved') {
      announce(true)
    } else {
      showToast('Could not save the flame to Recents', 5000)
    }
  }

  /**
   * Start again from the starter flame. A document replacement like any
   * other: the outgoing flame and its animation reach Recents first, because
   * undo restores the flame but keyframe tracks are not part of change
   * history (lib/documentLoad.ts).
   */
  const loadNewFlame = async () => {
    // Before the pause, so a no leaves the workspace exactly as it was.
    if (!(await prepareDocumentReplacement())) return
    if (timeline.isPlaying()) timeline.pause()
    replaceOpenDocument({
      flushUnsaved: flushDirtyToRecents,
      replace: () => {
        const is3D = (flameDescriptor.renderSettings.dimensions ?? 2) === 3
        const flame = deepClone(is3D ? initExample3D : initExample)
        executeFlameLoad(flame, 'New Flame', snapshotOrigin('flame.new'))
        // The timeline is part of the document too. A fresh flame that said
        // nothing about it kept the frame rate, the end frame and the loop
        // mode of the flame it replaced, because the effect that consumes
        // this only applies a timeline when it is handed one.
        setLoadedAnimation({
          flame,
          tracks: [],
          config: defaultTimelineConfig(),
        })
      },
    })
    showToast('Fresh flame loaded — undo restores the previous one')
  }

  /**
   * Switch between 2D and 3D, each keeping its own flame and animation.
   *
   * The stash is in memory only, so this is a document replacement too: what
   * is unsaved reaches Recents before the switch, or switch-then-close loses
   * it (lib/documentLoad.ts).
   */
  const switchDimensions = async (v: number) => {
    if ((flameDescriptor.renderSettings.dimensions ?? 2) === v) return
    // The stash the switch restores from is in memory only, so this is the
    // same boundary as a load: what is unsaved reaches Recents first, or
    // switch-then-close loses it (lib/documentLoad.ts).
    if (!(await prepareDocumentReplacement())) return
    // Read after the answer. `current` decides which dimension's stash the
    // outgoing flame is filed under, so a value taken before the question
    // would be a guess about what is still open by the time it runs.
    const current = flameDescriptor.renderSettings.dimensions ?? 2
    if (v === current) return
    replaceOpenDocument({
      flushUnsaved: flushDirtyToRecents,
      replace: () => {
        // Stash the active flame AND its animation tracks under the current
        // dimension; restore the target dimension's own pair so 2D and 3D
        // each keep independent animations.
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
        // These document-boundary writes are represented by the two synthetic
        // actions below. Suppress their coverage hooks so the recorder does
        // not also flag the same, faithfully represented switch as an unnamed
        // write.
        withRecordingSuppressed(() => {
          withPaletteRestoreTransition({}, `Switch to ${v}D`, () => {
            setFlameDescriptor(() => deepClone(restored), `Switch to ${v}D`)
          })
          // Swap the timeline to the target dimension's tracks (empty on
          // first entry — matches the starter flame).
          timeline.loadTracks(restoredTracks ?? [])
        })
        // The switch restores from an in-memory stash, so replaying it as
        // "switch to 3D" would land on the VIEWER's stash, not ours. Log the
        // descriptor and tracks it actually produced instead — those replay
        // exactly. The live path keeps one replacement-style history entry,
        // including its palette provenance.
        const flameOrigin = snapshotOrigin('flame.dimension', `${v}D`)
        recordSyntheticAction(
          'flame.load',
          [deepClone(restored), `Switch to ${v}D`, {}, flameOrigin],
          snapshotOriginLabel(flameOrigin) ?? `Switch to ${v}D`,
        )
        const timelineOrigin = snapshotOrigin('timeline.dimension', `${v}D`)
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
      },
    })
  }

  /**
   * The editor's autosave (hooks/useWorkspaceAutosave.ts) flushes to Recents
   * on pagehide, which a WebView the OS force-stops never fires, so the same
   * write is made when the OS backgrounds the app - the last moment a native
   * app is told about (lib/pauseSave.ts).
   *
   * No `onCleanup`, deliberately: an ErrorBoundary catch (App.tsx) or a
   * WebGPU degrade unmounts this component, and unregistering here would take
   * the crash net down at the moment there is unsaved work and no editor left
   * to write it. The subscription lives in the module and a remount replaces
   * its one writer.
   */
  installPauseSave({ native: IS_NATIVE, save: saveOnPause })

  // Apply flame and animation from shared URL (fires once when resource resolves)
  let queryApplied = false
  createEffect(() => {
    const data = props.flameFromQuery
    if (!data || queryApplied) return
    queryApplied = true

    try {
      const validated = tryValidateFlame(data.flame)
      if (!validated) {
        throw new Error('Flame descriptor failed schema validation')
      }
      if ((validated.renderSettings.dimensions ?? 2) === 3) {
        extractFlameUniforms3D(validated)
      } else {
        extractFlameUniforms(validated)
      }

      if (IS_DEV) console.info('[share] applying flame from shared URL')
      history.replace(deepClone(validated))

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
    } catch (err) {
      console.error('Failed to open shared flame:', err)
      showToast(
        'The shared flame could not be opened because it contains invalid data. Reverting to default flame.',
        6000,
      )
      return
    }

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

  useWorkspaceTimelineBinding({
    flameDescriptor,
    history,
    timeline,
    blendWeight,
  })

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

  const effectiveRotation = createMemo(() => {
    if (animatingCamera()) {
      const val = timeline.resolveValueAtPath(
        'camera.rotation',
        timeline.currentFrame(),
      )
      if (val !== null && typeof val === 'number') return val
    }
    return flameDescriptor.renderSettings.camera.rotation ?? 0
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

  const initialStartClash = async (opts?: {
    stance?: string
    rounds?: number
  }) => {
    if (!showArena()) {
      openFlameClashUI()
    }
    if (opts?.stance) {
      setArenaStance(opts.stance)
    }
    return new Promise((resolve) => {
      const start = Date.now()
      const poll = setInterval(() => {
        if (
          cmdContext.arena?.startClash &&
          cmdContext.arena.startClash !== initialStartClash
        ) {
          clearInterval(poll)
          resolve(cmdContext.arena.startClash(opts))
        } else if (Date.now() - start > 4000) {
          clearInterval(poll)
          resolve({ error: 'Arena clash startup timed out.' })
        }
      }, 50)
    })
  }

  // Command context: bridges registered commands to app signals
  /**
   * Adopt a decoded track as the file audio source, or clear it with
   * undefined. The audio panel and Beats mode both come through here, so a
   * track loaded either way gets the same analyzer, playback reset and
   * recorded audio.applySnapshot.
   */
  const adoptAudioBuffer = (
    buf: AudioBuffer | undefined,
    fileName: string | undefined,
  ) => {
    history.takeOverOwnedPreview()
    setAudioBuffer(buf)
    setAudioTrackName(fileName)
    setFileAnalyzer(undefined)
    setAnalysisProgress(null)
    if (!buf) {
      setAudioEnabled(false)
    } else {
      setAnalysisProgress(0)
      setTimeout(async () => {
        let lastPercent = -1
        const analyzer = await createAudioAnalyzer(
          buf,
          30,
          (current, total) => {
            if (total <= 0) return
            const percent = Math.floor((current / total) * 100)
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
    executeCommand('audio.applySnapshot', cmdContext)
  }

  const loadBundledTrack = async (track: BundledTrack) => {
    const bytes = await fetchBundledTrackBuffer(track)
    adoptAudioBuffer(await decodeAudioBytes(bytes), track.name)
  }

  const cmdContext: CommandContext = {
    seatId: 'player',
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
      commentary: arenaCommentary,
      setCommentary: setArenaCommentary,
      eventBanner: arenaEventBanner,
      setEventBanner: setArenaEventBanner,
      stance: arenaStance,
      setStance: setArenaStance,
      startClash: initialStartClash,
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
      pause: timeline.pause,
      isPlaying: timeline.isPlaying,
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
      loadBundledTrack,
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
      showTimeline,
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
      start: (now) => {
        const result = startSessionRecording(
          flameDescriptor,
          captureRecorderStartExtras(),
          now,
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
      openReplay: (session) => {
        // The dock is only mounted while it is visible or recording, and the
        // pilot hides it for the duration of a take. Without this, a user who
        // had the dock switched off clicks Replay on the end card and nothing
        // happens. `setRecorderVisible` no-ops while a task is pending, which
        // is the correct behaviour here too.
        setRecorderVisible(true)
        setRecorderCollapsed(false)
        openReplaySession(session)
      },
      actionCount: recordedActionCount,
    },
    // Background export with no dialog, for a script or an agent driving
    // through `execute_command`. Everything ambient an export job snapshots —
    // palette, blend, timeline, recorded session, audio wiring — is filled in
    // here exactly as the export modal fills it, so a scripted render and a
    // clicked one produce the same file. See commands/builtins/export.ts.
    exportJobs: {
      renderImage: (request) => {
        const frame = timeline.currentFrame()
        const flame = deepClone(flameDescriptor)
        const tracks = deepClone(timeline.tracks())
        const config = deepClone(timeline.config())
        const hasAnimation = tracks.some((track) => track.keyframes.length > 0)
        // The modal exports the frame you are looking at; a script that seeked
        // there expects the same, so the timeline is baked in the same way.
        if (hasAnimation) {
          applyTimelineToFlameAtFrame(timeline, flame, frame)
        }
        enqueueImageJob({
          name: flame.metadata?.name?.trim() || 'flame',
          flame,
          // The document, not the frame: `flame` above may carry the timeline
          // baked at the current frame, and Recents should file what the user
          // authored, exactly as the export modal answers it.
          authoredFlame: deepClone(flameDescriptor),
          quality: request.quality,
          dimensions: { width: request.width, height: request.height },
          palette: selectedPalette(),
          blendFlame: blendFlame(),
          blendWeight: resolvedBlendWeight(),
          embedFlame: request.embedFlame,
          embedAnimation: hasAnimation,
          condenseHidden: false,
          tracks,
          config,
          session: snapshotExportSession(sessionForExport()),
        })
      },
      renderAnimation: (request) => {
        const tracks = deepClone(timeline.tracks())
        const config = deepClone(timeline.config())
        const { frameStart, frameEnd } = resolveExportFrameRange(
          request,
          tracks,
          config,
        )
        // The RAW flame: the job applies the timeline per frame itself.
        enqueueAnimationJob({
          name: flameDescriptor.metadata?.name?.trim() || 'flame',
          flame: deepClone(flameDescriptor),
          quality: request.quality,
          dimensions: { width: request.width, height: request.height },
          fps: request.fps,
          frameStart,
          frameEnd,
          playCount: 1,
          codec: request.codec,
          embedMetadata: true,
          palette: selectedPalette(),
          blendFlame: blendFlame(),
          blendWeight: resolvedBlendWeight(),
          tracks,
          config,
          session: snapshotExportSession(sessionForExport()),
          audioBuffer: audioBuffer(),
          audioMapping: audioMapping().mappings,
        })
      },
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

  useWorkspaceCommands(cmdContext)

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
  // After recorderTimeline, not before: the pre-extraction code recorded both
  // presets through it, and handing the hook the raw timeline instead silently
  // dropped Randomize and Smart Animation from session recordings.
  const { handleRandomizeAnimation, handleSmartAnimation } =
    useWorkspaceAnimationGen({
      timeline,
      recorderTimeline,
      flameDescriptor,
      getCmdContext: () => cmdContext,
      setAnimationEnabled,
      setIsRandomizingAnimation: (val) => {
        isRandomizingAnimation = val
      },
    })
  useWorkspaceShortcuts({
    getCmdContext: () => cmdContext,
    sidebarDiffView,
    closeSidebarDiff,
    toggleSidebarAsAuthoredAction,
    undoRouter,
    theme,
    setTheme,
    targetedParameter,
    recorderTimeline,
    timeline,
    showTimeline,
    animationEnabled,
  })

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

  const handlePaletteSelect = (palette: Palette) => {
    const nextRestoreColors =
      selectedPaletteId() === ''
        ? captureTransformColors(flameDescriptor)
        : prePaletteColors()

    withPaletteRestoreTransition(nextRestoreColors, 'Apply Palette', () => {
      executeCommand('flame.applyPalette', cmdContext, palette)
    })
  }

  const handlePaletteUnselect = () => {
    const restoreColors = prePaletteColors()
    withPaletteRestoreTransition({}, 'Remove Palette', () => {
      executeCommand('flame.removePalette', cmdContext, restoreColors)
    })
  }

  const { replayTarget, exportReplayVideo, prepareReplayFocus } =
    useWorkspaceReplay({
      flameDescriptor,
      setFlameDescriptor,
      history,
      timeline,
      setAnimationEnabled,
      animationEnabled,
      cmdContext,
      audio: {
        mapping: audioMapping,
        setMapping: setAudioMapping,
        enabled: audioEnabled,
        setEnabled: setAudioEnabled,
        source: audioSource,
        setSource: setAudioSource,
        trackName: audioTrackName,
        hasFileBuffer: () => audioBuffer() !== undefined,
        hasLiveAnalyzer: () => liveAnalyzer() !== undefined,
      },
      sonification: {
        captureSnapshot: captureSonificationSnapshot,
        loadSnapshot: loadSonificationSnapshot,
        lifecycle: sonificationLifecycle,
        enabled: sonificationEnabled,
        panelVisible: sonificationPanelVisible,
        keepPlayingWhenClosed: keepAudioPlayingWhenClosed,
        revealPanel: revealSonificationPanel,
      },
      view: {
        qualityPreset,
        setQualityPreset,
        pixelRatio,
        setPixelRatio,
        adaptiveFilterEnabled,
        setAdaptiveFilterEnabled,
        stochasticFilterEnabled,
        setStochasticFilterEnabled,
        flyMode,
        setFlyMode,
        showTimeline,
        setShowTimeline,
        showSidebar,
        setShowSidebar,
        prePaletteColors,
        setPrePaletteColors,
      },
      presentation: {
        sidebarHidden,
        setSidebarHidden,
        selectedTransformId,
        setSelectedTransformId,
        collapsedTransforms,
        setCollapsedTransforms,
        timelineCollapsed,
        setTimelineCollapsed,
        sidebarDiffView,
        setSidebarDiffView,
        showBlendGallery,
        setShowBlendGallery,
        showAudioPanel,
        setShowAudioPanel,
        showSonificationPanel,
        setShowSonificationPanel,
        quickPickState,
        setQuickPickState,
        hoveredVariationType,
        setHoveredVariationType,
        affineCardOpen,
        setAffineCardOpen,
        colorCardOpen,
        setColorCardOpen,
        metadataCardOpen,
        setMetadataCardOpen,
        paletteCardOpen,
        setPaletteCardOpen,
        renderCardOpen,
        setRenderCardOpen,
        symmetryCardOpen,
        setSymmetryCardOpen,
        floatingActionsCollapsed,
        setFloatingActionsCollapsed,
        replayAffineModeRequest,
        setReplayAffineModeRequest,
        replayColorViewRequest,
        setReplayColorViewRequest,
      },
      revealSidebar,
      openRandomizerCard,
      handlePreviewBlend,
      setHoveredBlendName,
      showToast,
      withReplayDeferredEffects,
      withRecordingSuppressed,
      invalidateLastFinishedSession,
      setReplaySuspendsAudioModulation,
      setReplayPreservesSonificationOutput,
    })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runTourCommand.fn = (id, ...args: any[]) => {
    executeCommand(id, cmdContext, ...args)
  }

  /**
   * One More list for the editor's two shells (components/Shell/moreMenuItems.ts):
   * the phone's top bar carries it, and now so does the tablet's navigation
   * rail, which had no More at all - so Library on a landscape tablet reached
   * neither the Arcade nor Share link, Export options, Advanced tools,
   * Documentation nor the benchmark until you went back to Create. Settings
   * keeps its own item on the rail as well; a tablet reaches for it there.
   */
  const moreHandlers: MoreMenuHandlers = {
    onSaveForLater: () => {
      void saveFlameForLater()
    },
    onOpenExportModal: () => {
      executeCommand('export.png', cmdContext)
    },
    onShare: () => {
      void showShareLinkModal()
    },
    onOpenDrawer: () => {
      setTouchDrawerOpen(true)
    },
    onOpenSettings: () => {
      void showHelp()
    },
    onOpenDocs: () => {
      void showDocumentation()
    },
    onOpenBenchmark: () => {
      void showBenchmark()
    },
    // The Benchmark Lab is a page of its own and web only (DESIGN.md,
    // decision 1), so the native app is not offered it.
    onOpenBenchmarkLab: IS_NATIVE
      ? undefined
      : () => {
          window.location.assign(BENCHMARKS_PATH)
        },
    onDesktopLayout: () => {
      setTouchLayoutPreference('desktop')
      showToast('Switched to the desktop layout', 3500)
    },
  }

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
        <Dropzone
          class={`${ui.layout} ${railLayout() ? ui.phoneLayout : ''} ${isTablet() && deckFits() ? ui.tabletLayout : ''}`}
          onDrop={onDrop}
        >
          <>
            <CanvasViewport
              isMobile={isMobile}
              showSidebar={showSidebar}
              hideMobileSidebarToggle={isPhone() || isTablet()}
              railInset={railInset}
              onCanvasClick={() => {
                // Tap canvas to close sidebar on mobile
                if (isMobile()) hideMobileSidebarAsAuthoredAction()
              }}
              onToggleMobileSidebar={toggleMobileSidebarAsAuthoredAction}
              flameDescriptor={flameDescriptor}
              effectiveFlame={renderedFlame}
              canvasPixelRatio={canvasPixelRatio}
              exportDimensions={exportDimensions}
              qualityPreset={qualityPreset}
              qualityPresets={qualityPresets}
              adaptiveFilterEnabled={adaptiveFilterEnabled}
              stochasticFilterEnabled={stochasticFilterEnabled}
              animationEnabled={animationEnabled}
              finalRenderInterval={finalRenderInterval}
              onExportImage={onExportImage}
              theme={theme}
              selectedPalette={selectedPalette}
              blendFlame={blendFlame}
              resolvedBlendWeight={resolvedBlendWeight}
              isPlaying={timeline.isPlaying}
              effectiveZoom={effectiveZoom}
              setFlameZoom={setFlameZoom}
              effectivePosition={effectivePosition}
              setFlamePosition={setFlamePosition}
              effectiveTheta={effectiveTheta}
              setFlameTheta={setFlameTheta}
              effectivePhi={effectivePhi}
              setFlamePhi={setFlamePhi}
              effectiveRadius={effectiveRadius}
              setFlameRadius={setFlameRadius}
              effectiveTarget3D={effectiveTarget3D}
              setFlameTarget3D={setFlameTarget3D}
              effectiveFov={effectiveFov}
              setFlameFov={setFlameFov}
              effectiveRoll={effectiveRoll}
              setFlameRoll={setFlameRoll}
              flyMode={flyMode}
              flySpeed={flySpeed}
              hoveredVariationType={hoveredVariationType}
              hoveredCustomVarDef={hoveredCustomVarDef}
              hoveredBlendName={hoveredBlendName}
              effectiveRotation={effectiveRotation}
            >
              <Show when={!isPhone() && !isTablet()}>
                <WorkspaceBottomBar
                  isMobile={isMobile}
                  flameDescriptor={flameDescriptor}
                  effectiveFlame={effectiveFlame}
                  captureRecorderStartExtras={captureRecorderStartExtras}
                  replayTarget={replayTarget}
                  prepareReplayFocus={prepareReplayFocus}
                  replaySession={replaySession}
                  openReplaySession={openReplaySession}
                  externalSessionLibraryRevision={
                    externalSessionLibraryRevision
                  }
                  exportReplayVideo={exportReplayVideo}
                  recorderReplayPresentation={recorderReplayPresentation}
                  setRecorderReplayPresentation={setRecorderReplayPresentation}
                  effectiveZoom={effectiveZoom}
                  setFlameZoom={setFlameZoom}
                  effectivePosition={effectivePosition}
                  setFlamePosition={setFlamePosition}
                  effectiveTheta={effectiveTheta}
                  setFlameTheta={setFlameTheta}
                  effectivePhi={effectivePhi}
                  setFlamePhi={setFlamePhi}
                  effectiveRadius={effectiveRadius}
                  setFlameRadius={setFlameRadius}
                  effectiveFov={effectiveFov}
                  setFlameFov={setFlameFov}
                  flyMode={flyMode}
                  flySpeed={flySpeed}
                  pixelRatio={pixelRatio}
                  setPixelRatio={(ratio) => {
                    const next =
                      typeof ratio === 'function' ? ratio(pixelRatio()) : ratio
                    executeCommand('view.setPixelRatio', cmdContext, next)
                    return next
                  }}
                  onUndo={() => {
                    executeCommand('history.undo', cmdContext)
                  }}
                  onRedo={() => {
                    executeCommand('history.redo', cmdContext)
                  }}
                  canUndo={undoRouter.canUndo}
                  canRedo={undoRouter.canRedo}
                  blendFlame={blendFlame}
                  resolvedBlendWeight={resolvedBlendWeight}
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
                  showTimeline={showTimeline}
                  timeline={timeline}
                  timelineCollapsed={timelineCollapsed}
                  setTimelineCollapsed={setTimelineCollapsed}
                  readableIds={readableIds}
                  openAnimationGenerator={openAnimationGenerator}
                  onSetAutoKeyframe={(enabled) => {
                    executeCommand(
                      'timeline.setAutoKeyframe',
                      cmdContext,
                      enabled,
                    )
                  }}
                />
              </Show>
            </CanvasViewport>
          </>
          {/* The rail layout: the phone, and a tablet under the deck's width.
              Home and the Arcade hub already cover these completely, so they
              stay mounted while a destination is up. Gating on visibility
              bought nothing and cost a full rebuild of TouchHUD, the rail and
              the capsule on every round trip - a getComputedStyle at mount,
              listeners re-bound, the chip row reset to Variations, an open
              sheet rebuilding every preview canvas, and the canvas re-panning
              because the unmount reports a covered height of 0 - all of it
              synchronously inside the edge swipe's pointermove. */}
          <Show when={railLayout()}>
            <TouchHUD
              ctx={cmdContext}
              flame={effectiveFlame}
              canUndo={undoRouter.canUndo}
              canRedo={undoRouter.canRedo}
              onUndo={() => {
                executeCommand('history.undo', cmdContext)
              }}
              onRedo={() => {
                executeCommand('history.redo', cmdContext)
              }}
              onPickGallery={pickGalleryFlame}
              {...moreHandlers}
            />
            <EditorRail
              ctx={cmdContext}
              flame={effectiveFlame}
              onRandomize={() => {
                executeCommand('flame.randomize', cmdContext)
              }}
              onMutate={() => {
                executeCommand('flame.mutate', cmdContext)
              }}
              onQuickExport={quickExport}
              onOpenExportOptions={() => {
                executeCommand('export.png', cmdContext)
              }}
              onOpenDrawer={() => setTouchDrawerOpen(true)}
              onCoveredHeightChange={setRailInset}
              leading={
                <ShellBar
                  mode="capsule"
                  current={() => 'create'}
                  onSelect={goToDestination}
                />
              }
            />
          </Show>

          {/* Tablet Split Touch Interface */}
          <Show when={isTablet() && deckFits()}>
            {/* The shell, permanent on the leading edge. Only the deck layout
                has the width for it; the rail layout docks the capsule in the
                editor rail instead. */}
            <NavRail
              current={shellDestination}
              onSelect={goToDestination}
              onOpenSettings={() => {
                void showHelp()
              }}
              more={moreHandlers}
            />
            <TabletInspectorDeck
              ctx={cmdContext}
              flame={effectiveFlame}
              canUndo={undoRouter.canUndo}
              canRedo={undoRouter.canRedo}
              onRandomize={() => {
                executeCommand('flame.randomize', cmdContext)
              }}
              onMutate={() => {
                executeCommand('flame.mutate', cmdContext)
              }}
              onUndo={() => {
                executeCommand('history.undo', cmdContext)
              }}
              onRedo={() => {
                executeCommand('history.redo', cmdContext)
              }}
              onSnapshot={quickExport}
              onOpenExportOptions={() => {
                executeCommand('export.png', cmdContext)
              }}
              onOpenDrawer={() => setTouchDrawerOpen(true)}
              onPickGallery={pickGalleryFlame}
            />
          </Show>

          {/* Touch Advanced Tools Drawer */}
          <AdvancedToolsDrawer
            open={touchDrawerOpen()}
            onClose={() => setTouchDrawerOpen(false)}
            onPickGallery={pickGalleryFlame}
            onSwitchToDesktop={() => {
              setTouchLayoutPreference('desktop')
              showToast(
                'Switched to Desktop Layout. Switch back anytime from the menu.',
                4000,
              )
            }}
            onArtDirector={openArtDirectorUI}
            onFlameClash={openFlameClashUI}
            onBreed={() => {
              if (isTouchLayout()) {
                setTouchLayoutPreference('desktop')
                showToast(
                  'Switched to Desktop Layout for Breeding & Genetics',
                  3500,
                )
              }
              pickBreedFlame()
            }}
            onAudio={() => {
              if (isTouchLayout()) {
                setTouchLayoutPreference('desktop')
                showToast('Switched to Desktop Layout for Audio Reactive', 3500)
              }
              setShowBlendGallery(false)
              closeSonificationPanelAsAuthoredAction()
              setShowAudioPanel(true)
            }}
            onSonification={() => {
              if (isTouchLayout()) {
                setTouchLayoutPreference('desktop')
                showToast('Switched to Desktop Layout for Sonification', 3500)
              }
              setShowBlendGallery(false)
              setShowAudioPanel(false)
              setShowSonificationPanel(true)
            }}
            onTimelineToggle={() => {
              if (isTouchLayout()) {
                setTouchLayoutPreference('desktop')
                showToast('Switched to Desktop Layout for Timeline', 3500)
              }
              const current = showTimeline()
              executeCommand('view.setShowTimeline', cmdContext, !current)
            }}
            onExportPng={() => {
              executeCommand('export.png', cmdContext)
            }}
          />

          {/* Development only. The gate was dropped in 53e1486 and the panel
              has been rendering over the top-left of the canvas in production
              ever since, on every visit, with no way for a visitor to close
              it. */}
          <Show when={IS_DEV}>
            <DebugOverlay
              animationEnabled={animationEnabled()}
              flameDescriptor={flameDescriptor}
            />
          </Show>

          <Show when={!isPhone() && !isTablet()}>
            <WorkspaceSidebar
              showSidebar={showSidebar}
              isPlaying={timeline.isPlaying}
              sidebarHidden={sidebarHidden}
              setSidebarHidden={setSidebarHidden}
              duelShowing={duelShowing}
              duelSidebarOpen={duelSidebarOpen}
              sidebarWidth={sidebarWidth}
              sideBarResizable={SIDEBAR_RESIZABLE}
              startSidebarDrag={startSidebarDrag}
              animationExportRunning={animationExportRunning}
              onTogglePlay={() => {
                recorderTimeline.togglePlay()
              }}
              onForceAnimationExportNow={() => setForceAnimationExportNow(true)}
              animationExportCancel={animationExportCancel}
              isMobile={isMobile}
              hideMobileSidebarAsAuthoredAction={
                hideMobileSidebarAsAuthoredAction
              }
              setSidebarEl={setSidebarEl}
              sidebarDiffView={sidebarDiffView}
              closeSidebarDiff={closeSidebarDiff}
              showBlendGallery={showBlendGallery}
              setShowBlendGallery={setShowBlendGallery}
              showAudioPanel={showAudioPanel}
              setShowAudioPanel={setShowAudioPanel}
              showSonificationPanel={showSonificationPanel}
              closeSonificationPanelAsAuthoredAction={
                closeSonificationPanelAsAuthoredAction
              }
              sonificationEnabled={sonificationEnabled}
              sonificationConfig={sonificationConfig}
              keepAudioPlayingWhenClosed={keepAudioPlayingWhenClosed}
              setKeepPlayingWhenClosedAsAuthoredAction={
                setKeepPlayingWhenClosedAsAuthoredAction
              }
              breakRecordingCoalescing={breakRecordingCoalescing}
              audioBuffer={audioBuffer}
              onAudioChange={adoptAudioBuffer}
              analysisProgress={analysisProgress}
              setPlaybackPaused={setPlaybackPaused}
              setSeekTarget={setSeekTarget}
              audioMapping={audioMapping}
              audioEnabled={audioEnabled}
              audioSource={audioSource}
              liveAnalyzer={liveAnalyzer}
              setLiveAnalyzer={setLiveAnalyzer}
              playbackPaused={playbackPaused}
              playbackTime={playbackTime}
              fileAnalyzer={fileAnalyzer}
              transformInfos={transformInfos}
              blendIntent={blendIntent}
              setupMorph={setupMorph}
              breedPreviewChild={breedPreviewChild}
              endBreedPreview={endBreedPreview}
              _requestModal={_requestModal}
              showToast={showToast}
              executeFlameLoad={executeFlameLoad}
              pickBreedFlame={pickBreedFlame}
              pickEvolveFlame={pickEvolveFlame}
              openDiffAsModal={openDiffAsModal}
              openDiffView={openDiffView}
              setBlendFlame={setBlendFlame}
              blendFlame={blendFlame}
              handlePreviewBlend={handlePreviewBlend}
              setHoveredBlendName={setHoveredBlendName}
              history={history}
              hardwareTier={props.hardwareTier}
              quickPickState={quickPickState}
              setQuickPickState={setQuickPickState}
              setHoveredVariationType={setHoveredVariationType}
              quickPickerMode={quickPickerMode}
              setQuickPickerMode={setQuickPickerMode}
              showVariationSelector={showVariationSelector}
              setFlameTheta={setFlameTheta}
              setFlamePhi={setFlamePhi}
              setFlameRadius={setFlameRadius}
              setFlameTarget3D={setFlameTarget3D}
              setFlameFov={setFlameFov}
              affineSectionProps={{
                open: affineCardOpen,
                onToggleOpen: () => setAffineCardOpen((open) => !open),
                transforms: flameDescriptor.transforms,
                setTransforms: (setFn) => {
                  setFlameDescriptor((draft) => {
                    setFn(draft.transforms)
                  })
                },
                setTransformAffine: (tid, which, affine, origin) => {
                  executeCommand(
                    'flame.setTransformAffine',
                    cmdContext,
                    tid,
                    which,
                    affine,
                    origin,
                  )
                },
                setAffineCoefficient: (tid, which, key, value) => {
                  executeCommand(
                    'flame.setAffine',
                    cmdContext,
                    tid,
                    which,
                    key,
                    value,
                  )
                },
                finalTransform:
                  flameDescriptor.finalTransform ??
                  ((flameDescriptor.renderSettings.dimensions ?? 2) === 3
                    ? {
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
                    : { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }),
                setFinalTransform: (affine, origin) => {
                  executeCommand(
                    'flame.setFinalTransform',
                    cmdContext,
                    affine,
                    origin,
                  )
                },
                setFinalAffineCoefficient: (key, value) => {
                  executeCommand('flame.setFinalAffine', cmdContext, key, value)
                },
                is3D: (flameDescriptor.renderSettings.dimensions ?? 2) === 3,
                selectedTransformId: selectedTransformId,
                setSelectedTransformId: setSelectedTransformId,
                replayModeRequest: replayAffineModeRequest,
                onEditorStateChange: (state) => {
                  setReplayAffineModeRequest((previous) =>
                    previous.mode === state.mode && previous.tab === state.tab
                      ? previous
                      : { ...state, epoch: previous.epoch + 1 },
                  )
                },
              }}
              colorAndPaletteSectionProps={{
                colorCardOpen: colorCardOpen,
                onToggleColorCardOpen: () => setColorCardOpen((open) => !open),
                paletteCardOpen: paletteCardOpen,
                onTogglePaletteCardOpen: () =>
                  setPaletteCardOpen((open) => !open),
                transforms: flameDescriptor.transforms,
                setTransforms: (setFn) => {
                  setFlameDescriptor((draft) => {
                    setFn(draft.transforms)
                  })
                },
                setTransformColor: (tid, x, y, origin) => {
                  executeCommand(
                    'flame.setTransformColor',
                    cmdContext,
                    tid,
                    x,
                    y,
                    origin,
                  )
                },
                selectedTransformId: selectedTransformId,
                setSelectedTransformId: setSelectedTransformId,
                replayColorViewRequest: replayColorViewRequest,
                onColorViewChange: (view) => {
                  setReplayColorViewRequest((previous) =>
                    previous.view === view
                      ? previous
                      : { view, epoch: previous.epoch + 1 },
                  )
                },
                selectedPaletteId: selectedPaletteId,
                handlePaletteSelect: handlePaletteSelect,
                handlePaletteUnselect: handlePaletteUnselect,
              }}
              customVariationsSectionProps={{
                is3D: flameDescriptor.renderSettings.dimensions === 3,
                customVariationsList: customVariationsList,
                hoveredCustomVarDef: hoveredCustomVarDef,
                setHoveredCustomVarDef: setHoveredCustomVarDef,
                onOpenCustomVariationEditor: (def) => {
                  void showCustomVariationEditor(def).then((addedDef) => {
                    if (addedDef) {
                      executeCommand(
                        'flame.addTransform',
                        cmdContext,
                        addedDef.id,
                      )
                    }
                    setCustomVarsVersion((v) => v + 1)
                  })
                },
                onAddTransform: (defId) => {
                  executeCommand('flame.addTransform', cmdContext, defId)
                },
                onShareVariationLink: (def) => {
                  void showShareVariationLinkModal(def)
                },
                onDuplicateCustomVariation: (id) => {
                  duplicateCustomVariation(id)
                  setCustomVarsVersion((v) => v + 1)
                },
                onDeleteCustomVariation: (def) => {
                  void handleDeleteCustomVariation(def)
                },
              }}
              randomizerSectionProps={{
                randomizerCardRef: (el) => {
                  randomizerCardRef = el
                },
                flame: flameDescriptor,
                open: randomizerOpen,
                onToggleOpen: () => setRandomizerOpen((v) => !v),
                expandAnimationEpoch: randomizerAnimEpoch,
                historyEntries: randomizerHistory,
                selectedTimestamp: selectedHistoryTimestamp,
                handleGenerateFlame: handleGenerateFlame,
                handleMutateFlame: handleMutateFlame,
                handleLoadHistory: handleLoadHistory,
                onClearHistory: handleClearHistory,
                onRandomizeAnimation: handleRandomizeAnimation,
                onSmartAnimation: handleSmartAnimation,
                handleUpdateRenderSettings: handleUpdateRenderSettings,
                onApplyCandidate: (candidateFlame, origin) => {
                  if (blendFlame())
                    showToast(
                      'Blend is still active — the loaded flame will look mixed',
                      4000,
                    )
                  executeFlameLoad(candidateFlame, 'Apply Random Flame', origin)
                },
                hardwareTier: props.hardwareTier,
                isBusy: isRandomizing,
              }}
              transformsSectionProps={{
                flameDescriptor: flameDescriptor,
                theme: theme,
                readableIds: readableIds,
                collapsedTransforms: collapsedTransforms,
                toggleTransformCollapsed: toggleTransformCollapsed,
                anyTransformOpen: anyTransformOpen,
                toggleCollapseAllTransforms: toggleCollapseAllTransforms,
                selectedTransformId: selectedTransformId,
                toggleSelectedTransform: toggleSelectedTransform,
                hideDiceButtons: hideDiceButtons,
                cmdContext: cmdContext,
                executeCommand: executeCommand,
                totalProbability: totalProbability,
                setTargetedParameter: setTargetedParameter,
                animationEnabled: animationEnabled,
                customStatus: customStatus,
                isMobile: isMobile,
                sidebarHidden: sidebarHidden,
                setSidebarHidden: setSidebarHidden,
                setQuickPickState: setQuickPickState,
                showVariationSelector: showVariationSelector,
                setFlameTheta: setFlameTheta,
                setFlamePhi: setFlamePhi,
                setFlameRadius: setFlameRadius,
                setFlameTarget3D: setFlameTarget3D,
                setFlameFov: setFlameFov,
                symmetryCardOpen: symmetryCardOpen,
                setSymmetryCardOpen: setSymmetryCardOpen,
                currentSymType: currentSymType,
                currentSymFolds: currentSymFolds,
                applySymmetry: applySymmetry,
                symTransformIds: symTransformIds,
                symTransforms: symTransforms,
                showMigrationModal: (flame) => {
                  void showMigrationModal(
                    structuredClone(JSON.parse(JSON.stringify(flame))),
                  )
                },
              }}
              renderSettingsSectionProps={{
                flameDescriptor: flameDescriptor,
                renderCardOpen: renderCardOpen,
                setRenderCardOpen: setRenderCardOpen,
                metadataCardOpen: metadataCardOpen,
                setMetadataCardOpen: setMetadataCardOpen,
                setTargetedParameter: setTargetedParameter,
                setRenderSetting: setRenderSetting,
                setRenderSettings: setRenderSettings,
                stochasticFilterEnabled: stochasticFilterEnabled,
                selectedPaletteId: selectedPaletteId,
                cmdContext: cmdContext,
                executeCommand: executeCommand,
              }}
            />
          </Show>
          <Show when={!showArena() && !isPhone() && !isTablet()}>
            <FloatingActions
              disabled={animationExportRunning()}
              initialLeft={floatingLeft()}
              initialTop={floatingTop()}
              onNewFlame={loadNewFlame}
              onLoadFlame={() => {
                if (timeline.isPlaying()) timeline.pause()
                // Unsaved work is flushed where the replacement happens
                // (replaceLoadedFlame), so every way into this dialog is
                // covered rather than only this button.
                void showLoadFlameModal()
              }}
              onSaveForLater={saveFlameForLater}
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
                  executeCommand(
                    'timeline.setAnimationEnabled',
                    cmdContext,
                    true,
                  )
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
              setDimensions={switchDimensions}
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
          </Show>
          <WorkspaceModalsHost
            tourContext={tourContext}
            cmdContext={cmdContext}
            prepareReplayFocus={prepareReplayFocus}
            showBenchmark={() => {
              void showBenchmark()
            }}
            showDocs={() => {
              void showDocumentation()
            }}
            showHelp={() => {
              void showHelp()
            }}
            devCrashTest={devCrashTest}
            touchLayoutPreference={touchLayoutPreference}
            setTouchLayoutPreference={setTouchLayoutPreference}
            isTouchLayout={isTouchLayout}
            /* Every touch layout, not just the ones with the rail. Gated on
               `railLayout` this hid on the phone and on a narrow tablet and
               showed on the one layout that also mounts the NavRail: the
               hamburger landed at 8,8 directly over the rail's Create and
               Library, offering a second copy of the same More list. */
            hideVersionTrigger={isTouchLayout}
            onPickGallery={pickGalleryFlame}
            duelShowing={duelShowing}
            playerFlame={renderedFlame}
            playerZoom={[effectiveZoom, setFlameZoom]}
            playerPosition={[effectivePosition, setFlamePosition]}
            playerCamera3D={{
              theta: [effectiveTheta, setFlameTheta],
              phi: [effectivePhi, setFlamePhi],
              radius: [effectiveRadius, setFlameRadius],
              target: [effectiveTarget3D, setFlameTarget3D],
              fov: [effectiveFov, setFlameFov],
              roll: [effectiveRoll, setFlameRoll],
            }}
            quality={qualityPresets[qualityPreset()]}
            adaptiveFilter={adaptiveFilterEnabled()}
            stochasticFilter={stochasticFilterEnabled()}
            sidebarWidthRem={sidebarWidth}
            showArena={showArena}
            arena={cmdContext.arena!}
            hardwareTier={props.hardwareTier}
            onCloseArena={() => {
              setShowArena(false)
            }}
          />
        </Dropzone>
      </TimelineContextProvider>
    </ChangeHistoryContextProvider>
  )
}
