import { createEffect, onCleanup } from 'solid-js'
import { hasExactlyTwoElements } from './assertArray'

const { hypot } = Math

type PinchEvent = {
  midpoint: { clientX: number; clientY: number }
  distance: number
}

export type PinchPoint = { clientX: number; clientY: number }

export function pinchEventFrom(a: PinchPoint, b: PinchPoint): PinchEvent {
  return {
    midpoint: {
      clientX: 0.5 * (a.clientX + b.clientX),
      clientY: 0.5 * (a.clientY + b.clientY),
    },
    distance: hypot(a.clientX - b.clientX, a.clientY - b.clientY),
  }
}

/**
 * Two touches reported at the same coordinate give distance 0, and a consumer
 * dividing by it gets NaN or Infinity. `Math.min` and `Math.max` PROPAGATE NaN,
 * so a downstream clamp does not rescue the value -- it has to be rejected
 * here. WheelZoomCamera3D divided by this unguarded and wrote NaN or Infinity
 * into camera3D.radius. Valibot rejects NaN, so that broke the render and the
 * next reload; it accepts Infinity, which collapsed the radius and was saved.
 */
export function isUsablePinch(event: PinchEvent): boolean {
  return (
    Number.isFinite(event.distance) &&
    event.distance > 0 &&
    Number.isFinite(event.midpoint.clientX) &&
    Number.isFinite(event.midpoint.clientY)
  )
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

    const initPinch = pinchEventFrom(touches[0], touches[1])
    if (!isUsablePinch(initPinch)) {
      return
    }

    const handlers = createHandlers(initPinch)
    if (!handlers) return

    inProgress = true

    const { onPinchMove, onDone } = handlers

    function onTouchMove(event: TouchEvent) {
      const touches = [...event.touches]
      if (!hasExactlyTwoElements(touches)) {
        return
      }

      const moved = pinchEventFrom(touches[0], touches[1])
      if (!isUsablePinch(moved)) {
        return
      }

      onPinchMove?.(moved)
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

    document.addEventListener('touchmove', onTouchMove, {
      signal,
      passive: false,
    })
    document.addEventListener('touchend', onTouchEnd, { signal })
    signal.addEventListener('abort', () => {
      onTouchEnd()
    })
  }
}
