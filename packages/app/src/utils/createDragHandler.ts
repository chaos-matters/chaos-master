import { createEffect, onCleanup } from 'solid-js'

export type CreateClickAndDragHandler = (event: PointerEvent) =>
  | {
      onPointerMove?: (event: PointerEvent) => void
      onDone?: () => void
    }
  | undefined

const { abs } = Math
type Point = { clientX: number; clientY: number }

function manhattanDistance(p1: Point, p2: Point) {
  return abs(p1.clientX - p2.clientX) + abs(p1.clientY - p2.clientY)
}

type Options = {
  deadZoneRadius?: number
  preventDefault?: boolean
}

/**
 * Creates a click-and-drag handler that can be put
 * on any element.
 *
 * Example:
 * ```tsx
 * const startDrag = createClickAndDragHandler(event => {
 *   // some initialization code
 *   const startX = event.clientX
 *   ...
 *   return {
 *     onPointerMove() {
 *       // handle pointer move
 *     },
 *     onDone() {
 *       // handle end
 *     }
 *   }
 * })
 *
 * // later in JSX:
 * <div onPointerDown={startDrag}>
 * ```
 * @param handler
 */
export function createDragHandler(
  createHandlers: CreateClickAndDragHandler,
  { deadZoneRadius = 0, preventDefault = true }: Options = {},
) {
  const unmountController = new AbortController()
  const unmountSignal = unmountController.signal

  createEffect(() => {
    onCleanup(() => {
      unmountController.abort()
    })
  })

  return (initEvent: PointerEvent) => {
    const cleanupController = new AbortController()
    const cleanupSignal = cleanupController.signal
    const signal = AbortSignal.any([unmountSignal, cleanupSignal])

    // ignore non-left mouse button clicks
    if (initEvent.button !== 0) {
      return
    }
    const handlers = createHandlers(initEvent)
    if (!handlers) return

    if (preventDefault) {
      initEvent.preventDefault()
      initEvent.stopImmediatePropagation()
    }

    if (
      initEvent.target instanceof HTMLElement ||
      initEvent.target instanceof SVGElement
    ) {
      initEvent.target.setPointerCapture(initEvent.pointerId)
    }

    const { onPointerMove, onDone } = handlers
    let moved = false

    function onPointerMove_(event: PointerEvent) {
      if (preventDefault) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }

      if (moved || manhattanDistance(initEvent, event) >= deadZoneRadius) {
        onPointerMove?.(event)
        moved = true
      }
    }

    function onPointerUp_(event: PointerEvent | undefined) {
      if (cleanupSignal.aborted) {
        // already cleaned up
        return
      }
      cleanupController.abort()
      event?.preventDefault()
      event?.stopImmediatePropagation()
      onDone?.()
    }

    function preventDefaultIfMoved(event: Event) {
      if (moved && preventDefault) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }

    /**
     * Stop dragging if another touch is detected,
     * to allow for multi-touch specific gestures.
     */
    function onTouchStart(event: TouchEvent) {
      if (event.touches.length >= 2) {
        onPointerUp_(undefined)
      }
    }

    document.addEventListener('pointermove', onPointerMove_, { signal })
    document.addEventListener('pointerup', onPointerUp_, { signal })
    document.addEventListener('pointercancel', onPointerUp_, { signal })
    document.addEventListener('touchstart', onTouchStart, { signal })
    document.addEventListener('click', preventDefaultIfMoved, {
      capture: true,
      signal,
    })
    signal.addEventListener('abort', () => {
      onPointerUp_(undefined)
    })
  }
}
