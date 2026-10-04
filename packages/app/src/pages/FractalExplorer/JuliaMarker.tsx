/**
 * The split view's point: a handle on the Mandelbrot pane whose position is
 * the constant c of the Julia set in the other pane. Drag it (mouse, pen or
 * finger) or move it with the arrow keys, and the Julia set follows. A
 * right-button drag anywhere on the pane, with a mouse or with a pen's barrel
 * button, also sets c, while the left button keeps panning.
 *
 * Offsets are CSS pixels from the pane centre, the frame the core's
 * `pointAt` and `centerOffsetPixels` work in, so the point is exact at any
 * depth: only its small distance from the view centre is ever a double.
 * When the point is off screen the handle waits at the nearest edge, where
 * it can always be picked up again.
 *
 * Mounted inside the pane's `<AutoCanvas>`, whose canvas it measures.
 */
import { centerOffsetPixels, pointAt } from '@chaos-master/core'
import { createMemo, onCleanup } from 'solid-js'
import { useCanvas } from '@/lib/CanvasContext'
import { createDragHandler } from '@/utils/createDragHandler'
import { clamp } from '@/utils/easing'
import ui from './JuliaMarker.module.css'
import type { ComplexString, DeepZoomView } from '@chaos-master/core'

const { max, min } = Math

/** How close to the pane edge the handle's centre may come, in CSS px. */
const EDGE = 18
const KEY_STEP = 2
const KEY_STEP_FAST = 24

export interface JuliaMarkerProps {
  /** The Mandelbrot pane's view. */
  view: () => DeepZoomView
  point: () => ComplexString
  setPoint: (point: ComplexString) => void
}

/** A short form of c for labels; the link keeps every digit. */
export function shortComplex(c: ComplexString): string {
  const re = Number(c.re)
  const im = Number(c.im)
  const sign = im < 0 || Object.is(im, -0) ? '-' : '+'
  return `${re.toFixed(5)} ${sign} ${Math.abs(im).toFixed(5)}i`
}

export function JuliaMarker(props: JuliaMarkerProps) {
  const { canvas, canvasSize } = useCanvas()

  /** The pane's CSS size; reading canvasSize makes it follow a resize. */
  const size = createMemo(
    () => {
      canvasSize()
      return { width: canvas.clientWidth, height: canvas.clientHeight }
    },
    undefined,
    {
      equals: (a, b) => a.width === b.width && a.height === b.height,
    },
  )
  const minDimension = () => max(1, min(size().width, size().height))

  /** The handle's offset from the pane centre, x right and y down. */
  const placed = createMemo(() => {
    const o = centerOffsetPixels(props.view(), props.point(), minDimension())
    // `o` is the centre relative to the point, with y up.
    const x = -o.x
    const y = o.y
    const hx = max(0, size().width / 2 - EDGE)
    const hy = max(0, size().height / 2 - EDGE)
    const cx = clamp(x, -hx, hx)
    const cy = clamp(y, -hy, hy)
    return { x: cx, y: cy, outside: cx !== x || cy !== y }
  })

  /** Put the point under an offset from the pane centre, kept on screen. */
  function moveTo(x: number, y: number) {
    const hx = max(0, size().width / 2 - EDGE)
    const hy = max(0, size().height / 2 - EDGE)
    props.setPoint(
      pointAt(
        props.view(),
        clamp(x, -hx, hx),
        clamp(y, -hy, hy),
        minDimension(),
      ),
    )
  }

  function paneCentre() {
    const rect = canvas.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const startDrag = createDragHandler((event) => {
    const centre = paneCentre()
    const start = placed()
    // Where on the handle it was grabbed, so it does not jump to the finger.
    const grab = {
      x: event.clientX - centre.x - start.x,
      y: event.clientY - centre.y - start.y,
    }
    return {
      onPointerMove(move) {
        const now = paneCentre()
        moveTo(move.clientX - now.x - grab.x, move.clientY - now.y - grab.y)
      },
    }
  })

  // c goes straight to the pointer and follows it until the button is let go.
  const pickWithRightButton = createDragHandler(
    (event) => {
      const centre = paneCentre()
      moveTo(event.clientX - centre.x, event.clientY - centre.y)
      return {
        onPointerMove(move) {
          const now = paneCentre()
          moveTo(move.clientX - now.x, move.clientY - now.y)
        },
      }
    },
    { button: 2 },
  )
  const noMenu = (event: MouseEvent) => {
    event.preventDefault()
  }
  canvas.addEventListener('pointerdown', pickWithRightButton)
  canvas.addEventListener('contextmenu', noMenu)
  onCleanup(() => {
    canvas.removeEventListener('pointerdown', pickWithRightButton)
    canvas.removeEventListener('contextmenu', noMenu)
  })

  const KEYS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }

  function onKeyDown(event: KeyboardEvent) {
    const direction = KEYS[event.key]
    if (!direction) return
    event.preventDefault()
    const step = event.shiftKey ? KEY_STEP_FAST : KEY_STEP
    const { x, y } = placed()
    moveTo(x + direction[0] * step, y + direction[1] * step)
  }

  return (
    <button
      type="button"
      class={ui.marker}
      data-outside={placed().outside ? '' : undefined}
      style={{ transform: `translate(${placed().x}px, ${placed().y}px)` }}
      aria-label={`Julia point, c = ${shortComplex(props.point())}. Drag it, or use the arrow keys, to move it.`}
      onPointerDown={startDrag}
      onKeyDown={onKeyDown}
    />
  )
}
