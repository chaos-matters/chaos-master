import { createEffect, createMemo, createSignal, onCleanup, onMount, Show, } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Default3DPreviewCamera } from '@/lib/Camera3D'
import { useCanvas } from '@/lib/CanvasContext'
import { createPosition, createZoom, WheelZoomCamera2D, } from '@/lib/WheelZoomCamera2D'
import { createSpherical, WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import { devicePointBudget } from '../lib/flame'
import type { Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// ── Camera-interaction tuning (named so they're easy to find / change) ────────
const SPIN_SPEED_RAD_S = 0.3 // auto-spin rate (~20s per revolution)
const SPIN_RESUME_DELAY_MS = 500 // pause before (re)starting hover / post-drag spin
const TAP_MAX_DURATION_MS = 300 // a touch shorter (and still) than this = a tap
const TAP_MAX_MOVE_PX = 8 // ...and moving less than this
// 3D orbit radius clamp, as factors of the flame's start radius.
const ORBIT_RADIUS_MIN_FACTOR = 0.5
const ORBIT_RADIUS_MAX_FACTOR = 1.6
// 2D zoom clamp (factors of the flame's start zoom) + pan cap (world units).
const ZOOM_MIN_FACTOR = 0.4
const ZOOM_MAX_FACTOR = 3
const PAN_CAP_WORLD = 1.6

/**
 * Idle auto-spin for a 3D flame: while the cursor is over the canvas and NOT
 * dragging, slowly orbit (after a short delay) by advancing the camera theta.
 * Pauses during drag and resumes shortly after release. Rendered inside the
 * camera so it can read the canvas element from context.
 */
function AutoSpin3D(props: {
  theta: Signal<number>
  speed?: number
  delayMs?: number
  /** Spin continuously (not just while hovering) — for the gallery modal's
   *  showcase view. Still pauses during drag. */
  always?: boolean
}) {
  const { canvas } = useCanvas()
  onMount(() => {
    const speed = props.speed ?? SPIN_SPEED_RAD_S
    const delay = props.delayMs ?? SPIN_RESUME_DELAY_MS
    // globalThis.performance.now(): the app's blessed monotonic clock (the bare
    // `performance` global is eslint-restricted).
    const nowMs = () => globalThis.performance.now()
    let dragging = false
    let resumeAt = 0
    let raf = 0
    let last = 0
    let running = false
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!dragging && now >= resumeAt) {
        props.theta[1]((t) => t + speed * dt)
      }
      raf = requestAnimationFrame(tick)
    }
    // Only animate while the cursor is over the card — no idle rAF when not
    // hovering / off-screen.
    const start = () => {
      if (running) return
      running = true
      last = nowMs()
      raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }
    // Touch has no hover, so a quick still tap toggles a persistent spin
    // instead; a drag is an orbit (handled by WheelZoomCamera3D) and a pinch is
    // a zoom, so we only treat a short, motionless release as a tap.
    let touchSpin = false
    let downX = 0
    let downY = 0
    let downAt = 0
    let downTouch = false
    let downOnCanvas = false
    // Desktop: hover spins (mouse only — touch pointerenter/leave are ignored).
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      resumeAt = nowMs() + delay
      start()
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if (!props.always) stop()
    }
    // Capture phase: record BEFORE WheelZoomCamera3D's drag handler runs (it
    // stopImmediatePropagation's pointerdown/up, which would otherwise swallow
    // these listeners and break the tap-to-toggle).
    const onDown = (e: PointerEvent) => {
      dragging = true // pause spin while a tap/drag/pinch is in progress
      downX = e.clientX
      downY = e.clientY
      downAt = nowMs()
      downTouch = e.pointerType === 'touch'
      downOnCanvas = true
    }
    // pointerup OR pointercancel (touch / OS interrupt) ends the drag. Listens on
    // window in capture phase so it runs before the camera handler's document
    // pointerup (which stops propagation); the flag filters unrelated pointerups.
    const onUp = (e: PointerEvent) => {
      if (!downOnCanvas) return
      downOnCanvas = false
      dragging = false
      const tap =
        downTouch &&
        nowMs() - downAt < TAP_MAX_DURATION_MS &&
        Math.hypot(e.clientX - downX, e.clientY - downY) < TAP_MAX_MOVE_PX
      if (tap && !props.always) {
        touchSpin = !touchSpin // tap toggles the spin on touch
        if (touchSpin) {
          resumeAt = nowMs()
          start()
        } else {
          stop()
        }
        return
      }
      // a drag (orbit) ended — resume spinning if it was on (hover handles mouse).
      resumeAt = nowMs() + delay
      if (props.always || touchSpin) start()
    }
    canvas.addEventListener('pointerenter', onEnter)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('pointerdown', onDown, true)
    canvas.addEventListener('pointercancel', onUp, true)
    window.addEventListener('pointerup', onUp, true)
    if (props.always) start() // spin from mount, independent of hover
    onCleanup(() => {
      canvas.removeEventListener('pointerenter', onEnter)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerdown', onDown, true)
      canvas.removeEventListener('pointercancel', onUp, true)
      window.removeEventListener('pointerup', onUp, true)
      cancelAnimationFrame(raf)
    })
  })
  return null
}

