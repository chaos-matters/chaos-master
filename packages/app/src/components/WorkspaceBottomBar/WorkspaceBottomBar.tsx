import { Show } from 'solid-js'
import ui from '@/App.module.css'
import { agentDriving } from '@/arcade/pilot'
import { OrientationGizmo } from '@/components/OrientationGizmo/OrientationGizmo'
import { recorderVisible } from '@/components/SessionRecorder/recorderUi'
import { SessionRecorderDock } from '@/components/SessionRecorder/SessionRecorderDock'
import { TimelineSection } from '@/components/Timeline/TimelineSection'
import { ViewControls } from '@/components/ViewControls/ViewControls'
import { animationExportRunning } from '@/flame/renderStats'
import { isSessionRecording, withRecordingSuppressed, } from '@/recorder/recorder'
import { createDragHandler } from '@/utils/createDragHandler'
import type { Accessor, Setter, Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ReplayFocusPreparationHandler } from '@/recorder/focusPreparation'
import type { SessionStartExtras } from '@/recorder/recorder'
import type { ReplayTarget } from '@/recorder/replay'
import type { ReplayVideoExportRequest } from '@/recorder/replayInterfaceVideo'
import type { RecordedSession } from '@/recorder/schema'

export interface WorkspaceBottomBarProps {
  isMobile: Accessor<boolean>
  flameDescriptor: FlameDescriptor
  effectiveFlame: Accessor<FlameDescriptor>

  // Recorder session docking
  captureRecorderStartExtras?: () => SessionStartExtras
  replayTarget: ReplayTarget
  prepareReplayFocus?: ReplayFocusPreparationHandler
  replaySession: Accessor<RecordedSession | undefined>
  openReplaySession: (session: RecordedSession | undefined) => void
  externalSessionLibraryRevision: Accessor<number>
  exportReplayVideo?: (
    request: ReplayVideoExportRequest,
  ) => Promise<void> | void
  recorderReplayPresentation: Accessor<{
    playing: boolean
    timelineTargeted: boolean
  }>
  setRecorderReplayPresentation: (state: {
    playing: boolean
    timelineTargeted: boolean
  }) => void

  // Cameras
  effectiveZoom: Accessor<number>
  setFlameZoom: Setter<number>
  effectivePosition: Accessor<v2f>
  setFlamePosition: Setter<v2f>
  effectiveTheta: Accessor<number>
  setFlameTheta: Setter<number>
  effectivePhi: Accessor<number>
  setFlamePhi: Setter<number>
  effectiveRadius: Accessor<number>
  setFlameRadius: Setter<number>
  effectiveFov: Accessor<number>
  setFlameFov: Setter<number>
  flyMode: Accessor<boolean>
  flySpeed: Signal<number>

  // ViewControls
  pixelRatio: Accessor<number>
  setPixelRatio: (ratio: number | ((r: number) => number)) => number
  onUndo: () => void
  onRedo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  blendFlame: Accessor<FlameDescriptor | undefined>
  resolvedBlendWeight: Accessor<number>
  onPickBlendFlame: () => void
  onMorphFlame: () => void
  onBreedFlame: () => void
  onEvolveFlame: () => void
  onSimulatorFlame: () => void
  onDiffFlame: () => void
  onAncestryFlame: () => void
  onGalleryFlame: () => void
  onArtDirector: () => void
  onFlameClash: () => void
  onClearBlendFlame: () => void
  onBlendWeightChange: (weight: number) => void
  onAudioReactive: () => void
  onSonification: () => void

  // Timeline
  showTimeline: Accessor<boolean>
  timeline: {
    isPlaying: Accessor<boolean>
    pause: () => void
  }
  timelineCollapsed: Accessor<boolean>
  setTimelineCollapsed: (collapsed: boolean | ((c: boolean) => boolean)) => void
  readableIds: Accessor<{ formatTrackPath?: (path: string) => string }>
  openAnimationGenerator: () => void
  onSetAutoKeyframe: (enabled: boolean) => void
}

