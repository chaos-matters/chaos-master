import { oklabToRgb } from '@typegpu/color'
import { sdRoundedBox2d } from '@typegpu/sdf'
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { tgpu } from 'typegpu'
import { builtin, vec2f, vec3f, vec4f } from 'typegpu/data'
import { abs, add, atan2, fwidth, length, max, min, mul, saturate, sin, smoothstep, sub, } from 'typegpu/std'
import { TrackChangesDiamond } from '@/components/Timeline/TrackChangesDiamond'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { PI } from '@/flame/constants'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { useCamera } from '@/lib/CameraContext'
import { useCanvas } from '@/lib/CanvasContext'
import { useLiveRootContext } from '@/lib/RootContext'
import { createPosition, createZoom, WheelZoomCamera2D, } from '@/lib/WheelZoomCamera2D'
import { colorFocusId } from '@/recorder/focusIds'
import { createAnimationFrame } from '@/utils/createAnimationFrame'
import { createDragHandler } from '@/utils/createDragHandler'
import { eventToClip } from '@/utils/eventToClip'
import { keyframeEditedParams } from '@/utils/keyframeOnChange'
import { scrollIntoViewAndFocusOnChange } from '@/utils/scrollIntoViewOnChange'
import { createSelectedLastEntries } from '@/utils/selectedLastEntries'
import { useIntersectionObserver } from '@/utils/useIntersectionObserver'
import ui from './FlameColorEditor.module.css'
import type { v2f } from 'typegpu/data'
import type { Theme } from '@/contexts/ThemeContext'
import type { TransformRecord } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'

export type ColorEditOrigin = 'grid' | 'x' | 'y' | 'randomize' | 'reset'

const HANDLE_LIGHTNESS = {
  light: 0.8,
  dark: 0.68,
}

export function handleColor(theme: Theme, color: v2f) {
  const lightness = HANDLE_LIGHTNESS[theme]
  // Use oklab() for the CSS --color variable so that relative color syntax
  // (oklab(from var(--color) ...)) works in Slider/Checkbox CSS gradients
  return `oklab(${lightness} ${color.x} ${color.y})`
}

function Gradient(props: { isVisible: () => boolean }) {
  const camera = useCamera()
  const { theme } = useTheme()
  const { device, root, gpuReady } = useLiveRootContext()
  const { context, canvasFormat } = useCanvas()

  createEffect(() => {
    const VertexOutput = {
      pos: builtin.position,
      clip: vec2f,
    }
    const vertex = tgpu.vertexFn({
      in: { vertexIndex: builtin.vertexIndex },
      out: VertexOutput,
    })(({ vertexIndex }) => {
      'use gpu'
      const pos = [vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)]
      return {
        pos: vec4f(pos[vertexIndex]!, 0.0, 1.0),
        clip: pos[vertexIndex]!,
      }
    })

    const themeColor = HANDLE_LIGHTNESS[theme()]

    const fragment = tgpu.fragmentFn({
      in: VertexOutput,
      out: vec4f,
    })(({ pos, clip }) => {
      'use gpu'
      const halfRes = mul(0.5, camera.wgsl.resolution())
      const pxRatio = camera.wgsl.pixelRatio()
      const border = sdRoundedBox2d(
        sub(pos.xy, halfRes),
        sub(halfRes, 2 * pxRatio),
        10 * pxRatio,
      )
      const borderAA = saturate(border)
      const worldPos = camera.wgsl.clipToWorld(clip)
      const pxWidth = fwidth(worldPos.y)
      const r = length(worldPos)
      const gridCircle = abs(sin(30 * PI.$ * r))
      const gridCircleW = fwidth(gridCircle)
      const gridCircleLineAA = saturate(
        (2 * (150 * pxWidth - gridCircle)) / gridCircleW,
      )
      const circleFade = 1.0 - smoothstep(0.2, 0.21, r)
      const gridRadial = abs(sin(6 * atan2(worldPos.y, worldPos.x)))
      const gridRadialW = fwidth(gridRadial)
      const gridRadialLineAA = saturate(
        (2 * (min(0.5, (10 * pxWidth) / r) - gridRadial)) / gridRadialW,
      )
      const fadeToCenter = smoothstep(0.005, 0.05, r)
      const gridAA =
        max(gridCircleLineAA * circleFade, gridRadialLineAA * fadeToCenter) +
        borderAA
      const rgb = oklabToRgb(vec3f(themeColor - 0.08 * gridAA, worldPos))
      return vec4f(rgb, 1)
    })

    const renderPipeline = root
      .createRenderPipeline({
        vertex,
        fragment,
        targets: { format: canvasFormat },
      })
      .with(camera.bindGroup)

    createEffect(() => {
      camera.update()
      rafLoop.redraw()
    })

    const rafLoop = createAnimationFrame(
      () => {
        // Stop rendering to a lost device (mirrors Flam3): the gpuReady gate in
        // AutoCanvas unmounts this on loss, but guard the inter-frame window too.
        if (!gpuReady()) return
        const encoder = device.createCommandEncoder()
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context
                .getCurrentTexture()
                .createView({ label: 'flameColorEditorView' }),
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        })
        renderPipeline.with(pass).draw(3)
        pass.end()
        device.queue.submit([encoder.finish()])
      },
      () => (props.isVisible() ? 0 : Infinity),
      undefined,
      () => !gpuReady(),
    )
  })
  return null
}

