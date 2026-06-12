import { sdRoundedBox2d } from '@typegpu/sdf'
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { tgpu } from 'typegpu'
import { builtin, vec2f, vec3f, vec4f } from 'typegpu/data'
import { abs, add, dot, dpdx, fract, length, max, mix, mul, saturate, sub, } from 'typegpu/std'
import { DiceButton } from '@/components/DiceButton/DiceButton'
import { ScrubInput } from '@/components/Sliders/ScrubInput'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useTheme } from '@/contexts/ThemeContext'
import { randomizeAffineCoef } from '@/flame/randomize'
import { ArrowRightToBox, BoxArrowRight, GridIcon, ListIcon, Sparkle, } from '@/icons'
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
import { useIntersectionObserver } from '@/utils/useIntersectionObserver'
import { handleColor } from '../FlameColorEditor/FlameColorEditor'
import ui from './AffineEditor.module.css'
import { AffineListEditor } from './AffineListEditor'
import listUi from './AffineListEditor.module.css'
import type { v2f } from 'typegpu/data'
import type { AffineParams } from '@/flame/affineTranform'
import type { TransformRecord } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'

const BACKGROUND_COLOR = {
  light: 1,
  dark: 0.02,
}

const AXIS_GRAY = {
  light: 0.72,
  dark: 0.3,
}

const MAJOR_TICK_GRAY = {
  light: 0.85,
  dark: 0.13,
}

const MINOR_TICK_GRAY = {
  light: 0.95,
  dark: 0.05,
}

const triangle = (x: number) => {
  'use gpu'
  return abs(fract(x - 0.5) - 0.5)
}

const lines = (x: number, pxWidth: number): number => {
  'use gpu'
  return saturate((2 * (2 * pxWidth - x)) / pxWidth)
}

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

function vec2Normalize(a: v2f) {
  const len = length(a) || 1
  return vec2f(a.x / len, a.y / len)
}

function cross2d(a: v2f, b: v2f) {
  return a.x * b.y - a.y * b.x
}

function project3D(x: number, y: number, z: number): v2f {
  const zAngle = (135 * Math.PI) / 180
  const zScale = 0.5
  const px = x + z * Math.cos(zAngle) * zScale
  const py = y + z * Math.sin(zAngle) * zScale
  return vec2f(px, py)
}

function Grid(props: { isVisible: () => boolean }) {
  const { theme } = useTheme()
  const camera = useCamera()
  const { device, root } = useRootContext()
  const { context, canvasFormat } = useCanvas()

  createEffect(() => {
    const backgroundGray = BACKGROUND_COLOR[theme()]
    const axisGray = AXIS_GRAY[theme()]
    const majorGray = MAJOR_TICK_GRAY[theme()]
    const minorGray = MINOR_TICK_GRAY[theme()]

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
      const pxWidth = dpdx(worldPos.x)

      const minorV = lines(triangle(10 * worldPos.x), 10 * pxWidth)
      const minorH = lines(triangle(10 * worldPos.y), 10 * pxWidth)
      const minor = max(minorH, minorV)

      const majorV = lines(triangle(worldPos.x), pxWidth)
      const majorH = lines(triangle(worldPos.y), pxWidth)
      const major = max(majorH, majorV)

      const axisV = lines(abs(worldPos.x), pxWidth)
      const axisH = lines(abs(worldPos.y), pxWidth)
      const axis = max(axisH, axisV)

      let gray = mix(backgroundGray, minorGray, minor)
      gray = mix(gray, majorGray, max(borderAA, major))
      gray = mix(gray, axisGray, axis)
      return vec4f(add(0.02, vec3f(gray)), 1)
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
        renderPipeline.with(pass).draw(3)
        pass.end()
        device.queue.submit([encoder.finish()])
      },
      () => (props.isVisible() ? 0 : Infinity),
    )
  })
  return null
}