export function WorkspaceBottomBar(props: WorkspaceBottomBarProps) {
  const startTimelineDrag = createDragHandler((initEvent) => {
    const handle = initEvent.currentTarget as HTMLElement
    const container = handle.parentElement
    if (!container) return
    const startY = initEvent.clientY
    const startHeight = container.offsetHeight

    function setHeight(px: number) {
      // Cap matches the CSS max-height (55vh desktop, 45vh on mobile) so the
      // handle and the rendered panel height stay in sync.
      const maxPx = window.innerHeight * (props.isMobile() ? 0.45 : 0.55)
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

  return (
    <div class={ui.bottomBar}>
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
      {/* Hidden while the pilot drives: it owns the take, and its
          own Stop button is the one Stop on screen. */}
      <Show
        when={(recorderVisible() || isSessionRecording()) && !agentDriving()}
      >
        <SessionRecorderDock
          flameDescriptor={props.flameDescriptor}
          startExtras={props.captureRecorderStartExtras}
          onRecordingStarted={() => {
            // Freeze wall-clock playback only after the recorder
            // accepts the snapshot. A rejected start must leave the
            // viewer exactly as it was. This is recorder plumbing,
            // not an authored transport step in the new take.
            if (props.timeline.isPlaying()) {
              withRecordingSuppressed(() => {
                props.timeline.pause()
              })
            }
          }}
          target={props.replayTarget}
          onPrepareAction={props.prepareReplayFocus}
          session={props.replaySession()}
          onSessionChange={props.openReplaySession}
          libraryRevision={props.externalSessionLibraryRevision()}
          onExportVideo={props.exportReplayVideo}
          onReplayPresentationChange={props.setRecorderReplayPresentation}
          busy={animationExportRunning() || props.timeline.isPlaying()}
          replayBlocked={animationExportRunning()}
        />
      </Show>
      <Show when={props.effectiveFlame().renderSettings.dimensions === 3}>
        <OrientationGizmo
          theta={[props.effectiveTheta, props.setFlameTheta]}
          phi={[props.effectivePhi, props.setFlamePhi]}
        />
      </Show>
      <div
        class={ui.viewControlsWrapper}
        data-tour-target="view-controls"
        data-replay-region="dim"
        style={{
          'pointer-events':
            animationExportRunning() || props.timeline.isPlaying()
              ? 'none'
              : 'auto',
          opacity:
            animationExportRunning() || props.timeline.isPlaying() ? 0.5 : 1,
        }}
      >
        <ViewControls
          zoom={props.effectiveZoom()}
          setZoom={props.setFlameZoom}
          position={props.effectivePosition()}
          setPosition={props.setFlamePosition}
          pixelRatio={props.pixelRatio()}
          setPixelRatio={props.setPixelRatio}
          controlsDisabled={props.timeline.isPlaying()}
          onUndo={props.onUndo}
          onRedo={props.onRedo}
          canUndo={props.canUndo}
          canRedo={props.canRedo}
          blendFlame={props.blendFlame()}
          blendWeight={props.resolvedBlendWeight()}
          onPickBlendFlame={props.onPickBlendFlame}
          onMorphFlame={props.onMorphFlame}
          onBreedFlame={props.onBreedFlame}
          onEvolveFlame={props.onEvolveFlame}
          onSimulatorFlame={props.onSimulatorFlame}
          onDiffFlame={props.onDiffFlame}
          onAncestryFlame={props.onAncestryFlame}
          onGalleryFlame={props.onGalleryFlame}
          onArtDirector={props.onArtDirector}
          onFlameClash={props.onFlameClash}
          onClearBlendFlame={props.onClearBlendFlame}
          onBlendWeightChange={props.onBlendWeightChange}
          is3D={props.effectiveFlame().renderSettings.dimensions === 3}
          flameName={props.flameDescriptor.metadata?.name}
          theta={props.effectiveTheta()}
          phi={props.effectivePhi()}
          radius={props.effectiveRadius()}
          fov={props.effectiveFov()}
          setTheta={props.setFlameTheta}
          setPhi={props.setFlamePhi}
          setRadius={props.setFlameRadius}
          setFov={props.setFlameFov}
          flyMode={props.flyMode()}
          flySpeed={props.flySpeed[0]()}
          setFlySpeed={props.flySpeed[1]}
          onAudioReactive={props.onAudioReactive}
          onSonification={props.onSonification}
        />
      </div>
      <Show when={props.showTimeline()}>
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
            props.timeline.isPlaying() && !animationExportRunning()
              ? 'true'
              : undefined
          }
          data-replay-region={
            props.recorderReplayPresentation().playing &&
            !props.recorderReplayPresentation().timelineTargeted
              ? 'recessed'
              : 'dim'
          }
          style={{
            'pointer-events':
              animationExportRunning() || props.timeline.isPlaying()
                ? 'none'
                : 'auto',
            opacity:
              animationExportRunning() || props.timeline.isPlaying()
                ? 0.5
                : props.recorderReplayPresentation().playing &&
                    !props.recorderReplayPresentation().timelineTargeted
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
                window.innerHeight * (props.isMobile() ? 0.45 : 0.55),
                currentHeight + delta,
              ),
            )
            container.style.setProperty('--timeline-height', `${newHeight}px`)
          }}
        >
          <div
            class={ui.timelineResizeHandle}
            onPointerDown={startTimelineDrag}
            title="Resize timeline"
          />
          <TimelineSection
            formatTrackLabel={props.readableIds().formatTrackPath}
            flameDescriptor={props.flameDescriptor}
            collapsed={props.timelineCollapsed}
            setCollapsed={props.setTimelineCollapsed}
            onOpenAnimationGenerator={props.openAnimationGenerator}
            onSetAutoKeyframe={props.onSetAutoKeyframe}
          />
        </div>
      </Show>
    </div>
  )
}
