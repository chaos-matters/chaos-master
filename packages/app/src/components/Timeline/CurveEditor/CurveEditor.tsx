import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { resolveKeyframeValue } from '@/utils/timeline'
import ui from './CurveEditor.module.css'
import { autoValueRange, createCurveViewport } from './useCurveViewport'
import type { KeyframeData } from '@/utils/timeline'

interface CurveEditorProps {
  /** Parameter path of the track to graph, or null when nothing is selected. */
  path: string | null
  /** Human-readable name of that track, shown in the gutter. */
  label?: string | null
  /** Currently selected keyframe frame (highlighted), if any. */
  selectedFrame?: number | null
  onSelectKeyframe?: (path: string, frame: number) => void
  // Geometry shared with the dope sheet so the graph lines up with the diamonds.
  frameWidth: number
  startFrame: number
  endFrame: number
  trackNameWidth: number
  /** Horizontal scroll offset of the tracks, mirrored so the graph scrolls too. */
  scrollLeft: number
}

const CURVE_SAMPLE_STEP_PX = 2
const PAD_Y = 14

/** Keyframes reduced to the numeric ones the graph can plot. */
function numericKeyframes(
  kfs: KeyframeData[],
): (KeyframeData & { value: number })[] {
  return kfs.filter(
    (kf): kf is KeyframeData & { value: number } => typeof kf.value === 'number',
  )
}