function FlameColorHandle(props: {
  color: v2f
  setColor: (color: v2f) => void
  selected?: boolean
  dimmed?: boolean
  hidden?: boolean
  onSelect?: () => void
  onDeselect?: () => void
  /** Timeline path prefix (`transform.{tid}.color`); when set, drags keyframe
   *  x/y live (track-changes diamond, or Auto mode on already-animated
   *  colours). */
  keyframePathBase?: string
  /** Exact replay follow-cam identity for this transform's colour handle. */
  focusId?: string
}) {
  const { theme } = useTheme()
  const { canvas } = useCanvas()
  const {
    js: { worldToClip, clipToWorld },
    zoom,
  } = useCamera()
  const changeHistory = useChangeHistory()
  const timeline = useTimeline()

  // Keyframe the colour on EVERY pointer move (same contract as the sliders
  // and the affine handles): the keyframe at the current frame is rewritten
  // live, so a held/scrubbed frame renders the drag as it happens instead of
  // freezing until a drag-end debounce lands. Per-move writes coalesce into
  // one undo step, closed by breakUndoCoalescing when the drag finishes.
  const keyframeDraggedColor = () => {
    const base = props.keyframePathBase
    if (base) keyframeEditedParams(timeline, [`${base}.x`, `${base}.y`])
  }
  const clip = createMemo(() => {
    // worldToClip can throw or return NaN before the camera/canvas is
    // initialized — which happens for a frame or two when toggling between the
    // wheel and scrub-list views (the editor remounts). Falling back to the
    // center keeps the <circle> cx/cy valid instead of rendering "NaN%".
    try {
      const result = worldToClip(props.color)
      if (Number.isFinite(result.x) && Number.isFinite(result.y)) {
        return result
      }
    } catch {
      // camera not ready yet
    }
    return vec2f(0, 0)
  })
  // The editor's default zoom is 4 (see createZoom in FlameColorEditor). Scale
  // the handles gently relative to that: smaller on desktop initially, and
  // growing much less aggressively than the old sqrt(zoom) as the user zooms in
  // (so they don't balloon). The invisible grab area stays generous for touch.
  const handleScale = () => Math.max(0.7, (zoom() / 4) ** 0.4)
  const startDragging = createDragHandler(
    (initEvent) => {
      const wasSelected = props.selected ?? false
      // Select on press so the handle can be dragged immediately.
      if (!wasSelected) props.onSelect?.()

      const initialColor = props.color
      const grabPosition = clipToWorld(eventToClip(initEvent, canvas))
      let moved = false
      return {
        onPointerMove(ev) {
          if (!moved) {
            // First movement past the dead zone — begin the colour edit.
            changeHistory.startPreview('Flame color')
            moved = true
          }
          const position = clipToWorld(eventToClip(ev, canvas))
          const diff = sub(position, grabPosition)
          const color = add(initialColor, diff)
          props.setColor(color)
          keyframeDraggedColor()
        },
        onDone() {
          if (moved) {
            changeHistory.commit()
            timeline?.breakUndoCoalescing()
          } else if (wasSelected) {
            // A click (no drag) on an already-selected handle deselects it.
            props.onDeselect?.()
          }
        },
      }
    },
    { deadZoneRadius: 6 },
  )
  return (
    <g
      data-focus-id={props.focusId}
      class={ui.handle}
      classList={{
        [ui.selected as string]: props.selected,
        [ui.dimmed as string]: props.dimmed,
        [ui.hidden as string]: props.hidden,
      }}
      // TODO: temporarily using on:pointerdown and not onPointerDown
      // because otherwise WheelZoomCamera2D steals the event
      // due to solidjs event delegation.
      on:pointerdown={(e) => {
        startDragging(e)
      }}
      // Right-click / long-press deselects (mirrors the list view).
      onContextMenu={(e) => {
        e.preventDefault()
        props.onDeselect?.()
      }}
      style={{
        '--color': handleColor(theme(), props.color),
        '--handle-visual-r': `${0.42 * handleScale()}rem`,
        '--handle-visual-hover-r': `${0.54 * handleScale()}rem`,
        '--handle-grab-r': `${1.2 * handleScale()}rem`,
      }}
    >
      <circle
        class={ui.handleCircle}
        cx={`${(50 * (clip().x + 1)).toFixed(4)}%`}
        cy={`${(50 * (1 - clip().y)).toFixed(4)}%`}
      />
      <circle
        class={ui.handleCircleGrabArea}
        cx={`${(50 * (clip().x + 1)).toFixed(4)}%`}
        cy={`${(50 * (1 - clip().y)).toFixed(4)}%`}
      />
    </g>
  )
}

