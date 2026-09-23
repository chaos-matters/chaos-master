import { executeReplayCommand, preflightReplayCommand, } from '@/commands/registry'
import { qualityPresets } from '@/components/Quality/QualityPresets'
import { getGlideRuntime } from '@/flame/glide/runtime'
import { applyReplayAudioWiring, sessionMayEnableSonification, } from '@/recorder/replay'
import { captureReplayInterfaceVideo } from '@/recorder/replayInterfaceVideo'
import { paletteRestoreColorsAfterReplayCommand } from '@/recorder/replayPaletteState'
import { timelineReplayPlayback } from '@/recorder/replayPlayback'
import { normalizeReplayPresentation, replaySideStateChanged, } from '@/recorder/replaySideState'
import { createReplayVideoJobSpec, replayVideoFileName, } from '@/recorder/replayVideo'
import { shouldRevealSonificationAfterReplay } from '@/recorder/sonificationState'
import { downloadBlob } from '@/utils/blob'
import { deepClone } from '@/utils/clone'
import { enqueueAnimationJob } from '@/utils/exportJobs'
import type { Accessor, Setter } from 'solid-js'
import type { CommandContext } from '@/commands/types'
import type { QualityPreset } from '@/components/Quality/QualityPresets'
import type { AudioWiringSnapshot } from '@/flame/schema/audioWiring'
import type { FlameDescriptor, TransformId, VariationId, } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'
import type { ReplayAffineMode, ReplayAffineTab, ReplayColorView, ReplayFocusPreparationHandler, } from '@/recorder/focusPreparation'
import type { ReplayTarget } from '@/recorder/replay'
import type { ReplayVideoExportRequest } from '@/recorder/replayInterfaceVideo'
import type { TransformColorSnapshot } from '@/recorder/replayPaletteState'
import type { ReplayNonFlameSideState, ReplayPresentationSnapshot, } from '@/recorder/replaySideState'
import type { SessionViewSnapshot } from '@/recorder/schema'
import type { SonificationSnapshot } from '@/recorder/sonificationState'
import type { QuickPickState } from '@/stores/workspaceSelectionStore'
import type { HistoryPreviewOwner } from '@/utils/createStoreHistory'
import type { TimelineState } from '@/utils/timeline'

export type ReplaySideState = ReplayNonFlameSideState & {
  flame: FlameDescriptor
}

export interface UseWorkspaceReplayParams {
  flameDescriptor: FlameDescriptor
  setFlameDescriptor: (
    updater: (draft: FlameDescriptor) => FlameDescriptor,
    label?: string,
  ) => void
  history: {
    replaceSilently: (flame: FlameDescriptor) => void
    startOwnedPreview: (
      label: string | undefined,
      onTakeover: () => void,
    ) => HistoryPreviewOwner
    withPreviewOwner: <T>(owner: HistoryPreviewOwner, fn: () => T) => T
    commitOwnedPreview: (
      owner: HistoryPreviewOwner,
      options?: {
        force?: boolean
        undoEffect?: () => void
        redoEffect?: () => void
      },
    ) => void
  }
  timeline: TimelineState
  setAnimationEnabled: Setter<boolean>
  animationEnabled: Accessor<boolean>
  cmdContext: CommandContext

  // Audio wiring
  audio: {
    mapping: Accessor<AudioWiringSnapshot['mapping']>
    setMapping: Setter<AudioWiringSnapshot['mapping']>
    enabled: Accessor<boolean>
    setEnabled: Setter<boolean>
    source: Accessor<'file' | 'mic'>
    setSource: Setter<'file' | 'mic'>
    trackName: Accessor<string | undefined>
    hasFileBuffer: () => boolean
    hasLiveAnalyzer: () => boolean
  }

  // Sonification
  sonification: {
    captureSnapshot: () => SonificationSnapshot
    loadSnapshot: (snapshot: SonificationSnapshot, restart?: boolean) => void
    lifecycle: { prime: () => void }
    enabled: Accessor<boolean>
    panelVisible: () => boolean
    keepPlayingWhenClosed: () => boolean
    revealPanel: () => void
  }