/**
 * Stops the browser from page-pinch-zooming when two fingers land on an
 * interactive 3D canvas. `touch-action: none` covers Android, but iOS Safari
 * ignores it for pinch — so we preventDefault multi-touch moves here. The gesture
 * then drives WheelZoomCamera3D's pinch (flame zoom) instead of magnifying the
 * page. Renders nothing.
 */
function TouchPinchGuard() {
  const { canvas } = useCanvas()
  onMount(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault()
    }
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    onCleanup(() => {
      canvas.removeEventListener('touchmove', onTouchMove)
    })
  })
  return null
}

/**
 * Inner live-flame view — the app's AutoCanvas + camera + Flam3, WITHOUT a Root.
 * Shared by the hero (FlameStage wraps it in a Root) and the gallery (each gated
 * preview wraps it in a Root under a shared ComputeGate). Handles 2D and 3D
 * flames; 3D can be a static preview angle or a drag-to-orbit camera.
 */
export type FlameViewProps = {
  flame: FlameDescriptor
  quality?: number
  pointCountPerBatch?: number
  adaptiveFilterEnabled?: boolean
  pixelRatio?: number
  canvasClass?: string
  onReady?: () => void
  /** Reactive override for the 2D camera position — drives mouse parallax /
   *  idle drift on the hero. Falls back to the flame's own camera. */
  cameraPosition?: () => v2f
  /** Reactive override for the 2D camera zoom — drives scroll-to-zoom. Falls
   *  back to the flame's own zoom. */
  cameraZoom?: () => number
  /** For 3D flames: drag-to-orbit + scroll-zoom (reuses the app's
   *  WheelZoomCamera3D) instead of a fixed preview angle. */
  interactive3D?: boolean
  /** For 2D flames: drag-to-pan (capped) + scroll/pinch zoom (reuses the app's
   *  WheelZoomCamera2D). Overrides cameraPosition/cameraZoom. */
  interactive2D?: boolean
  /** Canvas alpha mode. 'premultiplied' makes the dark flame regions
   *  transparent so a layer behind (e.g. a starfield) shows through. */
  alphaMode?: GPUCanvasAlphaMode
  /** Output premultiplied alpha from the flame (dark regions become
   *  transparent). Pair with alphaMode='premultiplied'. */
  outputAlpha?: boolean
  /** For interactive3D: idle auto-orbit on hover (pauses while dragging). */
  autoSpin?: boolean
  /** For interactive3D: spin continuously from mount, not just on hover (the
   *  gallery modal's showcase view). Pauses during drag. */
  autoSpinAlways?: boolean
  /** Fixed canvas resolution (bypasses element-size autosizing). Used by the
   *  poster-capture page to render at a high fixed size. */
  fixedResolution?: { width: number; height: number }
  /** Receives Flam3's live-quality getter — lets the poster-capture page wait
   *  for full convergence before screenshotting. */
  onQualityGetter?: (get: () => number) => void
}