export function CurveEditor(props: CurveEditorProps) {
  const timeline = useTimeline()!
  const changeHistory = useChangeHistory()

  let laneRef: HTMLDivElement | undefined
  const [laneHeight, setLaneHeight] = createSignal(0)

  // Attach the size observer via the lane's ref so it binds when the lane is
  // actually rendered (it lives inside <Show> branches that only mount once a
  // numeric keyframe is selected — an onMount would run too early, with the lane
  // absent, leaving height stuck at 0 → a collapsed/blank curve).
  function bindLane(el: HTMLDivElement) {
    laneRef = el
    const measure = () => {
      setLaneHeight(el.clientHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    onCleanup(() => {
      ro.disconnect()
    })
  }

  const track = createMemo(() => {
    const p = props.path
    if (!p) return null
    return timeline.tracks().find((t) => t.parameterPath === p) ?? null
  })

  const keyframes = createMemo(() => {
    const t = track()
    return t ? numericKeyframes(t.keyframes) : []
  })

  // Graphable when every keyframe in the track is numeric.
  const isNumeric = createMemo(() => {
    const t = track()
    return (
      !!t && t.keyframes.length > 0 && keyframes().length === t.keyframes.length
    )
  })

  const laneWidth = createMemo(
    () => (props.endFrame - props.startFrame) * props.frameWidth,
  )

  // Freeze the value axis while dragging so it doesn't rescale under the cursor.
  const [frozenRange, setFrozenRange] = createSignal<{
    min: number
    max: number
  } | null>(null)

  const valueRange = createMemo(() => {
    const frozen = frozenRange()
    if (frozen) return frozen
    return autoValueRange(keyframes().map((kf) => kf.value))
  })

  const viewport = createMemo(() => {
    const range = valueRange()
    return createCurveViewport({
      frameWidth: props.frameWidth,
      startFrame: props.startFrame,
      height: laneHeight(),
      minValue: range.min,
      maxValue: range.max,
      padY: PAD_Y,
    })
  })

  // Sample the resolved curve across the lane into an SVG path.
  const curvePath = createMemo(() => {
    const vp = viewport()
    const t = track()
    const w = laneWidth()
    if (!t || w <= 0 || laneHeight() <= 0) return ''
    let d = ''
    for (let x = 0; x <= w; x += CURVE_SAMPLE_STEP_PX) {
      const frame = vp.xToFrame(x)
      const value = resolveKeyframeValue(t.keyframes, frame)
      if (typeof value !== 'number') continue
      const y = vp.valueToY(value)
      d += `${d === '' ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    }
    return d
  })

  const playheadX = createMemo(() => viewport().frameToX(timeline.currentFrame()))

  function startNodeDrag(e: PointerEvent, kf: KeyframeData & { value: number }) {
    e.stopPropagation()
    const p = props.path
    if (!p) return
    const vp = viewport()
    const startY = e.clientY
    const startValue = kf.value
    const frame = kf.frame
    ;(e.target as Element).setPointerCapture(e.pointerId)

    props.onSelectKeyframe?.(p, frame)
    // Pin the axis and open a single undo/preview step for the whole drag.
    setFrozenRange({ min: vp.minValue, max: vp.maxValue })
    if (!changeHistory.isPreviewing()) changeHistory.startPreview('Curve edit')
    timeline.addKeyframe(p, frame, startValue, kf.easing, kf.interp)

    const valuePerPx =
      (vp.maxValue - vp.minValue) / Math.max(1, vp.height - 2 * vp.padY)

    function onMove(ev: PointerEvent) {
      const dy = ev.clientY - startY
      const sensitivity = ev.shiftKey ? 0.1 : 1
      const newValue = startValue - dy * valuePerPx * sensitivity
      timeline.setKeyframeValue(p, frame, newValue, kf.easing, kf.interp)
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (changeHistory.isPreviewing()) changeHistory.commit()
      setFrozenRange(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function addKeyframeAtPoint(e: MouseEvent) {
    const p = props.path
    if (!p || !laneRef) return
    const vp = viewport()
    const rect = laneRef.getBoundingClientRect()
    // Account for the scroll offset (the graph is translated, not scrolled).
    const x = e.clientX - rect.left + props.scrollLeft
    const y = e.clientY - rect.top
    const frame = Math.round(vp.xToFrame(x))
    if (frame < props.startFrame || frame > props.endFrame) return
    timeline.addKeyframe(p, frame, vp.yToValue(y))
    props.onSelectKeyframe?.(p, frame)
  }

  return (
    <div class={ui.curveEditor}>
      <Show
        when={props.path}
        fallback={
          <div class={ui.placeholder}>Select a keyframe to edit its curve</div>
        }
      >
        <Show
          when={isNumeric()}
          fallback={
            <div class={ui.placeholder}>
              Curve editing is available for numeric parameters
            </div>
          }
        >
          {/* Fixed gutter: track name + value range, aligned with the diamonds' name column */}
          <div class={ui.gutter} style={{ width: `${props.trackNameWidth}px` }}>
            <span class={ui.curveName} title={props.label ?? undefined}>
              {props.label ?? props.path}
            </span>
            <span class={ui.valueMax} style={{ top: `${PAD_Y - 6}px` }}>
              {viewport().maxValue.toFixed(2)}
            </span>
            <span class={ui.valueMin} style={{ bottom: `${PAD_Y - 6}px` }}>
              {viewport().minValue.toFixed(2)}
            </span>
          </div>

          {/* Scroll-synced lane holding the graph at the dope sheet's frame scale */}
          <div class={ui.lane} ref={bindLane}>
            <svg
              class={ui.svg}
              width={laneWidth()}
              height={laneHeight()}
              style={{ transform: `translateX(${-props.scrollLeft}px)` }}
              onDblClick={addKeyframeAtPoint}
            >
              <title>
                Drag a point up/down to change its value · double-click to add
              </title>
              {/* Min / max value guide lines */}
              <line
                class={ui.axisLine}
                x1={0}
                y1={viewport().valueToY(viewport().maxValue)}
                x2={laneWidth()}
                y2={viewport().valueToY(viewport().maxValue)}
              />
              <line
                class={ui.axisLine}
                x1={0}
                y1={viewport().valueToY(viewport().minValue)}
                x2={laneWidth()}
                y2={viewport().valueToY(viewport().minValue)}
              />

              {/* Playhead */}
              <line
                class={ui.playhead}
                x1={playheadX()}
                y1={0}
                x2={playheadX()}
                y2={laneHeight()}
              />

              {/* The resolved curve */}
              <path class={ui.curve} d={curvePath()} />

              {/* Keyframe nodes */}
              <For each={keyframes()}>
                {(kf) => {
                  const selected = () => props.selectedFrame === kf.frame
                  return (
                    <circle
                      class={ui.node}
                      classList={{ [ui.nodeSelected as string]: selected() }}
                      cx={viewport().frameToX(kf.frame)}
                      cy={viewport().valueToY(kf.value)}
                      r={selected() ? 5 : 4}
                      onPointerDown={(ev) => {
                        startNodeDrag(ev, kf)
                      }}
                    />
                  )
                }}
              </For>
            </svg>
          </div>
        </Show>
      </Show>
    </div>
  )
}