  // View state
  view: {
    qualityPreset: Accessor<string>
    setQualityPreset: Setter<QualityPreset>
    pixelRatio: Accessor<number>
    setPixelRatio: Setter<number>
    adaptiveFilterEnabled: Accessor<boolean>
    setAdaptiveFilterEnabled: Setter<boolean>
    stochasticFilterEnabled: Accessor<boolean>
    setStochasticFilterEnabled: Setter<boolean>
    flyMode: Accessor<boolean>
    setFlyMode: Setter<boolean>
    showTimeline: Accessor<boolean>
    setShowTimeline: Setter<boolean>
    showSidebar: Accessor<boolean>
    setShowSidebar: Setter<boolean>
    prePaletteColors: Accessor<TransformColorSnapshot>
    setPrePaletteColors: Setter<TransformColorSnapshot>
  }

  // Presentation state
  presentation: {
    sidebarHidden: Accessor<boolean>
    setSidebarHidden: Setter<boolean>
    selectedTransformId: Accessor<string | null>
    setSelectedTransformId: Setter<string | null>
    collapsedTransforms: Accessor<Set<string>>
    setCollapsedTransforms: Setter<Set<string>>
    timelineCollapsed: Accessor<boolean>
    setTimelineCollapsed: Setter<boolean>
    sidebarDiffView: Accessor<{
      flameA: FlameDescriptor
      flameB: FlameDescriptor
    } | null>
    setSidebarDiffView: Setter<{
      flameA: FlameDescriptor
      flameB: FlameDescriptor
    } | null>
    showBlendGallery: Accessor<boolean>
    setShowBlendGallery: Setter<boolean>
    showAudioPanel: Accessor<boolean>
    setShowAudioPanel: Setter<boolean>
    showSonificationPanel: Accessor<boolean>
    setShowSonificationPanel: Setter<boolean>
    quickPickState: Accessor<QuickPickState | null>
    setQuickPickState: Setter<QuickPickState | null>
    hoveredVariationType: Accessor<string | null>
    setHoveredVariationType: Setter<string | null>
    affineCardOpen: Accessor<boolean>
    setAffineCardOpen: Setter<boolean>
    colorCardOpen: Accessor<boolean>
    setColorCardOpen: Setter<boolean>
    metadataCardOpen: Accessor<boolean>
    setMetadataCardOpen: Setter<boolean>
    paletteCardOpen: Accessor<boolean>
    setPaletteCardOpen: Setter<boolean>
    renderCardOpen: Accessor<boolean>
    setRenderCardOpen: Setter<boolean>
    symmetryCardOpen: Accessor<boolean>
    setSymmetryCardOpen: Setter<boolean>
    floatingActionsCollapsed: Accessor<boolean>
    setFloatingActionsCollapsed: Setter<boolean>
    replayAffineModeRequest: Accessor<{
      mode: ReplayAffineMode
      tab: ReplayAffineTab
      epoch: number
    }>
    setReplayAffineModeRequest: Setter<{
      mode: ReplayAffineMode
      tab: ReplayAffineTab
      epoch: number
    }>
    replayColorViewRequest: Accessor<{
      view: ReplayColorView
      epoch: number
    }>
    setReplayColorViewRequest: Setter<{
      view: ReplayColorView
      epoch: number
    }>
  }

  // Workspace actions
  revealSidebar: () => void
  openRandomizerCard: (options: {
    expandAnimation?: boolean
    preserveSonificationOutput?: boolean
  }) => void
  handlePreviewBlend: (flame: FlameDescriptor | null) => void
  setHoveredBlendName: Setter<string | null>
  showToast: (message: string, duration?: number | 'sticky') => void
  withReplayDeferredEffects: <T>(fn: () => T) => T
  withRecordingSuppressed: (fn: () => void) => void
  invalidateLastFinishedSession: () => void
  setReplaySuspendsAudioModulation: Setter<boolean>
  setReplayPreservesSonificationOutput: Setter<boolean>
}

/** Whether a replay's export steps queue real renders: never (REQ-RR-048).
 *  The one place that decides it, where an automation opt-in would plug in. */
const replayRunsExports = (): boolean => false