function AffineHandle(props: {
  transform: AffineParams
  color: v2f
  setTransform: (pos: AffineParams) => void
  is3D?: boolean
}) {
  const { theme } = useTheme()
  const {
    js: { worldToClip, clipToWorld },
    zoom,
  } = useCamera()
  const { canvas, canvasSize } = useCanvas()
  const changeHistory = useChangeHistory()

  const handleScale = () => Math.max(1, Math.sqrt(zoom()))

  const aspect = createMemo(() => canvasSize().width / canvasSize().height)
  const position = createMemo(() => vec2f(props.transform.c, props.transform.f))
  const clipPosition = createMemo(() => {
    try {
      const result = worldToClip(position())
      return result
    } catch {
      // worldToClip may throw if camera hasn't initialized
    }
    return vec2f(0.5, 0.5)
  })
  const clipTransform = createMemo(() => {
    try {
      // prettier-ignore
      const { a, b, c, d, e, f } = props.transform
      const zero = worldToClip(vec2f(0, 0))
      const x = sub(worldToClip(vec2f(a, d)), zero)
      const y = sub(worldToClip(vec2f(b, e)), zero)
      const t = worldToClip(vec2f(c, f))
      const s = aspect()
      return [x.x * s, y.x * s, x.y, y.y, t.x * s, t.y]
    } catch {
      // worldToClip may throw if camera hasn't initialized
      return [0, 0, 0, 0, 0.5, 0.5]
    }
  })
  const startDragging = createDragHandler((initEvent) => {
    changeHistory.startPreview('Affine Translation')

    const initialTransform = { ...props.transform }
    const grabPosition = clipToWorld(eventToClip(initEvent, canvas))
    return {
      onPointerMove(ev) {
        const evPosition = clipToWorld(eventToClip(ev, canvas))
        const diff = sub(evPosition, grabPosition)
        const position = add(
          vec2f(initialTransform.c, initialTransform.f),
          diff,
        )
        props.setTransform({
          ...initialTransform,
          c: position.x,
          f: position.y,
        })
      },
      onDone() {
        changeHistory.commit()
      },
    }
  })
  const startScalingRotating = (xFactor: -1 | 0 | 1, yFactor: -1 | 0 | 1) =>
    createDragHandler((initEvent) => {
      changeHistory.startPreview('Affine Rotation')

      const { a, b, d, e, ...rest } = props.transform
      const grabPosition = clipToWorld(eventToClip(initEvent, canvas))
      const center = position()

      function onPointerMove(ev: PointerEvent) {
        const evPosition = clipToWorld(eventToClip(ev, canvas))
        const grabDiff = sub(grabPosition, center)
        const evDiff = sub(evPosition, center)
        const ratio = length(evDiff) / length(grabDiff)
        const grabNorm = vec2Normalize(grabDiff)
        const evNorm = vec2Normalize(evDiff)
        const cos = ev.ctrlKey || ev.metaKey ? 1 : dot(evNorm, grabNorm)
        const sin = ev.ctrlKey || ev.metaKey ? 0 : cross2d(evNorm, grabNorm)
        props.setTransform({
          ...rest,
          a: xFactor === 0 ? a : (a * cos + b * sin) * ratio * xFactor,
          b: xFactor === 0 ? b : (-a * sin + b * cos) * ratio * xFactor,
          d: yFactor === 0 ? d : (d * cos + e * sin) * ratio * yFactor,
          e: yFactor === 0 ? e : (-d * sin + e * cos) * ratio * yFactor,
        })
      }

      // immediately respond, as -1 factors are used for flipping axes
      // when clicking on dashed lines
      onPointerMove(initEvent)

      return {
        onPointerMove,
        onDone() {
          changeHistory.commit()
        },
      }
    })
  const p = (v: number) => `${v}%`
  const x = () => 50 * (clipPosition().x + 1)
  const y = () => 50 * (1 - clipPosition().y)
  const corners = `
    M -1,-1 m 0.25,0 L -1,-1 v 0.25
    M 1,-1 m -0.25,0 L 1,-1 v 0.25
    M -1,1 m 0.25,0 L -1,1 v -0.25
    M 1,1 m -0.25,0 L 1,1 v -0.25
  `

  const scaleBoth = startScalingRotating(1, 1)
  const scaleX = startScalingRotating(1, 0)
  const scaleY = startScalingRotating(0, 1)
  const scaleNegX = startScalingRotating(-1, 0)
  const scaleNegY = startScalingRotating(0, -1)

  // 3D projection & drag helpers
  const getPointProj = (wx: number, wy: number, wz: number) => {
    try {
      const w2d = project3D(wx, wy, wz)
      const clip = worldToClip(w2d)
      const px = 50 * (clip.x + 1)
      const py = 50 * (1 - clip.y)
      return { x: px, y: py }
    } catch {
      return { x: 50, y: 50 }
    }
  }

  const projC = () => {
    const d = props.transform.d ?? 0
    const h = props.transform.h ?? 0
    const l = props.transform.l ?? 0
    return getPointProj(d, h, l)
  }

  const projLocalX = () => {
    const d = props.transform.d ?? 0
    const h = props.transform.h ?? 0
    const l = props.transform.l ?? 0
    const a = props.transform.a ?? 1
    const e = props.transform.e ?? 0
    const i = props.transform.i ?? 0
    return getPointProj(d + a, h + e, l + i)
  }
  const projLocalY = () => {
    const d = props.transform.d ?? 0
    const h = props.transform.h ?? 0
    const l = props.transform.l ?? 0
    const b = props.transform.b ?? 0
    const f = props.transform.f ?? 1
    const j = props.transform.j ?? 0
    return getPointProj(d + b, h + f, l + j)
  }
  const projLocalZ = () => {
    const d = props.transform.d ?? 0
    const h = props.transform.h ?? 0
    const l = props.transform.l ?? 0
    const c = props.transform.c ?? 0
    const g = props.transform.g ?? 0
    const k = props.transform.k ?? 1
    return getPointProj(d + c, h + g, l + k)
  }

  const projNegLocalX = () => {
    const d = props.transform.d ?? 0
    const h = props.transform.h ?? 0
    const l = props.transform.l ?? 0
    const a = props.transform.a ?? 1
    const e = props.transform.e ?? 0
    const i = props.transform.i ?? 0
    return getPointProj(d - a, h - e, l - i)
  }
  const projNegLocalY = () => {
    const d = props.transform.d ?? 0
    const h = props.transform.h ?? 0
    const l = props.transform.l ?? 0
    const b = props.transform.b ?? 0
    const f = props.transform.f ?? 1
    const j = props.transform.j ?? 0
    return getPointProj(d - b, h - f, l - j)
  }
  const projNegLocalZ = () => {
    const d = props.transform.d ?? 0
    const h = props.transform.h ?? 0
    const l = props.transform.l ?? 0
    const c = props.transform.c ?? 0
    const g = props.transform.g ?? 0
    const k = props.transform.k ?? 1
    return getPointProj(d - c, h - g, l - k)
  }

  const startDragging3D = createDragHandler((initEvent) => {
    changeHistory.startPreview('Affine 3D Translation')
    const initialTransform = { ...props.transform }
    const grabPosition = clipToWorld(eventToClip(initEvent, canvas))
    return {
      onPointerMove(ev) {
        const evPosition = clipToWorld(eventToClip(ev, canvas))
        const diff = sub(evPosition, grabPosition)
        props.setTransform({
          ...initialTransform,
          d: (initialTransform.d ?? 0) + diff.x,
          h: (initialTransform.h ?? 0) + diff.y,
        })
      },
      onDone() {
        changeHistory.commit()
      },
    }
  })

  const startScalingRotating3D = (axis: 'X' | 'Y' | 'Z', factor: number) =>
    createDragHandler((initEvent) => {
      changeHistory.startPreview(`Rotate/Scale Local ${axis}`)
      const initialTransform = { ...props.transform }
      const grabPosition = clipToWorld(eventToClip(initEvent, canvas))
      const center = project3D(
        initialTransform.d ?? 0,
        initialTransform.h ?? 0,
        initialTransform.l ?? 0,
      )

      function onPointerMove(ev: PointerEvent) {
        const evPosition = clipToWorld(eventToClip(ev, canvas))
        const grabDiff = sub(grabPosition, center)
        const evDiff = sub(evPosition, center)
        const ratio = length(evDiff) / (length(grabDiff) || 0.001)
        const grabNorm = vec2Normalize(grabDiff)
        const evNorm = vec2Normalize(evDiff)
        const cos = ev.ctrlKey || ev.metaKey ? 1 : dot(evNorm, grabNorm)
        const sin = ev.ctrlKey || ev.metaKey ? 0 : cross2d(evNorm, grabNorm)

        if (axis === 'X') {
          const a = initialTransform.a ?? 1
          const e = initialTransform.e ?? 0
          const i = initialTransform.i ?? 0
          props.setTransform({
            ...initialTransform,
            a: (a * cos - e * sin) * ratio * factor,
            e: (a * sin + e * cos) * ratio * factor,
            i: i * ratio * factor,
          })
        } else if (axis === 'Y') {
          const b = initialTransform.b ?? 0
          const f = initialTransform.f ?? 1
          const j = initialTransform.j ?? 0
          props.setTransform({
            ...initialTransform,
            b: (b * cos - f * sin) * ratio * factor,
            f: (b * sin + f * cos) * ratio * factor,
            j: j * ratio * factor,
          })
        } else if (axis === 'Z') {
          const c = initialTransform.c ?? 0
          const g = initialTransform.g ?? 0
          const k = initialTransform.k ?? 1
          props.setTransform({
            ...initialTransform,
            c: (c * cos - g * sin) * ratio * factor,
            g: (c * sin + g * cos) * ratio * factor,
            k: k * ratio * factor,
          })
        }
      }

      onPointerMove(initEvent)

      return {
        onPointerMove,
        onDone() {
          changeHistory.commit()
        },
      }
    })

  return (
    <Show
      when={props.is3D}
      fallback={
        <>
          <svg viewBox={`-${aspect()} -1 ${2 * aspect()} 2`}>
            <g
              class={ui.handleBox}
              transform={`scale(1, -1) matrix(${clipTransform()})`}
            >
              <path d={corners} />
              <path
                class={ui.handleBoxGrabArea}
                d={corners}
                on:pointerdown={scaleBoth}
              />
              <path d="M 0,0 V 1" marker-end="url(#arrow)" />
              <path
                class={ui.handleBoxGrabArea}
                d="M 0,0 V 1"
                on:pointerdown={scaleY}
              />
              <path d="M 0,0 L 1,0" marker-end="url(#arrow)" />
              <path
                class={ui.handleBoxGrabArea}
                d="M 0,0 L 1,0"
                on:pointerdown={scaleX}
              />
              <path class={ui.dashed} d="M 0,0 V -1 M 0,0 L -1,0" />
              <path
                class={ui.handleBoxGrabArea}
                d="M 0,0 V -1"
                on:pointerdown={scaleNegY}
              />
              <path
                class={ui.handleBoxGrabArea}
                d="M 0,0 L -1,0"
                on:pointerdown={scaleNegX}
              />
            </g>
          </svg>
          <g
            class={ui.handle}
            on:pointerdown={startDragging}
            onContextMenu={(e) => {
              e.preventDefault()
            }}
            style={{
              '--color': handleColor(theme(), props.color),
              '--handle-visual-r': `${0.3 * handleScale()}rem`,
              '--handle-visual-hover-r': `${0.4 * handleScale()}rem`,
              '--handle-grab-r': `${0.6 * handleScale()}rem`,
            }}
          >
            <circle class={ui.handleCircle} cx={p(x())} cy={p(y())} />
            <circle class={ui.handleCircleGrabArea} cx={p(x())} cy={p(y())} />
          </g>
        </>
      }
    >
      <g>
        {/* Negative local guides (dashed lines) */}
        <line
          x1={`${projC().x}%`}
          y1={`${projC().y}%`}
          x2={`${projNegLocalX().x}%`}
          y2={`${projNegLocalX().y}%`}
          stroke="#ff4d4d"
          stroke-width="1.5"
          stroke-dasharray="3 3"
          opacity="0.5"
        />
        <line
          x1={`${projC().x}%`}
          y1={`${projC().y}%`}
          x2={`${projNegLocalY().x}%`}
          y2={`${projNegLocalY().y}%`}
          stroke="#2ecc71"
          stroke-width="1.5"
          stroke-dasharray="3 3"
          opacity="0.5"
        />
        <line
          x1={`${projC().x}%`}
          y1={`${projC().y}%`}
          x2={`${projNegLocalZ().x}%`}
          y2={`${projNegLocalZ().y}%`}
          stroke="#3498db"
          stroke-width="1.5"
          stroke-dasharray="3 3"
          opacity="0.5"
        />

        {/* Local axis lines */}
        <line
          x1={`${projC().x}%`}
          y1={`${projC().y}%`}
          x2={`${projLocalX().x}%`}
          y2={`${projLocalX().y}%`}
          stroke="#ff4d4d"
          stroke-width="1.5"
        />
        <line
          x1={`${projC().x}%`}
          y1={`${projC().y}%`}
          x2={`${projLocalY().x}%`}
          y2={`${projLocalY().y}%`}
          stroke="#2ecc71"
          stroke-width="1.5"
        />
        <line
          x1={`${projC().x}%`}
          y1={`${projC().y}%`}
          x2={`${projLocalZ().x}%`}
          y2={`${projLocalZ().y}%`}
          stroke="#3498db"
          stroke-width="1.5"
        />

        {/* Local X scale/rotate end-handles */}
        <circle
          cx={`${projLocalX().x}%`}
          cy={`${projLocalX().y}%`}
          r={`${0.2 * handleScale()}rem`}
          fill="#ff4d4d"
          stroke="white"
          stroke-width="1.5"
          style={{ cursor: 'nesw-resize' }}
          on:pointerdown={startScalingRotating3D('X', 1)}
        />
        <circle
          cx={`${projNegLocalX().x}%`}
          cy={`${projNegLocalX().y}%`}
          r={`${0.15 * handleScale()}rem`}
          fill="#ff4d4d"
          stroke="white"
          stroke-width="1"
          opacity="0.8"
          style={{ cursor: 'nesw-resize' }}
          on:pointerdown={startScalingRotating3D('X', -1)}
        />

        {/* Local Y scale/rotate end-handles */}
        <circle
          cx={`${projLocalY().x}%`}
          cy={`${projLocalY().y}%`}
          r={`${0.2 * handleScale()}rem`}
          fill="#2ecc71"
          stroke="white"
          stroke-width="1.5"
          style={{ cursor: 'nesw-resize' }}
          on:pointerdown={startScalingRotating3D('Y', 1)}
        />
        <circle
          cx={`${projNegLocalY().x}%`}
          cy={`${projNegLocalY().y}%`}
          r={`${0.15 * handleScale()}rem`}
          fill="#2ecc71"
          stroke="white"
          stroke-width="1"
          opacity="0.8"
          style={{ cursor: 'nesw-resize' }}
          on:pointerdown={startScalingRotating3D('Y', -1)}
        />

        {/* Local Z scale/rotate end-handles */}
        <circle
          cx={`${projLocalZ().x}%`}
          cy={`${projLocalZ().y}%`}
          r={`${0.2 * handleScale()}rem`}
          fill="#3498db"
          stroke="white"
          stroke-width="1.5"
          style={{ cursor: 'nesw-resize' }}
          on:pointerdown={startScalingRotating3D('Z', 1)}
        />
        <circle
          cx={`${projNegLocalZ().x}%`}
          cy={`${projNegLocalZ().y}%`}
          r={`${0.15 * handleScale()}rem`}
          fill="#3498db"
          stroke="white"
          stroke-width="1"
          opacity="0.8"
          style={{ cursor: 'nesw-resize' }}
          on:pointerdown={startScalingRotating3D('Z', -1)}
        />

        {/* Center free-translation handle */}
        <g
          class={ui.handle}
          on:pointerdown={startDragging3D}
          onContextMenu={(e) => {
            e.preventDefault()
          }}
          style={{
            '--color': handleColor(theme(), props.color),
            '--handle-visual-r': `${0.35 * handleScale()}rem`,
            '--handle-visual-hover-r': `${0.45 * handleScale()}rem`,
            '--handle-grab-r': `${0.65 * handleScale()}rem`,
          }}
        >
          <circle
            class={ui.handleCircle}
            cx={`${projC().x}%`}
            cy={`${projC().y}%`}
          />
          <circle
            class={ui.handleCircleGrabArea}
            cx={`${projC().x}%`}
            cy={`${projC().y}%`}
          />
        </g>
      </g>
    </Show>
  )
}