export function FlameColorEditor(props: {
  transforms: TransformRecord
  setTransforms: HistorySetter<TransformRecord>
  /**
   * Apply a colour edit semantically, so a recording captures it as a
   * replayable step (docs/plans/semantic-recorder-plan.md). Absent for
   * preview copies, which fall back to the raw setter.
   */
  setTransformColor?: (
    tid: string,
    x: number,
    y: number,
    origin?: ColorEditOrigin,
  ) => void
  selectedTransformId?: () => string | null
  setSelectedTransformId?: (tid: string | null) => void
  /** Enables the track-changes diamond + drag keyframing (real flame only). */
  enableChangeTracking?: boolean
}) {
  const timeline = useTimeline()
  const [div, setDiv] = createSignal<HTMLDivElement>()
  const [zoom, setZoom] = createZoom(4, [2, 20])
  const [position, setPosition] = createPosition(vec2f())
  const [isVisible, setIsVisible] = createSignal(true)

  useIntersectionObserver(div, (visible) => setIsVisible(visible))

  const scrollTrigger = () => {
    Object.values(props.transforms).forEach((tr) => tr.color)
  }

  // Selected transform last: paints on top of stacked colour handles and
  // receives the click (see createSelectedLastEntries).
  const orderedColorEntries = createSelectedLastEntries(
    () => props.transforms,
    () => props.selectedTransformId?.(),
  )

  return (
    <div
      ref={(el) => {
        setDiv(el)
        scrollIntoViewAndFocusOnChange(scrollTrigger, el)
      }}
      class={ui.editorCard}
    >
      <Show when={props.enableChangeTracking && timeline?.animationEnabled()}>
        <TrackChangesDiamond compact class={ui.canvasDiamond} />
      </Show>
      <AutoCanvas class={ui.canvas} pixelRatio={1}>
        <WheelZoomCamera2D
          eventTarget={div()}
          zoom={[zoom, setZoom]}
          position={[position, setPosition]}
        >
          <Gradient isVisible={isVisible} />
          <svg
            class={ui.svg}
            onContextMenu={(e) => {
              e.preventDefault()
            }}
          >
            <For each={orderedColorEntries()}>
              {([tid, transform]) => (
                <FlameColorHandle
                  color={vec2f(transform.color.x, transform.color.y)}
                  setColor={(color) => {
                    const applySemantically = props.setTransformColor
                    if (applySemantically) {
                      applySemantically(tid, color.x, color.y, 'grid')
                    } else {
                      props.setTransforms((draft) => {
                        draft[tid]!.color = { x: color.x, y: color.y }
                      })
                    }
                  }}
                  selected={props.selectedTransformId?.() === tid}
                  dimmed={
                    !!props.selectedTransformId?.() &&
                    props.selectedTransformId?.() !== tid
                  }
                  onSelect={() => props.setSelectedTransformId?.(tid)}
                  onDeselect={() => props.setSelectedTransformId?.(null)}
                  hidden={!(transform.visible ?? true)}
                  keyframePathBase={
                    props.enableChangeTracking
                      ? `transform.${tid}.color`
                      : undefined
                  }
                  focusId={colorFocusId(tid)}
                />
              )}
            </For>
          </svg>
        </WheelZoomCamera2D>
      </AutoCanvas>
    </div>
  )
}
