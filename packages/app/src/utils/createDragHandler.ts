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
  setActive?: (active: boolean) => void
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
  { deadZoneRadius = 0, setActive }: Options = {},
) {
  return (initEvent: PointerEvent) => {
    // ignore non-left mouse button clicks
    if (initEvent.button !== 0) {
      return
    }
    const handlers = createHandlers(initEvent)
    if (!handlers) return

    initEvent.preventDefault()
    initEvent.stopImmediatePropagation()
    if (
      initEvent.target instanceof HTMLElement ||
      initEvent.target instanceof SVGElement
    ) {
      initEvent.target.setPointerCapture(initEvent.pointerId)
    }
    setActive?.(true)

    const { onPointerMove, onDone } = handlers
    let moved = false

    function onPointerMove_(event: PointerEvent) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (moved || manhattanDistance(initEvent, event) >= deadZoneRadius) {
        onPointerMove?.(event)
        moved = true
      }
    }

    function onPointerUp_(event: PointerEvent) {
      event.preventDefault()
      event.stopImmediatePropagation()
      onDone?.()
      cleanup()
    }

    function preventDefaultIfMoved(event: Event) {
      if (moved) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }

    document.addEventListener('pointermove', onPointerMove_)
    document.addEventListener('pointerup', onPointerUp_)
    document.addEventListener('pointercancel', onPointerUp_)
    document.addEventListener('click', preventDefaultIfMoved, {
      once: true,
      capture: true,
    })

    function cleanup() {
      document.removeEventListener('pointermove', onPointerMove_)
      document.removeEventListener('pointerup', onPointerUp_)
      document.removeEventListener('pointercancel', onPointerUp_)
      document.removeEventListener('click', preventDefaultIfMoved, {
        capture: true,
      })
      setActive?.(false)
    }
  }
}
