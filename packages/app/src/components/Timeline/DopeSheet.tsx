import { createEffect, createMemo, createSignal, For, onCleanup, Show, } from 'solid-js'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { createPinchHandler } from '@/utils/createPinchHandler'
import ui from './DopeSheet.module.css'
import { DopeSheetTrack } from './DopeSheetTrack'
import { KeyframeContextMenu } from './KeyframeContextMenu'
import type { EasingCurve } from '@/utils/timeline'

function pathLabel(path: string): string {
  return path
    .split('.')
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(' › ')
}

const BASE_FRAME_WIDTH = 24
const BASE_TRACK_HEIGHT = 20
const TRACK_NAME_WIDTH = 130
const EASING_OPTIONS: EasingCurve[] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'bounce',
  'elastic',
]

export interface DopeSheetProps {
  formatTrackLabel?: (path: string) => string
}

export function DopeSheet(props: DopeSheetProps) {
  const timeline = useTimeline()!
  const changeHistory = useChangeHistory()
  const { setTargetedParameter, setSelectedKeyframePath } = useKeyframeTarget()

  const totalFrames = () =>
    timeline.config().endFrame - timeline.config().startFrame

  // Dynamic frame width and track height based on container height
  // and user-adjustable zoom level.
  const [containerHeight, setContainerHeight] = createSignal(200)
  const [zoomLevel, setZoomLevel] = createSignal(1)
  let containerRef: HTMLDivElement | undefined
  let tracksScrollRef!: HTMLDivElement
  let seekRulerRef!: HTMLDivElement
  let seekLaneRef!: HTMLDivElement | undefined

  const frameWidth = createMemo(() => {
    const h = containerHeight()
    const scale = Math.max(0.8, Math.min(3, h / 140))
    return BASE_FRAME_WIDTH * scale * zoomLevel()
  })
  const trackHeight = createMemo(() => {
    const h = containerHeight()
    const scale = Math.max(0.8, Math.min(3, h / 140))
    // Minimum 18px so diamond keyframes (14px) remain clickable
    return Math.max(18, BASE_TRACK_HEIGHT * scale * zoomLevel())
  })

  createEffect(() => {
    const el = containerRef
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        setContainerHeight(entry.contentRect.height)
      }
    })
    ro.observe(el)
    onCleanup(() => {
      ro.disconnect()
    })
  })

  // Sync horizontal scroll between tracks area and seek ruler lane (bidirectional).
  createEffect(() => {
    const tracksEl = tracksScrollRef
    const seekLane = seekLaneRef
    if (!tracksEl || !seekLane) return
    let syncing = false
    const syncTracksToLane = () => {
      if (syncing) return
      syncing = true
      seekLane.scrollLeft = tracksEl.scrollLeft
      syncing = false
    }
    const syncLaneToTracks = () => {
      if (syncing) return
      syncing = true
      tracksEl.scrollLeft = seekLane.scrollLeft
      syncing = false
    }
    tracksEl.addEventListener('scroll', syncTracksToLane, { passive: true })
    seekLane.addEventListener('scroll', syncLaneToTracks, { passive: true })
    onCleanup(() => {
      tracksEl.removeEventListener('scroll', syncTracksToLane)
      seekLane.removeEventListener('scroll', syncLaneToTracks)
    })
  })

  // Pinch-to-zoom for touch devices
  createEffect(() => {
    const el = containerRef
    if (!el) return
    el.addEventListener('touchmove', startPinch, { passive: false })
    onCleanup(() => {
      el.removeEventListener('touchmove', startPinch)
    })
  })

  // Alt+mouse-wheel zoom
  createEffect(() => {
    const el = containerRef
    if (!el) return

    function onWheel(e: WheelEvent) {
      if (!e.altKey) return
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.002)
      setZoomLevel(Math.max(0.1, Math.min(5, zoomLevel() * factor)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    onCleanup(() => {
      el.removeEventListener('wheel', onWheel)
    })
  })

  const startPinch = createPinchHandler((initEvent) => {
    let prevDistance = initEvent.distance
    return {
      onPinchMove(event) {
        const ratio = event.distance / prevDistance
        prevDistance = event.distance
        setZoomLevel(Math.max(0.1, Math.min(5, zoomLevel() * ratio)))
      },
    }
  })

  function autoFitZoom() {
    // Use the fixed-width parent container as the reference, not the lane
    // itself (whose width depends on the current zoom via min-width).
    const ruler = seekRulerRef
    if (!ruler) return
    const availableWidth = ruler.clientWidth - TRACK_NAME_WIDTH - 16
    if (availableWidth <= 0 || totalFrames() <= 0) return
    const h = containerHeight()
    const containerScale = Math.max(0.8, Math.min(3, h / 140))
    const targetFrameWidth = availableWidth / totalFrames()
    const targetZoom = targetFrameWidth / (BASE_FRAME_WIDTH * containerScale)
    setZoomLevel(Math.max(0.1, Math.min(5, targetZoom)))
    // Reset scroll positions so the fitted content starts at the beginning.
    if (tracksScrollRef) tracksScrollRef.scrollLeft = 0
    if (seekLaneRef) seekLaneRef.scrollLeft = 0
  }

  // Auto-fit only on initial track appearance, not on incremental additions.
  // Prevents visual jump when user interactively adds keyframes.
  let prevTrackPaths: Set<string> | undefined
  createEffect(() => {
    const tracks = timeline.tracks()
    const paths = new Set(tracks.map((t) => t.parameterPath))
    if (!prevTrackPaths) {
      prevTrackPaths = paths
      if (paths.size > 0) autoFitZoom()
      return
    }
    prevTrackPaths = paths
  })

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

  // ── Seek ruler drag state ──
  let seekDragging = false
  let seekDragStartX = 0

  function handleSeekPointerDown(e: PointerEvent) {
    seekDragging = true
    seekDragStartX = e.clientX
    timeline.setIsScrubbing(true)
    seekToPosition(e)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      if (!seekDragging) return
      // 4px dead zone before dragging takes effect — prevents
      // accidental frame changes during a simple click.
      if (Math.abs(ev.clientX - seekDragStartX) < 4) return
      seekToPosition(ev)
    }

    function onUp() {
      seekDragging = false
      timeline.setIsScrubbing(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function seekToPosition(e: PointerEvent) {
    const lane = (e.target as HTMLElement).closest(`.${ui.seekRulerLane}`)
    if (!lane) return
    const rect = lane.getBoundingClientRect()
    const x = e.clientX - rect.left + lane.scrollLeft
    const frame = Math.round(x / frameWidth()) + timeline.config().startFrame
    const clampedFrame = Math.max(
      timeline.config().startFrame,
      Math.min(timeline.config().endFrame, frame),
    )
    timeline.goToFrame(clampedFrame)
  }

  function handleContextMenu(e: MouseEvent, path: string, frame: number) {
    setContextMenu({ x: e.clientX, y: e.clientY, path, frame })
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
    return all
      .map((t) => ({
        path: t.parameterPath,
        label: fmt ? fmt(t.parameterPath) : pathLabel(t.parameterPath),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  })

  const selectedKeyframeData = createMemo(() => {
    const sel = selectedKeyframe()
    if (!sel) return null
    if (!timeline.hasKeyframeAtFrame(sel.path, sel.frame)) {
      return null
    }
    const kf = timeline.getKeyframeAtFrame(sel.path, sel.frame)
    if (!kf) return null
    const val = kf.value
    if (val === null || typeof val === 'boolean') return null
    return { frame: kf.frame, value: val, easing: kf.easing, path: sel.path }
  })

  function formatKeyframeValue(
    value:
      | number
      | string
      | [number, number, number]
      | [number, number, number, number],
  ): string {
    return Array.isArray(value) ? `[${value.join(', ')}]` : String(value)
  }

  const [inspectorEditing, setInspectorEditing] = createSignal(false)
  const [inspectorEditValue, setInspectorEditValue] = createSignal('')
  let inspectorInputRef: HTMLInputElement | undefined

  function startInspectorScrub(e: PointerEvent, currentValue: number) {
    if (inspectorEditing()) return
    const sel = selectedKeyframe()!
    const kf = timeline.getKeyframeAtFrame(sel.path, sel.frame)
    const easing = kf?.easing
    const startX = e.clientX
    const startValue = currentValue
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setTargetedParameter(sel.path)

    if (!changeHistory.isPreviewing()) {
      changeHistory.startPreview('Keyframe scrub')
    }
    // Push undo once at start of scrub drag
    timeline.addKeyframe(sel.path, sel.frame, startValue, easing)

    let step = 0.01
    let min: number | undefined = undefined
    let max: number | undefined = undefined
    const domNode = document.querySelector(
      `[data-parameter-path="${sel.path}"]`,
    )
    if (domNode) {
      const stepAttr =
        domNode.getAttribute('step') || domNode.getAttribute('data-step')
      if (stepAttr) step = parseFloat(stepAttr) || 0.01

      const minAttr =
        domNode.getAttribute('min') || domNode.getAttribute('data-min')
      if (minAttr) min = parseFloat(minAttr)

      const maxAttr =
        domNode.getAttribute('max') || domNode.getAttribute('data-max')
      if (maxAttr) max = parseFloat(maxAttr)
    }

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      const sensitivity = ev.ctrlKey ? 0.01 : ev.shiftKey ? 0.1 : 1
      let newValue = startValue + dx * step * sensitivity
      if (min !== undefined) newValue = Math.max(min, newValue)
      if (max !== undefined) newValue = Math.min(max, newValue)
      timeline.setKeyframeValue(sel.path, sel.frame, newValue, easing)
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (changeHistory.isPreviewing()) {
        changeHistory.commit()
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startInspectorEdit(currentValue: number) {
    setInspectorEditValue(String(currentValue))
    setInspectorEditing(true)
    requestAnimationFrame(() => inspectorInputRef?.select())
  }

  function commitInspectorEdit() {
    const parsed = parseFloat(inspectorEditValue())
    if (!isNaN(parsed)) {
      const sel = selectedKeyframe()!
      const kf = timeline.getKeyframeAtFrame(sel.path, sel.frame)
      if (kf) {
        timeline.addKeyframe(sel.path, sel.frame, parsed, kf.easing)
      }
    }
    setInspectorEditing(false)
  }

  function cancelInspectorEdit() {
    setInspectorEditing(false)
  }

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
        <span class={ui.zoomHint}>(Alt+wheel or pinch to zoom)</span>
        <span class={ui.frameIndicator}>Frame {currentFrame()}</span>
      </div>

      {/* ── Inspector ── */}
      <div class={ui.inspector}>
        <Show
          when={selectedKeyframeData()}
          fallback={
            <span class={ui.inspectorPlaceholder}>
              Select a keyframe to edit
            </span>
          }
        >
          {(kf) => (
            <>
              <span class={ui.inspectorLabel}>
                {props.formatTrackLabel
                  ? props.formatTrackLabel(selectedKeyframe()!.path)
                  : pathLabel(selectedKeyframe()!.path)}{' '}
                @ frame {kf().frame}
              </span>
              {typeof kf().value === 'number' ? (
                <Show
                  when={inspectorEditing()}
                  fallback={
                    <span
                      class={ui.inspectorValue}
                      onPointerDown={(e) => {
                        startInspectorScrub(e, kf().value as number)
                      }}
                      onDblClick={() => {
                        startInspectorEdit(kf().value as number)
                      }}
                    >
                      {String(kf().value)}
                    </span>
                  }
                >
                  <input
                    ref={inspectorInputRef}
                    class={ui.inspectorValueInput}
                    type="text"
                    value={inspectorEditValue()}
                    onInput={(e) =>
                      setInspectorEditValue(e.currentTarget.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitInspectorEdit()
                      if (e.key === 'Escape') cancelInspectorEdit()
                      e.stopPropagation()
                    }}
                    onBlur={commitInspectorEdit}
                  />
                </Show>
              ) : (
                <span class={ui.inspectorValueReadonly}>
                  {formatKeyframeValue(kf().value)}
                </span>
              )}
              <label class={ui.inspectorEasing}>
                Easing:
                <select
                  value={kf().easing ?? 'linear'}
                  onChange={(e) => {
                    timeline.addKeyframe(
                      selectedKeyframe()!.path,
                      selectedKeyframe()!.frame,
                      kf().value,
                      e.currentTarget.value as EasingCurve,
                    )
                  }}
                >
                  <For each={EASING_OPTIONS}>
                    {(opt) => <option value={opt}>{opt}</option>}
                  </For>
                </select>
              </label>
              <button
                class={ui.inspectorDelete}
                onClick={() => {
                  timeline.removeKeyframe(
                    selectedKeyframe()!.path,
                    selectedKeyframe()!.frame,
                  )
                  setSelectedKeyframe(null)
                }}
              >
                Delete
              </button>
            </>
          )}
        </Show>
      </div>

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
      <div
        class={ui.tracksScroll}
        ref={tracksScrollRef}
        onScroll={(e) => {
          if (seekLaneRef) {
            seekLaneRef.scrollLeft = e.currentTarget.scrollLeft
          }
        }}
      >
        <Show
          when={activeTracks().length > 0}
          fallback={
            <div class={ui.emptyState}>
              No keyframes. Click a property and press <kbd>I</kbd> to insert
              one.
            </div>
          }
        >
          <For each={activeTracks()}>
            {(track) => (
              <DopeSheetTrack
                parameterPath={track.path}
                label={track.label}
                frameWidth={frameWidth()}
                trackHeight={trackHeight()}
                startFrame={timeline.config().startFrame}
                endFrame={timeline.config().endFrame}
                currentFrame={currentFrame()}
                selectedKeyframe={selectedKeyframe()}
                onSelectKeyframe={(path, frame) => {
                  setSelectedKeyframe({ path, frame })
                  timeline.goToFrame(frame)
                }}
                onDragKeyframe={handleDragKeyframe}
                onContextMenu={handleContextMenu}
                onDeselectKeyframe={() => setSelectedKeyframe(null)}
              />
            )}
          </For>
        </Show>

        {/* Playhead line in tracks */}
        <div
          class={ui.playhead}
          style={{
            left: `${
              TRACK_NAME_WIDTH +
              (currentFrame() - timeline.config().startFrame) * frameWidth()
            }px`,
          }}
        />
      </div>

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
    </div>
  )
}
