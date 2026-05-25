import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './DopeSheet.module.css'
import { DopeSheetTrack } from './DopeSheetTrack'
import { useScrollSync } from './hooks/useScrollSync'
import { useSeekScrubber } from './hooks/useSeekScrubber'
import { useZoomGestures } from './hooks/useZoomGestures'
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

  const { handleSeekPointerDown } = useSeekScrubber(frameWidth)

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