export default function FlameView(props: FlameViewProps) {
  const cameraPosition = () =>
    props.cameraPosition?.() ??
    vec2f(...props.flame.renderSettings.camera.position)
  const cameraZoom = () =>
    props.cameraZoom?.() ?? props.flame.renderSettings.camera.zoom

  // Hoist every conditional (`?? `) prop that feeds Flam3 / AutoCanvas into a
  // createMemo owned by this component, and pass the *called* value below. A
  // conditional written directly in a JSX prop compiles to a lazily-created
  // memo instantiated on first read — and Flam3's requestAnimationFrame loop is
  // the first reader (an ownerless context), so Solid warns the memo "will
  // never be disposed". The memos here live in FlameView's owner and are
  // disposed with it; the prop getters are then plain calls.
  // See memory: solid-conditional-prop-memo-leak.
  const qualityMemo = createMemo(() => props.quality ?? 0.6)
  const pointCountMemo = createMemo(
    () => props.pointCountPerBatch ?? devicePointBudget(),
  )
  const adaptiveFilterMemo = createMemo(
    () => props.adaptiveFilterEnabled ?? true,
  )
  const pixelRatioMemo = createMemo(() => props.pixelRatio ?? 1)

  // Orbit signals (used only by the interactive 3D path), seeded from the flame.
  const c3 = props.flame.renderSettings.camera3D
  const baseRadius = c3?.radius ?? 5
  const spherical = createSpherical(
    c3?.theta ?? 0,
    c3?.phi ?? Math.PI / 2,
    baseRadius,
    (c3?.target ?? [0, 0, 0]) as never,
    c3?.fov ?? 60,
    c3?.roll ?? 0,
  )
  // The raw camera lets you zoom out to radius 100 (the flame shrinks to a
  // speck); clamp the orbit radius to keep it framed.
  const RAD_MIN = baseRadius * ORBIT_RADIUS_MIN_FACTOR
  const RAD_MAX = baseRadius * ORBIT_RADIUS_MAX_FACTOR
  const clampedRadius: Signal<number> = [
    spherical.radius[0],
    ((v: number | ((p: number) => number)) =>
      spherical.radius[1]((prev) => {
        const next = typeof v === 'function' ? v(prev) : v
        return Math.max(RAD_MIN, Math.min(RAD_MAX, next))
      })) as Signal<number>[1],
  ]

  // Pan/zoom signals (used only by the interactive 2D path), seeded from the
  // flame's 2D camera. Zoom is clamped by createZoom; the pan is clamped to a box
  // around the start so you can't fling the flame off into empty space.
  const cam2 = props.flame.renderSettings.camera
  const base2D = vec2f(cam2.position[0], cam2.position[1])
  const zoom2D = createZoom(cam2.zoom, [
    cam2.zoom * ZOOM_MIN_FACTOR,
    cam2.zoom * ZOOM_MAX_FACTOR,
  ])
  const rawPos2D = createPosition(base2D)
  const pos2D: Signal<v2f> = [
    rawPos2D[0],
    ((v: v2f | ((p: v2f) => v2f)) =>
      rawPos2D[1]((prev) => {
        const next = typeof v === 'function' ? v(prev) : v
        return vec2f(
          Math.max(
            base2D.x - PAN_CAP_WORLD,
            Math.min(base2D.x + PAN_CAP_WORLD, next.x),
          ),
          Math.max(
            base2D.y - PAN_CAP_WORLD,
            Math.min(base2D.y + PAN_CAP_WORLD, next.y),
          ),
        )
      })) as Signal<v2f>[1],
  ]

  // Flam3 hands us a live-quality getter; poll it and fire onReady once the
  // flame is actually accumulating (used to cross-fade the hero poster out).
  const [quality, setQuality] = createSignal<(() => number) | undefined>()
  createEffect(() => {
    const get = quality()
    if (!get || !props.onReady) return
    let raf = 0
    const tick = () => {
      if (get() > 0.002) {
        props.onReady?.()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    onCleanup(() => {
      cancelAnimationFrame(raf)
    })
  })

  const flame = () => (
    <Flam3
      animationEnabled={false}
      quality={qualityMemo()}
      pointCountPerBatch={pointCountMemo()}
      adaptiveFilterEnabled={adaptiveFilterMemo()}
      flameDescriptor={props.flame}
      renderInterval={1}
      edgeFadeColor={vec4f(0)}
      outputAlpha={props.outputAlpha}
      setCurrentQuality={(get) => {
        setQuality(() => get)
        props.onQualityGetter?.(get)
      }}
    />
  )

  // `flame-orbit` sets touch-action:none so one-finger drag pans/orbits and
  // two-finger pinch zooms on touch (the WheelZoomCamera handlers) instead of the
  // page scrolling/zooming. Only for interactive canvases — leave non-interactive
  // ones (hero, gallery plates) scrollable.
  const canvasClass = () =>
    `${props.canvasClass ?? 'flame-gpu-canvas'}${
      props.interactive3D || props.interactive2D ? ' flame-orbit' : ''
    }`

  return (
    <AutoCanvas
      class={canvasClass()}
      pixelRatio={pixelRatioMemo()}
      alphaMode={props.alphaMode}
      fixedResolution={props.fixedResolution}
    >
      <Show
        when={(props.flame.renderSettings.dimensions ?? 2) === 3}
        fallback={
          <Show
            when={props.interactive2D}
            fallback={
              <Camera2D position={cameraPosition()} zoom={cameraZoom()}>
                {flame()}
              </Camera2D>
            }
          >
            <WheelZoomCamera2D zoom={zoom2D} position={pos2D}>
              <TouchPinchGuard />
              {flame()}
            </WheelZoomCamera2D>
          </Show>
        }
      >
        <Show
          when={props.interactive3D}
          fallback={
            <Default3DPreviewCamera camera3D={c3}>
              {flame()}
            </Default3DPreviewCamera>
          }
        >
          <WheelZoomCamera3D
            theta={spherical.theta}
            phi={spherical.phi}
            radius={clampedRadius}
            target={spherical.target}
            fov={spherical.fov}
            roll={spherical.roll}
          >
            <Show when={props.autoSpin || props.autoSpinAlways}>
              <AutoSpin3D
                theta={spherical.theta}
                always={props.autoSpinAlways}
              />
            </Show>
            <TouchPinchGuard />
            {flame()}
          </WheelZoomCamera3D>
        </Show>
      </Show>
    </AutoCanvas>
  )
}
