import { createEffect, onCleanup } from 'solid-js'
import { hasExactlyTwoElements } from './assertArray'

const { hypot } = Math

type PinchEvent = {
  midpoint: { clientX: number; clientY: number }
  distance: number
}

function createPinchEvent(touches: [Touch, Touch]): PinchEvent {
  const [a, b] = touches
  return {
    midpoint: {
      clientX: 0.5 * (a.clientX + b.clientX),
      clientY: 0.5 * (a.clientY + b.clientY),
    },
    distance: hypot(a.clientX - b.clientX, a.clientY - b.clientY),
  }
}

export type CreatePinchHandler = (event: PinchEvent) =>
  | {
      onPinchMove?: (event: PinchEvent) => void
      onDone?: () => void
    }
  | undefined

export function createPinchHandler(createHandlers: CreatePinchHandler) {
  const unmountController = new AbortController()
  const unmountSignal = unmountController.signal

  createEffect(() => {
    onCleanup(() => {
      unmountController.abort()
    })
  })

  let inProgress = false

  return (initEvent: TouchEvent) => {
    if (inProgress) {
      return
    }
    const cleanupController = new AbortController()
    const cleanupSignal = cleanupController.signal
    const signal = AbortSignal.any([unmountSignal, cleanupSignal])

    const touches = [...initEvent.touches]
    if (!hasExactlyTwoElements(touches)) {
      return
    }

    const handlers = createHandlers(createPinchEvent(touches))
    if (!handlers) return

    inProgress = true

    const { onPinchMove, onDone } = handlers

    function onTouchMove(event: TouchEvent) {
      const touches = [...event.touches]
      if (!hasExactlyTwoElements(touches)) {
        return
      }

      onPinchMove?.(createPinchEvent(touches))
    }

    function onTouchEnd() {
      if (cleanupSignal.aborted) {
        // already cleaned up
        return
      }
      cleanupController.abort()
      onDone?.()
      inProgress = false
    }

    document.addEventListener('touchmove', onTouchMove, { signal })
    document.addEventListener('touchend', onTouchEnd, { signal })
    signal.addEventListener('abort', () => {
      onTouchEnd()
    })
  }
}
