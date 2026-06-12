import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './DopeSheet.module.css'
import { useScrollSync } from './hooks/useScrollSync'
import { useSeekScrubber } from './hooks/useSeekScrubber'
import { useZoomGestures } from './hooks/useZoomGestures'
import { KeyframeContextMenu } from './KeyframeContextMenu'
import { TrackContextMenu } from './TrackContextMenu'

function pathLabel(path: string): string {
  return path
    .split('.')
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(' › ')
}

const BASE_FRAME_WIDTH = 24
const BASE_TRACK_HEIGHT = 20
const TRACK_NAME_WIDTH = 130

import { DopeSheetGrid } from './DopeSheetGrid'
import { KeyframeInspector } from './KeyframeInspector'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export interface DopeSheetProps {
  formatTrackLabel?: (path: string) => string
  flameDescriptor?: FlameDescriptor
}

export function DopeSheet(props: DopeSheetProps) {
  const timeline = useTimeline()!
  const { setTargetedParameter, setSelectedKeyframePath } = useKeyframeTarget()

  const totalFrames = () =>
    timeline.config().endFrame - timeline.config().startFrame

  const [seekOnSelect, setSeekOnSelect] = createSignal(false)
  let containerRef: HTMLDivElement | undefined
  let tracksScrollRef!: HTMLDivElement
  let seekRulerRef!: HTMLDivElement
  let seekLaneRef!: HTMLDivElement | undefined

  const { zoomLevel, setZoomLevel, frameWidth, trackHeight, autoFitZoom } =
    useZoomGestures(
      () => containerRef,
      () => seekRulerRef,
      () => tracksScrollRef,
      () => seekLaneRef,
      totalFrames,
      BASE_FRAME_WIDTH,
      BASE_TRACK_HEIGHT,
      TRACK_NAME_WIDTH,
    )

  useScrollSync(
    () => tracksScrollRef,
    () => seekLaneRef,
  )

  const laneWidth = () => totalFrames() * frameWidth()

  const [selectedKeyframe, setSelectedKeyframe] = createSignal<{
    path: string
    frame: number
  } | null>(null)

  createEffect(() => {
    const added = timeline.lastAddedKeyframe()
    if (added) {
      setSelectedKeyframe(added)
    }
  })

  const [contextMenu, setContextMenu] = createSignal<{
    x: number
    y: number
    path: string
    frame: number
  } | null>(null)

  const [trackContextMenu, setTrackContextMenu] = createSignal<{
    x: number
    y: number
    path: string
  } | null>(null)

  const { handleSeekPointerDown } = useSeekScrubber(frameWidth)

  function handleContextMenu(e: MouseEvent, path: string, frame: number) {
    setContextMenu({ x: e.clientX, y: e.clientY, path, frame })
  }

  function handleTrackContextMenu(e: MouseEvent, path: string) {
    setTrackContextMenu({ x: e.clientX, y: e.clientY, path })
  }

  function handleDragKeyframe(
    path: string,
    oldFrame: number,
    newFrame: number,
  ) {
    timeline.moveKeyframe(path, oldFrame, newFrame)
    setSelectedKeyframe({ path, frame: newFrame })
  }

  createEffect(() => {
    const sel = selectedKeyframe()
    const path = sel?.path ?? null
    setTargetedParameter(path)
    setSelectedKeyframePath(path)
  })

  const activeTracks = createMemo(() => {
    const all = timeline.tracks()
    const fmt = props.formatTrackLabel
    const flame = props.flameDescriptor

    return all
      .map((t) => {
        let isOrphaned = false
        const parts = t.parameterPath.split('.')
        if (flame) {
          if (parts[0] === 'transform' && parts.length >= 2) {
            const tid = parts[1]!
            // Handle global transform.color.x vs transform.<tid>.probability
            if (tid !== 'color' && !flame.transforms[tid]) {
              isOrphaned = true
            }
          } else if (
            parts.length >= 2 &&
            parts[0] !== 'transform' &&
            parts[0] !== 'camera' &&
            parts[0] !== 'camera3D' &&
            parts[0] !== 'skipIters' &&
            parts[0] !== 'exposure' &&
            parts[0] !== 'vibrancy' &&
            parts[0] !== 'contrast' &&
            parts[0] !== 'gamma' &&
            parts[0] !== 'highlightPower' &&
            parts[0] !== 'depthColorPower' &&
            parts[0] !== 'palettePhase' &&
            parts[0] !== 'paletteSpeed' &&
            parts[0] !== 'densityEstimationQuality'
          ) {
            // It's likely <tid>.<vid> or <tid>.<vid>.<param>
            const tid = parts[0]!
            const vid = parts[1]!
            if (
              !flame.transforms[tid] ||
              !flame.transforms[tid].variations[vid]
            ) {
              isOrphaned = true
            }
          }
        }

        return {
          path: t.parameterPath,
          label: fmt ? fmt(t.parameterPath) : pathLabel(t.parameterPath),
          isOrphaned,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  })

  const frameLabels = createMemo(() => {
    const start = timeline.config().startFrame
    const end = timeline.config().endFrame
    const labels: number[] = []
    const minPxBetweenLabels = 50
    const step = Math.max(1, Math.ceil(minPxBetweenLabels / frameWidth()))
    for (let f = start; f <= end; f += step) {
      labels.push(f)
    }
    // Always include the end frame so the full range is visible
    if (labels[labels.length - 1] !== end) {
      labels.push(end)
    }
    return labels
  })

  const currentFrame = () => timeline.currentFrame()

  return (
    <div class={ui.container} ref={containerRef} data-tour-target="dope-sheet">
      {/* ── Zoom toolbar ── */}
      <div class={ui.zoomToolbar}>
        <button
          class={ui.zoomBtn}
          onClick={() => {
            setZoomLevel(Math.max(0.1, zoomLevel() - 0.2))
          }}
          title="Zoom out (condense)"
        >
          −
        </button>
        <span class={ui.zoomLabel}>{Math.round(zoomLevel() * 100)}%</span>
        <button
          class={ui.zoomBtn}
          onClick={() => {
            setZoomLevel(Math.min(5, zoomLevel() + 0.2))
          }}
          title="Zoom in (expand)"
        >
          +
        </button>
        <button
          class={ui.zoomBtn}
          onClick={autoFitZoom}
          title="Auto-fit all frames"
        >
          Fit
        </button>
        <button
          class={ui.zoomBtn}
          classList={{ [ui.zoomBtnActive as string]: seekOnSelect() }}
          onClick={() => setSeekOnSelect((v) => !v)}
          title="Seek playhead to selected keyframe"
        >
          Seek
        </button>
        <span class={ui.zoomHint}>(Alt+wheel or pinch to zoom)</span>
        <span class={ui.frameIndicator}>Frame {currentFrame()}</span>
      </div>

      <KeyframeInspector selectedKeyframe={selectedKeyframe()} />

      {/* ── Seek ruler ── */}
      <div class={ui.seekRuler} ref={seekRulerRef}>
        <div
          style={{
            width: `${TRACK_NAME_WIDTH}px`,
            'flex-shrink': '0',
          }}
        />
        <div
          ref={seekLaneRef}
          class={ui.seekRulerLane}
          data-tour-target="seek-ruler"
          style={{ 'min-width': `${laneWidth()}px` }}
          onPointerDown={handleSeekPointerDown}
        >
          <For each={frameLabels()}>
            {(frame) => (
              <span
                class={ui.seekLabel}
                style={{
                  left: `${(frame - timeline.config().startFrame) * frameWidth()}px`,
                  transform:
                    frame === timeline.config().startFrame
                      ? 'translateX(0)'
                      : undefined,
                }}
              >
                {frame}
              </span>
            )}
          </For>
          {/* Seek playhead indicator */}
          <div
            class={ui.seekPlayhead}
            style={{
              left: `${(currentFrame() - timeline.config().startFrame) * frameWidth()}px`,
            }}
          >
            <div class={ui.seekPlayheadHead} />
            <div class={ui.seekPlayheadLine} />
          </div>
        </div>
      </div>

      {/* ── Tracks ── */}
      <DopeSheetGrid
        tracksScrollRef={(el) => (tracksScrollRef = el)}
        onScroll={(e) => {
          if (seekLaneRef) {
            seekLaneRef.scrollLeft = e.currentTarget.scrollLeft
          }
        }}
        activeTracks={activeTracks()}
        frameWidth={frameWidth()}
        trackHeight={trackHeight()}
        startFrame={timeline.config().startFrame}
        endFrame={timeline.config().endFrame}
        currentFrame={currentFrame()}
        selectedKeyframe={selectedKeyframe()}
        onSelectKeyframe={(path, frame) => {
          setSelectedKeyframe({ path, frame })
          if (seekOnSelect() && frame !== currentFrame()) {
            timeline.goToFrame(frame)
          }
        }}
        onDragKeyframe={handleDragKeyframe}
        onContextMenu={handleContextMenu}
        onTrackContextMenu={handleTrackContextMenu}
        onDeselectKeyframe={() => setSelectedKeyframe(null)}
        trackNameWidth={TRACK_NAME_WIDTH}
      />

      {/* ── Context menu ── */}
      <Show when={contextMenu()}>
        {(cm) => (
          <KeyframeContextMenu
            x={cm().x}
            y={cm().y}
            parameterPath={cm().path}
            frame={cm().frame}
            onClose={() => setContextMenu(null)}
          />
        )}
      </Show>

      <Show when={trackContextMenu()}>
        {(cm) => {
          const track = activeTracks().find((t) => t.path === cm().path)
          const isOrphaned = track?.isOrphaned ?? false
          return (
            <TrackContextMenu
              x={cm().x}
              y={cm().y}
              parameterPath={cm().path}
              isOrphaned={isOrphaned}
              onClose={() => setTrackContextMenu(null)}
              onClearAllInvalid={() => {
                const orphanedPaths = activeTracks()
                  .filter((t) => t.isOrphaned)
                  .map((t) => t.path)
                timeline.removeTracks(orphanedPaths)
              }}
            />
          )
        }}
      </Show>
    </div>
  )
}