export function useWorkspaceReplay(params: UseWorkspaceReplayParams) {
  const {
    flameDescriptor,
    setFlameDescriptor,
    history,
    timeline,
    setAnimationEnabled,
    animationEnabled,
    cmdContext,
    audio,
    sonification,
    view,
    presentation,
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
  } = params

  const captureReplayPresentation = (): ReplayPresentationSnapshot => {
    const affine = presentation.replayAffineModeRequest()
    const diffView = presentation.sidebarDiffView()
    return {
      sidebarHidden: presentation.sidebarHidden(),
      selectedTransformId: presentation.selectedTransformId(),
      collapsedTransformIds: Array.from(
        presentation.collapsedTransforms(),
      ).sort(),
      timelineCollapsed: presentation.timelineCollapsed(),
      sidebarDiffView: diffView === null ? null : deepClone(diffView),
      showBlendGallery: presentation.showBlendGallery(),
      showAudioPanel: presentation.showAudioPanel(),
      showSonificationPanel: presentation.showSonificationPanel(),
      quickPickState: presentation.quickPickState(),
      hoveredVariationType: presentation.hoveredVariationType(),
      affineCardOpen: presentation.affineCardOpen(),
      colorCardOpen: presentation.colorCardOpen(),
      metadataCardOpen: presentation.metadataCardOpen(),
      paletteCardOpen: presentation.paletteCardOpen(),
      prePaletteColors: deepClone(view.prePaletteColors()),
      renderCardOpen: presentation.renderCardOpen(),
      floatingActionsCollapsed: presentation.floatingActionsCollapsed(),
      affineMode: affine.mode,
      affineTab: affine.tab,
      colorView: presentation.replayColorViewRequest().view,
    }
  }

  const captureReplayNonFlameSideState = (
    pres = captureReplayPresentation(),
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
      mapping: deepClone(audio.mapping()),
      enabled: audio.enabled(),
      source: audio.source(),
      trackName: audio.trackName(),
    },
    sonification: sonification.captureSnapshot(),
    view: {
      qualityPreset: view.qualityPreset(),
      pixelRatio: view.pixelRatio() as 1 | 0.5 | 0.25,
      adaptiveFilter: view.adaptiveFilterEnabled(),
      stochasticFilter: view.stochasticFilterEnabled(),
      flyMode: view.flyMode(),
      showTimeline: view.showTimeline(),
      sidebarOpen: view.showSidebar(),
    },
    presentation: pres,
  })

  const captureReplaySideState = (
    pres = captureReplayPresentation(),
  ): ReplaySideState => ({
    flame: deepClone(flameDescriptor),
    ...captureReplayNonFlameSideState(pres),
  })

  const applyReplayAudioState = (audioSnapshot: AudioWiringSnapshot) => {
    applyReplayAudioWiring(
      audioSnapshot,
      {
        hasFileBuffer: audio.hasFileBuffer(),
        currentTrackName: audio.trackName(),
        hasLiveAnalyzer: audio.hasLiveAnalyzer(),
      },
      {
        setMapping: audio.setMapping,
        setSource: audio.setSource,
        setEnabled: audio.setEnabled,
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
      view.setQualityPreset(state.view.qualityPreset as QualityPreset)
    }
    if (state.view.pixelRatio !== undefined) {
      view.setPixelRatio(state.view.pixelRatio)
    }
    view.setAdaptiveFilterEnabled(state.view.adaptiveFilter)
    view.setStochasticFilterEnabled(state.view.stochasticFilter)
    view.setFlyMode(state.view.flyMode)
    view.setShowTimeline(state.view.showTimeline)
    view.setShowSidebar(state.view.sidebarOpen)

    history.replaceSilently(state.flame)

    const pres = normalizeReplayPresentation(state.presentation, state.flame)
    presentation.setSidebarHidden(pres.sidebarHidden)
    presentation.setSelectedTransformId(pres.selectedTransformId)
    presentation.setCollapsedTransforms(
      new Set<string>(pres.collapsedTransformIds),
    )
    presentation.setTimelineCollapsed(pres.timelineCollapsed)
    presentation.setSidebarDiffView(
      pres.sidebarDiffView === null ? null : deepClone(pres.sidebarDiffView),
    )
    presentation.setShowBlendGallery(pres.showBlendGallery)
    presentation.setShowAudioPanel(pres.showAudioPanel)
    presentation.setShowSonificationPanel(pres.showSonificationPanel)
    presentation.setQuickPickState(
      pres.quickPickState === null
        ? null
        : {
            tid: pres.quickPickState.tid as TransformId,
            vid: pres.quickPickState.vid as VariationId,
            type: pres.quickPickState.type,
          },
    )
    presentation.setHoveredVariationType(pres.hoveredVariationType)
    presentation.setAffineCardOpen(pres.affineCardOpen)
    presentation.setColorCardOpen(pres.colorCardOpen)
    presentation.setMetadataCardOpen(pres.metadataCardOpen)
    presentation.setPaletteCardOpen(pres.paletteCardOpen)
    view.setPrePaletteColors(deepClone(pres.prePaletteColors))
    presentation.setRenderCardOpen(pres.renderCardOpen)
    presentation.setFloatingActionsCollapsed(pres.floatingActionsCollapsed)
    presentation.setReplayAffineModeRequest((previous) => ({
      mode: pres.affineMode,
      tab: pres.affineTab,
      epoch: previous.epoch + 1,
    }))
    presentation.setReplayColorViewRequest((previous) => ({
      view: pres.colorView,
      epoch: previous.epoch + 1,
    }))
    sonification.loadSnapshot(state.sonification, false)
  }

  let replayBatchStart: ReplaySideState | undefined
  let replayPreviewOwner: HistoryPreviewOwner | undefined
  let replayPresentationBeforePrepare: ReplayPresentationSnapshot | undefined

  const prepareReplayFocus: ReplayFocusPreparationHandler = (prep) => {
    if (prep.timeline) {
      view.setShowTimeline(true)
      if (prep.timeline.expand) presentation.setTimelineCollapsed(false)
    }
    if (prep.sidebar) {
      revealSidebar()
      presentation.setQuickPickState(null)
      presentation.setHoveredVariationType(null)
      if (prep.audioPanel) presentation.setShowAudioPanel(true)
      if (prep.sonificationPanel) {
        sonification.revealPanel()
      }
    }

    if (prep.clearTransformSelection) {
      presentation.setSelectedTransformId(null)
    } else if (prep.transform) {
      const transformId = prep.transform.id
      presentation.setSelectedTransformId(transformId)
      presentation.setCollapsedTransforms((previous) => {
        if (!previous.has(transformId)) return previous
        const next = new Set(previous)
        next.delete(transformId)
        return next
      })
    }

    if (prep.editorSurface === 'affine') {
      presentation.setAffineCardOpen(true)
    } else if (prep.editorSurface === 'color') {
      presentation.setColorCardOpen(true)
    } else if (prep.editorSurface === 'metadata') {
      presentation.setMetadataCardOpen(true)
    } else if (prep.editorSurface === 'palette') {
      presentation.setPaletteCardOpen(true)
    } else if (prep.editorSurface === 'render') {
      presentation.setRenderCardOpen(true)
    } else if (prep.editorSurface === 'randomizer') {
      const expandAnimation = [
        'ui:random-animation',
        'ui:smart-animation',
        'ui:animation-colors',
        'ui:animation-presets',
        'ui:animation-clear',
      ].includes(prep.spotlightFocus ?? '')
      openRandomizerCard({
        expandAnimation,
        preserveSonificationOutput: true,
      })
    }
    if (prep.symmetryCard) {
      presentation.setSymmetryCardOpen(true)
    }
    if (prep.floatingActions) presentation.setFloatingActionsCollapsed(false)

    if (prep.colorView) {
      presentation.setReplayColorViewRequest((previous) => ({
        view: prep.colorView!,
        epoch: previous.epoch + 1,
      }))
    }

    if (prep.affineMode || prep.affineTab) {
      presentation.setReplayAffineModeRequest((previous) => ({
        mode: prep.affineMode ?? previous.mode,
        tab: prep.affineTab ?? 'grid',
        epoch: previous.epoch + 1,
      }))
    }
  }

  /**
   * The workspace's commands as a replay runs them, with a modal that opens
   * nothing and no export host: replayed live, a take's `export.png` opened
   * the dialog over the replay (and a full-interface export's video), and a
   * hand-written `export.renderImage` queued a real render. The step still
   * runs, spotlight and all, like the worlds of replayVideo.ts and sandbox.ts.
   */
  const replayContext = (): CommandContext => ({
    ...cmdContext,
    modal: { open: () => {} },
    exportJobs: replayRunsExports() ? cmdContext.exportJobs : undefined,
  })

  const replayTarget: ReplayTarget = {
    // The replay moves the playhead through a take's play windows at the pace
    // they were recorded at, rather than on the timeline's own clock.
    playback: timelineReplayPlayback(timeline),
    readFlame: () => deepClone(flameDescriptor),
    glide: (from, durationMs) => {
      void getGlideRuntime()?.glideFrom(from, { durationMs })
    },
    settleGlide: () => getGlideRuntime()?.settleForNextChange(),
    primeEffects: (session) => {
      if (sessionMayEnableSonification(session)) {
        sonification.lifecycle.prime()
      }
    },
    prepare: () => {
      replayPresentationBeforePrepare = captureReplayPresentation()
      handlePreviewBlend(null)
      setHoveredBlendName(null)
      presentation.setShowBlendGallery(false)
    },
    loadInitial: (flame: FlameDescriptor) => {
      // Every take starts paused, so a rebuild (a seek back, a restart) must
      // not keep playing what a later `timeline.setPlaying` step started.
      // Rebuilds run suppressed, so this pause is not a step of anything.
      if (timeline.isPlaying()) timeline.pause()
      view.setPrePaletteColors({})
      setFlameDescriptor(() => deepClone(flame), 'Replay: initial state')
    },
    loadTimeline: (data: TimelineSnapshot) => {
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
    loadAudio: (audioState: AudioWiringSnapshot) => {
      applyReplayAudioState(audioState)
    },
    loadSonification: sonification.loadSnapshot,
    loadView: (viewState: SessionViewSnapshot) => {
      if (viewState.qualityPreset in qualityPresets) {
        view.setQualityPreset(viewState.qualityPreset as QualityPreset)
      }
      if (viewState.pixelRatio !== undefined) {
        view.setPixelRatio(viewState.pixelRatio)
      }
      view.setAdaptiveFilterEnabled(viewState.adaptiveFilter)
      view.setStochasticFilterEnabled(viewState.stochasticFilter)
      view.setFlyMode(viewState.flyMode)
      view.setShowTimeline(viewState.showTimeline)
      view.setShowSidebar(viewState.sidebarOpen)
      view.setPrePaletteColors(deepClone(viewState.paletteRestoreColors ?? {}))
    },
    execute: (id: string, args: unknown[]) => {
      const currentPaletteColors = view.prePaletteColors()
      const nextPaletteColors = paletteRestoreColorsAfterReplayCommand(
        id,
        args,
        flameDescriptor,
        currentPaletteColors,
      )
      const accepted = executeReplayCommand(id, replayContext(), ...args)
      if (accepted && nextPaletteColors !== currentPaletteColors) {
        view.setPrePaletteColors(nextPaletteColors)
      }
      return accepted
    },
    preflight: preflightReplayCommand,
    beginBatch: (onTakeover?: () => void) => {
      invalidateLastFinishedSession()
      setReplaySuspendsAudioModulation(true)
      setReplayPreservesSonificationOutput(true)
      replayBatchStart = captureReplaySideState(replayPresentationBeforePrepare)
      replayPresentationBeforePrepare = undefined
      if (timeline.isPlaying()) timeline.pause()
      timeline.beginTransientHistory()
      replayPreviewOwner = history.startOwnedPreview(
        'Replay',
        onTakeover ?? (() => {}),
      )
    },
    withBatchWrite: <T>(fn: () => T): T => {
      const owner = replayPreviewOwner
      if (owner === undefined) return fn()
      return history.withPreviewOwner(owner, fn)
    },
    withDeferredEffects: withReplayDeferredEffects,
    endBatch: () => {
      const owner = replayPreviewOwner
      replayPreviewOwner = undefined
      const before = replayBatchStart
      if (
        shouldRevealSonificationAfterReplay({
          enabled: sonification.enabled(),
          panelVisible: sonification.panelVisible(),
          keepPlayingWhenClosed: sonification.keepPlayingWhenClosed(),
        })
      ) {
        sonification.revealPanel()
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
          createReplayVideoJobSpec(
            request.session,
            request.playbackSpeed,
            request.glide,
          ),
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

  return {
    captureReplayPresentation,
    captureReplayNonFlameSideState,
    captureReplaySideState,
    applyReplayAudioState,
    restoreReplaySideState,
    prepareReplayFocus,
    replayTarget,
    exportReplayVideo,
  }
}
