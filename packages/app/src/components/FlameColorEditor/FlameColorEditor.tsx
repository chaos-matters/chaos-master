import { oklabToRgb } from '@typegpu/color'
import { sdRoundedBox2d } from '@typegpu/sdf'
import { createEffect, createMemo, createSignal, For } from 'solid-js'
import { tgpu } from 'typegpu'
import { builtin, vec2f, vec3f, vec4f } from 'typegpu/data'
import { abs, add, atan2, clamp, fwidth, length, max, min, mul, saturate, sin, smoothstep, sub, } from 'typegpu/std'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useTheme } from '@/contexts/ThemeContext'
import { PI } from '@/flame/constants'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { useCamera } from '@/lib/CameraContext'
import { useCanvas } from '@/lib/CanvasContext'
import { useRootContext } from '@/lib/RootContext'
import { createPosition, createZoom, WheelZoomCamera2D, } from '@/lib/WheelZoomCamera2D'
import { createAnimationFrame } from '@/utils/createAnimationFrame'
import { createDragHandler } from '@/utils/createDragHandler'
import { eventToClip } from '@/utils/eventToClip'
import { recordEntries } from '@/utils/record'
import { scrollIntoViewAndFocusOnChange } from '@/utils/scrollIntoViewOnChange'
import ui from './FlameColorEditor.module.css'
import type { v2f } from 'typegpu/data'
import type { Theme } from '@/contexts/ThemeContext'
import type { TransformRecord } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'

const HANDLE_LIGHTNESS = {
  light: 0.8,
  dark: 0.68,
}

export function handleColor(theme: Theme, color: v2f) {
  return `oklab(${HANDLE_LIGHTNESS[theme]} ${color.x} ${color.y})`
}

function Gradient() {
  const camera = useCamera()
  const { theme } = useTheme()
  const { device, root } = useRootContext()
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
      const gridCircle = abs(sin(30 * PI.$ * clamp(r, 0, 0.2 + 0.01)))
      const gridCircleW = fwidth(gridCircle)
      const gridCircleLineAA = saturate(
        (2 * (150 * pxWidth - gridCircle)) / gridCircleW,
      )
      const gridRadial = abs(sin(6 * atan2(worldPos.y, worldPos.x)))
      const gridRadialW = fwidth(gridRadial)
      const gridRadialLineAA = saturate(
        (2 * (min(0.5, (10 * pxWidth) / r) - gridRadial)) / gridRadialW,
      )
      const fadeToCenter = smoothstep(0.005, 0.05, r)
      const gridAA =
        max(gridCircleLineAA, gridRadialLineAA * fadeToCenter) + borderAA
      const rgb = oklabToRgb(vec3f(themeColor - 0.08 * gridAA, worldPos))
      return vec4f(rgb, 1)
    })

    const renderPipeline = root.createRenderPipeline({
      vertex,
      fragment,
      targets: { format: canvasFormat },
    })

    createEffect(() => {
      camera.update()
      rafLoop.redraw()
    })

    const rafLoop = createAnimationFrame(
      () => {
        const encoder = device.createCommandEncoder()
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        })
        pass.setPipeline(root.unwrap(renderPipeline))
        pass.setBindGroup(0, root.unwrap(camera.bindGroup))
        pass.draw(3)
        pass.end()
        device.queue.submit([encoder.finish()])
      },
      () => Infinity,
    )
  })
  return null
}

function FlameColorHandle(props: {
  color: v2f
  setColor: (color: v2f) => void
}) {
  const { theme } = useTheme()
  const { canvas } = useCanvas()
  const {
    js: { worldToClip, clipToWorld },
  } = useCamera()
  const changeHistory = useChangeHistory()
  const clip = createMemo(() => worldToClip(props.color))
  const startDragging = createDragHandler((initEvent) => {
    changeHistory.startPreview('Flame color')

    const initialColor = props.color
    const grabPosition = clipToWorld(eventToClip(initEvent, canvas))
    return {
      onPointerMove(ev) {
        const position = clipToWorld(eventToClip(ev, canvas))
        const diff = sub(position, grabPosition)
        const color = add(initialColor, diff)
        props.setColor(color)
      },
      onDone() {
        changeHistory.commit()
      },
    }
  })
  return (
    <g
      class={ui.handle}
      // TODO: temporarily using on:pointerdown and not onPointerDown
      // because otherwise WheelZoomCamera2D steals the event
      // due to solidjs event delegation.
      on:pointerdown={startDragging}
      style={{ '--color': handleColor(theme(), props.color) }}
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
}) {
  const [div, setDiv] = createSignal<HTMLDivElement>()
  const [zoom, setZoom] = createZoom(4, [2, 20])
  const [position, setPosition] = createPosition(vec2f())

  const scrollTrigger = () => {
    Object.values(props.transforms).forEach((tr) => tr.color)
  }

  return (
    <div
      ref={(el) => {
        setDiv(el)
        scrollIntoViewAndFocusOnChange(scrollTrigger, el)
      }}
      class={ui.editorCard}
    >
      <AutoCanvas class={ui.canvas} pixelRatio={1}>
        <WheelZoomCamera2D
          eventTarget={div()}
          zoom={[zoom, setZoom]}
          position={[position, setPosition]}
        >
          <Gradient />
          <svg class={ui.svg}>
            <For each={recordEntries(props.transforms)}>
              {([tid, transform]) => (
                <FlameColorHandle
                  color={vec2f(transform.color.x, transform.color.y)}
                  setColor={(color) => {
                    props.setTransforms((draft) => {
                      draft[tid]!.color = { x: color.x, y: color.y }
                    })
                  }}
                />
              )}
            </For>
          </svg>
        </WheelZoomCamera2D>
      </AutoCanvas>
    </div>
  )
}