type Tab = 'grid' | 'list'
type AffineMode = 'preAffine' | 'postAffine' | 'final'

export function AffineEditor(props: {
  class?: string
  transforms: TransformRecord
  setTransforms: HistorySetter<TransformRecord>
  finalTransform?: AffineParams
  setFinalTransform?: (affine: AffineParams) => void
  is3D?: boolean
}) {
  const [div, setDiv] = createSignal<HTMLDivElement>()
  const [zoom, setZoom] = createZoom(0.9, [0.5, 20])
  const [position, setPosition] = createPosition(vec2f())
  const [tab, setTab] = createSignal<Tab>('grid')
  const [affineMode, setAffineMode] = createSignal<AffineMode>('preAffine')
  const [isVisible, setIsVisible] = createSignal(true)

  useIntersectionObserver(div, (visible) => setIsVisible(visible))

  const scrollTrigger = () => {
    Object.values(props.transforms).forEach((tr) => tr.preAffine)
  }

  return (
    <div
      ref={(el) => {
        setDiv(el)
        scrollIntoViewAndFocusOnChange(scrollTrigger, el)
      }}
      class={ui.editorCard}
      data-tour-target="affine-editor"
      classList={{
        [props.class ?? '']: true,
        [ui.listMode as string]: tab() === 'list',
      }}
    >
      <div class={ui.tabs} data-tour-target="affine-tabs">
        <button
          class={ui.tab}
          classList={{ [ui.tabActive as string]: tab() === 'grid' }}
          onClick={() => setTab('grid')}
          title="Grid view"
        >
          <GridIcon class={ui.tabIcon} />
        </button>
        <button
          class={ui.tab}
          classList={{ [ui.tabActive as string]: tab() === 'list' }}
          onClick={() => setTab('list')}
          title="Coefficients list"
        >
          <ListIcon class={ui.tabIcon} />
        </button>
        <span class={ui.divider} />
        <button
          class={ui.tab}
          classList={{ [ui.tabActive as string]: affineMode() === 'preAffine' }}
          onClick={() => setAffineMode('preAffine')}
          data-tour-target="affine-mode"
          title="Pre-transform (before variations)"
        >
          <ArrowRightToBox class={ui.tabIcon} />
        </button>
        <button
          class={ui.tab}
          classList={{
            [ui.tabActive as string]: affineMode() === 'postAffine',
          }}
          onClick={() => setAffineMode('postAffine')}
          data-tour-target="affine-mode"
          title="Post-transform (after variations)"
        >
          <BoxArrowRight class={ui.tabIcon} />
        </button>
        <Show when={props.finalTransform}>
          <span class={ui.divider} />
          <button
            class={ui.tab}
            classList={{ [ui.tabActive as string]: affineMode() === 'final' }}
            onClick={() => setAffineMode('final')}
            title="Final transform (applied to all points)"
          >
            <Sparkle class={ui.tabIcon} />
          </button>
        </Show>
      </div>

      <Show when={tab() === 'grid'}>
        <AutoCanvas class={ui.canvas} pixelRatio={1}>
          <WheelZoomCamera2D
            eventTarget={div()}
            zoom={[zoom, setZoom]}
            position={[position, setPosition]}
          >
            <Grid isVisible={isVisible} />
            <svg
              class={ui.svg}
              onContextMenu={(e) => {
                e.preventDefault()
              }}
            >
              <defs>
                <marker
                  id="arrow"
                  class={ui.arrowHead}
                  viewBox="0 0 10 10"
                  refX="5"
                  refY="5"
                  markerWidth="0.09"
                  markerHeight="0.09"
                  markerUnits="userSpaceOnUse"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              <Show when={affineMode() !== 'final'}>
                <For each={recordEntries(props.transforms)}>
                  {([tid, transform]) => (
                    <AffineHandle
                      transform={
                        transform[affineMode() as 'preAffine' | 'postAffine']
                      }
                      color={vec2f(transform.color.x, transform.color.y)}
                      setTransform={(affine) => {
                        props.setTransforms((draft) => {
                          draft[tid]![
                            affineMode() as 'preAffine' | 'postAffine'
                          ] = affine
                        })
                      }}
                      is3D={props.is3D}
                    />
                  )}
                </For>
              </Show>
              <Show when={affineMode() === 'final' && props.finalTransform}>
                <AffineHandle
                  transform={props.finalTransform!}
                  color={vec2f(0, 0)}
                  setTransform={(affine) => {
                    props.setFinalTransform?.(affine)
                  }}
                  is3D={props.is3D}
                />
              </Show>
            </svg>
          </WheelZoomCamera2D>
        </AutoCanvas>
      </Show>

      <Show when={tab() === 'list' && affineMode() !== 'final'}>
        <AffineListEditor
          transforms={props.transforms}
          setTransforms={props.setTransforms}
          affineMode={affineMode() as 'preAffine' | 'postAffine'}
          is3D={props.is3D}
        />
      </Show>
      <Show
        when={
          tab() === 'list' && affineMode() === 'final' && props.finalTransform
        }
      >
        <div class={listUi.container}>
          <div class={listUi.transformCard}>
            <div class={listUi.transformHeader}>
              <span class={listUi.transformLabel}>Final Transform</span>
              <DiceButton
                title="Randomize affine coefs"
                onClick={() => {
                  if (props.setFinalTransform && props.finalTransform) {
                    const next = { ...props.finalTransform }
                    const coefs = props.is3D
                      ? ([
                          'a',
                          'b',
                          'c',
                          'd',
                          'e',
                          'f',
                          'g',
                          'h',
                          'i',
                          'j',
                          'k',
                          'l',
                        ] as const)
                      : (['a', 'b', 'c', 'd', 'e', 'f'] as const)
                    for (const key of coefs) {
                      next[key] = randomizeAffineCoef(
                        next[key] ?? (['a', 'e', 'i'].includes(key) ? 1 : 0),
                        key,
                      )
                    }
                    props.setFinalTransform(next)
                  }
                }}
              />
            </div>
            <div class={listUi.coefficients}>
              <For
                each={
                  props.is3D
                    ? ([
                        'a',
                        'b',
                        'c',
                        'd',
                        'e',
                        'f',
                        'g',
                        'h',
                        'i',
                        'j',
                        'k',
                        'l',
                      ] as const)
                    : (['a', 'b', 'c', 'd', 'e', 'f'] as const)
                }
              >
                {(key) => (
                  <ScrubInput
                    label={key}
                    value={
                      props.finalTransform![key] ??
                      (['a', 'e', 'i'].includes(key) ? 1 : 0)
                    }
                    step={0.001}
                    onInput={(val) => {
                      if (props.setFinalTransform && props.finalTransform) {
                        props.setFinalTransform({
                          ...props.finalTransform,
                          [key]: val,
                        })
                      }
                    }}
                    dataParameterPath={`finalTransform.${key}`}
                  />
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
