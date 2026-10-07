/**
 * Pointer, wheel and keyboard navigation for the explorer canvas.
 *
 * Every gesture is turned into render-grid pixels measured from the canvas
 * centre and handed to the exact `panView` / `zoomViewAt` of the core, so a
 * drag at 1e300 moves the picture by exactly the distance the finger moved.
 */
import { panView, zoomViewAt } from '@chaos-master/core'
import type { DeepZoomView } from '@chaos-master/core'

export interface ExplorerInputTarget {
  view(): DeepZoomView
  setView(view: DeepZoomView): void
  /** Render-grid pixels per CSS pixel. */
  gridScale(): number
  /** The smaller render-grid dimension, which fixes the pixel spacing. */
  minDimension(): number
}

/** Octaves per wheel notch (100 px of deltaY). */
const WHEEL_OCTAVES_PER_NOTCH = 0.5
const KEY_ZOOM_OCTAVES = 1
const KEY_PAN_FRACTION = 0.1

export function attachExplorerInput(
  element: HTMLElement,
  target: ExplorerInputTarget,
): () => void {
  const pointers = new Map<number, { x: number; y: number }>()

  /** Offset of a client point from the element centre, in grid pixels. */
  function fromCentre(clientX: number, clientY: number) {
    const rect = element.getBoundingClientRect()
    const s = target.gridScale()
    return {
      x: (clientX - rect.left - rect.width / 2) * s,
      y: (clientY - rect.top - rect.height / 2) * s,
    }
  }

  function zoomAt(clientX: number, clientY: number, octaves: number) {
    const p = fromCentre(clientX, clientY)
    target.setView(
      zoomViewAt(target.view(), p.x, p.y, target.minDimension(), octaves),
    )
  }

  function pinchState() {
    const [a, b] = [...pointers.values()]
    if (!a || !b) return undefined
    return {
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      dist: Math.hypot(a.x - b.x, a.y - b.y),
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    // Only the primary button pans: a finger and a pen's tip report 0 too.
    // The right button, which is also a pen's barrel button, belongs to the
    // split view's point.
    if (event.button !== 0) return
    element.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  const onPointerMove = (event: PointerEvent) => {
    const last = pointers.get(event.pointerId)
    if (!last) return
    const before = pinchState()
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const s = target.gridScale()
    if (pointers.size === 1) {
      const dx = (event.clientX - last.x) * s
      const dy = (event.clientY - last.y) * s
      if (dx !== 0 || dy !== 0) {
        target.setView(panView(target.view(), dx, dy, target.minDimension()))
      }
      return
    }
    const after = pinchState()
    if (!before || !after || before.dist === 0) return
    if (after.dist === 0) {
      // Fingers on one pixel have no spread to scale by. Keep the last one
      // that had a size, so the next move zooms and pans from there.
      pointers.set(event.pointerId, last)
      return
    }
    const panned = panView(
      target.view(),
      (after.mid.x - before.mid.x) * s,
      (after.mid.y - before.mid.y) * s,
      target.minDimension(),
    )
    const p = fromCentre(after.mid.x, after.mid.y)
    target.setView(
      zoomViewAt(
        panned,
        p.x,
        p.y,
        target.minDimension(),
        Math.log2(after.dist / before.dist),
      ),
    )
  }

  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId)
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1
    const octaves = (-event.deltaY * unit * WHEEL_OCTAVES_PER_NOTCH) / 100
    // A trackpad fling can report thousands; one event never jumps > 2 octaves.
    zoomAt(event.clientX, event.clientY, Math.max(-2, Math.min(2, octaves)))
  }

  const onDoubleClick = (event: MouseEvent) => {
    zoomAt(event.clientX, event.clientY, event.shiftKey ? -1 : 1)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    // Ctrl or Cmd with + and - is the browser's own zoom: leave it alone.
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const rect = element.getBoundingClientRect()
    const step =
      Math.min(rect.width, rect.height) * KEY_PAN_FRACTION * target.gridScale()
    const md = target.minDimension()
    const view = target.view()
    const pans: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const pan = pans[event.key]
    if (pan) {
      target.setView(panView(view, pan[0], pan[1], md))
    } else if (event.key === '+' || event.key === '=') {
      target.setView(zoomViewAt(view, 0, 0, md, KEY_ZOOM_OCTAVES))
    } else if (event.key === '-' || event.key === '_') {
      target.setView(zoomViewAt(view, 0, 0, md, -KEY_ZOOM_OCTAVES))
    } else {
      return
    }
    event.preventDefault()
  }

  element.addEventListener('pointerdown', onPointerDown)
  element.addEventListener('pointermove', onPointerMove)
  element.addEventListener('pointerup', onPointerUp)
  element.addEventListener('pointercancel', onPointerUp)
  element.addEventListener('wheel', onWheel, { passive: false })
  element.addEventListener('dblclick', onDoubleClick)
  element.addEventListener('keydown', onKeyDown)
  return () => {
    element.removeEventListener('pointerdown', onPointerDown)
    element.removeEventListener('pointermove', onPointerMove)
    element.removeEventListener('pointerup', onPointerUp)
    element.removeEventListener('pointercancel', onPointerUp)
    element.removeEventListener('wheel', onWheel)
    element.removeEventListener('dblclick', onDoubleClick)
    element.removeEventListener('keydown', onKeyDown)
  }
}
