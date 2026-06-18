import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { resolveKeyframeValue } from '@/utils/timeline'
import ui from './CurveEditor.module.css'
import { autoValueRange, createCurveViewport } from './useCurveViewport'
import type { KeyframeData } from '@/utils/timeline'

interface CurveEditorProps {
  /** Parameter path of the track to graph, or null when nothing is selected. */
  path: string | null
  /** Currently selected keyframe frame (highlighted), if any. */
  selectedFrame?: number | null
  onSelectKeyframe?: (path: string, frame: number) => void
}

const CURVE_SAMPLE_STEP_PX = 2

/** Keyframes reduced to the numeric ones the graph can plot. */
function numericKeyframes(kfs: KeyframeData[]): (KeyframeData & { value: number })[] {
  return kfs.filter(
    (kf): kf is KeyframeData & { value: number } => typeof kf.value === 'number',
  )
}

export function CurveEditor(props: CurveEditorProps) {
  const timeline = useTimeline()!
  const changeHistory = useChangeHistory()

  let svgRef: SVGSVGElement | undefined
  const [size, setSize] = createSignal({ width: 0, height: 0 })

  onMount(() => {
    if (!svgRef) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setSize({ width: r.width, height: r.height })
    })
    ro.observe(svgRef)
    onCleanup(() => {
      ro.disconnect()
    })
  })

  const track = createMemo(() => {
    const p = props.path
    if (!p) return null
    return timeline.tracks().find((t) => t.parameterPath === p) ?? null
  })

  const keyframes = createMemo(() => {
    const t = track()
    return t ? numericKeyframes(t.keyframes) : []
  })

  // Whether this track is graphable (has numeric keyframes).
  const isNumeric = createMemo(() => {
    const t = track()
    return !!t && t.keyframes.length > 0 && keyframes().length === t.keyframes.length
  })

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
    const { width, height } = size()
    const cfg = timeline.config()
    const range = valueRange()
    return createCurveViewport({
      width,
      height,
      startFrame: cfg.startFrame,
      endFrame: cfg.endFrame,
      minValue: range.min,
      maxValue: range.max,
    })
  })

  // Sample the resolved curve across the width into an SVG path.
  const curvePath = createMemo(() => {
    const vp = viewport()
    const t = track()
    if (!t || vp.width <= 0) return ''
    const left = vp.padding
    const right = vp.width - vp.padding
    let d = ''
    for (let x = left; x <= right; x += CURVE_SAMPLE_STEP_PX) {
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
      (vp.maxValue - vp.minValue) / Math.max(1, vp.height - 2 * vp.padding)

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
    if (!p || !svgRef) return
    const vp = viewport()
    const rect = svgRef.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const frame = Math.round(vp.xToFrame(x))
    const value = vp.yToValue(y)
    if (frame < vp.startFrame || frame > vp.endFrame) return
    timeline.addKeyframe(p, frame, value)
    props.onSelectKeyframe?.(p, frame)
  }

  return (
    <div class={ui.curveEditor}>
      <Show
        when={props.path}
        fallback={
          <div class={ui.placeholder}>
            Select a keyframe to edit its curve
          </div>
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
          <svg ref={svgRef} class={ui.svg} onDblClick={addKeyframeAtPoint}>
            <title>
              Drag a point up/down to change its value · double-click to add
            </title>
            {/* Min / max value guide lines + labels */}
            <line
              class={ui.axisLine}
              x1={0}
              y1={viewport().valueToY(viewport().maxValue)}
              x2={size().width}
              y2={viewport().valueToY(viewport().maxValue)}
            />
            <line
              class={ui.axisLine}
              x1={0}
              y1={viewport().valueToY(viewport().minValue)}
              x2={size().width}
              y2={viewport().valueToY(viewport().minValue)}
            />
            <text class={ui.axisLabel} x={4} y={12}>
              {viewport().maxValue.toFixed(2)}
            </text>
            <text class={ui.axisLabel} x={4} y={size().height - 4}>
              {viewport().minValue.toFixed(2)}
            </text>

            {/* Playhead */}
            <line
              class={ui.playhead}
              x1={playheadX()}
              y1={0}
              x2={playheadX()}
              y2={size().height}
            />

            {/* The resolved curve */}
            <path class={ui.curve} d={curvePath()} />

            {/* Keyframe nodes */}
            <For each={keyframes()}>
              {(kf) => {
                const cx = () => viewport().frameToX(kf.frame)
                const cy = () => viewport().valueToY(kf.value)
                const selected = () => props.selectedFrame === kf.frame
                return (
                  <circle
                    class={ui.node}
                    classList={{ [ui.nodeSelected as string]: selected() }}
                    cx={cx()}
                    cy={cy()}
                    r={selected() ? 5 : 4}
                    onPointerDown={(ev) => {
                      startNodeDrag(ev, kf)
                    }}
                  />
                )
              }}
            </For>
          </svg>
        </Show>
      </Show>
    </div>
  )
}
